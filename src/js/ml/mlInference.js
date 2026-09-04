/**
 * ASTRALIS Nav-OS — ML Inference Module (Phase 8 Hybrid Support)
 *
 * Calls the Python backend model (Hybrid Physics + Neural Network, or Random Forest fallback)
 * for iceberg drift prediction.
 *
 * Provides breakdown between physics component and ML residual correction for full interpretability.
 */

export class MLInference {
  constructor(options = {}) {
    this.backendUrl = options.backendUrl || 'http://localhost:8000';
    this.timeout = options.timeout || 2000;

    this.isModelLoaded = false;
    this.modelType = 'hybrid';
    this.backendOnline = false;
    this.mlEnabled = true;

    this.models = {
      hybrid: false,
      random_forest: false
    };

    this._statusChecked = false;
    this._lastHealthPoll = 0;
    this._healthInterval = 30000;

    this._cache = new Map();
    this._cacheTTL = 10000;
    this._mae = null;
  }

  async loadModel() {
    await this._pollHealth();
  }

  async _pollHealth() {
    const now = performance.now();
    if (now - this._lastHealthPoll < this._healthInterval && this._statusChecked) return;
    this._lastHealthPoll = now;
    this._statusChecked = true;

    try {
      const res = await this._fetchWithTimeout(`${this.backendUrl}/ml/health`);
      if (res.ok) {
        const data = await res.json();
        this.backendOnline = true;
        this.isModelLoaded = data.status === 'ready';
        this.modelType = data.model_type || 'hybrid';
        this._mae = data.mae_avg ?? null;

        if (this.modelType === 'hybrid') {
          this.models.hybrid = true;
        } else if (this.modelType === 'random_forest') {
          this.models.random_forest = true;
        }

        console.info(
          `[MLInference] Backend model ready (${this.modelType}) — ` +
          (this._mae !== null ? `MAE=${this._mae.toFixed(6)} SU/s` : 'not trained')
        );
      } else {
        this._setOffline();
      }
    } catch {
      this._setOffline();
    }
  }

  _setOffline() {
    if (this.backendOnline) {
      console.warn('[MLInference] Backend offline — falling back to Wagner 2017 physics model');
    }
    this.backendOnline = false;
    this.isModelLoaded = false;
  }

  async predictIcebergVelocity(iceberg, environment) {
    if (!this.mlEnabled || !this.isModelLoaded || !this.backendOnline) {
      return this.wagner2017Predict(iceberg, environment);
    }

    const cached = this._cache.get(iceberg.id || iceberg.x);
    if (cached && performance.now() - cached.ts < this._cacheTTL) {
      return cached.result;
    }

    try {
      const body = JSON.stringify({
        position_x: iceberg.position ? iceberg.position.x : iceberg.x,
        position_y: iceberg.position ? iceberg.position.y : iceberg.y,
        velocity_x: iceberg.velocity ? iceberg.velocity.x : (iceberg.vx || 0),
        velocity_y: iceberg.velocity ? iceberg.velocity.y : (iceberg.vy || 0),
        wind_x: environment.windX || 0,
        wind_y: environment.windY || 0,
        current_x: environment.currentX || 0,
        current_y: environment.currentY || 0,
        sea_ice_concentration: environment.seaIceConcentration || 0,
        water_temperature: environment.waterTemperature ?? -1.8,
        radius: iceberg.radius || iceberg.collisionRadius || 10,
        collision_radius: iceberg.collisionRadius || iceberg.radius || 10
      });

      const res = await this._fetchWithTimeout(
        `${this.backendUrl}/ml/predict`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }
      );

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const pred = await res.json();

      const result = {
        velocity_x: pred.velocity_x,
        velocity_y: pred.velocity_y,
        source: pred.source || 'hybrid_physics_ml',
        physics_component: pred.physics_component || null,
        ml_residual: pred.ml_residual || null
      };

      this._cache.set(iceberg.id || iceberg.x, { ts: performance.now(), result });
      return result;
    } catch (err) {
      console.debug(`[MLInference] Fallback: ${err.message}`);
      this._lastHealthPoll = 0;
      return this.wagner2017Predict(iceberg, environment);
    }
  }

  wagner2017Predict(iceberg, environment) {
    const curX = environment.currentX || 0;
    const curY = environment.currentY || 0;
    const wX = environment.windX || 0;
    const wY = environment.windY || 0;

    const physVx = curX * 0.1 + wX * 0.002;
    const physVy = curY * 0.1 + wY * 0.002;

    return {
      velocity_x: physVx,
      velocity_y: physVy,
      source: 'physics_wagner_2017',
      physics_component: { velocity_x: physVx, velocity_y: physVy },
      ml_residual: { velocity_x: 0, velocity_y: 0 }
    };
  }

  async getPredictionBreakdown(iceberg, environment) {
    const pred = await this.predictIcebergVelocity(iceberg, environment);
    const phys = this.wagner2017Predict(iceberg, environment);

    const physVx = pred.physics_component ? pred.physics_component.velocity_x : phys.velocity_x;
    const resVx = pred.ml_residual ? pred.ml_residual.velocity_x : (pred.velocity_x - physVx);

    const totalMagnitude = Math.abs(pred.velocity_x) + 1e-10;
    const physPct = Math.min(100, (Math.abs(physVx) / totalMagnitude) * 100);
    const mlPct = Math.min(100, (Math.abs(resVx) / totalMagnitude) * 100);

    return {
      final: pred,
      physics_only: phys,
      ml_contribution: {
        velocity_x: resVx,
        velocity_y: pred.ml_residual ? pred.ml_residual.velocity_y : (pred.velocity_y - phys.velocity_y)
      },
      physics_percentage: Math.round(physPct),
      ml_percentage: Math.round(mlPct)
    };
  }

  async comparePredictions(iceberg, environment) {
    const [ml, physics] = await Promise.all([
      this.predictIcebergVelocity(iceberg, environment),
      Promise.resolve(this.wagner2017Predict(iceberg, environment))
    ]);

    return {
      ml,
      physics,
      difference: {
        vx: ml.velocity_x - physics.velocity_x,
        vy: ml.velocity_y - physics.velocity_y
      }
    };
  }

  toggleML() {
    this.mlEnabled = !this.mlEnabled;
    console.info(`[MLInference] ML predictions ${this.mlEnabled ? 'ENABLED' : 'DISABLED'}`);
    return this.mlEnabled;
  }

  getStatus() {
    return {
      mlEnabled: this.mlEnabled,
      backendOnline: this.backendOnline,
      isModelLoaded: this.isModelLoaded,
      modelType: this.modelType,
      models: this.models,
      mae: this._mae,
      cacheSize: this._cache.size
    };
  }

  async _fetchWithTimeout(url, init = {}) {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), this.timeout);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(tid);
    }
  }
}

export const mlInference = new MLInference();
