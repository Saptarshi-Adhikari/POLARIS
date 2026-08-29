import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestRegressor
from sklearn.multioutput import MultiOutputRegressor
import joblib
import os

def train_model(csv_path="backend/iceberg_trajectories.csv", model_path="backend/model.joblib"):
    if not os.path.exists(csv_path):
        print(f"Dataset {csv_path} not found. Generating now...")
        from dataset_generator import generate_synthetic_dataset
        generate_synthetic_dataset(num_samples=2000, filename=csv_path)
        
    df = pd.read_csv(csv_path)
    
    # Feature columns
    feature_cols = [
        "x", "y", "vx", "vy", 
        "wind_speed", "wind_dir", 
        "current_speed", "current_dir"
    ]
    
    # Target columns (future displacement dx, dy for 10, 30, 60 minutes)
    target_cols = [
        "dx_10", "dy_10",
        "dx_30", "dy_30",
        "dx_60", "dy_60"
    ]
    
    X = df[feature_cols]
    y = df[target_cols]
    
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    
    print("Training Random Forest multi-output regressor...")
    model = MultiOutputRegressor(
        RandomForestRegressor(n_estimators=50, max_depth=12, random_state=42, n_jobs=-1)
    )
    model.fit(X_train, y_train)
    
    train_score = model.score(X_train, y_train)
    test_score = model.score(X_test, y_test)
    print(f"Model trained successfully. Train R^2: {train_score:.4f}, Test R^2: {test_score:.4f}")
    
    joblib.dump(model, model_path)
    print(f"Model saved to {model_path}")

if __name__ == "__main__":
    train_model()
