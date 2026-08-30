import json
import random
import numpy as np
import os
import joblib
import pandas as pd

def calibrate_uncertainty(model_path="backend/model.joblib", csv_path="backend/iceberg_trajectories.csv"):
    if not os.path.exists(csv_path):
        print(f"Dataset {csv_path} not found. Generating default uncertainties...")
        return {
            "uncertainty_10": 12.0,
            "uncertainty_30": 24.0,
            "uncertainty_60": 48.0
        }
        
    try:
        model = joblib.load(model_path)
        df = pd.read_csv(csv_path)
    except Exception as e:
        print(f"Error loading model or dataset: {e}. Using fallback uncertainties.")
        return {
            "uncertainty_10": 12.0,
            "uncertainty_30": 24.0,
            "uncertainty_60": 48.0
        }
        
    feature_cols = ["x", "y", "vx", "vy", "wind_speed", "wind_dir", "current_speed", "current_dir"]
    target_cols = ["dx_10", "dy_10", "dx_30", "dy_30", "dx_60", "dy_60"]
    
    X = df[feature_cols]
    y = df[target_cols].values
    
    preds = model.predict(X)
    
    err_10 = np.hypot(preds[:, 0] - y[:, 0], preds[:, 1] - y[:, 1])
    err_30 = np.hypot(preds[:, 2] - y[:, 2], preds[:, 3] - y[:, 3])
    err_60 = np.hypot(preds[:, 4] - y[:, 4], preds[:, 5] - y[:, 5])
    
    u_10 = float(np.percentile(err_10, 95))
    u_30 = float(np.percentile(err_30, 95))
    u_60 = float(np.percentile(err_60, 95))
    
    u_10 = max(5.0, u_10)
    u_30 = max(u_10 + 5.0, u_30)
    u_60 = max(u_30 + 10.0, u_60)
    
    res = {
        "uncertainty_10": round(u_10, 2),
        "uncertainty_30": round(u_30, 2),
        "uncertainty_60": round(u_60, 2)
    }
    return res

def astar_search(start, dest, icebergs, current, sea_ice_conc, weights, ship_speed=20.0):
    # INCREASED RESOLUTION: 72x48 (50x50 world-unit cells) — matches aiNavigator.js
    grid_cols = 72
    grid_rows = 48
    width = 3600
    height = 2400
    cell_w = width / grid_cols    # 50.0 world-units
    cell_h = height / grid_rows   # 50.0 world-units
    
    start_c = max(0, min(grid_cols - 1, int(start["x"] // cell_w)))
    start_r = max(0, min(grid_rows - 1, int(start["y"] // cell_h)))
    end_c = max(0, min(grid_cols - 1, int(dest["x"] // cell_w)))
    end_r = max(0, min(grid_rows - 1, int(dest["y"] // cell_h)))
    
    import heapq
    open_set = []
    heapq.heappush(open_set, (0.0, start_r, start_c))
    
    came_from = {}
    g_score = {(start_r, start_c): 0.0}
    g_distance = {(start_r, start_c): 0.0}
    closed_set = set()
    
    dirs = [
        (0, -1), (0, 1), (-1, 0), (1, 0),
        (-1, -1), (-1, 1), (1, -1), (1, 1)
    ]
    
    found = False
    
    def is_hard_blocked_py(r, c, eta_hours):
        """True ONLY for genuine physical collision (iceberg + ship radius).
        NO soft margin, NO uncertainty. Mirrors isHardBlocked() in aiNavigator.js."""
        cx = c * cell_w + cell_w / 2
        cy = r * cell_h + cell_h / 2
        for ice in icebergs:
            proj_x = ice["x"] + ice.get("vx", 0.0) * eta_hours * 1.5
            proj_y = ice["y"] + ice.get("vy", 0.0) * eta_hours * 1.5
            dist = np.hypot(cx - proj_x, cy - proj_y)
            hard_r = ice["collisionRadius"] + 15  # physical only
            if dist < hard_r:
                return True
        return False
    
    def get_traversal_cost_py(r, c, eta_hours):
        """Finite soft proximity penalty. NEVER returns >= 100000.
        Mirrors getTraversalCost() in aiNavigator.js."""
        cx = c * cell_w + cell_w / 2
        cy = r * cell_h + cell_h / 2
        cost = 1.0
        
        for ice in icebergs:
            proj_x = ice["x"] + ice.get("vx", 0.0) * eta_hours * 1.5
            proj_y = ice["y"] + ice.get("vy", 0.0) * eta_hours * 1.5
            
            dist = np.hypot(cx - proj_x, cy - proj_y)
            hard_r = ice["collisionRadius"] + 15
            u_radius = ice.get("uncertainty", 0.0)
            soft_inner = hard_r + u_radius * 0.3
            soft_outer = soft_inner + 200.0
            
            if dist < soft_outer:
                t = max(0.0, 1.0 - (dist - soft_inner) / (soft_outer - soft_inner))
                cost += t * t * weights["icebergWeight"] * 1.5  # was *10, now *1.5
                
        cost += sea_ice_conc * weights["seaIceWeight"] * 2.0
        return cost

    while open_set:
        f, r, c = heapq.heappop(open_set)
        
        if r == end_r and c == end_c:
            found = True
            break
            
        curr_key = (r, c)
        if curr_key in closed_set:
            continue
        closed_set.add(curr_key)
        
        for dr, dc in dirs:
            nr, nc = r + dr, c + dc
            if nr < 0 or nr >= grid_rows or nc < 0 or nc >= grid_cols:
                continue
                
            neighbor_key = (nr, nc)
            if neighbor_key in closed_set:
                continue
            move_dist = 1.414 if (dr != 0 and dc != 0) else 1.0
            
            step_dist_su = np.hypot(dc * cell_w, dr * cell_h)
            curr_dist = g_distance.get(curr_key, 0.0)
            tentative_dist = curr_dist + step_dist_su
            
            eta_hours = tentative_dist / (3600.0 * ship_speed)
            
            # Hard block: physical collision only
            if is_hard_blocked_py(nr, nc, eta_hours):
                continue
            
            # Soft traversal cost: finite, never blocks
            cell_cost = get_traversal_cost_py(nr, nc, eta_hours)
            
            # Current penalty
            move_dir_x = dc * cell_w
            move_dir_y = dr * cell_h
            move_len = np.hypot(move_dir_x, move_dir_y)
            if move_len > 0:
                move_dir_x /= move_len
                move_dir_y /= move_len
                
            dot = current["u"] * move_dir_x + current["v"] * move_dir_y
            cross = abs(current["u"] * move_dir_y - current["v"] * move_dir_x)
            
            env_penalty = 0.0
            if dot > 0:
                env_penalty -= dot * weights["currentWeight"]
            else:
                env_penalty -= dot * weights["currentWeight"] * 1.5
            env_penalty += cross * weights["crossCurrentWeight"]
            
            # Turning penalty
            turn_penalty = 0.0
            prev_node = came_from.get(curr_key)
            if prev_node:
                prev_dr = r - prev_node[0]
                prev_dc = c - prev_node[1]
                if prev_dr != dr or prev_dc != dc:
                    turn_penalty = weights["turnPenalty"]
                    
            raw_traverse_cost = move_dist * cell_cost + env_penalty + turn_penalty
            traverse_cost = max(0.2 * move_dist, raw_traverse_cost)
            
            tentative_g = g_score[curr_key] + traverse_cost
            
            if neighbor_key not in g_score or tentative_g < g_score[neighbor_key]:
                came_from[neighbor_key] = curr_key
                g_score[neighbor_key] = tentative_g
                g_distance[neighbor_key] = tentative_dist
                h = np.hypot(nc - end_c, nr - end_r) * weights["heuristicWeight"]
                heapq.heappush(open_set, (tentative_g + h, nr, nc))
                
    waypoints = []
    if found:
        curr = (end_r, end_c)
        while curr:
            waypoints.append({
                "x": curr[1] * cell_w + cell_w / 2,
                "y": curr[0] * cell_h + cell_h / 2
            })
            curr = came_from.get(curr)
        waypoints.reverse()
        waypoints[0] = {"x": start["x"], "y": start["y"]}
        waypoints[-1] = {"x": dest["x"], "y": dest["y"]}
    else:
        waypoints = [start, dest]
        
    return waypoints

def evaluate_scenario(scenario, weights, uncertainties):
    start = scenario["start"]
    dest = scenario["dest"]
    icebergs = scenario["icebergs"]
    current = scenario["current"]
    sea_ice = scenario["sea_ice"]
    
    for ice in icebergs:
        ice["uncertainty"] = uncertainties.get("uncertainty_30", 24.0)
        
    waypoints = astar_search(start, dest, icebergs, current, sea_ice, weights)
    
    collision = False
    min_clearance = float('inf')
    total_distance = 0.0
    turn_count = 0
    
    if len(waypoints) < 2:
        return {"collision": True, "clearance": 0.0, "distance": 9999.0, "turns": 99, "waypoints": waypoints, "efficiency": 0.0, "detour_ratio": 0.0}
        
    accumulated_distance = 0.0
    for i in range(len(waypoints) - 1):
        ptA = waypoints[i]
        ptB = waypoints[i+1]
        dx = ptB["x"] - ptA["x"]
        dy = ptB["y"] - ptA["y"]
        seg_len = np.hypot(dx, dy)
        total_distance += seg_len
        
        if i > 0:
            prev_pt = waypoints[i-1]
            v1 = (ptA["x"] - prev_pt["x"], ptA["y"] - prev_pt["y"])
            v2 = (ptB["x"] - ptA["x"], ptB["y"] - ptA["y"])
            len1 = np.hypot(*v1)
            len2 = np.hypot(*v2)
            if len1 > 0 and len2 > 0:
                dot = (v1[0]*v2[0] + v1[1]*v2[1]) / (len1 * len2)
                if dot < 0.95:
                    turn_count += 1
                    
        num_samples = max(3, int(np.ceil(seg_len / 40.0)))
        for k in range(num_samples + 1):
            ratio = k / num_samples
            sx = ptA["x"] + ratio * dx
            sy = ptA["y"] + ratio * dy
            sample_dist = accumulated_distance + ratio * seg_len
            eta_sample = sample_dist / (3600.0 * 20.0)
            
            for ice in icebergs:
                proj_x = ice["x"] + ice.get("vx", 0.0) * eta_sample * 1.5
                proj_y = ice["y"] + ice.get("vy", 0.0) * eta_sample * 1.5
                dist = np.hypot(proj_x - sx, proj_y - sy)
                # Physical clearance (no soft margin)
                hard_r = ice["collisionRadius"] + 15
                eff_dist = dist - hard_r
                if eff_dist < min_clearance:
                    min_clearance = eff_dist
                if dist < hard_r:  # actual physical collision only
                    collision = True
        
        accumulated_distance += seg_len
                
    straight_line = np.hypot(dest["x"] - start["x"], dest["y"] - start["y"])
    efficiency = straight_line / total_distance if total_distance > 0 else 0.0
    detour_ratio = total_distance / straight_line if straight_line > 0 else 1.0
    
    return {
        "collision": collision,
        "clearance": max(0.0, min_clearance),
        "distance": total_distance,
        "turns": turn_count,
        "efficiency": efficiency,
        "detour_ratio": detour_ratio,
        "waypoints": waypoints
    }

def get_regression_scenarios():
    return [
        {
            "name": "1. Static Iceberg Obstacle",
            "start": {"x": 400, "y": 1800},
            "dest": {"x": 3200, "y": 400},
            "icebergs": [{"x": 1800, "y": 1100, "vx": 0.0, "vy": 0.0, "collisionRadius": 100}],
            "current": {"u": 0.0, "v": 0.0},
            "sea_ice": 0.0
        },
        {
            "name": "2. Crossing Iceberg Trajectory",
            "start": {"x": 400, "y": 1800},
            "dest": {"x": 3200, "y": 400},
            "icebergs": [{"x": 1800, "y": 600, "vx": 0.0, "vy": 12.0, "collisionRadius": 80}],
            "current": {"u": 0.0, "v": 0.0},
            "sea_ice": 0.0
        },
        {
            "name": "3. Iceberg Moving Towards Route",
            "start": {"x": 400, "y": 1800},
            "dest": {"x": 3200, "y": 400},
            "icebergs": [{"x": 2200, "y": 1500, "vx": -8.0, "vy": -6.0, "collisionRadius": 80}],
            "current": {"u": 0.0, "v": 0.0},
            "sea_ice": 0.0
        },
        {
            "name": "4. Iceberg Moving Away From Route",
            "start": {"x": 400, "y": 1800},
            "dest": {"x": 3200, "y": 400},
            "icebergs": [{"x": 1800, "y": 1100, "vx": 15.0, "vy": 15.0, "collisionRadius": 100}],
            "current": {"u": 0.0, "v": 0.0},
            "sea_ice": 0.0
        },
        {
            "name": "5. Multiple Icebergs",
            "start": {"x": 400, "y": 1800},
            "dest": {"x": 3200, "y": 400},
            "icebergs": [
                {"x": 1200, "y": 1500, "vx": 0.0, "vy": 0.0, "collisionRadius": 60},
                {"x": 2200, "y": 800, "vx": 0.0, "vy": 0.0, "collisionRadius": 60}
            ],
            "current": {"u": 0.0, "v": 0.0},
            "sea_ice": 0.0
        },
        {
            "name": "6. Narrow Safe Passage",
            "start": {"x": 400, "y": 1800},
            "dest": {"x": 3200, "y": 400},
            "icebergs": [
                {"x": 1800, "y": 900, "vx": 0.0, "vy": 0.0, "collisionRadius": 80},
                {"x": 2000, "y": 1300, "vx": 0.0, "vy": 0.0, "collisionRadius": 80}
            ],
            "current": {"u": 0.0, "v": 0.0},
            "sea_ice": 0.0
        },
        {
            "name": "7. Strong Current & Wind",
            "start": {"x": 400, "y": 1800},
            "dest": {"x": 3200, "y": 400},
            "icebergs": [],
            "current": {"u": -5.0, "v": 3.0},
            "sea_ice": 0.2
        },
        {
            "name": "8. High Uncertainty Forecast",
            "start": {"x": 400, "y": 1800},
            "dest": {"x": 3200, "y": 400},
            "icebergs": [{"x": 1800, "y": 1100, "vx": 0.0, "vy": 0.0, "collisionRadius": 50}],
            "current": {"u": 0.0, "v": 0.0},
            "sea_ice": 0.5
        },
        {
            "name": "9. Above vs Below Safety Choice",
            "start": {"x": 400, "y": 1800},
            "dest": {"x": 3200, "y": 400},
            "icebergs": [{"x": 1800, "y": 1000, "vx": 0.0, "vy": 10.0, "collisionRadius": 90}],
            "current": {"u": 0.0, "v": 0.0},
            "sea_ice": 0.0
        },
        {
            "name": "10. Rerouting after predicted collision",
            "start": {"x": 400, "y": 1800},
            "dest": {"x": 3200, "y": 400},
            "icebergs": [{"x": 1800, "y": 1100, "vx": -3.0, "vy": -3.0, "collisionRadius": 80}],
            "current": {"u": 2.0, "v": -2.0},
            "sea_ice": 0.1
        },
        {
            "name": "11. Gap Traversal - Must Use Corridor Not Detour",
            # Two icebergs forming a wall with a large passable gap at destination y-level.
            # Router must navigate THROUGH the gap, not take a huge detour around.
            "start": {"x": 400, "y": 1200},
            "dest":  {"x": 3200, "y": 1200},
            "icebergs": [
                {"x": 1800, "y": 600,  "vx": 0.0, "vy": 0.0, "collisionRadius": 80},
                {"x": 1800, "y": 1800, "vx": 0.0, "vy": 0.0, "collisionRadius": 80},
            ],
            "current": {"u": 0.0, "v": 0.0},
            "sea_ice": 0.0
        },
        {
            "name": "12. Gap - Tight But Physically Passable",
            # Gap of ~540 units at the avoid-zone level; tests corridor vs detour preference.
            "start": {"x": 400, "y": 1200},
            "dest":  {"x": 3200, "y": 1200},
            "icebergs": [
                {"x": 1800, "y": 900,  "vx": 0.0, "vy": 0.0, "collisionRadius": 80},
                {"x": 1800, "y": 1500, "vx": 0.0, "vy": 0.0, "collisionRadius": 80},
            ],
            "current": {"u": 0.0, "v": 0.0},
            "sea_ice": 0.0
        },
    ]

def train_learned_cost_weights():
    random.seed(42)
    np.random.seed(42)
    
    uncertainties = calibrate_uncertainty()
    scenarios = get_regression_scenarios()
    
    best_score = float('inf')
    best_weights = None
    
    for _ in range(120):
        candidate = {
            "icebergWeight": round(random.uniform(8.0, 15.0), 2),
            "seaIceWeight": round(random.uniform(3.0, 7.0), 2),
            "currentWeight": round(random.uniform(0.1, 0.4), 2),
            "crossCurrentWeight": round(random.uniform(0.1, 0.4), 2),
            "riskWeight": round(random.uniform(4.0, 8.0), 2),
            "turnPenalty": round(random.uniform(0.1, 0.3), 2),
            "heuristicWeight": 1.0,
            "smoothingTolerance": 15
        }
        
        total_score = 0.0
        for sc in scenarios:
            res = evaluate_scenario(sc, candidate, uncertainties)
            
            if res["collision"]:
                total_score += 10000000.0
            
            if res["clearance"] < 30.0:
                total_score += (30.0 - res["clearance"]) * 5000.0
                
            total_score += res["distance"] * 1.5
            total_score += res["turns"] * candidate["turnPenalty"] * 100.0
            
        if total_score < best_score:
            best_score = total_score
            best_weights = candidate
            
    print(f"Calibration completed. Best weights: {best_weights}")
    
    current_dir = os.path.dirname(os.path.abspath(__file__))
    target_dir = os.path.abspath(os.path.join(current_dir, "../src/data"))
    os.makedirs(target_dir, exist_ok=True)
    
    with open(os.path.join(target_dir, "routeCalibration.json"), "w") as f:
        json.dump(best_weights, f, indent=2)
        
    with open(os.path.join(target_dir, "uncertaintyCalibration.json"), "w") as f:
        json.dump(uncertainties, f, indent=2)
        
    print("\n" + "="*50)
    print("ROUTE REGRESSION & SCENARIO EVALUATION REPORT")
    print("="*50)
    
    collisions = 0
    total_clearance = 0
    total_efficiency = 0
    invalid_routes = 0
    
    for sc in scenarios:
        res = evaluate_scenario(sc, best_weights, uncertainties)
        is_collision = res["collision"]
        if is_collision:
            collisions += 1
        
        if sc["name"] == "9. Above vs Below Safety Choice":
            assert not is_collision, "Scenario 9 (Above vs Below Choice) must be collision-free"
            assert res["clearance"] >= 30.0, f"Scenario 9 clearance is too low: {res['clearance']:.1f}"
            assert res["distance"] < 3500.0, f"Scenario 9 chosen route is not efficient: {res['distance']:.1f}"
        
        # Regression: gap-traversal scenarios must not take a huge detour
        if sc["name"] in ("11. Gap Traversal — Must Use Corridor Not Detour",
                           "12. Gap — Tight But Physically Passable"):
            assert not is_collision, f"{sc['name']} must be collision-free"
            detour = res.get("detour_ratio", 1.0)
            assert detour < 1.5, f"{sc['name']} detour ratio {detour:.3f} is excessive (>1.5)"
            
        if res["clearance"] != float('inf'):
            total_clearance += res["clearance"]
        total_efficiency += res["efficiency"]
        
        has_nan = any(not np.isfinite(pt["x"]) or not np.isfinite(pt["y"]) for pt in res["waypoints"])
        if has_nan or len(res["waypoints"]) < 2:
            invalid_routes += 1
            
        status = "CRITICAL COLLISION" if is_collision else "SAFE AVOIDANCE"
        detour_str = f"{res.get('detour_ratio', 0.0):.3f}"
        print(f"Scenario: {sc['name']:<42} | Status: {status:<18} | Clearance: {res['clearance']:6.1f} | Detour: {detour_str} | Turns: {res['turns']:<2}")
        
    sc_count = len(scenarios)
    print("-"*50)
    print(f"Scenarios Tested:      {sc_count}")
    print(f"Collision Rate:        {collisions / sc_count * 100:.1f}%")
    print(f"Avoidance Success:     {(sc_count - collisions) / sc_count * 100:.1f}%")
    print(f"Average Clearance:     {total_clearance / (sc_count - 1):.1f} SU")
    print(f"Average Efficiency:    {total_efficiency / sc_count * 100:.1f}%")
    print(f"Invalid/NaN Routes:    {invalid_routes}")
    print("="*50)
    
    return best_weights

if __name__ == "__main__":
    train_learned_cost_weights()
