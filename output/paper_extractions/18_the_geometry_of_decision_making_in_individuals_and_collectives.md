# 18) The Geometry of Decision-Making in Individuals and Collectives

## Problem
The paper asks how moving animals choose among multiple spatial options, and how geometry (changing egocentric angles while moving) interacts with neural decision dynamics. It also examines whether similar principles extend from individual brains to collective animal decisions.

## Method/Model
The authors combine:
- A minimal theoretical neural decision model (ring-attractor/competing neural groups style) with local excitation and global inhibition in vector space.
- Dynamical systems and mean-field analysis to identify bifurcations/critical transitions during movement.
- Prediction testing with immersive virtual reality experiments in multiple species.

Core prediction: as geometry changes during approach, decision dynamics undergo abrupt bifurcations, converting multichoice decisions into sequential binary decisions.

## Experiments/Data
Empirical tests use VR in three taxa and contexts:
- Fruit flies and desert locusts choosing among multiple vertical visual targets.
- Larval zebrafish choosing among multiple moving virtual conspecifics.

They analyze trajectories for two-choice and three-choice (and modeled higher-choice) settings, comparing observed path bifurcations to model predictions.

## Key Results
- Two-option decisions: animals initially move toward the average direction, then abruptly bifurcate to one option at a critical geometry.
- Three-or-more options: decision-making unfolds as repeated binary eliminations (sequential bifurcations), not one-shot global selection.
- This structure appears across very different nervous systems and ecological contexts (flies, locusts, zebrafish).
- Model predicts heightened sensitivity near critical points (small preference differences can be amplified near bifurcation).
- Similar geometric decision principles are argued to apply from neural-level dynamics to collective movement-level decisions.

## Limitations
- Model is intentionally minimal; biological detail is abstracted (useful for generality, weaker for species-specific mechanistic precision).
- Experiments are controlled VR contexts, so transfer to full natural environments may require further validation.
- Behavioral variability exists (some individuals show more direct/non-bifurcating trajectories), implying additional factors (developmental state, intrinsic biases, wiring variability) may modulate outcomes.
- The paper emphasizes geometric/neural dynamics more than energetic, ecological, or long-horizon utility tradeoffs.

## Relevance to Swarm Intelligence
Very high relevance. It provides a design principle for swarm control and distributed cognition:
- Convert complex multichoice problems into staged binary reductions.
- Use geometry/state-dependent critical transitions to trigger commitment.
- Exploit sensitivity near tipping points for efficient consensus shifts.

This directly supports scalable decision architectures for agent collectives.

## Use-Case Understanding for Our Main Goal (Brain-like Autonomous Swarm)
For building a brain-like autonomous swarm from simple units:
- Implement decision fields where agents first average distributed options, then commit after crossing a critical condition.
- Use recursive elimination for many-task or many-target selection (N choices -> staged pairwise reduction).
- Couple movement/state evolution with decision computation (embodied decision loop), rather than static voting only.
- Encode tunable noise/sensitivity to balance exploration vs robust commitment.

Practical takeaway: design swarm policy as a bifurcation-driven decision process with explicit critical thresholds and sequential binary resolution for multi-option tasks.
