# POLARIS Laya Training Readiness Assessment Checklist

This document evaluates the readiness of the POLARIS workspace to fine-tune Laya on Antarctic vessel navigation decisions.

---

## 1. Readiness Evaluation Matrix

| Checklist Item | Status | Justification / Current Evidence |
|---|---|---|
| **Dataset Available** | `NOT READY` | Only a 10-case evaluation file (`data/polaris_decision_cases.json`) exists. No domain dataset exists. |
| **Labels Defined** | `READY` | POLARIS decision schema (`backend/polaris_decision_schema.py`) formally defines `route_action`, `hazard_severity`, `escort_required`, and `human_review_required`. |
| **Label Provenance** | `NOT READY` | Current 10 test case labels are based on heuristic rule assumptions and synthetic example scenarios, not master mariner annotations or historical logs. |
| **Expert Review** | `NEEDS EVIDENCE` | No master mariners, polar navigation experts, or hydrographic authorities have reviewed or validated the decision schema labels. |
| **Train/Val/Test Split** | `NOT READY` | No dataset exists to split. |
| **Scenario Diversity** | `NEEDS EVIDENCE` | The 10 synthetic test cases cover basic categories, but lack real Antarctic ice concentration profiles, sea state conditions, and vessel hull physics. |
| **Training Procedure Identified** | `READY` | Laya's documented Kaggle notebook (`laya/notebooks/laya_finetune_typed_decisions_2xT4_kaggle.ipynb`) defines the RLCD fine-tuning pipeline. |
| **Evaluation Procedure Identified** | `READY` | `scratch/evaluate_laya.py` provides per-action confusion matrix reporting, agreement tracking, and human review trigger metrics. |
| **Safety Gating Retained** | `READY` | `PolarisDecisionAdapter` enforces mandatory Human Watch Officer triage gating (`human_review_required = True`) on all low-confidence predictions. |

---

## 2. Summary of Missing Evidence Before Fine-Tuning

Before initiating any fine-tuning run:
1. **Annotated Dataset:** A dataset of ~500+ domain-validated POLARIS navigation scenarios must be created following `docs/laya-training-requirements.md`.
2. **Domain Expert Sign-off:** Marine safety officers must review and confirm the decision categories and physical safety thresholds.
