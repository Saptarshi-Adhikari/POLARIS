export class AIClient {
  constructor(engine) {
    this.engine = engine;
    this.status = 'OFFLINE';
    this.copilotStatus = 'OFFLINE';
    const hostname = (typeof window !== 'undefined' && window.location) ? window.location.hostname : '';
    this.baseUrl = (hostname === 'localhost' || hostname === '127.0.0.1')
      ? 'http://127.0.0.1:8000'
      : '/api';
    this.lastPredictTime = 0;
    this.confidence = 0;
    this.forecastCount = 0;
    this.lastDecisionMode = '';
    this.seaIceForecast = null;
    this.lastSeaIcePredictTime = 0;

    if (typeof window !== 'undefined') {
      // Start status heartbeat polling
      this.pollStatus();
      setInterval(() => this.pollStatus(), 5000);
    }
  }

  async fetchWithFallback(url, options = {}, mockData) {
    const timeout = 5000;
    const maxRetries = 3;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        
        const response = await fetch(url, {
          ...options,
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        
        return await response.json();
        
      } catch (error) {
        console.warn(`[API] Attempt ${attempt} failed for ${url}:`, error.message);
        if (attempt === maxRetries) {
          console.error(`[API] All attempts failed for ${url}, using mock data`);
          return mockData;
        }
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
  }

  async pollStatus() {
    try {
      const data = await this.fetchWithFallback(`${this.baseUrl}/health`, {}, { status: 'OFFLINE' });
      this.status = data.status === 'ONLINE' ? 'ONLINE' : 'OFFLINE';
    } catch (e) {
      this.status = 'OFFLINE';
    }

    try {
      const copilotData = await this.fetchWithFallback(`${this.baseUrl}/copilot/health`, {}, { status: 'OFFLINE' });
      this.copilotStatus = copilotData.status;
    } catch (e) {
      this.copilotStatus = 'OFFLINE';
    }
    
    this.updateUIStatus();
  }

  async updatePredictions() {
    if (this.status !== 'ONLINE') {
      // Clear ML trajectories when offline to fallback to physics
      this.engine.icebergs.forEach(ice => {
        ice.mlTrajectory = null;
      });
      this.forecastCount = 0;
      this.confidence = 0;
      this.updateUIStatus();
      return;
    }

    const now = performance.now();

    // Periodically fetch sea-ice forecast (once every 10 seconds)
    if (now - this.lastSeaIcePredictTime > 10000) {
      this.lastSeaIcePredictTime = now;
      this.fetchSeaIceForecast();
    }

    if (now - this.lastPredictTime < 3000) return; // Predict once every 3 seconds
    this.lastPredictTime = now;

    const env = this.engine.state.environment;
    let totalConfidence = 0;
    let count = 0;

    for (let ice of this.engine.icebergs) {
      try {
        const data = await this.fetchWithFallback(`${this.baseUrl}/predict/iceberg`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            icebergId: ice.id.toString(),
            x: ice.x,
            y: ice.y,
            vx: ice.vx,
            vy: ice.vy,
            wind_speed: env.wind.enabled ? env.wind.speed : 0,
            wind_dir: env.wind.enabled ? env.wind.direction : 0,
            current_speed: env.ocean.currentSpeed,
            current_dir: env.ocean.currentDirection
          })
        }, { predictions: [] });

        if (data && data.predictions && data.predictions.length > 0) {
          // Store predictions
          ice.mlTrajectory = data.predictions.map(p => ({
            hour: p.time === 10 ? 2 : (p.time === 30 ? 6 : 12), // maps to +2h, +6h, +12h visual indicators
            time: p.time,
            x: p.x,
            y: p.y,
            confidence: p.confidence,
            uncertainty: p.uncertainty
          }));
          
          if (window.simEngine && window.simEngine.validationEngine) {
            data.predictions.forEach(p => {
              window.simEngine.validationEngine.logPrediction(
                ice.id,
                p.x,
                p.y,
                p.confidence,
                p.uncertainty,
                p.time
              );
            });
          }

          let sumConf = data.predictions.reduce((acc, p) => acc + p.confidence, 0);
          totalConfidence += sumConf / data.predictions.length;
          count++;
        } else {
          ice.mlTrajectory = null;
        }
      } catch (e) {
        // Fallback silently
        ice.mlTrajectory = null;
      }
    }

    this.forecastCount = count;
    this.confidence = count > 0 ? totalConfidence / count : 0;
    this.updateUIStatus();

    // Trigger AI Copilot automatic explanation if decision mode changes
    const autoCtrl = this.engine.autonomousController;
    if (autoCtrl && autoCtrl.currentCommand.mode !== this.lastDecisionMode) {
      this.lastDecisionMode = autoCtrl.currentCommand.mode;
      this.requestCopilotExplanation('general');
    }
  }

  updateUIStatus() {
    const statusEl = document.getElementById('ai-engine-status');
    const confidenceEl = document.getElementById('ai-engine-confidence');
    const forecastEl = document.getElementById('ai-engine-forecasts');

    if (statusEl) {
      statusEl.innerText = this.status;
      statusEl.className = this.status === 'ONLINE' 
        ? 'text-secondary font-bold ml-1' 
        : 'text-error font-bold ml-1';
    }
    if (confidenceEl) {
      confidenceEl.innerText = this.status === 'ONLINE' 
        ? `${(this.confidence * 100).toFixed(0)}%` 
        : 'N/A';
    }
    if (forecastEl) {
      forecastEl.innerText = this.status === 'ONLINE' 
        ? `${this.forecastCount} Active` 
        : '0 Active';
    }

    const copilotStatusEl = document.getElementById('copilot-engine-status');
    if (copilotStatusEl) {
      copilotStatusEl.innerText = this.copilotStatus;
      copilotStatusEl.className = this.copilotStatus === 'ONLINE' 
        ? 'text-secondary font-bold text-[9px]' 
        : 'text-error font-bold text-[9px]';
    }

    this.updateSeaIceUI(this.status === 'ONLINE' && this.seaIceForecast ? 'ONLINE' : 'OFFLINE');
  }

  async fetchSeaIceForecast() {
    const env = this.engine.state.environment;
    const ship = this.engine.ship;
    
    if (this.status !== 'ONLINE') {
      this.seaIceForecast = null;
      this.updateSeaIceUI('OFFLINE');
      return;
    }

    const payload = {
      x: Math.round(ship.x),
      y: Math.round(ship.y),
      current_ice: env.seaIce.enabled ? env.seaIce.averageConcentration : 0.0,
      temperature: env.seaIce.enabled ? -12.0 : 5.0,
      wind_speed: env.wind.enabled ? env.wind.speed : 0.0,
      wind_dir: env.wind.enabled ? env.wind.direction : 0.0
    };

    try {
      const data = await this.fetchWithFallback(`${this.baseUrl}/predict/sea-ice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }, null);
      if (data) {
        this.seaIceForecast = data;
        this.updateSeaIceUI('ONLINE');
        return;
      }
    } catch (e) {
      // Fallback
    }

    this.seaIceForecast = null;
    this.updateSeaIceUI('OFFLINE');
  }

  updateSeaIceUI(status) {
    const statusEl = document.getElementById('seaice-ml-status');
    const nowEl = document.getElementById('seaice-val-now');
    const h6El = document.getElementById('seaice-val-6h');
    const h12El = document.getElementById('seaice-val-12h');
    const h24El = document.getElementById('seaice-val-24h');
    const confEl = document.getElementById('seaice-ml-conf');

    if (statusEl) {
      statusEl.innerText = status;
      statusEl.className = status === 'ONLINE' ? 'text-secondary font-bold text-[9px]' : 'text-error font-bold text-[9px]';
    }

    const env = this.engine.state.environment;
    const nowIce = env.seaIce.enabled ? env.seaIce.averageConcentration : 0.0;

    if (status === 'ONLINE' && this.seaIceForecast) {
      if (nowEl) nowEl.innerText = `${(this.seaIceForecast.current_ice * 100).toFixed(0)}%`;
      if (h6El) h6El.innerText = `${(this.seaIceForecast.ice_6h * 100).toFixed(0)}%`;
      if (h12El) h12El.innerText = `${(this.seaIceForecast.ice_12h * 100).toFixed(0)}%`;
      if (h24El) h24El.innerText = `${(this.seaIceForecast.ice_24h * 100).toFixed(0)}%`;
      if (confEl) confEl.innerText = `${(this.seaIceForecast.confidence * 100).toFixed(0)}%`;
    } else {
      if (nowEl) nowEl.innerText = `${(nowIce * 100).toFixed(0)}%`;
      if (h6El) h6El.innerText = `${(nowIce * 100).toFixed(0)}%`;
      if (h12El) h12El.innerText = `${(nowIce * 100).toFixed(0)}%`;
      if (h24El) h24El.innerText = `${(nowIce * 100).toFixed(0)}%`;
      if (confEl) confEl.innerText = 'N/A';
    }
  }

  async requestCopilotExplanation(questionType = 'general') {
    const ship = this.engine.ship;
    const state = this.engine.state;
    const autoCtrl = this.engine.autonomousController;
    const env = state.environment;
    
    const payload = {
      ship: {
        speed: Math.round(ship.speedKnots),
        heading: Math.round(ship.heading),
        fuel: Math.round(ship.fuel)
      },
      decision: {
        mode: autoCtrl ? autoCtrl.currentCommand.mode : state.navigation.mode,
        targetHeading: autoCtrl ? autoCtrl.currentCommand.targetHeading : 0,
        targetSpeed: autoCtrl ? autoCtrl.currentCommand.targetSpeed : 0,
        confidence: autoCtrl ? autoCtrl.currentCommand.confidence : 1.0,
        reason: autoCtrl ? autoCtrl.currentCommand.reason : state.navigation.statusMessage
      },
      ml: {
        status: this.status,
        confidence: this.confidence,
        forecastCount: this.forecastCount
      },
      environment: {
        wind: env.wind.enabled ? `${env.wind.speed} km/h from ${env.wind.direction}°` : 'Disabled',
        current: `${env.ocean.currentSpeed} SU/h from ${env.ocean.currentDirection}°`,
        seaIce: env.seaIce.enabled ? `${(env.seaIce.averageConcentration * 100).toFixed(0)}%` : 'Disabled'
      },
      hazards: (ship.hazards || []).map(h => ({
        id: h.id,
        name: h.name,
        level: h.level,
        distance: Math.round(h.distance),
        closingSpeed: Math.round(h.closingSpeed)
      })),
      routeComparisons: this.engine.aiNavigator.routeComparisons ? {
        fastest: {
          eta: this.engine.aiNavigator.routeComparisons.shortest.eta,
          fuel: this.engine.aiNavigator.routeComparisons.shortest.fuel,
          icebergRisk: this.engine.aiNavigator.routeComparisons.shortest.icebergRisk,
          seaIceRisk: this.engine.aiNavigator.routeComparisons.shortest.seaIceRisk
        },
        balanced: {
          eta: this.engine.aiNavigator.routeComparisons.balanced.eta,
          fuel: this.engine.aiNavigator.routeComparisons.balanced.fuel,
          icebergRisk: this.engine.aiNavigator.routeComparisons.balanced.icebergRisk,
          seaIceRisk: this.engine.aiNavigator.routeComparisons.balanced.seaIceRisk
        },
        safest: {
          eta: this.engine.aiNavigator.routeComparisons.safest.eta,
          fuel: this.engine.aiNavigator.routeComparisons.safest.fuel,
          icebergRisk: this.engine.aiNavigator.routeComparisons.safest.icebergRisk,
          seaIceRisk: this.engine.aiNavigator.routeComparisons.safest.seaIceRisk
        }
      } : null,
      missionPlan: this.engine.missionPlan ? {
        strategy: this.engine.missionPlan.recommendedStrategy,
        etaHours: this.engine.missionPlan.recommended.etaHours,
        fuelPercent: this.engine.missionPlan.recommended.fuelPercent,
        maxRisk: this.engine.missionPlan.recommended.maxRisk,
        safetyMargin: this.engine.missionPlan.recommended.safetyMargin,
        confidence: this.engine.missionPlan.confidence,
        feasible: this.engine.missionPlan.feasible,
        tradeoffs: this.engine.missionPlan.tradeoffs
      } : null,
      explainability: this.engine.explainabilityEngine ? {
        topReasons: this.engine.explainabilityEngine.getTopReasons().map(r => r.title + ": " + r.desc),
        tradeoffs: this.engine.explainabilityEngine.getTradeoffs(),
        counterfactuals: this.engine.explainabilityEngine.getCounterfactuals()
      } : null
    };

    const explanationEl = document.getElementById('copilot-explanation');
    if (explanationEl) {
      explanationEl.innerText = "Querying ASTRALIS AI Copilot analysis...";
    }

    try {
      const data = await this.fetchWithFallback(`${this.baseUrl}/copilot/explain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, questionType })
      }, null);

      if (data) {
        this.updateCopilotUI(data.status, data.explanation, data.riskLevel);
        return;
      }
    } catch (e) {
      // Fallback
    }

    // Deterministic offline fallback
    const mode = payload.decision.mode;
    const reason = payload.decision.reason;
    const fallbackText = `Vessel operating in ${mode} mode because: ${reason}`;
    const riskLevel = mode === 'EMERGENCY_STOP' ? 'CRITICAL' : (mode === 'REROUTE' ? 'HIGH' : (['REDUCE_SPEED', 'ALTER_COURSE'].includes(mode) ? 'MEDIUM' : 'LOW'));
    this.updateCopilotUI('OFFLINE', fallbackText, riskLevel);
  }

  updateCopilotUI(status, explanation, riskLevel) {
    const statusEl = document.getElementById('copilot-engine-status');
    const explanationEl = document.getElementById('copilot-explanation');
    const riskEl = document.getElementById('copilot-risk-level');

    if (statusEl) {
      statusEl.innerText = status;
      statusEl.className = status === 'ONLINE' ? 'text-secondary font-bold text-[9px]' : 'text-error font-bold text-[9px]';
    }
    if (explanationEl) {
      explanationEl.innerText = explanation;
    }
    if (riskEl) {
      riskEl.innerText = riskLevel;
      if (riskLevel === 'CRITICAL' || riskLevel === 'HIGH') {
        riskEl.className = 'text-error font-bold';
      } else if (riskLevel === 'MEDIUM') {
        riskEl.className = 'text-amber-400 font-bold';
      } else {
        riskEl.className = 'text-secondary font-bold';
      }
    }
  }
}
