"""
Unit tests for REFLECT Context Knowledge System — Phase 1 (Cultural Context).
Uses isolated SQLite in-memory/temp DB and mocks external LLM/HTTP calls.
"""
import os
import sys
import uuid
import unittest
from pathlib import Path
from unittest.mock import patch, MagicMock

backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

os.environ.setdefault("APP_DATABASE_URL", "sqlite:///./test_context_phase1.db")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-context-phase1")

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from db import Base, User, Project
import context.models  # noqa: F401
from context.models import ContextCard
from context.registry import KNOWLEDGE_SETS, is_knowledge_set_enabled
from context.master_agent import ContextMasterAgent, MAX_RESEARCH_ATTEMPTS


class TestContextPhase1(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
        Base.metadata.create_all(bind=cls.engine)
        cls.Session = sessionmaker(bind=cls.engine)

    def setUp(self):
        self.db = self.Session()
        self.user_a = User(id=str(uuid.uuid4()), email=f"a_{uuid.uuid4()}@test.local", name="Architect A")
        self.project_a = Project(
            id=str(uuid.uuid4()),
            user_id=self.user_a.id,
            name="Coastal Pavilion",
            project_type="PUBLIC / INSTITUTIONAL",
            location="Visakhapatnam, Andhra Pradesh, India",
        )
        self.db.add_all([self.user_a, self.project_a])
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def test_registry_phase1_scope(self):
        self.assertEqual(len(KNOWLEDGE_SETS), 8)
        self.assertTrue(is_knowledge_set_enabled("cultural_context"))
        for ks in KNOWLEDGE_SETS:
            if ks["id"] != "cultural_context":
                self.assertFalse(ks["enabled"])

    def test_master_enforces_max_3_attempts_and_creates_7_cards(self):
        seven_keys = [
            "the_place_briefly",
            "how_this_place_has_built",
            "materials_and_making",
            "climate_as_culture_has_answered_it",
            "history_and_memory",
            "the_living_tensions",
            "what_the_team_should_learn_locally",
        ]
        mock_output = {
            "sub_aspects": [
                {
                    "sub_aspect_key": k,
                    "title": k.replace("_", " ").title(),
                    "content": f"Verified architectural content for {k}.",
                    "research_register": "DOCUMENTED",
                    "confidence": "MEDIUM",
                    "sources": [{"title": "Local Archive", "url": "https://example.org/doc"}],
                    "validated_images": [],
                }
                for k in seven_keys
            ],
            "limitations": ["Limited municipal archive digitization."],
            "local_verification_requirements": ["Confirm local stone quarry availability."],
        }

        with patch("context.master_agent.get_llm_generator") as mock_qwen, \
             patch("context.master_agent.CulturalContextAgent") as mock_agent_cls, \
             patch("context.master_agent.get_deepseek_client") as mock_ds:

            mock_qwen.return_value.run.return_value = {
                "replies": ['{"city": "Visakhapatnam", "country": "India", "location_description": "Visakhapatnam, India", "confidence_status": "CONFIRMED"}']
            }
            mock_agent = MagicMock()
            mock_agent.run_initial_research.return_value = mock_output
            mock_agent_cls.return_value = mock_agent

            # Force evaluator to always ask for RETRY to verify hard 3-attempt cap
            mock_ds.return_value.chat.return_value = {
                "content": '{"decision": "RETRY", "issues": ["Need deeper detail"], "targeted_feedback": "Add detail"}'
            }

            master = ContextMasterAgent(db=self.db)
            run = master.run_cultural_context_generation(project_id=self.project_a.id)

            self.assertEqual(run.attempt_count, MAX_RESEARCH_ATTEMPTS)
            self.assertEqual(mock_agent.run_initial_research.call_count, 3)
            self.assertEqual(run.status, "accepted_with_gaps")

            cards = self.db.query(ContextCard).filter(
                ContextCard.project_id == self.project_a.id,
                ContextCard.is_deleted == False,
            ).all()
            self.assertEqual(len(cards), 7)

    def test_card_modification_preserves_original_on_failure(self):
        card = ContextCard(
            id=str(uuid.uuid4()),
            project_id=self.project_a.id,
            knowledge_set_id="cultural_context",
            knowledge_set_name="Cultural Context",
            sub_aspect_key="materials_and_making",
            display_order=3,
            title="Materials and making",
            content="Original valid architectural research.",
            research_register="DOCUMENTED",
            version=1,
        )
        self.db.add(card)
        self.db.commit()

        with patch("context.master_agent.CulturalContextAgent") as mock_agent_cls:
            mock_agent = MagicMock()
            mock_agent.run_card_modification.return_value = {"updated_content": ""}
            mock_agent_cls.return_value = mock_agent

            master = ContextMasterAgent(db=self.db)
            with self.assertRaises(RuntimeError):
                master.run_card_modification(
                    project_id=self.project_a.id,
                    card_id=card.id,
                    instruction="Add coastal stone details",
                )

            preserved = self.db.query(ContextCard).filter(ContextCard.id == card.id).first()
            self.assertEqual(preserved.content, "Original valid architectural research.")
            self.assertEqual(preserved.version, 1)


if __name__ == "__main__":
    unittest.main()
