/**
 * POLARIS DIGITAL TWIN - Main Application Entry Point
 *
 * COORDINATE SYSTEM: All simulation entities (Ship, Icebergs, AINavigator, VectorField)
 * operate in WORLD coordinates (WORLD_W x WORLD_H = 3600 x 2400).
 * The CanvasRenderer applies a camera transform to map world coords to screen pixels.
 * DO NOT mix screen pixel coords with world coords.
 */

import { offlineManager } from './offlineManager.js';
import { perfMonitor } from './performanceMonitor.js';
import { VectorField } from './simulation/vectorField.js';
import { Iceberg } from './simulation/iceberg.js';
import { Ship } from './simulation/ship.js';
import { AINavigator } from './ai/aiNavigator.js';
import { CanvasRenderer, PlanningMode } from './render/canvasRenderer.js';
import { UIController } from './ui/uiController.js';
import { AIClient } from './ui/aiClient.js';
import { AutonomousController } from './ai/autonomousController.js';
import { ScenarioManager } from './simulation/scenarioManager.js';
import { ValidationEngine } from './simulation/validationEngine.js';
import { RiskIntelligenceEngine } from './ai/riskIntelligenceEngine.js';
import { MissionPlanner } from './ai/missionPlanner.js';
import { AntarcticDataManager } from './data/antarcticDataManager.js';
import { ExplainabilityEngine } from './ai/explainabilityEngine.js';
import { CounterfactualSimulator } from './ai/counterfactualSimulator.js';
import { ConfidenceIntelligenceEngine } from './ai/confidenceIntelligenceEngine.js';
import { DecisionIntelligenceEngine } from './ai/decisionIntelligenceEngine.js';
import { MetricsRegistry } from './ai/metricsRegistry.js';

// ── Phase 5: Sensor & Digital Twin Layer ──────────────────────────────────────
import { gnssSensor } from './sensors/gnssSensor.js';
import { gyrocompassSensor } from './sensors/gyrocompassSensor.js';
import { radarSensor } from './sensors/radarSensor.js';
import { sensorFusion } from './sensors/sensorFusion.js';

// ── Phase 6: Data Collection Pipeline ────────────────────────────────────────
import { dataRecorder } from './data/dataRecorder.js';
import { dataExporter } from './data/dataExporter.js';
import { syntheticDataGenerator } from './data/syntheticDataGenerator.js';

// ── Phase 7: ML Baseline ──────────────────────────────────────────────────────
import { mlInference } from './ml/mlInference.js';

// ── Phase 9: Advanced Autonomous Navigation (D* Lite) ───────────────────────
import { createHierarchicalPlanner } from './pathfinding/hierarchicalPlanner.js';

// ── Phase 10: Full Digital Twin with LLM Copilot ───────────────────────────
import { llmCopilot } from './ai/llmCopilot.js';
import { scenarioReplay } from './data/scenarioReplay.js';
import { createCopilotHUD } from './ui/copilotHUD.js';



import { NavigationFlightRecorder } from './debug/navigationFlightRecorder.js';
import { NavigationDebugOverlay } from './debug/navigationDebugOverlay.js';
import { NavigationWatchdog } from './debug/navigationWatchdog.js';
import { NavigationAuditReporter } from './debug/navigationAuditReporter.js';

// Canonical World Dimensions - ALL simulation entities MUST use these
const WORLD_W = 3600;
const WORLD_H = 2400;

class SimulationEngine {
  constructor() {
    const canvasEl = document.getElementById('map-canvas');

    // VectorField and AINavigator MUST be initialized with WORLD dimensions, not canvas.clientWidth
    this.vectorField = new VectorField(WORLD_W, WORLD_H);
    this.aiNavigator = new AINavigator(WORLD_W, WORLD_H);

    // Ship starts in world coordinates
    this.ship = new Ship({ x: 400, y: 1800, heading: 330 });

    this.icebergs = [];
    this.initDefaultIcebergs();

    this.scenarioManager = new ScenarioManager(this);
    this.validationEngine = new ValidationEngine(this);

    this.renderer = new CanvasRenderer(canvasEl);
    this.renderer.bindEntitiesGetter(
      () => this.icebergs,
      () => this.ship
    );

    this.renderer.onSelectIceberg = (iceberg) => {
      this.uiController && this.uiController.showIcebergInspector && this.uiController.showIcebergInspector(iceberg);
    };

    this.renderer.onPlaceNavPoint = (wx, wy, mode) => this.handleNavPointPlacement(wx, wy, mode);

    // Central Simulation State (Source of Truth)
    // ALL coordinates in this state are WORLD coordinates
    this.state = {
      simulation: {
        isPaused: false,
        timeWarp: 1,
        simTimeHours: 14.0
      },
      environment: {
        mode: 'SIMULATION',
        ocean: {
          currentSpeed: 1.8,
          currentDirection: 127,
          turbulence: 0.3
        },
        wind: {
          enabled: true,
          speed: 45.2,
          direction: 247
        },
        seaIce: {
          enabled: true,
          averageConcentration: 0.2,
          resistanceFactor: 1.0
        }
      },
      vessel: {
        throttle: 65,
        rudder: 0,
        // Normalized simulation units - NOT real SI units
        maxSpeed: 30.0,        // SU/sec (simulation units per second)
        dragCoefficient: 0.04, // normalized drag coefficient
        mass: 1.0,             // normalized mass (1.0 = balanced against thrust/drag)
        heading: 330,
        autopilot: true,
        enginePower: 1.0,
        autopilotThrottle: 65
      },
      navigation: {
        mode: 'BALANCED',
        routeInvalid: false,
        routeCalculated: false,
        isNavigating: true,
        planningMode: PlanningMode.NONE,
        startPoint: { x: 400, y: 1800 },
        destinationPoint: { x: WORLD_W - 400, y: 400 },
        destination: { x: WORLD_W - 400, y: 400 },
        statusMessage: 'Ready',
        activeRoute: {
          id: `route_${Date.now()}`,
          waypoints: [],
          rawPath: [],
          smoothPath: [],
          status: 'invalid',
          createdAt: performance.now(),
          expiresAt: performance.now() + 60000,
          totalDistance: 0,
          estimatedDuration: 0,
          maxRiskSegment: 0,
          destination: { x: WORLD_W - 400, y: 400 }
        }
      },
      icebergs: {
        count: 6,
        enabled: true,
        driftStrength: 1.0,
        collisionRadius: 1.0
      }
    };

    this.uiController = new UIController(this);
    this.aiClient = new AIClient(this);
    this.autonomousController = new AutonomousController(this);
    this.riskIntelligenceEngine = new RiskIntelligenceEngine(this);
    this.missionPlanner = new MissionPlanner(this);
    this.missionPlan = null;
    this.antarcticDataManager = new AntarcticDataManager(this);
    this.explainabilityEngine = new ExplainabilityEngine(this);
    this.counterfactualSimulator = new CounterfactualSimulator(this);
    this.confidenceIntelligenceEngine = new ConfidenceIntelligenceEngine(this);
    this.decisionIntelligenceEngine = new DecisionIntelligenceEngine(this);
    this.metricsRegistry = new MetricsRegistry(this);

    this.scenarioManager.saveDefaultStateCheckpoints();

    this.lastTimestamp = performance.now();

    // Debug HUD toggle
    window.addEventListener('keydown', (e) => {
      if (e.key === 'd' || e.key === 'D') {
        const hud = document.getElementById('debug-hud');
        if (hud) hud.classList.toggle('hidden');
      }
      // Sensor failure simulation shortcuts
      if (e.key === 'F1') { gnssSensor.simulateFailure(!gnssSensor.isFailed); e.preventDefault(); }
      if (e.key === 'F2') { gyrocompassSensor.simulateFailure(!gyrocompassSensor.isFailed); e.preventDefault(); }
      if (e.key === 'F3') { radarSensor.simulateFailure(!radarSensor.isFailed); e.preventDefault(); }

      // ── Phase 6: Data collection shortcuts ──────────────────────────────
      if (e.key === 'r' || e.key === 'R') {
        if (dataRecorder.isRecording) { dataRecorder.stopRecording(); }
        else { dataRecorder.startRecording(); }
      }
      if (e.key === 'e' && !e.shiftKey) { dataExporter.exportSession(dataRecorder, 'json'); }
      if (e.key === 'E' && e.shiftKey)  { dataExporter.exportSession(dataRecorder, 'csv'); }
      if (e.key === 'g' || e.key === 'G') {
        syntheticDataGenerator.exportSyntheticDataset(100, 24, 'synthetic_iceberg_data.json');
      }
      // Phase 7: Toggle ML predictions
      if (e.key === 'm' || e.key === 'M') {
        mlInference.toggleML();
      }

      // ── Phase 10: LLM Copilot & Scenario Replay Shortcuts ──────────────
      if (e.key === 'c' || e.key === 'C') {
        if (window.copilotHUD) window.copilotHUD.toggleVisibility();
      }
      if (e.key === 'R' && e.shiftKey) {
        if (scenarioReplay.isRecording) {
          scenarioReplay.stopRecording();
        } else {
          const name = `Scenario_${new Date().toISOString().slice(11, 19).replace(/:/g, '')}`;
          scenarioReplay.startRecording(name);
        }
      }
      if (e.key === 'P' && e.shiftKey) {
        const recordings = scenarioReplay.getRecordings();
        if (recordings.length > 0) {
          scenarioReplay.playRecording(recordings.length - 1, 1.0);
        }
      }
      if (e.key === 'E' && e.shiftKey) {
        const recordings = scenarioReplay.getRecordings();
        if (recordings.length > 0) {
          scenarioReplay.exportRecording(recordings.length - 1);
        }
      }
      if (e.key === 'F4') {
        llmCopilot.checkAvailability().then(avail => {
          const msg = avail ? 'LLM Copilot Online (Ollama)' : 'LLM Copilot Offline (Rule-based fallback active)';
          if (window.copilotHUD) {
            window.copilotHUD.addExplanation({
              text: msg,
              source: 'system',
              confidence: 1.0,
              context: { routeRisk: 'safe' }
            });
          }
        });
      }
    });

    // ── Phase 5: Initialize Sensor Fusion ────────────────────────────────────
    sensorFusion.initialize(gnssSensor, gyrocompassSensor, radarSensor);
    // Expose on window for debugging / UI hooks
    window.gnssSensor         = gnssSensor;
    window.gyrocompassSensor  = gyrocompassSensor;
    window.radarSensor        = radarSensor;
    window.sensorFusion       = sensorFusion;
    console.info('[Sensors] F1: Toggle GNSS | F2: Toggle Gyro | F3: Toggle Radar');

    // ── Phase 6: Expose data modules ─────────────────────────────────────────
    window.dataRecorder           = dataRecorder;
    window.dataExporter           = dataExporter;
    window.syntheticDataGenerator = syntheticDataGenerator;
    console.info('[Data] R: Record toggle | E: Export JSON | Shift+E: Export CSV | G: Generate synthetic dataset');

    // ── Phase 7: Initialize ML Inference (non-blocking async health probe) ───
    window.mlInference = mlInference;
    mlInference.loadModel().catch(() => {});  // Offline-safe: errors are swallowed internally

    // ── Phase 9: Advanced Autonomous Navigation (D* Lite) ───────────────────
    this.hierarchicalPlanner = createHierarchicalPlanner(WORLD_W, WORLD_H);
    window.hierarchicalPlanner = this.hierarchicalPlanner;
    console.info('[Pathfinding] Global A* + Local D* Lite Hierarchical Planner active');

    // ── Phase 10: Initialize Copilot & Scenario Replay ──────────────────────
    window.llmCopilot = llmCopilot;
    window.scenarioReplay = scenarioReplay;
    window.copilotHUD = createCopilotHUD();
    llmCopilot.checkAvailability().catch(() => {});
    // Flight Recorder, Debug Overlay, Watchdog & Audit Reporter
    this.flightRecorder = new NavigationFlightRecorder();
    this.flightRecorder.start(); // Enabled by default in analyze mode
    this.debugOverlay = new NavigationDebugOverlay(this.flightRecorder, this.renderer);
    this.navigationWatchdog = new NavigationWatchdog({ mode: 'analyze' });
    this.auditReporter = new NavigationAuditReporter(this.navigationWatchdog, this.flightRecorder);

    window.flightRecorder = this.flightRecorder;
    window.debugOverlay = this.debugOverlay;
    window.navigationWatchdog = this.navigationWatchdog;
    window.auditReporter = this.auditReporter;
    console.info('[Watchdog] Automatic Navigation Watchdog active in ANALYZE mode | F6: Overlay | F7: Record | F8: Export JSON | F10: Download Audit');

    this.renderer.startPoint = this.state.navigation.startPoint;
    this.renderer.destinationPoint = this.state.navigation.destinationPoint;
    this.calculateRoute();



    requestAnimationFrame((t) => this.loop(t));
  }

  initDefaultIcebergs() {
    // Generate 16 deterministic, nicely distributed icebergs using a seeded LCG generator
    let seed = 12345;
    function random() {
      let x = Math.sin(seed++) * 10000;
      return x - Math.floor(x);
    }

    this.icebergs = [];
    // Spawning coordinates check: Keep safe distance from start (400, 1800) and destination (3200, 400)
    const isSafe = (x, y) => {
      const distToStart = Math.hypot(x - 400, y - 1800);
      const distToDest  = Math.hypot(x - 3200, y - 400);
      return distToStart > 300 && distToDest > 300;
    };

    // Pre-defined set of grid positions to ensure good distribution, perturbed randomly
    const cols = 4;
    const rows = 4;
    const cellW = WORLD_W / cols;
    const cellH = WORLD_H / rows;

    let id = 1;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        // Perturb within grid cell
        const px = c * cellW + cellW * 0.2 + random() * cellW * 0.6;
        const py = r * cellH + cellH * 0.2 + random() * cellH * 0.6;
        if (isSafe(px, py)) {
          // Weighted random size categories:
          // Small (50%): collision radius 10-20 => size 300-600
          // Medium (30%): collision radius 20-40 => size 600-1200
          // Large (15%): collision radius 40-70 => size 1200-2100
          // Massive (5%): collision radius 70-110 => size 2100-3300
          const randSize = random();
          let size;
          if (randSize < 0.50) {
            size = 300 + Math.floor(random() * 300);
          } else if (randSize < 0.80) {
            size = 600 + Math.floor(random() * 600);
          } else if (randSize < 0.95) {
            size = 1200 + Math.floor(random() * 900);
          } else {
            size = 2100 + Math.floor(random() * 1200);
          }

          const mass = (size / 300) * (1.0 + random() * 2.0);
          this.icebergs.push(new Iceberg({
            id: id++,
            name: `IB-${String(id).padStart(2, '0')}`,
            x: px,
            y: py,
            mass,
            size,
            currentResponse: 0.7 + random() * 0.25,
            windResponse: 0.08 + random() * 0.15
          }));
        }
      }
    }
  }

  /** Validate world click — bounds + iceberg collision */
  validateWorldPoint(wx, wy) {
    const MARGIN = 50;
    if (wx < MARGIN || wx > WORLD_W - MARGIN || wy < MARGIN || wy > WORLD_H - MARGIN) {
      return { valid: false, reason: 'Point outside navigable area' };
    }
    for (let ice of this.icebergs) {
      const dist = Math.hypot(wx - ice.x, wy - ice.y);
      const collisionR = ice.collisionRadius;
      if (dist < collisionR) {
        return { valid: false, reason: 'Point inside iceberg hazard zone' };
      }
    }
    return { valid: true };
  }

  handleNavPointPlacement(wx, wy, mode) {
    const check = this.validateWorldPoint(wx, wy);
    if (!check.valid) {
      this.state.navigation.statusMessage = check.reason;
      this.uiController && this.uiController.updateNavStatus();
      return;
    }

    const pt = { x: Math.round(wx), y: Math.round(wy) };

    if (mode === PlanningMode.SET_START) {
      this.state.navigation.startPoint = pt;
      this.renderer.startPoint = pt;
      this.state.navigation.planningMode = PlanningMode.NONE;
      this.renderer.planningMode = PlanningMode.NONE;
      this.state.navigation.statusMessage = `Start set (${pt.x}, ${pt.y}) — now set destination`;
      this.state.navigation.routeCalculated = false;
      this.state.navigation.routeInvalid = true;
      if (this.state.navigation.destinationPoint) {
        this.calculateRoute();
      }
    } else if (mode === PlanningMode.SET_DESTINATION) {
      this.state.navigation.destinationPoint = pt;
      this.state.navigation.destination = pt;
      this.renderer.destinationPoint = pt;
      this.state.navigation.planningMode = PlanningMode.NONE;
      this.renderer.planningMode = PlanningMode.NONE;
      this.state.navigation.statusMessage = `Destination set (${pt.x}, ${pt.y}) — calculate route`;
      this.state.navigation.routeCalculated = false;
      this.state.navigation.routeInvalid = true;
      if (this.state.navigation.startPoint) {
        this.calculateRoute();
      }
    }
    this.uiController && this.uiController.updateNavStatus();
  }

  setPlanningMode(mode) {
    this.state.navigation.planningMode = mode;
    this.renderer.planningMode = mode;
    const labels = {
      [PlanningMode.SET_START]: 'Click map to set START point',
      [PlanningMode.SET_DESTINATION]: 'Click map to set DESTINATION point',
      [PlanningMode.NONE]: this.state.navigation.statusMessage
    };
    this.state.navigation.statusMessage = labels[mode] || labels[PlanningMode.NONE];
    this.uiController && this.uiController.updateNavStatus();
  }

  calculateRoute() {
    const nav = this.state.navigation;
    if (!nav.startPoint) {
      nav.statusMessage = 'Set a start point first';
      this.uiController && this.uiController.updateNavStatus();
      return false;
    }
    if (!nav.destinationPoint) {
      nav.statusMessage = 'Set a destination point first';
      this.uiController && this.uiController.updateNavStatus();
      return false;
    }

    const startShip = { x: nav.startPoint.x, y: nav.startPoint.y };
    this.aiNavigator.calculateRoute(
      startShip,
      nav.destinationPoint,
      this.icebergs,
      this.vectorField,
      nav.mode,
      this.state,
      this.ship
    );
    nav.routeCalculated = true;
    nav.routeInvalid = false;
    nav.statusMessage = `Route calculated (${this.ship.routeWaypoints.length} waypoints)`;
    this.uiController && this.uiController.updateNavStatus();
    return true;
  }

  clearRoute() {
    this.ship.routeWaypoints = [];
    this.ship.waypointIndex = 0;
    this.ship.targetWaypoint = null;
    this.aiNavigator.optimalRoute = [];
    this.state.navigation.routeCalculated = false;
    this.state.navigation.routeInvalid = true;
    this.state.navigation.isNavigating = false;
    this.state.navigation.statusMessage = 'Route cleared';
    this.uiController && this.uiController.updateNavStatus();
  }

  placeVesselAtStart() {
    const start = this.state.navigation.startPoint;
    if (!start) {
      this.state.navigation.statusMessage = 'Set a start point first';
      this.uiController && this.uiController.updateNavStatus();
      return;
    }
    this.ship.x = start.x;
    this.ship.y = start.y;
    this.ship.vx = 0;
    this.ship.vy = 0;
    this.ship.angularVelocity = 0;
    this.ship.waypointIndex = 0;
    this.ship.targetWaypoint = this.ship.routeWaypoints.length > 0 ? this.ship.routeWaypoints[0] : null;
    this.state.navigation.statusMessage = 'Vessel placed at start';
    this.uiController && this.uiController.updateNavStatus();
  }

  startNavigation() {
    if (!this.state.navigation.routeCalculated || this.ship.routeWaypoints.length === 0) {
      this.state.navigation.statusMessage = 'Calculate a route first';
      this.uiController && this.uiController.updateNavStatus();
      return;
    }
    this.placeVesselAtStart();
    this.state.vessel.autopilot = true;
    this.state.navigation.isNavigating = true;
    this.renderer.setFollowShip(true);
    this.state.navigation.statusMessage = 'Navigation active';
    this.uiController && this.uiController.updateNavStatus();
    this.uiController && this.uiController.updateSlidersFromState();
  }

  resetToDefaults() {
    this.vectorField.setParams({
      currentSpeed: 1.8,
      currentDirection: 127,
      tidalStrength: 0.8,
      tidalPeriod: 12.4,
      waveHeight: 1.2,
      windSpeed: 45.2,
      windDirection: 247,
      windGusts: false,
      stormMode: false
    });
    // Reset ship to WORLD start position
    this.ship.x = 400;
    this.ship.y = 1800;
    this.ship.heading = 330;
    this.ship.vx = 0;
    this.ship.vy = 0;
    this.ship.fuel = 78.4;
    this.ship.routeWaypoints = [];
    this.ship.waypointIndex = 0;
    this.ship.targetWaypoint = null;

    this.state.simulation.isPaused = false;
    this.state.simulation.timeWarp = 1;
    this.state.navigation.routeInvalid = true;
    this.state.navigation.routeCalculated = false;
    this.state.navigation.isNavigating = true;
    this.state.navigation.planningMode = PlanningMode.NONE;
    this.state.navigation.startPoint = { x: 400, y: 1800 };
    this.state.navigation.destinationPoint = { x: WORLD_W - 400, y: 400 };
    this.state.navigation.destination = { x: WORLD_W - 400, y: 400 };
    this.state.navigation.statusMessage = 'Ready';

    // Establish Single Source of Truth reference: activeRoute metadata structure
    this.state.navigation.activeRoute = {
      id: `route_${Date.now()}`,
      waypoints: [],
      rawPath: [],
      smoothPath: [],
      status: 'invalid',
      createdAt: performance.now(),
      expiresAt: performance.now() + 60000,
      totalDistance: 0,
      estimatedDuration: 0,
      maxRiskSegment: 0,
      destination: this.state.navigation.destination
    };

    this.renderer.startPoint = this.state.navigation.startPoint;
    this.renderer.destinationPoint = this.state.navigation.destinationPoint;
    this.renderer.planningMode = PlanningMode.NONE;
    this.renderer.camera.reset();
    this.calculateRoute();

    this.initDefaultIcebergs();
    this.aiNavigator.optimalRoute = [];

    if (this.uiController) this.uiController.updateSlidersFromState();
  }

  spawnIcebergAt(wx, wy, mass, size) {
    const id = Date.now();
    const newIce = new Iceberg({ id, name: `IB-${id}`, x: wx, y: wy, mass, size });
    this.icebergs.push(newIce);
    this.renderer.addIcebergMode = false;
    this.renderer.canvas.style.cursor = 'crosshair';
    this.state.navigation.routeInvalid = true;

    // Trigger immediate replanning if newly placed iceberg intersects activeRoute corridor
    const activeRoute = this.state.navigation.activeRoute;
    if (activeRoute && activeRoute.status === 'valid') {
      const riskBuffer = newIce.collisionRadius + 45; // collision + padding envelope
      let intersects = false;
      for (let i = 0; i < activeRoute.waypoints.length - 1; i++) {
        const ptA = activeRoute.waypoints[i];
        const ptB = activeRoute.waypoints[i + 1];
        
        // Find distance to segment
        const dx = ptB.x - ptA.x;
        const dy = ptB.y - ptA.y;
        const segLen2 = dx * dx + dy * dy;
        let t = 0;
        if (segLen2 > 0) {
          t = Math.max(0, Math.min(1, ((newIce.x - ptA.x) * dx + (newIce.y - ptA.y) * dy) / segLen2));
        }
        const cx = ptA.x + t * dx;
        const cy = ptA.y + t * dy;
        const distance = Math.hypot(newIce.x - cx, newIce.y - cy);
        if (distance < riskBuffer) {
          intersects = true;
          break;
        }
      }
      if (intersects) {
        console.log('[Iceberg Manager] Spawned iceberg intersects activeRoute, forcing instant replanning');
        this.calculateRoute();
      }
    }
  }

  loop(timestamp) {
    perfMonitor.startFrame();

    const rawDt = Math.min(0.1, (timestamp - this.lastTimestamp) / 1000);
    this.lastTimestamp = timestamp;
    let dt = 0;

    perfMonitor.timeFunction('physics', () => {
      try {
        if (!this.state.simulation.isPaused) {
          dt = rawDt * this.state.simulation.timeWarp;
          this.state.simulation.simTimeHours += (dt / 3600);

          // 2. Update Environment (wind, currents, sea-ice)
          this.vectorField.updateGrid(this.state.simulation.simTimeHours, this.state);
          this.vectorField.updateParticles(rawDt, this.state.simulation.simTimeHours, this.state);

          // 3. Update Icebergs (position, velocity)
          if (this.state.environment.mode === 'DATA-DRIVEN' && this.antarcticDataManager.active) {
            const dataIcebergs = this.antarcticDataManager.getIcebergsAt(this.state.simulation.simTimeHours);
            if (dataIcebergs) {
              this.icebergs = dataIcebergs.map(ice => {
                const existing = this.icebergs.find(ex => ex.id === ice.id);
                if (existing) {
                  existing.x = ice.x;
                  existing.y = ice.y;
                  existing.vx = ice.vx;
                  existing.vy = ice.vy;
                  existing.size = ice.size;
                  existing.mass = ice.mass;
                  existing.name = ice.name;
                  return existing;
                } else {
                  return new Iceberg(ice);
                }
              });
            }
          } else {
            for (let ice of this.icebergs) {
              ice.update(dt, this.vectorField, this.state.simulation.simTimeHours, this.state);
            }
          }

          // 4. Update Ship Physics (thrust, drag, position)
          this.ship.update(dt, this.vectorField, this.state.simulation.simTimeHours, this.state, this.icebergs);

          // 5. Update Navigation State (autopilot, route following, auto-expiration)
          this.aiNavigator.evaluate(this.ship, this.icebergs, this.vectorField, this.state.simulation.simTimeHours, this.state);

          // 6. Update Sensor Fusion (GNSS, Gyro, Radar → fused state estimate)
          sensorFusion.update(this.ship, this.icebergs, dt);

          // 7. Data Collection (non-blocking ring buffer record)
          if (dataRecorder.isRecording) {
            const shipPos = { x: this.ship.x, y: this.ship.y };
            const oc = this.vectorField.getVelocityAt(this.ship.x, this.ship.y, this.state.simulation.simTimeHours, this.state);
            let windX = 0, windY = 0;
            if (this.state.environment.wind.enabled) {
              const radW = (this.state.environment.wind.direction * Math.PI) / 180;
              const wMS  = (this.state.environment.wind.speed * 1000) / 3600;
              windX = Math.cos(radW) * wMS;
              windY = Math.sin(radW) * wMS;
            }
            const seaIce = this.vectorField.getSeaIceConcentration
              ? this.vectorField.getSeaIceConcentration(this.ship.x, this.ship.y)
              : this.state.environment.seaIce.averageConcentration || 0;

            dataRecorder.record(
              this.icebergs,
              this.ship,
              { windX, windY, currentX: oc.u, currentY: oc.v, seaIceConcentration: seaIce, waterTemperature: -1.8 },
              performance.now()
            );
          }

          // Route Auto-Expiration & Destination Arrival Checks
          const activeRoute = this.state.navigation.activeRoute;
          if (activeRoute && activeRoute.status === 'valid') {
            const now = performance.now();
            if (now > activeRoute.expiresAt) {
              console.info('[Navigator] Route expired (60s lifetime exceeded), triggering automatic replanning');
              this.calculateRoute();
            } else {
              const distToDest = Math.hypot(this.ship.x - activeRoute.destination.x, this.ship.y - activeRoute.destination.y);
              if (distToDest < 10) {
                console.info('[Navigator] Destination reached');
                activeRoute.status = 'invalid';
                this.state.navigation.routeCalculated = false;
                this.ship.throttle = 0;
                this.state.vessel.throttle = 0;
              }
            }
          }
        }
      } catch (e) {
        console.error('[Physics/Update Loop Failed]', e);
      }
    });

    if (this.aiClient) {
      try {
        this.aiClient.updatePredictions();
      } catch (e) {
        console.warn('[AI Client prediction update failed]', e);
      }
    }

    try {
      if (this.autonomousController) {
        this.autonomousController.evaluate(timestamp);
      }
    } catch (e) {
      console.warn("Autonomous Controller update failed", e);
    }

    try {
      if (this.scenarioManager) {
        this.scenarioManager.updateScenarioPhases();
      }
    } catch (e) {
      console.warn("Scenario Manager update failed", e);
    }

    try {
      if (this.validationEngine) {
        this.validationEngine.evaluate(this.state.simulation.simTimeHours);
      }
    } catch (e) {
      console.warn("Validation Engine update failed", e);
    }

    try {
      if (this.confidenceIntelligenceEngine) {
        this.confidenceIntelligenceEngine.update(timestamp);
      }
    } catch (e) {
      console.warn("Confidence Engine update failed", e);
    }

    try {
      if (this.decisionIntelligenceEngine) {
        this.decisionIntelligenceEngine.update(timestamp);
      }
    } catch (e) {
      console.warn("Decision Intelligence update failed", e);
    }

    try {
      if (this.riskIntelligenceEngine) {
        this.riskIntelligenceEngine.update(timestamp);
      }
    } catch (e) {
      console.warn("Risk Intelligence update failed", e);
    }

    perfMonitor.timeFunction('rendering', () => {
      try {
        this.renderer.render(
          this.vectorField,
          this.ship,
          this.icebergs,
          this.aiNavigator,
          this.state.simulation.simTimeHours,
          rawDt,
          this.state
        );
      } catch (e) {
        console.error('[Renderer] Draw failed:', e);
      }
    });

    try {
      this.uiController.updateTelemetry();
    } catch (e) {
      console.warn('[Telemetry Update Failed]', e);
    }

    // 8. Flight Recorder & Debug Overlay Sampling
    if (this.flightRecorder && this.flightRecorder.enabled) {
      const activeRoute = this.state.navigation.activeRoute || {};
      const oc = this.vectorField.getVelocityAt(this.ship.x, this.ship.y, this.state.simulation.simTimeHours, this.state);
      const radHdg = (this.ship.heading * Math.PI) / 180;
      const bowX = Math.cos(radHdg);
      const bowY = Math.sin(radHdg);
      const spdG = Math.hypot(this.ship.vx, this.ship.vy);
      const gDirX = spdG > 0.1 ? this.ship.vx / spdG : bowX;
      const gDirY = spdG > 0.1 ? this.ship.vy / spdG : bowY;
      const alignment = bowX * gDirX + bowY * gDirY;

      const snapshot = {
        timestamp_ms: Date.now(),
        simulation_time: this.state.simulation.simTimeHours,
        route: {
          id: activeRoute.id || 'none',
          path_length: activeRoute.waypoints ? activeRoute.waypoints.length : 0,
          status: activeRoute.status || 'invalid',
          destination: activeRoute.destination || { x: 0, y: 0 },
          selected_waypoint_index: this.ship.waypointIndex || 0,
          selected_target: this.ship.targetWaypoint || { x: 0, y: 0 },
          selected_target_is_forward: true,
          route_progress_fraction: (() => {
            const path = activeRoute.waypoints;
            if (!Array.isArray(path) || path.length < 2) return 0;
            const p0 = path[0];
            const p1 = path[path.length - 1];
            const totalLen = Math.hypot(p1.x - p0.x, p1.y - p0.y);
            if (totalLen < 1e-6) return 0;
            const traveled = Math.hypot(this.ship.x - p0.x, this.ship.y - p0.y);
            return Math.max(0, Math.min(1, traveled / totalLen));
          })()
        },
        ship: {
          position: { x: this.ship.x, y: this.ship.y },
          heading_rad: radHdg,
          heading_deg: this.ship.heading,
          target_heading_deg: this.ship.targetHeading !== undefined ? this.ship.targetHeading : (Math.atan2(this.ship.vy, this.ship.vx) * 180 / Math.PI + 360) % 360,
          rudder_command: this.ship.rudder,
          throttle: this.ship.throttle,
          ground_velocity: { x: this.ship.vx, y: this.ship.vy },
          ground_speed: spdG,
          water_speed: spdG,
          sprite_rotation_deg: this.ship.heading,
          distance_to_destination: Math.hypot(this.ship.x - (activeRoute.destination?.x || 0), this.ship.y - (activeRoute.destination?.y || 0))
        },
        guidance: {
          mode: this.ship.autopilotStatus || 'NORMAL',
          cross_track_error: this.ship.crossTrackError || 0,
          current_velocity: { x: oc.u * 4.0, y: oc.v * 4.0 },
          is_current_limited: this.ship.autopilotStatus === 'FIGHTING_CURRENT',
          ...(this.ship.guidanceBreakdown || {})
        },
        integrity: {
          route_id_matches_ship_route_id: true,
          finite_position: Number.isFinite(this.ship.x) && Number.isFinite(this.ship.y),
          heading_velocity_alignment: alignment
        }
      };
      this.flightRecorder.recordSample(snapshot);
      if (this.navigationWatchdog) {
        this.navigationWatchdog.evaluate(snapshot, this);
      }
      if (this.debugOverlay) {
        this.debugOverlay.update(snapshot, this.navigationWatchdog);
      }
    }

    // Debug HUD update
    this.frames = (this.frames || 0) + 1;
    if (timestamp - (this.lastFpsTime || 0) > 1000) {
      this.fps = this.frames;
      this.frames = 0;
      this.lastFpsTime = timestamp;
    }
    const dbgHud = document.getElementById('debug-hud');
    if (dbgHud && !dbgHud.classList.contains('hidden')) {
      const wpt = this.ship.routeWaypoints[this.ship.waypointIndex];
      const distToWpt = wpt ? Math.hypot(wpt.x - this.ship.x, wpt.y - this.ship.y).toFixed(0) : 'N/A';
      const setDbg = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
      setDbg('dbg-fps',   this.fps || 0);
      setDbg('dbg-dt',    dt ? dt.toFixed(4) : '0.0000');
      setDbg('dbg-ts',    this.state.simulation.timeWarp);
      setDbg('dbg-pos',   `${this.ship.x.toFixed(0)}, ${this.ship.y.toFixed(0)}`);
      setDbg('dbg-vel',   `${this.ship.vx.toFixed(2)}, ${this.ship.vy.toFixed(2)}`);
      setDbg('dbg-spd',   this.ship.speedKnots.toFixed(2));
      setDbg('dbg-hdg',   this.ship.heading.toFixed(1));
      setDbg('dbg-wpt',   `${this.ship.waypointIndex} / ${this.ship.routeWaypoints.length}`);
      setDbg('dbg-dist',  distToWpt);
      setDbg('dbg-route', this.ship.routeWaypoints.length > 0 ? 'YES' : 'NO');
      setDbg('dbg-cs',    'WORLD (3600x2400)');
      setDbg('dbg-ice',   this.icebergs.length);
      setDbg('dbg-zoom',  `${(this.renderer.zoom * 100).toFixed(0)}%`);
      setDbg('dbg-cam',   `${this.renderer.cameraX.toFixed(0)}, ${this.renderer.cameraY.toFixed(0)}`);
      setDbg('dbg-mouse', `${this.renderer.mouseWorld.x.toFixed(0)}, ${this.renderer.mouseWorld.y.toFixed(0)}`);
      const sp = this.state.navigation.startPoint;
      const dp = this.state.navigation.destinationPoint;
      setDbg('dbg-start', sp ? `${sp.x}, ${sp.y}` : '—');
      setDbg('dbg-dest',  dp ? `${dp.x}, ${dp.y}` : '—');
      setDbg('dbg-follow', this.renderer.trackShip ? 'ON' : 'OFF');
    }

    perfMonitor.endFrame();
    requestAnimationFrame((t) => this.loop(t));
  }
}

window.addEventListener('DOMContentLoaded', () => {
  try {
    window.simEngine = new SimulationEngine();
    window.simEngine.perfMonitor = perfMonitor;
  } catch (err) {
    console.error("CRITICAL INITIALIZATION ERROR IN SIMULATION ENGINE:", err);
  }
});
