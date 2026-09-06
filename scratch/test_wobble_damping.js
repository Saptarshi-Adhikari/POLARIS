import { Ship } from '../src/js/simulation/ship.js';

function normalizeSignedDegrees(deg) {
  let a = (deg + 180) % 360;
  if (a < 0) a += 360;
  return a - 180;
}

function testWithAllFixes() {
  const ship = new Ship({ x: 400, y: 1800, heading: 45 });
  const waypoints = [{ x: 400, y: 1800 }, { x: 1500, y: 1800 }, { x: 3000, y: 1800 }];
  ship.setRouteWaypoints(waypoints);

  const state = {
    vessel: { maxSpeed: 10, autopilot: true, throttle: 65, rudder: 0 },
    navigation: { activeRoute: { id: 'r1', waypoints }, startPoint: { x: 400, y: 1800 } },
    environment: { wind: { enabled: false }, seaIce: { enabled: false } }
  };

  const dt = 0.05; // 20Hz

  // Override updateAutopilotSteering to apply fixed angle wrapping & damping
  const origUpdate = ship.updateAutopilotSteering;
  ship.updateAutopilotSteering = function(dtParam, stateParam, icebergsParam, maxSpeedParam, vectorFieldParam, simTimeHoursParam) {
    // Intercept to apply correct normalizeSignedDegrees
    const result = origUpdate.call(this, dtParam, stateParam, icebergsParam, maxSpeedParam, vectorFieldParam, simTimeHoursParam);
    
    // Fix angle wrap on desiredHeadingFiltered and targetHeading
    let targetAngleDeg = (this.desiredHeadingRaw + this.steeringCorrection + 360) % 360;
    
    let dFilter = normalizeSignedDegrees(targetAngleDeg - (this.desiredHeadingFiltered ?? targetAngleDeg));
    const filterAlpha = Math.min(1.0, 8.0 * dtParam);
    this.desiredHeadingFiltered = (this.desiredHeadingFiltered + dFilter * filterAlpha + 360) % 360;

    let dTarget = normalizeSignedDegrees(this.desiredHeadingFiltered - (this.targetHeading ?? targetAngleDeg));
    const maxTargetRate = 15.0;
    const maxTargetStep = maxTargetRate * dtParam;
    dTarget = Math.max(-maxTargetStep, Math.min(maxTargetStep, dTarget));
    this.targetHeading = (this.targetHeading + dTarget + 360) % 360;

    if (stateParam.vessel) stateParam.vessel.targetHeading = this.targetHeading;

    let angleDiff = normalizeSignedDegrees(this.targetHeading - this.heading);
    if (Math.abs(angleDiff) < 0.5 && Math.abs(this.crossTrackError || 0) < 2.0) {
      angleDiff = 0.0;
    }
    this.headingError = angleDiff;

    const steeringGain = 1.2;
    const dampingGain = 1.8;
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

  console.log("Time | Heading | TargetHdg | AngVelocity | Rudder | XTE");
  console.log("-----------------------------------------------------");
  let maxHdgErrAfter10s = 0;
  let maxRudderAfter10s = 0;

  for (let t = 0; t <= 30; t += dt) {
    ship.update(dt, { getVelocityAt: () => ({ u: 0, v: 0 }) }, t / 3600, state, []);
    const hdgErr = Math.abs(ship.headingError || 0);
    const rud = Math.abs(ship.rudder || 0);
    if (t > 10) {
      if (hdgErr > maxHdgErrAfter10s) maxHdgErrAfter10s = hdgErr;
      if (rud > maxRudderAfter10s) maxRudderAfter10s = rud;
    }
    if (Math.abs(t % 2.0) < 0.02) {
      console.log(`${t.toFixed(1)}s | ${ship.heading.toFixed(1)}° | ${ship.targetHeading.toFixed(1)}° | ${ship.angularVelocity.toFixed(2)}°/s | ${ship.rudder.toFixed(1)}° | ${ship.crossTrackError?.toFixed(1)}`);
    }
  }

  console.log("\nSummary after initial 10s settling:");
  console.log(`Max Heading Error: ${maxHdgErrAfter10s.toFixed(2)}°`);
  console.log(`Max Rudder: ${maxRudderAfter10s.toFixed(2)}°`);
}

testWithAllFixes();
