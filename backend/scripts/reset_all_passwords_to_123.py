import os
import sys
from pathlib import Path

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(backend_dir))

from app.config import Settings
from app.db import build_engine
from app.enums import MembershipStatus, OrgStatus, Role, UserStatus
from app.models import Membership, Organization, User
from app.security.passwords import hash_password, verify_password
from redis import Redis
from sqlalchemy.orm import Session


def main():
    settings = Settings()
    engine = build_engine(settings)
    common_password = "123"
    hashed_123 = hash_password(common_password)

    print(f"Generated bcrypt hash for '{common_password}': {hashed_123}")
    assert verify_password(common_password, hashed_123), "Bcrypt verification check failed"

    with Session(engine) as session:
        # 1. Update ALL existing users in the database to password '123'
        users = session.query(User).all()
        print(f"Found {len(users)} existing users in database. Setting all passwords to '123'...")
        for u in users:
            u.hashed_password = hashed_123
            u.status = UserStatus.ACTIVE.value

        session.flush()

        # 2. Find or create default demo organization "DataPilot Demo Org"
        demo_org = session.query(Organization).filter(Organization.name == "DataPilot Demo Org").first()
        if not demo_org:
            demo_org = Organization(name="DataPilot Demo Org", status=OrgStatus.ACTIVE.value)
            session.add(demo_org)
            session.flush()

        # 3. Ensure all standard test and demo accounts exist with active membership and password '123'
        accounts_to_ensure = [
            # Datapilot.dev accounts
            ("owner@datapilot.dev", "Platform Owner", Role.OWNER.value),
            ("admin@datapilot.dev", "Security Admin", Role.ADMIN.value),
            ("datascientist@datapilot.dev", "Lead Data Scientist", Role.DATA_SCIENTIST.value),
            ("analyst@datapilot.dev", "Business Analyst", Role.ANALYST.value),
            ("viewer@datapilot.dev", "Executive Viewer", Role.VIEWER.value),
            ("auditor@datapilot.dev", "Compliance Auditor", Role.SECURITY_AUDITOR.value),
            # Acme.org demo accounts (referenced in frontend login chips & placeholders)
            ("scientist@acme.org", "Lead Data Scientist", Role.DATA_SCIENTIST.value),
            ("admin@acme.org", "Security Admin", Role.ADMIN.value),
            ("auditor@acme.org", "Compliance Auditor", Role.SECURITY_AUDITOR.value),
            ("owner@acme.org", "Platform Owner", Role.OWNER.value),
            ("analyst@acme.org", "Business Analyst", Role.ANALYST.value),
            ("viewer@acme.org", "Executive Viewer", Role.VIEWER.value),
        ]

        for email, display_name, role in accounts_to_ensure:
            user = session.query(User).filter(User.email == email).first()
            if not user:
                user = User(
                    email=email,
                    hashed_password=hashed_123,
                    display_name=display_name,
                    status=UserStatus.ACTIVE.value,
                )
                session.add(user)
                session.flush()
                print(f"Created user: {email}")
            else:
                user.hashed_password = hashed_123
                user.status = UserStatus.ACTIVE.value
                print(f"Updated user: {email}")

            # Check membership in demo_org
            membership = (
                session.query(Membership)
                .filter(
                    Membership.user_id == user.id,
                    Membership.organization_id == demo_org.id,
                )
                .first()
            )
            if not membership:
                membership = Membership(
                    organization_id=demo_org.id,
                    user_id=user.id,
                    role=role,
                    status=MembershipStatus.ACTIVE.value,
                )
                session.add(membership)
                print(f"Added membership: {email} -> {role} in {demo_org.name}")
            else:
                membership.status = MembershipStatus.ACTIVE.value
                membership.role = role

        session.commit()
        print("Successfully committed password updates and demo accounts!")

    # 4. Clear any Redis throttling / failed login lockouts
    try:
        cache = Redis.from_url(str(settings.redis_url), socket_connect_timeout=2)
        keys = cache.keys("datapilot:login_attempts:*")
        if keys:
            cache.delete(*keys)
            print(f"Cleared {len(keys)} login attempt locks from Redis.")
        else:
            print("No login attempt locks found in Redis.")
        cache.close()
    except Exception as e:
        print(f"Redis cache notice: {e}")

    # 5. Verify testing login directly
    with Session(engine) as session:
        test_emails = ["scientist@acme.org", "admin@acme.org", "datascientist@datapilot.dev", "admin@datapilot.dev"]
        for email in test_emails:
            u = session.query(User).filter(User.email == email).first()
            if u and verify_password("123", u.hashed_password):
                print(f"Verified login check PASSED for {email} with password '123'")
            else:
                print(f"WARNING: Verification FAILED for {email}")

    engine.dispose()
    print("ALL DONE! Common password for all users is now 123.")


if __name__ == "__main__":
    main()
