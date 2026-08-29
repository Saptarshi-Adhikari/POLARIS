import numpy as np
import pandas as pd

def generate_sea_ice_dataset(filename="backend/sea_ice_data.csv", n_samples=2000):
    np.random.seed(42)
    
    # Feature inputs
    x = np.random.uniform(0, 3600, n_samples)
    y = np.random.uniform(0, 2400, n_samples)
    current_ice = np.random.uniform(0.0, 1.0, n_samples)
    temperature = np.random.uniform(-25.0, 5.0, n_samples)
    wind_speed = np.random.uniform(0, 100, n_samples)
    wind_dir = np.random.uniform(0, 360, n_samples)
    
    # target generation (simulation of thermal freeze-thaw and drift)
    # cold temperatures increase ice, warm temperatures decrease it
    # wind speed adds turbulence/random variation
    temp_effect = -0.015 * temperature
    wind_effect = 0.001 * wind_speed
    
    ice_6h = np.clip(current_ice + temp_effect * 0.25 + np.random.normal(0, 0.05, n_samples) + wind_effect * 0.1, 0.0, 1.0)
    ice_12h = np.clip(current_ice + temp_effect * 0.5 + np.random.normal(0, 0.08, n_samples) + wind_effect * 0.2, 0.0, 1.0)
    ice_24h = np.clip(current_ice + temp_effect * 1.0 + np.random.normal(0, 0.12, n_samples) + wind_effect * 0.4, 0.0, 1.0)
    
    df = pd.DataFrame({
        "x": x,
        "y": y,
        "current_ice": current_ice,
        "temperature": temperature,
        "wind_speed": wind_speed,
        "wind_dir": wind_dir,
        "ice_6h": ice_6h,
        "ice_12h": ice_12h,
        "ice_24h": ice_24h
    })
    
    df.to_csv(filename, index=False)
    print(f"Generated synthetic sea-ice dataset with {n_samples} samples saved to {filename}")

if __name__ == "__main__":
    generate_sea_ice_dataset()
