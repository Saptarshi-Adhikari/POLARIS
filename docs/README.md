# Astralis Nav-OS (Polaris Digital Twin)

**CURRENT CODEBASE IS THE SOURCE OF TRUTH.**

## Problem Statement Context (Smart India Hackathon)
Navigating polar regions involves dynamic hazards like icebergs, extreme weather, and shifting ocean currents. Traditional static routing is inefficient and dangerous.

## Current Product Description
A purely client-side, browser-based simulation demonstrating interactive ship routing and iceberg avoidance on an HTML5 canvas.

## Current USP
A fully interactive, zero-dependency visual mockup that immediately demonstrates the *concept* of autonomous pathfinding around dynamic hazards within a simulated vector field.

## What the Application Actually Does
It renders a 2D grid with simulated ocean currents. It moves iceberg objects according to simple Euler kinematics. It calculates a path for a ship object using a heuristic pathfinding algorithm to avoid the icebergs. It provides a UI to tweak environmental variables and watch the simulation react in real-time.

## Current Architecture
- Vanilla JS Single Page Application (SPA).
- No backend server.
- No database.
- No external data APIs.

## Major Capabilities
- **Canvas Rendering:** Custom 2D graphics engine.
- **Interactive Simulation:** Real-time physics approximations for drift.
- **Dynamic Routing:** Heuristic path recalculation on hazard intersection.

## Current Limitations
- **No Real Data:** 100% of data is synthetic/simulated.
- **No Machine Learning:** The "AI" is a traditional search algorithm, not a trained model.
- **Browser Bound:** Performance limits how many entities can be simulated before frame drops occur.

## Current Implementation Status
Phase 0 (Mockup/Visual Prototype) is **Complete**. The UI accurately conveys the intent of the project, but none of the scientific or backend integrations are built.

## Recommended Reading Order

1. [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md)
2. [REALITY_CHECK.md](REALITY_CHECK.md)
3. [FEATURE_REALITY_MATRIX.md](FEATURE_REALITY_MATRIX.md)
4. [ARCHITECTURE.md](ARCHITECTURE.md)
5. [SIMULATION.md](SIMULATION.md)
6. [AI_HANDOFF.md](AI_HANDOFF.md)

## Document Index
- `README.md` (This file)
- `PROJECT_CONTEXT.md`: Plain language project explanation.
- `USP.md`: Verified Unique Selling Propositions.
- `ARCHITECTURE.md`: Technical diagrams.
- `CODEBASE_MAP.md`: Directory breakdown.
- `FRONTEND.md`: UI and Canvas documentation.
- `SIMULATION.md`: Physics and world generation logic.
- `AI_ML.md`: Machine learning audit.
- `ALGORITHMS.md`: Mathematical concepts used.
- `RISK_MODEL.md`: Hazard calculation logic.
- `ROUTING.md`: Pathfinding implementation.
- `DATA.md`: Data provenance.
- `API.md`: Network interfaces.
- `FEATURES.md`: Capabilities matrix.
- `USER_FLOW.md`: Interactive journey.
- `DEMO.md`: Presentation script.
- `REALITY_CHECK.md`: Real vs fake audit.
- `TESTING.md`: Test coverage.
- `SETUP.md`: Running locally.
- `DEPENDENCIES.md`: NPM packages.
- `SECURITY.md`: Vulnerability audit.
- `ENVIRONMENT.md`: System requirements.
- `STATUS.md`: Maturity matrix.
- `ROADMAP.md`: Future phases.
- `TRACEABILITY.md`: Code evidence for claims.
- `FEATURE_REALITY_MATRIX.md`: Strict capability classification.
- `FORENSIC_AUDIT.md`: Final report.
- `PROJECT_MANIFEST.json`: Machine-readable summary.
