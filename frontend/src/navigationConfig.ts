import { Permissions } from './types'

export interface NavItemConfig {
  id: string
  label: string
  icon: string
  requiredPermission: string
  description?: string
  badge?: string
}

export type RoleType = 'owner' | 'admin' | 'data_scientist' | 'analyst' | 'viewer' | 'security_auditor'

/**
 * Canonical navigation schema defined per role.
 *
 * Each entry strictly declares the required permission from the centralized
 * backend RBAC matrix, guaranteeing that UI navigation perfectly matches
 * server-enforced API permissions.
 */
export const ROLE_NAVIGATION: Record<RoleType, NavItemConfig[]> = {
  owner: [
    { id: 'dashboard', label: 'Organization Overview', icon: '🏢', requiredPermission: Permissions.ORGANIZATION_VIEW },
    { id: 'members', label: 'Members', icon: '👥', requiredPermission: Permissions.MEMBERS_VIEW },
    { id: 'projects', label: 'Projects', icon: '📁', requiredPermission: Permissions.PROJECT_VIEW },
    { id: 'datasets', label: 'Datasets', icon: '🗄️', requiredPermission: Permissions.DATASET_VIEW },
    { id: 'experiments', label: 'Experiments', icon: '🧪', requiredPermission: Permissions.EXPERIMENT_VIEW },
    { id: 'models', label: 'Models', icon: '🧠', requiredPermission: Permissions.MODEL_VIEW },
    { id: 'deployments', label: 'Deployments', icon: '🚀', requiredPermission: Permissions.DEPLOYMENT_VIEW },
    { id: 'monitoring', label: 'Monitoring', icon: '📡', requiredPermission: Permissions.MONITORING_VIEW },
    { id: 'governance', label: 'Governance', icon: '⚖️', requiredPermission: Permissions.GOVERNANCE_VIEW },
    { id: 'security', label: 'Security', icon: '🛡️', requiredPermission: Permissions.AUDIT_LOG_VIEW },
    { id: 'audit', label: 'Audit Logs', icon: '📋', requiredPermission: Permissions.AUDIT_LOG_VIEW },
    { id: 'billing', label: 'Billing', icon: '💳', requiredPermission: Permissions.BILLING_VIEW },
    { id: 'settings', label: 'Settings', icon: '⚙️', requiredPermission: Permissions.ORGANIZATION_UPDATE },
  ],
  admin: [
    { id: 'dashboard', label: 'Organization Overview', icon: '🏢', requiredPermission: Permissions.ORGANIZATION_VIEW },
    { id: 'members', label: 'Members', icon: '👥', requiredPermission: Permissions.MEMBERS_VIEW },
    { id: 'projects', label: 'Projects', icon: '📁', requiredPermission: Permissions.PROJECT_VIEW },
    { id: 'datasets', label: 'Datasets', icon: '🗄️', requiredPermission: Permissions.DATASET_VIEW },
    { id: 'experiments', label: 'Experiments', icon: '🧪', requiredPermission: Permissions.EXPERIMENT_VIEW },
    { id: 'models', label: 'Models', icon: '🧠', requiredPermission: Permissions.MODEL_VIEW },
    { id: 'deployments', label: 'Deployments', icon: '🚀', requiredPermission: Permissions.DEPLOYMENT_VIEW },
    { id: 'monitoring', label: 'Monitoring', icon: '📡', requiredPermission: Permissions.MONITORING_VIEW },
    { id: 'governance', label: 'Governance', icon: '⚖️', requiredPermission: Permissions.GOVERNANCE_VIEW },
    { id: 'security', label: 'Security', icon: '🛡️', requiredPermission: Permissions.AUDIT_LOG_VIEW },
    { id: 'audit', label: 'Audit Logs', icon: '📋', requiredPermission: Permissions.AUDIT_LOG_VIEW },
    { id: 'billing', label: 'Billing', icon: '💳', requiredPermission: Permissions.BILLING_VIEW },
    { id: 'settings', label: 'Settings', icon: '⚙️', requiredPermission: Permissions.ORGANIZATION_UPDATE },
  ],
  data_scientist: [
    { id: 'dashboard', label: 'Dashboard', icon: '📊', requiredPermission: Permissions.PROJECT_VIEW },
    { id: 'projects', label: 'Projects', icon: '📁', requiredPermission: Permissions.PROJECT_VIEW },
    { id: 'datasets', label: 'Datasets', icon: '🗄️', requiredPermission: Permissions.DATASET_VIEW },
    { id: 'experiments', label: 'Experiments', icon: '🧪', requiredPermission: Permissions.EXPERIMENT_VIEW },
    { id: 'models', label: 'Models', icon: '🧠', requiredPermission: Permissions.MODEL_VIEW },
    { id: 'explainability', label: 'Explainability', icon: '🔍', requiredPermission: Permissions.EXPERIMENT_VIEW },
    { id: 'reports', label: 'Reports', icon: '📄', requiredPermission: Permissions.REPORT_VIEW },
    { id: 'monitoring', label: 'Monitoring', icon: '📡', requiredPermission: Permissions.MONITORING_VIEW },
  ],
  analyst: [
    { id: 'dashboard', label: 'Dashboard', icon: '📊', requiredPermission: Permissions.PROJECT_VIEW },
    { id: 'projects', label: 'Projects', icon: '📁', requiredPermission: Permissions.PROJECT_VIEW },
    { id: 'datasets', label: 'Datasets', icon: '🗄️', requiredPermission: Permissions.DATASET_VIEW },
    { id: 'analysis', label: 'Analysis & Charts', icon: '📈', requiredPermission: Permissions.REPORT_VIEW },
    { id: 'reports', label: 'Reports', icon: '📄', requiredPermission: Permissions.REPORT_VIEW },
  ],
  viewer: [
    { id: 'dashboard', label: 'Dashboard', icon: '📊', requiredPermission: Permissions.PROJECT_VIEW },
    { id: 'projects', label: 'Accessible Projects', icon: '📁', requiredPermission: Permissions.PROJECT_VIEW },
    { id: 'reports', label: 'Approved Reports', icon: '📄', requiredPermission: Permissions.REPORT_VIEW },
    { id: 'monitoring', label: 'Monitoring', icon: '📡', requiredPermission: Permissions.MONITORING_VIEW },
  ],
  security_auditor: [
    { id: 'dashboard', label: 'Dashboard', icon: '📊', requiredPermission: Permissions.AUDIT_LOG_VIEW },
    { id: 'security', label: 'Security', icon: '🛡️', requiredPermission: Permissions.AUDIT_LOG_VIEW },
    { id: 'governance', label: 'Governance', icon: '⚖️', requiredPermission: Permissions.GOVERNANCE_VIEW },
    { id: 'audit', label: 'Audit Logs', icon: '📋', requiredPermission: Permissions.AUDIT_LOG_VIEW },
    { id: 'agents', label: 'Agent Activity', icon: '🤖', requiredPermission: Permissions.AGENT_VIEW },
    { id: 'reports', label: 'Security Reports', icon: '📄', requiredPermission: Permissions.REPORT_VIEW },
  ],
}

/**
 * Returns the list of navigation items for a given role, verified against
 * the user's active permission check function.
 */
export function getAuthorizedNavigation(
  role: RoleType | string,
  hasPermission: (permission: string) => boolean,
): NavItemConfig[] {
  const roleKey = (role in ROLE_NAVIGATION ? role : 'viewer') as RoleType
  const configuredItems = ROLE_NAVIGATION[roleKey] || ROLE_NAVIGATION.viewer

  // Secondary security gate: filter out any nav item if the user lacks the required permission
  return configuredItems.filter((item) => hasPermission(item.requiredPermission))
}
