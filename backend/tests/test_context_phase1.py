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
from context.agents.cultural_context import CulturalContextAgent, MAX_TOOL_CALLS_PER_RUN, MAX_MODEL_ROUNDS
from context.search_service import (
    DEEPSEEK_WEB_TOOLS,
    validate_safe_external_url,
    read_url,
)


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

    def test_master_enforces_max_3_attempts_and_creates_dynamic_cards(self):
        aspect_keys = [
            "place_identity",
            "spatial_traditions",
            "materials_and_making",
            "materials_and_making",
            "everyday_life",
            "cultural_identity",
            "living_tensions",
            "contemporary_production",
            "history_and_memory",
            "learn_locally",
        ]
        mock_output = {
            "documentation_level": "PARTLY_DOCUMENTED",
            "cards": [
                {
                    "aspect_key": k,
                    "title": f"Finding {idx + 1} ({k})",
                    "content": f"Concise project-aware finding {idx + 1} for {k}.",
                    "scale": "city",
                    "research_register": "DOCUMENTED",
                    "confidence": "MEDIUM",
                    "sources": [{"title": "Local Archive", "url": "https://example.org/doc"}],
                    "validated_images": [],
                }
                for idx, k in enumerate(aspect_keys)
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
            # Dynamic card count (>7) rather than fixed 7
            self.assertEqual(len(cards), 10)

    def test_card_split_preview_and_confirm_preserves_parent_card(self):
        parent = ContextCard(
            id=str(uuid.uuid4()),
            project_id=self.project_a.id,
            knowledge_set_id="cultural_context",
            knowledge_set_name="Cultural Context",
            sub_aspect_key="materials_and_making",
            display_order=1,
            title="Materials and making",
            content="Hyderabad sits on granite and also has lime-surkhi plaster traditions.",
            research_register="DOCUMENTED",
            confidence="MEDIUM",
            version=1,
            tags=["city"],
        )
        self.db.add(parent)
        self.db.commit()

        with patch("context.master_agent.CulturalContextAgent") as mock_agent_cls:
            mock_agent = MagicMock()
            mock_agent.propose_card_splits.return_value = {
                "proposed_cards": [
                    {
                        "temp_id": "split_1",
                        "title": "Hyderabad Granite Tradition",
                        "content": "Granite is quarried locally and worked by stone yards.",
                        "aspect_key": "materials_and_making",
                        "research_register": "DOCUMENTED",
                        "sources": [{"title": "Stone Survey", "url": "https://example.org/stone"}],
                    },
                    {
                        "temp_id": "split_2",
                        "title": "Lime-Surkhi Plaster",
                        "content": "Traditional breathable lime mortars remain regionally known.",
                        "aspect_key": "materials_and_making",
                        "research_register": "PATTERN",
                        "sources": [],
                    },
                ]
            }
            mock_agent_cls.return_value = mock_agent

            master = ContextMasterAgent(db=self.db)
            proposals = master.propose_card_splits(self.project_a.id, parent.id)
            self.assertEqual(len(proposals), 2)

            # Preview must NOT mutate DB
            count_after_preview = self.db.query(ContextCard).filter(
                ContextCard.project_id == self.project_a.id, ContextCard.is_deleted == False
            ).count()
            self.assertEqual(count_after_preview, 1)

            # Confirm only 1 selected split card
            created = master.confirm_card_splits(self.project_a.id, parent.id, [proposals[0]])
            self.assertEqual(len(created), 1)
            self.assertEqual(created[0].title, "Hyderabad Granite Tradition")

            # Parent card must still be preserved intact
            parent_check = self.db.query(ContextCard).filter(ContextCard.id == parent.id).first()
            self.assertFalse(parent_check.is_deleted)
            self.assertEqual(parent_check.title, "Materials and making")

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

    def test_ssrf_protection_blocks_private_loopback_metadata_ipv6_and_unsafe_redirects(self):
        unsafe_urls = [
            "http://127.0.0.1:8000/secret",
            "http://localhost/admin",
            "http://10.0.0.5/internal",
            "http://172.16.0.10/db",
            "http://192.168.1.1/router",
            "http://169.254.169.254/latest/meta-data/",
            "http://[::1]:8000/",
            "http://[fc00::1]/",
            "http://[fe80::1]/",
            "file:///etc/passwd",
            "ftp://example.com/file",
        ]
        for u in unsafe_urls:
            ok, reason = validate_safe_external_url(u)
            self.assertFalse(ok, f"Expected SSRF block for {u}, got ok=True")
            self.assertTrue(len(reason) > 0)

        # DNS rebinding / private DNS resolution test
        with patch("context.search_service.socket.getaddrinfo") as mock_dns:
            mock_dns.return_value = [(2, 1, 6, "", ("10.20.30.40", 0))]
            ok, reason = validate_safe_external_url("https://evil-rebind.example.com/page")
            self.assertFalse(ok)
            self.assertIn("10.20.30.40", reason)

        # Unsafe redirect target test (public URL redirecting to 127.0.0.1)
        with patch("context.search_service.socket.getaddrinfo") as mock_dns, \
             patch("context.search_service.requests.request") as mock_req:
            mock_dns.return_value = [(2, 1, 6, "", ("93.184.216.34", 0))]
            redirect_resp = MagicMock()
            redirect_resp.status_code = 302
            redirect_resp.headers = {"Location": "http://127.0.0.1:5432/"}
            mock_req.return_value = redirect_resp

            res = read_url("https://example.com/redirect")
            self.assertFalse(res["success"])
            self.assertIn("SSRF protection blocked URL", res["error"])

    def test_cultural_agent_executes_search_and_read_url_tool_loop(self):
        mock_client = MagicMock()
        seven_keys = [
            "place_identity",
            "spatial_traditions",
            "materials_and_making",
            "everyday_life",
            "cultural_identity",
            "living_tensions",
            "contemporary_production",
            "history_and_memory",
        ]
        final_json = {
            "documentation_level": "PARTLY_DOCUMENTED",
            "cards": [
                {
                    "aspect_key": k,
                    "title": k.replace("_", " ").title(),
                    "content": f"Researched content for {k}",
                    "scale": "city",
                    "research_register": "DOCUMENTED",
                    "confidence": "HIGH",
                    "sources": [{"title": "Vizag Heritage", "url": "https://example.org/vizag"}],
                }
                for k in seven_keys
            ],
            "limitations": [],
            "local_verification_requirements": [],
        }

        # Round 1: search + malformed tool call; Round 2: read_url; Round 3: final JSON
        mock_client.chat.side_effect = [
            {
                "content": "",
                "tool_calls": [
                    {"id": "tc_1", "type": "function", "function": {"name": "deepseek_web_search", "arguments": '{"query": "Visakhapatnam architecture"}'}},
                    {"id": "tc_bad", "type": "function", "function": {"name": "deepseek_web_search", "arguments": "{bad-json"}},
                ],
                "usage": {},
            },
            {
                "content": "",
                "tool_calls": [
                    {"id": "tc_2", "type": "function", "function": {"name": "deepseek_read_url", "arguments": '{"url": "https://example.org/vizag"}'}},
                ],
                "usage": {},
            },
            {
                "content": __import__("json").dumps(final_json),
                "tool_calls": [],
                "usage": {"total_tokens": 500},
                "reasoning_content": "Synthesized from retrieved page.",
            },
        ]

        with patch("context.agents.cultural_context.web_search") as mock_search, \
             patch("context.agents.cultural_context.read_url") as mock_read:
            mock_search.return_value = {
                "success": True,
                "query": "Visakhapatnam architecture",
                "results": [{"title": "Vizag Heritage", "url": "https://example.org/vizag", "snippet": "Coastal stone and brick."}],
            }
            mock_read.return_value = {
                "success": True,
                "requested_url": "https://example.org/vizag",
                "retrieved_url": "https://example.org/vizag",
                "title": "Vizag Heritage",
                "domain": "example.org",
                "published_date": "2024",
                "content": "Visakhapatnam built traditions include coastal stone and lime mortar.",
                "chars_returned": 68,
            }

            agent = CulturalContextAgent(client=mock_client)
            result = agent.run_initial_research({"LOCATION": {"city": "Visakhapatnam"}})

            # Verify tools were passed to DeepSeek
            first_call_kwargs = mock_client.chat.call_args_list[0].kwargs
            self.assertEqual(first_call_kwargs["tools"], DEEPSEEK_WEB_TOOLS)

            # Verify search & read_url actually executed
            mock_search.assert_called_once_with("Visakhapatnam architecture", max_results=5)
            mock_read.assert_called_once_with("https://example.org/vizag")

            # Verify trace preserved
            self.assertEqual(len(result["research_trace"]), 3)
            self.assertTrue(result["research_trace"][0]["success"])
            self.assertFalse(result["research_trace"][1]["success"])  # malformed args
            self.assertTrue(result["research_trace"][2]["success"])
            self.assertEqual(len(result["cards"]), 8)

    def test_tool_call_limit_enforced_and_forces_final_synthesis(self):
        mock_client = MagicMock()
        # Return tool calls on every round up to MAX_MODEL_ROUNDS, then final JSON
        tool_resp = {
            "content": "",
            "tool_calls": [
                {"id": f"tc_{i}", "type": "function", "function": {"name": "deepseek_web_search", "arguments": '{"query": "test"}'}}
                for i in range(4)
            ],
            "usage": {},
        }
        final_resp = {
            "content": '{"sub_aspects": [], "limitations": ["Budget reached"], "local_verification_requirements": []}',
            "tool_calls": [],
            "usage": {},
        }
        # 3 rounds * 4 tool calls hits MAX_TOOL_CALLS_PER_RUN (10) on round 3, then 1 final synthesis call
        mock_client.chat.side_effect = [tool_resp] * 3 + [final_resp]

        with patch("context.agents.cultural_context.web_search") as mock_search:
            mock_search.return_value = {"success": False, "results": [], "error": "Empty"}
            agent = CulturalContextAgent(client=mock_client)
            res = agent.run_initial_research({"LOCATION": {"city": "Unknown"}})

            self.assertLessEqual(mock_search.call_count, MAX_TOOL_CALLS_PER_RUN)
            self.assertEqual(res["limitations"], ["Budget reached"])


if __name__ == "__main__":
    unittest.main()
