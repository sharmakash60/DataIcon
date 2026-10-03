# Phase 1: Authentication, Multitenancy, RBAC & Projects

Phase 1 provides identity, tenant isolation, role-based access control (RBAC), and project management for the DataPilot control plane.

## Implemented Architecture

### 1. Data Models (PostgreSQL + SQLAlchemy + Alembic)
- **`users`**: Unique email, adaptive bcrypt salted password hashes, display name, account status, timezone-aware creation/update timestamps.
- **`organizations`**: Tenant root with unique ID, non-empty name, status, timestamps.
- **`memberships`**: Composite foreign key `(organization_id, user_id)` with `UNIQUE(organization_id, user_id)`. Binds a user to an organization with a specific RBAC role.
- **`projects`**: Tenant-owned resource with indexed `organization_id` (FK to `organizations.id` cascade delete), unique name per organization, classification (`internal`, `confidential`, `restricted`), status (`active`, `archived`), and owner reference.
- **`refresh_tokens`**: Server-side revocable refresh tokens stored as SHA-256 hashes with expiration and rotation on every renewal.
- **`audit_events`**: Append-only security audit log recording actors, actions, tenant IDs, outcomes, IP addresses, and sanitized details without secrets.

### 2. Migrations
- `0001_organizations`: Initial organization tenant root.
- `0002_phase1_auth_projects`: Schema expansion for users, memberships, projects, refresh tokens, and audit events.

### 3. RBAC Roles & Permissions
| Role | Permissions |
|---|---|
| **Owner** | Full administrative rights: `org:manage`, `member:read`, `member:manage`, `project:create`, `project:read`, `project:update`, `project:delete`, `audit:read` |
| **Admin** | Member and project operations: `member:read`, `member:manage`, `project:create`, `project:read`, `project:update`, `project:delete`, `audit:read` |
| **Data Scientist** | Experimentation and project operations: `member:read`, `project:create`, `project:read`, `project:update` |
| **Analyst** | Read-only evaluation: `member:read`, `project:read` |
| **Viewer** | Read-only view: `member:read`, `project:read` |
| **Security Auditor** | Governance view: `member:read`, `project:read`, `audit:read` |

### 4. API Endpoints
- **Public Endpoints**:
  - `GET /api/v1/health/live` — Process liveness
  - `GET /api/v1/health/ready` — PostgreSQL, Redis, and Alembic revision checks
  - `POST /api/v1/auth/register` — Register user and initialize organization (Owner)
  - `POST /api/v1/auth/login` — Authenticate and receive short-lived JWT + refresh token
  - `POST /api/v1/auth/refresh` — Rotate refresh token and issue new access token
- **Protected Endpoints** (Requires `Authorization: Bearer <access_token>`):
  - `GET /api/v1/auth/me` — Current user profile and organization memberships
  - `POST /api/v1/auth/logout` — Revoke active refresh tokens server-side
  - `POST /api/v1/organizations` — Create additional organization
  - `GET /api/v1/organizations` — List organizations current user belongs to
  - `GET /api/v1/organizations/{org_id}` — Get organization metadata
  - `GET /api/v1/organizations/{org_id}/members` — List members (`member:read`)
  - `POST /api/v1/organizations/{org_id}/members` — Add member with role (`member:manage`)
  - `GET /api/v1/organizations/{org_id}/projects` — List organization projects (`project:read`)
  - `POST /api/v1/organizations/{org_id}/projects` — Create project (`project:create`)
  - `GET /api/v1/organizations/{org_id}/projects/{project_id}` — Get project (`project:read`)
  - `PATCH /api/v1/organizations/{org_id}/projects/{project_id}` — Update project (`project:update`)
  - `DELETE /api/v1/organizations/{org_id}/projects/{project_id}` — Delete project (`project:delete`)
  - `GET /api/v1/organizations/{org_id}/audit-events` — Read security audit log (`audit:read`)

### 5. Frontend Screens & Dashboard Shell
- **Authentication Card**: Split-screen design with responsive toggle between Sign In and Register Organization, password complexity rules, and progressive error banners.
- **Dashboard Shell**:
  - Top navigation with Organization Switcher dropdown, system status pill, and user profile with logout.
  - Sidebar navigation with Projects, Team & RBAC, Audit Trail, and System Health.
  - **Projects View**: Search filter, classification filter (`internal`, `confidential`, `restricted`), project cards with badges, "+ New Project" modal with validation, and delete actions.
  - **Team View**: Members table with role badges, status, join dates, "+ Add Member" modal with role assignment, and RBAC matrix guide.
  - **Audit View**: Live append-only audit trail table showing actor, action, resource, result, and timestamp.
  - **System Health View**: Preserved platform foundation connectivity status with live PostgreSQL, Redis, and Alembic checks.

## Automated Verification

All verification steps pass in both native and containerized environments:

```powershell
# Run full container stack verification
powershell -ExecutionPolicy Bypass -File .\infrastructure\verify.ps1

# Run Playwright E2E browser tests (Chromium)
cd frontend
npm run test:e2e
```
