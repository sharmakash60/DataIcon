import React, { useState } from 'react'
import {
  ShieldCheckIcon,
  CpuIcon,
  SearchIcon,
  LockIcon,
  ActivityIcon,
  LayersIcon,
  TerminalIcon,
  ServerIcon,
  CheckIcon
} from './icons'

interface PublicServicesPageProps {
  onNavigateHome: () => void
  onNavigateLogin: () => void
}

const AGENT_SPECIFICATIONS = [
  {
    id: '01',
    name: 'Strategy & Formulation Agent',
    iconType: 'layers',
    tag: 'STRATEGY',
    badge: 'ROI & Hypothesis Engine',
    desc: 'Aligns predictive AI directly with your business revenue targets and executive KPIs. Eliminates months of misaligned exploratory work so your teams deliver real business value from day one.',
    metrics: ['Sub-second problem formulation', 'Direct revenue & KPI alignment', 'Mathematical validation proof']
  },
  {
    id: '02',
    name: 'Air-Gapped Data Agent',
    iconType: 'shield',
    tag: 'ZERO-KNOWLEDGE',
    badge: 'VPC Boundary Guard',
    desc: 'Eliminates data breach and compliance liabilities. Connects, profiles, and cleans sensitive enterprise data 100% inside your private cloud boundary. Your raw data never leaves your infrastructure.',
    metrics: ['100% private VPC boundary', 'Differential privacy data protection', 'Zero raw data egress ($0 liability)']
  },
  {
    id: '03',
    name: 'AutoML & Swarm Pipeline',
    iconType: 'cpu',
    tag: 'MODELING',
    badge: '10x Speed Ensemble Engine',
    desc: 'Cuts model delivery time by 10x. Autonomous multi-model search finds the highest-accuracy model automatically, shrinking delivery cycles from 6 months to under 48 hours.',
    metrics: ['Bayesian hyperparameter exploration (automated top model)', '10x faster time-to-production', 'Shrinks cycle from 6 months to 48 hours']
  },
  {
    id: '04',
    name: 'TreeSHAP Explainability Agent',
    iconType: 'search',
    tag: 'EXPLAINABILITY',
    badge: 'Boardroom Buy-in Engine',
    desc: 'Solves the black-box AI trust barrier. Delivers clear, mathematical proof behind every prediction so executives, board members, and regulators can sign off with complete confidence.',
    metrics: ['Deterministic TreeSHAP feature proof', '100% auditable executive proof', 'Interactive what-if counterfactuals']
  },
  {
    id: '05',
    name: 'Continuous Health & Drift Sentinel',
    iconType: 'activity',
    tag: 'MONITORING',
    badge: 'Revenue Protection Sentinel',
    desc: 'Protects your bottom line 24/7 against silent accuracy drops. Continuously guards live models, detecting market shifts and customer pattern changes before they impact revenue.',
    metrics: ['24/7 automated revenue protection', 'Real-time drift detection', 'Continuous SLA & accuracy surveillance']
  },
  {
    id: '06',
    name: 'Executive Intelligence Dossier',
    iconType: 'terminal',
    tag: 'ANALYTICS',
    badge: 'Executive Synthesis',
    desc: 'Saves 100+ reporting hours quarterly. Automatically synthesizes executive audit dossiers, ROI summaries, and board-ready decks with transparent mathematical provenance.',
    metrics: ['Boardroom-ready executive summaries', 'Verified business ROI metrics', 'One-click executive PDF export']
  },
  {
    id: '07',
    name: 'Zero-Trust Serving Agent',
    iconType: 'server',
    tag: 'DEPLOYMENT',
    badge: 'Sub-5ms Execution',
    desc: 'Turns predictive models into real-time revenue. Delivers sub-5ms instant predictions directly within your customer apps and workflows with 99.99% availability.',
    metrics: ['Sub-5ms real-time inference', '99.99% SLA availability', 'Zero external API or cloud egress fees']
  },
  {
    id: '08',
    name: 'Compliance & Audit Guard',
    iconType: 'lock',
    tag: 'GOVERNANCE',
    badge: 'Audit & Legal Sentinel',
    desc: 'Guarantees turnkey compliance for legal and security teams. Enforces strict role-based access control with tamper-proof audit trails for hassle-free regulatory approvals.',
    metrics: ['Turnkey SOC 2, HIPAA & GDPR compliance', 'Strict enterprise tenant isolation', 'Tamper-proof audit logs']
  }
]

function renderAgentIcon(type: string, size = 18) {
  switch (type) {
    case 'shield': return <ShieldCheckIcon size={size} color="#059669" />
    case 'cpu': return <CpuIcon size={size} color="#2563eb" />
    case 'search': return <SearchIcon size={size} color="#0d9488" />
    case 'lock': return <LockIcon size={size} color="#475569" />
    case 'activity': return <ActivityIcon size={size} color="#e11d48" />
    case 'terminal': return <TerminalIcon size={size} color="#7c3aed" />
    case 'server': return <ServerIcon size={size} color="#0284c7" />
    default: return <LayersIcon size={size} color="#059669" />
  }
}

export default function PublicServicesPage({ onNavigateHome, onNavigateLogin }: PublicServicesPageProps) {
  const [selectedAgent, setSelectedAgent] = useState(AGENT_SPECIFICATIONS[0])
  const [activeTab, setActiveTab] = useState<'agents' | 'perimeter' | 'compliance'>('agents')

  return (
    <div className="public-services-page enterprise-services-layout">
      {/* Services Hero Header */}
      <section className="services-page-hero">
        <div className="services-hero-container">
          <div className="services-tag-badge">
            <LayersIcon size={14} color="#059669" />
            <span>ENTERPRISE ARCHITECTURE & SERVICES</span>
          </div>

          <h1 className="services-hero-title">
            Engineered for High-Stakes Confidential Machine Learning
          </h1>

          <p className="services-hero-sub">
            DaTaIcon decomposes complex machine learning workflows into 8 specialized autonomous agents
            that operate strictly within your security perimeter. Zero raw records ever leave your private network.
          </p>

          <div className="services-subnav-tabs">
            <button
              type="button"
              className={`subnav-pill ${activeTab === 'agents' ? 'active' : ''}`}
              onClick={() => setActiveTab('agents')}
            >
              8 Autonomous Agents
            </button>
            <button
              type="button"
              className={`subnav-pill ${activeTab === 'perimeter' ? 'active' : ''}`}
              onClick={() => setActiveTab('perimeter')}
            >
              Air-Gapped Security Perimeter
            </button>
            <button
              type="button"
              className={`subnav-pill ${activeTab === 'compliance' ? 'active' : ''}`}
              onClick={() => setActiveTab('compliance')}
            >
              Enterprise Governance & RBAC
            </button>
          </div>
        </div>
      </section>

      {/* Main Content Sections based on Active Tab */}
      <section className="services-main-body">
        {activeTab === 'agents' && (
          <div className="agents-clean-showcase">
            <div className="agents-showcase-header">
              <span className="eyebrow">THE 8 AUTONOMOUS AGENTS</span>
              <h3>Specialized AI Intelligence for Every Business Function</h3>
              <p>Each agent operates 100% within your private perimeter, automating complex workflows in hours.</p>
            </div>

            {/* Clean 8-Card Commercial Grid */}
            <div className="agents-commercial-grid">
              {AGENT_SPECIFICATIONS.map((agent) => {
                const isSelected = selectedAgent.id === agent.id
                return (
                  <div
                    key={agent.id}
                    className={`agent-service-card ${isSelected ? 'is-selected' : ''}`}
                    onClick={() => setSelectedAgent(agent)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter') setSelectedAgent(agent) }}
                  >
                    <div className="agent-card-header">
                      <div className="agent-card-icon-box">{renderAgentIcon(agent.iconType, 20)}</div>
                      <span className="agent-card-number">0{agent.id}</span>
                    </div>

                    <span className="agent-card-badge">{agent.badge}</span>
                    <h4 className="agent-card-title">{agent.name}</h4>
                    <p className="agent-card-description">{agent.desc}</p>

                    <div className="agent-card-footer">
                      <span className="card-inspect-link">
                        {isSelected ? '● Viewing Details' : 'View capabilities →'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Clean, Non-Tech Spotlight Detail Drawer */}
            {selectedAgent && (
              <div className="agent-minimal-drawer">
                <div className="drawer-header-strip">
                  <div className="drawer-agent-identity">
                    <span className="drawer-icon">{renderAgentIcon(selectedAgent.iconType, 22)}</span>
                    <div>
                      <span className="drawer-num">AGENT 0{selectedAgent.id} · {selectedAgent.badge}</span>
                      <h3 className="drawer-name">{selectedAgent.name}</h3>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn-primary btn-sm-action"
                    onClick={onNavigateLogin}
                  >
                    Deploy in Workspace →
                  </button>
                </div>

                <p className="drawer-lead-desc">{selectedAgent.desc}</p>

                <div className="drawer-metrics-chips">
                  {selectedAgent.metrics.map((metric, i) => (
                    <div key={i} className="metric-chip-item">
                      <CheckIcon size={14} color="#829F80" />
                      <span>{metric}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'perimeter' && (
          <div className="perimeter-tab-section">
            <div className="perimeter-comparison-card">
              <h3>Air-Gapped Confidentiality vs. Traditional Cloud AI</h3>
              <p className="comparison-lead">
                Most cloud AI platforms require shipping raw records over the public Internet.
                DaTaIcon inverts this model: intelligence moves to your data, not your data to the cloud.
              </p>

              <div className="comparison-table-wrapper">
                <table className="comparison-table">
                  <thead>
                    <tr>
                      <th>Business & Architectural Dimension</th>
                      <th>Traditional Cloud AI</th>
                      <th>DaTaIcon Zero-Knowledge Enclave</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td><strong>Raw Data Location</strong></td>
                      <td>Transferred to vendor cloud servers (risk of leak)</td>
                      <td className="highlight-cell">100% inside customer VPC / private boundary (zero leak)</td>
                    </tr>
                    <tr>
                      <td><strong>Breach & Compliance Liability</strong></td>
                      <td>High risk of multi-million dollar GDPR/HIPAA penalties</td>
                      <td className="highlight-cell">$0.00 exposure — zero raw records ever leave boundary</td>
                    </tr>
                    <tr>
                      <td><strong>Time-to-Value & Production</strong></td>
                      <td>6 to 9 months of security questionnaires & legal review</td>
                      <td className="highlight-cell">Under 48 hours — runs inside your existing perimeter</td>
                    </tr>
                    <tr>
                      <td><strong>Total Cost of Ownership (TCO)</strong></td>
                      <td>Surging data egress fees & unpredictable token bills</td>
                      <td className="highlight-cell">65% lower TCO with predictable flat cloud infrastructure</td>
                    </tr>
                    <tr>
                      <td><strong>Explainability & Audit</strong></td>
                      <td>Black-box heuristics or LLM approximations</td>
                      <td className="highlight-cell">Deterministic TreeSHAP & permutation attribution</td>
                    </tr>
                    <tr>
                      <td><strong>Audit Integrity</strong></td>
                      <td>Vendor-managed ephemeral logs</td>
                      <td className="highlight-cell">Tamper-proof permanent audit ledger</td>
                    </tr>
                    <tr>
                      <td><strong>Deployment Target</strong></td>
                      <td>Locked to proprietary cloud APIs</td>
                      <td className="highlight-cell">Private, portable enterprise deployment</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'compliance' && (
          <div className="compliance-tab-section">
            <div className="compliance-grid">
              <div className="compliance-card">
                <div className="compliance-icon-box">
                  <ShieldCheckIcon size={24} color="#829F80" />
                </div>
                <h4>Role-Based Access Control (RBAC)</h4>
                <p>
                  Built-in multi-tenancy ensures strict organization separation. Roles include:
                </p>
                <ul>
                  <li><strong>Owner:</strong> Full workspace governance, billing, and member allocation.</li>
                  <li><strong>Admin:</strong> System configuration, cluster connectors, and pipeline schedules.</li>
                  <li><strong>Data Scientist:</strong> Feature engineering, model exploration, and evaluation.</li>
                  <li><strong>Auditor:</strong> Read-only compliance inspection and audit reporting.</li>
                </ul>
              </div>

              <div className="compliance-card">
                <div className="compliance-icon-box">
                  <LockIcon size={24} color="#829F80" />
                </div>
                <h4>Zero Egress Verification</h4>
                <p>
                  Our autonomous agents execute 100% inside your private cloud boundary.
                  Your sensitive customer records and internal datasets never leave your network,
                  eliminating third-party AI exposure and data leak liability.
                </p>
              </div>

              <div className="compliance-card">
                <div className="compliance-icon-box">
                  <ServerIcon size={24} color="#829F80" />
                </div>
                <h4>Tamper-Evident Audit Ledger</h4>
                <p>
                  Every model decision, stage transition, and workflow approval is permanently preserved
                  in an unalterable audit log, guaranteeing effortless SOC 2, HIPAA, and regulatory compliance.
                </p>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Services Page Bottom CTA */}
      <section className="services-bottom-cta">
        <div className="cta-container">
          <h2>Ready to Deploy Autonomous AI with Zero Data Exposure?</h2>
          <p>Sign in to your private workspace or initialize a new organization control plane.</p>
          <div className="cta-buttons">
            <button type="button" className="btn-primary" onClick={onNavigateLogin}>
              Access Control Plane Console →
            </button>
            <button type="button" className="btn-secondary" onClick={onNavigateHome}>
              ← Return to Homepage
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
