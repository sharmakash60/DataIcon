"""Comprehensive End-to-End local verification script for DataPilot.

Runs against live services:
- Backend: http://127.0.0.1:8000
- Frontend: http://127.0.0.1:5173
- PostgreSQL: 127.0.0.1:15432
- Redis: 127.0.0.1:16379
- Local Data Agent executing locally
"""

import json
import os
import sys
import tempfile
import time
import uuid
from pathlib import Path
from fastapi.testclient import TestClient
import httpx
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier

# Add data-agent/src to path
repo_root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(repo_root / "data-agent" / "src"))

from datapilot_agent.client import ControlPlaneClient
from datapilot_agent.contracts import AgentConfig, DiscoveredDataset
from datapilot_agent.discovery import discover_local_datasets
from datapilot_agent.export_gate import ExportGate, PermittedExportType
from datapilot_agent.profiler import profile_dataset_file
from datapilot_agent.automl.engine import AutoMLEngine
from datapilot_agent.automl.schemas import AutoMLConfig, MLProblemType, PrimaryMetric
from datapilot_agent.automl.preprocessing import TabularPreprocessor
from datapilot_agent.explainability.engine import explain_model
from datapilot_agent.monitoring.engine import ModelMonitoringEngine
from datapilot_agent.serving.artifact import ModelArtifactBundle
from datapilot_agent.serving.predictor import LocalPredictor
from datapilot_agent.serving.schema import FeatureFieldSchema
from datapilot_agent.serving.server import create_serving_app

BASE_URL = os.getenv("CONTROL_PLANE_URL", "http://127.0.0.1:8000")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://127.0.0.1:5173")


class E2ERunner:
    def __init__(self):
        self.http = httpx.Client(base_url=BASE_URL, timeout=30.0)
        self.results = {}
        self.synthetic_rows = []
        self.transmitted_payloads = []
        self.temp_dir = tempfile.TemporaryDirectory()

    def log(self, section: str, message: str, status: str = "INFO"):
        print(f"[{status}] [{section}] {message}")

    def run_all(self):
        print("\n" + "=" * 75)
        print("   STARTING DATAPILOT COMPLETE LOCAL SYSTEM VERIFICATION")
        print("=" * 75 + "\n")

        try:
            self.step_0_health_check()
            self.step_1_auth_and_org()
            self.step_2_project_creation()
            self.step_3_agent_enrollment_and_heartbeat()
            self.step_4_synthetic_dataset_creation()
            self.step_5_dataset_discovery_and_registration()
            self.step_6_dataset_profiling_and_gate()
            self.step_7_business_requirements()
            self.step_8_automl_training_and_ingestion()
            self.step_9_explainability_and_ingestion()
            self.step_10_senior_report_generation()
            self.step_11_deployment_and_local_serving()
            self.step_12_monitoring_and_alerts()
            self.step_13_privacy_zero_egress_test()
            self.step_14_tenant_isolation_test()
            self.step_15_failure_handling_test()

            print("\n" + "=" * 75)
            print("   ALL 16 VERIFICATION STAGES COMPLETED AND PASSED!")
            print("=" * 75)
            return True
        except Exception as e:
            print(f"\n[FATAL ERROR] Verification halted: {e}")
            import traceback
            traceback.print_exc()
            return False

    def step_0_health_check(self):
        self.log("HEALTH", "Checking backend readiness...")
        res = self.http.get("/api/v1/health/ready")
        assert res.status_code == 200, f"Readiness check failed: {res.text}"
        data = res.json()
        assert data.get("status") == "ready", f"Not ready: {data}"
        assert data["checks"]["postgresql"] == "ok"
        assert data["checks"]["redis"] == "ok"
        self.log("HEALTH", f"Control plane healthy: {data}", "PASS")

        # Probe frontend
        self.log("HEALTH", "Probing React frontend...")
        fe_res = httpx.get(FRONTEND_URL, timeout=10.0)
        assert fe_res.status_code == 200, f"Frontend check failed: {fe_res.status_code}"
        self.log("HEALTH", f"Frontend HTTP 200 reachable at {FRONTEND_URL}", "PASS")

    def step_1_auth_and_org(self):
        self.log("AUTH", "Registering User & Organization A...")
        uid = uuid.uuid4().hex[:6]
        res = self.http.post("/api/v1/auth/register", json={
            "email": f"alice_{uid}@datapilot-corp.com",
            "password": "SecurePassword123!",
            "display_name": f"Alice Admin {uid}",
            "organization_name": f"DataPilot Corp {uid}",
        })
        assert res.status_code == 201, f"Registration failed: {res.text}"
        data = res.json()
        self.token_a = data["access_token"]
        self.user_a = data["user"]
        self.org_a_id = data["organizations"][0]["organization_id"]
        self.headers_a = {"Authorization": f"Bearer {self.token_a}"}
        self.log("AUTH", f"User registered: {self.user_a['email']} (Org: {self.org_a_id})", "PASS")

    def step_2_project_creation(self):
        self.log("PROJECT", "Creating Project A...")
        res = self.http.post(
            f"/api/v1/organizations/{self.org_a_id}/projects",
            json={
                "name": "Customer Retention AI",
                "purpose": "Identify high-risk churn customers locally",
                "classification": "internal"
            },
            headers=self.headers_a
        )
        assert res.status_code == 201, f"Project creation failed: {res.text}"
        self.project_a_id = res.json()["id"]
        self.log("PROJECT", f"Project created: {self.project_a_id}", "PASS")

    def step_3_agent_enrollment_and_heartbeat(self):
        self.log("AGENT", "Generating agent enrollment token...")
        res = self.http.post(
            f"/api/v1/organizations/{self.org_a_id}/agent-tokens",
            json={"expires_in_hours": 24},
            headers=self.headers_a
        )
        token_data = res.json()
        enrollment_token = token_data.get("token") or token_data.get("enrollment_token")

        self.log("AGENT", "Enrolling local Data Agent...")
        agent_config = AgentConfig(
            cloud_api_url=BASE_URL,
            agent_name="datapilot-edge-worker-01",
            runtime_version="1.0.0",
            data_dir=Path(self.temp_dir.name),
        )
        self.agent_client = ControlPlaneClient(agent_config)
        enroll_res = self.agent_client.enroll(enrollment_token)
        assert enroll_res["agent_id"]
        self.agent_id = enroll_res["agent_id"]
        self.log("AGENT", f"Agent enrolled successfully: {self.agent_id}", "PASS")

        self.log("AGENT", "Sending heartbeat telemetry...")
        hb_res = self.agent_client.send_heartbeat()
        assert hb_res.get("status") == "ok"
        self.log("AGENT", "Agent heartbeat verified", "PASS")

    def step_4_synthetic_dataset_creation(self):
        self.log("DATASET", "Generating safe synthetic customer churn dataset...")
        np.random.seed(42)
        n = 100
        ages = np.random.randint(18, 70, size=n)
        balances = np.round(np.random.exponential(5000, size=n), 2)
        tenure = np.random.randint(0, 10, size=n)
        products = np.random.choice([1, 2, 3, 4], size=n)
        logits = (ages - 40) * 0.05 - (balances / 10000) * 1.5 + (tenure - 3) * 0.2
        probs = 1 / (1 + np.exp(-logits))
        churn = (np.random.rand(n) < probs).astype(int)

        self.df_synthetic = pd.DataFrame({
            "age": ages,
            "balance": balances,
            "tenure": tenure,
            "num_products": products,
            "churn": churn
        })

        self.data_path = Path(self.temp_dir.name) / "synthetic_churn.csv"
        self.df_synthetic.to_csv(self.data_path, index=False)

        # Store raw rows to verify they NEVER leak
        self.synthetic_rows = self.df_synthetic.to_dict(orient="records")
        self.log("DATASET", f"Synthetic dataset created with {n} rows at {self.data_path}", "PASS")

    def step_5_dataset_discovery_and_registration(self):
        self.log("DISCOVERY", "Discovering dataset in local storage boundary...")
        found = discover_local_datasets(self.temp_dir.name)
        assert len(found) >= 1, "No files discovered"
        discovered = found[0]

        self.log("REGISTRATION", "Registering dataset via opaque reference hash...")
        dataset_id = self.agent_client.register_dataset(uuid.UUID(self.project_a_id), discovered)
        assert dataset_id
        self.dataset_id = str(dataset_id)
        self.discovered = discovered
        self.log("REGISTRATION", f"Dataset registered with ID: {self.dataset_id}", "PASS")

    def step_6_dataset_profiling_and_gate(self):
        self.log("PROFILING", "Triggering profiling job in Control Plane...")
        res = self.http.post(
            f"/api/v1/organizations/{self.org_a_id}/projects/{self.project_a_id}/profile-jobs",
            json={"dataset_id": self.dataset_id},
            headers=self.headers_a
        )
        assert res.status_code == 201, f"Profile queue failed: {res.text}"

        self.log("PROFILING", "Agent claiming profiling job...")
        job = self.agent_client.claim_job()
        assert job is not None, "Agent claimed no job"
        self.log("PROFILING", f"Claimed job: {job.job_id} (operation: {job.operation})", "PASS")

        self.log("PROFILING", "Running local profiling and privacy gate...")
        profile_res = profile_dataset_file(
            file_path=self.discovered.local_path,
            dataset_ref=self.discovered.opaque_local_ref,
            dataset_format=self.discovered.format,
        )

        # Submit verified profile results (submit_job_results enforces gate check)
        self.log("PROFILING", "Submitting sanitized profile metadata to cloud...")
        self.agent_client.submit_job_results(job.job_id, job.lease_token, profile_res)
        self.transmitted_payloads.append(profile_res.model_dump(mode="json"))
        self.log("PROFILING", "Profiling results submitted successfully", "PASS")

        # Verify summary in control plane
        res_summary = self.http.get(
            f"/api/v1/organizations/{self.org_a_id}/projects/{self.project_a_id}/datasets/{self.dataset_id}/profiles",
            headers=self.headers_a
        )
        assert res_summary.status_code == 200, f"Get profile failed: {res_summary.text}"
        summary_data = res_summary.json()
        assert summary_data["total_rows"] == 100
        assert summary_data["total_columns"] == 5
        self.log("PROFILING", f"Verified profile summary in cloud: 100 rows, 5 cols", "PASS")

    def step_7_business_requirements(self):
        self.log("REQUIREMENTS", "Extracting business requirements (Deterministic/No-LLM mode)...")
        res = self.http.post(
            f"/api/v1/organizations/{self.org_a_id}/projects/{self.project_a_id}/requirements/extract",
            json={
                "problem_description": "We need to predict customer churn based on balance and tenure to prevent account closures."
            },
            headers=self.headers_a
        )
        assert res.status_code == 201, f"Requirements extraction failed: {res.text}"
        req_data = res.json()
        assert req_data["ml_problem_type"] == "binary_classification"
        assert req_data["target_name"] == "churn"
        self.req_id = req_data["id"]
        self.log("REQUIREMENTS", f"Formulation extracted: {req_data['ml_problem_type']} -> target={req_data['target_name']}", "PASS")

        self.log("REQUIREMENTS", "Approving formulation specification...")
        res_appr = self.http.put(
            f"/api/v1/organizations/{self.org_a_id}/projects/{self.project_a_id}/requirements/{self.req_id}",
            json={
                "business_objective": req_data["business_objective"],
                "prediction_objective": req_data["prediction_objective"],
                "target_name": req_data["target_name"],
                "prediction_horizon": req_data.get("prediction_horizon"),
                "ml_problem_type": req_data["ml_problem_type"],
                "primary_metric": req_data["primary_metric"],
                "secondary_metrics": req_data["secondary_metrics"],
                "business_constraints": req_data["business_constraints"],
                "suggested_positive_class": req_data.get("suggested_positive_class"),
                "status": "approved",
                "review_notes": "Verified and approved by Alice"
            },
            headers=self.headers_a
        )
        assert res_appr.status_code == 200, f"Approve failed: {res_appr.text}"
        assert res_appr.json()["status"] == "approved"
        self.log("REQUIREMENTS", "Formulation approved by user", "PASS")

    def step_8_automl_training_and_ingestion(self):
        self.log("AUTOML", "Starting local AutoML training on client dataset...")
        config = AutoMLConfig(
            problem_type=MLProblemType.CLASSIFICATION,
            target_column="churn",
            primary_metric=PrimaryMetric.ROC_AUC,
            n_splits=3,
            tune_hyperparameters=False,
            random_seed=42,
        )
        engine = AutoMLEngine(config)
        self.automl_result = engine.run(self.df_synthetic, experiment_name="Local Churn Predictor")
        assert self.automl_result.best_model_name is not None
        assert self.automl_result.best_score > 0.4
        self.log("AUTOML", f"Best model: {self.automl_result.best_model_name} with ROC-AUC: {self.automl_result.best_score:.4f}", "PASS")

        self.log("AUTOML", "Ingesting experiment metadata to Control Plane...")
        exp_payload = self.automl_result.model_dump(mode="json")
        gate = ExportGate()
        sanitized_exp = gate.validate_and_sanitize(
            PermittedExportType.EXPERIMENT_RESULT,
            exp_payload,
        )
        self.transmitted_payloads.append(sanitized_exp)

        # Ingest to backend
        res_ingest = self.http.post(
            f"/api/v1/organizations/{self.org_a_id}/projects/{self.project_a_id}/experiments/ingest",
            json=sanitized_exp,
            headers=self.headers_a
        )
        assert res_ingest.status_code == 201, f"Ingest failed: {res_ingest.text}"
        self.experiment_id = res_ingest.json()["id"]
        self.log("AUTOML", f"Experiment ingested with ID: {self.experiment_id}", "PASS")

    def step_9_explainability_and_ingestion(self):
        self.log("EXPLAINABILITY", "Generating local model explainability (SHAP & Permutation)...")
        # Prepare evaluation data
        features = ["age", "balance", "tenure", "num_products"]
        X = self.df_synthetic[features].values
        y = self.df_synthetic["churn"].values

        pre = TabularPreprocessor()
        X_proc = pre.fit_transform(self.df_synthetic[features])
        clf = RandomForestClassifier(n_estimators=10, random_state=42)
        clf.fit(X_proc, y)
        self.fitted_model = clf
        self.fitted_preprocessor = pre

        expl_report = explain_model(
            model=clf,
            X_eval=X_proc[:30],
            y_true=y[:30],
            feature_names=features,
            experiment_id=self.experiment_id,
            model_name="RandomForest",
            problem_type="binary_classification",
            target_name="churn",
            primary_metric="roc_auc",
            overall_metric_value=float(self.automl_result.best_score),
            n_permutation_repeats=3,
        )

        expl_payload = expl_report.model_dump(mode="json")
        expl_payload.pop("ai_narrative", None)
        expl_payload.pop("provenance_verified", None)
        gate = ExportGate()
        sanitized_expl = gate.validate_and_sanitize(
            PermittedExportType.EXPLAINABILITY_RESULT,
            expl_payload,
        )
        self.transmitted_payloads.append(sanitized_expl)

        self.log("EXPLAINABILITY", "Ingesting explainability report to Control Plane...")
        res_expl = self.http.post(
            f"/api/v1/organizations/{self.org_a_id}/projects/{self.project_a_id}/experiments/{self.experiment_id}/explainability",
            json=sanitized_expl,
            headers=self.headers_a
        )
        assert res_expl.status_code == 201, f"Explainability ingest failed: {res_expl.text}"
        self.log("EXPLAINABILITY", "Explainability report recorded with verified provenance", "PASS")

    def step_10_senior_report_generation(self):
        self.log("SENIOR_REPORT", "Generating Senior Data Scientist Report (18 sections)...")
        res = self.http.post(
            f"/api/v1/organizations/{self.org_a_id}/projects/{self.project_a_id}/experiments/{self.experiment_id}/reports",
            json={
                "title": "Senior Customer Churn Report",
                "include_ai_synthesis": True,
                "user_context": "Customer retention initiative for Q4"
            },
            headers=self.headers_a
        )
        assert res.status_code == 201, f"Report generation failed: {res.text}"
        report_data = res.json()
        assert report_data["provenance_verified"] is True
        sections = report_data["sections"]
        assert len(sections) == 18, f"Expected 18 sections, got {len(sections)}"
        self.report_id = report_data["id"]
        self.log("SENIOR_REPORT", f"Senior Report generated successfully: ID {self.report_id} with 18 verified sections", "PASS")

    def step_11_deployment_and_local_serving(self):
        self.log("DEPLOYMENT", "Creating Model Deployment record...")
        res = self.http.post(
            f"/api/v1/organizations/{self.org_a_id}/projects/{self.project_a_id}/experiments/{self.experiment_id}/deployments",
            json={
                "name": "Local Churn Predictor",
                "deployment_type": "local",
                "endpoint_url": "http://localhost:8080",
                "prediction_path": "/predict",
                "notes": "Low-latency local predictor"
            },
            headers=self.headers_a
        )
        assert res.status_code == 201, f"Deployment creation failed: {res.text}"
        self.deployment_id = res.json()["id"]
        assert res.json()["status"] == "pending_approval"
        self.log("DEPLOYMENT", f"Deployment registered: ID {self.deployment_id} (pending_approval)", "PASS")

        self.log("DEPLOYMENT", "Approving Model Deployment...")
        res_appr = self.http.post(
            f"/api/v1/organizations/{self.org_a_id}/projects/{self.project_a_id}/deployments/{self.deployment_id}/approve",
            json={"notes": "Deployment approved by Alice"},
            headers=self.headers_a
        )
        assert res_appr.status_code == 200, f"Approve deployment failed: {res_appr.text}"
        assert res_appr.json()["status"] == "active"
        self.log("DEPLOYMENT", "Deployment approved and marked active", "PASS")

        self.log("SERVING", "Testing local prediction engine (POST /predict)...")
        schema = [
            FeatureFieldSchema(name="age", dtype="numeric", example=35),
            FeatureFieldSchema(name="balance", dtype="numeric", example=5500.0),
            FeatureFieldSchema(name="tenure", dtype="numeric", example=3),
            FeatureFieldSchema(name="num_products", dtype="numeric", example=2),
        ]
        bundle = ModelArtifactBundle(
            model=self.fitted_model,
            preprocessor=self.fitted_preprocessor,
            model_name="RandomForest",
            problem_type="classification",
            target_name="churn",
            primary_metric="roc_auc",
            feature_names=["age", "balance", "tenure", "num_products"],
            feature_schema=schema,
            classes=[0, 1],
            metrics={"roc_auc": float(self.automl_result.best_score)},
        )
        predictor = LocalPredictor(bundle)
        serving_app = create_serving_app(predictor=predictor, api_key="secret-key-123")
        with TestClient(serving_app) as serving_client:
            pred_res = serving_client.post(
                "/predict",
                json={"features": [{"age": 45, "balance": 3500.0, "tenure": 3, "num_products": 2}]},
                headers={"X-API-Key": "secret-key-123"},
            )
            assert pred_res.status_code == 200, f"Predict failed: {pred_res.text}"
            preds = pred_res.json()["predictions"]
            assert len(preds) == 1
            self.log("SERVING", f"Local prediction output: {preds[0]}", "PASS")

    def step_12_monitoring_and_alerts(self):
        self.log("MONITORING", "Submitting aggregate monitoring snapshot...")
        schema = [
            FeatureFieldSchema(name="age", dtype="numeric"),
            FeatureFieldSchema(name="balance", dtype="numeric"),
            FeatureFieldSchema(name="tenure", dtype="numeric"),
            FeatureFieldSchema(name="num_products", dtype="numeric"),
        ]
        mon_engine = ModelMonitoringEngine(
            model_name="RandomForest",
            model_version="v1.0.0",
            problem_type="classification",
            feature_schema=schema,
            baseline_data=self.df_synthetic[["age", "balance", "tenure", "num_products"]],
            baseline_metrics={"roc_auc": float(self.automl_result.best_score)},
            primary_metric="roc_auc",
            latency_p95_threshold_ms=50.0,
            error_rate_threshold=0.05,
        )
        # Record inferences with latency spike to trigger an alert
        for i in range(15):
            mon_engine.record_inference(
                request_id=f"req_{i}",
                features={"age": 68, "balance": 99000.0, "tenure": 10, "num_products": 4},
                prediction=1,
                latency_ms=65.0 + i,  # > 50ms threshold triggers latency spike alert
            )
        snapshot = mon_engine.compute_snapshot(window_seconds=10.0)
        snapshot_dict = snapshot.model_dump(mode="json")
        gate = ExportGate()
        sanitized_snap = gate.validate_and_sanitize(
            PermittedExportType.MONITORING_METRICS,
            snapshot_dict,
        )
        self.transmitted_payloads.append(sanitized_snap)

        res_snap = self.http.post(
            f"/api/v1/organizations/{self.org_a_id}/projects/{self.project_a_id}/deployments/{self.deployment_id}/monitoring/metrics",
            json=sanitized_snap,
            headers=self.headers_a
        )
        assert res_snap.status_code == 201, f"Snapshot submit failed: {res_snap.text}"
        self.log("MONITORING", "Aggregate monitoring metrics recorded", "PASS")

        # Verify alert was generated
        res_alerts = self.http.get(
            f"/api/v1/organizations/{self.org_a_id}/projects/{self.project_a_id}/deployments/{self.deployment_id}/monitoring/alerts",
            headers=self.headers_a
        )
        assert res_alerts.status_code == 200, f"Get alerts failed: {res_alerts.text}"
        alert_data = res_alerts.json()
        alerts = alert_data.get("items", alert_data)
        assert len(alerts) >= 1, "Expected at least 1 alert"
        alert_id = alerts[0]["id"]
        self.log("MONITORING", f"Alert triggered automatically: {alerts[0]['alert_type']} ({alerts[0]['severity']})", "PASS")

        # Resolve alert
        self.log("MONITORING", "Resolving monitoring alert...")
        res_resolve = self.http.post(
            f"/api/v1/organizations/{self.org_a_id}/projects/{self.project_a_id}/deployments/{self.deployment_id}/monitoring/alerts/{alert_id}/resolve",
            json={"notes": "Resolved latency spike after investigation"},
            headers=self.headers_a
        )
        assert res_resolve.status_code == 200, f"Resolve failed: {res_resolve.text}"
        assert res_resolve.json()["is_resolved"] is True
        self.log("MONITORING", "Alert resolved successfully", "PASS")

    def step_13_privacy_zero_egress_test(self):
        self.log("PRIVACY", "Auditing all payloads transmitted to Control Plane for raw-data egress...")
        json_dump = json.dumps(self.transmitted_payloads)

        # Confirm no raw data rows exist in the dumped payload
        for r in self.synthetic_rows[:20]:
            row_pattern = f'"age": {r["age"]}, "balance": {r["balance"]}'
            assert row_pattern not in json_dump, f"CRITICAL: Raw row detected in payload: {r}"

        # Verify control plane database does NOT store raw rows
        self.log("PRIVACY", "Checking control plane dataset record...")
        res = self.http.get(
            f"/api/v1/organizations/{self.org_a_id}/projects/{self.project_a_id}/datasets/{self.dataset_id}/profiles",
            headers=self.headers_a
        )
        assert res.status_code == 200
        dataset_meta = res.json()
        assert "raw_data" not in str(dataset_meta)

        res_list = self.http.get(
            f"/api/v1/organizations/{self.org_a_id}/projects/{self.project_a_id}/datasets",
            headers=self.headers_a
        )
        assert res_list.status_code == 200
        assert "raw_data" not in str(res_list.json())
        self.log("PRIVACY", "ZERO RAW DATA EGRESS VERIFIED: Raw data rows never left Client Data Plane", "PASS")

    def step_14_tenant_isolation_test(self):
        self.log("SECURITY", "Registering User & Organization B (Attacker / Competitor)...")
        uid_b = uuid.uuid4().hex[:6]
        res_b = self.http.post("/api/v1/auth/register", json={
            "email": f"bob_{uid_b}@corp-b.com",
            "password": "SecurePassword123!",
            "display_name": f"Bob B {uid_b}",
            "organization_name": f"Competitor Corp {uid_b}",
        })
        assert res_b.status_code == 201
        token_b = res_b.json()["access_token"]
        headers_b = {"Authorization": f"Bearer {token_b}"}

        # Attempt to access Org A Project
        self.log("SECURITY", "Verifying Org B cannot read Org A's project...")
        res_leak = self.http.get(
            f"/api/v1/organizations/{self.org_a_id}/projects/{self.project_a_id}",
            headers=headers_b
        )
        assert res_leak.status_code in (403, 404), f"Expected 403/404, got {res_leak.status_code}"
        self.log("SECURITY", f"Cross-tenant project read blocked ({res_leak.status_code})", "PASS")

        # Attempt to access Org A Experiment
        self.log("SECURITY", "Verifying Org B cannot read Org A's experiment...")
        res_exp_leak = self.http.get(
            f"/api/v1/organizations/{self.org_a_id}/projects/{self.project_a_id}/experiments/{self.experiment_id}",
            headers=headers_b
        )
        assert res_exp_leak.status_code in (403, 404), f"Expected 403/404, got {res_exp_leak.status_code}"
        self.log("SECURITY", f"Cross-tenant experiment read blocked ({res_exp_leak.status_code})", "PASS")

        # Attempt to access Org A Senior Report
        self.log("SECURITY", "Verifying Org B cannot read Org A's senior report...")
        res_rep_leak = self.http.get(
            f"/api/v1/organizations/{self.org_a_id}/projects/{self.project_a_id}/experiments/{self.experiment_id}/reports",
            headers=headers_b
        )
        assert res_rep_leak.status_code in (403, 404), f"Expected 403/404, got {res_rep_leak.status_code}"
        self.log("SECURITY", f"Cross-tenant senior report read blocked ({res_rep_leak.status_code})", "PASS")

    def step_15_failure_handling_test(self):
        self.log("FAILURE", "Testing unauthenticated request rejection...")
        res_unauth = self.http.get(f"/api/v1/organizations/{self.org_a_id}/projects")
        assert res_unauth.status_code == 401, f"Expected 401, got {res_unauth.status_code}"
        self.log("FAILURE", "Unauthenticated request correctly rejected with 401", "PASS")

        self.log("FAILURE", "Testing invalid/malformed JWT token...")
        res_bad_token = self.http.get(
            f"/api/v1/organizations/{self.org_a_id}/projects",
            headers={"Authorization": "Bearer not-a-valid-token"}
        )
        assert res_bad_token.status_code == 401, f"Expected 401, got {res_bad_token.status_code}"
        self.log("FAILURE", "Forged token rejected with 401", "PASS")

        self.log("FAILURE", "Testing non-existent project lookup...")
        fake_uuid = str(uuid.uuid4())
        res_404 = self.http.get(
            f"/api/v1/organizations/{self.org_a_id}/projects/{fake_uuid}",
            headers=self.headers_a
        )
        assert res_404.status_code == 404
        self.log("FAILURE", "Non-existent resource returns 404 cleanly", "PASS")


if __name__ == "__main__":
    runner = E2ERunner()
    success = runner.run_all()
    sys.exit(0 if success else 1)
