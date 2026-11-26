"""
Knowledge Set Registry for the REFLECT Context Knowledge System.
Phase 1: Only 'cultural_context' is enabled. All 7 remaining Knowledge Sets are
registered as disabled placeholders for future phases.

Cultural Context uses 8 research lenses (NOT fixed cards):
findings determine the dynamic card count ("one idea per card").
"""
from typing import Dict, Any, List

CULTURAL_ASPECT_LENSES: List[Dict[str, str]] = [
    {"key": "place_identity", "title": "Place Identity", "description": "Geographic, regional character, settlement type and identity"},
    {"key": "spatial_traditions", "title": "Spatial Traditions", "description": "Typologies, settlement patterns, thresholds and building–land relationships"},
    {"key": "materials_and_making", "title": "Materials and Making", "description": "Materials, crafts, makers, construction knowledge and declining skills"},
    {"key": "everyday_life", "title": "Everyday Life and Social Practices", "description": "Daily routines, gathering, festivals, community and use of spaces"},
    {"key": "cultural_identity", "title": "Cultural Identity and Meaning", "description": "Symbolic spaces, rituals, landmarks and cultural meanings"},
    {"key": "living_tensions", "title": "Living Tensions", "description": "Redevelopment, displacement, heritage, globalization and contested narratives"},
    {"key": "contemporary_production", "title": "Contemporary Cultural Production", "description": "Current creative practices, architecture, makers and institutions"},
    {"key": "history_and_memory", "title": "History and Memory", "description": "Origins, development, communities, land-use change and collective memory"},
]

KNOWLEDGE_SETS: List[Dict[str, Any]] = [
    {
        "id": "cultural_context",
        "name": "Cultural Context",
        "description": "Project-aware cultural research across 8 architectural lenses — one idea per card.",
        "enabled": True,
        "phase": 1,
        "aspect_lenses": CULTURAL_ASPECT_LENSES,
    },
    {"id": "climate", "name": "Climate", "description": "Raw climatic data, solar geometry, wind, and precipitation.", "enabled": False, "phase": 2, "aspect_lenses": []},
    {"id": "site_analysis", "name": "Site Analysis", "description": "Topography, boundaries, orientation, and physical site conditions.", "enabled": False, "phase": 2, "aspect_lenses": []},
    {"id": "neighbourhood", "name": "Neighbourhood", "description": "Adjacent urban fabric, land uses, and community amenities.", "enabled": False, "phase": 2, "aspect_lenses": []},
    {"id": "environmental_context", "name": "Environmental Context", "description": "Ecology, hydrology, biodiversity, and environmental constraints.", "enabled": False, "phase": 2, "aspect_lenses": []},
    {"id": "infrastructure", "name": "Infrastructure", "description": "Utilities, water, power, drainage, and civic services.", "enabled": False, "phase": 2, "aspect_lenses": []},
    {"id": "mobility_access", "name": "Mobility & Access", "description": "Transit networks, street hierarchy, pedestrian and vehicular access.", "enabled": False, "phase": 2, "aspect_lenses": []},
    {"id": "regulatory", "name": "Regulatory", "description": "Zoning, setbacks, FAR/FSI, heritage overlays, and building codes.", "enabled": False, "phase": 2, "aspect_lenses": []},
]


def get_knowledge_set(knowledge_set_id: str) -> Dict[str, Any]:
    for ks in KNOWLEDGE_SETS:
        if ks["id"] == knowledge_set_id:
            return ks
    raise ValueError(f"Unknown knowledge set: {knowledge_set_id}")


def is_knowledge_set_enabled(knowledge_set_id: str) -> bool:
    ks = get_knowledge_set(knowledge_set_id)
    return bool(ks.get("enabled"))
