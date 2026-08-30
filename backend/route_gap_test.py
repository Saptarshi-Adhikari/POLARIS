"""
Tests whether A* actually uses a gap when it's the shortest safe path.
"""
import sys, numpy as np
sys.path.insert(0, 'backend')
from route_audit import (
    astar_with_diagnostics, get_cell_cost, is_hard_blocked,
    CELL_W, CELL_H, GRID_COLS, GRID_ROWS, SHIP_SPEED, WEIGHTS
)

print("--- Checking direct-path gap feasibility ---")
icebergs = [
    {"x": 1800, "y": 900,  "vx": 0.0, "vy": 0.0, "collisionRadius": 80, "uncertainty": 10.0},
    {"x": 1800, "y": 1300, "vx": 0.0, "vy": 0.0, "collisionRadius": 80, "uncertainty": 10.0},
]

# Direct route from (400,1800) to (3200,400) at x=1800:
direct_y = 1800 + (400-1800) * (1800-400)/(3200-400)
print(f"Direct route y at x=1800: {direct_y:.1f}")
avoid0_bottom = 900  + 80 + 15 + 30 + 10.0*0.4   # = 129.0
avoid1_top    = 1300 - 80 - 15 - 30 - 10.0*0.4   # = 171.0
print(f"Iceberg 0 avoid-zone BOTTOM: {avoid0_bottom:.1f}")
print(f"Iceberg 1 avoid-zone TOP:    {avoid1_top:.1f}")
print(f"Gap passable: {avoid0_bottom < avoid1_top}, gap width: {avoid1_top - avoid0_bottom:.1f}")
print(f"Direct path y={direct_y:.1f} is IN the gap: {avoid0_bottom < direct_y < avoid1_top}")

# Check specific grid cell in the gap
c, r = 24, 14  # approx x=1837.5, y=1087.5
cx = c * CELL_W + CELL_W / 2
cy = r * CELL_H + CELL_H / 2
print(f"\nCell (r={r},c={c}) center: ({cx:.1f}, {cy:.1f})")
for i, ice in enumerate(icebergs):
    d = np.hypot(cx - ice["x"], cy - ice["y"])
    avoid_r = ice["collisionRadius"] + 15 + 30 + ice.get("uncertainty", 0.0)*0.4
    cost = get_cell_cost(r, c, 0.05, icebergs)
    print(f"  vs iceberg {i}: dist={d:.1f}, totalAvoidR={avoid_r:.1f}, "
          f"HARD_BLOCKED={d < avoid_r}, cellCost={cost:.1f}")

# Run A* and see if it routes through the gap
start = {"x": 400, "y": 1800}
dest  = {"x": 3200, "y": 400}
waypoints, stats = astar_with_diagnostics(start, dest, icebergs)
print(f"\nA* found route with {len(waypoints)} waypoints")
print(f"Hard-blocked skips: {stats['hard_blocked_count']}")

gap_traversed = False
for w in waypoints:
    if 1600 < w["x"] < 2000:
        in_gap = avoid0_bottom < w["y"] < avoid1_top
        print(f"  wp at x={w['x']:.0f}: y={w['y']:.0f} -> in_gap={in_gap}")
        if in_gap:
            gap_traversed = True

if gap_traversed:
    print("RESULT: A* CORRECTLY routes through the gap!")
else:
    print("RESULT: A* AVOIDS the gap (takes detour around) - OVER-CONSERVATIVE!")

# Now test with SOFT-BUFFER overlap scenario
print("\n\n--- SOFT BUFFER OVERLAP TEST ---")
print("Icebergs with larger collision radii that create high-cost but passable corridor...")
icebergs2 = [
    {"x": 1800, "y": 900,  "vx": 0.0, "vy": 0.0, "collisionRadius": 80, "uncertainty": 10.0},
    {"x": 1800, "y": 1300, "vx": 0.0, "vy": 0.0, "collisionRadius": 80, "uncertainty": 10.0},
]

# Check what cost the corridor cell has from BOTH icebergs' soft buffers
gap_cell_c, gap_cell_r = 24, 14  # center of gap
gap_cx = gap_cell_c * CELL_W + CELL_W / 2
gap_cy = gap_cell_r * CELL_H + CELL_H / 2
cost_at_gap = get_cell_cost(gap_cell_r, gap_cell_c, 0.05, icebergs2)
# Cost of a cell diagonally to this grid (y=862 = r=11, off the iceberg)
cost_detour = get_cell_cost(11, 24, 0.03, icebergs2)
print(f"Cost at gap center ({gap_cx:.0f},{gap_cy:.0f}): {cost_at_gap:.1f}")
print(f"Cost at detour cell (above icebergs, approx y=862): {cost_detour:.1f}")
print(f"Cost ratio gap/detour: {cost_at_gap/cost_detour:.2f}")
print(f"=> If gap is MUCH more expensive than detour, A* will always prefer detour.")
print(f"   This is Failure Mode C (soft cost too high) masquerading as hard blockage!")

# Scan cells across the gap (x=1800 column, varying y)
print("\nCost profile across x=1800 column (y from 750 to 1500):")
for r_idx in range(10, 22):
    cy2 = r_idx * CELL_H + CELL_H / 2
    cost2 = get_cell_cost(r_idx, 24, 0.05, icebergs2)
    blocked = is_hard_blocked(r_idx, 24, 0.05, icebergs2)
    in_gap = avoid0_bottom < cy2 < avoid1_top
    print(f"  r={r_idx:2d} y={cy2:7.1f}: cost={cost2:8.1f}  hard_blocked={blocked}  in_gap={in_gap}")
