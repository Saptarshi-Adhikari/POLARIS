import json

with open("backend/reports/astralis_flight_telemetry_1788282971393.json", "r", encoding="utf-8") as f:
    data = json.load(f)

events = data.get("events", [])
route_events = [e for e in events if e.get("type") in ("route_id_changed", "guidance_mode_changed")]

print(f"Total route/guidance events: {len(route_events)}")
for e in route_events[:30]:
    print(f"Time: {e.get('simulation_time_ms', 0):.1f}ms | Type: {e.get('type')} | RouteID: {e.get('route_id')} | Details: {e.get('details')}")
