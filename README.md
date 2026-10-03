# DataPilot

Privacy-first data science platform. This initial milestone provides a working React/TypeScript/Vite
frontend, FastAPI backend, PostgreSQL, Redis, SQLAlchemy models, Pydantic settings and Alembic migrations.
ML functionality is intentionally not implemented.

## Start the development stack

Prerequisite: Docker Desktop running with Linux containers and Docker Compose.

```powershell
Copy-Item .env.example .env
docker compose up --build -d --wait
```

Do not overwrite an existing `.env`. On macOS/Linux, use `cp .env.example .env` for first-time setup.

- Frontend: http://localhost:5173
- API documentation: http://localhost:8000/docs
- Liveness: http://localhost:8000/api/v1/health/live
- Readiness: http://localhost:8000/api/v1/health/ready

Readiness checks a real PostgreSQL connection, the actual Alembic revision, and Redis PING.
The frontend displays the live readiness response through Vite's API proxy.

## Structure

```text
frontend/         React application, frontend tests and locked npm dependencies
backend/          FastAPI, SQLAlchemy, Pydantic settings and Alembic migrations
data-agent/       Reserved customer-runtime boundary; no ML implementation
infrastructure/   Dockerfiles and repeatable verification script
docs/             Development guide and validation results
tests/            Backend integration tests and browser smoke tests
compose.yaml      Local services, migration task and test runner
```

Follow [the development guide](docs/development.md) for native development, testing, migrations,
troubleshooting and shutdown. See [validation results](docs/validation.md) for checks actually run.
The approved design is in [the architecture review](DataPilot-Architecture-Review.md); the six-directory
layout above is the requested initial implementation layout.

This milestone implements Phase 1 of the approved architecture:
- Authentication & JWT session handling with adaptive bcrypt password hashing and token rotation
- Multi-tenancy models (`users`, `organizations`, `memberships`, `projects`, `refresh_tokens`, `audit_events`)
- Server-side RBAC and strict tenant isolation (Owner, Admin, Data Scientist, Analyst, Viewer, Security Auditor)
- Project CRUD APIs with validation and audit logging
- React + TypeScript + Vite frontend authentication screens and dashboard shell
- Alembic migrations (`0001_organizations`, `0002_phase1_auth_projects`)
ML functionality remains intentionally not implemented at this phase.

See [Phase 1 Documentation](docs/phase1.md) and [Development Guide](docs/development.md) for details.
