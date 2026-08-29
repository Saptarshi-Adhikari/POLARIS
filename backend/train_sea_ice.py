import os
import joblib
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.multioutput import MultiOutputRegressor
from sklearn.model_selection import train_test_split
from dataset_sea_ice import generate_sea_ice_dataset

def train_sea_ice_model(csv_path="backend/sea_ice_data.csv", model_path="backend/model_sea_ice.joblib"):
    if not os.path.exists(csv_path):
        print(f"Dataset {csv_path} not found. Generating now...")
        generate_sea_ice_dataset(csv_path)
        
    df = pd.read_csv(csv_path)
    
    features = ["x", "y", "current_ice", "temperature", "wind_speed", "wind_dir"]
    targets = ["ice_6h", "ice_12h", "ice_24h"]
    
    X = df[features]
    y = df[targets]
    
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    
    print("Training Random Forest sea-ice forecaster...")
    rf = RandomForestRegressor(n_estimators=50, max_depth=12, random_state=42)
    model = MultiOutputRegressor(rf)
    model.fit(X_train, y_train)
    
    train_r2 = model.score(X_train, y_train)
    test_r2 = model.score(X_test, y_test)
    print(f"Model trained successfully. Train R^2: {train_r2:.4f}, Test R^2: {test_r2:.4f}")
    
    joblib.dump(model, model_path)
    print(f"Model saved to {model_path}")

if __name__ == "__main__":
    train_sea_ice_model()
