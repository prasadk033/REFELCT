import json
import logging
import urllib.request
import urllib.parse
import ssl
from typing import Dict, Any, Tuple, Optional
import math
import uuid

from config import config

logger = logging.getLogger(__name__)

# Basic haversine formula for rough straight-line distance
def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> int:
    R = 6371000  # Radius of earth in meters
    phi_1 = math.radians(lat1)
    phi_2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    a = math.sin(delta_phi / 2.0) ** 2 + math.cos(phi_1) * math.cos(phi_2) * math.sin(delta_lambda / 2.0) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return int(R * c)

class OSMSiteAnalysisService:
    def __init__(self):
        self.geocode_url = config.OSM_GEOCODE_URL
        self.overpass_url = config.OSM_OVERPASS_URL
        self.user_agent = "REFLECT-Architecture-App/1.0"
        
        self.ctx = ssl.create_default_context()
        self.ctx.check_hostname = False
        self.ctx.verify_mode = ssl.CERT_NONE

    def geocode_location(self, location_str: str) -> Optional[Tuple[float, float, str]]:
        """Resolves an address string to lat, lon, and formatted address."""
        # Check if it's already coordinates (e.g. "45.307, 10.067")
        try:
            parts = [p.strip() for p in location_str.split(",")]
            if len(parts) == 2:
                lat = float(parts[0])
                lon = float(parts[1])
                return lat, lon, location_str
        except Exception:
            pass

        logger.info(f"Geocoding location: {location_str}")
        params = {"q": location_str, "format": "json", "limit": 1}
        url = f"{self.geocode_url}?{urllib.parse.urlencode(params)}"
        
        req = urllib.request.Request(url)
        req.add_header("User-Agent", self.user_agent)
        
        try:
            response = urllib.request.urlopen(req, context=self.ctx, timeout=10)
            data = json.loads(response.read().decode("utf-8"))
            if data and len(data) > 0:
                result = data[0]
                return float(result["lat"]), float(result["lon"]), result.get("display_name", location_str)
            return None
        except Exception as e:
            logger.error(f"Geocoding failed for '{location_str}': {e}")
            return None

    def query_overpass(self, lat: float, lon: float, radius: int = 3000) -> Dict[str, Any]:
        """Queries Overpass API for features within radius."""
        logger.info(f"Querying Overpass for lat={lat}, lon={lon}, r={radius}")
        
        # Build Overpass QL query
        query = f"""
        [out:json][timeout:25];
        (
          way["highway"](around:{radius},{lat},{lon});
          node["public_transport"](around:{radius},{lat},{lon});
          node["railway"="station"](around:{radius},{lat},{lon});
          way["building"](around:{radius},{lat},{lon});
          way["landuse"](around:{radius},{lat},{lon});
          way["leisure"](around:{radius},{lat},{lon});
          way["natural"](around:{radius},{lat},{lon});
          way["waterway"](around:{radius},{lat},{lon});
          node["amenity"](around:{radius},{lat},{lon});
          way["amenity"](around:{radius},{lat},{lon});
        );
        out center;
        """
        
        data = urllib.parse.urlencode({"data": query}).encode("utf-8")
        req = urllib.request.Request(self.overpass_url, data=data)
        req.add_header("User-Agent", self.user_agent)
        
        try:
            response = urllib.request.urlopen(req, context=self.ctx, timeout=30)
            result = json.loads(response.read().decode("utf-8"))
            return result
        except Exception as e:
            logger.error(f"Overpass query failed: {e}")
            return {"elements": []}

    def _get_distance(self, element: Dict[str, Any], center_lat: float, center_lon: float) -> int:
        if "center" in element:
            elat, elon = element["center"]["lat"], element["center"]["lon"]
        elif "lat" in element and "lon" in element:
            elat, elon = element["lat"], element["lon"]
        else:
            return -1
        return haversine_distance(center_lat, center_lon, elat, elon)

    def analyze_site_context(self, raw_data: Dict[str, Any], lat: float, lon: float, radius: int = 3000, address: str = "") -> Dict[str, Any]:
        """Process raw Overpass JSON into deterministic structured analysis."""
        analysis = {
            "site_location": {
                "latitude": lat,
                "longitude": lon,
                "address": address
            },
            "analysis_radius_m": radius,
            "road_hierarchy": {"motorway": 0, "primary": 0, "secondary": 0, "tertiary": 0, "residential": 0},
            "public_transport": [],
            "building_density": "Low",
            "building_uses": set(),
            "open_spaces": [],
            "blue_infrastructure": [],
            "significant_surroundings": []
        }
        
        elements = raw_data.get("elements", [])
        building_count = 0
        
        for el in elements:
            tags = el.get("tags", {})
            dist = self._get_distance(el, lat, lon)
            name = tags.get("name", "Unnamed")
            
            # Roads
            if "highway" in tags:
                hw = tags["highway"]
                if hw in analysis["road_hierarchy"]:
                    analysis["road_hierarchy"][hw] += 1
                elif "motorway" in hw or "trunk" in hw:
                    analysis["road_hierarchy"]["motorway"] += 1
                    
            # Buildings
            if "building" in tags:
                building_count += 1
                
            # Public Transport
            if tags.get("public_transport") in ["station", "platform"] or tags.get("railway") == "station":
                if name != "Unnamed" and dist >= 0:
                    analysis["public_transport"].append({"name": name, "type": tags.get("public_transport", "station"), "distance_m": dist})
                    
            # Landuse / Amenities
            if "amenity" in tags:
                analysis["building_uses"].add(tags["amenity"])
                if tags["amenity"] in ["hospital", "university", "townhall", "library", "school"]:
                    if name != "Unnamed" and dist >= 0:
                        analysis["significant_surroundings"].append({"name": name, "type": tags["amenity"], "distance_m": dist})
                        
            # Open Spaces
            if tags.get("leisure") in ["park", "garden", "playground", "pitch"] or tags.get("landuse") == "forest":
                if name != "Unnamed" and dist >= 0:
                    analysis["open_spaces"].append({"name": name, "type": tags.get("leisure", tags.get("landuse")), "distance_m": dist})
                    
            # Blue Infrastructure
            if "waterway" in tags or tags.get("natural") == "water":
                if name != "Unnamed" and dist >= 0:
                    analysis["blue_infrastructure"].append({"name": name, "type": tags.get("waterway", "water"), "distance_m": dist})
                    
        # Deterministic Density
        area_sqkm = (math.pi * (radius ** 2)) / 1000000
        density_per_sqkm = building_count / area_sqkm if area_sqkm > 0 else 0
        
        if density_per_sqkm > 1000:
            analysis["building_density"] = "High"
            analysis["site_character"] = "Dense Urban"
        elif density_per_sqkm > 200:
            analysis["building_density"] = "Medium"
            analysis["site_character"] = "Suburban / Urban"
        else:
            analysis["building_density"] = "Low"
            analysis["site_character"] = "Rural / Peri-urban"
            
        analysis["building_uses"] = list(analysis["building_uses"])[:10]  # top 10 unique uses
        
        # Sort distance-based lists
        analysis["public_transport"] = sorted(analysis["public_transport"], key=lambda x: x["distance_m"])[:5]
        analysis["open_spaces"] = sorted(analysis["open_spaces"], key=lambda x: x["distance_m"])[:5]
        analysis["blue_infrastructure"] = sorted(analysis["blue_infrastructure"], key=lambda x: x["distance_m"])[:5]
        analysis["significant_surroundings"] = sorted(analysis["significant_surroundings"], key=lambda x: x["distance_m"])[:5]
        
        return analysis

    def generate_master_card(self, analysis: Dict[str, Any], project_id: str, brief_id: str) -> Dict[str, Any]:
        """Formats the structured analysis into a single Master Brief Card schema."""
        content_lines = [
            f"**Site Character:** {analysis.get('site_character', 'Unknown')} (Building Density: {analysis['building_density']})",
            f"**Road Hierarchy:** {analysis['road_hierarchy']['motorway']} motorways, {analysis['road_hierarchy']['primary']} primary, {analysis['road_hierarchy']['residential']} residential roads within radius.",
        ]
        
        if analysis["public_transport"]:
            pt_strs = [f"{pt['name']} ({pt['type']}, ~{pt['distance_m']}m straight-line)" for pt in analysis["public_transport"]]
            content_lines.append(f"**Public Transport:** {', '.join(pt_strs)}")
            
        if analysis["significant_surroundings"]:
            ss_strs = [f"{ss['name']} ({ss['type']}, ~{ss['distance_m']}m straight-line)" for ss in analysis["significant_surroundings"]]
            content_lines.append(f"**Significant Surroundings:** {', '.join(ss_strs)}")
            
        if analysis["open_spaces"]:
            os_strs = [f"{o['name']} ({o['type']}, ~{o['distance_m']}m straight-line)" for o in analysis["open_spaces"]]
            content_lines.append(f"**Open Spaces:** {', '.join(os_strs)}")
            
        if analysis["blue_infrastructure"]:
            bi_strs = [f"{b['name']} ({b['type']}, ~{b['distance_m']}m straight-line)" for b in analysis["blue_infrastructure"]]
            content_lines.append(f"**Blue Infrastructure:** {', '.join(bi_strs)}")
            
        content_lines.append("\n*Note: All distances are approximate straight-line measurements from the site center.*")
        
        card = {
            "id": str(uuid.uuid4()),
            "project_id": project_id,
            "brief_id": brief_id,
            "card_type": "FACT",
            "title": "OpenStreetMap Site Context Analysis",
            "content": "\n".join(content_lines),
            "evidence": "© OpenStreetMap contributors. Data queried dynamically from OSM (Overpass API) based on project location.",
            "section": "Site Analysis",
            "created_by": "OSM Service",
            "status": "accepted",
            "is_unified": False
        }
        
        return card

osm_service = OSMSiteAnalysisService()
