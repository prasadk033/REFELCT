import unittest
import json
from unittest.mock import patch, MagicMock
from services.osm_site_analysis import OSMSiteAnalysisService, haversine_distance

class TestOSMSiteAnalysisService(unittest.TestCase):
    def setUp(self):
        self.service = OSMSiteAnalysisService()

    def test_haversine_distance(self):
        # Rome to Milan approx ~477km
        dist = haversine_distance(41.9028, 12.4964, 45.4642, 9.1900)
        self.assertTrue(470000 < dist < 480000)

    @patch('services.osm_site_analysis.urllib.request.urlopen')
    def test_geocode_location_success(self, mock_urlopen):
        mock_response = MagicMock()
        mock_response.read.return_value = json.dumps([{"lat": "45.307", "lon": "10.067", "display_name": "Cascina, Italy"}]).encode('utf-8')
        mock_urlopen.return_value = mock_response

        result = self.service.geocode_location("Cascina")
        self.assertIsNotNone(result)
        self.assertEqual(result[0], 45.307)
        self.assertEqual(result[1], 10.067)
        self.assertEqual(result[2], "Cascina, Italy")

    def test_geocode_location_coordinates(self):
        result = self.service.geocode_location("45.307, 10.067")
        self.assertIsNotNone(result)
        self.assertEqual(result[0], 45.307)
        self.assertEqual(result[1], 10.067)

    def test_analyze_site_context(self):
        raw_data = {
            "elements": [
                {"tags": {"highway": "residential"}, "lat": 45.308, "lon": 10.068},
                {"tags": {"building": "yes"}, "lat": 45.307, "lon": 10.067},
                {"tags": {"amenity": "hospital", "name": "Test Hospital"}, "lat": 45.3075, "lon": 10.0675},
                {"tags": {"leisure": "park", "name": "Central Park"}, "lat": 45.309, "lon": 10.069},
                {"tags": {"public_transport": "station", "name": "Train Station"}, "lat": 45.310, "lon": 10.070}
            ]
        }
        
        analysis = self.service.analyze_site_context(raw_data, 45.307, 10.067)
        
        self.assertEqual(analysis["site_location"]["latitude"], 45.307)
        self.assertEqual(analysis["road_hierarchy"]["residential"], 1)
        self.assertEqual(analysis["building_density"], "Low") # only 1 building
        
        self.assertEqual(len(analysis["significant_surroundings"]), 1)
        self.assertEqual(analysis["significant_surroundings"][0]["name"], "Test Hospital")
        
        self.assertEqual(len(analysis["open_spaces"]), 1)
        self.assertEqual(analysis["open_spaces"][0]["name"], "Central Park")
        
        self.assertEqual(len(analysis["public_transport"]), 1)
        self.assertEqual(analysis["public_transport"][0]["name"], "Train Station")

    def test_format_as_markdown(self):
        analysis = {
            "site_location": {"latitude": 45.307, "longitude": 10.067, "address": "Cascina"},
            "analysis_radius_m": 3000,
            "site_character": "Dense Urban",
            "building_density": "High",
            "building_uses": ["commercial", "hospital"],
            "road_hierarchy": {"motorway": 1, "primary": 2, "secondary": 0, "tertiary": 0, "residential": 50},
            "public_transport": [{"name": "Metro", "type": "station", "distance_m": 500}],
            "open_spaces": [{"name": "Hyde Park", "type": "park", "distance_m": 1200}],
            "blue_infrastructure": [],
            "significant_surroundings": []
        }
        
        markdown = self.service.format_as_markdown(analysis)
        self.assertTrue("Dense Urban" in markdown)
        self.assertTrue("Metro (station)" in markdown)
        self.assertTrue("Hyde Park (park)" in markdown)
        self.assertTrue("OpenStreetMap" in markdown)

if __name__ == '__main__':
    unittest.main()
