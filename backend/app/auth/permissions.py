"""
Centralized Permission System & Role-Permission Matrix for DataPilot.

Defines granular permission strings and explicit mappings for the 6 canonical roles:
  - OWNER
  - ADMIN
  - DATA_SCIENTIST
  - ANALYST
  - VIEWER
  - SECURITY_AUDITOR
"""

from enum import Enum
from app.enums import Role


class Permissions:
    # Organization
    ORGANIZATION_VIEW = "ORGANIZATION_VIEW"
    ORGANIZATION_UPDATE = "ORGANIZATION_UPDATE"
    ORGANIZATION_DELETE = "ORGANIZATION_DELETE"

    # Members & Roles
    MEMBERS_VIEW = "MEMBERS_VIEW"
    MEMBERS_INVITE = "MEMBERS_INVITE"
    MEMBERS_UPDATE = "MEMBERS_UPDATE"
    MEMBERS_REMOVE = "MEMBERS_REMOVE"
    ROLES_VIEW = "ROLES_VIEW"
    ROLES_MANAGE = "ROLES_MANAGE"

    # Projects
    PROJECT_VIEW = "PROJECT_VIEW"
    PROJECT_CREATE = "PROJECT_CREATE"
    PROJECT_UPDATE = "PROJECT_UPDATE"
    PROJECT_DELETE = "PROJECT_DELETE"

    # Datasets
    DATASET_VIEW = "DATASET_VIEW"
    DATASET_CONNECT = "DATASET_CONNECT"
    DATASET_PROFILE = "DATASET_PROFILE"
    DATASET_DELETE = "DATASET_DELETE"
    DATASET_EXPORT = "DATASET_EXPORT"

    # Experiments
    EXPERIMENT_VIEW = "EXPERIMENT_VIEW"
    EXPERIMENT_CREATE = "EXPERIMENT_CREATE"
    EXPERIMENT_RUN = "EXPERIMENT_RUN"
    EXPERIMENT_CANCEL = "EXPERIMENT_CANCEL"
    EXPERIMENT_DELETE = "EXPERIMENT_DELETE"

    # Models
    MODEL_VIEW = "MODEL_VIEW"
    MODEL_CREATE = "MODEL_CREATE"
    MODEL_APPROVE = "MODEL_APPROVE"
    MODEL_DEPLOY = "MODEL_DEPLOY"
    MODEL_DELETE = "MODEL_DELETE"

    # Reports
    REPORT_VIEW = "REPORT_VIEW"
    REPORT_CREATE = "REPORT_CREATE"
    REPORT_EXPORT = "REPORT_EXPORT"
    REPORT_DELETE = "REPORT_DELETE"

    # Deployments
    DEPLOYMENT_VIEW = "DEPLOYMENT_VIEW"
    DEPLOYMENT_CREATE = "DEPLOYMENT_CREATE"
    DEPLOYMENT_UPDATE = "DEPLOYMENT_UPDATE"
    DEPLOYMENT_DELETE = "DEPLOYMENT_DELETE"

    # Monitoring
    MONITORING_VIEW = "MONITORING_VIEW"
    MONITORING_CONFIGURE = "MONITORING_CONFIGURE"

    # Governance & Security
    GOVERNANCE_VIEW = "GOVERNANCE_VIEW"
    GOVERNANCE_MANAGE = "GOVERNANCE_MANAGE"
    AUDIT_LOG_VIEW = "AUDIT_LOG_VIEW"
    SECURITY_SETTINGS_MANAGE = "SECURITY_SETTINGS_MANAGE"

    # Billing
    BILLING_VIEW = "BILLING_VIEW"
    BILLING_MANAGE = "BILLING_MANAGE"

    # Agents
    AGENT_VIEW = "AGENT_VIEW"
    AGENT_REGISTER = "AGENT_REGISTER"
    AGENT_MANAGE = "AGENT_MANAGE"


# Full set of all system permissions
ALL_PERMISSIONS: set[str] = {
    v for k, v in Permissions.__dict__.items() if isinstance(v, str) and not k.startswith("_")
}

# Role to Permission mapping
ROLE_PERMISSIONS: dict[str, set[str]] = {
    # OWNER: Full organization access, can perform all operations, manage billing and delete org.
    Role.OWNER.value: set(ALL_PERMISSIONS),

    # ADMIN: Organization management, user administration, project management.
    # Cannot delete organization, manage billing, or manage security master settings without owner privilege.
    Role.ADMIN.value: {
        Permissions.ORGANIZATION_VIEW,
        Permissions.ORGANIZATION_UPDATE,
        Permissions.MEMBERS_VIEW,
        Permissions.MEMBERS_INVITE,
        Permissions.MEMBERS_UPDATE,
        Permissions.MEMBERS_REMOVE,
        Permissions.ROLES_VIEW,
        Permissions.PROJECT_VIEW,
        Permissions.PROJECT_CREATE,
        Permissions.PROJECT_UPDATE,
        Permissions.PROJECT_DELETE,
        Permissions.DATASET_VIEW,
        Permissions.DATASET_CONNECT,
        Permissions.DATASET_PROFILE,
        Permissions.DATASET_DELETE,
        Permissions.DATASET_EXPORT,
        Permissions.EXPERIMENT_VIEW,
        Permissions.EXPERIMENT_CANCEL,
        Permissions.EXPERIMENT_DELETE,
        Permissions.MODEL_VIEW,
        Permissions.MODEL_APPROVE,
        Permissions.MODEL_DEPLOY,
        Permissions.MODEL_DELETE,
        Permissions.REPORT_VIEW,
        Permissions.REPORT_CREATE,
        Permissions.REPORT_EXPORT,
        Permissions.REPORT_DELETE,
        Permissions.DEPLOYMENT_VIEW,
        Permissions.DEPLOYMENT_CREATE,
        Permissions.DEPLOYMENT_UPDATE,
        Permissions.DEPLOYMENT_DELETE,
        Permissions.MONITORING_VIEW,
        Permissions.MONITORING_CONFIGURE,
        Permissions.GOVERNANCE_VIEW,
        Permissions.GOVERNANCE_MANAGE,
        Permissions.AUDIT_LOG_VIEW,
        Permissions.BILLING_VIEW,
        Permissions.AGENT_VIEW,
        Permissions.AGENT_REGISTER,
        Permissions.AGENT_MANAGE,
    },

    # DATA_SCIENTIST: Primary ML/AI practitioner.
    # Can create experiments, train models, profile datasets, generate reports, propose deployments (create as pending).
    # Cannot approve models for production (SoD), deploy to live endpoints directly, manage org members/roles/billing.
    Role.DATA_SCIENTIST.value: {
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
        Permissions.EXPERIMENT_CANCEL,
        Permissions.MODEL_VIEW,
        Permissions.MODEL_CREATE,
        Permissions.REPORT_VIEW,
        Permissions.REPORT_CREATE,
        Permissions.REPORT_EXPORT,
        Permissions.DEPLOYMENT_VIEW,
        Permissions.DEPLOYMENT_CREATE,  # Propose deployment (enters pending_approval)
        Permissions.MONITORING_VIEW,
        Permissions.AGENT_VIEW,
    },

    # ANALYST: Analysis and report generation.
    # Can view datasets, export analysis data, view experiments & models, create reports.
    # Cannot train models, approve, deploy, manage members or modify system configuration.
    Role.ANALYST.value: {
        Permissions.ORGANIZATION_VIEW,
        Permissions.PROJECT_VIEW,
        Permissions.DATASET_VIEW,
        Permissions.DATASET_PROFILE,
        Permissions.DATASET_EXPORT,
        Permissions.EXPERIMENT_VIEW,
        Permissions.MODEL_VIEW,
        Permissions.REPORT_VIEW,
        Permissions.REPORT_CREATE,
        Permissions.REPORT_EXPORT,
        Permissions.DEPLOYMENT_VIEW,
        Permissions.MONITORING_VIEW,
    },

    # VIEWER: Truly Read-Only.
    # Can only inspect assigned projects, datasets metadata, experiments, models, reports, and monitoring dashboards.
    # Cannot create, update, delete, train, approve, or deploy anything.
    Role.VIEWER.value: {
        Permissions.ORGANIZATION_VIEW,
        Permissions.PROJECT_VIEW,
        Permissions.DATASET_VIEW,
        Permissions.EXPERIMENT_VIEW,
        Permissions.MODEL_VIEW,
        Permissions.REPORT_VIEW,
        Permissions.DEPLOYMENT_VIEW,
        Permissions.MONITORING_VIEW,
    },

    # SECURITY_AUDITOR: Read-only governance & audit specialist.
    # Can view audit logs, access logs, agents, governance policies, compliance information, and generate security reports.
    # Cannot modify ML models, experiments, datasets, or user memberships.
    Role.SECURITY_AUDITOR.value: {
        Permissions.ORGANIZATION_VIEW,
        Permissions.MEMBERS_VIEW,
        Permissions.ROLES_VIEW,
        Permissions.PROJECT_VIEW,
        Permissions.DATASET_VIEW,
        Permissions.DEPLOYMENT_VIEW,
        Permissions.MONITORING_VIEW,
        Permissions.GOVERNANCE_VIEW,
        Permissions.AUDIT_LOG_VIEW,
        Permissions.REPORT_VIEW,
        Permissions.REPORT_CREATE,
        Permissions.REPORT_EXPORT,
        Permissions.AGENT_VIEW,
    },
}


def get_permissions_for_role(role: str) -> set[str]:
    """Retrieve the set of granted permissions for an organization role."""
    return ROLE_PERMISSIONS.get(role, set())
