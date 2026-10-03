# Development environment

## Prerequisites and choices

- Docker Desktop with Linux containers and Docker Compose.
- For native tooling: Node.js 24, npm, Python 3.12 and uv. The backend supports Python 3.12–3.14;
  the tested/reference runtime is 3.12. Dependency resolutions are committed in `backend/uv.lock`
  and `frontend/package-lock.json`.
- PostgreSQL 17 and Redis 7.4 run in separate Docker services with persistent named volumes.
- Host ports are PostgreSQL 15432, Redis 16379, backend 8000 and frontend 5173. Host publication
  binds to 127.0.0.1. PostgreSQL uses 5432 and Redis uses 6379 inside the Compose network.
- Native Python/npm is optional when running the all-container stack. A native Node installation
  is required for the documented browser-test command.

The exact resolved versions are in the lockfiles. Docker base images use version tags for this
development foundation; production digest pinning and production runtime images are later work.

## First start

From the repository root, copy `.env.example` to `.env` if it does not already exist, then run:

```powershell
docker compose up --build -d --wait
docker compose ps -a
```

PostgreSQL becomes healthy, the one-shot `migrate` service applies `alembic upgrade head`, and only
then does the backend start. Redis must also be healthy. The frontend starts after backend readiness.
An exited migration container with exit code zero is normal. A failed migration blocks backend startup.

Open `http://localhost:5173`. The status page must say **All services ready**. It checks the actual API;
it does not display hardcoded connection status. `http://localhost:8000/docs` exposes OpenAPI.

Source changes under `frontend/src`, `frontend/index.html`, `backend/app`, and `backend/migrations`
are bind-mounted for development. Dependency/configuration changes require rebuilding the relevant image.

## Native application development

Start just the infrastructure (do not also leave the Compose frontend/backend occupying the same ports):

```powershell
docker compose stop frontend backend
docker compose up -d --wait postgres redis
cd backend
uv sync --frozen
uv run alembic upgrade head
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

In a second terminal, from the root:

```powershell
cd frontend
npm ci
npm run dev -- --host 127.0.0.1
```

The backend reads the root `.env`. Vite proxies `/api` to `http://127.0.0.1:8000` by default.
If changing the native backend port, set `API_PROXY_TARGET` for Vite. If changing database/Redis host
ports in `.env`, update the corresponding native `DATABASE_URL` and `REDIS_URL` too. The Compose
backend always uses internal service names and ports. No browser-side database credentials are needed.

## Verification

Run the complete container startup, backend tests, frontend tests/build and migration consistency check:

```powershell
./infrastructure/verify.ps1
```

Equivalent individual commands, from the root:

```powershell
docker compose up --build -d --wait
docker compose --profile test run --rm backend-tests
docker compose exec -T backend alembic current
docker compose exec -T backend alembic check
docker compose exec -T frontend npm test
docker compose exec -T frontend npm run build
```

The integration suite creates and drops only uniquely named `datapilot_test_<uuid>` databases.
It verifies migration upgrade, idempotent upgrade, ORM write/read, schema consistency, downgrade,
re-upgrade, readiness before and after migration, and real Redis read/write. It requires database
creation rights, as supplied by this development Compose stack. Never target production settings.

Native unit/integration commands from `backend/`:

```powershell
uv run pytest -m 'not integration'
$env:RUN_INTEGRATION = '1'
uv run pytest
Remove-Item Env:RUN_INTEGRATION
uv run ruff check app migrations ../tests/backend
uv run ruff format --check app migrations ../tests/backend
```

On POSIX shells use `RUN_INTEGRATION=1 uv run pytest` instead of the PowerShell environment commands.

Browser smoke test, with the full stack already running, from `frontend/`:

```powershell
npm ci
npx playwright install chromium
npm run test:e2e
```

This opens a real headless Chromium browser, renders the frontend, waits for the real proxied
backend response, verifies all dependency statuses and exercises refresh. It fails on browser errors.
Override `FRONTEND_URL` if the frontend port changes. Failure traces are written to `test-results/`.

## Migrations

Initial revision `0001_organizations` creates the organization tenant-root table with UUID key,
required nonblank name and timezone-aware creation timestamp. No unauthenticated organization API
has been added. Authorization and tenant-scoped child tables will be introduced together later.

```powershell
docker compose exec -T backend alembic current
docker compose exec -T backend alembic check
```

Generate future revisions natively from `backend/` after changing models:

```powershell
uv run alembic revision --autogenerate -m "describe change"
uv run alembic upgrade head
```

Review generated migrations. Do not use ORM `create_all` as a substitute. Application startup does
not silently alter the schema; readiness returns 503 when the database revision does not match.
Migration rollback tests are confined to disposable test databases.

## Health semantics and recovery

- `/api/v1/health/live` returns 200 if the backend process responds, even if a dependency is down.
- `/api/v1/health/ready` returns 200 only when PostgreSQL, Redis and the migration revision are ready.
  Otherwise it returns 503 with named checks. It does not expose driver errors, passwords or DSNs.
- Database/Redis probes have bounded timeouts. The frontend displays unknown/unavailable states and
  provides a retry button; it never treats a failed request as success.

Inspect problems with `docker compose logs --tail 100 backend migrate postgres redis`.
If a port is occupied or reserved by Windows, change the host port in `.env` and matching native URL.
If Docker is unavailable, start Docker Desktop and confirm Linux containers are selected.
If package downloads fail, resolve registry/network access; do not remove the lockfiles to bypass it.

## Stop and retain data

```powershell
docker compose down
```

Named volumes remain for the next startup. `docker compose down -v` also deletes development
PostgreSQL/Redis data; use it only when intentionally resetting disposable local data.

The Data Agent and ML engine are intentionally not running in this milestone. This stack handles
development service health and schema setup, not customer datasets. No external fonts, analytics,
LLM calls or raw-data upload endpoints are included.
