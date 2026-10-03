# Role-Based Access Control (RBAC) & Multi-Tenant Security Verification Report

**Date of Execution:** September 29, 2026  
**System:** DataPilot AI / DataIcon ML Platform  
**Target Environments Tested:**
- Backend API: `http://127.0.0.1:8000` (FastAPI / PostgreSQL 16 / Redis 7)
- Frontend Application: `http://localhost:5173` (React 18 / TypeScript / Vite)
**Test Runner:** Direct HTTP Live Assertion Suite (`scratch/verify_rbac_live.py`) & Pytest Backend Matrix (`tests/backend/test_rbac_matrix.py`)

---

## Executive Summary

A comprehensive, end-to-end security verification of the Role-Based Access Control (RBAC), Project-Level Access Control, Cross-Tenant Isolation, and Anti-Privilege Escalation defenses was executed against the **active, live running application**.

### Verification Highlights
- **100% Pass Rate**: All **58/58** live HTTP test assertions and **6/6** automated integration test suites passed with zero regressions.
- **Backend-Enforced Truth**: All permission checks are performed server-side via strict FastAPI dependencies (`require_permission` and `require_project_permission`). Frontend UI gates act solely as an ergonomic layer; tampering or direct API manipulation by unauthorized roles is categorically rejected with HTTP `403 Forbidden` or `401 Unauthorized`.
- **Zero Cross-Tenant Leakage**: Complete isolation verified between Organization A and Organization B across all 7 core resource types: Projects, Datasets, Experiments, Models, Reports, Deployments, and Audit Logs.
- **Strict Anti-Privilege Escalation**: All attempts at horizontal, vertical, or self-role promotion failed with HTTP `403 Forbidden`. Admin users cannot promote themselves or others to Owner, nor can they demote or remove the organization Owner.
- **Separation of Duties (SoD)**: Enforced between Model Proposers (Data Scientists) and Model Approvers (Owner / Admin) for production activations.

---

## 1. Test Users & Role Profiles

Six persistent test accounts were provisioned in the live running database for verification:

| Role | Test Email | Password | Granted Permissions | Key Granted Capabilities | Key Restricted Capabilities |
| :--- | :--- | :--- | :---: | :--- | :--- |
| **Owner** | `owner@datapilot.dev` | `Owner@1234!` | **47** | Full administrative and operational authority, organization billing, member management, project lifecycle, model approval, audit export | None |
| **Admin** | `admin@datapilot.dev` | `Admin@1234!` | **40** | Organization settings, user invitations, project creation, deployment approval, audit log viewing | Cannot create experiments (`EXPERIMENT_CREATE`), cannot promote users to Owner, cannot demote/delete Owner |
| **Data Scientist** | `datascientist@datapilot.dev` | `Science@1234!` | **20** | Project creation, dataset uploads, experiment pipeline execution, model registration, deployment proposal | Cannot view audit logs, cannot invite members, cannot approve production deployments (SoD) |
| **Analyst** | `analyst@datapilot.dev` | `Analyst@1234!` | **12** | Read-only dataset exploration, experiment metric inspection, report viewing and export | Cannot create projects, cannot trigger experiments, cannot view member directory or audit logs |
| **Viewer** | `viewer@datapilot.dev` | `Viewer@1234!` | **8** | Read-only overview of assigned projects, datasets, models, and dashboards | Cannot mutate any state, cannot trigger runs, cannot modify memberships or approve deployments |
| **Security Auditor** | `auditor@datapilot.dev` | `Auditor@1234!` | **13** | Immutable audit trail inspection (`AUDIT_LOG_VIEW`, `AUDIT_LOG_EXPORT`), member directory inspection, compliance report review | Cannot create projects, cannot trigger ML training, cannot modify memberships or alter platform data |

---

## 2. User Experience & UI Component Verification

Each test user was authenticated in the live web application. The frontend UI correctly adapts based on the authenticated session's granted permissions:

### 2.1 Sidebar Navigation Inspection

| Page / Navigation Item | Required Permission | Owner | Admin | Data Scientist | Analyst | Viewer | Security Auditor |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Dashboard** | `PROJECT_VIEW` | Visible | Visible | Visible | Visible | Visible | Visible |
| **Projects** | `PROJECT_VIEW` | Visible | Visible | Visible | Visible | Visible | Visible |
| **Datasets** | `DATASET_VIEW` | Visible | Visible | Visible | Visible | Visible | Visible |
| **Experiments** | `EXPERIMENT_VIEW` | Visible | Visible | Visible | Visible | Visible | Hidden |
| **Models** | `MODEL_VIEW` | Visible | Visible | Visible | Visible | Visible | Hidden |
| **Deployments** | `DEPLOYMENT_VIEW` | Visible | Visible | Visible | Visible | Visible | Hidden |
| **Team / Members** | `MEMBERS_VIEW` | Visible | Visible | Hidden | Hidden | Hidden | Visible |
| **Audit Logs** | `AUDIT_LOG_VIEW` | Visible | Visible | Hidden | Hidden | Hidden | Visible |
| **Settings** | `ORG_SETTINGS_VIEW` | Visible | Visible | Hidden | Hidden | Hidden | Hidden |

### 2.2 Dashboard Experience Inspection

The landing dashboard renders a specialized `RoleDashboardView` tailored to each role's workflow:
- **Owner**: Executive KPI summary (total spend, active models, team size, org health, audit shortcut).
- **Admin**: Governance console (system health, pending deployment approvals, user management overview).
- **Data Scientist**: Active experiments pipeline, training run benchmarks, dataset upload shortcuts.
- **Analyst**: Business metrics, reporting exports, model performance comparisons.
- **Viewer**: Read-only workspace summary, accessible project listings, read-only documentation.
- **Security Auditor**: Security event feed, access anomaly monitoring, compliance export controls.

### 2.3 Interactive Button & Action Availability

| Action / Button | Component | Permission Guard | Owner | Admin | Data Scientist | Analyst | Viewer | Security Auditor |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **+ New Project** | `ProjectsView` | `PROJECT_CREATE` | Enabled | Enabled | Enabled | Hidden | Hidden | Hidden |
| **+ Upload Dataset** | `DatasetsView` | `DATASET_CREATE` | Enabled | Enabled | Enabled | Hidden | Hidden | Hidden |
| **+ New Experiment**| `ExperimentsView` | `EXPERIMENT_CREATE` | Enabled | Hidden | Enabled | Hidden | Hidden | Hidden |
| **+ Deploy Model** | `DeploymentsView` | `DEPLOYMENT_CREATE` | Enabled | Enabled | Enabled | Hidden | Hidden | Hidden |
| **Approve Deployment**| `DeploymentsView` | `MODEL_APPROVE` | Enabled | Enabled | Hidden | Hidden | Hidden | Hidden |
| **Invite Member** | `TeamView` | `MEMBERS_INVITE` | Enabled | Enabled | Hidden | Hidden | Hidden | Hidden |
| **Change Role** | `TeamView` | `MEMBERS_ROLE_UPDATE`| Enabled | Enabled* | Hidden | Hidden | Hidden | Hidden |
| **Export Audit Logs**| `AuditLogsView` | `AUDIT_LOG_EXPORT` | Enabled | Enabled | Hidden | Hidden | Hidden | Enabled |

*\*Admin cannot select "Owner" role or modify the current Owner.*

---

## 3. Direct Backend API Verification: Unauthenticated & Unauthorized Calls

Direct HTTP calls were dispatched against the FastAPI backend using standard HTTP clients with bearer tokens and without authentication headers.

### 3.1 Unauthenticated Requests (HTTP 401 Enforcement)

| Test ID | Endpoint Called | HTTP Method | Expected Result | Actual Result | Pass/Fail | Notes |
| :--- | :--- | :---: | :---: | :---: | :---: | :--- |
| `AUTH-01` | `/api/v1/organizations/{org_id}/projects` | `GET` | `401 Unauthorized` | `401 Unauthorized` | **PASS** | Token missing |
| `AUTH-02` | `/api/v1/organizations/{org_id}/projects` | `POST` | `401 Unauthorized` | `401 Unauthorized` | **PASS** | Project create without auth |
| `AUTH-03` | `/api/v1/organizations/{org_id}/audit-events` | `GET` | `401 Unauthorized` | `401 Unauthorized` | **PASS** | Audit trail without auth |
| `AUTH-04` | `/api/v1/organizations/{org_id}/members` | `GET` | `401 Unauthorized` | `401 Unauthorized` | **PASS** | Member directory without auth |

### 3.2 Role Permission Enforcement Matrix (HTTP 403 Enforcement)

#### A. Project Creation (`PROJECT_CREATE`)
- **Allowed Roles:** Owner, Admin, Data Scientist
- **Forbidden Roles:** Analyst, Viewer, Security Auditor

| Caller Role | Expected HTTP Status | Actual HTTP Status | Pass/Fail | Server Response Payload Summary |
| :--- | :---: | :---: | :---: | :--- |
| Owner | `201 Created` | `201 Created` | **PASS** | Project created successfully |
| Admin | `201 Created` | `201 Created` | **PASS** | Project created successfully |
| Data Scientist | `201 Created` | `201 Created` | **PASS** | Project created successfully |
| Analyst | `403 Forbidden` | `403 Forbidden` | **PASS** | `{"detail": "Forbidden: missing permission project:create"}` |
| Viewer | `403 Forbidden` | `403 Forbidden` | **PASS** | `{"detail": "Forbidden: missing permission project:create"}` |
| Security Auditor | `403 Forbidden` | `403 Forbidden` | **PASS** | `{"detail": "Forbidden: missing permission project:create"}` |

#### B. Experiment Creation (`EXPERIMENT_CREATE`)
- **Allowed Roles:** Owner, Data Scientist
- **Forbidden Roles:** Admin, Analyst, Viewer, Security Auditor

| Caller Role | Expected HTTP Status | Actual HTTP Status | Pass/Fail | Server Response Payload Summary |
| :--- | :---: | :---: | :---: | :--- |
| Owner | `201 Created` | `201 Created` | **PASS** | Experiment created successfully |
| Data Scientist | `201 Created` | `201 Created` | **PASS** | Experiment created successfully |
| Admin | `403 Forbidden` | `403 Forbidden` | **PASS** | `{"detail": "Forbidden: missing permission experiment:create"}` |
| Analyst | `403 Forbidden` | `403 Forbidden` | **PASS** | `{"detail": "Forbidden: missing permission experiment:create"}` |
| Viewer | `403 Forbidden` | `403 Forbidden` | **PASS** | `{"detail": "Forbidden: missing permission experiment:create"}` |
| Security Auditor | `403 Forbidden` | `403 Forbidden` | **PASS** | `{"detail": "Forbidden: missing permission experiment:create"}` |

#### C. Audit Log Inspection (`AUDIT_LOG_VIEW`)
- **Allowed Roles:** Owner, Admin, Security Auditor
- **Forbidden Roles:** Data Scientist, Analyst, Viewer

| Caller Role | Expected HTTP Status | Actual HTTP Status | Pass/Fail | Server Response Payload Summary |
| :--- | :---: | :---: | :---: | :--- |
| Owner | `200 OK` | `200 OK` | **PASS** | Paginated audit log items returned |
| Admin | `200 OK` | `200 OK` | **PASS** | Paginated audit log items returned |
| Security Auditor | `200 OK` | `200 OK` | **PASS** | Paginated audit log items returned |
| Data Scientist | `403 Forbidden` | `403 Forbidden` | **PASS** | `{"detail": "Forbidden: missing permission audit_log:view"}` |
| Analyst | `403 Forbidden` | `403 Forbidden` | **PASS** | `{"detail": "Forbidden: missing permission audit_log:view"}` |
| Viewer | `403 Forbidden` | `403 Forbidden` | **PASS** | `{"detail": "Forbidden: missing permission audit_log:view"}` |

#### D. Member Directory Inspection (`MEMBERS_VIEW`)
- **Allowed Roles:** Owner, Admin, Security Auditor
- **Forbidden Roles:** Data Scientist, Analyst, Viewer

| Caller Role | Expected HTTP Status | Actual HTTP Status | Pass/Fail | Server Response Payload Summary |
| :--- | :---: | :---: | :---: | :--- |
| Owner | `200 OK` | `200 OK` | **PASS** | List of organization members returned |
| Admin | `200 OK` | `200 OK` | **PASS** | List of organization members returned |
| Security Auditor | `200 OK` | `200 OK` | **PASS** | List of organization members returned |
| Data Scientist | `403 Forbidden` | `403 Forbidden` | **PASS** | `{"detail": "Forbidden: missing permission members:view"}` |
| Analyst | `403 Forbidden` | `403 Forbidden` | **PASS** | `{"detail": "Forbidden: missing permission members:view"}` |
| Viewer | `403 Forbidden` | `403 Forbidden` | **PASS** | `{"detail": "Forbidden: missing permission members:view"}` |

#### E. Member Invitation (`MEMBERS_INVITE`)
- **Allowed Roles:** Owner, Admin
- **Forbidden Roles:** Data Scientist, Analyst, Viewer, Security Auditor

| Caller Role | Expected HTTP Status | Actual HTTP Status | Pass/Fail | Server Response Payload Summary |
| :--- | :---: | :---: | :---: | :--- |
| Owner | `201 Created` | `201 Created` | **PASS** | Member invited successfully |
| Admin | `201 Created` | `201 Created` | **PASS** | Member invited successfully |
| Data Scientist | `403 Forbidden` | `403 Forbidden` | **PASS** | `{"detail": "Forbidden: missing permission members:invite"}` |
| Analyst | `403 Forbidden` | `403 Forbidden` | **PASS** | `{"detail": "Forbidden: missing permission members:invite"}` |
| Viewer | `403 Forbidden` | `403 Forbidden` | **PASS** | `{"detail": "Forbidden: missing permission members:invite"}` |
| Security Auditor | `403 Forbidden` | `403 Forbidden` | **PASS** | `{"detail": "Forbidden: missing permission members:invite"}` |

#### F. Production Model Deployment Approval (`MODEL_APPROVE` - Separation of Duties)
- **Allowed Roles:** Owner, Admin
- **Forbidden Roles:** Data Scientist (proposer), Viewer, Analyst, Security Auditor

| Caller Role | Expected HTTP Status | Actual HTTP Status | Pass/Fail | Server Response Payload Summary |
| :--- | :---: | :---: | :---: | :--- |
| Viewer | `403 Forbidden` | `403 Forbidden` | **PASS** | `{"detail": "Forbidden: missing permission model:approve"}` |
| Data Scientist | `403 Forbidden` | `403 Forbidden` | **PASS** | `{"detail": "Forbidden: missing permission model:approve"}` (SoD enforced) |
| Admin | `200 OK` | `200 OK` | **PASS** | Deployment state changed to `active` |

---

## 4. Project-Level Permission & Isolation Verification

Project membership guarantees that users cannot read or mutate projects to which they have not been granted access:

### Test Setup:
- **Project X** and **Project Y** created under the same organization.
- **Data Scientist** user is assigned only to **Project X**.

| Test Action | Endpoint | Expected Result | Actual Result | Pass/Fail |
| :--- | :--- | :---: | :---: | :---: |
| DS lists organization projects | `GET /projects` | Sees Project X, Project Y filtered out | Project X present, Project Y absent | **PASS** |
| DS accesses assigned Project X | `GET /projects/{project_x_id}` | `200 OK` | `200 OK` | **PASS** |
| DS accesses unassigned Project Y | `GET /projects/{project_y_id}` | `403 Forbidden` | `403 Forbidden` | **PASS** |
| DS creates experiment in unassigned Project Y | `POST /projects/{project_y_id}/experiments` | `403 Forbidden` | `403 Forbidden` | **PASS** |

---

## 5. Multi-Tenant Cross-Organization Isolation Verification

Two independent organizations were created:
- **Organization A:** "Tenant Alpha" (`org_a_id`)
- **Organization B:** "Tenant Beta" (`org_b_id`)

All resources belonging to Organization B were targeted directly by users of Organization A:

| Target Resource in Organization B | Caller from Org A | Attempted Action | Expected Result | Actual Result | Pass/Fail |
| :--- | :--- | :--- | :---: | :---: | :---: |
| **Projects** | Org A Admin | `GET /organizations/{org_b}/projects/{b_proj}` | `403 Forbidden` | `403 Forbidden` | **PASS** |
| **Datasets** | Org A Data Scientist | `GET /organizations/{org_b}/projects/{b_proj}/datasets` | `403 Forbidden` | `403 Forbidden` | **PASS** |
| **Experiments** | Org A Data Scientist | `GET /organizations/{org_b}/projects/{b_proj}/experiments` | `403 Forbidden` | `403 Forbidden` | **PASS** |
| **Experiments (Create)** | Org A Data Scientist | `POST /organizations/{org_b}/projects/{b_proj}/experiments`| `403 Forbidden` | `403 Forbidden` | **PASS** |
| **Models** | Org A Data Scientist | `GET /organizations/{org_b}/projects/{b_proj}/models` | `403 Forbidden` | `403 Forbidden` | **PASS** |
| **Deployments** | Org A Admin | `GET /organizations/{org_b}/projects/{b_proj}/deployments` | `403 Forbidden` | `403 Forbidden` | **PASS** |
| **Deployments (Approve)** | Org A Admin | `POST /organizations/{org_b}/.../deployments/{id}/approve` | `403 Forbidden` | `403 Forbidden` | **PASS** |
| **Reports** | Org A Analyst | `GET /organizations/{org_b}/projects/{b_proj}/reports` | `403 Forbidden` | `403 Forbidden` | **PASS** |
| **Audit Logs** | Org A Security Auditor | `GET /organizations/{org_b}/audit-events` | `403 Forbidden` | `403 Forbidden` | **PASS** |
| **Member Directory** | Org A Admin | `POST /organizations/{org_b}/members` (Invite User) | `403 Forbidden` | `403 Forbidden` | **PASS** |

---

## 6. Privilege Escalation Defenses Verification

Strict anti-privilege escalation constraints prevent unauthorized elevation of privilege:

| Vector | Attacker Role | Target Operation | Expected Result | Actual Result | Pass/Fail | Defense Mechanism |
| :--- | :--- | :--- | :---: | :---: | :---: | :--- |
| **Self-Promotion** | Viewer | `PATCH /members/{self}` to `admin` | `403 Forbidden` | `403 Forbidden` | **PASS** | Caller cannot update their own role (`MEMBERS_ROLE_UPDATE` check + self-update prevention) |
| **Self-Promotion** | Analyst | `PATCH /members/{self}` to `owner` | `403 Forbidden` | `403 Forbidden` | **PASS** | Caller missing `MEMBERS_ROLE_UPDATE` |
| **Self-Promotion** | Data Scientist | `PATCH /members/{self}` to `admin` | `403 Forbidden` | `403 Forbidden` | **PASS** | Caller missing `MEMBERS_ROLE_UPDATE` |
| **Self-Promotion** | Admin | `PATCH /members/{self}` to `owner` | `403 Forbidden` | `403 Forbidden` | **PASS** | Admin cannot promote themselves to Owner |
| **Granting Owner** | Admin | `PATCH /members/{other}` to `owner` | `403 Forbidden` | `403 Forbidden` | **PASS** | Only active Owner can grant the Owner role |
| **Demoting Owner** | Admin | `PATCH /members/{owner}` to `viewer`| `403 Forbidden` | `403 Forbidden` | **PASS** | Non-owner cannot modify the organization Owner |
| **Removing Owner** | Admin | `DELETE /members/{owner}` | `403 Forbidden` | `403 Forbidden` | **PASS** | Non-owner cannot revoke the organization Owner's membership |

---

## 7. Automated Test Suite Results

### Live HTTP Verification Script (`scratch/verify_rbac_live.py`)
- **Total Tests Executed:** 58
- **Passed:** 58
- **Failed:** 0
- **Duration:** 12.8s

### Backend Pytest Integration Matrix (`tests/backend/test_rbac_matrix.py`)
- `test_unauthenticated_requests_return_401`: **PASSED** (all unauthenticated calls reject with 401)
- `test_rbac_six_roles_permission_matrix`: **PASSED** (permission matrix across 6 roles)
- `test_project_level_membership_isolation`: **PASSED** (project-level separation)
- `test_cross_tenant_isolation`: **PASSED** (Org A vs Org B barrier)
- `test_self_privilege_escalation_is_blocked`: **PASSED** (7 privilege escalation vectors blocked)
- `test_model_approval_permissions`: **PASSED** (separation of duties enforced)

### Regression Test Matrix
- `tests/backend/test_deployments.py`: **PASSED**
- `tests/backend/test_monitoring.py`: **PASSED**
- `tests/backend/test_data_agent.py`: **PASSED**

---

## 8. Files Changed in RBAC Implementation

### Backend Architecture
- [`backend/app/auth/permissions.py`](file:///c:/Users/kashs_p0smtrx/.codex/.chatgpt-projects/DataIcon/backend/app/auth/permissions.py): Standardized enum of 47 granular permissions across 12 domain scopes, mapped explicitly to the 6 system roles.
- [`backend/app/auth/dependencies.py`](file:///c:/Users/kashs_p0smtrx/.codex/.chatgpt-projects/DataIcon/backend/app/auth/dependencies.py): Implemented `require_permission` and `require_project_permission` FastAPI dependencies enforcing tenant resolution, membership active status, and permission sets.
- [`backend/app/api/v1/auth.py`](file:///c:/Users/kashs_p0smtrx/.codex/.chatgpt-projects/DataIcon/backend/app/api/v1/auth.py): Updated authentication and login endpoints to return authoritative role and permission sets derived server-side.
- [`backend/app/api/v1/members.py`](file:///c:/Users/kashs_p0smtrx/.codex/.chatgpt-projects/DataIcon/backend/app/api/v1/members.py): Added anti-privilege escalation checks blocking self-promotion, admin-to-owner elevation, and owner tampering.
- [`backend/app/api/v1/projects.py`](file:///c:/Users/kashs_p0smtrx/.codex/.chatgpt-projects/DataIcon/backend/app/api/v1/projects.py): Enforced `PROJECT_CREATE`, `PROJECT_VIEW`, and project-level member isolation.
- [`backend/app/api/v1/experiments.py`](file:///c:/Users/kashs_p0smtrx/.codex/.chatgpt-projects/DataIcon/backend/app/api/v1/experiments.py): Enforced `EXPERIMENT_CREATE` and `EXPERIMENT_VIEW` scoped to project membership.
- [`backend/app/api/v1/deployments.py`](file:///c:/Users/kashs_p0smtrx/.codex/.chatgpt-projects/DataIcon/backend/app/api/v1/deployments.py): Enforced `MODEL_APPROVE` with strict separation of duties.
- [`backend/app/api/v1/audit.py`](file:///c:/Users/kashs_p0smtrx/.codex/.chatgpt-projects/DataIcon/backend/app/api/v1/audit.py): Enforced `AUDIT_LOG_VIEW` and `AUDIT_LOG_EXPORT` restricting logs to Owner, Admin, and Security Auditor.
- [`tests/backend/test_rbac_matrix.py`](file:///c:/Users/kashs_p0smtrx/.codex/.chatgpt-projects/DataIcon/tests/backend/test_rbac_matrix.py): Comprehensive test suite validating security properties.

### Frontend Architecture
- [`frontend/src/context/AuthContext.tsx`](file:///c:/Users/kashs_p0smtrx/.codex/.chatgpt-projects/DataIcon/frontend/src/context/AuthContext.tsx): Context layer exposing role, permissions, and helper methods (`hasPermission`, `hasAnyPermission`).
- [`frontend/src/components/layout/DashboardShell.tsx`](file:///c:/Users/kashs_p0smtrx/.codex/.chatgpt-projects/DataIcon/frontend/src/components/layout/DashboardShell.tsx): Dynamic navigation sidebar filtering menu items by granted permissions and displaying role badge.
- [`frontend/src/components/layout/RoleDashboardView.tsx`](file:///c:/Users/kashs_p0smtrx/.codex/.chatgpt-projects/DataIcon/frontend/src/components/layout/RoleDashboardView.tsx): Role-specific dashboard views for all 6 roles.
- [`frontend/src/components/common/PermissionGate.tsx`](file:///c:/Users/kashs_p0smtrx/.codex/.chatgpt-projects/DataIcon/frontend/src/components/common/PermissionGate.tsx): Component guard preventing UI action rendering without authorization.
- [`frontend/src/components/common/ProtectedRoute.tsx`](file:///c:/Users/kashs_p0smtrx/.codex/.chatgpt-projects/DataIcon/frontend/src/components/common/ProtectedRoute.tsx): Route-level guard preventing unauthorized navigation.
- [`frontend/src/pages/TeamView.tsx`](file:///c:/Users/kashs_p0smtrx/.codex/.chatgpt-projects/DataIcon/frontend/src/pages/TeamView.tsx): Members management page reflecting permission-gated controls.

---

## 9. Vulnerabilities & Remaining Issues

- **Vulnerabilities Found:** **0 (None)**
  - No IDOR (Insecure Direct Object Reference) leaks across tenants or unassigned projects.
  - No horizontal or vertical privilege escalation vectors were exploitable.
  - No secret leakage or unauthenticated exposure of audit logs or business data.
- **Remaining Issues:** **0 (None)**
  - All test assertions passed cleanly.
  - Both frontend dev server and backend uvicorn server are operational and running error-free.
