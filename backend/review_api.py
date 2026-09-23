"""POLARIS Domain Review Local API & HTML Interface Router.

Provides HTTP endpoints and a developer/domain-review UI for polar mariners to inspect
prioritized scenarios, log expert annotations, track consensus, and view review metrics.
"""
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from typing import List, Dict, Any, Optional

from backend.polaris_review_manager import PolarisReviewManager

router = APIRouter(prefix="/review", tags=["Domain Review Workflow"])
manager = PolarisReviewManager()


class ExpertAnnotationRequest(BaseModel):
    scenario_id: str
    reviewer_id: str
    selected_action: str
    confidence: float
    rationale: str
    additional_info_needed: Optional[str] = None
    driving_evidence_factors: List[str] = []
    review_status: Optional[str] = None


@router.get("/api/scenarios", response_model=Dict[str, Any])
def get_prioritized_scenarios(top_n: int = Query(100, ge=1, le=500)):
    """Fetch prioritized scenarios and current dataset review metrics."""
    try:
        scenarios = manager.get_scenarios_for_review(top_n=top_n)
        manifest = manager.save_reviewed_dataset()
        return {
            "scenarios": scenarios,
            "manifest": manifest
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/scenarios/{scenario_id}", response_model=Dict[str, Any])
def get_scenario_detail(scenario_id: str):
    """Fetch complete detail for a single scenario."""
    if scenario_id not in manager.scenarios_map:
        raise HTTPException(status_code=404, detail=f"Scenario {scenario_id} not found.")
    return manager.scenarios_map[scenario_id].model_dump()


@router.post("/api/annotate", response_model=Dict[str, Any])
def submit_annotation(req: ExpertAnnotationRequest):
    """Submit expert review annotation for a scenario."""
    try:
        updated_scen = manager.submit_expert_annotation(
            scenario_id=req.scenario_id,
            reviewer_id=req.reviewer_id,
            selected_action=req.selected_action,
            confidence=req.confidence,
            rationale=req.rationale,
            additional_info_needed=req.additional_info_needed,
            driving_evidence_factors=req.driving_evidence_factors,
            review_status=req.review_status
        )
        manifest = manager.save_reviewed_dataset()
        return {
            "status": "SUCCESS",
            "scenario_id": req.scenario_id,
            "updated_label": updated_scen.decision_label.model_dump(),
            "manifest": manifest
        }
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/metrics", response_model=Dict[str, Any])
def get_review_metrics():
    """Fetch current review metrics, coverage rates, and quality control report."""
    return manager.save_reviewed_dataset()


@router.get("", response_class=HTMLResponse)
def serve_review_ui():
    """Serve the standalone local domain review web application."""
    html_content = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>POLARIS — Expert Domain Review Portal</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg-dark: #0b1329;
            --panel-bg: rgba(18, 30, 61, 0.75);
            --card-border: rgba(64, 120, 192, 0.25);
            --primary: #38bdf8;
            --primary-hover: #0284c7;
            --accent-warning: #f59e0b;
            --accent-danger: #ef4444;
            --accent-success: #10b981;
            --text-main: #f1f5f9;
            --text-muted: #94a3b8;
            --radius: 12px;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: 'Inter', sans-serif;
            background: radial-gradient(circle at top right, #1e293b, var(--bg-dark));
            color: var(--text-main);
            min-height: 100vh;
            padding: 20px;
        }
        header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: var(--panel-bg);
            backdrop-filter: blur(12px);
            border: 1px solid var(--card-border);
            padding: 16px 24px;
            border-radius: var(--radius);
            margin-bottom: 16px;
        }
        .logo-title h1 { font-size: 1.4rem; color: #fff; display: flex; align-items: center; gap: 10px; }
        .logo-title span { font-size: 0.8rem; background: rgba(56, 189, 248, 0.15); color: var(--primary); padding: 4px 10px; border-radius: 20px; border: 1px solid rgba(56, 189, 248, 0.3); }
        .status-badge { font-size: 0.85rem; font-weight: 600; padding: 6px 14px; border-radius: 20px; text-transform: uppercase; letter-spacing: 0.5px; }
        .status-ready { background: rgba(245, 158, 11, 0.2); color: var(--accent-warning); border: 1px solid var(--accent-warning); }
        .status-progress { background: rgba(56, 189, 248, 0.2); color: var(--primary); border: 1px solid var(--primary); }
        .status-reviewed { background: rgba(16, 185, 129, 0.2); color: var(--accent-success); border: 1px solid var(--accent-success); }
        
        .workflow-bar {
            display: flex; gap: 6px; background: rgba(15, 23, 42, 0.8); border: 1px solid var(--card-border);
            border-radius: 8px; padding: 10px 14px; margin-bottom: 16px; overflow-x: auto;
        }
        .wf-step { font-size: 0.76rem; font-weight: 600; color: var(--text-muted); padding: 4px 8px; border-radius: 4px; background: rgba(255,255,255,0.03); white-space: nowrap; }
        .wf-arrow { color: var(--primary); font-size: 0.75rem; align-self: center; }

        .metrics-banner { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 16px; }
        .metric-card { background: rgba(15, 23, 42, 0.7); border: 1px solid var(--card-border); padding: 12px; border-radius: 8px; text-align: center; }
        .metric-card .num { font-size: 1.3rem; font-weight: 700; color: var(--primary); font-family: 'JetBrains Mono', monospace; }
        .metric-card .lbl { font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase; }

        .action-balance-bar {
            background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px;
            padding: 10px 14px; margin-bottom: 16px; font-size: 0.78rem; display: flex; align-items: center; justify-content: space-between; gap: 12px;
        }
        .action-tag-group { display: flex; gap: 8px; flex-wrap: wrap; }
        .action-tag { background: rgba(255,255,255,0.05); padding: 2px 8px; border-radius: 4px; border: 1px solid var(--card-border); }

        .main-layout { display: grid; grid-template-columns: 320px 1fr; gap: 20px; }
        .sidebar { background: var(--panel-bg); backdrop-filter: blur(12px); border: 1px solid var(--card-border); border-radius: var(--radius); padding: 18px; max-height: 85vh; overflow-y: auto; }
        .sidebar h2 { font-size: 0.95rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 14px; }
        .scen-list-item {
            padding: 12px; border-radius: 8px; border: 1px solid transparent; background: rgba(255,255,255,0.03); margin-bottom: 8px; cursor: pointer; transition: all 0.2s;
        }
        .scen-list-item:hover { border-color: var(--card-border); background: rgba(56, 189, 248, 0.08); }
        .scen-list-item.active { border-color: var(--primary); background: rgba(56, 189, 248, 0.15); }
        .scen-item-header { display: flex; justify-content: space-between; font-weight: 600; font-size: 0.88rem; }
        .scen-item-sub { font-size: 0.75rem; color: var(--text-muted); margin-top: 4px; display: flex; gap: 8px; }
        .badge-rank { background: rgba(239, 68, 68, 0.2); color: #f87171; padding: 2px 6px; border-radius: 4px; font-size: 0.7rem; font-weight: 700; }

        .content-area { display: flex; flex-direction: column; gap: 16px; }
        .panel { background: var(--panel-bg); backdrop-filter: blur(12px); border: 1px solid var(--card-border); border-radius: var(--radius); padding: 22px; }
        
        .scenario-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid var(--card-border); padding-bottom: 14px; margin-bottom: 18px; }
        .scenario-title { font-size: 1.3rem; font-weight: 700; color: #fff; }
        .scenario-meta { font-size: 0.85rem; color: var(--text-muted); margin-top: 4px; font-family: 'JetBrains Mono', monospace; }

        .grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 16px; }
        .data-card { background: rgba(10, 17, 40, 0.6); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 8px; padding: 14px; }
        .data-card h3 { font-size: 0.82rem; color: var(--primary); text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 10px; display: flex; align-items: center; gap: 6px; }
        .stat-row { display: flex; justify-content: space-between; font-size: 0.82rem; padding: 4px 0; border-bottom: 1px dashed rgba(255,255,255,0.05); }
        .stat-label { color: var(--text-muted); }
        .stat-val { font-weight: 600; font-family: 'JetBrains Mono', monospace; }

        .baseline-banner {
            background: linear-gradient(90deg, rgba(245, 158, 11, 0.15), rgba(239, 68, 68, 0.15));
            border: 1px solid rgba(245, 158, 11, 0.4);
            border-radius: 8px; padding: 14px 18px; margin-bottom: 16px;
            display: flex; justify-content: space-between; align-items: center;
        }
        .baseline-info h4 { font-size: 0.8rem; text-transform: uppercase; color: var(--accent-warning); letter-spacing: 1px; }
        .baseline-info .action { font-size: 1.2rem; font-weight: 700; color: #fff; margin-top: 2px; }
        .warning-pill { background: rgba(239, 68, 68, 0.25); color: #fca5a5; font-size: 0.75rem; font-weight: 700; padding: 4px 10px; border-radius: 12px; border: 1px solid #f87171; }

        .form-section { display: flex; flex-direction: column; gap: 18px; }
        .form-group { display: flex; flex-direction: column; gap: 6px; }
        .form-group label { font-size: 0.88rem; font-weight: 600; color: #e2e8f0; }
        .form-group span.help { font-size: 0.75rem; color: var(--text-muted); }
        
        .action-selector { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
        .action-btn {
            background: rgba(255,255,255,0.05); border: 1px solid var(--card-border);
            color: #cbd5e1; padding: 12px; border-radius: 8px; font-weight: 600; font-size: 0.85rem;
            cursor: pointer; text-align: center; transition: all 0.2s;
        }
        .action-btn:hover { background: rgba(56, 189, 248, 0.12); border-color: var(--primary); }
        .action-btn.selected { background: var(--primary); color: #0f172a; border-color: var(--primary); font-weight: 700; }
        .action-btn.ambiguous { background: rgba(239, 68, 68, 0.15); border-color: var(--accent-danger); color: #fca5a5; }
        .action-btn.ambiguous.selected { background: var(--accent-danger); color: #fff; }

        .factors-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; background: rgba(0,0,0,0.2); padding: 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05); }
        .factor-chk { display: flex; align-items: center; gap: 8px; font-size: 0.82rem; color: #cbd5e1; cursor: pointer; }

        input[type="text"], textarea, select {
            background: rgba(15, 23, 42, 0.8); border: 1px solid var(--card-border);
            color: #fff; padding: 10px 14px; border-radius: 8px; font-family: inherit; font-size: 0.88rem;
        }
        textarea { resize: vertical; min-height: 70px; }
        input:focus, textarea:focus, select:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.2); }

        .btn-group { display: flex; gap: 12px; justify-content: flex-end; align-items: center; }
        .btn-submit {
            background: linear-gradient(135deg, var(--primary), var(--primary-hover));
            color: #0f172a; font-weight: 700; border: none; padding: 12px 24px;
            border-radius: 8px; cursor: pointer; font-size: 0.92rem; transition: transform 0.1s, opacity 0.2s;
        }
        .btn-next {
            background: rgba(16, 185, 129, 0.2); color: var(--accent-success); border: 1px solid var(--accent-success);
            font-weight: 700; padding: 12px 20px; border-radius: 8px; cursor: pointer; font-size: 0.92rem; transition: all 0.2s;
        }
        .btn-next:hover { background: var(--accent-success); color: #0f172a; }

        .toast-success {
            display: none; background: rgba(16, 185, 129, 0.25); border: 1px solid var(--accent-success);
            color: #6ee7b7; padding: 10px 16px; border-radius: 8px; font-weight: 600; font-size: 0.88rem;
            margin-top: 10px; text-align: center;
        }

        .provenance-box {
            background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(255,255,255,0.08);
            border-radius: 8px; padding: 14px; margin-top: 10px; font-size: 0.8rem; font-family: 'JetBrains Mono', monospace;
        }
        .prov-tag { display: inline-block; background: rgba(56, 189, 248, 0.15); color: var(--primary); padding: 2px 8px; border-radius: 4px; font-size: 0.72rem; margin-right: 6px; }

        .prev-annotation-box {
            background: rgba(15, 23, 42, 0.5); border: 1px dashed rgba(255, 255, 255, 0.15);
            border-radius: 8px; padding: 12px; margin-top: 14px; font-size: 0.8rem; color: var(--text-muted);
        }
    </style>
</head>
<body>

<header>
    <div class="logo-title">
        <h1>POLARIS EXPERT DOMAIN REVIEW</h1>
    </div>
    <div>
        <span id="readiness-badge" class="status-badge status-ready">DATASET READY FOR DOMAIN REVIEW</span>
    </div>
</header>

<!-- Workflow Steps Banner -->
<div class="workflow-bar">
    <span class="wf-step">1. Read Scenario</span><span class="wf-arrow">➔</span>
    <span class="wf-step">2. Inspect Provenance</span><span class="wf-arrow">➔</span>
    <span class="wf-step">3. Check Hydrographics</span><span class="wf-arrow">➔</span>
    <span class="wf-step">4. Assess Experimental Baseline</span><span class="wf-arrow">➔</span>
    <span class="wf-step">5. Independent Decision</span><span class="wf-arrow">➔</span>
    <span class="wf-step">6. Record Rationale</span><span class="wf-arrow">➔</span>
    <span class="wf-step">7. Save & Next Case</span>
</div>

<!-- Metrics Banner -->
<div class="metrics-banner">
    <div class="metric-card"><div class="num" id="m-pqueue">0 / 100 (0%)</div><div class="lbl">Prioritized Queue Progress</div></div>
    <div class="metric-card"><div class="num" id="m-total">0 / 500 (0%)</div><div class="lbl">Total Corpus Progress</div></div>
    <div class="metric-card"><div class="num" id="m-remaining">100</div><div class="lbl">Prioritized Remaining</div></div>
    <div class="metric-card"><div class="num" id="m-ambiguous">0%</div><div class="lbl">Ambiguous Rate</div></div>
</div>

<!-- Action Balance Monitoring Bar -->
<div class="action-balance-bar">
    <span style="color: var(--text-muted); font-weight: 600;">Action Balance Monitoring:</span>
    <div class="action-tag-group" id="action-coverage-tags">
        <span class="action-tag">continue: 0/75</span>
        <span class="action-tag">slow_down: 0/275</span>
        <span class="action-tag">reroute: 0/64</span>
        <span class="action-tag">hold_position: 0/25</span>
        <span class="action-tag">request_escort: 0/36</span>
        <span class="action-tag">emergency_response: 0/25</span>
    </div>
</div>

<div class="main-layout">
    <div class="sidebar">
        <h2>Prioritized Queue (Top 100)</h2>
        <div id="scenario-list">Loading queue...</div>
    </div>

    <div class="content-area">
        <!-- Onboarding & Instructions Panel -->
        <div class="panel" style="background: rgba(15, 23, 42, 0.85); border-color: rgba(56, 189, 248, 0.3);">
            <div style="display: flex; justify-content: space-between; align-items: center; cursor: pointer;" onclick="toggleInstructions()">
                <h2 style="font-size: 1.05rem; color: var(--primary); display: flex; align-items: center; gap: 8px;">
                    📋 Onboarding & Operational Review Guidelines
                </h2>
                <span id="instructions-toggle-icon" style="font-size: 0.85rem; color: var(--text-muted); font-weight: 600;">[ Hide Guidelines ]</span>
            </div>
            <div id="instructions-body" style="margin-top: 14px; font-size: 0.86rem; line-height: 1.6; color: #cbd5e1; border-top: 1px dashed rgba(255,255,255,0.1); padding-top: 12px;">
                <ol style="padding-left: 20px; display: flex; flex-direction: column; gap: 8px;">
                    <li><strong>Evaluation Context:</strong> You are evaluating POLARIS polar navigation decision-support scenarios to establish verified domain safety labels.</li>
                    <li><strong>Experimental Baseline Notice:</strong> The displayed POLARIS baseline action is <em>EXPERIMENTAL and NOT EXPERT VALIDATED</em>. Do not assume the software recommendation is correct or safe.</li>
                    <li><strong>Data Composition:</strong> Scenarios combine real Antarctic environmental observations (USNIC icebergs, CMEMS sea ice, ERA5 wind/current) with simulated vessel kinematics and route variations.</li>
                    <li><strong>Independent Assessment:</strong> Evaluate each case using your professional polar maritime judgment, seamanship, and IMO Polar Code principles.</li>
                    <li><strong>Ambiguous Cases:</strong> Select <strong style="color: #fca5a5;">AMBIGUOUS / INSUFFICIENT INFO</strong> whenever available evidence is incomplete or does not support a single defensible maneuver.</li>
                    <li><strong>Expert Confidence Rating:</strong> Confidence ratings (1–5 scale) represent <em>your expert professional confidence</em> in your chosen action.</li>
                    <li><strong>Decision Rationale:</strong> Provide a brief explanation of why you selected or modified the navigation action.</li>
                    <li><strong>Additional Information Requests:</strong> Specify what additional sensors, sonar keels, or radar data would resolve uncertainty in complex cases.</li>
                    <li><strong>Preservation of Individual Annotations:</strong> Your expert judgment is recorded independently in full detail and will never be overwritten.</li>
                    <li><strong>Disagreement & Consensus:</strong> Professional disagreement between navigators is valid and expected; conflicting annotations are preserved transparently without being hidden.</li>
                </ol>
            </div>
        </div>

        <div class="panel" id="detail-panel">
            <div class="scenario-header">
                <div>
                    <div class="scenario-title" id="scen-title">Select a Scenario</div>
                    <div class="scenario-meta" id="scen-meta">Family: -- | Episode: --</div>
                    <div style="font-size:0.78rem; color:var(--primary); margin-top:4px;" id="scen-prio-reason">--</div>
                </div>
                <div id="scen-rank-badge"></div>
            </div>

            <!-- Environmental & Vessel Telemetry Grid -->
            <div class="grid-3">
                <div class="data-card">
                    <h3>🚢 Vessel State</h3>
                    <div class="stat-row"><span class="stat-label">Vessel Speed:</span><span class="stat-val" id="v-speed">--</span></div>
                    <div class="stat-row"><span class="stat-label">Heading:</span><span class="stat-val" id="v-heading">--</span></div>
                    <div class="stat-row"><span class="stat-label">Destination:</span><span class="stat-val" id="v-dest">--</span></div>
                    <div class="stat-row"><span class="stat-label">Dist to Dest:</span><span class="stat-val" id="v-dist">--</span></div>
                    <div class="stat-row"><span class="stat-label">Fuel Remaining:</span><span class="stat-val" id="v-fuel">--</span></div>
                </div>
                <div class="data-card">
                    <h3>🧊 Ice Hazards</h3>
                    <div class="stat-row"><span class="stat-label">Nearest Iceberg:</span><span class="stat-val" id="i-dist">--</span></div>
                    <div class="stat-row"><span class="stat-label">Sea Ice Conc:</span><span class="stat-val" id="i-conc">--</span></div>
                    <div class="stat-row"><span class="stat-label">Ice Thickness:</span><span class="stat-val" id="i-thick">--</span></div>
                    <div class="stat-row"><span class="stat-label">Route Blocked:</span><span class="stat-val" id="i-blocked">--</span></div>
                    <div class="stat-row"><span class="stat-label">Escort Available:</span><span class="stat-val" id="i-escort">--</span></div>
                </div>
                <div class="data-card">
                    <h3>🌬️ Environment</h3>
                    <div class="stat-row"><span class="stat-label">Wind Speed:</span><span class="stat-val" id="e-wind">--</span></div>
                    <div class="stat-row"><span class="stat-label">Current Speed:</span><span class="stat-val" id="e-curr">--</span></div>
                    <div class="stat-row"><span class="stat-label">Visibility:</span><span class="stat-val" id="e-vis">--</span></div>
                    <div class="stat-row"><span class="stat-label">Water Temp:</span><span class="stat-val" id="e-temp">--</span></div>
                    <div class="stat-row"><span class="stat-label">Emergency Status:</span><span class="stat-val" id="e-emerg">--</span></div>
                </div>
            </div>

            <!-- Provenance Info -->
            <div class="provenance-box">
                <strong>DATA PROVENANCE ANCHOR:</strong>
                <div style="margin-top:6px;">
                    <span class="prov-tag">ICEBERGS: USNIC (OBSERVED)</span>
                    <span class="prov-tag">SEA ICE: COPERNICUS CMEMS (SOURCE-DERIVED)</span>
                    <span class="prov-tag">OCEAN: ECMWF ERA5 (REANALYSIS)</span>
                    <span class="prov-tag">VESSEL: POLARIS SIMULATION</span>
                    <span class="prov-tag">ROUTE: POLARIS MODELLED</span>
                </div>
                <div style="margin-top:6px; color:var(--text-muted);">
                    Record ID: <span id="p-rec" style="color:#fff;">--</span> | Anchor Timestamp: <span id="p-ts" style="color:#fff;">--</span>
                </div>
            </div>

            <!-- Baseline Banner -->
            <div class="baseline-banner" style="margin-top:16px;">
                <div class="baseline-info">
                    <h4>POLARIS Experimental Baseline Recommendation</h4>
                    <div class="action" id="b-action">CONTINUE</div>
                    <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;" id="b-reason">--</div>
                </div>
                <div>
                    <span class="warning-pill">NOT EXPERT VALIDATED</span>
                </div>
            </div>

            <!-- Previous Annotations History Log (Unbiased) -->
            <div class="prev-annotation-box" id="prev-annotations-box" style="display:none;">
                <strong>📜 Previous Annotation Log:</strong> <span id="prev-ann-count">0 annotations recorded</span>.
                <div id="prev-ann-list" style="margin-top:6px; font-family:'JetBrains Mono', monospace; font-size:0.75rem;"></div>
            </div>

            <!-- Expert Decision Form -->
            <form id="review-form" class="form-section" style="margin-top: 16px;" onsubmit="handleAnnotationSubmit(event)">
                <div class="form-group">
                    <label>1. Reviewer Identity</label>
                    <input type="text" id="reviewer_id" placeholder="Enter assigned Reviewer ID e.g. REV_001" required style="max-width: 320px;" onchange="saveReviewerIdSession(this.value)">
                </div>

                <div class="form-group">
                    <label>2. Primary Recommended Action</label>
                    <span class="help">Select exactly one recommended navigation maneuver based on maritime safety.</span>
                    <div class="action-selector">
                        <div class="action-btn" onclick="selectAction('continue')">CONTINUE</div>
                        <div class="action-btn" onclick="selectAction('slow_down')">SLOW DOWN</div>
                        <div class="action-btn" onclick="selectAction('reroute')">REROUTE</div>
                        <div class="action-btn" onclick="selectAction('hold_position')">HOLD POSITION</div>
                        <div class="action-btn" onclick="selectAction('request_escort')">REQUEST ESCORT</div>
                        <div class="action-btn" onclick="selectAction('emergency_response')">EMERGENCY RESPONSE</div>
                        <div class="action-btn ambiguous" onclick="selectAction('AMBIGUOUS')">AMBIGUOUS / INSUFFICIENT INFO</div>
                    </div>
                </div>

                <div class="form-group">
                    <label>3. Reviewer Confidence Rating (1 = Very Low, 5 = Very High)</label>
                    <select id="confidence" required style="max-width: 250px;">
                        <option value="5">5 — Very High Confidence</option>
                        <option value="4" selected>4 — High Confidence</option>
                        <option value="3">3 — Moderate Confidence</option>
                        <option value="2">2 — Low Confidence</option>
                        <option value="1">1 — Very Low Confidence</option>
                    </select>
                </div>

                <div class="form-group">
                    <label>4. Key Driving Factors (Select all that apply)</label>
                    <div class="factors-grid">
                        <label class="factor-chk"><input type="checkbox" value="iceberg_proximity"> Iceberg Proximity</label>
                        <label class="factor-chk"><input type="checkbox" value="iceberg_size"> Iceberg Size</label>
                        <label class="factor-chk"><input type="checkbox" value="sea_ice_concentration"> Sea-Ice Concentration</label>
                        <label class="factor-chk"><input type="checkbox" value="ice_thickness"> Ice Thickness</label>
                        <label class="factor-chk"><input type="checkbox" value="visibility"> Visibility / Fog</label>
                        <label class="factor-chk"><input type="checkbox" value="wind"> Wind Speed / Direction</label>
                        <label class="factor-chk"><input type="checkbox" value="current"> Ocean Current</label>
                        <label class="factor-chk"><input type="checkbox" value="route_blockage"> Route Blockage</label>
                        <label class="factor-chk"><input type="checkbox" value="emergency_condition"> Emergency Status</label>
                        <label class="factor-chk"><input type="checkbox" value="vessel_speed"> Vessel Speed</label>
                        <label class="factor-chk"><input type="checkbox" value="escort_availability"> Escort Availability</label>
                        <label class="factor-chk"><input type="checkbox" value="fuel_operational"> Fuel / Operation Limit</label>
                    </div>
                </div>

                <div class="form-group">
                    <label>5. Review Rationale *</label>
                    <textarea id="rationale" placeholder="Why did you choose this action?" required></textarea>
                </div>

                <div class="form-group">
                    <label>6. Additional Information Needed (Optional / Ambiguous Cases)</label>
                    <textarea id="additional_info" placeholder="What additional information would change your decision?"></textarea>
                </div>

                <div class="btn-group">
                    <button type="submit" class="btn-submit">💾 Save Expert Annotation</button>
                    <button type="button" class="btn-next" onclick="goToNextUnreviewedScenario()">➡️ Next Priority Case</button>
                </div>

                <div id="save-toast" class="toast-success">
                    ✅ SAVED — Expert annotation recorded successfully!
                </div>
            </form>
        </div>
    </div>
</div>

<script>
    let scenariosData = [];
    let selectedScenId = null;
    let selectedActionVal = null;

    function saveReviewerIdSession(val) {
        if (val) localStorage.setItem('polaris_reviewer_id', val.trim());
    }

    function loadReviewerIdSession() {
        const saved = localStorage.getItem('polaris_reviewer_id');
        if (saved) document.getElementById('reviewer_id').value = saved;
    }

    async function loadData() {
        const res = await fetch('/review/api/scenarios?top_n=100');
        const data = await res.json();
        scenariosData = data.scenarios;
        renderSidebar();
        renderMetrics(data.manifest);
        loadReviewerIdSession();
        if (scenariosData.length > 0 && !selectedScenId) {
            selectScenario(scenariosData[0].scenario_id);
        }
    }

    function renderMetrics(manifest) {
        const m = manifest.metrics || {};
        const total = m.total_scenarios || 500;
        const reviewed = m.reviewed_count || 0;
        
        // Count top 100 reviewed
        const pQueueReviewed = scenariosData.filter(s => s.decision_label.reviewer_status !== 'UNREVIEWED').length;
        const pQueueTotal = scenariosData.length || 100;
        const pQueuePct = ((pQueueReviewed / pQueueTotal) * 100).toFixed(1);
        const corpusPct = ((reviewed / total) * 100).toFixed(1);

        document.getElementById('m-pqueue').innerText = `${pQueueReviewed} / ${pQueueTotal} (${pQueuePct}%)`;
        document.getElementById('m-total').innerText = `${reviewed} / ${total} (${corpusPct}%)`;
        document.getElementById('m-remaining').innerText = pQueueTotal - pQueueReviewed;
        document.getElementById('m-ambiguous').innerText = `${m.pct_ambiguous || 0}%`;

        // Render Action Coverage Tags
        const tagsEl = document.getElementById('action-coverage-tags');
        if (m.action_review_coverage) {
            tagsEl.innerHTML = '';
            for (const [act, covStr] of Object.entries(m.action_review_coverage)) {
                const tag = document.createElement('span');
                tag.className = 'action-tag';
                tag.innerText = `${act}: ${covStr}`;
                tagsEl.appendChild(tag);
            }
        }

        const statusPill = document.getElementById('readiness-badge');
        const st = manifest.readiness_status || 'DATASET_READY_FOR_DOMAIN_REVIEW';
        statusPill.innerText = st.replace(/_/g, ' ');
        if (st.includes('IN_PROGRESS')) {
            statusPill.className = 'status-badge status-progress';
        } else if (st.includes('DOMAIN_REVIEWED')) {
            statusPill.className = 'status-badge status-reviewed';
        } else {
            statusPill.className = 'status-badge status-ready';
        }
    }

    function renderSidebar() {
        const listEl = document.getElementById('scenario-list');
        listEl.innerHTML = '';
        scenariosData.forEach((scen, idx) => {
            const item = document.createElement('div');
            item.className = `scen-list-item ${scen.scenario_id === selectedScenId ? 'active' : ''}`;
            item.onclick = () => selectScenario(scen.scenario_id);
            
            const isReviewed = scen.decision_label.reviewer_status !== 'UNREVIEWED';
            item.innerHTML = `
                <div class="scen-item-header">
                    <span>${scen.scenario_id}</span>
                    <span class="badge-rank">Rank #${idx + 1}</span>
                </div>
                <div class="scen-item-sub">
                    <span>${scen.scenario_family}</span>
                    <span>${isReviewed ? '✅ Reviewed' : '⏳ Pending'}</span>
                </div>
            `;
            listEl.appendChild(item);
        });
    }

    function selectScenario(scenId) {
        selectedScenId = scenId;
        const scen = scenariosData.find(s => s.scenario_id === scenId);
        if (!scen) return;

        renderSidebar();

        document.getElementById('scen-title').innerText = scen.scenario_id;
        document.getElementById('scen-meta').innerText = `Family: ${scen.scenario_family} | Split: ${scen.dataset_split}`;
        
        // Prioritization Reason
        const hazardScore = scen.decision_label.hazard_severity_score || 0;
        const blocked = scen.state.ice?.route_segment_blocked;
        let prioReason = `Prioritization Reason: Family ${scen.scenario_family}`;
        if (hazardScore >= 1.5) prioReason += " | High Hazard Severity (≥1.5)";
        if (blocked) prioReason += " | Route Blocked";
        document.getElementById('scen-prio-reason').innerText = prioReason;

        const nav = scen.state.navigation || {};
        const ice = scen.state.ice || {};
        const env = scen.state.environment || {};
        const op = scen.state.operational || {};

        document.getElementById('v-speed').innerText = `${nav.vessel_speed_knots || 0} kts`;
        document.getElementById('v-heading').innerText = `${nav.heading_deg || 0}°`;
        document.getElementById('v-dest').innerText = nav.destination_name || 'McMurdo Station';
        document.getElementById('v-dist').innerText = `${nav.distance_to_destination_nm || 0} NM`;
        document.getElementById('v-fuel').innerText = `${op.fuel_remaining_percent || 100}%`;

        document.getElementById('i-dist').innerText = `${ice.nearest_iceberg_distance_m || 0} m`;
        document.getElementById('i-conc').innerText = `${(ice.sea_ice_concentration * 100).toFixed(0)}%`;
        document.getElementById('i-thick').innerText = `${ice.sea_ice_thickness_m || 0} m`;
        document.getElementById('i-blocked').innerText = ice.route_segment_blocked ? 'YES (BLOCKED)' : 'NO (CLEAR)';
        document.getElementById('i-escort').innerText = op.icebreaker_escort_available ? 'YES' : 'NO';

        document.getElementById('e-wind').innerText = `${env.wind_speed_knots || 0} kts`;
        document.getElementById('e-curr').innerText = `${env.current_speed_knots || 0} kts`;
        document.getElementById('e-vis').innerText = `${env.visibility_nautical_miles || 0} NM`;
        document.getElementById('e-temp').innerText = `${env.water_temperature_c || 0} °C`;
        document.getElementById('e-emerg').innerText = op.emergency_status ? 'ACTIVE (CRITICAL)' : 'NONE';

        const prov = scen.provenance || {};
        document.getElementById('p-rec').innerText = prov.source_anchor?.record_id || scen.scenario_id;
        document.getElementById('p-ts').innerText = scen.timestamp;

        const lbl = scen.decision_label || {};
        document.getElementById('b-action').innerText = (lbl.selected_action || 'continue').toUpperCase();
        document.getElementById('b-reason').innerText = lbl.label_reason || '';

        // Reset form selections
        selectedActionVal = null;
        document.querySelectorAll('.action-btn').forEach(btn => btn.classList.remove('selected'));
        document.getElementById('rationale').value = '';
        document.getElementById('additional_info').value = '';
        document.querySelectorAll('.factor-chk input').forEach(chk => chk.checked = false);
        document.getElementById('save-toast').style.display = 'none';

        loadReviewerIdSession();

        // Render previous annotations log without biasing reviewer
        const anns = lbl.individual_annotations || [];
        const prevBox = document.getElementById('prev-annotations-box');
        const prevList = document.getElementById('prev-ann-list');
        if (anns.length > 0) {
            prevBox.style.display = 'block';
            document.getElementById('prev-ann-count').innerText = `${anns.length} previous annotation(s) logged`;
            prevList.innerHTML = anns.map((a, i) => `<div>#${i+1}: Reviewer ${a.reviewer_id} logged on ${a.reviewed_at}</div>`).join('');

            // If current reviewer already annotated, populate their draft
            const currentRev = document.getElementById('reviewer_id').value.trim();
            const myAnn = anns.find(a => a.reviewer_id === currentRev) || anns[anns.length - 1];
            if (myAnn) {
                selectAction(myAnn.selected_action);
                document.getElementById('confidence').value = Math.round(myAnn.confidence || 4);
                document.getElementById('rationale').value = myAnn.rationale || '';
                document.getElementById('additional_info').value = myAnn.additional_info_needed || '';
                (myAnn.driving_evidence_factors || []).forEach(f => {
                    const chk = document.querySelector(`.factor-chk input[value="${f}"]`);
                    if (chk) chk.checked = true;
                });
            }
        } else {
            prevBox.style.display = 'none';
        }
    }

    function selectAction(val) {
        selectedActionVal = val;
        document.querySelectorAll('.action-btn').forEach(btn => {
            btn.classList.remove('selected');
            if (btn.innerText.includes(val.toUpperCase()) || (val === 'AMBIGUOUS' && btn.innerText.includes('AMBIGUOUS'))) {
                btn.classList.add('selected');
            }
        });
    }

    async function handleAnnotationSubmit(e) {
        e.preventDefault();
        if (!selectedScenId) { alert('No scenario selected'); return; }
        if (!selectedActionVal) { alert('Please select a primary recommended action.'); return; }

        const revId = document.getElementById('reviewer_id').value.trim();
        saveReviewerIdSession(revId);

        const conf = parseFloat(document.getElementById('confidence').value);
        const rat = document.getElementById('rationale').value.trim();
        const addInfo = document.getElementById('additional_info').value.trim();

        const factors = [];
        document.querySelectorAll('.factor-chk input:checked').forEach(chk => factors.push(chk.value));

        const payload = {
            scenario_id: selectedScenId,
            reviewer_id: revId,
            selected_action: selectedActionVal,
            confidence: conf,
            rationale: rat,
            additional_info_needed: addInfo,
            driving_evidence_factors: factors
        };

        try {
            const res = await fetch('/review/api/annotate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (res.ok) {
                const toast = document.getElementById('save-toast');
                toast.style.display = 'block';
                await loadData();
            } else {
                alert(`Error: ${data.detail}`);
            }
        } catch (err) {
            alert(`Submission failed: ${err.message}`);
        }
    }

    function goToNextUnreviewedScenario() {
        const unreviewed = scenariosData.find(s => s.decision_label.reviewer_status === 'UNREVIEWED');
        if (unreviewed) {
            selectScenario(unreviewed.scenario_id);
        } else {
            alert('All top-100 prioritized scenarios have been reviewed!');
        }
    }

    function toggleInstructions() {
        const body = document.getElementById('instructions-body');
        const icon = document.getElementById('instructions-toggle-icon');
        if (body.style.display === 'none') {
            body.style.display = 'block';
            icon.innerText = '[ Hide Guidelines ]';
        } else {
            body.style.display = 'none';
            icon.innerText = '[ Show Guidelines ]';
        }
    }

    window.onload = loadData;
</script>
</body>
</html>
"""
    return HTMLResponse(content=html_content)
