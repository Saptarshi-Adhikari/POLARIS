/**
 * ASTRALIS Nav-OS — LLM Copilot Module (Phase 10)
 *
 * Interfaces with local LLM (Ollama / Llama 3.2 3B) or backend copilot endpoints.
 * Provides concise (<100 words), actionable natural-language explanations
 * for autopilot decisions with rule-based fallback.
 */

export class LLMCopilot {
  constructor(options = {}) {
    this.ollamaUrl = options.ollamaUrl || 'http://localhost:11434';
    this.modelName = options.modelName || 'llama3.2:3b';
    this.isAvailable = false;
    this.useRuleBasedFallback = true;

    this.explanationHistory = [];
    this.maxHistoryLength = options.maxHistoryLength || 50;

    this.stats = {
      totalExplanations: 0,
      llmExplanations: 0,
      ruleBasedExplanations: 0,
      avgLatency: 0
    };
  }

  async checkAvailability() {
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 2000);
      const response = await fetch(`${this.ollamaUrl}/api/tags`, {
        method: 'GET',
        signal: controller.signal
      });
      clearTimeout(tid);

      if (response.ok) {
        const data = await response.json();
        const hasModel = data.models?.some(m => m.name.includes('llama') || m.name.includes(this.modelName));
        const prevAvail = this.isAvailable;
        this.isAvailable = hasModel || false;

        if (this.isAvailable !== prevAvail || !this._loggedState) {
          this._loggedState = true;
          if (this.isAvailable) {
            console.info(`[LLM Copilot] ${this.modelName} available online`);
          } else {
            console.info(`[LLM Copilot] Model not found in Ollama, rule-based fallback active`);
          }
        }
        return this.isAvailable;
      }
    } catch (error) {
      if (this.isAvailable !== false || !this._loggedState) {
        this._loggedState = true;
        console.info('[LLM Copilot] Ollama unavailable, rule-based fallback active');
      }
    }
    this.isAvailable = false;
    return false;
  }

  async generateExplanation(context) {
    const startTime = performance.now();

    if (this.isAvailable) {
      try {
        const llmExplanation = await this.generateLLMExplanation(context);
        this.stats.totalExplanations++;
        this.stats.llmExplanations++;
        this.updateStats(startTime);
        this.addToHistory(llmExplanation);
        return llmExplanation;
      } catch (error) {
        console.warn('[LLM Copilot] LLM explanation failed, using rule-based:', error.message);
      }
    }

    const ruleExplanation = this.generateRuleBasedExplanation(context);
    this.stats.totalExplanations++;
    this.stats.ruleBasedExplanations++;
    this.updateStats(startTime);
    this.addToHistory(ruleExplanation);
    return ruleExplanation;
  }

  async generateLLMExplanation(context) {
    const prompt = this.buildPrompt(context);

    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${this.ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.modelName,
        prompt: prompt,
        stream: false,
        options: {
          temperature: 0.7,
          top_p: 0.9,
          num_predict: 120,
          stop: ['\n\n', '###']
        }
      }),
      signal: controller.signal
    });
    clearTimeout(tid);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    let explanation = data.response.trim();

    explanation = explanation
      .replace(/^Based on.*?\n/i, '')
      .replace(/^In this scenario.*?\n/i, '')
      .replace(/\n\s*$/g, '');

    return {
      text: explanation,
      source: 'llm',
      model: this.modelName,
      timestamp: performance.now(),
      context: context,
      confidence: 0.9
    };
  }

  buildPrompt(context) {
    const pos = context.shipPosition || { x: 0, y: 0 };
    const dest = context.destination || { x: 0, y: 0 };
    const hazards = context.hazards || [];

    return `You are an AI copilot for a polar research vessel. Generate a concise, clear explanation (under 100 words) for the autopilot's decision.

SITUATION:
- Ship position: (${pos.x.toFixed(1)}, ${pos.y.toFixed(1)})
- Ship heading: ${((context.shipHeading || 0) * 180 / Math.PI).toFixed(0)}°
- Ship speed: ${(context.shipSpeed || 0).toFixed(1)} knots
- Destination: (${dest.x.toFixed(1)}, ${dest.y.toFixed(1)})

HAZARDS:
${hazards.map(h => `- ${h.type || 'hazard'}: ${(h.distance || 0).toFixed(0)}m away`).join('\n') || 'None'}

ROUTE:
- Current route risk: ${context.routeRisk || 'safe'} (safe/caution/danger/critical)
- Recommended action: ${context.recommendedAction || 'maintain_course'}

EXPLAIN:
1. What maneuver is recommended?
2. Why is it necessary?
3. Risk level and consequences if ignored.`;
  }

  generateRuleBasedExplanation(context) {
    const action = (context.recommendedAction || '').toLowerCase();
    const riskLevel = context.routeRisk || 'safe';
    const hazards = context.hazards || [];

    let explanation = '';

    if (action.includes('reroute') || action.includes('turn')) {
      const direction = (hazards[0]?.bearing || 0) < 0 ? 'port' : 'starboard';
      explanation = `Autopilot recommending ${direction} alteration to avoid `;
      if (hazards[0]) {
        explanation += `${hazards[0].type || 'hazard'} at ${(hazards[0].distance || 0).toFixed(0)}m range.`;
      } else {
        explanation += `detected navigational hazard.`;
      }
    } else if (action.includes('slow') || action.includes('decelerate')) {
      explanation = `Autopilot reducing speed to ${(context.targetSpeed || 6).toFixed(0)} knots due to `;
      if ((context.seaIceConcentration || 0) > 0.5) {
        explanation += `high sea ice concentration (${((context.seaIceConcentration || 0) * 100).toFixed(0)}%).`;
      } else {
        explanation += `proximity to hazards.`;
      }
    } else if (action.includes('stop') || action.includes('emergency')) {
      explanation = `EMERGENCY: Autopilot initiating emergency stop. Critical collision risk within ${(hazards[0]?.distance || 0).toFixed(0)}m.`;
    } else {
      explanation = `Autopilot maintaining optimal course and speed toward destination. Route risk: ${riskLevel}.`;
    }

    if (riskLevel === 'critical' || riskLevel === 'danger') {
      explanation += ` Risk level: ${riskLevel.toUpperCase()}. Immediate monitoring required.`;
    }

    return {
      text: explanation,
      source: 'rule_based',
      timestamp: performance.now(),
      context: context,
      confidence: 0.75
    };
  }

  addToHistory(explanation) {
    this.explanationHistory.push(explanation);
    if (this.explanationHistory.length > this.maxHistoryLength) {
      this.explanationHistory.shift();
    }
  }

  getHistory(limit = 10) {
    return this.explanationHistory.slice(-limit);
  }

  clearHistory() {
    this.explanationHistory = [];
  }

  updateStats(startTime) {
    const latency = performance.now() - startTime;
    this.stats.avgLatency = (this.stats.avgLatency * 0.9 + latency * 0.1);
  }

  getStats() {
    return {
      totalExplanations: this.stats.totalExplanations,
      llmExplanations: this.stats.llmExplanations,
      ruleBasedExplanations: this.stats.ruleBasedExplanations,
      avgLatency: parseFloat(this.stats.avgLatency.toFixed(2)),
      isAvailable: this.isAvailable,
      model: this.modelName
    };
  }
}

export const llmCopilot = new LLMCopilot();
