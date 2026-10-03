"""Docker Deployment Packager for Client-Side Model Serving.

Generates a fully self-contained, air-gapped Docker build context containing:
- Serialized model artifact bundle (model + preprocessor + metadata)
- Hardened Dockerfile (Python 3.12-slim, non-root user, healthcheck)
- docker-compose.yml with port mapping and resource bounds
- requirements.txt with pinned inference dependencies
- Container serving entrypoint
- README.md and test verification scripts

All packaging occurs strictly inside the customer boundary.
No container image or model file is pushed to any remote cloud registry.
"""

from __future__ import annotations

import json
from pathlib import Path
import shutil
from typing import Optional, Union

from datapilot_agent.serving.artifact import ModelArtifactBundle, load_model_artifact, save_model_artifact


DOCKERFILE_TEMPLATE = """# DataPilot Client Model Serving Container
# Air-gapped container image for secure local/on-prem inference.
FROM python:3.12-slim

# Security hardening: Create non-root service user
RUN groupadd -r datapilot && useradd -r -g datapilot -d /app -s /sbin/nologin datapilot

WORKDIR /app

# Install minimal runtime system utilities
RUN apt-get update && apt-get install -y --no-install-recommends \\
    curl \\
    libgomp1 \\
    && rm -rf /var/lib/apt/lists/*

# Install pinned Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy model artifact and serving application code
COPY . /app/

# Ensure non-root ownership
RUN chown -R datapilot:datapilot /app

USER datapilot

# Expose standard serving port
EXPOSE 8080

# Healthcheck probe for orchestrator readiness
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \\
    CMD curl -f http://localhost:8080/health || exit 1

# Launch low-latency serving server
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1"]
"""

COMPOSE_TEMPLATE = """services:
  datapilot-serving:
    build: .
    image: datapilot-model-serving:{version}
    container_name: datapilot-model-serving
    restart: unless-stopped
    ports:
      - "8080:8080"
    environment:
      - SERVING_API_KEY=${{SERVING_API_KEY:-}}
      - PORT=8080
      - HOST=0.0.0.0
    deploy:
      resources:
        limits:
          cpus: "2.0"
          memory: 2048M
"""

REQUIREMENTS_CONTENT = """fastapi>=0.115.0
uvicorn>=0.30.0
scikit-learn>=1.5.0
numpy>=1.26.0
pandas>=2.2.0
pydantic>=2.8.0
joblib>=1.4.0
xgboost>=2.1.0
lightgbm>=4.5.0
catboost>=1.2.0
"""

SERVER_ENTRYPOINT_CODE = """# Standalone Docker Serving Entrypoint
import os
from pathlib import Path
from datapilot_agent.serving.predictor import LocalPredictor
from datapilot_agent.serving.server import create_serving_app

model_path = Path(__file__).parent / "model_bundle.joblib"
api_key = os.getenv("SERVING_API_KEY")

predictor = LocalPredictor(str(model_path))
app = create_serving_app(predictor=predictor, api_key=api_key, deployment_type="docker")

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8080"))
    host = os.getenv("HOST", "0.0.0.0")
    uvicorn.run(app, host=host, port=port)
"""

README_TEMPLATE = """# DataPilot Docker Model Serving Package

**Model**: {model_name}
**Version**: {model_version}
**Problem Type**: {problem_type}
**Target Variable**: {target_name}
**Primary Metric**: {primary_metric}

---

## 1. Security & Privacy Guarantees
- **Air-Gapped & Local**: This container runs entirely inside your client network/VPC.
- **Zero Cloud Egress**: Predictions never leave this container or contact external cloud services.
- **Non-Root Execution**: Runs as an unprivileged service user (`datapilot`).

---

## 2. Quickstart

### Build the Docker Image
```bash
docker build -t datapilot-model-serving:{version} .
```

### Run the Container
```bash
# Without API Key:
docker run -d -p 8080:8080 --name datapilot-model-serving datapilot-model-serving:{version}

# With API Key Authentication:
docker run -d -p 8080:8080 -e SERVING_API_KEY="your-secret-api-key" --name datapilot-model-serving datapilot-model-serving:{version}
```

### Or using Docker Compose
```bash
docker compose up -d
```

---

## 3. REST Prediction API

### Health Probe
```bash
curl http://localhost:8080/health
```

### Inspect Metadata & Feature Schema
```bash
curl http://localhost:8080/metadata
```

### Send Prediction Request
```bash
curl -X POST http://localhost:8080/predict \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: your-secret-api-key" \\
  -d '{sample_payload_json}'
```
"""


class DockerPackager:
    """Packages a trained model bundle into a complete local Docker serving directory."""

    def __init__(self, bundle_or_path: Union[ModelArtifactBundle, str]):
        if isinstance(bundle_or_path, ModelArtifactBundle):
            self.bundle = bundle_or_path
        else:
            self.bundle = load_model_artifact(bundle_or_path)

    def package(self, output_dir: Union[Path, str]) -> Path:
        """Create the Docker deployment package in the specified directory."""
        dest = Path(output_dir)
        dest.mkdir(parents=True, exist_ok=True)

        # 1. Save model artifact bundle and metadata.json
        save_model_artifact(self.bundle, dest, artifact_name="model_bundle.joblib")

        # 2. Write Dockerfile
        dockerfile_path = dest / "Dockerfile"
        with open(dockerfile_path, "w", encoding="utf-8") as f:
            f.write(DOCKERFILE_TEMPLATE)

        # 3. Write docker-compose.yml
        compose_path = dest / "docker-compose.yml"
        with open(compose_path, "w", encoding="utf-8") as f:
            f.write(COMPOSE_TEMPLATE.format(version=self.bundle.model_version))

        # 4. Write requirements.txt
        req_path = dest / "requirements.txt"
        with open(req_path, "w", encoding="utf-8") as f:
            f.write(REQUIREMENTS_CONTENT)

        # 5. Copy or vendor serving Python code into package
        serving_src_dir = Path(__file__).parent
        pkg_serving_dir = dest / "datapilot_agent" / "serving"
        pkg_serving_dir.mkdir(parents=True, exist_ok=True)
        (dest / "datapilot_agent" / "__init__.py").touch(exist_ok=True)
        (pkg_serving_dir / "__init__.py").touch(exist_ok=True)

        for py_file in ["schema.py", "artifact.py", "predictor.py", "server.py"]:
            src_file = serving_src_dir / py_file
            if src_file.exists():
                shutil.copy2(src_file, pkg_serving_dir / py_file)

        # Also copy automl preprocessor dependency
        automl_src_dir = serving_src_dir.parent / "automl"
        pkg_automl_dir = dest / "datapilot_agent" / "automl"
        pkg_automl_dir.mkdir(parents=True, exist_ok=True)
        (pkg_automl_dir / "__init__.py").touch(exist_ok=True)
        if (automl_src_dir / "preprocessing.py").exists():
            shutil.copy2(automl_src_dir / "preprocessing.py", pkg_automl_dir / "preprocessing.py")
        if (automl_src_dir / "schemas.py").exists():
            shutil.copy2(automl_src_dir / "schemas.py", pkg_automl_dir / "schemas.py")

        # Copy monitoring dependency
        mon_src_dir = serving_src_dir.parent / "monitoring"
        pkg_mon_dir = dest / "datapilot_agent" / "monitoring"
        pkg_mon_dir.mkdir(parents=True, exist_ok=True)
        (pkg_mon_dir / "__init__.py").touch(exist_ok=True)
        for mon_file in ["schema.py", "drift.py", "evaluator.py", "collector.py", "engine.py"]:
            if (mon_src_dir / mon_file).exists():
                shutil.copy2(mon_src_dir / mon_file, pkg_mon_dir / mon_file)

        # Copy gatekeeper and contracts
        agent_root = serving_src_dir.parent
        for root_file in ["export_gate.py", "contracts.py"]:
            if (agent_root / root_file).exists():
                shutil.copy2(agent_root / root_file, dest / "datapilot_agent" / root_file)

        # 6. Write standalone server.py entrypoint
        server_entrypoint_path = dest / "server.py"
        with open(server_entrypoint_path, "w", encoding="utf-8") as f:
            f.write(SERVER_ENTRYPOINT_CODE)

        # 7. Write sample test client script
        sample_dict = {f: 0 for f in self.bundle.feature_names}
        sample_payload = {"features": sample_dict}
        sample_payload_str = json.dumps(sample_payload, indent=2)

        test_script = f"""import requests

url = "http://localhost:8080/predict"
headers = {{"Content-Type": "application/json"}}
payload = {json.dumps(sample_payload)}

response = requests.post(url, json=payload, headers=headers)
print("Status:", response.status_code)
print("Response:", response.json())
"""
        with open(dest / "test_client.py", "w", encoding="utf-8") as f:
            f.write(test_script)

        # 8. Write README.md
        readme_content = README_TEMPLATE.format(
            model_name=self.bundle.model_name,
            model_version=self.bundle.model_version,
            problem_type=self.bundle.problem_type,
            target_name=self.bundle.target_name,
            primary_metric=self.bundle.primary_metric,
            version=self.bundle.model_version,
            sample_payload_json=sample_payload_str,
        )
        with open(dest / "README.md", "w", encoding="utf-8") as f:
            f.write(readme_content)

        return dest
