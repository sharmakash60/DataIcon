# Foundation verification

- `backend/`: unit tests and PostgreSQL/Redis integration tests. Migration rollback uses a fresh,
  uniquely named test database and never rolls back the development database.
- `e2e/`: Playwright checks the actual running Vite page and its live proxied readiness response.
- Frontend component tests live beside the component under `frontend/src/`.

See `docs/development.md` for commands. Integration tests require the local development PostgreSQL
role to create/drop test databases. Never run them with production connection settings.
