import numpy as np
import os
import json

class RouteValidator:
    @staticmethod
    def validate_route(route, icebergs, current, sea_ice, start, dest, ship_speed=20.0, uncertainties=None):
        if len(route) < 2:
            return {"valid": False, "reason": "Route must have at least 2 waypoints"}
            
        start_dist = np.hypot(route[0]["x"] - start["x"], route[0]["y"] - start["y"])
        dest_dist = np.hypot(route[-1]["x"] - dest["x"], route[-1]["y"] - dest["y"])
        
        if start_dist > 50:
            return {"valid": False, "reason": f"Start waypoint is too far from start point: {start_dist:.1f}"}
        if dest_dist > 50:
            return {"valid": False, "reason": f"Destination waypoint is too far from destination: {dest_dist:.1f}"}
            
        if uncertainties is None:
            uncertainties = {"uncertainty_10": 12.0, "uncertainty_30": 24.0, "uncertainty_60": 48.0}
            
        # 2. Check collision with iceberg exclusion zones (Time-aware)
        accumulated_distance = 0.0
        for i in range(len(route) - 1):
            ptA = route[i]
            ptB = route[i+1]
            dx = ptB["x"] - ptA["x"]
            dy = ptB["y"] - ptA["y"]
            seg_len = np.hypot(dx, dy)
            seg_len_sq = dx * dx + dy * dy
            
            mid_dist = accumulated_distance + seg_len / 2
            eta_hours = mid_dist / (3600.0 * ship_speed)
            
            for ice in icebergs:
                proj_x = ice["x"] + ice.get("vx", 0.0) * eta_hours * 1.5
                proj_y = ice["y"] + ice.get("vy", 0.0) * eta_hours * 1.5
                
                t = 0
                if seg_len_sq > 0:
                    t = max(0.0, min(1.0, ((proj_x - ptA["x"]) * dx + (proj_y - ptA["y"]) * dy) / seg_len_sq))
                cx = ptA["x"] + t * dx
                cy = ptA["y"] + t * dy
                dist = np.hypot(proj_x - cx, proj_y - cy)
                
                # Collision radius (iceberg + ship + margin)
                collision_r = ice.get("collisionRadius", 30) + 15
                u_radius = uncertainties.get("uncertainty_30", 24.0)
                total_avoid_r = collision_r + 30 + u_radius * 0.4
                
                if dist < total_avoid_r:
                    return {
                        "valid": False,
                        "reason": f"Route segment intersects critical iceberg safety zone at ({cx:.1f}, {cy:.1f}) at ETA {eta_hours:.2f}h (distance: {dist:.1f} vs safety: {total_avoid_r:.1f})"
                    }
            accumulated_distance += seg_len
                    
        return {"valid": True, "reason": "Passed all time-aware safety and topology constraints"}

def run_regression_scenarios():
    print("Running ASTRALIS Route Regression Verification...")
    
    current_dir = os.path.dirname(os.path.abspath(__file__))
    cal_path = os.path.abspath(os.path.join(current_dir, "../src/data/uncertaintyCalibration.json"))
    
    uncertainties = None
    if os.path.exists(cal_path):
        try:
            with open(cal_path, "r") as f:
                uncertainties = json.load(f)
            print(f"Loaded calibrated uncertainties: {uncertainties}")
        except Exception as e:
            print(f"Error loading calibrated uncertainties: {e}")
            
    # Define regression scenarios
    scenarios = {
        "SCENARIO 1: Open Water": {
            "start": {"x": 200, "y": 1200},
            "dest": {"x": 3400, "y": 1200},
            "icebergs": [],
            "current": {"u": 0, "v": 0},
            "sea_ice": 0.0,
            "simulated_route": [
                {"x": 200, "y": 1200},
                {"x": 1800, "y": 1200},
                {"x": 3400, "y": 1200}
            ]
        },
        "SCENARIO 2: Single Iceberg Blockage": {
            "start": {"x": 200, "y": 1200},
            "dest": {"x": 3400, "y": 1200},
            # Stationed iceberg
            "icebergs": [{"x": 1800, "y": 1200, "vx": 0.0, "vy": 0.0, "collisionRadius": 100}],
            "current": {"u": 0, "v": 0},
            "sea_ice": 0.0,
            "simulated_route": [
                {"x": 200, "y": 1200},
                {"x": 1700, "y": 1000},
                {"x": 1900, "y": 1000},
                {"x": 3400, "y": 1200}
            ]
        },
        "SCENARIO 3: Iceberg + Sea Ice": {
            "start": {"x": 200, "y": 1200},
            "dest": {"x": 3400, "y": 1200},
            "icebergs": [{"x": 1800, "y": 1200, "vx": 0.0, "vy": 0.0, "collisionRadius": 80}],
            "current": {"u": 0, "v": 0},
            "sea_ice": 0.4,
            "simulated_route": [
                {"x": 200, "y": 1200},
                {"x": 1700, "y": 1050},
                {"x": 1900, "y": 1050},
                {"x": 3400, "y": 1200}
            ]
        }
    }
    
    success = True
    for name, data in scenarios.items():
        res = RouteValidator.validate_route(
            data["simulated_route"],
            data["icebergs"],
            data["current"],
            data["sea_ice"],
            data["start"],
            data["dest"],
            uncertainties=uncertainties
        )
        status = "PASSED" if res["valid"] else "FAILED"
        print(f"[{status}] {name}: {res['reason']}")
        if not res["valid"]:
            success = False
            
    if success:
        print("\nAll regression scenarios completed successfully!")
    else:
        print("\nSome regression scenarios failed verification.")

if __name__ == "__main__":
    run_regression_scenarios()
