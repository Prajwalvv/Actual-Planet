# 17) Morphogenesis of Termite Mounds

## Problem
The paper studies how termites (individually simple agents) collectively build large, species-specific mound architectures. Core problem: explain how local behavior + environment feedback produce stable global mound shape/size diversity.

## Method/Model
The authors propose a coarse-grained mathematical model coupling:
- Environmental physics: heat advection-diffusion, porous airflow (Darcy flow), and odor transport.
- Behavior rule: termites expand mound wall where local odor is above a threshold and allow decay where it is below threshold.
- Geometry feedback loop: mound shape alters airflow/temperature, which alters odor field, which alters building decisions.

They derive dimensionless controls (notably Peclet number, Biot number, relative wall thickness), analytical scaling laws, and run numerical simulations over broad parameter ranges.

## Experiments/Data
No new biological field experiment dataset is introduced. Evidence is based on:
- Analytical derivations from the governing equations.
- 500 numerical simulations over feasible parameter ranges.
- Qualitative comparison of simulated morphology patterns with known mound forms/species observations from prior literature.

## Key Results
- A minimal physics-behavior feedback model reproduces broad termite mound morphology diversity.
- Derived scaling relations predict:
- Characteristic mound size from odor production, wall thickness, odor diffusion, and behavior threshold.
- Construction time scaling roughly with inverse-squared Biot number.
- Aspect ratio increasing with Peclet effects (stronger advection influence).
- Simulations support these scaling trends and show how morphology varies with dimensionless parameters.
- Model offers testable hypotheses: mound form should shift with external thermal oscillation amplitude and internal odor production/transport parameters.

## Limitations
- Limited empirical validation: authors explicitly note lack of direct field experiments for strict quantitative fitting.
- Axisymmetric simplification; cannot capture asymmetric or orientation-specific mound features fully.
- Internal mound micro-architecture is coarse-grained/averaged rather than explicitly modeled.
- Mechanical settling/structural forces during early build stages are mostly omitted.
- Behavior is represented by a simple threshold rule, likely missing richer termite sensing/decision dynamics.

## Relevance to Swarm Intelligence
Very high relevance. This is a direct example of intelligence emerging from local rules and environment-mediated feedback (stigmergy):
- Global architecture emerges without central control.
- External physics acts as a shared memory/computation medium.
- A few control parameters can move the swarm between different collective outcomes.

## Use-Case Understanding for Our Main Goal (Brain-like Autonomous Swarm)
For building an autonomous multi-agent system where simple units create system-level intelligence:
- Use environment-coupled coordination (shared fields/signals) instead of heavy centralized planning.
- Design local threshold-based actions tied to gradients/fluxes in shared state.
- Track a small set of macro variables (equivalent to dimensionless control parameters) to steer global behavior.
- Treat structure/task progress as a closed loop: agents modify world state, world state modulates agent policy.

Practical takeaway: implement a stigmergic control layer where agents read/write shared signals and adapt via threshold rules; then tune a few global ratios to drive desired emergent swarm modes.
