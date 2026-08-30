"""
DEEP GAP ROUTING TEST: Verifies A* uses a gap when the only alternative is an extreme detour.
Tests the actual failure: soft-buffer high costs + heuristic bias preventing gap traversal.
"""
import sys, numpy as np
sys.path.insert(0, 'backend')
from route_audit import (
    astar_with_diagnostics, get_cell_cost, is_hard_blocked, probe_corridor,
    CELL_W, CELL_H, GRID_COLS, GRID_ROWS, SHIP_SPEED, WEIGHTS
)

print("="*70)
print("TEST 1: Wall of icebergs — gap is the ONLY path")
print("="*70)
# Create a horizontal wall of icebergs with one gap in the middle
# Ship must pass through the gap or route extremely far around
wall_icebergs = []
for y_pos in [750, 1050, 1500, 1800]:  # wall positions (leaving a gap at y=1050..1500 => gap=450)
    wall_icebergs.append({"x": 1800, "y": y_pos, "vx": 0.0, "vy": 0.0, "collisionRadius": 100, "uncertainty": 10.0})

start = {"x": 400, "y": 1200}  # ship at center-left
dest  = {"x": 3200, "y": 1200} # destination at center-right (same y = gap center)

print("Wall icebergs at y=[750, 1050, 1500, 1800], gap between y=1050+avoid and y=1500-avoid")
avoid_r = 100 + 15 + 30 + 10.0*0.4  # = 149.0
top_of_gap_zone    = 1050 + avoid_r
bottom_of_gap_zone = 1500 - avoid_r
print(f"avoidR = {avoid_r:.1f}")
print(f"Gap zone: y={top_of_gap_zone:.1f} to {bottom_of_gap_zone:.1f}, width = {bottom_of_gap_zone-top_of_gap_zone:.1f}")

waypoints, stats = astar_with_diagnostics(start, dest, wall_icebergs)
straight_dist = np.hypot(dest["x"]-start["x"], dest["y"]-start["y"])
total_dist = sum(np.hypot(waypoints[i+1]["x"]-waypoints[i]["x"],
                           waypoints[i+1]["y"]-waypoints[i]["y"])
                 for i in range(len(waypoints)-1))

print(f"\nA* route: {len(waypoints)} waypoints")
print(f"Detour ratio: {total_dist/straight_dist:.3f}")
gap_traversed = any(top_of_gap_zone < w["y"] < bottom_of_gap_zone for w in waypoints if 1600 < w["x"] < 2000)
print(f"Gap traversed at wall: {gap_traversed}")
print(f"Route waypoints near wall: {[(round(w['x']),round(w['y'])) for w in waypoints if 1400 < w['x'] < 2200]}")


print("\n" + "="*70)
print("TEST 2: Gap at destination's Y-level — heuristic should FAVOR gap path")
print("="*70)
# This tests whether A* naturally takes the gap when it's aligned with the destination
icebergs2 = [
    {"x": 1800, "y": 600,  "vx": 0.0, "vy": 0.0, "collisionRadius": 80, "uncertainty": 10.0},
    {"x": 1800, "y": 1400, "vx": 0.0, "vy": 0.0, "collisionRadius": 80, "uncertainty": 10.0},
]
# Gap center: (600+129 + 1400-129)/2 = (729+1271)/2 = 1000
# Direct route from (400,1200) to (3200,1200) at x=1800 has y=1200 -> IN the gap
start2 = {"x": 400, "y": 1200}
dest2  = {"x": 3200, "y": 1200}
waypoints2, stats2 = astar_with_diagnostics(start2, dest2, icebergs2)
t_dist2 = sum(np.hypot(waypoints2[i+1]["x"]-waypoints2[i]["x"],
                        waypoints2[i+1]["y"]-waypoints2[i]["y"])
              for i in range(len(waypoints2)-1))
s_dist2 = np.hypot(dest2["x"]-start2["x"], dest2["y"]-start2["y"])
avoid_r2 = 80 + 15 + 30 + 10.0*0.4
gap_cells = any((600+avoid_r2) < w["y"] < (1400-avoid_r2) for w in waypoints2 if 1600 < w["x"] < 2000)
print(f"Gap available from y={600+avoid_r2:.0f} to y={1400-avoid_r2:.0f} (width={(1400-avoid_r2)-(600+avoid_r2):.0f})")
print(f"Direct path y=1200 is in gap: {(600+avoid_r2) < 1200 < (1400-avoid_r2)}")
print(f"A* detour ratio: {t_dist2/s_dist2:.3f}")
print(f"Gap used at wall: {gap_cells}")

print("\n" + "="*70)
print("TEST 3: Identify the ACTUAL failure - when does A* prefer a huge detour over a tight-but-clear gap?")
print("="*70)
# Two icebergs forming a near-wall with a small but physically passable gap
# gap width in avoid-zone terms ~100 units
icebergs3 = [
    {"x": 1800, "y": 900,  "vx": 0.0, "vy": 0.0, "collisionRadius": 80, "uncertainty": 10.0},
    {"x": 1800, "y": 1200, "vx": 0.0, "vy": 0.0, "collisionRadius": 80, "uncertainty": 10.0},
]
avoid_r3 = 80 + 15 + 30 + 10.0*0.4
gap3_top = 900 + avoid_r3
gap3_bot = 1200 - avoid_r3
print(f"Gap: y={gap3_top:.0f} to {gap3_bot:.0f}, width={gap3_bot-gap3_top:.1f}")
print(f"Gap width / cell height = {(gap3_bot-gap3_top)/CELL_H:.2f} cells")

# With 75-unit cells, gap width = 1200-129-900-129 = 42 -- LESS THAN ONE CELL
# This is Failure Mode B: grid resolution too coarse to see the gap!

# Scan cost profile at x=1800:
print("\nCost profile at x=1800 (c=24):")
for r_idx in range(9, 20):
    cy = r_idx * CELL_H + CELL_H / 2
    cost = get_cell_cost(r_idx, 24, 0.05, icebergs3)
    blocked = is_hard_blocked(r_idx, 24, 0.05, icebergs3)
    in_gap = gap3_top < cy < gap3_bot
    print(f"  r={r_idx:2d} y={cy:7.1f}: cost={cost:10.1f}  hard_blocked={blocked}  in_gap={in_gap}")

print(f"\nConclusion: gap width = {gap3_bot-gap3_top:.1f} units.")
if gap3_bot - gap3_top < CELL_W:
    print(f"FAILURE MODE B CONFIRMED: gap ({gap3_bot-gap3_top:.1f}) < cell size ({CELL_W}). No traversable node in gap!")
else:
    print(f"Gap is {(gap3_bot-gap3_top)/CELL_W:.1f} cells wide - at least one node exists.")


print("\n" + "="*70)
print("TEST 4: Soft-buffer cost analysis - what penalty does a 'through gap' cell incur?")
print("="*70)
# The gap cell costs 73 (from both icebergs' soft buffers)
# A detour cell (far from icebergs) costs 1.0
# So A* pays 73x more to go through the gap than the detour
# BUT the detour is MUCH longer in euclidean distance
# The question is: is g_score(gap) + h(gap) < g_score(detour) + h(detour)?

# From (400, 1800) to (3200, 400):
# Route through gap center (1838, 1088): 
#   g ~ dist_to_gap = hypot(1838-400, 1088-1800)*75/75 * 73 (cost per unit = 73)
#   Actually g is accumulated cost NOT distance

# Let's compute approximate g-costs manually for the two paths:
start3 = {"x": 400, "y": 1800}
dest3  = {"x": 3200, "y": 400}

# Through gap: path goes from (400,1800) diagonally to gap at (~1838, 1088), cost per cell ~73
# Above: path goes from (400,1800) diagonally to top (1838, 412), cost per cell ~1

# Euclidean grid-distance to gap center (c=24,r=14): 
dist_to_gap = np.hypot(24 - int(400//75), 14 - int(1800//75))
dist_to_top = np.hypot(24 - int(400//75), 5  - int(1800//75))  # r=5 is y~412

print(f"Grid dist to gap center: {dist_to_gap:.2f}")
print(f"Grid dist to top (above): {dist_to_top:.2f}")

# Approximate g-scores (cost*dist):
approx_g_gap  = dist_to_gap * 73.0   # 73 average cost through soft buffer zone
approx_g_top  = dist_to_top * 1.0    # 1.0 cost away from obstacles

# h from gap vs h from top:
end_c, end_r = int(3200//75), int(400//75)
h_gap  = np.hypot(24 - end_c, 14 - end_r)
h_top  = np.hypot(24 - end_c, 5  - end_r)

print(f"\nApprox f-score via gap: g={approx_g_gap:.1f} + h={h_gap:.2f} = {approx_g_gap + h_gap:.1f}")
print(f"Approx f-score via top: g={approx_g_top:.1f} + h={h_top:.2f} = {approx_g_top + h_top:.1f}")
print(f"\n>>> VERDICT: {'Gap path has HIGHER f-score -> A* prefers detour (FAILURE MODE C/D!)' if approx_g_gap + h_gap > approx_g_top + h_top else 'Gap path has LOWER f-score -> A* should prefer gap'}")
print(f">>> The soft-buffer penalty ({73.0:.0f}x normal cost) combined with the heuristic creates")
print(f"    an artificially high f-score for the gap path, making the detour ALWAYS cheaper in A* terms.")
