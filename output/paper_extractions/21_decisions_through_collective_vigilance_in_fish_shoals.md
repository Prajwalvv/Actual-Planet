# 21) Fast and Accurate Decisions Through Collective Vigilance in Fish Shoals

## Problem
The paper examines whether larger animal groups make not only more accurate but also faster anti-predator decisions, and asks what mechanism explains any group-size advantage.

## Method/Model
Behavioral experiment with mosquito fish (*Gambusia holbrooki*) in a Y-maze decision task under simulated predation risk.
- Fish tested alone and in groups of 2, 4, 8, and 16.
- Decision accuracy measured as choosing maze arm without predator replica.
- Speed/time/tortuosity and turning metrics quantified in approach and decision zones.
- Tested two candidate mechanisms:
  - “Expert individuals” hypothesis (few superior decision makers drive groups).
  - Self-organized collective vigilance + social information transfer.

Also compared outcomes to a “perfect many eyes” theoretical prediction.

## Experiments/Data
- Repeated trials across group sizes in controlled maze setup.
- Individual repeatability tests (multiple trials per fish) to assess stable “expert” effects.
- Spatiotemporal correlation analyses of nearby fish heading/direction to test local information transfer.
- Logistic modeling of focal fish decisions as a function of neighbors’ choices.

## Key Results
- Both decision accuracy and speed improve with group size.
- Groups of 8 and 16 were significantly more accurate than solitary fish.
- Group outcomes closely matched the “perfect many eyes” prediction.
- Larger groups spent less time in decision zones, had lower path tortuosity, and showed reduced turning frequency.
- No strong evidence for persistent high-skill “expert” individuals explaining results.
- Strong evidence for local social coupling: nearby fish decisions were correlated, indicating rapid information transfer.

## Limitations
- Specific lab task with one species; generalization to all social systems requires caution.
- Simulated predator and constrained maze are simplified relative to natural ecology.
- Mechanistic inference is largely behavioral/statistical (not neural-level measurement).
- Group composition dynamics in long-term natural shoals not directly tested.

## Relevance to Swarm Intelligence
Very high relevance. The paper shows how:
- Local vigilance and social signal propagation can produce fast, accurate collective decisions.
- Group-level performance can improve without requiring specially intelligent individuals.
- Self-organized division of sensing/attention is an effective swarm strategy.

This is directly aligned with distributed swarm intelligence principles.

## Use-Case Understanding for Our Main Goal (Brain-like Autonomous Swarm)
For our autonomous swarm goal:
- Design agents to share sparse local alert signals rather than relying on central control.
- Use neighborhood-level coupling rules so detections propagate quickly through the swarm.
- Prefer architectures where intelligence is emergent from many average agents, not rare “experts.”
- Track both accuracy and latency as joint optimization targets.

Practical takeaway: implement collective vigilance protocols (distributed sensing + fast local broadcasting) to achieve robust, low-latency swarm decisions in uncertain environments.
