"""
dataset_loader.py
Deterministic 70/15/15 episode-level data splitter and loader for POLARIS JSONL exports.
"""

import json
import hashlib
import os

def get_episode_split(episode_id, train_ratio=0.70, val_ratio=0.15):
    """
    Deterministically assign an episode ID to 'train', 'val', or 'test'
    based on a hash of the episode ID.
    """
    hash_digest = hashlib.md5(str(episode_id).encode('utf-8')).hexdigest()
    hash_val = int(hash_digest, 16) / float(1 << 128)
    
    if hash_val < train_ratio:
        return 'train'
    elif hash_val < train_ratio + val_ratio:
        return 'val'
    else:
        return 'test'

def load_dataset(dataset_dir):
    """
    Loads episodes, samples, and manifest from a dataset directory.
    Splits samples into train/val/test sets by episode ID.
    """
    manifest_path = os.path.join(dataset_dir, 'manifest.json')
    episodes_path = os.path.join(dataset_dir, 'episodes.jsonl')
    samples_path = os.path.join(dataset_dir, 'samples.jsonl')

    manifest = {}
    if os.path.exists(manifest_path):
        with open(manifest_path, 'r', encoding='utf-8') as f:
            manifest = json.load(f)

    episodes = []
    if os.path.exists(episodes_path):
        with open(episodes_path, 'r', encoding='utf-8') as f:
            for line in f:
                if line.strip():
                    episodes.append(json.loads(line.strip()))

    split_samples = {'train': [], 'val': [], 'test': []}
    if os.path.exists(samples_path):
        with open(samples_path, 'r', encoding='utf-8') as f:
            for line in f:
                if line.strip():
                    sample = json.loads(line.strip())
                    ep_id = sample.get('episodeId', 'ep_0')
                    split = get_episode_split(ep_id)
                    split_samples[split].append(sample)

    return {
        'manifest': manifest,
        'episodes': episodes,
        'samples': split_samples
    }

if __name__ == '__main__':
    import sys
    dataset_path = sys.argv[1] if len(sys.argv) > 1 else 'datasets/v3'
    if os.path.exists(dataset_path):
        data = load_dataset(dataset_path)
        print(f"Loaded dataset from {dataset_path}:")
        print(f"  Episodes: {len(data['episodes'])}")
        print(f"  Train samples: {len(data['samples']['train'])}")
        print(f"  Val samples:   {len(data['samples']['val'])}")
        print(f"  Test samples:  {len(data['samples']['test'])}")
    else:
        print(f"Dataset path {dataset_path} does not exist.")
