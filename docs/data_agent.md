# DataPilot Client Data Agent

## Core Architecture & Security Boundary

The fundamental privacy and security requirement of DataPilot is:

> **RAW CLIENT DATA MUST NEVER BE UPLOADED TO THE DATAPILOT CLOUD CONTROL PLANE.**

The **Client Data Agent** runs locally and exclusively inside the customer's private perimeter (on-premise workstation, server, VPC, or container).

```
+----------------------------------------------------------------------------------------+
|                               CUSTOMER PRIVATE PERIMETER                               |
|                                                                                        |
|  +--------------------+     +------------------------+     +------------------------+  |
|  | Local Datasets     | --> | Loaders & Sniffers     | --> | In-Memory Profiler     |  |
|  | - CSV              |     | (pandas, pyarrow,      |     | - Row/col counts       |  |
|  | - Parquet          |     |  openpyxl)             |     | - Distinct & Nulls     |  |
|  | - Excel            |     | Memory bounds check    |     | - Bounded Aggregates   |  |
|  +--------------------+     +------------------------+     +-----------+------------+  |
|                                                                        |               |
|                               +------------------------+               |               |
|                               | Local PII & Quality    | <-------------+               |
|                               | - Email, Phone, SSN, CC|                               |
|                               | - Duplicates, Variance |                               |
|                               +-----------+------------+                               |
|                                           |                                            |
|                                           v                                            |
|                               +------------------------+                               |
|                               | Export Allowlist Gate  |                               |
|                               | - extra="forbid"       |                               |
|                               | - Recursive key check  |                               |
|                               | - Zero-raw-data filter |                               |
|                               +-----------+------------+                               |
+-------------------------------------------|--------------------------------------------+
                                            | HTTPS POST /agent/v1/jobs/{id}/results
                                            | (Permitted statistical metadata ONLY)
                                            v
+----------------------------------------------------------------------------------------+
|                             DATAPILOT CLOUD CONTROL PLANE                              |
|                                                                                        |
|  - Agent Gateway: /agent/v1/enroll, /heartbeat, /jobs/claim, /jobs/{id}/results        |
|  - Datasets & Profile API: /api/v1/organizations/{org_id}/projects/{id}/datasets       |
|  - PostgreSQL Database: stores ProfileSummary (metadata only, 0 client rows)           |
+----------------------------------------------------------------------------------------+
```

---

## Implemented Capabilities

1. **Agent Registration (`POST /agent/v1/enroll`)**:
   Enrolls with a one-time enrollment token issued by an organization administrator. Returns an authenticated agent token.
2. **Agent Authentication**:
   Client uses `Authorization: Bearer <agent_token>`. The control plane hashes the token with SHA-256 for secure verification.
3. **Agent Heartbeat (`POST /agent/v1/heartbeat`)**:
   Periodic liveness telemetry reporting uptime and status.
4. **Secure Job Retrieval (`POST /agent/v1/jobs/claim`)**:
   Claims queued profiling jobs leases with time-limited tokens.
5. **Local Dataset Discovery**:
   Recursively discovers files with traversal protections (resolving canonical paths within the configured root) and generates deterministic non-reversible opaque reference tokens (`ds_ref_<hash>`). Real filesystem paths are never leaked.
6. **CSV Support**:
   Delimiter sniffing (comma, tab, semicolon, pipe) and fallback encoding detection (`utf-8`, `latin1`, `cp1252`).
7. **Parquet Support**:
   High-performance columnar reading via `pyarrow`.
8. **Excel Support**:
   Multi-format spreadsheet reading via `openpyxl`.
9. **Dataset Validation**:
   Precondition validation verifying file existence, non-emptiness, maximum byte thresholds, and valid headers.
10. **Local Data Profiling Engine (Schema Version: `1.0.0`)**:
    Calculates 14 local metric dimensions in memory without disk leakage or raw value exposure:
    - **Row Count & Column Count**: Total dimensions (`total_rows`, `total_columns`).
    - **Data Types**: Inferred technical and logical types (`integer`, `float`, `string`, `boolean`, `datetime`, `category`).
    - **Missing Values**: Per-column null count and null ratio (`null_count`, `null_ratio`).
    - **Duplicate Rows**: Exact duplicate counts and ratio (`duplicate_rows_count`, `duplicate_rows_ratio`).
    - **Unique Values**: Exact count of distinct values (`unique_count`).
    - **Cardinality**: Cardinality ratio (`unique_count / total_rows`).
    - **Numerical Statistics**: Complete bounded descriptive statistics (`min`, `max`, `mean`, `std`, `median`, `q25`, `q75`, `iqr`, `skewness`, `kurtosis`).
    - **Categorical Statistics**: Bounded category frequencies, mode, and ratios with privacy redaction for PII/identifiers.
    - **Distributions**: Binned equal-width 10-bin histograms (`bin_edges`, `bin_counts`) for numeric features.
    - **Statistical Outliers**: Tukey's IQR rule boundaries (`q25 - 1.5*IQR`, `q75 + 1.5*IQR`), outlier count, and outlier ratio.
    - **Correlations**: Pairwise Pearson correlation matrix coefficients between all numeric columns.
    - **Constant Columns**: Detection of features with zero variance (`is_constant`, `constant_columns`).
    - **Suspicious Columns**: Anomaly heuristics identifying potential primary key leakage, extreme skewness, critical missingness, or class imbalance.
11. **Local Privacy-Preserving PII Detection**:
    Identifies Email, Phone, SSN, Credit Card (with Luhn checksum), and IP patterns without storing or exposing detected values.
12. **Local Data Quality Analysis**:
    Detects duplicate rows, high missingness (>20% and >50%), zero-variance/constant columns, and statistical outliers (IQR).
13. **Result Generation**:
    Assembles strictly conformant `PermittedProfilePayload` with `schema_version = "1.0.0"`.
14. **Export Gatekeeper (`export_gate.py`)**:
    Enforces strict Pydantic allowlist with `extra="forbid"`, checks keys against approved schema names, blocks prohibited keywords (`row`, `cell`, `sample`, `raw`), and verifies that no raw values or sentinels leak into export payloads.
15. **No Remote Code Execution**:
    Only predefined operations (`profile_dataset`) are accepted. Arbitrary python scripts or `eval`/`exec` requests are strictly rejected.

---

## Running the Data Agent

### Installation
```bash
cd data-agent
uv sync
```

### CLI Execution
```bash
# Profile datasets in local directory and submit to control plane
python -m datapilot_agent.cli \
  --data-dir "C:/path/to/local/data" \
  --cloud-url "http://127.0.0.1:8000" \
  --enrollment-token "<ONE_TIME_TOKEN>" \
  --agent-name "onprem-worker-01" \
  --project-id "<PROJECT_UUID>" \
  --single-run
```

### Running Test Suite
```bash
# Run all unit and security leak tests
& 'data-agent/.venv/Scripts/pytest' data-agent/tests -v
```
