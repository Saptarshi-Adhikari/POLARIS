import json
import random
import numpy as np
import os

def generate_scenarios(count=50):
    scenarios = []
    # Seed for reproducibility
    random.seed(42)
    np.random.seed(42)
    
    for i in range(count):
        start = {"x": random.uniform(200, 800), "y": random.uniform(1400, 2000)}
        dest = {"x": random.uniform(2800, 3400), "y": random.uniform(400, 1000)}
        
        # 16 icebergs
        icebergs = []
        for j in range(16):
            icebergs.append({
                "x": random.uniform(800, 2800),
                "y": random.uniform(400, 2000),
                "collisionRadius": random.uniform(20, 50)
            })
            
        current = {
            "u": random.uniform(-5.0, 5.0),
            "v": random.uniform(-5.0, 5.0)
        }
        
        scenarios.append({
            "start": start,
            "dest": dest,
            "icebergs": icebergs,
            "current": current,
            "sea_ice": random.uniform(0.1, 0.7)
        })
    return scenarios

def evaluate_weights(weights, scenarios):
    total_score = 0
    collisions = 0
    
    # We simulate a simplified route grid search for each scenario
    for sc in scenarios:
        # Simulate traversal from start to dest
        dist = np.hypot(sc["dest"]["x"] - sc["start"]["x"], sc["dest"]["y"] - sc["start"]["y"])
        
        # Calculate environmental dot product penalty (headwind vs tail assistance)
        move_dir_x = (sc["dest"]["x"] - sc["start"]["x"]) / dist
        move_dir_y = (sc["dest"]["y"] - sc["start"]["y"]) / dist
        dot = sc["current"]["u"] * move_dir_x + sc["current"]["v"] * move_dir_y
        cross = abs(sc["current"]["u"] * move_dir_y - sc["current"]["v"] * move_dir_x)
        
        env_penalty = 0.0
        if dot > 0:
            env_penalty -= dot * weights["currentWeight"]
        else:
            env_penalty -= dot * weights["currentWeight"] * 1.5
        env_penalty += cross * weights["crossCurrentWeight"]
        
        # Iceberg proximity check
        min_ice_dist = min([np.hypot(ice["x"] - (sc["start"]["x"] + sc["dest"]["x"])/2, ice["y"] - (sc["start"]["y"] + sc["dest"]["y"])/2) for ice in sc["icebergs"]])
        ice_penalty = 0
        if min_ice_dist < 80:
            collisions += 1
            ice_penalty += 1000.0
        else:
            ice_penalty += weights["icebergWeight"] * max(0.0, 1.0 - min_ice_dist / 300.0)
            
        # Sea ice penalty
        sea_ice_penalty = sc["sea_ice"] * weights["seaIceWeight"]
        
        # Score computation: lower is better
        score = dist + ice_penalty + env_penalty + sea_ice_penalty
        total_score += score
        
    return total_score + (collisions * 100000)

def train_learned_cost_weights():
    scenarios = generate_scenarios(50)
    
    # Random search space
    best_score = float('inf')
    best_weights = None
    
    for _ in range(100):
        candidate = {
            "icebergWeight": round(random.uniform(5.0, 15.0), 2),
            "seaIceWeight": round(random.uniform(2.0, 8.0), 2),
            "currentWeight": round(random.uniform(0.1, 0.5), 2),
            "crossCurrentWeight": round(random.uniform(0.1, 0.5), 2),
            "riskWeight": round(random.uniform(4.0, 10.0), 2),
            "turnPenalty": round(random.uniform(0.05, 0.3), 2),
            "heuristicWeight": 1.0,
            "smoothingTolerance": 15
        }
        
        score = evaluate_weights(candidate, scenarios)
        if score < best_score:
            best_score = score
            best_weights = candidate
            
    print(f"Calibration completed. Best weights: {best_weights}")
    
    # Write to src/data/
    current_dir = os.path.dirname(os.path.abspath(__file__))
    target_dir = os.path.abspath(os.path.join(current_dir, "../src/data"))
    os.makedirs(target_dir, exist_ok=True)
    json_path = os.path.join(target_dir, "routeCalibration.json")
    with open(json_path, "w") as f:
        json.dump(best_weights, f, indent=2)
        
    return best_weights

if __name__ == "__main__":
    train_learned_cost_weights()
