from enum import StrEnum


class UserStatus(StrEnum):
    ACTIVE = "active"
    SUSPENDED = "suspended"


class OrgStatus(StrEnum):
    ACTIVE = "active"
    SUSPENDED = "suspended"


class Role(StrEnum):
    OWNER = "owner"
    ADMIN = "admin"
    DATA_SCIENTIST = "data_scientist"
    ANALYST = "analyst"
    VIEWER = "viewer"
    SECURITY_AUDITOR = "security_auditor"


class MembershipStatus(StrEnum):
    ACTIVE = "active"
    INACTIVE = "inactive"


class ProjectClassification(StrEnum):
    INTERNAL = "internal"
    CONFIDENTIAL = "confidential"
    RESTRICTED = "restricted"


class ProjectStatus(StrEnum):
    ACTIVE = "active"
    ARCHIVED = "archived"


class AuditResult(StrEnum):
    SUCCESS = "success"
    DENIED = "denied"
    FAILED = "failed"
