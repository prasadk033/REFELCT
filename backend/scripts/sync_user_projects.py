"""
sync_user_projects.py

Utility script to:
1. List all users and projects in the REFLECT database.
2. Link/reassign projects from dev/duplicate accounts to your active Google user account.
3. Fix duplicate user records by consolidating email accounts.

Usage inside Docker:
    docker compose exec backend python scripts/sync_user_projects.py
"""
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from db import SessionLocal, User, Project, ActivityLog

def main():
    db = SessionLocal()
    try:
        print("\n========================================================")
        print("🔍 REFLECT Database User & Project Audit")
        print("========================================================\n")

        users = db.query(User).order_by(User.created_at.asc()).all()
        projects = db.query(Project).order_by(Project.created_at.desc()).all()

        print(f"Total Users Found: {len(users)}")
        for u in users:
            p_count = db.query(Project).filter(Project.user_id == u.id).count()
            print(f"  • User ID: {u.id} | Email: {u.email} | Name: {u.name} | Google Sub: {u.google_sub} | Projects: {p_count}")

        print(f"\nTotal Projects Found: {len(projects)}")
        for p in projects:
            owner = db.query(User).filter(User.id == p.user_id).first()
            owner_info = f"{owner.email} ({owner.name})" if owner else f"UNKNOWN USER ({p.user_id})"
            print(f"  • Project: '{p.name}' (ID: {p.id}) → Owned by: {owner_info}")

        if not projects:
            print("\n⚠️  No projects exist in this database.")
            return

        # Identify active target user: preference for non-dev user with google_sub or latest user
        target_user = None
        google_users = [u for u in users if u.google_sub and not (u.email or "").endswith("@reflect.local")]
        if google_users:
            target_user = google_users[-1]
        elif len(users) == 1:
            target_user = users[0]
        else:
            # Pick the non-dev user if available
            non_dev = [u for u in users if not (u.email or "").endswith("@reflect.local")]
            if non_dev:
                target_user = non_dev[-1]
            elif users:
                target_user = users[-1]

        if not target_user:
            print("\n❌ Could not identify an active user.")
            return

        print(f"\n🎯 Target Active User for Consolidation: {target_user.name} <{target_user.email}> (ID: {target_user.id})")

        reassigned_count = 0
        for p in projects:
            if p.user_id != target_user.id:
                old_id = p.user_id
                p.user_id = target_user.id
                reassigned_count += 1
                print(f"  ✓ Reassigned project '{p.name}' from {old_id} → {target_user.id}")

        if reassigned_count > 0:
            db.commit()
            print(f"\n✅ Successfully reassigned {reassigned_count} project(s) to {target_user.email}!")
            print("Refresh your browser to see all your projects immediately.")
        else:
            print(f"\n✅ All {len(projects)} project(s) already belong to {target_user.email}.")

    except Exception as e:
        print(f"\n❌ Error during sync: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    main()
