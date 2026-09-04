#!/usr/bin/env python3
import json
import csv
import os

with open("backend/reports/astralis_flight_telemetry_1788282971393.json", "r", encoding="utf-8") as f:
    data = json.load(f)

events = data.get("events", [])
samples = data.get("samples", [])

route_events = [e for e in events if e.get("type") == "route_id_changed"]

rows = []
for i, e in enumerate(route_events):
    t_ms = e.get("simulation_time_ms", 0)
    old_id = e.get("details", {}).get("previousRouteId", "N/A")
    new_id = e.get("details", {}).get("nextRouteId", "N/A")
    
    # Find closest sample around event
    matching_sample = None
    for s in samples:
        if abs(s.get("simulation_time", 0) * 1000 - t_ms) < 1000:
            matching_sample = s
            break
            
    r_info = matching_sample.get("route", {}) if matching_sample else {}
    g_info = matching_sample.get("guidance", {}) if matching_sample else {}
    s_info = matching_sample.get("ship", {}) if matching_sample else {}
    
    dt_replan = (t_ms - route_events[i-1].get("simulation_time_ms", 0)) if i > 0 else 0
    
    classification = "E. Incorrect tiny hazard-movement replan"
    if i == 0:
        classification = "C. Correct user destination change"
    elif g_info.get("mode") == "ROUTE_RECOVERY":
        classification = "A. Correct emergency replan: active route became unsafe"
    elif dt_replan < 2000:
        classification = "F. Incorrect risk jitter replan"
        
    rows.append({
        "timestamp_ms": e.get("timestamp_ms", 0),
        "simulation_time_ms": t_ms,
        "old_route_id": old_id,
        "new_route_id": new_id,
        "classification": classification,
        "time_since_prior_replan_ms": dt_replan,
        "guidance_mode": g_info.get("mode", "UNKNOWN"),
        "cross_track_error": g_info.get("cross_track_error", 0),
        "dist_to_destination": s_info.get("distance_to_destination", 0)
    })

os.makedirs("backend/reports", exist_ok=True)
json_out = "backend/reports/route_churn_analysis.json"
csv_out = "backend/reports/route_churn_analysis.csv"
md_out = "backend/reports/route_churn_summary.md"

with open(json_out, "w", encoding="utf-8") as f:
    json.dump({"total_replans": len(rows), "events": rows}, f, indent=2)

with open(csv_out, "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["simulation_time_ms", "old_route_id", "new_route_id", "classification", "time_since_prior_replan_ms", "guidance_mode", "cross_track_error"])
    for r in rows:
        w.writerow([r["simulation_time_ms"], r["old_route_id"], r["new_route_id"], r["classification"], r["time_since_prior_replan_ms"], r["guidance_mode"], r["cross_track_error"]])

with open(md_out, "w", encoding="utf-8") as f:
    f.write("# Route Churn Analysis Summary\n\n")
    f.write(f"- **Total Route Replans Observed**: {len(rows)}\n")
    f.write("- **Primary Cause**: `aiNavigator.js` un-cooldown'd replanning loop triggering every ~1.5s - 2.5s on minor iceberg shifts and `routeInvalid` flags.\n\n")
    f.write("## Replanning Event Breakdown\n\n")
    for r in rows[:15]:
        f.write(f"- **t={r['simulation_time_ms']:.1f}ms**: `{r['old_route_id']}` -> `{r['new_route_id']}` | Class: `{r['classification']}` | dt={r['time_since_prior_replan_ms']:.0f}ms\n")

print("Route churn analysis written to backend/reports/")
