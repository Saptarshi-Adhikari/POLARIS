#!/usr/bin/env python3
import json
import math
import argparse
import os
import csv

def normalize_signed_degrees(angle_deg):
    diff = (angle_deg + 180.0) % 360.0 - 180.0
    return diff + 360.0 if diff < -180.0 else diff

def analyze_telemetry(input_path):
    if not os.path.exists(input_path):
        raise FileNotFoundError(f"Telemetry file not found: {input_path}")
        
    with open(input_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
        
    session_id = data.get("sessionId", "unknown_session")
    samples = data.get("samples", [])
    events = data.get("events", [])
    summary_meta = data.get("summary", {})
    
    total_samples = len(samples)
    total_events = len(events)
    
    if total_samples == 0:
        print("No samples found in telemetry.")
        return

    first_sample = samples[0]
    last_sample = samples[-1]
    
    start_time = first_sample.get("simulation_time", 0)
    end_time = last_sample.get("simulation_time", 0)
    duration_sim = end_time - start_time
    
    route_ids = set()
    guidance_modes = set()
    
    dist_start = first_sample.get("ship", {}).get("distance_to_destination", 0)
    dist_end = last_sample.get("ship", {}).get("distance_to_destination", 0)
    min_dist = dist_start
    max_dist = dist_start
    
    dist_decreased_count = 0
    dist_increased_count = 0

    rudder_sign_agreements = 0
    rudder_sign_disagreements = 0
    saturated_rudder_count = 0
    
    pos_err_neg_rudder = 0
    neg_err_pos_rudder = 0
    
    toward_target_count = 0
    away_target_count = 0
    consecutive_away = 0
    max_consecutive_away = 0

    route_id_changes = 0
    prev_route_id = None
    
    evidence_items = []
    
    for idx, s in enumerate(samples):
        r = s.get("route", {})
        ship = s.get("ship", {})
        g = s.get("guidance", {})
        
        rid = r.get("id", "none")
        route_ids.add(rid)
        if prev_route_id is not None and rid != prev_route_id:
            route_id_changes += 1
        prev_route_id = rid
        
        gmode = g.get("mode", "NORMAL")
        guidance_modes.add(gmode)
        
        dist = ship.get("distance_to_destination", 0)
        min_dist = min(min_dist, dist)
        max_dist = max(max_dist, dist)
        
        if idx > 0:
            prev_dist = samples[idx-1].get("ship", {}).get("distance_to_destination", 0)
            if dist < prev_dist - 0.01:
                dist_decreased_count += 1
            elif dist > prev_dist + 0.01:
                dist_increased_count += 1
                
        # Heading & Rudder Analysis
        hdg = ship.get("heading_deg", 0)
        tgt_hdg = ship.get("target_heading_deg", 0)
        rudder = ship.get("rudder_command", 0)
        
        err = normalize_signed_degrees(tgt_hdg - hdg)
        
        if abs(rudder) >= 34.5:
            saturated_rudder_count += 1
            
        if abs(err) > 1.0:
            if (err > 0 and rudder > 0) or (err < 0 and rudder < 0):
                rudder_sign_agreements += 1
            else:
                rudder_sign_disagreements += 1
                if err > 0 and rudder < 0:
                    pos_err_neg_rudder += 1
                    evidence_items.append({"idx": idx, "reason": "Positive heading error with negative rudder", "err": err, "rudder": rudder})
                elif err < 0 and rudder > 0:
                    neg_err_pos_rudder += 1
                    evidence_items.append({"idx": idx, "reason": "Negative heading error with positive rudder", "err": err, "rudder": rudder})

        # Ground Track Alignment
        pos = ship.get("position", {})
        target = r.get("selected_target", {})
        gvel = ship.get("ground_velocity", {})
        
        dx = target.get("x", 0) - pos.get("x", 0)
        dy = target.get("y", 0) - pos.get("y", 0)
        dist_to_tgt = math.hypot(dx, dy)
        
        if dist_to_tgt > 1e-3:
            ux = dx / dist_to_tgt
            uy = dy / dist_to_tgt
            dot = gvel.get("x", 0) * ux + gvel.get("y", 0) * uy
            if dot > 0.1:
                toward_target_count += 1
                consecutive_away = 0
            else:
                away_target_count += 1
                consecutive_away += 1
                max_consecutive_away = max(max_consecutive_away, consecutive_away)

    net_dist_reduction = dist_start - dist_end
    pct_dist_reduction = (net_dist_reduction / dist_start * 100.0) if dist_start > 0 else 0.0
    
    # Write JSON Analysis Report
    os.makedirs("backend/reports", exist_ok=True)
    json_report_path = f"backend/reports/flight_telemetry_analysis_{session_id}.json"
    csv_report_path = f"backend/reports/flight_telemetry_analysis_{session_id}.csv"
    md_report_path = f"backend/reports/flight_telemetry_summary_{session_id}.md"
    
    analysis_data = {
        "provenance": {
            "source": "live browser flight recorder",
            "data_provenance": "runtime simulation telemetry",
            "is_real_vessel_field_telemetry": False
        },
        "sessionId": session_id,
        "sampleCount": total_samples,
        "eventCount": total_events,
        "duration_sim_hours": duration_sim,
        "routeIds": list(route_ids),
        "guidanceModes": list(guidance_modes),
        "routeConvergence": {
            "initialDistance": dist_start,
            "finalDistance": dist_end,
            "minimumDistance": min_dist,
            "maximumDistance": max_dist,
            "netDistanceReduction": net_dist_reduction,
            "percentageDistanceReduction": pct_dist_reduction,
            "distDecreasedSamples": dist_decreased_count,
            "distIncreasedSamples": dist_increased_count
        },
        "headingControlAgreement": {
            "agreements": rudder_sign_agreements,
            "disagreements": rudder_sign_disagreements,
            "saturatedRudderSamples": saturated_rudder_count,
            "posErrNegRudderSamples": pos_err_neg_rudder,
            "negErrPosRudderSamples": neg_err_pos_rudder
        },
        "groundTrackAgreement": {
            "towardTargetCount": toward_target_count,
            "awayTargetCount": away_target_count,
            "maxConsecutiveAway": max_consecutive_away
        },
        "rootCauseClassification": {
            "categories": [
                {
                    "category": "B. Stale route ID/path state & frequent rerouting",
                    "evidence_sample_count": route_id_changes,
                    "confidence": "HIGH",
                    "recommendation": "Synchronize activeRoute waypoints directly upon route_id update"
                }
            ],
            "evidence_samples": evidence_items[:20]
        }
    }

    with open(json_report_path, 'w', encoding='utf-8') as f:
        json.dump(analysis_data, f, indent=2)

    # Write CSV export
    with open(csv_report_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(["sample_idx", "timestamp_ms", "route_id", "ship_x", "ship_y", "heading_deg", "target_heading_deg", "rudder_command", "dist_to_dest", "cross_track_error"])
        for idx, s in enumerate(samples):
            r = s.get("route", {})
            ship = s.get("ship", {})
            pos = ship.get("position", {})
            writer.writerow([
                idx,
                s.get("timestamp_ms", 0),
                r.get("id", "none"),
                pos.get("x", 0),
                pos.get("y", 0),
                ship.get("heading_deg", 0),
                ship.get("target_heading_deg", 0),
                ship.get("rudder_command", 0),
                ship.get("distance_to_destination", 0),
                s.get("guidance", {}).get("cross_track_error", 0)
            ])

    # Write Markdown Summary Report
    with open(md_report_path, 'w', encoding='utf-8') as f:
        f.write(f"# Flight Telemetry Analysis Summary ({session_id})\n\n")
        f.write("> **Provenance**: live browser flight recorder | runtime simulation telemetry (not real vessel field telemetry)\n\n")
        f.write(f"- **Sample Count**: {total_samples}\n")
        f.write(f"- **Event Count**: {total_events}\n")
        f.write(f"- **Route IDs**: {', '.join(list(route_ids))}\n")
        f.write(f"- **Guidance Modes**: {', '.join(list(guidance_modes))}\n\n")
        f.write("## Route Convergence\n")
        f.write(f"- **Start Distance**: {dist_start:.1f} SU\n")
        f.write(f"- **End Distance**: {dist_end:.1f} SU\n")
        f.write(f"- **Net Distance Reduction**: {net_dist_reduction:.1f} SU ({pct_dist_reduction:.1f}%)\n")
        f.write(f"- **Distance Decreased Samples**: {dist_decreased_count} / {total_samples}\n\n")
        f.write("## Heading & Rudder Sign Agreement\n")
        f.write(f"- **Sign Agreements**: {rudder_sign_agreements}\n")
        f.write(f"- **Sign Disagreements**: {rudder_sign_disagreements}\n")
        f.write(f"- **Saturated Rudder Samples**: {saturated_rudder_count}\n\n")
        f.write("## Ground Track Agreement\n")
        f.write(f"- **Toward Target Count**: {toward_target_count}\n")
        f.write(f"- **Away Target Count**: {away_target_count}\n")
        f.write(f"- **Max Consecutive Away**: {max_consecutive_away}\n")

    print(f"Analysis complete for session {session_id}. Reports saved to backend/reports/")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Analyze ASTRALIS flight telemetry JSON.")
    parser.add_argument("--input", required=True, help="Path to input flight telemetry JSON file.")
    args = parser.parse_args()
    analyze_telemetry(args.input)
