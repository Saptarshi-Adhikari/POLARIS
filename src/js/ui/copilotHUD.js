/**
 * ASTRALIS Nav-OS — Explainable AI Copilot HUD (Phase 10)
 *
 * Displays natural language decision explanations, risk levels,
 * confidence scores, and copilot status in real time.
 */

export class CopilotHUD {
  constructor(containerId = 'copilot-hud') {
    this.containerId = containerId;
    this.container = null;
    this.explanations = [];
    this.maxExplanations = 5;
    this.autoHideDelay = 10000;

    this.initializeUI();
  }

  initializeUI() {
    if (document.getElementById(this.containerId)) {
      this.container = document.getElementById(this.containerId);
      return;
    }

    this.container = document.createElement('div');
    this.container.id = this.containerId;
    this.container.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 20px;
      width: 380px;
      max-height: 280px;
      overflow-y: auto;
      background: rgba(10, 25, 47, 0.88);
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
        ASTRALIS Copilot
      </span>
      <span style="font-size: 11px; color: #94a3b8;">Llama 3.2 3B / Rule Engine</span>
    `;

    this.container.appendChild(header);

    this.explanationsList = document.createElement('div');
    this.explanationsList.id = 'copilot-explanations';
    this.container.appendChild(this.explanationsList);

    document.body.appendChild(this.container);
    console.info('[CopilotHUD] HUD interface initialized');
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
