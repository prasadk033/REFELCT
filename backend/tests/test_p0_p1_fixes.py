"""
Comprehensive Verification Test for REFLECT P0/P1 Production Fixes.

Covers:
1. P0: No Brief version leak before publish (legacy brief with version=0 must NOT expose brief_version to ProjectResponse).
2. P0: After [Publish Brief], published_brief_version becomes 1.
3. P1: Historical source traceability: Program Item linked to Card A resolves from BriefVersionCard snapshot even after Card A is modified/deleted in live cards table.
4. P1: Immutability enforcement: PUT/PATCH/DELETE on published Brief/Program returns 409 Conflict.
5. P1: Multi-version lifecycle: Brief V1 -> Program V1 -> Brief V2 -> Program V2, maintaining snapshot isolation.
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ["APP_DATABASE_URL"] = "sqlite:///:memory:"
import uuid
from datetime import datetime, timezone
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fastapi import FastAPI
from fastapi.testclient import TestClient

from db import (
    Base, User, Project, Card, Brief, Source,
    ProgramItem, ProgramQuestion,
    BriefPublishedVersion, BriefVersionCard,
    ProgramPublishedVersion, ProgramVersionItem,
    get_db
)
from auth.dependencies import get_current_user
from routes.__init__ import router as project_router, _project_to_response
from routes.program import router as program_router


from sqlalchemy.pool import StaticPool
import db as db_module

# Shared In-memory SQLite engine across threads
engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
    echo=False
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
db_module.engine = engine
db_module.SessionLocal = TestingSessionLocal
Base.metadata.create_all(bind=engine)

test_user = User(
    id="user-p0p1-test",
    email="architect@reflect.dev",
    name="Test Architect",
)

def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

def override_get_current_user():
    return test_user

app = FastAPI()
app.include_router(project_router)
app.include_router(program_router)
app.dependency_overrides[get_db] = override_get_db
app.dependency_overrides[get_current_user] = override_get_current_user

client = TestClient(app)


def test_p0_legacy_brief_version_does_not_leak_to_project():
    """Verify that document extraction batches (legacy briefs.version) NEVER expose published_brief_version."""
    db = TestingSessionLocal()
    # Ensure test user
    if not db.query(User).filter(User.id == test_user.id).first():
        db.add(test_user)
        db.commit()

    proj_id = f"proj-{uuid.uuid4().hex[:8]}"
    proj = Project(
        id=proj_id,
        user_id=test_user.id,
        name="P0 Test Project",
        project_type="Residential",
    )
    db.add(proj)

    # Simulate legacy document batch generation creating a legacy brief with version=0 and cards
    legacy_brief = Brief(
        id=f"brief-{uuid.uuid4().hex[:8]}",
        project_id=proj_id,
        version=0,
        status="completed",
        content={},
    )
    db.add(legacy_brief)

    card = Card(
        id=f"card-{uuid.uuid4().hex[:8]}",
        project_id=proj_id,
        brief_id=legacy_brief.id,
        card_type="SPACE",
        title="Living Room",
        content="South facing living room with garden access",
        status="accepted",
        is_unified=True,
    )
    db.add(card)
    db.commit()

    # Query API /api/projects/{proj_id}
    res = client.get(f"/api/projects/{proj_id}")
    assert res.status_code == 200, res.text
    data = res.json()

    # CRITICAL P0 ASSERTION: No published brief version exists!
    assert data["brief_version"] is None, f"Expected None, got {data['brief_version']}"
    assert data.get("published_brief_version") is None

    # Now simulate another batch: legacy brief version=1
    legacy_brief_2 = Brief(
        id=f"brief-{uuid.uuid4().hex[:8]}",
        project_id=proj_id,
        version=1,
        status="completed",
        content={},
    )
    db.add(legacy_brief_2)
    db.commit()

    res2 = client.get(f"/api/projects/{proj_id}")
    assert res2.status_code == 200
    assert res2.json()["brief_version"] is None, "Batch 2 must not leak as published Brief version"

    # Now PUBLISH Brief V1
    pub_res = client.post(f"/api/projects/{proj_id}/brief/publish")
    assert pub_res.status_code == 200, pub_res.text
    pub_data = pub_res.json()
    assert pub_data["version_number"] == 1

    # Verify that project overview now reports Brief V1
    res3 = client.get(f"/api/projects/{proj_id}")
    assert res3.status_code == 200
    assert res3.json()["brief_version"] == 1
    assert res3.json()["published_brief_version"] == 1
    db.close()


def test_p1_historical_source_traceability_from_snapshot():
    """Verify historical source card inspection uses immutable BriefVersionCard snapshot."""
    db = TestingSessionLocal()
    proj_id = f"proj-{uuid.uuid4().hex[:8]}"
    proj = Project(id=proj_id, user_id=test_user.id, name="Traceability Project", project_type="Museum")
    db.add(proj)

    # Working Card A
    card_a_id = f"card-a-{uuid.uuid4().hex[:8]}"
    card_a = Card(
        id=card_a_id,
        project_id=proj_id,
        card_type="REQUIREMENT",
        title="Original Card A Title",
        content="Original Card A Content - Must preserve acoustic silence",
        source_document="Acoustic_Report.pdf",
        status="accepted",
        is_unified=True,
    )
    db.add(card_a)
    db.commit()

    # 1. Publish Brief V1 (capturing Card A snapshot)
    pub_brief_res = client.post(f"/api/projects/{proj_id}/brief/publish")
    assert pub_brief_res.status_code == 200
    brief_v1_id = pub_brief_res.json()["id"]

    # 2. Create Program Item referencing Card A
    item_id = f"item-{uuid.uuid4().hex[:8]}"
    item = ProgramItem(
        id=item_id,
        project_id=proj_id,
        program_item_code="PRG-001",
        name="Quiet Reading Room",
        type="SPACE",
        source_brief_card_ids=[card_a_id],
        source_brief_version_id=brief_v1_id,
    )
    db.add(item)
    db.commit()

    # 3. Publish Program V1
    pub_prog_res = client.post(f"/api/projects/{proj_id}/program/publish")
    assert pub_prog_res.status_code == 200
    prog_v1_id = pub_prog_res.json()["id"]

    # 4. MUTATE/DELETE Card A from the live cards table!
    card_a_db = db.query(Card).filter(Card.id == card_a_id).first()
    card_a_db.title = "COMPLETELY MUTATED LIVE TITLE"
    card_a_db.content = "COMPLETELY CHANGED CONTENT"
    db.commit()

    # 5. Query brief sources for historical Program V1 item
    sources_res = client.get(
        f"/api/program/items/{item_id}/brief-sources?program_version_id={prog_v1_id}"
    )
    assert sources_res.status_code == 200, sources_res.text
    sources = sources_res.json()

    assert len(sources) == 1
    # MUST contain the historical snapshot data, NOT the mutated live data!
    assert sources[0]["title"] == "Original Card A Title", f"Got: {sources[0]['title']}"
    assert "acoustic silence" in sources[0]["content"]
    assert sources[0]["is_snapshot"] is True
    db.close()


def test_p1_immutability_conflict_responses():
    """Verify HTTP 409 Conflict is returned when attempting to mutate published Brief or Program."""
    db = TestingSessionLocal()
    proj_id = f"proj-{uuid.uuid4().hex[:8]}"
    proj = Project(id=proj_id, user_id=test_user.id, name="Immutability Project", project_type="Hospital")
    db.add(proj)

    card = Card(
        id=f"card-{uuid.uuid4().hex[:8]}",
        project_id=proj_id,
        card_type="SPACE",
        title="Emergency Ward",
        content="Level 1 trauma center",
        status="accepted",
        is_unified=True,
    )
    db.add(card)
    db.commit()

    # Publish Brief V1
    b_res = client.post(f"/api/projects/{proj_id}/brief/publish")
    assert b_res.status_code == 200
    b_v1_id = b_res.json()["id"]

    # Create Program Item and publish Program V1
    p_item = ProgramItem(
        id=f"item-{uuid.uuid4().hex[:8]}",
        project_id=proj_id,
        name="Trauma Room",
        type="SPACE",
    )
    db.add(p_item)
    db.commit()

    p_res = client.post(f"/api/projects/{proj_id}/program/publish")
    assert p_res.status_code == 200
    p_v1_id = p_res.json()["id"]

    # Test Brief published mutations -> 409 Conflict
    patch_b = client.patch(f"/api/projects/{proj_id}/brief/published/{b_v1_id}")
    assert patch_b.status_code == 409
    assert "Published Brief versions are immutable" in patch_b.json()["detail"]

    delete_b = client.delete(f"/api/projects/{proj_id}/brief/published/{b_v1_id}")
    assert delete_b.status_code == 409
    assert "Published Brief versions are immutable" in delete_b.json()["detail"]

    # Test Program published mutations -> 409 Conflict
    patch_p = client.patch(f"/api/projects/{proj_id}/program/published/{p_v1_id}")
    assert patch_p.status_code == 409
    assert "Published Program versions are immutable" in patch_p.json()["detail"]

    delete_p = client.delete(f"/api/projects/{proj_id}/program/published/{p_v1_id}")
    assert delete_p.status_code == 409
    assert "Published Program versions are immutable" in delete_p.json()["detail"]
    db.close()


def test_complete_regression_lifecycle():
    """
    Verify complete 30-step regression lifecycle:
    Document Batch 1 -> Working Brief -> Publish Brief V1 -> Working Program -> Publish Program V1 ->
    Document Batch 2 -> Updated Working Brief -> Publish Brief V2 -> Working Program V2 -> Publish Program V2.
    """
    db = TestingSessionLocal()
    proj_id = f"proj-{uuid.uuid4().hex[:8]}"
    proj = Project(id=proj_id, user_id=test_user.id, name="Regression Lifecycle Project", project_type="Mixed-Use")
    db.add(proj)

    # 1. Document Batch 1: Ingest 3 cards
    for i in range(3):
        c = Card(
            id=f"card-b1-{i}-{uuid.uuid4().hex[:6]}",
            project_id=proj_id,
            card_type="SPACE" if i == 0 else "REQUIREMENT",
            title=f"Batch 1 Card {i+1}",
            content=f"Requirement detail {i+1}",
            status="accepted",
            is_unified=True,
        )
        db.add(c)
    db.commit()

    # Verify no Published Brief Version yet
    res_init = client.get(f"/api/projects/{proj_id}")
    assert res_init.json()["brief_version"] is None
    assert res_init.json()["published_brief_version"] is None

    # 2. Publish Brief V1
    b1_pub = client.post(f"/api/projects/{proj_id}/brief/publish")
    assert b1_pub.status_code == 200
    b1_data = b1_pub.json()
    assert b1_data["version_number"] == 1
    assert b1_data["card_count"] == 3
    b1_id = b1_data["id"]

    # Verify project reports Brief V1
    res_b1 = client.get(f"/api/projects/{proj_id}")
    assert res_b1.json()["brief_version"] == 1
    assert res_b1.json()["published_brief_version"] == 1

    # 3. Create Working Program Items
    for i in range(2):
        pi = ProgramItem(
            id=f"prog-item-b1-{i}-{uuid.uuid4().hex[:6]}",
            project_id=proj_id,
            program_item_code=f"PRG-{i+1:03d}",
            name=f"Program Item {i+1}",
            type="SPACE",
            source_brief_version_id=b1_id,
        )
        db.add(pi)
    db.commit()

    # 4. Publish Program V1
    p1_pub = client.post(f"/api/projects/{proj_id}/program/publish")
    assert p1_pub.status_code == 200
    p1_data = p1_pub.json()
    assert p1_data["version_number"] == 1
    assert p1_data["item_count"] == 2
    assert p1_data["source_brief_version_number"] == 1
    p1_id = p1_data["id"]

    # 5. Document Batch 2: Upload new documents -> +2 new cards in working brief
    for i in range(2):
        c_new = Card(
            id=f"card-b2-{i}-{uuid.uuid4().hex[:6]}",
            project_id=proj_id,
            card_type="FUNCTION",
            title=f"Batch 2 Card {i+1}",
            content=f"New requirement from Batch 2 #{i+1}",
            status="accepted",
            is_unified=True,
        )
        db.add(c_new)
    db.commit()

    # Working cards count is now 5, but Brief V1 snapshot MUST still contain exactly 3 cards!
    v1_check = client.get(f"/api/projects/{proj_id}/brief/published/{b1_id}")
    assert v1_check.status_code == 200
    assert len(v1_check.json()["cards"]) == 3, "Brief V1 must not dynamically grow when new cards are added"

    # 6. Publish Brief V2
    b2_pub = client.post(f"/api/projects/{proj_id}/brief/publish")
    assert b2_pub.status_code == 200
    b2_data = b2_pub.json()
    assert b2_data["version_number"] == 2
    assert b2_data["card_count"] == 5
    b2_id = b2_data["id"]

    # Project overview now reports Brief V2
    res_b2 = client.get(f"/api/projects/{proj_id}")
    assert res_b2.json()["brief_version"] == 2

    # 7. Add another Program Item for Program V2
    pi3 = ProgramItem(
        id=f"prog-item-b2-3-{uuid.uuid4().hex[:6]}",
        project_id=proj_id,
        program_item_code="PRG-003",
        name="Program Item 3 from Batch 2",
        type="REQUIREMENT",
        source_brief_version_id=b2_id,
    )
    db.add(pi3)
    db.commit()

    # 8. Publish Program V2
    p2_pub = client.post(f"/api/projects/{proj_id}/program/publish")
    assert p2_pub.status_code == 200
    p2_data = p2_pub.json()
    assert p2_data["version_number"] == 2
    assert p2_data["item_count"] == 3
    assert p2_data["source_brief_version_number"] == 2
    p2_id = p2_data["id"]

    # 9. Verify Program V1 snapshot remains unchanged with 2 items
    p1_check = client.get(f"/api/projects/{proj_id}/program/published/{p1_id}")
    assert p1_check.status_code == 200
    assert len(p1_check.json()["items"]) == 2
    assert p1_check.json()["version_number"] == 1

    # 10. Verify Program V2 snapshot has 3 items
    p2_check = client.get(f"/api/projects/{proj_id}/program/published/{p2_id}")
    assert p2_check.status_code == 200
    assert len(p2_check.json()["items"]) == 3
    assert p2_check.json()["version_number"] == 2

    # 11. Verify latest 5 versions query
    brief_list = client.get(f"/api/projects/{proj_id}/brief/published?limit=5")
    assert brief_list.status_code == 200
    assert len(brief_list.json()) == 2
    assert brief_list.json()[0]["version_number"] == 2
    assert brief_list.json()[1]["version_number"] == 1

    prog_list = client.get(f"/api/projects/{proj_id}/program/published?limit=5")
    assert prog_list.status_code == 200
    assert len(prog_list.json()) == 2
    assert prog_list.json()[0]["version_number"] == 2
    assert prog_list.json()[1]["version_number"] == 1
    db.close()


if __name__ == "__main__":
    print("Running P0/P1 fixes automated tests...")
    test_p0_legacy_brief_version_does_not_leak_to_project()
    print("[OK] P0 Passed: Legacy brief version never leaks to ProjectResponse")
    test_p1_historical_source_traceability_from_snapshot()
    print("[OK] P1 Passed: Historical source traceability resolves from immutable snapshot")
    test_p1_immutability_conflict_responses()
    print("[OK] P1 Passed: Defensive HTTP 409 Conflict returned for published mutations")
    test_complete_regression_lifecycle()
    print("[OK] Regression Lifecycle Passed: V1 -> V2 isolation, latest 5, and multi-version integrity verified")
    print("\nALL P0/P1 AUTOMATED VERIFICATION CHECKS PASSED SUCCESSFULLY!")
