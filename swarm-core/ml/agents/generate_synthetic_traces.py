import json
import random
import os
from pathlib import Path
import uuid
import time

def generate_explorer_trace(file_path, num_traces=100):
    traces = []
    for _ in range(num_traces):
        num_candidates = random.randint(5, 20)
        
        # Determine which one will be the "best" according to heuristic
        best_idx = random.randint(0, num_candidates - 1)
        
        feature_vectors = []
        outcomes = []
        
        for i in range(num_candidates):
            # 48-dim feature vector
            features = [random.random() for _ in range(48)]
            
            # Make the best one have higher quality features (dims 32-47 are link features)
            if i == best_idx:
                for j in range(32, 48):
                    features[j] = min(1.0, features[j] + 0.4)
            else:
                for j in range(32, 48):
                    features[j] = max(0.0, features[j] - 0.2)
                    
            # Use 'features' directly as a list to match parser expectation
            feature_vectors.append(features)
            
            # Label = 1.0 for the chosen one, 0.0 for others (per explorer_dataset.py)
            outcomes.append({
                "candidateIndex": i,
                "wasSelected": i == best_idx,
                "yieldedEvidence": i == best_idx,
                "terminalState": "success" if i == best_idx else "abandoned"
            })
            
        traces.append({
            "traceId": f"tr_{uuid.uuid4()}",
            "timestamp": int(time.time() * 1000),
            "agentType": "explorer",
            "agentId": "explorer-1",
            "runId": "run-1",
            "observation": {},
            "featureVectors": feature_vectors,
            "outcomes": outcomes
        })
        
    with open(file_path, "w") as f:
        for t in traces:
            f.write(json.dumps(t) + "\n")

if __name__ == "__main__":
    os.makedirs("runtime-artifacts/agent-traces", exist_ok=True)
    generate_explorer_trace("runtime-artifacts/agent-traces/agent-traces-synthetic.jsonl", 1000)
    print("Generated 1000 synthetic traces for Explorer")
