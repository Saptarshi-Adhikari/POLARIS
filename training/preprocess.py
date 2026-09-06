"""
preprocess.py
Normalizes raw telemetry samples into observation feature vectors and target labels/actions.
"""

import math

def extract_features_and_targets(sample):
    """
    Extracts numerical feature vector (observation) and target action from a sample dictionary.
    """
    ship = sample.get('ship', {})
    nav = sample.get('navigation', {})
    env = sample.get('environment', {})
    haz = sample.get('hazards', {})
    risk = sample.get('risk', {})

    # Observation vector (normalized state)
    features = [
        ship.get('speed', 0.0) / 10.0,
        ship.get('vx', 0.0) / 10.0,
        ship.get('vy', 0.0) / 10.0,
        ship.get('yawRate', 0.0) / 45.0,
        ship.get('rudder', 0.0) / 45.0,
        nav.get('desiredHeading', 0.0) / 180.0,
        nav.get('xte', 0.0) / 500.0,
        nav.get('xteRate', 0.0) / 10.0,
        nav.get('distanceToDestination', 0.0) / 3600.0,
        nav.get('bearingToDestination', 0.0) / 180.0,
        haz.get('nearestIcebergDistance', 9999.0) / 1000.0,
        haz.get('nearestIcebergBearing', 0.0) / 180.0,
        haz.get('nearestIcebergCPA', 9999.0) / 1000.0,
        haz.get('nearestIcebergTCPA', 9999.0) / 100.0,
        risk.get('collisionRisk', 0.0),
        env.get('currentX', 0.0) / 5.0,
        env.get('currentY', 0.0) / 5.0
    ]

    # Control target / Action
    targets = {
        'targetHeading': nav.get('targetHeading', ship.get('heading', 0.0)),
        'rudder': ship.get('rudder', 0.0),
        'throttle': ship.get('throttle', 1.0)
    }

    return features, targets

if __name__ == '__main__':
    dummy_sample = {
        'ship': {'speed': 8.0, 'vx': 8.0, 'vy': 0.0, 'yawRate': 0.1, 'rudder': 2.5, 'heading': 90.0, 'throttle': 1.0},
        'navigation': {'desiredHeading': 92.0, 'targetHeading': 91.5, 'xte': -4.2, 'xteRate': 0.1, 'distanceToDestination': 1200.0, 'bearingToDestination': 90.0},
        'hazards': {'nearestIcebergDistance': 450.0, 'nearestIcebergBearing': 15.0, 'nearestIcebergCPA': 350.0, 'nearestIcebergTCPA': 25.0},
        'risk': {'collisionRisk': 0.1},
        'environment': {'currentX': 0.0, 'currentY': 0.0}
    }
    feats, targs = extract_features_and_targets(dummy_sample)
    print(f"Extracted {len(feats)} features and targets: {targs}")
