"""POLARIS Vessel Navigation & Ice Risk Assessment Laya Integration Example."""
import os
import sys
import json

# Add backend directory to Python path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.laya_client import PolarisLayaClient, LayaClientError, LayaConnectionError

def run_polaris_navigation_assessment():
    print("==================================================")
    print("POLARIS VESSEL ICE NAVIGATION & SAFETY ASSESSMENT")
    print("==================================================")

    client = PolarisLayaClient()

    # 1. Health Check
    print("\n1. Checking Laya Decision Engine Health...")
    try:
        health = client.check_health()
        print(f"   API Status      : {health['status']}")
        print(f"   GPU Device      : {health['gpu']}")
        print(f"   Active Device   : {health['active_device']}")
    except LayaConnectionError as err:
        print(f"   [ERROR] Connection failed: {err}")
        print("   Make sure the Laya API server is running on http://127.0.0.1:8000")
        return
    except LayaClientError as err:
        print(f"   [ERROR] Health check failed: {err}")
        return

    # 2. POLARIS Vessel Navigation State
    vessel_telemetry_state = {
        "vessel_name": "R/V POLARIS Sentinel",
        "ice_class": "PC6 (Polar Class 6)",
        "coordinates": {"lat": -64.8, "lon": -63.5},
        "location": "Gerlache Strait, Antarctica",
        "ice_concentration": "7/10 multi-year sea ice pack",
        "nearest_iceberg_distance_m": 420,
        "wind_speed_knots": 34,
        "visibility_nautical_miles": 0.8,
        "notes": "vessel encountering rapid ice drift toward narrow fjord channel"
    }

    # 3. POLARIS Navigation Safety Questions
    navigation_questions = {
        "recommended_route_action": {
            "type": "choice",
            "instructions": "Which navigation strategy should the watch officer execute?",
            "criteria": {
                "maintain_course": "clear water ahead, ice concentration manageable",
                "reduce_speed_alter_course": "moderate ice hazard ahead, maneuver around pack",
                "stop_and_drift": "impassable heavy pack ice or severe fog visibility cutoff"
            }
        },
        "ice_hazard_severity": {
            "type": "score",
            "instructions": "Rate the structural damage risk to hull from sea ice.",
            "criteria": [
                "low hazard / thin brash ice",
                "moderate hazard / first-year ice floes",
                "critical hazard / thick multi-year ice floes or iceberg collision risk"
            ]
        },
        "icebreaker_escort_required": {
            "type": "noul",
            "instructions": "Does the vessel require icebreaker assistance to proceed safely?"
        }
    }

    # 4. Invoke POLARIS Laya Client
    print("\n2. Submitting Navigation Telemetry to Laya Decision Engine...")
    try:
        response = client.predict_decision(vessel_telemetry_state, navigation_questions)
    except LayaClientError as err:
        print(f"   [ERROR] Decision evaluation failed: {err}")
        return

    # 5. Process Decision Outputs
    routing = response["routing"]
    answers = response["answers"]

    print("\n==================================================")
    print("POLARIS DECISION SYSTEM RESPONSE")
    print("==================================================")
    print(f"Laya Model Selected : {routing['model']} ({routing['repo']})")
    print(f"Language / Script   : {routing['reason']}")
    print("-" * 50)
    print(f"Route Strategy      : {answers['recommended_route_action']['choice']} (Confidence: {answers['recommended_route_action']['confidence']:.2%})")
    print(f"Ice Hazard Severity : {answers['ice_hazard_severity']['score']:.2f} / 2.0 (Confidence: {answers['ice_hazard_severity']['confidence']:.2%})")
    print(f"Escort Required     : {answers['icebreaker_escort_required']['noul']:.2%} probability")
    print("==================================================")

def test_connection_failure():
    print("\n3. Testing Connection Failure Handling (invalid port)...")
    bad_client = PolarisLayaClient(base_url="http://127.0.0.1:9999", timeout=1.0)
    try:
        bad_client.check_health()
        print("   [FAIL] Expected LayaConnectionError was not raised")
    except LayaConnectionError as err:
        print(f"   [SUCCESS] Cleanly caught expected connection failure: {err}")

if __name__ == "__main__":
    run_polaris_navigation_assessment()
    test_connection_failure()
