# Laya Decision Engine Integration & Evaluation for POLARIS Nav-OS

## 1. Overview & Objectives

This document describes the architectural integration, empirical evaluation, and experimental safety boundaries of the **Laya non-autoregressive decision engine** within the **POLARIS Antarctic Vessel Navigation System**.

### System Disambiguation
To ensure safety and scientific clarity, the project distinguishes three separate layers:
1. **Existing POLARIS Logic:** Physics-based spatial route validation (`backend/route_validation.py`) and Random Forest / Hybrid drift prediction models (`backend/ml_api.py`).
2. **Laya Zero-Shot Output:** Experimental generic zero-shot base checkpoint predictions (`convaiinnovations/laya`) evaluated as a decision-support layer.
3. **Domain-Trained Laya (Future State):** A fine-tuned checkpoint created *only* after training on a validated dataset of POLARIS polar navigation cases. (This model does **not** exist yet).

> [!CAUTION]
> The current Laya base checkpoints (`convaiinnovations/laya`) have **not** been trained or fine-tuned on polar navigation safety data or Antarctic hydrographic policies.
> **Laya outputs CANNOT be used as autonomous navigation commands.** All predictions serve strictly as experimental decision-support signals and are gated by a mandatory **Human Watch Officer Review** flag (`human_review_required = True`).

---

## 2. Experimental Assumptions & Threshold Audit

The deterministic baseline (`scratch/polaris_rule_baseline.py`) and schema currently rely on the following **experimental assumptions**:

- **Sea Ice Concentration Threshold (`0.70` / 70%):** Assumed cutoff for heavy pack ice requiring speed reduction or escort. *Status: Experimental assumption (unvalidated by IMO Polar Code).*
- **Critical Iceberg Proximity (`300m`):** Assumed safety exclusion distance. *Status: Derived from POLARIS `route_validation.py` collision radius heuristics ($30\text{m} + 15\text{m} + \text{margin}$).*
- **Visibility Cutoff (`1.0 NM`):** Assumed visibility threshold for blizzard / fog hold position. *Status: Experimental heuristic.*
- **Model Confidence Gating (`0.60` / 60%):** Any prediction with confidence $< 60\%$ triggers mandatory human review. *Status: Software safety threshold.*

---

## 3. POLARIS → Laya Data Flow Architecture

```text
Sensors / Ice Hydrographics
        ↓
POLARIS Analysis Engine (`backend/route_validation.py`, `backend/ml_api.py`)
        ↓
Structured Navigation Telemetry State (`backend/polaris_decision_schema.py`)
   ┌────┴─────────────────────────────┐
   ▼                                  ▼
Rule-Based Baseline             Laya Adapter (`backend/polaris_decision.py`)
(`scratch/polaris_rule_baseline.py`)  ↓ (HTTP POST /predict)
   │                            POLARIS Laya Client (`backend/laya_client.py`)
   │                            ↓
   │                            FastAPI Service (`api/main.py`)
   │                            ↓
   │                            Shared CUDA Router (`laya.Router`)
   │                            ↓
   │                            RTX 4050 GPU Neural Forward Pass
   │                                  │
   └──────────────┬───────────────────┘
                  ▼
         Evaluation & Comparison (`scratch/evaluate_laya.py`)
                  ↓
    Human Watch Officer Triage Gating (`human_review_required`)
                  ↓
             Operator UI
```

---

## 4. Schemas & Baseline Logic

### Input Telemetry Schema (`backend/polaris_decision_schema.py`)
- **`navigation`**: vessel name, ice class (`PC6`), speed, position `(x, y)`, heading, destination, remaining distance.
- **`ice`**: sea ice concentration (0.0 to 1.0), thickness (m), nearest iceberg distance (m), route segment blockage status.
- **`environment`**: wind speed (kts), wind direction, ocean current speed, visibility (NM), water temperature.
- **`operational`**: icebreaker escort availability, fuel remaining %, emergency status flag.

### Decision Questions (`backend/polaris_decision.py`)
- **`route_action`** (`choice`): `continue`, `slow_down`, `reroute`, `hold_position`, `request_escort`, `emergency_response`.
- **`hazard_severity`** (`score`): ordinal damage risk (0.0 = low, 1.0 = moderate, 2.0 = critical).
- **`escort_required`** (`noul`): probability that icebreaker assistance is required.
- **`human_review_required`** (`noul`): probability that human officer review is required.

---

## 5. Empirical Evaluation Findings

10 benchmark test cases were evaluated in `scratch/evaluate_laya.py` comparing the rule baseline against zero-shot Laya base checkpoint predictions (`convaiinnovations/laya`).

### Per-Action Confusion & Collapse Analysis
| Baseline Expected Action | Baseline Count | Laya Match Count | Agreement Rate | Laya Observed Output Distribution |
|---|---|---|---|---|
| `continue` | 3 | 3 | **100.0%** | `continue` (9 cases) |
| `slow_down` | 2 | 0 | **0.0%** | `continue` (2 cases) |
| `reroute` | 2 | 0 | **0.0%** | `continue` (2 cases) |
| `request_escort` | 1 | 0 | **0.0%** | `continue` (1 case) |
| `hold_position` | 1 | 0 | **0.0%** | `continue` (1 case) |
| `emergency_response` | 1 | 1 | **100.0%** | `emergency_response` (1 case) |

### Key Findings
1. **Decision Collapse:** Zero-shot Laya base weights collapse into predicting `continue` on 9 out of 10 cases (90% of requests). Because the base checkpoint has not been trained on maritime polar safety, it lacks domain sensitivity to ice concentration and iceberg proximity inputs.
2. **Confidence & Human Review Gating:** Laya's decision confidence on zero-shot navigation tasks is low (~6.5% to 23.1%). The `PolarisDecisionAdapter` **correctly flagged 100% of cases for mandatory Human Watch Officer Review** (`human_review_required = True`), preventing uncalibrated zero-shot predictions from influencing vessel maneuvers.

---

## 7. Domain Review & Provenance Integrity Pipeline

### Provenance Classification Architecture
Every scenario in the 500-scenario dataset is assigned explicit, fine-grained provenance tracking:
- **Scenario Provenance (`SourceType.REAL_SOURCE_DERIVED_SIMULATED`):** Indicates that environmental parameters (iceberg locations from USNIC, sea-ice grids from Copernicus CMEMS, wind/current vectors from ECMWF ERA5) are derived from real Antarctic observations, while vessel kinematics, route variations, and decision contexts are generated via controlled simulation.
- **Field-Level Provenance (`FieldLevelProvenance`):** Explicitly details provider and data state for each attribute (`iceberg_position`, `sea_ice_concentration`, `wind_conditions`, `ocean_current`, `visibility_conditions`, `vessel_kinematics`, `route_blockage_status`).
- **Label Provenance (`LabelSource.EXPERIMENTAL_RULE_BASELINE`):** Explicitly marks that initial dataset labels are produced by the POLARIS experimental rule engine baseline. Labels are **never** marked as `EXPERT` or `CONSENSUS` until explicit polar mariner review is completed.

### Three-Source Hybrid Label Adjudication & Triage Architecture
To process domain scenarios and build high-quality SILVER labels without generating fake expert reviews, POLARIS utilizes a three-source adjudication layer (`backend/polaris_label_adjudicator.py`):
1. **Source A:** POLARIS Experimental Rule Baseline Action
2. **Source B:** Laya Neural Model Prediction & Confidence
3. **Source C:** POLARIS Physics & Hydrographic Simulation Engine Outcome (`evaluate_simulation_safety()`)

**Silver Acceptance Criteria:** Auto-accepted as `SILVER` (`expert_validated = false`) ONLY when:
- All three sources agree on candidate maneuver.
- Candidate action is NOT high-consequence (`emergency_response`, `hold_position`, `request_escort`).
- Laya decision confidence $\ge 0.60$.
- No route blockage, active emergency, high hazard score ($\ge 1.5$), critical iceberg proximity ($< 300\text{m}$), or poor visibility ($< 1.0\text{ NM}$).

**Prohibited High-Consequence Auto-Acceptance:** High-consequence actions (`emergency_response`, `hold_position`, `request_escort`) are **NEVER** auto-accepted into SILVER labels based on automated agreement alone, and must always be routed to `HUMAN_REVIEW_REQUIRED`.

**Circularity Audit & Semantics:**
The experimental rule baseline (`scratch/polaris_rule_baseline.py`) and simulation safety checks (`backend/route_validation.py`) share spatial collision geometry logic (300m exclusion distance, Nomoto kinematics bounds). Therefore, simulation outcome validation confirms internal physical consistency but does **NOT** constitute independent expert validation. Labels are explicitly designated as `SILVER` (`expert_validated = false`). `GOLD` labels require genuine polar-maritime expert validation via the Review Portal.

### Expert Review & Prioritization Strategy
To facilitate domain expert annotation without requiring immediate manual review of all 500 scenarios:
1. **Three-Source Prioritization Engine (`backend/polaris_label_adjudicator.py`):** Dynamically computes Review Priority Scores $S \in [0.0, 100.0]$ based on model disagreements (+30), simulation conflicts (+35), high-consequence maneuvers (+25), low model confidence (+20), emergencies (+20), blocked routes (+15), and environmental hazards (+15/+10).
2. **Review Package (`data/decision/review_queue/review_package_auto_priority.csv`):** Exports the prioritized human review queue in tabular CSV format for expert evaluation.
3. **Consensus & Disagreement Handling:** Supports multi-reviewer annotations (`reviewer_A`, `reviewer_B`, `reviewer_C`). If reviewers disagree without a majority, `consensus_action` is set to `null`, `reviewer_status` is marked `AMBIGUOUS`, and `disagreement_flag` is raised to `True`.

### Domain Review Portal & Workflow Application
- **Standalone Review UI:** Served locally at `http://127.0.0.1:8001/review` (`backend/review_api.py`, `backend/polaris_review_manager.py`).
- **Complete Workflow Guide:** Documented in detail under [`docs/domain-review-workflow.md`](file:///c:/Users/Saptarshi/Desktop/MainFolder/Hackathon/shipnav/v3/POLARIS/docs/domain-review-workflow.md).

### Dataset Quality Gates & Pipeline Status
- **Episode Split Protection:** 350 Train / 75 Validation / 75 Test assigned by `episode_id` with 0 episode leakage.
- **Benchmark Protection:** The 10-case evaluation set (`data/polaris_decision_cases.json`) remains 100% held out with 0 benchmark leakage.
- **Current Pipeline Readiness Status:** `DATASET READY FOR DOMAIN REVIEW`. Model training remains strictly **NOT READY** until expert review coverage targets are achieved.


