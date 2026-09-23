# POLARIS — Silver vs Expert Gold Calibration Report

## 1. Executive Summary & Calibration Objectives

This document evaluates the agreement between POLARIS automated labels (`SILVER`, experimental rule baseline, Laya zero-shot neural predictions) and **genuine polar maritime expert reviews** (`GOLD`).

> [!CAUTION]
> **Zero Simulation / Zero Fake Reviews:** No fake expert labels or simulated reviewer responses were generated. 
> Laya training status remains **`MODEL TRAINING NOT STARTED`**. The original 500-scenario corpus (`data/decision/generated/polaris_domain_scenarios_500.jsonl`) and the 10-case evaluation benchmark (`data/polaris_decision_cases.json`) are **100% protected and untouched**.

---

## 2. Stratified Calibration Sample Composition (`data/decision/calibration/`)

A stratified, non-duplicate 24-scenario calibration sample was extracted (`backend/polaris_calibration_evaluator.py`) across key risk categories and decision actions:

| Stratum / Category | Target Count | Actual Count | Description / Evidence Criteria |
| :--- | :---: | :---: | :--- |
| **SILVER / AUTO_ACCEPT** | `6` | `9` | Three-source agreement, low hazard ($<1.5$), clearance $>300\text{m}$, confidence $\ge 0.60$ |
| **HUMAN_REVIEW_REQUIRED** | `6` | `15` | Disagreement, low confidence, emergency, blocked route, or high hazard ($\ge 1.5$) |
| **Baseline Action: CONTINUE** | `3` | `9` | Open water or low sea-ice concentration ($<0.20$) |
| **Baseline Action: SLOW_DOWN** | `3` | `6` | Moderate ice ($0.20$ to $0.70$) or reduced visibility ($<1.0\text{ NM}$) |
| **Baseline Action: REROUTE** | `3` | `5` | Blocked route segment or heavy pack ice ($>0.70$) |
| **High-Consequence Risk Cases** | `3` | `4` | `emergency_response`, `hold_position`, or `request_escort` |

- **Package Artifacts:**
  - `data/decision/calibration/calibration_sample.jsonl`: 24 stratified scenario records with full three-source evidence.
  - `data/decision/calibration/calibration_manifest.json`: Sample breakdown and provenance integrity report.

---

## 3. Real Expert Domain Review Status

Domain expert reviews are logged live via the **POLARIS Expert Review Portal** (`http://127.0.0.1:8001/review`).

```text
               POLARIS Expert Review Portal (http://127.0.0.1:8001/review)
                                         │
                                         ▼
                     Expert Watch Officer Reviewer (e.g. REV_001)
                                         │
                                         ▼
                             Submits Independent Review:
               [Action, Confidence 1-5, Rationale, Evidence Factors]
                                         │
                                         ▼
                 `data/decision/calibration/gold_calibration.jsonl`
                             (expert_validated = true)
```

- **Completed Real Expert Reviews:** `0` (Awaiting mariner session login via review portal)
- **GOLD Calibration Records Created:** `0` (Zero manufactured reviews)

---

## 4. Agreement Framework & Metrics Definitions

When expert annotations are submitted, agreement rates are computed using strict domain terminology (**EXPERT AGREEMENT RATE**, not "model accuracy"):

$$\text{Silver Expert Agreement Rate} = \frac{\text{Count}(\text{Silver Action} == \text{Expert Action})}{\text{Total SILVER Cases Reviewed}} \times 100\%$$

$$\text{Baseline Expert Agreement Rate} = \frac{\text{Count}(\text{Baseline Action} == \text{Expert Action})}{\text{Total Scenarios Reviewed}} \times 100\%$$

$$\text{Laya Expert Agreement Rate} = \frac{\text{Count}(\text{Laya Action} == \text{Expert Action})}{\text{Total Scenarios Reviewed}} \times 100\%$$

---

## 5. Action Confusion Matrix Template

Action codes used for calibration comparison:
- **C:** `continue`
- **S:** `slow_down`
- **R:** `reroute`
- **H:** `hold_position`
- **E:** `request_escort`
- **M:** `emergency_response`
- **A:** `AMBIGUOUS`

### SILVER vs EXPERT Confusion Matrix
```text
           EXPERT
         C  S  R  H  E  M  A
SILVER C 0  0  0  0  0  0  0
       S 0  0  0  0  0  0  0
       R 0  0  0  0  0  0  0
       H 0  0  0  0  0  0  0
       E 0  0  0  0  0  0  0
       M 0  0  0  0  0  0  0
       A 0  0  0  0  0  0  0
```

---

## 6. Review Priority Score (RPS) Correlation & Human Queue Analysis

- **Hypothesis:** High Review Priority Scores ($S \ge 70.0$) correlate with higher rates of expert disagreement or scenario ambiguity.
- **Queue Status:** 375 scenarios currently reside in the prioritized human review queue (`data/decision/review_queue/review_package_auto_priority.csv`).

---

## 7. Operational Training Decision

Current Classification:
$$\mathbf{CALIBRATION \; INSUFFICIENT \; \text{---} \; SAMPLE \; TOO \; SMALL}$$

- **Reasoning:** Zero fake expert annotations were created. Until real polar navigators evaluate the 24-scenario calibration package via the portal, the dataset cannot be certified for training.
- **Laya Weight Status:** **`MODEL TRAINING NOT STARTED`**.
