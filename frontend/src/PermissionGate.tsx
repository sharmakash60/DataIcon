import React from 'react'
import { useAuth } from './AuthContext'

interface PermissionGateProps {
  permission?: string
  anyPermissions?: string[]
  allPermissions?: string[]
  children: React.ReactNode
  fallback?: React.ReactNode
}

/**
 * Declarative component for centralized, action-level UI permission gating.
 *
 * Checks against the server-issued permission list stored in AuthContext.
 * Ensures that components, buttons, and views are conditionally rendered
 * strictly according to granted permissions without hardcoding role strings.
 */
export const PermissionGate: React.FC<PermissionGateProps> = ({
  permission,
  anyPermissions,
  allPermissions,
  children,
  fallback = null,
}) => {
  const { hasPermission, hasAnyPermission, hasAllPermissions } = useAuth()

  let allowed = true

  if (permission && !hasPermission(permission)) {
    allowed = false
  }

  if (anyPermissions && anyPermissions.length > 0 && !hasAnyPermission(anyPermissions)) {
    allowed = false
  }

  if (allPermissions && allPermissions.length > 0 && !hasAllPermissions(allPermissions)) {
    allowed = false
  }

  if (!allowed) {
    return <>{fallback}</>
  }

  return <>{children}</>
}

export default PermissionGate
