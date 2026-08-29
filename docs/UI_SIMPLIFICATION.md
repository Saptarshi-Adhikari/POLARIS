# ASTRALIS UI Simplification & Hackathon Mode

This document outlines the UI simplification steps applied to ASTRALIS to prepare for the final hackathon presentation.

---

## 1. Controls Removed & Hidden
- **Floating Navigation Panel**: Completely removed the redundant left-side `nav-panel`.
- **Duplicate Toggles**: Integrated all navigation coordinates (`START`, `DESTINATION`, `ZOOM LEVEL`) and action triggers (`SET START`, `SET DEST`, `PLACE VESSEL`, `START AUTOPILOT`) directly into the `NAV` tab of the single right docked control sidebar.
- **Top Bar Excess**: Replaced the 10 scattered top toolbar settings with exactly four high-level demo controls:
  1. `🌟 DEMO SCENARIO`
  2. `🗺️ PLAN ROUTE`
  3. `▶ START / PAUSE`
  4. `🤖 AI INSIGHTS`

---

## 2. Panels Consolidated

All four advanced AI subsystems have been consolidated from scattered panels into a single **AI Insights Center** panel (toggled by clicking the top `🤖 AI INSIGHTS` button). This new panel features tabbed sub-views:

- **DECISION**: Displays the live Decision Timeline pipeline logs (from the DecisionIntelligenceEngine).
- **WHY ROUTE**: Houses the Explainable AI Copilot explanations and decision triggers.
- **CONFIDENCE**: Combines decision confidence percentages, validation metrics, and risk/validation map overlays.
- **WHAT-IF**: Controls environment forecast parameters (wind, current, sea ice sliders) and previews predicted impacts.

---

## 3. Right Sidebar Tab Structure
The right sidebar (`#unified-sidebar-panel`) is cleaned up to contain:
- **NAV**: Navigation inputs, placement settings, environmental data modes, and route strategy modes.
- **AI**: Mini summary of risk percentages, confidence levels, and active warnings.
- **MISSION**: Clock, demo mission scenario selection, and real-time telemetry (fuel, speed, throttle, drift, crab angle).
- **SAFETY**: Immediate hazards lists.

---

## 4. Final Hackathon Demo Flow (30 seconds)
1. Click **🌟 DEMO SCENARIO** in the top bar to initialize the cinematic recovery scenario.
2. Observe the vessel heading along the calculated route.
3. Open **🤖 AI INSIGHTS** to show the judges the decision pipeline timeline and confidence metrics.
4. Toggle to the **WHAT-IF** sub-tab, drag the current or wind sliders to see predicted ETA/Fuel impacts in real-time, and run a forecast.
