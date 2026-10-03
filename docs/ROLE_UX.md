# DataPilot Role-Aware User Experience (ROLE_UX) Documentation

**Date of Verification:** September 29, 2026  
**System Version:** Phase 1 ML Platform & Control Plane  
**Architecture:** Centralized Server-Backed Permission System (`PermissionGate` + `useAuth().hasPermission`)  
**Front-end Runtime:** React 18 / TypeScript / Vite  
**Back-end Runtime:** FastAPI / PostgreSQL 16 / Redis 7  

---

## 1. Architecture Overview: Centralized Permission-Driven UX

DataPilot implements a **strict permission-driven frontend architecture**. UI elements, sidebar navigation tabs, action buttons, and modal dialogs are never gated by ad-hoc, brittle role strings (`if role === 'admin'`) scattered across the application.

Instead, the UI dynamically renders based on the **authoritative permission set issued by the backend** during authentication and stored in `AuthContext`:

```
┌─────────────────────────────────────────────────────────────────┐
│                    FastAPI Backend Auth Engine                  │
│       Authoritative ROLE_PERMISSIONS Matrix (47 permissions)     │
└────────────────────────────────┬────────────────────────────────┘
                                 │ JWT Token & Permissions Array
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                      React AuthContext                          │
│     - permissions: string[]                                     │
│     - hasPermission(perm: string): boolean                      │
│     - hasAnyPermission(perms: string[]): boolean                │
│     - hasAllPermissions(perms: string[]): boolean               │
└───────────────────────┬─────────────────┬───────────────────────┘
                        │                 │
                        ▼                 ▼
          ┌───────────────────────┐  ┌─────────────────────────┐
          │  getAuthorizedNav()   │  │   <PermissionGate>      │
          │  Dynamic Sidebar Nav  │  │   Action-Level Buttons  │
          └───────────────────────┘  └─────────────────────────┘
```

### Key Principles
1. **Zero UI Duplication**: All components consume `<PermissionGate permission={Permissions.X}>` or `hasPermission(Permissions.X)`.
2. **Defense in Depth**: Even if an unauthorized user attempts to bypass frontend rendering via DOM manipulation, the backend server independently enforces permission dependencies (`require_permission` and `require_project_permission`) and returns HTTP `403 Forbidden`.
3. **Adaptive Role-Specific Layouts**: Each role lands on a tailored dashboard with specialized widgets and navigation items strictly reflecting their operational scope.

---

## 2. Role Navigation & Dashboard Specifications

Each role receives a tailored set of sidebar navigation items and page views matching their operational responsibilities:

### 2.1 OWNER / ADMIN

**Primary Focus:** Executive governance, organization resource allocation, team management, and production signoff.

#### Sidebar Navigation (13 Items)
1. **Organization Overview** (`dashboard`): Executive KPI summary, active models, compute quotas, team size.
2. **Members** (`members`): Invite new members, assign roles, modify memberships, remove users.
3. **Projects** (`projects`): Create initiatives, manage project lifecycle, delete deprecated projects.
4. **Datasets** (`datasets`): Connect datasets, profile schemas, export metadata, delete datasets.
5. **Experiments** (`experiments`): AutoML benchmark leaderboards, hyperparameter trials, model comparisons.
6. **Models** (`models`): Model registry catalog, production approvals, deployment initiations.
7. **Deployments** (`deployments`): Serving configurations, live prediction consoles, lifecycle rollbacks/stops.
8. **Monitoring** (`monitoring`): Real-time model drift telemetry, feature drift histograms, alert thresholds.
9. **Governance** (`governance`): Regulatory compliance policies (EU AI Act, HIPAA), risk tier determinations.
10. **Security** (`security`): Boundary isolation verification, token lifetime, API key rotations.
11. **Audit Logs** (`audit`): Complete immutable audit log viewer with actor filtering and export.
12. **Billing** (`billing`): Subscription tier, monthly compute concurrency, invoice downloads.
13. **Settings** (`settings`): Domain allowlists, session timeout policies, organization defaults.

#### Action Permissions
- **Can:**
  - Create, update, and delete projects (`PROJECT_CREATE`, `PROJECT_DELETE`)
  - Connect, profile, export, and delete datasets (`DATASET_CONNECT`, `DATASET_DELETE`)
  - Approve models for production (`MODEL_APPROVE`)
  - Invite, promote, and remove organization members (`MEMBERS_INVITE`, `MEMBERS_UPDATE`, `MEMBERS_REMOVE`)
  - Manage billing and organization settings (Owner: `BILLING_MANAGE`, `ORGANIZATION_UPDATE`)
- **Cannot:**
  - Admin cannot promote users to Owner (only Owner can transfer ownership)
  - Admin cannot demote or remove the organization Owner

---

### 2.2 DATA SCIENTIST

**Primary Focus:** Model training, algorithm benchmarking, explainability, and deployment proposals.

#### Sidebar Navigation (8 Items)
1. **Dashboard** (`dashboard`): ML Workbench dashboard showing active experiments, benchmark scores, and datasets.
2. **Projects** (`projects`): View assigned initiatives, create ML projects.
3. **Datasets** (`datasets`): Browse training data, connect new data sources, inspect schema profiles.
4. **Experiments** (`experiments`): Run AutoML experiments, inspect leaderboards, compare hyperparameter trials.
5. **Models** (`models`): Model catalog, analyze feature importance, propose models for serving.
6. **Explainability** (`explainability`): SHAP waterfall values, permutation importance, AI explainability narratives.
7. **Reports** (`reports`): Generate and review 18-section Senior Data Scientist technical reports.
8. **Monitoring** (`monitoring`): Inspect production drift and telemetry for deployed models.

#### Action Permissions
- **Can:**
  - Create and run experiments (`EXPERIMENT_CREATE`, `EXPERIMENT_RUN`)
  - Connect and profile datasets (`DATASET_CONNECT`, `DATASET_PROFILE`, `DATASET_EXPORT`)
  - Analyze models with SHAP and error diagnostics (`EXPERIMENT_VIEW`)
  - Propose deployments in `pending_approval` status (`DEPLOYMENT_CREATE`)
- **Cannot (Strictly Hidden & Enforced):**
  - **Cannot Approve Model for Production** (Separation of Duties enforced via `MODEL_APPROVE` check)
  - **Cannot Delete Datasets** (`DATASET_DELETE` button hidden)
  - **Cannot Manage Organization or Settings** (No settings tab or controls)
  - **Cannot Manage Billing** (No billing tab or controls)
  - **Cannot Manage Users** (No members tab or invite buttons)

---

### 2.3 ANALYST

**Primary Focus:** Exploratory data analysis, business metric interpretation, and executive reporting.

#### Sidebar Navigation (5 Items)
1. **Dashboard** (`dashboard`): Business impact dashboard, cost savings calculator, false positive analysis.
2. **Projects** (`projects`): View assigned projects in read-only mode.
3. **Datasets** (`datasets`): Inspect dataset profiles, statistical summaries, and export data summaries.
4. **Analysis** (`analysis`): Comparative model evaluation, metric breakdowns, and business KPI projections.
5. **Reports** (`reports`): View, generate, and export senior analytical reports.

#### Action Permissions
- **Can:**
  - View projects, datasets, and experiment metrics (`PROJECT_VIEW`, `DATASET_VIEW`, `EXPERIMENT_VIEW`)
  - Profile datasets and export metadata (`DATASET_PROFILE`, `DATASET_EXPORT`)
  - Generate and export reports (`REPORT_CREATE`, `REPORT_EXPORT`)
- **Cannot (Strictly Hidden & Enforced):**
  - **Cannot Run Experiments** (`EXPERIMENT_RUN` button hidden)
  - **Cannot Delete Datasets** (`DATASET_DELETE` button hidden)
  - **Cannot Deploy Models** (`DEPLOYMENT_CREATE` button hidden)
  - **Cannot Approve Models** (`MODEL_APPROVE` button hidden)
  - **Cannot Manage Users or Organization Settings**

---

### 2.4 VIEWER

**Primary Focus:** Stakeholder visibility, auditability, and read-only inspection.

#### Sidebar Navigation (4 Items)
1. **Dashboard** (`dashboard`): Read-only workspace summary, active model inventory, system status.
2. **Accessible Projects** (`projects`): Browse assigned projects without mutation options.
3. **Approved Reports** (`reports`): View approved, finalized reports and executive findings.
4. **Monitoring** (`monitoring`): View production uptime and high-level telemetry.

#### Action Permissions (Zero Mutation)
- **Can:**
  - View assigned projects, datasets, models, approved reports, and monitoring dashboards.
- **Must Not See (Verified Hidden):**
  - ❌ **Run Experiment** (`EXPERIMENT_RUN` button hidden)
  - ❌ **Delete Dataset** (`DATASET_DELETE` button hidden)
  - ❌ **Deploy Model** (`DEPLOYMENT_CREATE` button hidden)
  - ❌ **Approve Model** (`MODEL_APPROVE` button hidden)
  - ❌ **Create Project** (`+ New Project` button hidden)
  - ❌ **Delete Project** (Delete project trash icon hidden)
  - ❌ **Connect Dataset** (`+ Connect Dataset` button hidden)

---

### 2.5 SECURITY AUDITOR

**Primary Focus:** Compliance verification, autonomous agent oversight, security boundary auditing.

#### Sidebar Navigation (6 Items)
1. **Dashboard** (`dashboard`): Security & compliance score, recent audit log feed, anomaly alerts.
2. **Security** (`security`): Boundary isolation verification, token lifetime audit, encryption posture.
3. **Governance** (`governance`): EU AI Act compliance checks, model risk tiers, policy framework.
4. **Audit Logs** (`audit`): Append-only audit trail with filtering and export capabilities.
5. **Agent Activity** (`agents`): Telemetry of background Client Data Agent tool invocations and containment checks.
6. **Security Reports** (`reports`): Compliance and security audit documentation.

#### Action Permissions
- **Can:**
  - View security telemetry, boundary verification, and encryption status (`AUDIT_LOG_VIEW`)
  - Inspect and export audit logs (`AUDIT_LOG_VIEW`, `AUDIT_LOG_EXPORT`)
  - Inspect agent activity and containment traces (`AGENT_VIEW`)
  - Inspect member directory in read-only mode (`MEMBERS_VIEW`)
- **Cannot (Strictly Hidden & Enforced):**
  - **Cannot Modify Experiments** (Cannot create, run, or delete experiments)
  - **Cannot Deploy Models** (`DEPLOYMENT_CREATE` hidden)
  - **Cannot Modify Users** (Invite, role change, and member removal buttons hidden)
  - **Cannot Modify Security Master Settings** (API key rotation hidden)

---

## 3. Action-Level UI Permission Matrix

| UI Action / Button | Component | Permission Guard | Owner | Admin | Data Scientist | Analyst | Viewer | Security Auditor |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **+ New Project** | `ProjectsView` | `PROJECT_CREATE` | ✅ Enabled | ✅ Enabled | ✅ Enabled | ❌ Hidden | ❌ Hidden | ❌ Hidden |
| **Delete Project** | `ProjectsView` | `PROJECT_DELETE` | ✅ Enabled | ✅ Enabled | ❌ Hidden | ❌ Hidden | ❌ Hidden | ❌ Hidden |
| **+ Connect Dataset** | `DatasetsView` | `DATASET_CONNECT` | ✅ Enabled | ✅ Enabled | ✅ Enabled | ❌ Hidden | ❌ Hidden | ❌ Hidden |
| **Profile Schema** | `DatasetsView` | `DATASET_PROFILE` | ✅ Enabled | ✅ Enabled | ✅ Enabled | ✅ Enabled | ❌ Hidden | ❌ Hidden |
| **Export Dataset** | `DatasetsView` | `DATASET_EXPORT` | ✅ Enabled | ✅ Enabled | ✅ Enabled | ✅ Enabled | ❌ Hidden | ❌ Hidden |
| **Delete Dataset** | `DatasetsView` | `DATASET_DELETE` | ✅ Enabled | ✅ Enabled | ❌ Hidden | ❌ Hidden | ❌ Hidden | ❌ Hidden |
| **▶️ Run Experiment** | `ExperimentsView`| `EXPERIMENT_RUN` | ✅ Enabled | ❌ Hidden | ✅ Enabled | ❌ Hidden | ❌ Hidden | ❌ Hidden |
| **+ Deploy Model** | `ModelsView` / `DeploymentView` | `DEPLOYMENT_CREATE` | ✅ Enabled | ✅ Enabled | ✅ Enabled | ❌ Hidden | ❌ Hidden | ❌ Hidden |
| **✅ Approve Model** | `ModelsView` / `DeploymentView` | `MODEL_APPROVE` | ✅ Enabled | ✅ Enabled | ❌ Hidden (SoD) | ❌ Hidden | ❌ Hidden | ❌ Hidden |
| **+ Invite Member** | `TeamView` | `MEMBERS_INVITE` | ✅ Enabled | ✅ Enabled | ❌ Hidden | ❌ Hidden | ❌ Hidden | ❌ Hidden |
| **Update Member Role**| `TeamView` | `MEMBERS_UPDATE` | ✅ Enabled | ✅ Enabled* | ❌ Hidden | ❌ Hidden | ❌ Hidden | ❌ Hidden |
| **Remove Member** | `TeamView` | `MEMBERS_REMOVE` | ✅ Enabled | ✅ Enabled* | ❌ Hidden | ❌ Hidden | ❌ Hidden | ❌ Hidden |
| **Manage Billing** | `BillingView` | `BILLING_MANAGE` | ✅ Enabled | ❌ Hidden | ❌ Hidden | ❌ Hidden | ❌ Hidden | ❌ Hidden |
| **Rotate API Keys** | `SecurityView` | `SECURITY_SETTINGS_MANAGE` | ✅ Enabled | ❌ Hidden | ❌ Hidden | ❌ Hidden | ❌ Hidden | ❌ Hidden |
| **Export Audit Logs**| `AuditView` | `AUDIT_LOG_EXPORT` | ✅ Enabled | ✅ Enabled | ❌ Hidden | ❌ Hidden | ❌ Hidden | ✅ Enabled |

*\*Admin cannot promote users to Owner or demote/remove the current Owner.*

---

## 4. Implementation Details: `PermissionGate` Component

The declarative `<PermissionGate>` component ensures simple, clean, and centralized protection across all views:

```tsx
import React from 'react'
import { useAuth } from './AuthContext'

interface PermissionGateProps {
  permission?: string
  anyPermissions?: string[]
  allPermissions?: string[]
  children: React.ReactNode
  fallback?: React.ReactNode
}

export const PermissionGate: React.FC<PermissionGateProps> = ({
  permission,
  anyPermissions,
  allPermissions,
  children,
  fallback = null,
}) => {
  const { hasPermission, hasAnyPermission, hasAllPermissions } = useAuth()

  let allowed = true
  if (permission && !hasPermission(permission)) allowed = false
  if (anyPermissions && anyPermissions.length > 0 && !hasAnyPermission(anyPermissions)) allowed = false
  if (allPermissions && allPermissions.length > 0 && !hasAllPermissions(allPermissions)) allowed = false

  if (!allowed) return <>{fallback}</>
  return <>{children}</>
}
```

### Usage Examples
```tsx
// Protecting Action Buttons
<PermissionGate permission={Permissions.EXPERIMENT_RUN}>
  <button onClick={handleRunExperiment}>▶️ Run Experiment</button>
</PermissionGate>

<PermissionGate permission={Permissions.MODEL_APPROVE}>
  <button onClick={handleApproveModel}>✅ Approve Model</button>
</PermissionGate>

<PermissionGate permission={Permissions.DATASET_DELETE}>
  <button onClick={handleDeleteDataset}>🗑️ Delete Dataset</button>
</PermissionGate>
```

---

## 5. Verification & Test Execution Results

### 5.1 Frontend Automated Vitest Suite
- **Executed:** `npx vitest run`
- **Result:** **9 / 9 test files passed (29 / 29 tests passed)**
  - `src/PermissionGate.test.tsx`: Verified action-level hiding for Viewer, Data Scientist constraints, and role navigation schemas.
  - `src/ExperimentsView.test.tsx`: Verified experiment leaderboards and permission-gated run buttons.
  - `src/DeploymentView.test.tsx`: Verified deployment lifecycle actions, approval permissions, and local inference testing.
  - `src/MonitoringDashboardView.test.tsx`: Verified telemetry charts and drift indicators.
  - `src/ExplainabilityView.test.tsx`: Verified SHAP diagnostics and AI narrative synthesis.
  - `src/RequirementsView.test.tsx`: Verified formulation workflow.
  - `src/AuthView.test.tsx` & `src/App.test.tsx`: Verified authentication lifecycle.
  - `src/SeniorReportView.test.tsx`: Verified report synthesis.

### 5.2 TypeScript Compilation
- **Executed:** `npx tsc --noEmit`
- **Result:** **0 errors**. Fully type-checked.

### 5.3 Backend Integration Matrix
- **Executed:** `python -m pytest tests/backend/test_rbac_matrix.py -v`
- **Result:** **6 / 6 test suites passed (100%)**. Server-side validation verified.
