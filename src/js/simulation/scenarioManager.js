import { Iceberg } from './iceberg.js';

export class ScenarioManager {
  constructor(engine) {
    this.engine = engine;
    this.activeScenarioName = "None";
    this.currentPhase = "SETUP";
    this.isAutoDemo = false;
    this.autoDemoInterval = null;
    this.autoDemoIndex = 0;
    
    // Save defaults
    this.defaultState = null;
    this.defaultIcebergsState = [];
  }

  saveDefaultStateCheckpoints() {
    const state = this.engine.state;
    this.defaultState = JSON.parse(JSON.stringify({
      environment: state.environment,
      vessel: state.vessel,
      navigation: {
        mode: state.navigation.mode,
        isNavigating: state.navigation.isNavigating
      }
    }));
    // Save iceberg configurations
    this.defaultIcebergsState = this.engine.icebergs.map(ice => ({
      id: ice.id,
      name: ice.name,
      x: ice.x,
      y: ice.y,
      vx: ice.vx,
      vy: ice.vy,
      mass: ice.mass,
      size: ice.size
    }));
  }

  activateScenario(name) {
    if (this.activeScenarioName === "None" && name !== "None") {
      this.saveDefaultStateCheckpoints();
    }
    
    this.activeScenarioName = name;
    this.currentPhase = "SETUP";
    
    const state = this.engine.state;
    const ship = this.engine.ship;
    const autoCtrl = this.engine.autonomousController;

    // Revert to SIMULATION mode when launching a demo scenario to prevent resource conflicts
    state.environment.mode = 'SIMULATION';
    if (this.engine.antarcticDataManager) {
      this.engine.antarcticDataManager.active = false;
    }

    // Standard default route initialization if not set
    if (!state.navigation.startPoint) {
      state.navigation.startPoint = { x: 400, y: 1800 };
      this.engine.renderer.startPoint = state.navigation.startPoint;
      state.navigation.destinationPoint = { x: 3200, y: 400 };
      this.engine.renderer.destinationPoint = state.navigation.destinationPoint;
      state.navigation.isNavigating = true;
    }

    // Force Autonomous Controller active for scenarios
    if (autoCtrl) {
      autoCtrl.isActive = true;
      const toggleBtn = document.getElementById('ai-auto-toggle-btn');
      if (toggleBtn) {
        toggleBtn.innerText = 'ACTIVE';
        toggleBtn.className = 'border border-secondary text-secondary bg-secondary/10 px-2 py-0.5 rounded hover:bg-secondary/20 transition-colors font-bold text-[9px]';
      }
    }

    if (name === "NORMAL_TRANSIT") {
      // Scenario 1: Normal Transit
      state.environment.wind.enabled = true;
      state.environment.wind.speed = 15; // mild wind
      state.environment.wind.direction = 90;
      state.environment.ocean.currentSpeed = 2; // mild current
      state.environment.ocean.currentDirection = 180;
      state.environment.seaIce.enabled = false;
      state.environment.seaIce.averageConcentration = 0.05;
      
      // Keep icebergs away from start route path
      this.engine.icebergs = this.defaultIcebergsState
        .map(ice => new Iceberg({ ...ice }))
        .filter(ice => Math.hypot(ice.x - 1800, ice.y - 1100) > 400);
      
    } else if (name === "ICEBERG_CROSSING") {
      // Scenario 2: Iceberg Crossing
      state.environment.wind.enabled = true;
      state.environment.wind.speed = 20;
      state.environment.wind.direction = 45;
      state.environment.ocean.currentSpeed = 3;
      state.environment.ocean.currentDirection = 90;
      state.environment.seaIce.enabled = false;

      // Spawn a massive iceberg directly intersecting path ahead
      this.engine.icebergs = [
        new Iceberg({
          id: 9999,
          name: "M-CROSSER",
          x: 1800,
          y: 900,
          mass: 8.0,
          size: 110
        })
      ];
      // Configure it to drift directly across planned path corridor
      this.engine.icebergs[0].vx = -30;
      this.engine.icebergs[0].vy = 40;

    } else if (name === "INCREASING_SEA_ICE") {
      // Scenario 3: Increasing Sea Ice
      state.environment.wind.enabled = true;
      state.environment.wind.speed = 25;
      state.environment.ocean.currentSpeed = 4;
      state.environment.seaIce.enabled = true;
      state.environment.seaIce.averageConcentration = 0.75; // Heavy ice
      
      // Clear icebergs to isolate sea-ice effect
      this.engine.icebergs = [];

    } else if (name === "EXTREME_WEATHER") {
      // Scenario 4: Extreme Weather
      state.environment.wind.enabled = true;
      state.environment.wind.speed = 85; // High wind shear
      state.environment.wind.direction = 270; // Cross-wind
      state.environment.ocean.currentSpeed = 12; // High current
      state.environment.ocean.currentDirection = 180;
      state.environment.seaIce.enabled = true;
      state.environment.seaIce.averageConcentration = 0.3;

      // Keep default icebergs
      this.engine.icebergs = this.defaultIcebergsState.map(ice => new Iceberg({ ...ice }));
    }

    // Recalculate route and trigger system updates
    this.engine.calculateRoute();
    if (this.engine.aiClient) {
      this.engine.aiClient.lastPredictTime = 0;
      this.engine.aiClient.lastSeaIcePredictTime = 0;
      this.engine.aiClient.updatePredictions();
    }
    if (autoCtrl) {
      autoCtrl.evaluate(performance.now());
    }
    if (this.engine.missionPlanner) {
      this.engine.missionPlanner.outdated = true;
    }
  }

  updateScenarioPhases() {
    if (this.activeScenarioName === "None") return;

    const ship = this.engine.ship;
    const autoCtrl = this.engine.autonomousController;
    const client = this.engine.aiClient;

    // Real-time phase evaluator state tree
    if (autoCtrl && (autoCtrl.currentCommand.mode === "REROUTE" || autoCtrl.currentCommand.mode === "REDUCE_SPEED" || autoCtrl.currentCommand.mode === "EMERGENCY_STOP")) {
      this.currentPhase = "EXECUTION";
    } else if (autoCtrl && autoCtrl.currentCommand.mode !== "STANDBY" && autoCtrl.currentCommand.mode !== "SAFE_TO_PROCEED") {
      this.currentPhase = "DECISION";
    } else if (client && client.status === "ONLINE" && ((this.engine.icebergs[0] && this.engine.icebergs[0].mlTrajectory) || client.seaIceForecast)) {
      this.currentPhase = "PREDICTION";
    } else if (ship.hazards && ship.hazards.length > 0) {
      this.currentPhase = "DETECTION";
    } else {
      this.currentPhase = "SETUP";
    }
  }

  toggleAutoDemo(forceState) {
    this.isAutoDemo = forceState !== undefined ? forceState : !this.isAutoDemo;
    if (this.isAutoDemo) {
      this.autoDemoIndex = 0;
      const scenarios = ["NORMAL_TRANSIT", "ICEBERG_CROSSING", "INCREASING_SEA_ICE", "EXTREME_WEATHER"];
      this.activateScenario(scenarios[this.autoDemoIndex]);
      
      this.autoDemoInterval = setInterval(() => {
        this.autoDemoIndex = (this.autoDemoIndex + 1) % scenarios.length;
        this.activateScenario(scenarios[this.autoDemoIndex]);
      }, 25000); // Shift scenario every 25 seconds
    } else {
      if (this.autoDemoInterval) {
        clearInterval(this.autoDemoInterval);
        this.autoDemoInterval = null;
      }
    }
  }

  reset() {
    this.toggleAutoDemo(false);
    this.activeScenarioName = "None";
    this.currentPhase = "SETUP";

    if (this.defaultState) {
      const state = this.engine.state;
      state.environment = JSON.parse(JSON.stringify(this.defaultState.environment));
      state.vessel = JSON.parse(JSON.stringify(this.defaultState.vessel));
      state.navigation.mode = this.defaultState.navigation.mode;
      state.navigation.isNavigating = this.defaultState.navigation.isNavigating;
      
      this.engine.ship.x = 400;
      this.engine.ship.y = 1800;
      this.engine.ship.vx = 0;
      this.engine.ship.vy = 0;
      this.engine.ship.heading = 330;
      this.engine.ship.fuel = 100;
      this.engine.ship.waypointIndex = 0;

      this.engine.icebergs = this.defaultIcebergsState.map(ice => new Iceberg({ ...ice }));
      
      this.engine.calculateRoute();
      if (this.engine.aiClient) {
        this.engine.aiClient.lastPredictTime = 0;
        this.engine.aiClient.lastSeaIcePredictTime = 0;
        this.engine.aiClient.updatePredictions();
      }
      if (this.engine.autonomousController) {
        this.engine.autonomousController.isActive = false;
        this.engine.autonomousController.evaluate(performance.now());
        const toggleBtn = document.getElementById('ai-auto-toggle-btn');
        if (toggleBtn) {
          toggleBtn.innerText = 'STANDBY';
          toggleBtn.className = 'border border-error text-error px-2 py-0.5 rounded hover:bg-error/10 transition-colors font-bold text-[9px]';
        }
      }
      if (this.engine.validationEngine) {
        this.engine.validationEngine.reset();
      }
      if (this.engine.riskIntelligenceEngine) {
        this.engine.riskIntelligenceEngine.update(performance.now(), true);
      }
    }
  }
}
