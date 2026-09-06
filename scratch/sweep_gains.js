import { Ship } from '../src/js/simulation/ship.js';
import { normalizeAngleDeg } from '../src/js/utils.js';

function testGains(steeringGain, dampingGain) {
  const ship = new Ship({ x: 400, y: 1800, heading: 45 });
  const waypoints = [{ x: 400, y: 1800 }, { x: 2500, y: 1800 }];
  ship.setRouteWaypoints(waypoints);

  const state = {
    vessel: { maxSpeed: 10, autopilot: true, throttle: 65, rudder: 0 },
    navigation: { activeRoute: { id: 'r1', waypoints }, startPoint: { x: 400, y: 1800 } },
    environment: { wind: { enabled: false }, seaIce: { enabled: false } }
  };

  const dt = 0.05; // 20Hz

  // Override updateAutopilotSteering to use target gains
  const origUpdate = ship.updateAutopilotSteering;
  ship.updateAutopilotSteering = function(dtParam, stateParam, icebergsParam, maxSpeedParam, vectorFieldParam, simTimeHoursParam) {
    const result = origUpdate.call(this, dtParam, stateParam, icebergsParam, maxSpeedParam, vectorFieldParam, simTimeHoursParam);
    
    let angleDiff = normalizeAngleDeg(this.targetHeading - this.heading);
    if (Math.abs(angleDiff) < 0.5 && Math.abs(this.crossTrackError || 0) < 2.0) {
      angleDiff = 0.0;
    }
    this.headingError = angleDiff;

    let desiredRudder = Math.max(-35, Math.min(35, angleDiff * steeringGain - this.angularVelocity * dampingGain));
    if (Math.abs(desiredRudder) < 0.8 && Math.abs(this.rudder) < 1.0) {
      desiredRudder = 0.0;
    }

    if (!this._inEmergencyAvoidance) {
      const maxRudderStep = 15.0 * dtParam;
      const rudderDiff = desiredRudder - this.rudder;
      const boundedStep = Math.max(-maxRudderStep, Math.min(maxRudderStep, rudderDiff));
      this.rudder = Math.max(-35, Math.min(35, this.rudder + boundedStep));
    }
    if (stateParam.vessel) stateParam.vessel.rudder = this.rudder;

    return result;
  };

  let maxHdgErrAfter10s = 0;
  let maxRudderAfter10s = 0;
  let totalRudderFlips = 0;
  let lastRudderSign = 0;

  for (let t = 0; t <= 30; t += dt) {
    ship.update(dt, { getVelocityAt: () => ({ u: 0, v: 0 }) }, t / 3600, state, []);
    const hdgErr = Math.abs(ship.headingError || 0);
    const rud = Math.abs(ship.rudder || 0);
    if (t > 10) {
      if (hdgErr > maxHdgErrAfter10s) maxHdgErrAfter10s = hdgErr;
      if (rud > maxRudderAfter10s) maxRudderAfter10s = rud;
    }
    const currentSign = Math.sign(ship.rudder);
    if (currentSign !== 0 && lastRudderSign !== 0 && currentSign !== lastRudderSign) {
      totalRudderFlips++;
    }
    if (currentSign !== 0) lastRudderSign = currentSign;
  }

  // Cross current test
  const shipCC = new Ship({ x: 400, y: 1800, heading: 0 });
  shipCC.setRouteWaypoints(waypoints);
  shipCC.updateAutopilotSteering = ship.updateAutopilotSteering;

  const crossCurrentVectorField = {
    getVelocityAt: () => ({ u: 0, v: 4.0 }),
    getStormState: () => ({ stormActive: false, severity: 0 })
  };

  let maxXteCC = 0;
  let arrivedCC = false;
  for (let step = 0; step < 2500; step++) {
    shipCC.update(0.1, crossCurrentVectorField, step * 0.1 / 3600, state, []);
    if (Math.abs(shipCC.crossTrackError || 0) > maxXteCC) maxXteCC = Math.abs(shipCC.crossTrackError || 0);
    if (shipCC.autopilotStatus === 'ARRIVED') { arrivedCC = true; break; }
  }

  console.log(`steeringGain=${steeringGain.toFixed(1)}, dampingGain=${dampingGain.toFixed(1)} -> HdgErr: ${maxHdgErrAfter10s.toFixed(2)}°, Rudder: ${maxRudderAfter10s.toFixed(2)}°, Flips: ${totalRudderFlips} | CrossCurrent: Arrived=${arrivedCC}, MaxXTE=${maxXteCC.toFixed(1)}`);
}

console.log("=== GAIN SWEEP RESULTS ===");
testGains(1.2, 1.8);
testGains(1.2, 3.0);
testGains(1.2, 4.5);
testGains(1.2, 6.0);
testGains(0.9, 3.0);
testGains(0.9, 3.5);
testGains(0.9, 4.0);
testGains(0.9, 4.5);
testGains(1.0, 3.0);
testGains(1.0, 3.5);
testGains(1.0, 4.0);
