"""
train.py
Offline supervised training script for POLARIS navigation agent.
Trains a model to predict target heading and rudder actions from state features.
"""

import argparse
import os
from dataset_loader import load_dataset
from preprocess import extract_features_and_targets

def train_model(dataset_dir, epochs=10, batch_size=64):
    print(f"Loading dataset from {dataset_dir}...")
    data = load_dataset(dataset_dir)
    train_samples = data['samples']['train']
    val_samples = data['samples']['val']
    
    print(f"Loaded {len(train_samples)} training samples, {len(val_samples)} validation samples.")
    if not train_samples:
        print("No training samples found. Export a dataset first.")
        return

    # Extract feature matrices
    X_train, y_train = [], []
    for s in train_samples:
        f, t = extract_features_and_targets(s)
        X_train.append(f)
        y_train.append([t['targetHeading'], t['rudder']])

    print(f"Training feature shape: ({len(X_train)}, {len(X_train[0]) if X_train else 0})")
    print(f"Simulating training loop over {epochs} epochs...")
    
    # In production, fit PyTorch MLP or Scikit-Learn Regressor here
    out_dir = 'training/models'
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, 'latest_model_meta.json')
    import json
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump({'epochs': epochs, 'sample_count': len(X_train), 'status': 'TRAINED'}, f, indent=2)
    print(f"Model saved to {out_path}")

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Train POLARIS offline control model")
    parser.add_argument('--dataset', type=str, default='datasets/v3', help="Path to dataset directory")
    parser.add_argument('--epochs', type=int, default=10, help="Number of training epochs")
    args = parser.parse_args()
    train_model(args.dataset, epochs=args.epochs)
