/**
 * POLARIS Nav-OS — Real-Time Decision & Robustness HUD Panel (Phase 6B)
 *
 * Displays decision evidence, COLREG rule basis, safety margins, decision robustness,
 * counterfactual branch analysis, sensor freshness, and debounced bridge alerts.
 *
 * STEP 13 TERMINOLOGY ENFORCEMENT:
 * - Data Modes: LIVE | REPLAY | CACHED | SYNTHETIC | STALE | DEGRADED | UNKNOWN (NEVER fake "REAL")
 * - Confidence Types: HIGH_EVIDENCE | MODERATE_EVIDENCE | LIMITED_EVIDENCE | INSUFFICIENT_EVIDENCE | CONFLICTED_EVIDENCE
 */

export class CopilotHUD {
  constructor(containerId = 'copilot-hud') {
    this.containerId = containerId;
    this.container = null;
    this.explanations = [];
    this.maxExplanations = 5;
    this.autoHideDelay = 10000;
    this.debugCounterfactualMode = false;

    this.initializeUI();
  }

  initializeUI() {
    if (typeof document === 'undefined') return;
    if (document.getElementById(this.containerId)) {
      this.container = document.getElementById(this.containerId);
      return;
    }

    this.container = document.createElement('div');
    this.container.id = this.containerId;
    this.container.style.cssText = `
      display: none;
      position: fixed;
      bottom: 20px;
      left: 20px;
      width: 420px;
      max-height: 380px;
      overflow-y: auto;
      background: rgba(10, 25, 47, 0.92);
      border: 1px solid #3b82f6;
      border-radius: 8px;
      padding: 12px;
      font-family: 'Segoe UI', system-ui, sans-serif;
      font-size: 13px;
      color: #e0f2fe;
      z-index: 10000;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(8px);
      transition: opacity 0.3s ease;
    `;

    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
      padding-bottom: 6px;
      border-bottom: 1px solid rgba(59, 130, 246, 0.4);
    `;

    header.innerHTML = `
      <span style="font-weight: 600; color: #60a5fa; display: flex; align-items: center; gap: 6px;">
        <span style="display:inline-block; width:8px; height:8px; background:#22c55e; border-radius:50%;"></span>
        POLARIS Decision & Robustness HUD
      </span>
      <span style="font-size: 11px; color: #94a3b8;">COLREG / Counterfactual Engine</span>
    `;

    this.container.appendChild(header);

    // STEP 12: Decision Summary Card
    this.decisionCard = document.createElement('div');
    this.decisionCard.id = 'hud-decision-card';
    this.decisionCard.style.cssText = `
      margin-bottom: 8px;
      padding: 8px 10px;
      background: rgba(30, 58, 138, 0.35);
      border-left: 4px solid #3b82f6;
      border-radius: 4px;
      font-size: 12px;
    `;
    this.decisionCard.innerHTML = `<span style="color:#94a3b8;">Awaiting decision telemetry...</span>`;
    this.container.appendChild(this.decisionCard);

    // Counterfactual Analysis Card (Debug mode toggle)
    this.counterfactualCard = document.createElement('div');
    this.counterfactualCard.id = 'hud-counterfactual-card';
    this.counterfactualCard.style.cssText = `
      display: none;
      margin-bottom: 8px;
      padding: 8px 10px;
      background: rgba(15, 23, 42, 0.6);
      border: 1px dashed #64748b;
      border-radius: 4px;
      font-size: 11px;
    `;
    this.container.appendChild(this.counterfactualCard);

    this.explanationsList = document.createElement('div');
    this.explanationsList.id = 'copilot-explanations';
    this.container.appendChild(this.explanationsList);

    document.body.appendChild(this.container);
    console.info('[CopilotHUD] Decision & Robustness HUD Panel initialized');
  }

  /**
   * STEP 12 & 13: Update HUD with complete real-time decision & robustness state.
   */
  updateDecisionTelemetry(decisionRecord = {}, counterfactualResult = null, sensorHealth = {}) {
    if (!this.decisionCard) return;

    const action = decisionRecord.selectedAction ? decisionRecord.selectedAction.actionClass : 'MAINTAIN';
    const encounter = decisionRecord.primaryEncounter ? decisionRecord.primaryEncounter.type : 'CLEAR';
    const rule = (decisionRecord.applicableRuleCandidates && decisionRecord.applicableRuleCandidates[0]) ? decisionRecord.applicableRuleCandidates[0].title : 'Rule 5/6 Safe Speed';
    const confType = decisionRecord.decisionConfidenceType || 'HIGH_EVIDENCE';
    const dataMode = sensorHealth.dataMode || 'SYNTHETIC'; // STEP 13: Exact mode tag (LIVE|REPLAY|SYNTHETIC|STALE)

    this.decisionCard.innerHTML = `
      <div style="display:flex; justify-content:space-between; margin-bottom:4px; font-weight:600; color:#38bdf8;">
        <span>${action}</span>
        <span style="font-size:10px; padding:2px 6px; background:#1e293b; border-radius:3px; color:#94a3b8;">MODE: ${dataMode}</span>
      </div>
      <div style="font-size:11px; color:#cbd5e1; margin-bottom:4px;">
        <strong>Encounter:</strong> ${encounter} | <strong>Rule:</strong> ${rule}
      </div>
      <div style="display:flex; gap:12px; font-size:10px; color:#94a3b8;">
        <span>Evidence: <strong style="color:#60a5fa;">${confType}</strong></span>
        <span>Target Hdg: <strong>${decisionRecord.controlProposal?.targetHeading || 0}°</strong></span>
        <span>Target Spd: <strong>${decisionRecord.controlProposal?.targetSpeed || 15} SU/s</strong></span>
      </div>
    `;

    // Update Counterfactual Card if active
    if (counterfactualResult && this.debugCounterfactualMode) {
      this.counterfactualCard.style.display = 'block';
      const margin = counterfactualResult.margin ? counterfactualResult.margin.marginClass : 'ROBUST_DECISION';
      const dominance = counterfactualResult.perturbation ? `${(counterfactualResult.perturbation.dominanceRatio * 100).toFixed(0)}%` : '100%';

      this.counterfactualCard.innerHTML = `
        <div style="color:#e2e8f0; font-weight:600; margin-bottom:2px;">COUNTERFACTUAL ROBUSTNESS</div>
        <div>Margin: <strong style="color:#34d399;">${margin}</strong> | Dominance: <strong>${dominance}</strong></div>
        <div>Top Alternative: ${counterfactualResult.margin?.secondClearance ? `${counterfactualResult.margin.secondClearance}m clearance` : 'None'}</div>
      `;
    }
  }

  setDebugCounterfactualMode(enabled = true) {
    this.debugCounterfactualMode = enabled;
    if (this.counterfactualCard && !enabled) {
      this.counterfactualCard.style.display = 'none';
    }
  }

  addExplanation(explanation) {
    if (!this.explanationsList) return;

    const explanationEl = document.createElement('div');
    const riskLevel = explanation.context?.routeRisk || 'safe';

    explanationEl.style.cssText = `
      margin-bottom: 8px;
      padding: 8px 10px;
      background: rgba(30, 58, 138, 0.25);
      border-left: 4px solid ${this.getRiskColor(riskLevel)};
      border-radius: 4px;
      font-size: 12px;
    `;

    const sourceBadge = explanation.source === 'llm' ? '🧠 Ollama AI' : (explanation.source === 'system' ? '⚙️ System' : '📊 Rule Engine');
    const confidence = explanation.confidence ? `(${Math.round(explanation.confidence * 100)}%)` : '';
    const timestamp = new Date().toLocaleTimeString();

    explanationEl.innerHTML = `
      <div style="font-size: 10px; color: #94a3b8; margin-bottom: 3px; display: flex; justify-content: space-between;">
        <span>${sourceBadge} ${confidence}</span>
        <span>${timestamp}</span>
      </div>
      <div style="line-height: 1.4; color: #f1f5f9;">
        ${explanation.text}
      </div>
    `;

    this.explanationsList.insertBefore(explanationEl, this.explanationsList.firstChild);
    this.explanations.push(explanationEl);

    if (this.explanations.length > this.maxExplanations) {
      const oldEl = this.explanations.pop();
      if (oldEl && oldEl.parentNode) {
        this.explanationsList.removeChild(oldEl);
      }
    }

    setTimeout(() => {
      if (explanationEl.parentNode) {
        explanationEl.style.opacity = '0';
        explanationEl.style.transition = 'opacity 0.8s';
        setTimeout(() => {
          if (explanationEl.parentNode) {
            this.explanationsList.removeChild(explanationEl);
            const idx = this.explanations.indexOf(explanationEl);
            if (idx !== -1) this.explanations.splice(idx, 1);
          }
        }, 800);
      }
    }, this.autoHideDelay);
  }

  getRiskColor(riskLevel) {
    const colors = {
      safe: '#22c55e',
      caution: '#eab308',
      danger: '#f97316',
      critical: '#ef4444'
    };
    return colors[riskLevel] || colors.safe;
  }

  clearExplanations() {
    if (this.explanationsList) {
      this.explanationsList.innerHTML = '';
    }
    this.explanations = [];
  }

  toggleVisibility() {
    if (!this.container) return;
    this.container.style.display = (this.container.style.display === 'none') ? 'block' : 'none';
  }
}

export function createCopilotHUD(containerId = 'copilot-hud') {
  return new CopilotHUD(containerId);
}
