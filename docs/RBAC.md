# DataPilot RBAC & Authorization Architecture Specification

## 1. Executive Summary

This document specifies the centralized, permission-based Role-Based Access Control (RBAC) architecture for DataPilot. Authorization is implemented as a strict server-side security boundary backed by database constraints, explicit permission evaluation dependencies, project-level access controls, multi-tenant isolation, and privilege escalation prevention.

---

## 2. Role Definitions

DataPilot enforces six distinct, non-overlapping roles:

| Role | Classification | Core Purpose | Separation of Duties (SoD) Constraints |
| :--- | :--- | :--- | :--- |
| **Owner** | Administrative | Full organization governance, security, and lifecycle management. | Sole identity permitted to delete the organization or assign Owner status. Cannot be removed or demoted by standard Administrators. |
| **Admin** | Administrative | Operational administration of users, projects, and deployment oversight. | Cannot modify organization Owner, alter billing/security master policies, or escalate privileges. |
| **Data Scientist** | Engineering / ML | Machine learning modeling, benchmarking, automated experiment pipelines, and model evaluation. | Cannot manage organization users, alter roles, approve their own production deployments (SoD), or access projects to which they are not explicitly assigned. |
| **Analyst** | Analytics / BI | Analytical interpretation of datasets, model comparison metrics, and business reporting. | Read-only dataset querying, cannot run training jobs, modify model architectures, approve production models, or access non-assigned projects. |
| **Viewer** | Read-Only | Read-only observability of approved benchmark summaries, models, and operational dashboards. | Strict read-only enforcement. Zero mutation privileges (no creates, updates, deletes, training triggers, or deployments). |
| **Security Auditor** | Governance / SecOps | Inspection of compliance streams, immutable audit trails, data classification labels, and agent isolation boundaries. | Read-only governance inspection. Cannot alter ML pipelines, datasets, or system configurations. |

---

## 3. Canonical Permission Definitions

All authorizations in DataPilot are resolved against explicit, atomic permission constants rather than ad-hoc role comparisons (`if role == 'admin'`).

### Organization & Membership Permissions
- `ORGANIZATION_VIEW`: View organization profile and basic metadata.
- `ORGANIZATION_UPDATE`: Update organization display settings and configuration.
- `ORGANIZATION_DELETE`: Decommission/destroy the organization entity (Owner exclusive).
- `MEMBERS_VIEW`: List organization members, invitations, and active assignments.
- `MEMBERS_INVITE`: Invite registered identities to join the organization.
- `MEMBERS_UPDATE`: Change member roles and administrative assignments.
- `MEMBERS_REMOVE`: Expel members from the organization.
- `ROLES_VIEW`: Inspect the role taxonomy and assigned permissions.
- `ROLES_MANAGE`: Configure custom permissions or role allocations.

### Project Permissions
- `PROJECT_VIEW`: Access project workspace and metadata.
- `PROJECT_CREATE`: Initialize new initiatives/projects.
- `PROJECT_UPDATE`: Update project objectives, classification tags, and assign project members.
- `PROJECT_DELETE`: Permanently delete a project initiative.

### Dataset Permissions
- `DATASET_VIEW`: Read dataset definitions, schema metadata, and statistical profiles.
- `DATASET_CONNECT`: Connect external data sources into the local Client Data Plane.
- `DATASET_PROFILE`: Trigger exploratory data analysis and summary statistics.
- `DATASET_DELETE`: Remove dataset references.
- `DATASET_EXPORT`: Export anonymized/permitted analytics extracts.

### Experiment & Modeling Permissions
- `EXPERIMENT_VIEW`: View AutoML benchmarks, leaderboards, trials, and SHAP explainability.
- `EXPERIMENT_CREATE`: Declare and configure new benchmark experiments.
- `EXPERIMENT_RUN`: Execute ML training algorithms inside the Client Data Plane.
- `EXPERIMENT_CANCEL`: Abort active training runs.
- `EXPERIMENT_DELETE`: Purge historical experiment artifacts.
- `MODEL_VIEW`: Inspect model checkpoints, hyperparameters, and evaluation metrics.
- `MODEL_CREATE`: Register trained models into the model registry.
- `MODEL_APPROVE`: Formally approve candidate models for production activation.
- `MODEL_DEPLOY`: Spin up serving endpoints and containerized runtimes.
- `MODEL_DELETE`: Decommission/deregister trained models.

### Reporting & Monitoring Permissions
- `REPORT_VIEW`: Read executive summaries and 18-section Senior DS technical reports.
- `REPORT_CREATE`: Generate comprehensive markdown/HTML analytical reports.
- `REPORT_EXPORT`: Export report deliverables.
- `REPORT_DELETE`: Purge generated reports.
- `DEPLOYMENT_VIEW`: View deployment health, status, and prediction logs.
- `DEPLOYMENT_CREATE`: Declare and initialize serving services.
- `DEPLOYMENT_UPDATE`: Rollback or update serving configurations.
- `DEPLOYMENT_DELETE`: Decommission/stop serving instances.
- `MONITORING_VIEW`: Access live drift metrics, confusion matrices, and latency charts.
- `MONITORING_CONFIGURE`: Configure alerting thresholds and drift detectors.

### Governance, Security & Audit
- `GOVERNANCE_VIEW`: View compliance frameworks, data residency, and audit posture.
- `GOVERNANCE_MANAGE`: Modify corporate governance policies and data classification tiers.
- `AUDIT_LOG_VIEW`: Read the append-only security and access audit trail.
- `SECURITY_SETTINGS_MANAGE`: Configure SSO, session limits, and security headers.
- `BILLING_VIEW`: Inspect resource consumption and subscription tier.
- `BILLING_MANAGE`: Modify payment methods and subscription levels.
- `AGENT_VIEW`: Inspect registered Client Data Agents.
- `AGENT_REGISTER`: Pair new Client Data Agents via HMAC exchange.
- `AGENT_MANAGE`: Update agent capabilities and heartbeat intervals.

---

## 4. Role-Permission Matrix

| Permission Key | Owner | Admin | Data Scientist | Analyst | Viewer | Security Auditor |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| `ORGANIZATION_VIEW` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `ORGANIZATION_UPDATE` | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| `ORGANIZATION_DELETE` | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| `MEMBERS_VIEW` | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ |
| `MEMBERS_INVITE` | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| `MEMBERS_UPDATE` | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| `MEMBERS_REMOVE` | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| `ROLES_VIEW` | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ |
| `ROLES_MANAGE` | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| `PROJECT_VIEW` | ✓ | ✓ | ✓ (assigned) | ✓ (assigned) | ✓ (assigned) | ✓ |
| `PROJECT_CREATE` | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| `PROJECT_UPDATE` | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| `PROJECT_DELETE` | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| `DATASET_VIEW` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `DATASET_CONNECT` | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| `DATASET_PROFILE` | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| `DATASET_DELETE` | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| `DATASET_EXPORT` | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| `EXPERIMENT_VIEW` | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| `EXPERIMENT_CREATE` | ✓ | ✗ | ✓ | ✗ | ✗ | ✗ |
| `EXPERIMENT_RUN` | ✓ | ✗ | ✓ | ✗ | ✗ | ✗ |
| `EXPERIMENT_CANCEL` | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| `EXPERIMENT_DELETE` | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| `MODEL_VIEW` | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| `MODEL_CREATE` | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| `MODEL_APPROVE` | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| `MODEL_DEPLOY` | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| `MODEL_DELETE` | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| `REPORT_VIEW` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `REPORT_CREATE` | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ |
| `REPORT_EXPORT` | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ |
| `REPORT_DELETE` | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| `DEPLOYMENT_VIEW` | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ |
| `DEPLOYMENT_CREATE` | ✓ | ✓ | ✓ (propose) | ✗ | ✗ | ✗ |
| `DEPLOYMENT_UPDATE` | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| `DEPLOYMENT_DELETE` | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| `MONITORING_VIEW` | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ |
| `MONITORING_CONFIGURE` | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| `GOVERNANCE_VIEW` | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ |
| `GOVERNANCE_MANAGE` | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| `AUDIT_LOG_VIEW` | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ |
| `SECURITY_SETTINGS_MANAGE` | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| `BILLING_VIEW` | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| `BILLING_MANAGE` | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| `AGENT_VIEW` | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ |
| `AGENT_REGISTER` | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| `AGENT_MANAGE` | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |

---

## 5. Project-Level Access Control Model

Organization-level membership alone is insufficient for non-administrative roles. DataPilot enforces granular, project-level access boundaries:

```
Organization (Acme Corp)
 ├── Project Alpha (Internal)
 │    ├── Owner / Admin: Universal Access
 │    ├── Kash (Data Scientist): Assigned Member -> FULL ACCESS
 │    ├── John (Analyst): Assigned Member -> READ/ANALYTICS ACCESS
 │    └── Sarah (Viewer): Assigned Member -> READ-ONLY ACCESS
 └── Project Beta (Confidential)
      ├── Owner / Admin: Universal Access
      ├── Kash: NOT ASSIGNED -> HTTP 403 Forbidden
      ├── John: Assigned Member -> FULL ACCESS
      └── Sarah: NOT ASSIGNED -> HTTP 403 Forbidden
```

### Access Resolution Rules
1. **Universal Tenant Administrators**: Users with `owner` or `admin` organization roles are granted access to all projects within their organization.
2. **Project Creator**: The user who created the project (`owner_user_id`) is automatically granted access.
3. **Explicit Project Membership**: For `data_scientist`, `analyst`, `viewer`, and `security_auditor` roles, access is verified against the `project_memberships` table.
4. **Denial and Audit**: Attempting to read or mutate an unassigned project returns `HTTP 403 Forbidden` and logs an `auth.project_access_denied` audit event.
5. **Project List Filtering**: `GET /api/v1/organizations/{org_id}/projects` dynamically filters initiatives: non-admin users only receive projects to which they are assigned.

---

## 6. Backend Authorization Architecture

The FastAPI backend serves as the authoritative security boundary:

1. **Identity Authentication**: `get_current_user` extracts and cryptographically verifies the RS256/HS256 signed Bearer JWT token.
2. **Tenant Resolution**: `get_tenant_context` checks the active `memberships` table for `(organization_id, user_id, status='active')`. Missing or inactive memberships trigger `HTTP 403 Forbidden`.
3. **Permission Evaluation**: `require_permission(Permissions.XYZ)` checks the tenant context permissions. Unauthorized attempts trigger `HTTP 403 Forbidden` and append an audit event.
4. **Project Access & Action Enforcement**: `require_project_permission(Permissions.XYZ)` validates:
   - Tenant matching: Project belongs to the authenticated organization (`HTTP 404` if not found in tenant).
   - Project membership: User has assigned project access.
   - Action permission: Role possesses the required permission.

---

## 7. Frontend Authorization Architecture

1. **Authentication Context (`AuthContext.tsx`)**:
   - Stores user identity, organizations, active organization, and granted permissions list (`permissions: string[]`).
   - Exposes reactive utility methods:
     - `hasPermission(permission: string): boolean`
     - `hasAnyPermission(permissions: string[]): boolean`
     - `hasAllPermissions(permissions: string[]): boolean`
2. **Dynamic Navigation (`DashboardShell.tsx`)**:
   - Sidebar items are rendered strictly based on granted permissions:
     - **Dashboard**: All roles (displays role-tailored view).
     - **Projects**: Requires `PROJECT_VIEW`.
     - **Team & RBAC**: Requires `MEMBERS_VIEW`.
     - **Audit Trail**: Requires `AUDIT_LOG_VIEW`.
     - **System Health**: Diagnostic health checks.
3. **Role-Specific Dashboards (`RoleDashboardView.tsx`)**:
   - **Owner / Admin**: System status, total RBAC identities, active initiatives, quick admin actions.
   - **Data Scientist**: Assigned ML initiatives, experiment status, explainability benchmarks.
   - **Analyst**: Accessible analytics initiatives, report summaries, data insights.
   - **Viewer**: Read-only approved project summaries, observability metrics.
   - **Security Auditor**: Live audit stream, data plane isolation verification, tenant boundary status.
4. **Button & Action Gates**:
   - `ProjectsView.tsx`: `+ New Project` gated by `PROJECT_CREATE`, Delete gated by `PROJECT_DELETE`.
   - `TeamView.tsx`: `+ Invite Member` gated by `MEMBERS_INVITE`, Role change gated by `MEMBERS_UPDATE`, Project assignment gated by `PROJECT_UPDATE`, Member deletion gated by `MEMBERS_REMOVE`.
   - `DeploymentView.tsx`: `New Deployment` gated by `DEPLOYMENT_CREATE`, `Approve` gated by `MODEL_APPROVE`, `Rollback/Stop` gated by `DEPLOYMENT_UPDATE`.
   - `ExperimentsView.tsx`: `Senior DS Report` gated by `REPORT_VIEW`, `Deploy & Serve` gated by `DEPLOYMENT_VIEW`.

---

## 8. Cross-Tenant Isolation

1. **Database-Level Isolation**: Every persistent table (`projects`, `experiments`, `deployments`, `audit_events`, `memberships`, `project_memberships`) contains an indexed `organization_id` foreign key.
2. **Foreign Key Enforcement**: All queries filter by `organization_id == tenant.organization_id`.
3. **No Blind Trust**: Tenant IDs sent from clients are never trusted. All operations derive tenancy from the authenticated database membership.

---

## 9. Anti-Privilege Escalation Controls

1. **Self-Promotion Defense**: Users cannot update their own membership role (`HTTP 403 Forbidden`).
2. **Owner Inviolability**: Non-owner identities cannot demote, modify, or remove an organization Owner (`HTTP 403 Forbidden`).
3. **Owner Creation Gating**: Only existing Owners can grant the `owner` role to another identity (`HTTP 403 Forbidden` for Administrators).
4. **Separation of Duties (SoD)**: Data Scientists cannot approve their own candidate models for production deployment; approval requires `MODEL_APPROVE` (held by Owner and Administrator).
