"""
Automated Integration and Regression Test Suite for REFLECT
Brief and Program Workflow Update.

Validates:
1. Card acceptance and rejection in Brief workspace.
2. Rejection cleanup during Publish Brief:
   - Rejected cards permanently deleted from active workspace.
   - Accepted and pending cards preserved in active workspace.
   - Published Brief snapshot contains ONLY accepted cards.
   - Immutable snapshot enforcement (HTTP 409 on mutation attempts).
   - Atomic version numbering (V1, V2...).
   - Repeated publishing rejection when no new accepted changes exist (HTTP 409).
   - Validation when 0 accepted cards exist (HTTP 400).
3. Rejection cleanup during Generate Program:
   - Rejected cards permanently deleted before generation starts.
4. Program generation without publishing Brief first:
   - Does NOT require a published Brief version.
   - Gathers active cards (accepted + pending), sources, and project context.
   - Generated draft is persisted to working program dataset (not auto-published).
5. Program publishing:
   - Creates immutable snapshot in ProgramPublishedVersion & ProgramVersionItem.
   - Enforces immutability (HTTP 409).
   - Does not require a second generation action after publishing.
   - Preserves previous Program versions.
6. Independent version histories between Brief and Program.
"""
import sys
import os
import uuid
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ["APP_DATABASE_URL"] = "sqlite:///:memory:"

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi import FastAPI
from fastapi.testclient import TestClient

from db import (
    Base, User, Project, Card, Brief, Source,
    ProgramItem, ProgramQuestion,
    BriefPublishedVersion, BriefVersionCard,
    ProgramPublishedVersion, ProgramVersionItem,
    get_db
)
import db as db_module
from auth.dependencies import get_current_user
from routes.__init__ import router as project_router
from routes.cards import router as cards_router, cleanup_rejected_cards
from routes.program import router as program_router
from routes.briefs import router as briefs_router

MOCK_USER_ID = "test-user-001"

# Setup isolated in-memory SQLite database
test_engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
    echo=False
)
TestingSessionLocal = sessionmaker(bind=test_engine, autocommit=False, autoflush=False, expire_on_commit=False)
db_module.engine = test_engine
db_module.SessionLocal = TestingSessionLocal

app = FastAPI()

def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

def override_get_current_user():
    db = TestingSessionLocal()
    try:
        u = db.query(User).filter(User.id == MOCK_USER_ID).first()
        if not u:
            u = User(
                id=MOCK_USER_ID,
                email="architect@example.com",
                name="Test Architect",
                is_admin=False,
            )
            db.add(u)
            db.commit()
        return u
    finally:
        db.close()

app.dependency_overrides[get_db] = override_get_db
app.dependency_overrides[get_current_user] = override_get_current_user

app.include_router(project_router)
app.include_router(cards_router)
app.include_router(program_router)
app.include_router(briefs_router)

client = TestClient(app)


def setup_function():
    """Reset test database schema before every test."""
    Base.metadata.drop_all(bind=test_engine)
    Base.metadata.create_all(bind=test_engine)

    db = TestingSessionLocal()
    u = User(
        id=MOCK_USER_ID,
        email="architect@example.com",
        name="Test Architect",
        is_admin=False,
    )
    db.add(u)
    db.commit()
    db.close()


def _create_test_project(db, project_id="proj-101"):
    proj = Project(
        id=project_id,
        user_id=MOCK_USER_ID,
        name="Villa Azure",
        project_type="Residential",
        location="Malibu, CA",
        client="Azure Family Trust",
        description="Luxury coastal residence",
    )
    db.add(proj)
    db.commit()
    return proj


# ── Brief Tests ───────────────────────────────────────────────────────────────

def test_card_accept_and_reject():
    """Test accepting and rejecting cards."""
    db = TestingSessionLocal()
    proj = _create_test_project(db)

    c1 = Card(
        id="card-1",
        project_id=proj.id,
        card_type="REQUIREMENT",
        title="Primary Bedroom with Ocean View",
        content="Master suite must face the Pacific Ocean with private deck.",
        status="provisional",
    )
    c2 = Card(
        id="card-2",
        project_id=proj.id,
        card_type="FACT",
        title="Subterranean Garage",
        content="Client desires underground parking for 4 vehicles.",
        status="provisional",
    )
    db.add_all([c1, c2])
    db.commit()
    db.close()

    # Accept card 1
    resp1 = client.post(f"/api/cards/card-1/accept")
    assert resp1.status_code == 200
    assert resp1.json()["status"] == "accepted"

    # Reject card 2
    resp2 = client.post(f"/api/cards/card-2/reject")
    assert resp2.status_code == 200
    assert resp2.json()["status"] == "rejected"


def test_publish_brief_workflow_cleanup_and_immutability():
    """
    Test Publish Brief:
    - 30 initial cards (15 accepted, 5 pending/provisional, 10 rejected).
    - On Publish Brief:
      * 10 rejected cards permanently removed from active workspace.
      * 20 cards remain in active workspace (15 accepted + 5 pending).
      * Brief V1 snapshot contains ONLY the 15 accepted cards.
      * Brief V1 is immutable (HTTP 409).
    """
    db = TestingSessionLocal()
    proj = _create_test_project(db)

    # Create 15 accepted, 5 pending, 10 rejected
    cards = []
    for i in range(1, 16):
        cards.append(Card(
            id=f"card-acc-{i}",
            project_id=proj.id,
            card_type="REQUIREMENT",
            title=f"Accepted Requirement {i}",
            content=f"Specification {i} approved by client.",
            status="accepted",
            is_unified=True,
        ))
    for i in range(1, 6):
        cards.append(Card(
            id=f"card-pen-{i}",
            project_id=proj.id,
            card_type="QUESTION",
            title=f"Pending Question {i}",
            content=f"Clarification needed on item {i}.",
            status="provisional",
            is_unified=False,
        ))
    for i in range(1, 11):
        cards.append(Card(
            id=f"card-rej-{i}",
            project_id=proj.id,
            card_type="OTHER",
            title=f"Rejected Note {i}",
            content=f"Irrelevant note {i} rejected by architect.",
            status="rejected",
            is_unified=False,
        ))
    db.add_all(cards)
    db.commit()

    initial_total = db.query(Card).filter(Card.project_id == proj.id).count()
    assert initial_total == 30
    db.close()

    # Publish Brief
    pub_resp = client.post(f"/api/projects/{proj.id}/brief/publish")
    assert pub_resp.status_code == 200
    pub_data = pub_resp.json()

    assert pub_data["version_number"] == 1
    assert pub_data["card_count"] == 15
    assert pub_data["cleaned_rejected_count"] == 10
    assert pub_data["remaining_active_count"] == 20

    # Verify active workspace in database
    db = TestingSessionLocal()
    remaining_cards = db.query(Card).filter(Card.project_id == proj.id).all()
    assert len(remaining_cards) == 20

    remaining_statuses = [c.status for c in remaining_cards]
    assert remaining_statuses.count("accepted") == 15
    assert remaining_statuses.count("provisional") == 5
    assert remaining_statuses.count("rejected") == 0

    # Verify published snapshot
    v1 = db.query(BriefPublishedVersion).filter(
        BriefPublishedVersion.project_id == proj.id,
        BriefPublishedVersion.version_number == 1
    ).first()
    assert v1 is not None
    assert v1.card_count == 15
    assert len(v1.snapshot_cards) == 15
    for sc in v1.snapshot_cards:
        assert sc.snapshot_data["status"] == "accepted"
    db.close()

    # Verify Immutability: PUT/PATCH/DELETE on published version returns HTTP 409
    patch_resp = client.patch(f"/api/projects/{proj.id}/brief/published/{v1.id}", json={"version_number": 99})
    assert patch_resp.status_code == 409

    del_resp = client.delete(f"/api/projects/{proj.id}/brief/published/{v1.id}")
    assert del_resp.status_code == 409

    # Verify Repeated Publish with no new accepted changes returns HTTP 409
    repeat_resp = client.post(f"/api/projects/{proj.id}/brief/publish")
    assert repeat_resp.status_code == 409


def test_publish_brief_fails_when_zero_accepted_cards():
    """Publish Brief must return HTTP 400 if there are zero accepted cards."""
    db = TestingSessionLocal()
    proj = _create_test_project(db)
    # Only provisional cards
    c = Card(
        id="c-prov",
        project_id=proj.id,
        card_type="REQUIREMENT",
        title="Unreviewed card",
        content="Needs architect review.",
        status="provisional",
    )
    db.add(c)
    db.commit()
    db.close()

    resp = client.post(f"/api/projects/{proj.id}/brief/publish")
    assert resp.status_code == 400
    assert "No accepted Brief Cards to publish" in resp.json()["detail"]


# ── Program Tests ─────────────────────────────────────────────────────────────

def test_generate_program_cleans_rejected_cards_and_works_without_published_brief():
    """
    Test Generate Program:
    - Works WITHOUT publishing Brief first!
    - Cleans up rejected cards before generation starts.
    - Generates draft program items in working dataset.
    - Does not automatically publish the program.
    """
    db = TestingSessionLocal()
    proj = _create_test_project(db)

    # Add active cards (accepted and provisional) and rejected cards
    c_acc = Card(
        id="card-acc-1",
        project_id=proj.id,
        card_type="REQUIREMENT",
        title="Primary Bedroom Suite",
        content="Master bedroom with ocean view and walk-in closet.",
        status="accepted",
    )
    c_prov = Card(
        id="card-prov-1",
        project_id=proj.id,
        card_type="REQUIREMENT",
        title="Guest House",
        content="Detached 2-bedroom guest cottage.",
        status="provisional",
    )
    c_rej = Card(
        id="card-rej-1",
        project_id=proj.id,
        card_type="OTHER",
        title="Old Swimming Pool Spec",
        content="Rejected infinity pool spec.",
        status="rejected",
    )

    # Add an uploaded source document
    src = Source(
        id="src-1",
        project_id=proj.id,
        file_name="Architectural_Brief.pdf",
        file_type="pdf",
        storage_path="/uploads/brief.pdf",
        extracted_text="Client requires a modern residential compound with 4500 sq ft main house.",
    )
    db.add_all([c_acc, c_prov, c_rej, src])
    db.commit()
    db.close()

    # Verify no Brief has been published yet
    db = TestingSessionLocal()
    pub_briefs = db.query(BriefPublishedVersion).filter(BriefPublishedVersion.project_id == proj.id).count()
    assert pub_briefs == 0
    db.close()

    # Mock Qwen health check and ProgramAgent.generate_program
    mock_agent_result = {
        "program_items": [
            {
                "name": "Primary Bedroom Suite",
                "type": "SPACE",
                "requirement": "Master bedroom with direct terrace connection.",
                "function": "Sleeping and relaxation",
                "quantity": 1,
                "area": 450.0,
                "unit": "sq ft",
                "status": "CONFIRMED",
                "source_brief_card_ids": ["card-acc-1"],
            },
            {
                "name": "Guest Cottage",
                "type": "SPACE",
                "requirement": "Detached 2-bedroom guest accommodation.",
                "function": "Guest suites",
                "quantity": 1,
                "area": 1200.0,
                "unit": "sq ft",
                "status": "PROVISIONAL",
                "source_brief_card_ids": ["card-prov-1"],
            }
        ],
        "ai_questions": [
            {
                "question": "Should the Guest Cottage feature independent kitchen amenities?",
                "reason": "Brief indicates detached guest suites without clarifying kitchen scope.",
                "source_brief_card_ids": ["card-prov-1"],
                "status": "OPEN",
            }
        ],
        "coverage_audit": {"accounted_percentage": 100.0},
    }

    with patch("llm.qwen_health.check_qwen_health", return_value={"healthy": True}), \
         patch("agents.program_agent.ProgramAgent.generate_program", return_value=mock_agent_result):

        gen_resp = client.post(f"/api/projects/{proj.id}/program/generate")
        assert gen_resp.status_code == 200
        gen_data = gen_resp.json()
        assert gen_data["status"] == "generating"
        assert gen_data["cleaned_rejected_cards"] == 1

        # Synchronously execute the background generation logic
        from routes.program import _run_program_generation
        _run_program_generation(proj.id, MOCK_USER_ID, None)

    # Verify database state after generation
    db = TestingSessionLocal()
    # 1. Rejected card was permanently removed
    rej_in_db = db.query(Card).filter(Card.project_id == proj.id, Card.status == "rejected").count()
    assert rej_in_db == 0

    # 2. Accepted and provisional cards remain in active workspace
    active_cards = db.query(Card).filter(Card.project_id == proj.id).all()
    assert len(active_cards) == 2

    # 3. Working Program Items were persisted
    items = db.query(ProgramItem).filter(ProgramItem.project_id == proj.id).all()
    assert len(items) == 2
    item_names = [it.name for it in items]
    assert "Primary Bedroom Suite" in item_names
    assert "Guest Cottage" in item_names

    # 4. Program was NOT automatically published
    published_programs = db.query(ProgramPublishedVersion).filter(
        ProgramPublishedVersion.project_id == proj.id
    ).count()
    assert published_programs == 0
    db.close()


def test_publish_program_workflow_and_immutability():
    """
    Test Publish Program:
    - Generates immutable snapshot in ProgramPublishedVersion & ProgramVersionItem.
    - Assigns sequential version number (V1, V2...).
    - Enforces immutability on published Program snapshots.
    - Preserves previous versions.
    - Does not require a second generation action.
    """
    db = TestingSessionLocal()
    proj = _create_test_project(db)

    # Insert working program items
    pi1 = ProgramItem(
        id="pi-1",
        project_id=proj.id,
        program_item_code="PRG-001",
        name="Living Pavilion",
        type="SPACE",
        area=850.0,
        unit="sq ft",
        status="CONFIRMED",
    )
    pi2 = ProgramItem(
        id="pi-2",
        project_id=proj.id,
        program_item_code="PRG-002",
        name="Chef's Kitchen",
        type="SPACE",
        area=400.0,
        unit="sq ft",
        status="CONFIRMED",
    )
    pq1 = ProgramQuestion(
        id="pq-1",
        project_id=proj.id,
        question="Is a secondary prep kitchen (scullery) required?",
        status="OPEN",
    )
    db.add_all([pi1, pi2, pq1])
    db.commit()
    db.close()

    # Publish Program
    pub_resp = client.post(f"/api/projects/{proj.id}/program/publish")
    assert pub_resp.status_code == 200
    pub_data = pub_resp.json()
    assert pub_data["version_number"] == 1
    assert pub_data["item_count"] == 2

    db = TestingSessionLocal()
    v1 = db.query(ProgramPublishedVersion).filter(
        ProgramPublishedVersion.project_id == proj.id,
        ProgramPublishedVersion.version_number == 1
    ).first()
    assert v1 is not None
    assert v1.item_count == 2
    assert len(v1.snapshot_items) == 2
    db.close()

    # Verify Immutability: PUT/PATCH/DELETE on published version returns HTTP 409
    patch_resp = client.patch(f"/api/projects/{proj.id}/program/published/{v1.id}", json={"version_number": 99})
    assert patch_resp.status_code == 409

    del_resp = client.delete(f"/api/projects/{proj.id}/program/published/{v1.id}")
    assert del_resp.status_code == 409

    # Add a 3rd item to working program
    db = TestingSessionLocal()
    pi3 = ProgramItem(
        id="pi-3",
        project_id=proj.id,
        program_item_code="PRG-003",
        name="Wine Cellar",
        type="SPACE",
        area=200.0,
        unit="sq ft",
        status="CONFIRMED",
    )
    db.add(pi3)
    db.commit()
    db.close()

    # Publish Program V2
    pub_resp2 = client.post(f"/api/projects/{proj.id}/program/publish")
    assert pub_resp2.status_code == 200
    assert pub_resp2.json()["version_number"] == 2
    assert pub_resp2.json()["item_count"] == 3

    # Verify both V1 and V2 are preserved
    db = TestingSessionLocal()
    all_pub = db.query(ProgramPublishedVersion).filter(
        ProgramPublishedVersion.project_id == proj.id
    ).order_by(ProgramPublishedVersion.version_number.asc()).all()
    assert len(all_pub) == 2
    assert all_pub[0].version_number == 1
    assert all_pub[0].item_count == 2
    assert all_pub[1].version_number == 2
    assert all_pub[1].item_count == 3
    db.close()


def test_independent_brief_and_program_version_histories():
    """Verify Brief and Program version histories increment and operate independently."""
    db = TestingSessionLocal()
    proj = _create_test_project(db)

    # 1. Add and publish Brief V1
    c1 = Card(
        id="card-b1",
        project_id=proj.id,
        card_type="REQUIREMENT",
        title="Requirement B1",
        content="Brief spec 1",
        status="accepted",
        is_unified=True,
    )
    db.add(c1)
    db.commit()
    db.close()

    b_pub1 = client.post(f"/api/projects/{proj.id}/brief/publish")
    assert b_pub1.status_code == 200
    assert b_pub1.json()["version_number"] == 1

    # 2. Add and publish Program V1
    db = TestingSessionLocal()
    pi1 = ProgramItem(
        id="pi-p1",
        project_id=proj.id,
        program_item_code="PRG-001",
        name="Item P1",
        type="SPACE",
        status="CONFIRMED",
    )
    db.add(pi1)
    db.commit()
    db.close()

    p_pub1 = client.post(f"/api/projects/{proj.id}/program/publish")
    assert p_pub1.status_code == 200
    assert p_pub1.json()["version_number"] == 1

    # 3. Add and publish Program V2 without touching Brief
    db = TestingSessionLocal()
    pi2 = ProgramItem(
        id="pi-p2",
        project_id=proj.id,
        program_item_code="PRG-002",
        name="Item P2",
        type="SPACE",
        status="CONFIRMED",
    )
    db.add(pi2)
    db.commit()
    db.close()

    p_pub2 = client.post(f"/api/projects/{proj.id}/program/publish")
    assert p_pub2.status_code == 200
    assert p_pub2.json()["version_number"] == 2

    # Verify Brief is still at V1
    db = TestingSessionLocal()
    latest_brief = db.query(BriefPublishedVersion).filter(
        BriefPublishedVersion.project_id == proj.id
    ).order_by(BriefPublishedVersion.version_number.desc()).first()
    assert latest_brief.version_number == 1

    # Verify Program is at V2
    latest_prog = db.query(ProgramPublishedVersion).filter(
        ProgramPublishedVersion.project_id == proj.id
    ).order_by(ProgramPublishedVersion.version_number.desc()).first()
    assert latest_prog.version_number == 2
    db.close()


def test_program_generation_source_rule_strictly_uses_current_workspace():
    """
    Test Program Generation Source Rule:
    - Historical published Brief snapshots must NEVER be independently loaded or merged.
    - Program generation must strictly use active workspace cards (accepted + pending) and project sources.
    - Publishing Brief is NOT a prerequisite.
    """
    db = TestingSessionLocal()
    proj = _create_test_project(db)

    # 1. Simulate an old Brief V1 snapshot with an old card
    old_card_snap = {
        "id": "old-card-historical",
        "card_type": "REQUIREMENT",
        "title": "Historical Brief V1 Spec",
        "content": "Old obsolete spec from Brief V1",
        "status": "accepted",
    }
    b_pub = BriefPublishedVersion(
        id="brief-v1-hist",
        project_id=proj.id,
        version_number=1,
        card_count=1,
        published_by=MOCK_USER_ID,
    )
    db.add(b_pub)
    db.flush()

    b_snap = BriefVersionCard(
        id="snap-b1",
        brief_version_id=b_pub.id,
        card_id="old-card-historical",
        snapshot_data=old_card_snap,
    )
    db.add(b_snap)

    # 2. Add current active workspace cards: 1 accepted, 1 provisional
    c_current_acc = Card(
        id="card-current-acc",
        project_id=proj.id,
        card_type="REQUIREMENT",
        title="Modern Living Pavilion",
        content="Open-plan living space with garden connection.",
        status="accepted",
    )
    c_current_prov = Card(
        id="card-current-prov",
        project_id=proj.id,
        card_type="REQUIREMENT",
        title="Lap Pool & Wellness Zone",
        content="25-meter heated lap pool and sauna.",
        status="provisional",
    )

    # 3. Add an uploaded source document
    src = Source(
        id="src-current-1",
        project_id=proj.id,
        file_name="Spatial_Program_Notes.docx",
        file_type="docx",
        storage_path="/uploads/notes.docx",
        extracted_text="Design for natural cross-ventilation and solar orientation.",
    )

    db.add_all([c_current_acc, c_current_prov, src])
    db.commit()
    db.close()

    captured_kwargs = {}

    def mock_generate_program(*args, **kwargs):
        captured_kwargs.update(kwargs)
        return {
            "program_items": [
                {
                    "name": "Living Pavilion",
                    "type": "SPACE",
                    "requirement": "Open-plan living space with garden connection.",
                    "status": "CONFIRMED",
                    "source_brief_card_ids": ["card-current-acc"],
                }
            ],
            "ai_questions": [],
            "coverage_audit": {"accounted_percentage": 100.0},
        }

    with patch("llm.qwen_health.check_qwen_health", return_value={"healthy": True}), \
         patch("agents.program_agent.ProgramAgent.generate_program", side_effect=mock_generate_program):

        resp = client.post(f"/api/projects/{proj.id}/program/generate")
        assert resp.status_code == 200

        from routes.program import _run_program_generation
        _run_program_generation(proj.id, MOCK_USER_ID, None)

    # Assert that ProgramAgent received ONLY the 2 current workspace cards
    supplied_cards = captured_kwargs.get("brief_cards", [])
    supplied_card_ids = [c["id"] for c in supplied_cards]

    assert "card-current-acc" in supplied_card_ids
    assert "card-current-prov" in supplied_card_ids
    # Crucial assertion: historical published Brief card was NOT loaded or merged!
    assert "old-card-historical" not in supplied_card_ids
    assert len(supplied_cards) == 2

    # Assert source document was supplied
    supplied_sources = captured_kwargs.get("source_documents", [])
    assert len(supplied_sources) == 1
    assert supplied_sources[0]["file_name"] == "Spatial_Program_Notes.docx"


def test_unpublished_program_draft_publish_existing_and_continue():
    """
    Test Unpublished Program Exists -> Publish Existing Program & Continue:
    - Step 1: Program draft exists in working table (unpublished).
    - Step 2: Calling generate with publish_existing=True publishes current draft as V1.
    - Step 3: Starts fresh generation from latest project data.
    - Step 4: Preserves published V1 permanently.
    """
    db = TestingSessionLocal()
    proj = _create_test_project(db)

    # Existing working draft
    pi_draft = ProgramItem(
        id="pi-draft-1",
        project_id=proj.id,
        program_item_code="PRG-001",
        name="Existing Draft Item",
        type="SPACE",
        area=500.0,
        status="CONFIRMED",
    )
    c_active = Card(
        id="card-act-1",
        project_id=proj.id,
        card_type="REQUIREMENT",
        title="New Requirement",
        content="New spec after uploading doc.",
        status="accepted",
    )
    db.add_all([pi_draft, c_active])
    db.commit()
    db.close()

    mock_fresh_result = {
        "program_items": [
            {
                "name": "Fresh Generated Space",
                "type": "SPACE",
                "requirement": "Fresh requirement generated from latest data.",
                "status": "CONFIRMED",
                "source_brief_card_ids": ["card-act-1"],
            }
        ],
        "ai_questions": [],
        "coverage_audit": {"accounted_percentage": 100.0},
    }

    with patch("llm.qwen_health.check_qwen_health", return_value={"healthy": True}), \
         patch("agents.program_agent.ProgramAgent.generate_program", return_value=mock_fresh_result):

        # Call generate with publish_existing=True
        resp = client.post(
            f"/api/projects/{proj.id}/program/generate",
            json={"publish_existing": True}
        )
        assert resp.status_code == 200
        assert resp.json()["published_existing_version"] == 1

        from routes.program import _run_program_generation
        _run_program_generation(proj.id, MOCK_USER_ID, None)

    # Verify:
    db = TestingSessionLocal()
    # 1. Existing draft was published as V1
    v1 = db.query(ProgramPublishedVersion).filter(
        ProgramPublishedVersion.project_id == proj.id,
        ProgramPublishedVersion.version_number == 1,
    ).first()
    assert v1 is not None
    assert v1.item_count == 1
    assert v1.snapshot_items[0].snapshot_data["name"] == "Existing Draft Item"

    # 2. Working draft was updated with fresh generated items
    working_items = db.query(ProgramItem).filter(ProgramItem.project_id == proj.id).all()
    assert len(working_items) == 1
    assert working_items[0].name == "Fresh Generated Space"
    db.close()


def test_unpublished_program_draft_continue_without_publishing():
    """
    Test Unpublished Program Exists -> Continue Without Publishing:
    - Step 1: Program draft exists in working table (unpublished).
    - Step 2: Calling generate without publish_existing replaces working draft.
    - Step 3: Old draft is NOT published (0 published versions exist).
    """
    db = TestingSessionLocal()
    proj = _create_test_project(db)

    # Existing working draft
    pi_draft = ProgramItem(
        id="pi-draft-old",
        project_id=proj.id,
        program_item_code="PRG-001",
        name="Unpublished Old Draft Space",
        type="SPACE",
        area=300.0,
        status="CONFIRMED",
    )
    c_active = Card(
        id="card-act-2",
        project_id=proj.id,
        card_type="REQUIREMENT",
        title="Active Workspace Card",
        content="Active workspace requirement.",
        status="accepted",
    )
    db.add_all([pi_draft, c_active])
    db.commit()
    db.close()

    mock_fresh_result = {
        "program_items": [
            {
                "name": "Replaced Fresh Space",
                "type": "SPACE",
                "requirement": "Fresh requirement.",
                "status": "CONFIRMED",
                "source_brief_card_ids": ["card-act-2"],
            }
        ],
        "ai_questions": [],
        "coverage_audit": {"accounted_percentage": 100.0},
    }

    with patch("llm.qwen_health.check_qwen_health", return_value={"healthy": True}), \
         patch("agents.program_agent.ProgramAgent.generate_program", return_value=mock_fresh_result):

        # Call generate without publish_existing (or False)
        resp = client.post(
            f"/api/projects/{proj.id}/program/generate",
            json={"publish_existing": False}
        )
        assert resp.status_code == 200
        assert resp.json()["published_existing_version"] is None

        from routes.program import _run_program_generation
        _run_program_generation(proj.id, MOCK_USER_ID, None)

    # Verify:
    db = TestingSessionLocal()
    # 1. No Program was published
    pub_count = db.query(ProgramPublishedVersion).filter(
        ProgramPublishedVersion.project_id == proj.id
    ).count()
    assert pub_count == 0

    # 2. Working draft was replaced with fresh space
    working_items = db.query(ProgramItem).filter(ProgramItem.project_id == proj.id).all()
    assert len(working_items) == 1
    assert working_items[0].name == "Replaced Fresh Space"
    db.close()
