# ASTRALIS AI Copilot - Natural-Language Decision Support

This document describes the design, implementation, Ollama installation requirements, and operational integration details for the ASTRALIS AI Copilot.

---

## 1. COPILOT ARCHITECTURE

The ASTRALIS AI Copilot acts purely as an explanatory, natural-language overlay. It has **no control** over ship physics, target headings, throttles, or route planning parameters:

```
+-------------------------------------------------+
|               ASTRALIS Console                  |
|  - Tracks ship, environment, ML forecasts       |
+------------------------+------------------------+
                         |
                 (Status Payload)
                         |
                         v
+------------------------+------------------------+
|        Python FastAPI Backend / Ollama          |
|  - POST /copilot/explain                       |
|  - Compiles instructions + data payload        |
|  - Formulates explanation response             |
+------------------------+------------------------+
                         |
               (Natural Explanation)
                         |
                         v
+------------------------+------------------------+
|                AI Copilot UI Panel              |
|  - Displays description markdown to user       |
+-------------------------------------------------+
```

---

## 2. OLLAMA SETUP & RECOMMENDED MODEL

Ollama is used as the local, open-source model execution engine.

### Installation
1. Download Ollama for Windows/macOS/Linux from [Ollama.com](https://ollama.com).
2. Install the application and verify it is running in your taskbar or terminal.

### Pulling the Model
Pull the recommended small, lightweight model (`llama3.2:3b` or `llama3.2:1b`):
```bash
ollama run llama3.2:3b
```
*(You may configure a different model name in backend settings using the `OLLAMA_MODEL` environment variable).*

---

## 3. PROMPT ENGINEERING

FastAPI constructs a structured payload and system instruction context to enforce explanatory boundaries:
- **System Instruction**:
  `You are ASTRALIS, an Antarctic maritime navigation decision-support copilot. You explain decisions made by the simulation using only the supplied structured data. Do not invent sensor readings, forecasts, or events. Do not claim you directly control the vessel.`
- **Inputs**: Current ship parameters (speed, fuel, heading), current Autonomous Controller commands (mode, reason, target speed, target heading), environment configurations (winds, current vectors, sea ice fraction), and nearby tracked obstacles.

---

## 4. DUAL INTEGRATION & GRACEFUL FALLBACK

- **Automated Triggers**: Calls explanation prompts asynchronously when the Autonomous Controller transitions into a new decision mode (e.g. from `SAFE_TO_PROCEED` to `REDUCE_SPEED` or `REROUTE`).
- **Interactive Queries**: Users can click targeted question triggers to inspect specific aspects of navigation (e.g. `WHY DID THE SHIP SLOW DOWN?` or `WHY IS THE ROUTE CHANGING?`).
- **Graceful Fallback**: If the Ollama service or model is offline, the backend catches connection timeouts and returns a deterministic, clearly labeled fallback description using the actual simulation decision rules:
  `AI Copilot is offline. Deterministic fallback explanation: Vessel operating in [mode] mode because: [reason]`

---

## 5. TECHNICAL SEPARATIONS SUMMARY

- **Real ML Layer**: Multi-target Random Forest Regressor (`model.joblib`) for predicting iceberg path coordinates.
- **Path Plan Solver**: Classical grid-based A* Search.
- **Rule Engine**: Autonomous Controller (JavaScript).
- **Natural Language Support**: Local LLM Copilot (Ollama).
