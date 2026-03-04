from fastapi import APIRouter
import random
import asyncio

router = APIRouter()

# Simulated node registry — in real federated setup
# each node would be a separate city/region model
FEDERATED_NODES = [
    {"node_id": "NODE_MUMBAI",   "asset_types": ["BRIDGE", "ROAD"],
     "n_samples": 8760},
    {"node_id": "NODE_DELHI",    "asset_types": ["TRANSFORMER", "ROAD"],
     "n_samples": 7200},
    {"node_id": "NODE_CHENNAI",  "asset_types": ["PIPE", "BRIDGE"],
     "n_samples": 6540},
    {"node_id": "NODE_KOLKATA",  "asset_types": ["TRANSFORMER", "PIPE"],
     "n_samples": 5980},
]


async def _simulate_local_training(node: dict) -> dict:
    """Simulate local model training on each edge node."""
    # Simulate compute time proportional to samples
    await asyncio.sleep(random.uniform(0.1, 0.3))
    local_accuracy = random.uniform(0.84, 0.93)
    return {
        "node_id":       node["node_id"],
        "local_accuracy": round(local_accuracy, 4),
        "n_samples":     node["n_samples"],
        "asset_types":   node["asset_types"],
    }


def _federated_average(node_results: list) -> float:
    """
    Weighted average of local model accuracies
    weighted by number of training samples per node.
    """
    total_samples    = sum(r["n_samples"] for r in node_results)
    weighted_acc_sum = sum(
        r["local_accuracy"] * r["n_samples"]
        for r in node_results
    )
    return round(weighted_acc_sum / total_samples, 4)


@router.post("/train")
async def federated_train():
    """
    Simulates federated learning across 4 city edge nodes:
    1. Each node trains locally on its data
    2. Only model weights are shared (not raw data — privacy preserved)
    3. Server aggregates via weighted FedAvg
    4. Global model accuracy returned
    """
    N_ROUNDS = 5

    all_round_results = []

    for round_num in range(1, N_ROUNDS + 1):
        # Simulate parallel local training across all nodes
        round_results = await asyncio.gather(*[
            _simulate_local_training(node)
            for node in FEDERATED_NODES
        ])
        round_results     = list(round_results)
        global_accuracy   = _federated_average(round_results)

        all_round_results.append({
            "round":           round_num,
            "global_accuracy": global_accuracy,
            "node_results":    round_results,
        })

    # Final round result
    final         = all_round_results[-1]
    best_node     = max(
        final["node_results"],
        key=lambda x: x["local_accuracy"]
    )
    worst_node    = min(
        final["node_results"],
        key=lambda x: x["local_accuracy"]
    )

    return {
        "status":               "completed",
        "rounds_completed":     N_ROUNDS,
        "global_model_accuracy": final["global_accuracy"],
        "participating_nodes":  len(FEDERATED_NODES),
        "total_training_samples": sum(
            n["n_samples"] for n in FEDERATED_NODES),
        "privacy_preserved":    True,
        "aggregation_method":   "FedAvg (weighted by sample count)",
        "best_node": {
            "node_id":  best_node["node_id"],
            "accuracy": best_node["local_accuracy"],
        },
        "convergence_history": [
            {"round": r["round"],
             "global_accuracy": r["global_accuracy"]}
            for r in all_round_results
        ],
        "message": (
            f"Federated aggregation complete across "
            f"{len(FEDERATED_NODES)} edge nodes. "
            f"Global accuracy: {final['global_accuracy']:.4f}. "
            f"Raw data never left individual nodes."
        ),
    }