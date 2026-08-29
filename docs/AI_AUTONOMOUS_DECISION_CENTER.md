# 🚨 AI Autonomous Decision Center

This document outlines the architecture, pipeline stages, debounced log events, and subsystem integrations of the ASTRALIS AI Autonomous Decision Center.

---

## 1. SYSTEM ARCHITECTURE

The Decision Center operates as a top-level orchestration and event logging console:

```
[ Subsystem Feeds ]
  ├── AntarcticDataManager (DATA status)
  ├── aiClient (ML status)
  ├── RiskIntelligenceEngine (RISK warnings)
  ├── ConfidenceIntelligenceEngine (CONFIDENCE indicators)
  ├── MissionPlanner (CONSTRAINTS checks)
  └── AutonomousController (ACTION modes)
         │
         v
[ DecisionIntelligenceEngine ] ──> UI Dashboard vertical pipeline & event log
```

---

## 2. DECISION PIPELINE STAGES

1. **🛰️ DATA**: Tracks observed datasets versus simulation fallbacks.
2. **🤖 ML FORECAST**: Shows RF trajectory horizon confidence values.
3. **⚠️ RISK ANALYSIS**: Identifies Gaussian collision decay danger.
4. **📈 CONFIDENCE**: Reviewscompound validation indicators.
5. **🧭 CONSTRAINTS**: Validates travel times against targets.
6. **🗺️ ROUTE DECISION**: Reports cost-route strategy modes.
7. **🚢 ACTION**: Displays active autopilot tracking modes.

---

## 3. DEBUNCED EVENT TIMELINE LOGGER

To avoid log pollution:
- **Deduplication**: Exact consecutive logs are discarded.
- **Debouncing**: Cooldown intervals of 15 seconds are applied to severity triggers (e.g. repeated ice/sea-ice warnings).
- **Severity Levels**: Categorized into `INFO`, `WARNING`, `CRITICAL`, and `SUCCESS`.
