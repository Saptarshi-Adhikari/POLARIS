"""
STEP 1 & 2: Diagnostic audit for POLARIS A* routing over-conservative detours.
Instruments the routing pipeline and identifies the root cause(s).
"""
import numpy as np
import heapq
import json
import os

# ── Configuration mirrors aiNavigator.js exactly ──────────────────────────────
GRID_COLS = 48
GRID_ROWS = 32
WIDTH     = 3600
HEIGHT    = 2400
CELL_W    = WIDTH  / GRID_COLS   # 75.0 world-units
CELL_H    = HEIGHT / GRID_ROWS   # 75.0 world-units

WEIGHTS = {
    "icebergWeight":      13.84,
    "seaIceWeight":        5.81,
    "currentWeight":       0.28,
    "crossCurrentWeight":  0.40,
    "riskWeight":          6.62,
    "turnPenalty":         0.10,
    "heuristicWeight":     1.00,
}

UNCERTAINTIES = {
    "uncertainty_10": 5.0,
    "uncertainty_30": 10.0,
    "uncertainty_60": 20.0,
}

SHIP_SPEED = 20.0  # world-units per second


# ── Exact copy of get_cell_cost from aiNavigator.js + route_training.py ───────
def get_cell_cost(r, c, eta_hours, icebergs):
    cx = c * CELL_W + CELL_W / 2
    cy = r * CELL_H + CELL_H / 2
    cost = 1.0

    for ice in icebergs:
        proj_x = ice["x"] + ice.get("vx", 0.0) * eta_hours * 1.5
        proj_y = ice["y"] + ice.get("vy", 0.0) * eta_hours * 1.5

        dist = np.hypot(cx - proj_x, cy - proj_y)
        collision_r   = ice["collisionRadius"] + 15          # +15 ship radius
        u_radius      = ice.get("uncertainty", 0.0)
        total_avoid_r = collision_r + 30 + u_radius * 0.4   # +30 margin

        if dist < total_avoid_r:
            cost += 100000.0
        elif dist < total_avoid_r + 150:
            t = 1.0 - (dist - total_avoid_r) / 150.0
            cost += t * t * WEIGHTS["icebergWeight"] * 10.0

    return cost


def is_hard_blocked(r, c, eta_hours, icebergs):
    """Returns True ONLY for genuine physical collision (cost ≥ 100k)."""
    cx = c * CELL_W + CELL_W / 2
    cy = r * CELL_H + CELL_H / 2
    for ice in icebergs:
        proj_x = ice["x"] + ice.get("vx", 0.0) * eta_hours * 1.5
        proj_y = ice["y"] + ice.get("vy", 0.0) * eta_hours * 1.5
        dist = np.hypot(cx - proj_x, cy - proj_y)
        collision_r   = ice["collisionRadius"] + 15
        u_radius      = ice.get("uncertainty", 0.0)
        total_avoid_r = collision_r + 30 + u_radius * 0.4
        if dist < total_avoid_r:
            return True
    return False


# ── Corridor probe helper ──────────────────────────────────────────────────────
def probe_corridor(name, waypoints, icebergs):
    """Checks every sample along a candidate path and reports clearance."""
    if len(waypoints) < 2:
        return {"name": name, "safe": False, "min_clearance": 0, "total_dist": 0}
    
    total_dist = 0
    min_clearance = float('inf')
    collision = False
    
    accumulated = 0.0
    for i in range(len(waypoints) - 1):
        pA, pB = waypoints[i], waypoints[i+1]
        dx = pB[0] - pA[0]; dy = pB[1] - pA[1]
        seg_len = np.hypot(dx, dy)
        total_dist += seg_len
        num_samples = max(5, int(np.ceil(seg_len / 40)))
        for k in range(num_samples + 1):
            ratio = k / num_samples
            sx = pA[0] + ratio * dx
            sy = pA[1] + ratio * dy
            sample_dist = accumulated + ratio * seg_len
            eta = sample_dist / (3600.0 * SHIP_SPEED)
            for ice in icebergs:
                proj_x = ice["x"] + ice.get("vx", 0.0) * eta * 1.5
                proj_y = ice["y"] + ice.get("vy", 0.0) * eta * 1.5
                dist = np.hypot(proj_x - sx, proj_y - sy)
                clearance = dist - (ice["collisionRadius"] + 15)  # true physical clearance
                if clearance < min_clearance:
                    min_clearance = clearance
                total_avoid_r = ice["collisionRadius"] + 15 + 30 + ice.get("uncertainty", 0.0) * 0.4
                if dist < total_avoid_r:
                    collision = True
        accumulated += seg_len
    
    return {
        "name": name,
        "safe": not collision,
        "min_clearance": min_clearance if min_clearance != float('inf') else 9999,
        "total_dist": total_dist
    }


# ── Failure-mode checklist ─────────────────────────────────────────────────────
def diagnose_scenario(scenario_name, start, dest, icebergs):
    print(f"\n{'='*70}")
    print(f"DIAGNOSTIC: {scenario_name}")
    print(f"{'='*70}")

    # Add uncertainty to icebergs (mirror evaluate_scenario)
    for ice in icebergs:
        ice.setdefault("uncertainty", UNCERTAINTIES["uncertainty_30"])

    # ── FAILURE MODE A: Safety-radius overlap closing the gap ──────────────────
    print("\n[A] Safety-radius overlap analysis:")
    print(f"    Grid cell size: {CELL_W:.1f} x {CELL_H:.1f} world-units")
    for i, ice in enumerate(icebergs):
        cr = ice["collisionRadius"] + 15
        u  = ice.get("uncertainty", 0.0)
        total_avoid = cr + 30 + u * 0.4
        print(f"    Iceberg {i}: pos=({ice['x']:.0f},{ice['y']:.0f}), "
              f"collRadius={ice['collisionRadius']}, "
              f"totalAvoidRadius={total_avoid:.1f}  (ship can only pass if gap > {total_avoid*2:.0f})")

    if len(icebergs) >= 2:
        for i in range(len(icebergs)):
            for j in range(i+1, len(icebergs)):
                gap = np.hypot(icebergs[i]["x"] - icebergs[j]["x"],
                               icebergs[i]["y"] - icebergs[j]["y"])
                avoid_i = icebergs[i]["collisionRadius"] + 15 + 30 + icebergs[i].get("uncertainty",0)*0.4
                avoid_j = icebergs[j]["collisionRadius"] + 15 + 30 + icebergs[j].get("uncertainty",0)*0.4
                combined = avoid_i + avoid_j
                merged = gap < combined
                print(f"    Gap between iceberg {i} and {j}: {gap:.1f} world-units, "
                      f"combined exclusion zones: {combined:.1f}  → "
                      f"{'⚠ MERGED (gap CLOSED)' if merged else '✓ Open corridor'}")

    # ── FAILURE MODE B: Grid resolution vs corridor width ─────────────────────
    print("\n[B] Grid resolution vs corridor width:")
    print(f"    Cell size: W={CELL_W:.1f}  H={CELL_H:.1f}")
    if len(icebergs) >= 2:
        for i in range(len(icebergs)):
            for j in range(i+1, len(icebergs)):
                gap = np.hypot(icebergs[i]["x"] - icebergs[j]["x"],
                               icebergs[i]["y"] - icebergs[j]["y"])
                avoid_i = icebergs[i]["collisionRadius"] + 15 + 30 + icebergs[i].get("uncertainty",0)*0.4
                avoid_j = icebergs[j]["collisionRadius"] + 15 + 30 + icebergs[j].get("uncertainty",0)*0.4
                passable_gap = gap - avoid_i - avoid_j
                nodes_in_gap = passable_gap / CELL_W
                print(f"    Physical passable gap = {passable_gap:.1f} world-units = "
                      f"{nodes_in_gap:.2f} grid nodes wide  → "
                      f"{'⚠ TOO NARROW for grid resolution' if nodes_in_gap < 1.5 else '✓ At least 1 node fits'}")

    # ── FAILURE MODE C: Hard-block threshold leaking soft costs ───────────────
    print("\n[C] Hard-block threshold analysis (cost >= 100000 = skip):")
    print("    Formula: collisionRadius+15+30+uncertainty*0.4 → triggers 100000 penalty")
    print("    This threshold is based on AVOID radius (NOT just collision radius).")
    print("    Any cell within the soft-buffer zone (total_avoid_r+150) also adds")
    print("    soft cost up to 13840.  If the only path through has such cells,")
    print("    they won't be hard-blocked but will be VERY expensive — that is OK.")
    print("    However if soft-buffer zones OVERLAP, a narrow corridor may have no")
    print("    cheap cells, forcing A* to route around the cluster even when passable.")

    # ── FAILURE MODE D: A* corridor comparison — scan above/through/below ─────
    print("\n[D] Candidate corridor enumeration:")
    start_pt = [start["x"], start["y"]]
    dest_pt  = [dest["x"],  dest["y"]]
    
    # Compute midpoints for each iceberg to determine above/below
    if icebergs:
        ice0 = icebergs[0]
        mid_x = (start["x"] + dest["x"]) / 2
        
        # Paths to test
        above_y  = ice0["y"] - (ice0["collisionRadius"] + 15 + 30 + ice0.get("uncertainty",0)*0.4 + CELL_H)
        below_y  = ice0["y"] + (ice0["collisionRadius"] + 15 + 30 + ice0.get("uncertainty",0)*0.4 + CELL_H)
        through_y = ice0["y"]
        
        candidates = {
            "above":   [(start_pt[0], start_pt[1]), (mid_x, above_y),  (dest_pt[0], dest_pt[1])],
            "through": [(start_pt[0], start_pt[1]), (mid_x, through_y),(dest_pt[0], dest_pt[1])],
            "below":   [(start_pt[0], start_pt[1]), (mid_x, below_y),  (dest_pt[0], dest_pt[1])],
        }
        
        for cname, cwpts in candidates.items():
            result = probe_corridor(cname, cwpts, icebergs)
            status = "✓ SAFE" if result["safe"] else "✗ BLOCKED"
            print(f"    {cname:12}: {status}  clearance={result['min_clearance']:.1f}  dist={result['total_dist']:.0f}")

    # ── FAILURE MODE E: Uncertainty inflation analysis ─────────────────────────
    print("\n[E] Uncertainty calibration values:")
    print(f"    uncertainty_10min : {UNCERTAINTIES['uncertainty_10']:.1f} world-units")
    print(f"    uncertainty_30min : {UNCERTAINTIES['uncertainty_30']:.1f} world-units")
    print(f"    uncertainty_60min : {UNCERTAINTIES['uncertainty_60']:.1f} world-units")
    print(f"    Applied multiplier: ×0.4 in safety radius")
    for k, v in UNCERTAINTIES.items():
        effective = v * 0.4
        print(f"    {k}: effective addition to avoid radius = {effective:.1f}")

    # ── Run actual A* and report selected path ─────────────────────────────────
    print("\n[A* Route Selection]:")
    waypoints, stats = astar_with_diagnostics(start, dest, icebergs)
    
    straight_dist = np.hypot(dest["x"] - start["x"], dest["y"] - start["y"])
    total_dist = sum(np.hypot(waypoints[i+1]["x"]-waypoints[i]["x"],
                               waypoints[i+1]["y"]-waypoints[i]["y"])
                     for i in range(len(waypoints)-1))
    detour_ratio = total_dist / straight_dist if straight_dist > 0 else 1.0
    
    # Clearance of selected route
    probe_wpts = [(w["x"], w["y"]) for w in waypoints]
    selected_result = probe_corridor("selected", probe_wpts, icebergs)
    
    print(f"    Nodes visited: {stats['nodes_visited']}")
    print(f"    Hard-blocked skips: {stats['hard_blocked_count']}")
    print(f"    Route waypoints: {len(waypoints)}")
    print(f"    Total distance: {total_dist:.1f}  (straight line: {straight_dist:.1f})")
    print(f"    Detour ratio: {detour_ratio:.3f}  ({'⚠ EXCESSIVE (>1.3)' if detour_ratio > 1.3 else '✓ OK'})")
    print(f"    Min clearance (selected): {selected_result['min_clearance']:.1f}")
    print(f"    Route safe: {selected_result['safe']}")
    print(f"    Route path (approx): {[(round(w['x']), round(w['y'])) for w in waypoints]}")
    
    return {
        "waypoints": waypoints,
        "detour_ratio": detour_ratio,
        "selected_clearance": selected_result["min_clearance"],
        "is_safe": selected_result["safe"],
        "stats": stats
    }


def astar_with_diagnostics(start, dest, icebergs):
    """A* implementation mirroring aiNavigator.js exactly, with diagnostic counters."""
    start_c = max(0, min(GRID_COLS - 1, int(start["x"] // CELL_W)))
    start_r = max(0, min(GRID_ROWS - 1, int(start["y"] // CELL_H)))
    end_c   = max(0, min(GRID_COLS - 1, int(dest["x"]  // CELL_W)))
    end_r   = max(0, min(GRID_ROWS - 1, int(dest["y"]  // CELL_H)))

    open_set = []
    heapq.heappush(open_set, (0.0, start_r, start_c))
    came_from  = {}
    g_score    = {(start_r, start_c): 0.0}
    g_distance = {(start_r, start_c): 0.0}
    closed_set = set()

    dirs = [(0,-1),(0,1),(-1,0),(1,0),(-1,-1),(-1,1),(1,-1),(1,1)]

    nodes_visited    = 0
    hard_blocked_cnt = 0
    found = False
    final_r, final_c = end_r, end_c

    while open_set:
        f, r, c = heapq.heappop(open_set)
        if (r, c) in closed_set:
            continue
        closed_set.add((r, c))
        nodes_visited += 1

        if r == end_r and c == end_c:
            found = True
            final_r, final_c = r, c
            break

        curr_key = (r, c)
        for dr, dc in dirs:
            nr, nc = r + dr, c + dc
            if nr < 0 or nr >= GRID_ROWS or nc < 0 or nc >= GRID_COLS:
                continue

            step_dist = np.hypot(dc * CELL_W, dr * CELL_H)
            curr_dist = g_distance.get(curr_key, 0.0)
            tent_dist = curr_dist + step_dist
            eta_hours = tent_dist / (3600.0 * SHIP_SPEED)

            cell_cost = get_cell_cost(nr, nc, eta_hours, icebergs)
            if cell_cost >= 100000.0:
                hard_blocked_cnt += 1
                continue

            move_dist    = 1.414 if (dr != 0 and dc != 0) else 1.0
            turn_penalty = 0.0
            prev = came_from.get(curr_key)
            if prev:
                prev_dr = r - prev[0]
                prev_dc = c - prev[1]
                if prev_dr != dr or prev_dc != dc:
                    turn_penalty = WEIGHTS["turnPenalty"]

            raw_cost    = move_dist * cell_cost + turn_penalty
            traverse    = max(0.2 * move_dist, raw_cost)
            tent_g      = g_score[curr_key] + traverse
            neighbor    = (nr, nc)

            if neighbor not in g_score or tent_g < g_score[neighbor]:
                came_from[neighbor]  = curr_key
                g_score[neighbor]    = tent_g
                g_distance[neighbor] = tent_dist
                h = np.hypot(nc - end_c, nr - end_r) * WEIGHTS["heuristicWeight"]
                heapq.heappush(open_set, (tent_g + h, nr, nc))

    waypoints = []
    if found:
        curr = (final_r, final_c)
        while curr:
            waypoints.append({"x": curr[1]*CELL_W + CELL_W/2, "y": curr[0]*CELL_H + CELL_H/2})
            curr = came_from.get(curr)
        waypoints.reverse()
        waypoints[0]  = start
        waypoints[-1] = dest
    else:
        waypoints = [start, dest]

    stats = {"nodes_visited": nodes_visited, "hard_blocked_count": hard_blocked_cnt}
    return waypoints, stats


# ── MAIN: Run key diagnostic scenarios ────────────────────────────────────────
if __name__ == "__main__":
    results = {}

    # Scenario A: Narrow gap — two icebergs with a passable corridor
    results["narrow_gap"] = diagnose_scenario(
        "NARROW GAP: Two icebergs with real corridor",
        start   = {"x": 400,  "y": 1800},
        dest    = {"x": 3200, "y": 400},
        icebergs= [
            {"x": 1800, "y": 900,  "vx": 0.0, "vy": 0.0, "collisionRadius": 80},
            {"x": 1800, "y": 1300, "vx": 0.0, "vy": 0.0, "collisionRadius": 80},
        ],
    )

    # Scenario B: Same but gap is genuinely too narrow (should detour)
    results["blocked_gap"] = diagnose_scenario(
        "BLOCKED GAP: Overlapping safety zones, detour required",
        start   = {"x": 400,  "y": 1800},
        dest    = {"x": 3200, "y": 400},
        icebergs= [
            {"x": 1800, "y": 900,  "vx": 0.0, "vy": 0.0, "collisionRadius": 130},
            {"x": 1800, "y": 1200, "vx": 0.0, "vy": 0.0, "collisionRadius": 130},
        ],
    )

    # Scenario C: Above vs through vs below (from regression suite Scenario 9)
    results["above_vs_below"] = diagnose_scenario(
        "ABOVE vs BELOW: Iceberg moving down, above should be chosen",
        start   = {"x": 400,  "y": 1800},
        dest    = {"x": 3200, "y": 400},
        icebergs= [{"x": 1800, "y": 1000, "vx": 0.0, "vy": 10.0, "collisionRadius": 90}],
    )

    # Scenario D: Single central blockage — route MUST deviate
    results["single_block"] = diagnose_scenario(
        "SINGLE BLOCK: Single iceberg in middle of direct path",
        start   = {"x": 400,  "y": 1200},
        dest    = {"x": 3200, "y": 1200},
        icebergs= [{"x": 1800, "y": 1200, "vx": 0.0, "vy": 0.0, "collisionRadius": 100}],
    )

    print("\n\n" + "="*70)
    print("ROOT CAUSE SUMMARY")
    print("="*70)
    for name, r in results.items():
        print(f"  {name:25}: detour={r['detour_ratio']:.3f}  clearance={r['selected_clearance']:.1f}  safe={r['is_safe']}")
