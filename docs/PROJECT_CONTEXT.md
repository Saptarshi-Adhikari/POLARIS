# Project Context

## Problem Being Solved
Ships operating in the Arctic and Antarctic face dynamic environmental threats. Sea ice shifts, icebergs drift unpredictably, and extreme weather changes rapidly. Navigators need systems that can ingest real-time data and suggest safe, fuel-efficient routes dynamically.

## Intended Users
- Icebreaker Captains
- Commercial Fleet Operators
- Scientific Research Vessels
- Maritime Monitoring Stations

## Operational Scenario (Research Vessel)
A research vessel needs to cross the Drake Passage. The crew needs a dashboard that overlays satellite imagery of icebergs, predicted ocean currents, and weather forecasts, providing an optimal route that minimizes collision risk and fuel consumption.

## Core Pain Points
- Integrating disparate data sources (satellite, weather, currents).
- Real-time hazard prediction.
- Fast routing calculation in dynamic environments.

## Proposed Solution (The Vision)
A comprehensive backend system (FastAPI) that ingests real data from Sentinel satellites, OpenDrift models, and weather APIs, running through an ML pipeline to predict iceberg trajectories, and serving those predictions to a React/WebGL frontend for the navigator.

## Current Implementation (The Reality)
**The application in this repository is NOT the proposed solution.** 
It is a **visual mockup (digital twin)** designed to *demonstrate* the concept.
- It is a purely frontend JavaScript application.
- It does not ingest real satellite data.
- It does not have a backend.
- It uses basic Euler physics to simulate iceberg drift rather than scientific models.
- It uses a standard pathfinding algorithm rather than an ML-driven routing engine.

## Intended Future System
The future system will replace the client-side JavaScript simulation engine with real backend microservices. The UI will fetch actual coordinates via REST/WebSocket rather than generating them randomly.

## Distinction: CURRENT vs PLANNED

| Capability | Current Repository Status | Planned System |
| :--- | :--- | :--- |
| **Data Source** | Randomized/Simulated in JS | Live API ingestion (Sentinel/IceNet) |
| **Architecture** | Client-side SPA | Microservices (Python/FastAPI) |
| **Routing** | Client-side A* | Backend Optimization Engine |
| **Prediction** | Linear Extrapolation | Trained ML Models |
