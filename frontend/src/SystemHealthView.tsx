import { useEffect, useState } from 'react'
import type { Health } from './types'

function parseHealth(value: unknown): Health {
  if (!value || typeof value !== 'object') throw new Error('Invalid health response')
  const data = value as Partial<Health>
  if (
    !['ready', 'not_ready'].includes(data.status ?? '') ||
    !data.checks ||
    !['postgresql', 'redis', 'migrations'].every((key) =>
      ['ok', 'error'].includes(data.checks![key as keyof Health['checks']]),
    ) ||
    (data.status === 'ready' && Object.values(data.checks).some((v) => v !== 'ok'))
  ) throw new Error('Invalid health response')
  return data as Health
}

export default function SystemHealthView() {
  const [health, setHealth] = useState<Health | null>(null)
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 12_000)
    let active = true
    setLoading(true)
    setError(false)
    setHealth(null)
    fetch('/api/v1/health/ready', { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        if (response.status !== 200 && response.status !== 503) throw new Error('Unavailable')
        const result = parseHealth(await response.json())
        if ((response.status === 200) !== (result.status === 'ready')) throw new Error('Invalid status')
        if (active) setHealth(result)
      })
      .catch(() => { if (active) setError(true) })
      .finally(() => {
        clearTimeout(timeout)
        if (active) setLoading(false)
      })
    return () => { active = false; clearTimeout(timeout); controller.abort() }
  }, [attempt])

  const ready = !loading && !error && health?.status === 'ready'
  const status = loading ? 'Checking services…' : ready ? 'All services ready' : 'Services need attention'

  return (
    <section className="health-section" aria-labelledby="foundation-title">
      <p className="eyebrow">PLATFORM FOUNDATION / 01</p>
      <h1 id="foundation-title">A private foundation.<br /><span>Ready to build on.</span></h1>
      <p className="intro">Your development control plane, connected and observable. Customer data processing belongs in the separate local agent.</p>
      <div className="panel" aria-labelledby="services-title">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">ENVIRONMENT STATUS</p>
            <h2 id="services-title">Service connections</h2>
          </div>
          <button id="check-again-btn" disabled={loading} onClick={() => setAttempt((v) => v + 1)}>
            Check again <span aria-hidden="true">↗</span>
          </button>
        </div>
        <p className={`summary ${ready ? 'success' : ''}`} role="status">
          <span className="dot" />{status}
        </p>
        {error && (
          <p role="alert">The backend could not be reached or returned an invalid response. Check the service logs, then try again.</p>
        )}
        <div className="services">
          {([
            ['postgresql', 'PostgreSQL', 'Persistent control-plane records'],
            ['redis', 'Redis', 'Development cache connection'],
            ['migrations', 'Database schema', 'Alembic revision matches the application'],
          ] as const).map(([key, name, description]) => {
            const check = health?.checks[key]
            const label = loading ? 'Checking' : check === 'ok' ? 'Ready' : check === 'error' ? 'Unavailable' : 'Unknown'
            return (
              <div className="service" key={key}>
                <div>
                  <h3>{name}</h3>
                  <p>{description}</p>
                </div>
                <span className={`badge ${check === 'ok' ? 'good' : ''}`}>{label}</span>
              </div>
            )
          })}
        </div>
      </div>
      <aside>
        <span aria-hidden="true">◇</span>
        <div>
          <strong>The privacy boundary starts here.</strong>
          <p>This foundation exposes service health only. Dataset access, profiling, and model training are not implemented.</p>
        </div>
      </aside>
    </section>
  )
}
