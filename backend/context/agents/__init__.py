"""Base interface for all Knowledge Set Agents in the Context Knowledge System."""
from abc import ABC, abstractmethod
from typing import Dict, Any


class BaseKnowledgeSetAgent(ABC):
    knowledge_set_id: str = ""
    knowledge_set_name: str = ""

    @abstractmethod
    def run_initial_research(self, research_package: Dict[str, Any], retry_feedback: str = "") -> Dict[str, Any]:
        """MODE A: Execute initial research and return structured sub-aspect sections + sources."""

    @abstractmethod
    def run_card_modification(self, modification_package: Dict[str, Any], retry_feedback: str = "") -> Dict[str, Any]:
        """MODE B: Execute targeted single-card modification and return updated card + sources."""
