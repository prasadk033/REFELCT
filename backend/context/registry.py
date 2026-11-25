"""
Knowledge Set Registry for the REFLECT Context Knowledge System.
Phase 1: Only 'cultural_context' is enabled. All 7 remaining Knowledge Sets are
registered as disabled placeholders for future phases.
"""
from typing import Dict, Any, List

KNOWLEDGE_SETS: List[Dict[str, Any]] = [
    {
        "id": "cultural_context",
        "name": "Cultural Context",
        "description": "Local building culture, materials, climate wisdom, history, living tensions, and field learning needs.",
        "enabled": True,
        "phase": 1,
        "sub_aspects": [
            {"key": "the_place_briefly", "title": "The place, briefly", "order": 1},
            {"key": "how_this_place_has_built", "title": "How this place has built", "order": 2},
            {"key": "materials_and_making", "title": "Materials and making", "order": 3},
            {"key": "climate_as_culture_has_answered_it", "title": "Climate, as culture has answered it", "order": 4},
            {"key": "history_and_memory", "title": "History and memory", "order": 5},
            {"key": "the_living_tensions", "title": "The living tensions", "order": 6},
            {"key": "what_the_team_should_learn_locally", "title": "What the team should learn locally", "order": 7},
        ],
    },
    {"id": "climate", "name": "Climate", "description": "Raw climatic data, solar geometry, wind, and precipitation.", "enabled": False, "phase": 2, "sub_aspects": []},
    {"id": "site_analysis", "name": "Site Analysis", "description": "Topography, boundaries, orientation, and physical site conditions.", "enabled": False, "phase": 2, "sub_aspects": []},
    {"id": "neighbourhood", "name": "Neighbourhood", "description": "Adjacent urban fabric, land uses, and community amenities.", "enabled": False, "phase": 2, "sub_aspects": []},
    {"id": "environmental_context", "name": "Environmental Context", "description": "Ecology, hydrology, biodiversity, and environmental constraints.", "enabled": False, "phase": 2, "sub_aspects": []},
    {"id": "infrastructure", "name": "Infrastructure", "description": "Utilities, water, power, drainage, and civic services.", "enabled": False, "phase": 2, "sub_aspects": []},
    {"id": "mobility_access", "name": "Mobility & Access", "description": "Transit networks, street hierarchy, pedestrian and vehicular access.", "enabled": False, "phase": 2, "sub_aspects": []},
    {"id": "regulatory", "name": "Regulatory", "description": "Zoning, setbacks, FAR/FSI, heritage overlays, and building codes.", "enabled": False, "phase": 2, "sub_aspects": []},
]


def get_knowledge_set(knowledge_set_id: str) -> Dict[str, Any]:
    for ks in KNOWLEDGE_SETS:
        if ks["id"] == knowledge_set_id:
            return ks
    raise ValueError(f"Unknown knowledge set: {knowledge_set_id}")


def is_knowledge_set_enabled(knowledge_set_id: str) -> bool:
    ks = get_knowledge_set(knowledge_set_id)
    return bool(ks.get("enabled"))
