/**
 * POLARIS DIGITAL TWIN — High-Resolution Replanning Telemetry Engine
 *
 * Instruments the complete end-to-end decision pipeline with cross-context
 * normalized timestamps (performance.timeOrigin + performance.now()) and
 * browser Performance Marks/Measures to audit REAL BROWSER latencies:
 *  1. COMPUTATION LATENCY (Planner calculation t6 -> t13)
 *  2. DECISION LATENCY (Trigger to route commitment t5 -> t14)
 *  3. BEHAVIOR LATENCY (Trigger to vessel helm/rudder response t5 -> t17)
 */

export class ReplanningTelemetry {
  constructor() {
    this.events = [];
    this.activeTrace = null;
    this.maxHistory = 1000;
    this.timeOrigin = (typeof performance !== 'undefined' && performance.timeOrigin) ? performance.timeOrigin : Date.now();
  }

  /**
   * Helper to compute normalized cross-context timestamp in absolute ms.
   */
  getNormalizedTimestamp(localNow = null, origin = null) {
    const now = localNow !== null ? localNow : (typeof performance !== 'undefined' ? performance.now() : 0);
    const baseOrigin = origin !== null ? origin : this.timeOrigin;
    return baseOrigin + now;
  }

  /**
   * Start a new replanning event trace with world & prediction versioning.
   */
  startTrace(metadata = {}) {
    const context = metadata.context || 'MAIN';
    const localNow = metadata.t0 !== undefined ? metadata.t0 : (typeof performance !== 'undefined' ? performance.now() : 0);
    const normT0 = this.getNormalizedTimestamp(localNow, metadata.timeOrigin);

    const trace = {
      traceId: `tr_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      triggerId: metadata.triggerId || 'MANUAL',
      context,
      timeOrigin: metadata.timeOrigin || this.timeOrigin,
      worldVersion: metadata.worldVersion || 1,
      hazardVersion: metadata.hazardVersion || 1,
      predictionVersion: metadata.predictionVersion || 1,
      gridVersion: metadata.gridVersion || 1,
      routeVersion: metadata.routeVersion || 1,
      timestamps: {},
      normalizedTimestamps: { t0: normT0 },
      latencies: {},
      sideEvaluations: null,
      selectedSide: null,
      status: 'IN_PROGRESS'
    };

    trace.timestamps.t0 = localNow;

    if (typeof performance !== 'undefined' && typeof performance.mark === 'function') {
      try { performance.mark('POLARIS_REPLAN_START'); } catch (e) { /* ignore */ }
    }

    this.activeTrace = trace;
    return trace;
  }

  /**
   * Record a timestamp milestone t0..t17 for the active trace.
   */
  mark(milestone, timeMs = null, context = 'MAIN', origin = null) {
    if (!this.activeTrace) return;
    const now = timeMs !== null ? timeMs : (typeof performance !== 'undefined' ? performance.now() : 0);
    this.activeTrace.timestamps[milestone] = now;
    this.activeTrace.normalizedTimestamps[milestone] = this.getNormalizedTimestamp(now, origin);

    if (typeof performance !== 'undefined' && typeof performance.mark === 'function') {
      try {
        if (milestone === 't9') performance.mark('POLARIS_FIRST_SAFE');
        if (milestone === 't14') performance.mark('POLARIS_ROUTE_COMMIT');
        if (milestone === 't16') performance.mark('POLARIS_GUIDANCE_RESPONSE');
        if (milestone === 't17') {
          performance.mark('POLARIS_REPLAN_END');
          performance.measure('POLARIS_TOTAL_REPLAN_DECISION', 'POLARIS_REPLAN_START', 'POLARIS_REPLAN_END');
        }
      } catch (e) { /* ignore */ }
    }
  }

  /**
   * Complete active trace and compute component latencies.
   */
  finalizeTrace(metadata = {}) {
    if (!this.activeTrace) return null;
    const trace = this.activeTrace;
    const norm = trace.normalizedTimestamps;
    const nowNorm = this.getNormalizedTimestamp();

    if (!norm.t17) norm.t17 = nowNorm;

    const getNorm = (key, fallbackKey) => (norm[key] !== undefined ? norm[key] : (norm[fallbackKey] !== undefined ? norm[fallbackKey] : nowNorm));

    const t0  = getNorm('t0', 't5');
    const t1  = getNorm('t1', 't0');
    const t5  = getNorm('t5', 't1');
    const t6  = getNorm('t6', 't5');
    const t7  = getNorm('t7', 't6');
    const t8  = getNorm('t8', 't7');
    const t9  = getNorm('t9', 't8');
    const t10 = getNorm('t10', 't9');
    const t11 = getNorm('t11', 't10');
    const t12 = getNorm('t12', 't11');
    const t13 = getNorm('t13', 't12');
    const t14 = getNorm('t14', 't13');
    const t15 = getNorm('t15', 't14');
    const t16 = getNorm('t16', 't15');
    const t17 = getNorm('t17', 't16');

    // THREE DISTINCT LATENCY CLASSES (in ms)
    const computationLatency = parseFloat((t13 - t6).toFixed(3)); // Planner calculation (t6 -> t13)
    const decisionLatency    = parseFloat((t14 - t5).toFixed(3)); // Replan trigger to route commit (t5 -> t14)
    const behaviorLatency    = parseFloat((t17 - t5).toFixed(3)); // Replan trigger to vessel helm response (t5 -> t17)

    trace.latencies = {
      predictionLatency: parseFloat((t1 - t0).toFixed(3)),
      triggerLatency: parseFloat((t5 - t1).toFixed(3)),
      gridLatency: parseFloat((t7 - t6).toFixed(3)),
      searchLatency: parseFloat((t9 - t8).toFixed(3)),
      firstSafeLatency: parseFloat((t9 - t6).toFixed(3)),
      losLatency: parseFloat((t10 - t9).toFixed(3)),
      smoothingLatency: parseFloat((t11 - t10).toFixed(3)),
      validationLatency: parseFloat((t12 - t11).toFixed(3)),
      scoringLatency: parseFloat((t13 - t12).toFixed(3)),
      commitLatency: parseFloat((t14 - t13).toFixed(3)),
      renderLatency: parseFloat((t15 - t14).toFixed(3)),
      guidanceLatency: parseFloat((t16 - t15).toFixed(3)),
      helmResponseLatency: parseFloat((t17 - t16).toFixed(3)),
      
      // 3 Main Latency Categories
      computationLatency,
      decisionLatency,
      behaviorLatency,
      totalDecisionLatency: parseFloat((t17 - t0).toFixed(3))
    };

    trace.selectedSide = metadata.selectedSide || trace.selectedSide || 'NONE';
    trace.sideEvaluations = metadata.sideEvaluations || trace.sideEvaluations || null;
    trace.status = 'COMPLETED';

    this.events.push(trace);
    if (this.events.length > this.maxHistory) this.events.shift();

    this.activeTrace = null;
    return trace;
  }

  /**
   * Calculate percentile distribution (P50, P90, P95, P99, Max, Mean) for a latency key.
   */
  calculatePercentiles(latencyKey) {
    const values = this.events
      .map(e => e.latencies[latencyKey])
      .filter(v => typeof v === 'number' && Number.isFinite(v))
      .sort((a, b) => a - b);

    if (values.length === 0) {
      return { count: 0, p50: 0, p90: 0, p95: 0, p99: 0, max: 0, mean: 0 };
    }

    const getPerc = (p) => {
      const idx = Math.min(values.length - 1, Math.floor((p / 100.0) * values.length));
      return values[idx];
    };

    const sum = values.reduce((a, b) => a + b, 0);

    return {
      count: values.length,
      p50: parseFloat(getPerc(50).toFixed(3)),
      p90: parseFloat(getPerc(90).toFixed(3)),
      p95: parseFloat(getPerc(95).toFixed(3)),
      p99: parseFloat(getPerc(99).toFixed(3)),
      max: parseFloat(values[values.length - 1].toFixed(3)),
      mean: parseFloat((sum / values.length).toFixed(3))
    };
  }

  /**
   * Get full benchmark audit statistics for all 3 latency classes + sub-stages.
   */
  getBenchmarkAuditReport() {
    return {
      totalEvents: this.events.length,
      computation: this.calculatePercentiles('computationLatency'),
      decision: this.calculatePercentiles('decisionLatency'),
      behavior: this.calculatePercentiles('behaviorLatency'),
      search: this.calculatePercentiles('searchLatency'),
      firstSafe: this.calculatePercentiles('firstSafeLatency'),
      validation: this.calculatePercentiles('validationLatency'),
      commit: this.calculatePercentiles('commitLatency'),
      total: this.calculatePercentiles('totalDecisionLatency')
    };
  }

  /**
   * Get bottleneck summary report (alias/adapter for getBenchmarkAuditReport).
   */
  getBottleneckSummary() {
    const report = this.getBenchmarkAuditReport();
    return {
      totalEvents: report.totalEvents,
      averages: {
        computationLatency: report.computation.mean,
        decisionLatency: report.decision.mean,
        behaviorLatency: report.behavior.mean,
        searchLatency: report.search.mean,
        firstSafeLatency: report.firstSafe.mean,
        validationLatency: report.validation.mean
      }
    };
  }
}

export const replanningTelemetry = new ReplanningTelemetry();
