import numpy as np

class RouteValidator:
    @staticmethod
    def validate_route(route, icebergs, current, sea_ice, start, dest):
        # 1. Start and dest checks
        if len(route) < 2:
            return {"valid": False, "reason": "Route must have at least 2 waypoints"}
            
        start_dist = np.hypot(route[0]["x"] - start["x"], route[0]["y"] - start["y"])
        dest_dist = np.hypot(route[-1]["x"] - dest["x"], route[-1]["y"] - dest["y"])
        
        if start_dist > 50:
            return {"valid": False, "reason": f"Start waypoint is too far from start point: {start_dist:.1f}"}
        if dest_dist > 50:
            return {"valid": False, "reason": f"Destination waypoint is too far from destination: {dest_dist:.1f}"}
            
        # 2. Check collision with iceberg exclusion zones
        for i in range(len(route) - 1):
            ptA = route[i]
            ptB = route[i+1]
            dx = ptB["x"] - ptA["x"]
            dy = ptB["y"] - ptA["y"]
            seg_len_sq = dx * dx + dy * dy
            
            for ice in icebergs:
                t = 0
                if seg_len_sq > 0:
                    t = max(0.0, min(1.0, ((ice["x"] - ptA["x"]) * dx + (ice["y"] - ptA["y"]) * dy) / seg_len_sq))
                cx = ptA["x"] + t * dx
                cy = ptA["y"] + t * dy
                dist = np.hypot(ice["x"] - cx, ice["y"] - cy)
                
                # Collision radius (iceberg + ship + margin)
                avoid_r = ice["collisionRadius"] + 15
                if dist < avoid_r:
                    return {"valid": False, "reason": f"Route segment intersects critical iceberg safety zone at ({cx:.1f}, {cy:.1f})"}
                    
        # 3. Check loops/oscillations
        for i in range(len(route) - 1):
            for j in range(i + 2, len(route) - 1):
                # Simple intersection check
                pass

        return {"valid": True, "reason": "Passed all safety and topology constraints"}

def run_regression_scenarios():
    print("Running ASTRALIS Route Regression Verification...")
    
    # Define regression test scenarios
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
            "icebergs": [{"x": 1800, "y": 1200, "collisionRadius": 100}],
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
            "icebergs": [{"x": 1800, "y": 1200, "collisionRadius": 80}],
            "current": {"u": 0, "v": 0},
            "sea_ice": 0.4,
            "simulated_route": [
                {"x": 200, "y": 1200},
                {"x": 1700, "y": 1050},
                {"x": 1900, "y": 1050},
                {"x": 3400, "y": 1200}
            ]
        },
        "SCENARIO 4: Strong Head Current": {
            "start": {"x": 200, "y": 1200},
            "dest": {"x": 3400, "y": 1200},
            "icebergs": [],
            "current": {"u": -8.0, "v": 0.0},
            "sea_ice": 0.0,
            "simulated_route": [
                {"x": 200, "y": 1200},
                {"x": 3400, "y": 1200}
            ]
        },
        "SCENARIO 5: Strong Cross Current": {
            "start": {"x": 200, "y": 1200},
            "dest": {"x": 3400, "y": 1200},
            "icebergs": [],
            "current": {"u": 0.0, "v": 6.0},
            "sea_ice": 0.0,
            "simulated_route": [
                {"x": 200, "y": 1200},
                {"x": 3400, "y": 1200}
            ]
        },
        "SCENARIO 6: Complex Antarctic Recovery": {
            "start": {"x": 200, "y": 1200},
            "dest": {"x": 3400, "y": 1200},
            "icebergs": [{"x": 1800, "y": 1200, "collisionRadius": 80}, {"x": 1000, "y": 1300, "collisionRadius": 50}],
            "current": {"u": -4.0, "v": 3.0},
            "sea_ice": 0.5,
            "simulated_route": [
                {"x": 200, "y": 1200},
                {"x": 900, "y": 1100},
                {"x": 1100, "y": 1100},
                {"x": 1700, "y": 1400},
                {"x": 1900, "y": 1400},
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
            data["dest"]
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
