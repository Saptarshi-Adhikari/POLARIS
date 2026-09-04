/**
 * ASTRALIS Nav-OS — Navigation Watchdog & Anomaly Detection System
 *
 * Continuously evaluates live navigation telemetry at ~4 Hz rate limit,
 * detects 12 explicit anomaly rules with sliding window hysteresis,
 * maintains a bounded diagnostic history, and triggers optional safeguards or auto-audits.
 */

export class NavigationWatchdog {
  constructor(options = {}) {
    this.mode = options.mode || 'analyze'; // 'off', 'analyze', 'safeguard'
    this.sampleIntervalMs = options.sampleIntervalMs || 250; // 4 Hz
    this.maxSamples = options.maxSamples || 720; // 3 minutes at 4 Hz
    this.maxEvents = options.maxEvents || 250;

    this.samples = [];
    this.events = [];

    this.lastSampleTime = 0;
    this.activeAnomalies = new Map();

    // Sliding window tracking buffers
    this.staleRouteCounter = 0;
    this.targetNotForwardCounter = 0;
    this.rudderSignMismatchTime = 0;
    this.yawDirectionMismatchTime = 0;
    this.awayFromTargetTime = 0;
    this.crossTrackDivergenceTime = 0;

    this.distWindow = []; // [{ simTimeMs, dist }]
    this.replansWindow = []; // [timestamp_ms]

    this.status = 'OK'; // 'OK', 'WARNING', 'CRITICAL'
    this.routeStability = 'STABLE'; // 'STABLE', 'CHURN_DETECTED'
    this.targetStatus = 'FORWARD'; // 'FORWARD', 'INVALID'
    this.trackStatus = 'CONVERGING'; // 'CONVERGING', 'DIVERGING'
    this.rudderYawStatus = 'CONSISTENT'; // 'CONSISTENT', 'MISMATCH'
    this.lastEvent = 'NONE';
  }

  evaluate(snapshot, engine) {
    if (this.mode === 'off' || !snapshot) return;

    const now = performance.now();
    if (now - this.lastSampleTime < this.sampleIntervalMs) return;
    this.lastSampleTime = now;

    const checks = this.runAnomalyDetectors(snapshot, engine);
    snapshot.checks = checks;

    this.samples.push(snapshot);
    if (this.samples.length > this.maxSamples) {
      this.samples.shift();
    }

    if (this.mode === 'safeguard') {
      this.applySafeguardActions(checks, engine);
    }
  }

  runAnomalyDetectors(snapshot, engine) {
    const r = snapshot.route || {};
    const s = snapshot.ship || {};
    const g = snapshot.guidance || {};
    const h = snapshot.hazards || {};
    const st = snapshot.stability || {};
    const now = snapshot.timestamp_ms || Date.now();
    const simTimeMs = (snapshot.simulation_time || 0) * 3600 * 1000;

    const checks = {
      routeIdMatchesShipRouteId: true,
      pathSignatureMatchesShipPathSignature: true,
      targetOnActivePath: true,
      targetForward: true,
      headingRudderSignMatches: true,
      yawResponseMatchesRudder: true,
      groundVelocityTowardTarget: true,
      groundVelocityTowardDestination: true,
      destinationDistanceDecreasing: true,
      crossTrackImproving: true,
      spriteMatchesHeading: true,
      finiteState: true
    };

    // L. Numerical Integrity Check
    if (!Number.isFinite(s.position?.x) || !Number.isFinite(s.position?.y) ||
        !Number.isFinite(s.heading_deg) || !Number.isFinite(s.target_heading_deg)) {
      checks.finiteState = false;
      this.triggerEvent('INVALID_NAVIGATION_STATE', 'critical', 'Non-finite position or heading detected.');
    }

    // A. Stale Route Mismatch
    const shipRouteId = engine?.ship?._activeRouteId;
    if (r.id && shipRouteId && r.id !== shipRouteId) {
      this.staleRouteCounter++;
      if (this.staleRouteCounter >= 2) {
        checks.routeIdMatchesShipRouteId = false;
        this.triggerEvent('STALE_ROUTE_STATE', 'critical', `Route ID mismatch: state=${r.id}, ship=${shipRouteId}`);
      }
    } else {
      this.staleRouteCounter = 0;
    }

    // B. Target Not Forward
    if (r.selected_target_is_forward === false) {
      this.targetNotForwardCounter++;
      if (this.targetNotForwardCounter >= 1) {
        checks.targetForward = false;
        this.targetStatus = 'INVALID';
        this.triggerEvent('INVALID_FORWARD_TARGET', 'critical', 'Selected look-ahead target is behind vessel progress.');
      }
    } else {
      this.targetNotForwardCounter = 0;
      this.targetStatus = 'FORWARD';
    }

    // C. Heading/Rudder Sign Mismatch
    const headingErr = g.signed_heading_error_deg !== undefined
      ? g.signed_heading_error_deg
      : ((s.target_heading_deg - s.heading_deg + 180) % 360 + 360) % 360 - 180;

    const rudder = s.rudder_command !== undefined ? s.rudder_command : 0;
    if (Math.abs(headingErr) > 2.0) {
      const signMismatch = (headingErr > 0 && rudder < -1.0) || (headingErr < 0 && rudder > 1.0);
      if (signMismatch) {
        this.rudderSignMismatchTime += this.sampleIntervalMs;
        if (this.rudderSignMismatchTime >= 250) {
          checks.headingRudderSignMatches = false;
          this.rudderYawStatus = 'MISMATCH';
          this.triggerEvent('RUDDER_SIGN_MISMATCH', 'critical', `Heading error ${headingErr.toFixed(1)}° opposes rudder ${rudder.toFixed(1)}°`);
        }
      } else {
        this.rudderSignMismatchTime = 0;
      }
    } else {
      this.rudderSignMismatchTime = 0;
    }

    // D. Rudder/Yaw Mismatch
    if (Math.abs(rudder) > 5.0 && this.samples.length > 2) {
      const prevSample = this.samples[this.samples.length - 1];
      const prevHdg = prevSample.ship?.heading_deg || s.heading_deg;
      let dhdg = (s.heading_deg - prevHdg + 180) % 360 - 180;
      if (dhdg < -180) dhdg += 360;

      const yawMismatch = (rudder > 5.0 && dhdg < -0.1) || (rudder < -5.0 && dhdg > 0.1);
      if (yawMismatch) {
        this.yawDirectionMismatchTime += this.sampleIntervalMs;
        if (this.yawDirectionMismatchTime >= 1000) {
          checks.yawResponseMatchesRudder = false;
          this.rudderYawStatus = 'MISMATCH';
          this.triggerEvent('NOMOTO_YAW_DIRECTION_MISMATCH', 'critical', `Rudder ${rudder.toFixed(1)}° produced opposite yaw rate ${dhdg.toFixed(2)}°`);
        }
      } else {
        this.yawDirectionMismatchTime = 0;
      }
    } else {
      this.yawDirectionMismatchTime = 0;
      if (checks.headingRudderSignMatches) {
        this.rudderYawStatus = 'CONSISTENT';
      }
    }

    // E. Persistent Away-From-Target Ground Motion
    const target = r.selected_target || {};
    const pos = s.position || {};
    const gvel = s.ground_velocity || {};
    const dx = target.x - pos.x;
    const dy = target.y - pos.y;
    const distToTgt = Math.hypot(dx, dy);

    const isApproachOrCapture = g.mode === 'FINAL_APPROACH' || g.mode === 'DESTINATION_CAPTURE' || s.autopilot_status === 'FINAL_APPROACH' || s.autopilot_status === 'DESTINATION_CAPTURE';

    if (distToTgt > 1.0 && s.ground_speed > 1.0) {
      const ux = dx / distToTgt;
      const uy = dy / distToTgt;
      const dot = (gvel.x / s.ground_speed) * ux + (gvel.y / s.ground_speed) * uy;
      if (dot < -0.2 && g.mode !== 'EMERGENCY_STOP' && !g.is_current_limited && !isApproachOrCapture) {
        this.awayFromTargetTime += this.sampleIntervalMs;
        if (this.awayFromTargetTime >= 2000) {
          checks.groundVelocityTowardTarget = false;
          this.trackStatus = 'DIVERGING';
          this.triggerEvent('GROUND_TRACK_DIVERGENCE', 'high', `Vessel ground velocity points away from look-ahead target (dot=${dot.toFixed(2)})`);
        }
      } else {
        this.awayFromTargetTime = 0;
        this.trackStatus = 'CONVERGING';
      }
    } else {
      this.awayFromTargetTime = 0;
    }

    // F. Destination Distance Divergence (5-second sliding window)
    const distDest = s.distance_to_destination || 0;
    this.distWindow.push({ simTimeMs, dist: distDest });
    while (this.distWindow.length > 0 && simTimeMs - this.distWindow[0].simTimeMs > 5000) {
      this.distWindow.shift();
    }
    if (this.distWindow.length > 1) {
      const initialDistWindow = this.distWindow[0].dist;
      if (distDest > initialDistWindow + 15.0 && g.mode === 'NORMAL_TRACKING' && !g.is_current_limited && !isApproachOrCapture) {
        checks.destinationDistanceDecreasing = false;
        this.triggerEvent('DESTINATION_DIVERGENCE', 'high', `Destination distance increased by ${(distDest - initialDistWindow).toFixed(1)} SU over 5s`);
      }
    }

    // G. Cross-Track Divergence (3 seconds in NORMAL_TRACKING)
    const xte = Math.abs(g.cross_track_error || 0);
    if (this.samples.length > 1) {
      const prevXte = Math.abs(this.samples[this.samples.length - 1].guidance?.cross_track_error || 0);
      if (xte > prevXte + 0.1 && g.mode === 'NORMAL_TRACKING' && !isApproachOrCapture) {
        this.crossTrackDivergenceTime += this.sampleIntervalMs;
        if (this.crossTrackDivergenceTime >= 3000) {
          checks.crossTrackImproving = false;
          this.triggerEvent('CROSS_TRACK_DIVERGENCE', 'medium', `Cross-track error growing continuously (${xte.toFixed(1)} SU)`);
        }
      } else {
        this.crossTrackDivergenceTime = 0;
      }
    }

    // H. Route Churn Detection (sliding window: >3 in 30s or >5 in 60s)
    if (st.activeRouteWasReplacedThisSample) {
      this.replansWindow.push(now);
    }
    while (this.replansWindow.length > 0 && now - this.replansWindow[0] > 60000) {
      this.replansWindow.shift();
    }
    const replans30s = this.replansWindow.filter(t => now - t <= 30000).length;
    if (replans30s > 3 || this.replansWindow.length > 5) {
      this.routeStability = 'CHURN_DETECTED';
      this.triggerEvent('ROUTE_CHURN', 'high', `Excessive route replanning: ${replans30s} replans in 30s (${this.replansWindow.length} in 60s)`);
    } else {
      this.routeStability = 'STABLE';
    }

    // I. Route Progress Anomaly
    const frac = r.route_progress_fraction || 0;
    if (frac >= 0.95 && distDest > 100.0 && !isApproachOrCapture) {
      this.triggerEvent('ROUTE_PROGRESS_ANOMALY', 'medium', `Progress fraction ${frac.toFixed(2)} falsely near 100% while ${distDest.toFixed(0)} SU from destination`);
    }

    // J. Excessive Control Correction Anomaly
    if (Math.abs(g.bounded_xte_correction_deg || 0) > 20.0) {
      this.triggerEvent('XTE_CORRECTION_ANOMALY', 'high', `Bounded XTE correction ${g.bounded_xte_correction_deg.toFixed(1)}° exceeds limit`);
    }

    // K. Sprite Mismatch
    const spriteHdg = s.sprite_rotation_deg || s.heading_deg;
    if (Math.abs(((spriteHdg - s.heading_deg + 180) % 360) - 180) > 1.0) {
      checks.spriteMatchesHeading = false;
      this.triggerEvent('SPRITE_HEADING_MISMATCH', 'medium', `Sprite rotation ${spriteHdg.toFixed(1)}° differs from physics heading ${s.heading_deg.toFixed(1)}°`);
    }

    return checks;
  }

  triggerEvent(type, severity, message) {
    const now = Date.now();
    const eventKey = `${type}_${severity}`;
    const lastTrigger = this.activeAnomalies.get(eventKey) || 0;

    if (now - lastTrigger < 2000) return; // 2-second debouncing per anomaly type
    this.activeAnomalies.set(eventKey, now);

    if (severity === 'critical') this.status = 'CRITICAL';
    else if (severity === 'high' && this.status !== 'CRITICAL') this.status = 'WARNING';

    this.lastEvent = type;

    const event = {
      timestamp_ms: now,
      type,
      severity,
      message
    };

    this.events.push(event);
    if (this.events.length > this.maxEvents) {
      this.events.shift();
    }
  }

  applySafeguardActions(checks, engine) {
    if (this.mode !== 'safeguard' || !engine || !engine.ship) return;

    if (!checks.finiteState || !checks.routeIdMatchesShipRouteId || !checks.targetForward) {
      // Critical safeguard: modest throttle reduction, request single route refresh
      engine.ship.desiredThrottle = Math.min(engine.ship.desiredThrottle || 65, 30);
      if (engine.state?.navigation) {
        engine.state.navigation.routeInvalid = true;
      }
    } else if (!checks.groundVelocityTowardTarget || !checks.destinationDistanceDecreasing) {
      // High safeguard: lock out non-emergency candidate adoption for 5 seconds
      if (engine.aiNavigator) {
        engine.aiNavigator.lastRouteTime = performance.now();
      }
    }
  }
}
