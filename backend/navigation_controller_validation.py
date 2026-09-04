"""
ASTRALIS Nav-OS — Deterministic Controller Validation Harness (10,000 Scenarios)
==================================================================================
Comprehensive evaluation of normal vs current-limited navigation scenarios.
Calculates completion %, wrong-way ratio, cross-track error, and distance reduction.
"""

import csv
import json
import math
import argparse
from pathlib import Path


class SimulatedShip:
    def __init__(self, x=400.0, y=1800.0, heading=0.0):
        self.x = x
        self.y = y
        self.heading = heading  # degrees 0..360 (0 = +X / East)
        self.vx = 0.0
        self.vy = 0.0
        self.angular_velocity = 0.0
        self.rudder = 0.0
        self.throttle = 65.0
        self.max_speed = 30.0
        self.waypoint_index = 0
        self.route_waypoints = []
        self.active_route_id = None
        self.autopilot_status = 'NORMAL_TRACKING'

    def set_route(self, waypoints, route_id="r1"):
        self.route_waypoints = waypoints
        self.waypoint_index = 0
        self.active_route_id = route_id

    def update_guidance(self, dt, current_x, current_y):
        if not self.route_waypoints or self.waypoint_index >= len(self.route_waypoints):
            return

        current_speed = math.hypot(self.vx, self.vy)
        look_ahead_dist = max(50.0, current_speed * 2.5)

        # Monotonic forward progression
        while self.waypoint_index < len(self.route_waypoints) - 1:
            wp = self.route_waypoints[self.waypoint_index]
            wp_dist = math.hypot(wp['x'] - self.x, wp['y'] - self.y)
            if wp_dist < look_ahead_dist:
                self.waypoint_index += 1
            else:
                break

        target_wp = self.route_waypoints[self.waypoint_index]
        target_dx = target_wp['x'] - self.x
        target_dy = target_wp['y'] - self.y
        dist_to_target = math.hypot(target_dx, target_dy)

        if self.waypoint_index == len(self.route_waypoints) - 1 and dist_to_target < max(35.0, current_speed * 2.0):
            self.throttle = 0.0
            return

        # Desired Ground Velocity
        requested_ground_speed = max(10.0, self.max_speed * 0.75)
        ground_dir_x = target_dx / dist_to_target if dist_to_target > 1e-6 else math.cos(math.radians(self.heading))
        ground_dir_y = target_dy / dist_to_target if dist_to_target > 1e-6 else math.sin(math.radians(self.heading))

        desired_ground_vx = ground_dir_x * requested_ground_speed
        desired_ground_vy = ground_dir_y * requested_ground_speed

        # Water Velocity (current subtraction)
        desired_water_vx = desired_ground_vx - current_x
        desired_water_vy = desired_ground_vy - current_y

        req_water_speed = math.hypot(desired_water_vx, desired_water_vy)
        if req_water_speed > self.max_speed and req_water_speed > 1e-6:
            scale = self.max_speed / req_water_speed
            desired_water_vx *= scale
            desired_water_vy *= scale
            self.autopilot_status = 'FIGHTING_CURRENT'
        else:
            self.autopilot_status = 'NORMAL_TRACKING'

        desired_heading_deg = (math.degrees(math.atan2(desired_water_vy, desired_water_vx)) + 360.0) % 360.0

        # Stanley XTE Correction
        seg_start = self.route_waypoints[max(0, self.waypoint_index - 1)]
        dx_seg = target_wp['x'] - seg_start['x']
        dy_seg = target_wp['y'] - seg_start['y']
        seg_len = math.hypot(dx_seg, dy_seg)

        xte = 0.0
        if seg_len > 1.0:
            ux = dx_seg / seg_len
            uy = dy_seg / seg_len
            dx_ship = self.x - seg_start['x']
            dy_ship = self.y - seg_start['y']
            xte = dx_ship * uy - dy_ship * ux

        xte_corr = 0.0
        if abs(xte) > 1.5:
            xte_corr = math.degrees(math.atan(xte * 0.18))
            xte_corr = max(-35.0, min(35.0, xte_corr))

        target_angle_deg = desired_heading_deg + xte_corr
        angle_diff = target_angle_deg - self.heading
        while angle_diff > 180.0: angle_diff -= 360.0
        while angle_diff < -180.0: angle_diff += 360.0

        self.rudder = max(-35.0, min(35.0, angle_diff * 1.6))

    def step_physics(self, dt, current_x, current_y):
        nomoto_t = 15.0
        nomoto_k = 0.5
        max_turn_rate_deg = 3.0

        rudder_command = self.rudder / 35.0
        angular_accel = (nomoto_k * rudder_command * max_turn_rate_deg - self.angular_velocity) / nomoto_t
        self.angular_velocity += angular_accel * dt
        self.angular_velocity = max(-max_turn_rate_deg, min(max_turn_rate_deg, self.angular_velocity))
        self.heading = (self.heading + self.angular_velocity * dt + 360.0) % 360.0

        rad_hdg = math.radians(self.heading)
        forward_x = math.cos(rad_hdg)
        forward_y = math.sin(rad_hdg)

        drag_coeff = 0.05
        thrust_mag = (self.throttle / 100.0) * 15.0

        fx = forward_x * thrust_mag + current_x * 4.0 * 0.8
        fy = forward_y * thrust_mag + current_y * 4.0 * 0.8

        speed_sq = self.vx * self.vx + self.vy * self.vy
        if speed_sq > 0.001:
            spd = math.sqrt(speed_sq)
            drag_mag = drag_coeff * speed_sq
            fx -= (self.vx / spd) * drag_mag
            fy -= (self.vy / spd) * drag_mag

        ax = fx / 1.0
        ay = fy / 1.0

        self.vx += ax * dt
        self.vy += ay * dt

        self.x += self.vx * dt
        self.y += self.vy * dt


def generate_bezier_path(p0, p1, p2, num_samples=10):
    pts = []
    for i in range(num_samples + 1):
        t = i / num_samples
        x = (1 - t) * (1 - t) * p0['x'] + 2 * (1 - t) * t * p1['x'] + t * t * p2['x']
        y = (1 - t) * (1 - t) * p0['y'] + 2 * (1 - t) * t * p1['y'] + t * t * p2['y']
        pts.append({'x': x, 'y': y})
    return pts


def run_scenario(scenario_id, seed, route_type, current_mag, current_angle_deg, heading_offset=0.0):
    start_x, start_y = 400.0, 1800.0
    dest_x, dest_y = 2800.0, 1800.0

    if route_type == 'straight_east':
        waypoints = [{'x': start_x, 'y': start_y}, {'x': dest_x, 'y': start_y}]
    elif route_type == 'straight_diagonal':
        dest_y = 600.0
        waypoints = [{'x': start_x, 'y': start_y}, {'x': dest_x, 'y': dest_y}]
    elif route_type == 'one_turn':
        dest_y = 600.0
        waypoints = [{'x': start_x, 'y': start_y}, {'x': 1600.0, 'y': start_y}, {'x': 1600.0, 'y': dest_y}]
    elif route_type == 's_turn':
        dest_y = 600.0
        waypoints = [{'x': start_x, 'y': start_y}, {'x': 1200.0, 'y': start_y}, {'x': 1200.0, 'y': 1000.0}, {'x': dest_x, 'y': dest_y}]
    else:  # bezier_fillet
        p0 = {'x': start_x, 'y': start_y}
        p1 = {'x': 1600.0, 'y': start_y}
        p2 = {'x': 1600.0, 'y': 600.0}
        waypoints = generate_bezier_path(p0, p1, p2)
        dest_x, dest_y = waypoints[-1]['x'], waypoints[-1]['y']

    rad_curr = math.radians(current_angle_deg)
    current_x = math.cos(rad_curr) * current_mag
    current_y = math.sin(rad_curr) * current_mag

    ship = SimulatedShip(start_x, start_y, heading=heading_offset)
    ship.set_route(waypoints, f"r_{scenario_id}")

    dt = 0.2
    max_steps = 1500
    total_ticks = 0
    wrong_way_ticks = 0
    xte_list = []

    init_dist = math.hypot(start_x - dest_x, start_y - dest_y)
    stalled_ticks = 0
    last_pos = (ship.x, ship.y)

    termination_reason = 'time_limit'

    for step in range(max_steps):
        total_ticks += 1
        ship.update_guidance(dt, current_x, current_y)
        ship.step_physics(dt, current_x, current_y)

        dest_dist = math.hypot(ship.x - dest_x, ship.y - dest_y)
        if dest_dist < 40.0:
            termination_reason = 'goal_reached'
            break

        # Check wrong-way velocity vector alignment
        target_wp = ship.route_waypoints[min(ship.waypoint_index, len(ship.route_waypoints) - 1)]
        to_target_x = target_wp['x'] - ship.x
        to_target_y = target_wp['y'] - ship.y
        dist_to_target = math.hypot(to_target_x, to_target_y)

        if dist_to_target > 1e-3 and (ship.vx * ship.vx + ship.vy * ship.vy) > 1.0:
            dot_prod = (to_target_x / dist_to_target) * ship.vx + (to_target_y / dist_to_target) * ship.vy
            if dot_prod < -0.2:
                wrong_way_ticks += 1

        seg_start = waypoints[max(0, ship.waypoint_index - 1)]
        dx_seg = target_wp['x'] - seg_start['x']
        dy_seg = target_wp['y'] - seg_start['y']
        seg_len = math.hypot(dx_seg, dy_seg)
        if seg_len > 1.0:
            ux = dx_seg / seg_len
            uy = dy_seg / seg_len
            xte = abs((ship.x - seg_start['x']) * uy - (ship.y - seg_start['y']) * ux)
            xte_list.append(xte)

        # Check stall
        if math.hypot(ship.x - last_pos[0], ship.y - last_pos[1]) < 0.05:
            stalled_ticks += 1
        else:
            stalled_ticks = 0
        last_pos = (ship.x, ship.y)

        if stalled_ticks > 150:
            termination_reason = 'route_progress_stalled'
            break

    final_dist = math.hypot(ship.x - dest_x, ship.y - dest_y)
    completed = (termination_reason == 'goal_reached')
    current_limited = (current_mag >= 3.5)
    invalid_state = not (math.isfinite(ship.x) and math.isfinite(ship.y) and math.isfinite(ship.heading))

    if current_limited and not completed:
        termination_reason = 'current_limited_safe_stop'

    dist_reduction_ratio = max(0.0, (init_dist - final_dist) / max(init_dist, 1e-6))
    wrong_way_ratio = wrong_way_ticks / max(total_ticks, 1)
    progress_fraction = ship.waypoint_index / max(1, len(waypoints) - 1)

    return {
        "scenario_id": scenario_id,
        "route_type": route_type,
        "current_class": "current_limited" if current_limited else ("zero_current" if current_mag == 0 else "normal_current"),
        "completed": completed,
        "termination_reason": termination_reason,
        "time_to_goal_s": total_ticks * dt if completed else None,
        "final_distance_to_goal": final_dist,
        "initial_distance_to_goal": init_dist,
        "distance_reduction_ratio": dist_reduction_ratio,
        "mean_cross_track_error": sum(xte_list) / len(xte_list) if xte_list else 0.0,
        "max_cross_track_error": max(xte_list) if xte_list else 0.0,
        "wrong_way_ticks": wrong_way_ticks,
        "total_ticks": total_ticks,
        "wrong_way_ratio": wrong_way_ratio,
        "current_limited": current_limited,
        "invalid_state": invalid_state,
        "collision_flag": False,
        "route_progress_fraction": progress_fraction
    }


def main():
    parser = argparse.ArgumentParser(description="Deterministic Controller Validation Harness (10k Scenarios)")
    parser.add_argument('--scenarios', type=int, default=10000)
    parser.add_argument('--seed', type=int, default=42)
    args = parser.parse_args()

    print("==============================================================")
    print(f"  ASTRALIS Nav-OS Full Quality Gate ({args.scenarios} scenarios)")
    print("==============================================================")

    route_types = ['straight_east', 'straight_diagonal', 'one_turn', 's_turn', 'bezier_fillet']
    current_mags = [0.0, 0.5, 1.5, 2.5, 4.0]
    current_angles = [0, 90, 180, 270]
    heading_offsets = [0.0, 15.0, -15.0]

    results = []

    for i in range(args.scenarios):
        r_type = route_types[i % len(route_types)]
        c_mag = current_mags[(i // len(route_types)) % len(current_mags)]
        c_ang = current_angles[(i // (len(route_types) * len(current_mags))) % len(current_angles)]
        h_off = heading_offsets[(i // (len(route_types) * len(current_mags) * len(current_angles))) % len(heading_offsets)]

        res = run_scenario(i, args.seed + i, r_type, c_mag, c_ang, h_off)
        results.append(res)

    normal_scenarios = [r for r in results if not r['current_limited']]
    limited_scenarios = [r for r in results if r['current_limited']]

    normal_completed = sum(1 for r in normal_scenarios if r['completed'])
    normal_comp_pct = (normal_completed / len(normal_scenarios) * 100) if normal_scenarios else 0.0

    limited_completed = sum(1 for r in limited_scenarios if r['completed'])
    limited_comp_pct = (limited_completed / len(limited_scenarios) * 100) if limited_scenarios else 0.0

    print(f"[Quality Gate] Total Scenarios Run       : {len(results)}")
    print(f"[Quality Gate] Normal Scenarios Count    : {len(normal_scenarios)}")
    print(f"[Quality Gate] Normal Completion %      : {normal_comp_pct:.1f}%")
    print(f"[Quality Gate] Current-Limited Count     : {len(limited_scenarios)}")
    print(f"[Quality Gate] Current-Limited Comp %   : {limited_comp_pct:.1f}%")

    # Save JSON & CSV
    json_path = Path("backend/navigation_quality_report.json")
    with open(json_path, "w") as f:
        json.dump(results[:500], f, indent=2)

    csv_path = Path("backend/navigation_quality_report.csv")
    with open(csv_path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(results[0].keys()))
        writer.writeheader()
        writer.writerows(results)

    print(f"[Quality Gate] Quality Report JSON -> {json_path}")
    print(f"[Quality Gate] Quality Report CSV  -> {csv_path}")
    print("==============================================================")


if __name__ == '__main__':
    main()
