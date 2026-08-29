import numpy as np
import pandas as pd
import os

def generate_synthetic_dataset(num_samples=2000, filename="backend/iceberg_trajectories.csv"):
    np.random.seed(42)
    
    data = []
    
    for _ in range(num_samples):
        # Initial positions
        x = np.random.uniform(100, 3500)
        y = np.random.uniform(100, 2300)
        
        # Environmental conditions
        wind_speed = np.random.uniform(0, 100) # km/h
        wind_dir = np.random.uniform(0, 360) # degrees
        current_speed = np.random.uniform(0, 20) # SU/h or similar scale
        current_dir = np.random.uniform(0, 360)
        
        # Wind components
        w_rad = np.radians(wind_dir)
        wind_u = np.cos(w_rad) * wind_speed * 1000 / 3600
        wind_v = np.sin(w_rad) * wind_speed * 1000 / 3600
        
        # Current components
        c_rad = np.radians(current_dir)
        current_u = np.cos(c_rad) * current_speed
        current_v = np.sin(c_rad) * current_speed
        
        # Iceberg physical characteristics
        current_response = np.random.uniform(0.7, 0.9)
        wind_response = np.random.uniform(0.1, 0.2)
        wave_response = np.random.uniform(0.02, 0.08)
        drift_strength = np.random.uniform(0.5, 2.5)
        
        # Calculate initial velocity (with slight noise)
        wave_u = np.cos(c_rad) * 1.2 * 0.1
        wave_v = np.sin(c_rad) * 1.2 * 0.1
        
        vx = (current_u * current_response * 12 + wind_u * wind_response * 2 + wave_u * wave_response) * drift_strength
        vy = (current_v * current_response * 12 + wind_v * wind_response * 2 + wave_v * wave_response) * drift_strength
        
        # Add random initial perturbation
        vx += np.random.normal(0, 0.5)
        vy += np.random.normal(0, 0.5)
        
        # Predict displacements at future horizons (in minutes: 10, 30, 60)
        # Note: 1 hour = 3600 seconds or simulation frames.
        # Let's say physics coordinates update by vx, vy per second/time step.
        # We model the actual physics trajectory + cumulative random noise over time
        displacements = {}
        for t in [10, 30, 60]:
            # Convert minutes to simulated hours (t / 60)
            hours = t / 60.0
            
            # Simple drift integration with noise scaling by sqrt(time)
            dx = vx * hours * 1.5 + np.random.normal(0, 3.0 * np.sqrt(hours))
            dy = vy * hours * 1.5 + np.random.normal(0, 3.0 * np.sqrt(hours))
            
            displacements[f"dx_{t}"] = dx
            displacements[f"dy_{t}"] = dy

        data.append({
            "x": x,
            "y": y,
            "vx": vx,
            "vy": vy,
            "wind_speed": wind_speed,
            "wind_dir": wind_dir,
            "current_speed": current_speed,
            "current_dir": current_dir,
            "dx_10": displacements["dx_10"],
            "dy_10": displacements["dy_10"],
            "dx_30": displacements["dx_30"],
            "dy_30": displacements["dy_30"],
            "dx_60": displacements["dx_60"],
            "dy_60": displacements["dy_60"],
        })
        
    df = pd.DataFrame(data)
    os.makedirs(os.path.dirname(filename), exist_ok=True)
    df.to_csv(filename, index=False)
    print(f"Generated synthetic dataset with {len(df)} samples saved to {filename}")

if __name__ == "__main__":
    generate_synthetic_dataset()
