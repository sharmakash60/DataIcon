import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api, clearStoredAuth, getStoredActiveOrgId, getStoredToken, setStoredActiveOrgId } from './api'
import type { OrganizationMembership, User } from './types'

type AuthContextType = {
  user: User | null
  organizations: OrganizationMembership[]
  activeOrg: OrganizationMembership | null
  setActiveOrgId: (orgId: string) => void
  loading: boolean
  login: (email: string, pass: string) => Promise<void>
  register: (email: string, pass: string, name: string, orgName: string) => Promise<void>
  logout: () => Promise<void>
  permissions: string[]
  hasPermission: (permission: string) => boolean
  hasAnyPermission: (permissions: string[]) => boolean
  hasAllPermissions: (permissions: string[]) => boolean
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [organizations, setOrganizations] = useState<OrganizationMembership[]>([])
  const [activeOrgId, setActiveOrgIdState] = useState<string | null>(getStoredActiveOrgId())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function initSession() {
      const token = getStoredToken()
      if (!token) {
        setLoading(false)
        return
      }
      try {
        const me = await api.getMe()
        setUser(me.user)
        setOrganizations(me.organizations)
        if (me.organizations.length > 0) {
          const stored = getStoredActiveOrgId()
          const exists = me.organizations.some((o) => o.organization_id === stored)
          if (!stored || !exists) {
            setActiveOrgIdState(me.organizations[0].organization_id)
            setStoredActiveOrgId(me.organizations[0].organization_id)
          }
        }
      } catch {
        clearStoredAuth()
        setUser(null)
        setOrganizations([])
      } finally {
        setLoading(false)
      }
    }
    initSession()

    const handleUnauthorized = () => {
      clearStoredAuth()
      setUser(null)
      setOrganizations([])
      setActiveOrgIdState(null)
    }
    window.addEventListener('auth:unauthorized', handleUnauthorized)
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized)
  }, [])

  const setActiveOrgId = (id: string) => {
    setActiveOrgIdState(id)
    setStoredActiveOrgId(id)
  }

  const login = async (email: string, pass: string) => {
    const res = await api.login(email, pass)
    setUser(res.user)
    setOrganizations(res.organizations)
    if (res.organizations.length > 0) {
      setActiveOrgId(res.organizations[0].organization_id)
    }
  }

  const register = async (email: string, pass: string, name: string, orgName: string) => {
    const res = await api.register(email, pass, name, orgName)
    setUser(res.user)
    setOrganizations(res.organizations)
    if (res.organizations.length > 0) {
      setActiveOrgId(res.organizations[0].organization_id)
    }
  }

  const logout = async () => {
    await api.logout()
    setUser(null)
    setOrganizations([])
    setActiveOrgIdState(null)
  }

  const activeOrg = organizations.find((o) => o.organization_id === activeOrgId) || organizations[0] || null

  const permissions = useMemo(() => activeOrg?.permissions || [], [activeOrg])

  const hasPermission = useCallback(
    (permission: string) => permissions.includes(permission),
    [permissions],
  )

  const hasAnyPermission = useCallback(
    (perms: string[]) => perms.some((p) => permissions.includes(p)),
    [permissions],
  )

  const hasAllPermissions = useCallback(
    (perms: string[]) => perms.every((p) => permissions.includes(p)),
    [permissions],
  )

  return (
    <AuthContext.Provider
      value={{
        user,
        organizations,
        activeOrg,
        setActiveOrgId,
        loading,
        login,
        register,
        logout,
        permissions,
        hasPermission,
        hasAnyPermission,
        hasAllPermissions,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
