/**
 * POLARIS CANONICAL MISSION STATE STORE
 *
 * Single, unified operational source of truth across:
 * - Mission status & human approval
 * - Vessel state & motion
 * - Active route & multi-route candidates
 * - Environment (Wind, Current, Sea Ice)
 * - Hazards (USNIC Icebergs, SAR contacts, Threats)
 * - Risk & Reliability metrics
 * - Fuel & Propulsion telemetry
 * - Alerts & Emergency states
 * - Data mode & Provenance
 */

export class CanonicalMissionStore {
  constructor(engine) {
    this.engine = engine;
    this.listeners = [];

    // Approval state
    this.approvalState = {
      approvedRouteId: null,
      approvedMode: 'BALANCED',
      approvalRequired: true,
      lastAction: 'AUTO_ADOPTED',
      lastActionTimestamp: Date.now(),
      operatorReason: null
    };

    // Mission history
    this.history = [];
    this.alerts = [];
  }

  getSnapshot() {
    const engine = this.engine;
    if (!engine) return null;

    const state = engine.state || {};
    const ship = engine.ship || {};
    const aiNav = engine.aiNavigator || {};
    const riskEngine = engine.riskIntelligenceEngine || {};
    const dataProvider = engine.activeDataProvider || {};

    const activeRoute = state.navigation?.activeRoute || null;
    const candidates = aiNav.routeComparisons || null;
    const rec = aiNav.aiRecommendation || null;

    return {
      timestamp: Date.now(),
      simTimeHours: state.simulation?.simTimeHours || 0,
      dataMode: engine.dataMode || 'DEMO',

      // Mission & Approval
      missionStatus: state.navigation?.statusMessage || 'READY',
      approval: { ...this.approvalState },
      destination: state.navigation?.destinationPoint || state.navigation?.destination || null,

      // Vessel
      vessel: {
        x: ship.x || 0,
        y: ship.y || 0,
        heading: ship.heading || 0,
        speedKnots: ship.speedKnots || 0,
        throttle: ship.throttle || 0,
        rudder: ship.rudder || 0,
        fuel: ship.fuel !== undefined ? ship.fuel : 100,
        autopilot: state.vessel?.autopilot ?? true
      },

      // Navigation & Routes
      navigation: {
        mode: state.navigation?.mode || 'BALANCED',
        activeRoute,
        candidates,
        recommendation: rec,
        xte: ship.crossTrackError || 0,
        waypointIndex: ship.waypointIndex || 0,
        totalWaypoints: ship.routeWaypoints ? ship.routeWaypoints.length : 0
      },

      // Environment
      environment: {
        wind: state.environment?.wind || {},
        ocean: state.environment?.ocean || {},
        seaIce: state.environment?.seaIce || {},
        forecastTrend: aiNav.seaIceForecast || null
      },

      // Hazards
      hazards: {
        icebergs: engine.icebergs || [],
        sarContacts: engine.sarContacts || (dataProvider.sarProvider ? dataProvider.sarProvider.getContacts() : []),
        activeThreats: ship.hazards || []
      },

      // Risk & Confidence
      risk: {
        level: aiNav.riskLevel || 'LOW',
        score: aiNav.riskScore || 0,
        routeExposure: riskEngine.routeExposure || {},
        confidence: aiNav.routeConfidence || 92
      },

      // Alerts & History
      alerts: [...this.alerts],
      provenance: dataProvider.activeSnapshot?.provenance || {
        meteo: engine.dataMode === 'REAL' ? 'OPEN-METEO' : 'SIM',
        iceberg: engine.dataMode === 'REAL' ? 'USNIC' : 'SIM',
        seaIce: engine.dataMode === 'REAL' ? 'COPERNICUS (REPLAY)' : 'SIM',
        sar: engine.dataMode === 'REAL' ? 'SENTINEL-1 (FIXTURE)' : 'SIM'
      }
    };
  }

  approveRoute(mode) {
    const aiNav = this.engine.aiNavigator;
    const state = this.engine.state;

    this.approvalState = {
      approvedRouteId: state.navigation?.activeRoute?.routeId || `route_${Date.now()}`,
      approvedMode: mode,
      approvalRequired: true,
      lastAction: 'APPROVED',
      lastActionTimestamp: Date.now(),
      operatorReason: `Operator approved ${mode} route strategy`
    };

    if (state && state.navigation) {
      state.navigation.mode = mode;
      state.navigation.routeInvalid = true;
    }
    this.engine.calculateRoute();
    this.logHistory('ROUTE_APPROVED', { mode, routeId: this.approvalState.approvedRouteId });
    this.notify();
  }

  rejectRoute(reason) {
    this.approvalState.lastAction = 'REJECTED';
    this.approvalState.lastActionTimestamp = Date.now();
    this.approvalState.operatorReason = reason || 'Operator rejected AI recommendation';

    this.logHistory('ROUTE_REJECTED', { reason });
    this.notify();
  }

  addAlert(type, severity, message, threshold = null, currentValue = null) {
    const alert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
      type,
      severity, // 'CRITICAL' | 'WARNING' | 'INFO'
      message,
      threshold,
      currentValue,
      timestamp: Date.now(),
      acknowledged: false
    };

    this.alerts.unshift(alert);
    if (this.alerts.length > 50) this.alerts.pop();
    this.notify();
    return alert;
  }

  acknowledgeAlert(alertId) {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
      this.notify();
    }
  }

  logHistory(eventType, details) {
    const entry = {
      timestamp: Date.now(),
      simTimeHours: this.engine.state?.simulation?.simTimeHours || 0,
      eventType,
      details
    };
    this.history.unshift(entry);
    if (this.history.length > 200) this.history.pop();
  }

  subscribe(listener) {
    this.listeners.push(listener);
  }

  notify() {
    const snapshot = this.getSnapshot();
    for (const fn of this.listeners) {
      try { fn(snapshot); } catch (e) { console.error('Error in CanonicalMissionStore listener:', e); }
    }
  }
}
