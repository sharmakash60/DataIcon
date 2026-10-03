import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PermissionGate } from './PermissionGate'
import { getAuthorizedNavigation, ROLE_NAVIGATION } from './navigationConfig'
import { Permissions } from './types'

// Mock useAuth for testing
const mockUseAuth = (permissions: string[]) => ({
  user: { id: 'test-user', email: 'test@example.com', display_name: 'Test User', status: 'active', created_at: '' },
  organizations: [],
  activeOrg: {
    organization_id: 'org-1',
    organization_name: 'Test Org',
    role: 'viewer' as const,
    status: 'active',
    permissions,
  },
  setActiveOrgId: () => {},
  loading: false,
  login: async () => {},
  register: async () => {},
  logout: async () => {},
  permissions,
  hasPermission: (perm: string) => permissions.includes(perm),
  hasAnyPermission: (perms: string[]) => perms.some((p) => permissions.includes(p)),
  hasAllPermissions: (perms: string[]) => perms.every((p) => permissions.includes(p)),
})

// Vi mock for AuthContext
import * as AuthContextModule from './AuthContext'
import { vi } from 'vitest'

describe('PermissionGate Component & Role Navigation Architecture', () => {
  it('renders children when required permission is present', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue(
      mockUseAuth([Permissions.EXPERIMENT_RUN]) as any,
    )

    render(
      <PermissionGate permission={Permissions.EXPERIMENT_RUN}>
        <button>Run Experiment</button>
      </PermissionGate>,
    )

    expect(screen.getByText('Run Experiment')).toBeInTheDocument()
  })

  it('hides children when required permission is absent', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue(
      mockUseAuth([Permissions.EXPERIMENT_VIEW]) as any,
    )

    render(
      <PermissionGate permission={Permissions.EXPERIMENT_RUN} fallback={<span>Access Denied</span>}>
        <button>Run Experiment</button>
      </PermissionGate>,
    )

    expect(screen.queryByText('Run Experiment')).not.toBeInTheDocument()
    expect(screen.getByText('Access Denied')).toBeInTheDocument()
  })

  it('guarantees Viewer cannot see Run Experiment, Delete Dataset, Deploy Model, Approve Model', () => {
    // Canonical Viewer permissions
    const viewerPerms = [
      Permissions.ORGANIZATION_VIEW,
      Permissions.PROJECT_VIEW,
      Permissions.DATASET_VIEW,
      Permissions.EXPERIMENT_VIEW,
      Permissions.MODEL_VIEW,
      Permissions.REPORT_VIEW,
      Permissions.DEPLOYMENT_VIEW,
      Permissions.MONITORING_VIEW,
    ]

    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue(
      mockUseAuth(viewerPerms) as any,
    )

    render(
      <div>
        <PermissionGate permission={Permissions.EXPERIMENT_RUN}>
          <button>Run Experiment</button>
        </PermissionGate>
        <PermissionGate permission={Permissions.DATASET_DELETE}>
          <button>Delete Dataset</button>
        </PermissionGate>
        <PermissionGate permission={Permissions.DEPLOYMENT_CREATE}>
          <button>Deploy Model</button>
        </PermissionGate>
        <PermissionGate permission={Permissions.MODEL_APPROVE}>
          <button>Approve Model</button>
        </PermissionGate>
      </div>,
    )

    expect(screen.queryByText('Run Experiment')).not.toBeInTheDocument()
    expect(screen.queryByText('Delete Dataset')).not.toBeInTheDocument()
    expect(screen.queryByText('Deploy Model')).not.toBeInTheDocument()
    expect(screen.queryByText('Approve Model')).not.toBeInTheDocument()
  })

  it('guarantees Data Scientist can create/run experiments but cannot approve models or manage users/billing', () => {
    const dsPerms = [
      Permissions.ORGANIZATION_VIEW,
      Permissions.PROJECT_VIEW,
      Permissions.PROJECT_CREATE,
      Permissions.DATASET_VIEW,
      Permissions.DATASET_CONNECT,
      Permissions.DATASET_PROFILE,
      Permissions.DATASET_EXPORT,
      Permissions.EXPERIMENT_VIEW,
      Permissions.EXPERIMENT_CREATE,
      Permissions.EXPERIMENT_RUN,
      Permissions.MODEL_VIEW,
      Permissions.MODEL_CREATE,
      Permissions.REPORT_VIEW,
      Permissions.REPORT_CREATE,
      Permissions.REPORT_EXPORT,
      Permissions.DEPLOYMENT_VIEW,
      Permissions.DEPLOYMENT_CREATE,
      Permissions.MONITORING_VIEW,
    ]

    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue(
      mockUseAuth(dsPerms) as any,
    )

    render(
      <div>
        <PermissionGate permission={Permissions.EXPERIMENT_CREATE}>
          <button>Create Experiment</button>
        </PermissionGate>
        <PermissionGate permission={Permissions.EXPERIMENT_RUN}>
          <button>Run Experiment</button>
        </PermissionGate>
        <PermissionGate permission={Permissions.MODEL_APPROVE}>
          <button>Approve Model</button>
        </PermissionGate>
        <PermissionGate permission={Permissions.MEMBERS_INVITE}>
          <button>Manage Users</button>
        </PermissionGate>
        <PermissionGate permission={Permissions.BILLING_MANAGE}>
          <button>Manage Billing</button>
        </PermissionGate>
      </div>,
    )

    // Allowed
    expect(screen.getByText('Create Experiment')).toBeInTheDocument()
    expect(screen.getByText('Run Experiment')).toBeInTheDocument()

    // Forbidden
    expect(screen.queryByText('Approve Model')).not.toBeInTheDocument()
    expect(screen.queryByText('Manage Users')).not.toBeInTheDocument()
    expect(screen.queryByText('Manage Billing')).not.toBeInTheDocument()
  })

  it('verifies exact role navigation configurations match specification', () => {
    // Owner / Admin: 13 items
    expect(ROLE_NAVIGATION.owner.map((i) => i.id)).toEqual([
      'dashboard', 'members', 'projects', 'datasets', 'experiments', 'models',
      'deployments', 'monitoring', 'governance', 'security', 'audit', 'billing', 'settings',
    ])

    // Data Scientist: 8 items
    expect(ROLE_NAVIGATION.data_scientist.map((i) => i.id)).toEqual([
      'dashboard', 'projects', 'datasets', 'experiments', 'models', 'explainability', 'reports', 'monitoring',
    ])

    // Analyst: 5 items
    expect(ROLE_NAVIGATION.analyst.map((i) => i.id)).toEqual([
      'dashboard', 'projects', 'datasets', 'analysis', 'reports',
    ])

    // Viewer: 4 items
    expect(ROLE_NAVIGATION.viewer.map((i) => i.id)).toEqual([
      'dashboard', 'projects', 'reports', 'monitoring',
    ])
    expect(ROLE_NAVIGATION.viewer.find((i) => i.id === 'projects')?.label).toBe('Accessible Projects')
    expect(ROLE_NAVIGATION.viewer.find((i) => i.id === 'reports')?.label).toBe('Approved Reports')

    // Security Auditor: 6 items
    expect(ROLE_NAVIGATION.security_auditor.map((i) => i.id)).toEqual([
      'dashboard', 'security', 'governance', 'audit', 'agents', 'reports',
    ])
    expect(ROLE_NAVIGATION.security_auditor.find((i) => i.id === 'agents')?.label).toBe('Agent Activity')
    expect(ROLE_NAVIGATION.security_auditor.find((i) => i.id === 'reports')?.label).toBe('Security Reports')
  })
})
