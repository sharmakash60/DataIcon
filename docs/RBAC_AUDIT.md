# DataPilot RBAC & Authorization Architecture Audit

**Date:** 2026-09-29  
**Platform:** DataPilot Control Plane  
**Document ID:** `docs/RBAC_AUDIT.md`  
**Classification:** Engineering Security Review  

---

## Executive Summary

An in-depth security and architectural audit of the DataPilot authorization model revealed critical gaps that permit privilege escalation, lack of role differentiation, absence of project-level isolation, and missing action-level authorization checks. 

The application currently has six roles defined in name (`owner`, `admin`, `data_scientist`, `analyst`, `viewer`, `security_auditor`), but in practice every authenticated user is presented with almost identical capabilities and views. Where restrictions exist, they rely primarily on client-side conditional checks, and the backend relies on overly coarse permission strings (`"project:read"`, `"project:update"`, `"project:create"`, `"member:manage"`).

This audit documents the root causes, enumerates every endpoint and gap, and outlines the target permission-based RBAC architecture.

---

## 1. Current Role Implementation

### Roles Defined
In `backend/app/enums.py`:
- `Role.OWNER` (`"owner"`)
- `Role.ADMIN` (`"admin"`)
- `Role.DATA_SCIENTIST` (`"data_scientist"`)
- `Role.ANALYST` (`"analyst"`)
- `Role.VIEWER` (`"viewer"`)
- `Role.SECURITY_AUDITOR` (`"security_auditor"`)

Roles are stored at the organization membership level in table `memberships` (`organization_id`, `user_id`, `role`, `status`).

---

## 2. Current Permission Implementation

In `backend/app/auth/dependencies.py`:
```python
ROLE_PERMISSIONS: dict[str, set[str]] = {
    Role.OWNER.value: {
        "org:manage", "member:read", "member:manage",
        "project:create", "project:read", "project:update",
        "project:write", "project:delete", "audit:read",
    },
    Role.ADMIN.value: {
        "member:read", "member:manage", "project:create",
        "project:read", "project:update", "project:write",
        "project:delete", "audit:read",
    },
    Role.DATA_SCIENTIST.value: {
        "member:read", "project:create", "project:read",
        "project:update", "project:write",
    },
    Role.ANALYST.value: {
        "member:read", "project:read",
    },
    Role.VIEWER.value: {
        "member:read", "project:read",
    },
    Role.SECURITY_AUDITOR.value: {
        "member:read", "project:read", "audit:read",
    },
}
```

### Critical Deficiencies in Current Permissions:
1. **Coarse Permission Strings:** Only 9 ad-hoc strings exist (`org:manage`, `member:read`, `member:manage`, `project:create`, `project:read`, `project:update`, `project:write`, `project:delete`, `audit:read`).
2. **Missing Granular Permissions:** No permissions exist for:
   - Datasets: `DATASET_VIEW`, `DATASET_CONNECT`, `DATASET_PROFILE`, `DATASET_DELETE`, `DATASET_EXPORT`
   - Experiments: `EXPERIMENT_VIEW`, `EXPERIMENT_CREATE`, `EXPERIMENT_RUN`, `EXPERIMENT_CANCEL`, `EXPERIMENT_DELETE`
   - Models: `MODEL_VIEW`, `MODEL_CREATE`, `MODEL_APPROVE`, `MODEL_DEPLOY`, `MODEL_DELETE`
   - Deployments: `DEPLOYMENT_VIEW`, `DEPLOYMENT_CREATE`, `DEPLOYMENT_UPDATE`, `DEPLOYMENT_DELETE`
   - Reports: `REPORT_VIEW`, `REPORT_CREATE`, `REPORT_EXPORT`, `REPORT_DELETE`
   - Monitoring: `MONITORING_VIEW`, `MONITORING_CONFIGURE`
   - Governance & Security: `GOVERNANCE_VIEW`, `GOVERNANCE_MANAGE`, `AUDIT_LOG_VIEW`, `SECURITY_SETTINGS_MANAGE`
   - Members: `MEMBERS_INVITE`, `MEMBERS_UPDATE`, `MEMBERS_REMOVE`
3. **Identical Permissions Across Dissimilar Roles:**
   - `analyst` and `viewer` receive the exact same permissions (`member:read`, `project:read`).
   - `admin` and `owner` have virtually identical rights (except `org:manage`).
   - `data_scientist` has `project:update`, which inadvertently grants access to approve deployments, change project parameters, modify assumptions, and trigger workflows.

---

## 3. Backend Authorization Gaps (Route-by-Route)

| Router / Endpoint | Current Dependency | Actual Capability | Security Gap |
|---|---|---|---|
| `POST /deployments/{id}/approve` | `require_permission("project:update")` | Approve model deployment to production | `data_scientist` has `project:update`, allowing them to approve their own models, violating separation of duties. |
| `POST /experiments/{id}/deployments` | `require_permission("project:update")` | Deploy model to live endpoint | `data_scientist` can deploy directly without `MODEL_DEPLOY` authorization. |
| `POST /deployments/{id}/rollback` | `require_permission("project:update")` | Roll back production model | Anyone with `project:update` can roll back deployments. |
| `POST /deployments/{id}/stop` | `require_permission("project:update")` | Stop and tear down production model | No dedicated `DEPLOYMENT_DELETE` check. |
| `POST /projects/{id}/profile-jobs` | `require_permission("project:create")` | Trigger heavy profiling job | `project:create` is for creating projects, not profiling datasets. Analysts cannot profile. |
| `GET /projects` | `require_permission("project:read")` | List all projects in organization | Returns **all** projects regardless of user assignment. No project isolation. |
| `GET /projects/{project_id}` | `require_permission("project:read")` | Retrieve project details | Any tenant member can access any project if they know/guess the ID. |
| `POST /organizations/{id}/members` | `require_permission("member:manage")` | Add or update organization member | Admin can assign `owner` role or demote owners. No privilege escalation prevention. |
| `GET /projects/{id}/experiments` | `require_permission("project:read")` | View experiments | Coarse read check, no `EXPERIMENT_VIEW`. |
| `POST /projects/{id}/experiments` | `require_permission("project:create")` | Create ML experiment | Reuses project creation permission. |
| `GET /audit-events` | `require_permission("audit:read")` | View organization audit logs | Coarse check; viewer/analyst correctly blocked, but missing specific `AUDIT_LOG_VIEW`. |

---

## 4. Project-Level Isolation Gaps

Currently, **project membership does not exist as a database entity**.
- The `projects` table only has an `owner_user_id` and `organization_id`.
- Any user who belongs to an Organization has access to **every** project in that Organization.
- Example Violation:
  - If Organization has *Project A (Fraud Detection)* and *Project B (Executive Compensation)*:
  - A Data Scientist assigned to Project A can view, edit, and run experiments on Project B.
  - A Viewer or Analyst added to the Organization can see all confidential projects.
- **Requirement:** Implement a `project_memberships` table and `require_project_access` dependency:
  - `owner` and `admin` retain organization-wide visibility.
  - `data_scientist`, `analyst`, and `viewer` can only access projects where an explicit `ProjectMembership` exists (or where they are the designated project owner).

---

## 5. Frontend Authorization Gaps

1. **Dashboard Shell Navigation:**
   - Only 4 tabs were present (`Projects`, `Team & RBAC`, `Audit Trail`, `System Health`).
   - The only role check in the navigation was `canViewAudit = ['owner', 'admin', 'security_auditor'].includes(role)`.
   - The navigation did not adapt to the user's role:
     - Data Scientists saw no direct link to Experiments, Models, or Datasets.
     - Analysts saw the exact same screen as Data Scientists and Viewers.
     - Security Auditors had to navigate through project screens instead of seeing a dedicated security/governance surface.
2. **Missing Role-Specific Dashboards:**
   - The default landing for every user is the projects table, regardless of whether they are a Security Auditor (who cares about logs and compliance), a Data Scientist (who cares about experiment performance and drift), or an Executive Viewer (who cares about reports).
3. **Client-Side Permission Omission:**
   - `/auth/me` and `/auth/login` only return `role: string`. They do not return the computed `permissions: string[]`.
   - The frontend is forced to do scattered checks like `['owner', 'admin'].includes(activeOrg?.role || '')`.
4. **Action-Level Protection:**
   - In `DeploymentView.tsx` and `ExperimentsView.tsx`, buttons like `[Approve]`, `[Deploy]`, and `[Run]` are not tied to verified permission claims.

---

## 6. Security Risks Identified

1. **Self-Privilege Escalation:**
   - An `admin` can invite a user or edit a member and assign the `owner` role.
   - A member could theoretically modify their own membership record if an endpoint did not check `target_user.id != current_user.id`.
2. **Separation of Duties (SoD) Violation:**
   - Data Scientists can write models and simultaneously approve and deploy them to production.
3. **Cross-Project Lateral Movement:**
   - Tenancy isolation was only enforced at the Organization boundary, not at the Project boundary.
4. **Data Classification Bypass:**
   - A viewer in an organization could access `restricted` or `confidential` project data without being on the project access list.

---

## 7. Target Architecture: Permission-Based RBAC

```
+-----------------------------------------------------------------------+
|                         AUTHENTICATED IDENTITY                        |
|                     (JWT Bearer -> User record)                       |
+-----------------------------------------------------------------------+
                                   |
                                   v
+-----------------------------------------------------------------------+
|                       TENANT & ROLE RESOLUTION                        |
|        OrganizationMembership -> Role (Owner, Admin, DS, ...)        |
+-----------------------------------------------------------------------+
                                   |
                                   v
+-----------------------------------------------------------------------+
|                    CENTRALIZED PERMISSIONS MATRIX                     |
|           Role -> Set[Permission] (ORGANIZATION_*, PROJECT_*,        |
|                    EXPERIMENT_*, MODEL_*, REPORT_*, ...)              |
+-----------------------------------------------------------------------+
             |                                              |
             v                                              v
+-----------------------------+               +-------------------------+
|   ORGANIZATION-LEVEL CHECK  |               |   PROJECT-LEVEL CHECK   |
|   require_permission(...)   |               | require_project_access  |
|                             |               | (Org Role / Assignment) |
+-----------------------------+               +-------------------------+
             |                                              |
             +----------------------+-----------------------+
                                    |
                                    v
                 +--------------------------------------+
                 |     AUTHORIZED ENDPOINT EXECUTION    |
                 +--------------------------------------+
```

### Key Components to Implement:
1. **`app.auth.permissions`:** Reusable constants and explicit `ROLE_PERMISSIONS` dictionary for all 6 roles.
2. **`ProjectMembership` Model & Migration (`0011_project_memberships`):** DB-level project assignment with indexed foreign keys.
3. **Centralized Dependencies (`app.auth.dependencies`):**
   - `require_permission(permission: str)`
   - `require_project_permission(permission: str)`
   - `require_project_access()`
4. **Self-Privilege Escalation Controls:**
   - Block non-owners from assigning `owner` role.
   - Block users from altering their own role.
   - Block removing or demoting the organization owner.
5. **Frontend Permission Context (`AuthContext`):**
   - Provide `hasPermission(permission: string): boolean`.
   - Provide role-specific navigation and dashboards for Owner/Admin, Data Scientist, Analyst, Viewer, and Security Auditor.
   - Render button-level gates with `hasPermission(...)`.
