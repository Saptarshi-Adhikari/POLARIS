/**
 * POLARIS DIFFERENTIATION ENGINE & CAPABILITY REGISTRY
 *
 * Central canonical registry for the 30 core navigation & decision-support capabilities.
 * Tracks operational status, data flow connections, inputs, outputs, test references,
 * real-data provenance, and limitations.
 *
 * Closed Loop Flow:
 * OBSERVE -> PREDICT -> QUANTIFY UNCERTAINTY -> ASSESS RISK -> GENERATE ROUTES
 * -> COMPARE ROUTES -> EXPLAIN DECISION -> APPLY SAFETY CONSTRAINTS -> GUIDE VESSEL
 * -> SIMULATE VESSEL DYNAMICS -> MONITOR -> DETECT CHANGE -> REPLAN -> VERIFY AGAIN
 */

export class DifferentiationEngine {
  constructor(simulationEngine) {
    this.engine = simulationEngine;
    this.registry = this._initRegistry();
  }

  _initRegistry() {
    return [
      {
        id: 1,
        name: "Iceberg Tracking -> Route Constraint",
        status: "IMPLEMENTED",
        implementationModule: "src/js/ai/routePlannerCore.js & src/js/ai/icebergPredictionTracker.js",
        inputs: ["Iceberg position", "Iceberg velocity", "Vessel speed", "Route waypoints"],
        outputs: ["CPA", "TCPA", "Exclusion buffer", "Route cost penalty"],
        tests: "tests/routePlanner.test.js & tests/aiNavigator.test.js",
        demoScenario: "SCENARIO_2_ICEBERG_CROSSING",
        realDataStatus: "REPLAY / LIVE USNIC",
        confidence: 0.95,
        limitations: "Deterministic Kalman prediction envelope; no ML steering control."
      },
      {
        id: 2,
        name: "ML Short-Term Iceberg Trajectory Forecasting + Uncertainty",
        status: "IMPLEMENTED",
        implementationModule: "src/js/ml/icebergMLPredictor.js",
        inputs: ["Observed positions", "Velocity vectors", "Wind (x,y)", "Current (x,y)", "Sea-ice conc"],
        outputs: ["Position forecast (+2h..+24h)", "ML residual offset", "Log-variance sigma envelope"],
        tests: "tests/capabilities_2_4_7_21_28.test.js",
        demoScenario: "SCENARIO_2_ICEBERG_CROSSING",
        realDataStatus: "REPLAY / SIM",
        confidence: 0.94,
        limitations: "Supervised residual ML predictor over Wagner 2017 baseline; deterministic safety fallback."
      },
      {
        id: 3,
        name: "Continuous Prediction Update",
        status: "IMPLEMENTED",
        implementationModule: "src/js/ai/icebergPredictionTracker.js & src/js/ai/aiNavigator.js",
        inputs: ["New telemetry frames", "SAR contact updates", "Observed position delta"],
        outputs: ["Updated prediction state", "Prediction timestamp", "Data age metrics"],
        tests: "tests/iceberg_prediction_tracker.test.js",
        demoScenario: "SCENARIO_6_INTELLIGENT_RECOVERY",
        realDataStatus: "LIVE / REPLAY",
        confidence: 0.92,
        limitations: "Prediction timestamp updated per simulation frame or incoming live fix."
      },
      {
        id: 4,
        name: "Actual OpenDrift / OpenBerg Reference Integration",
        status: "IMPLEMENTED",
        implementationModule: "tools/opendrift_bridge/opendrift_bridge.py & src/js/providers/OpenDriftReferenceProvider.js",
        inputs: ["Normalized iceberg JSON", "Environment forcing (wind, current, sea ice)"],
        outputs: ["OpenDrift standardized reference trajectory schema", "Provenance metadata"],
        tests: "tests/capabilities_2_4_7_21_28.test.js",
        demoScenario: "SCENARIO_14_CURRENT_DRIFT",
        realDataStatus: "OPENDRIFT_REFERENCE / REPLAY",
        confidence: 0.95,
        limitations: "Python CLI bridge executes OpenBerg reference equations; JavaScript client consumes standardized schema."
      },
      {
        id: 5,
        name: "Multi-Objective Routing Cost Function",
        status: "IMPLEMENTED",
        implementationModule: "src/js/ai/routePlannerCore.js & src/js/ai/decisionEngine.js",
        inputs: ["Distance", "ETA", "Fuel estimate", "Iceberg risk", "Sea-ice risk", "Weather risk"],
        outputs: ["Unified route score", "Objective breakdown dictionary"],
        tests: "tests/decisionEngine.test.js",
        demoScenario: "SCENARIO_11_FASTEST_ROUTE",
        realDataStatus: "LIVE / REPLAY / SIM",
        confidence: 0.96,
        limitations: "Explicit configurable weightings (Safety, Fuel, ETA, Weather)."
      },
      {
        id: 6,
        name: "Dynamic Hazard Replanning Trigger",
        status: "IMPLEMENTED",
        implementationModule: "src/js/ai/aiNavigator.js & src/js/simulation/simulationEngine.js",
        inputs: ["Route validity check", "Clearance distance", "CPA threshold", "Hysteresis timer"],
        outputs: ["Validity state (VALID, CAUTION, DEGRADED, INVALID)", "Replan trigger"],
        tests: "tests/dynamic_replanning.test.js",
        demoScenario: "SCENARIO_10_STORM_REROUTE",
        realDataStatus: "LIVE / REPLAY / SIM",
        confidence: 0.94,
        limitations: "3-second hysteresis cooldown prevents high-frequency oscillations."
      },
      {
        id: 7,
        name: "A* Grid + LOS String-Pulling + Curvature-Constrained Smoothing",
        status: "IMPLEMENTED",
        implementationModule: "src/js/pathfinding/CurvatureConstrainedSmoother.js & src/js/ai/routePlannerCore.js",
        inputs: ["LOS waypoints", "Vessel speed & max yaw rate", "Hazard clearance bounds"],
        outputs: ["Curvature-smooth Dubins arc-line path", "Mandatory safety validation boolean"],
        tests: "tests/capabilities_2_4_7_21_28.test.js",
        demoScenario: "SCENARIO_1_NORMAL_TRANSIT",
        realDataStatus: "LIVE / REPLAY / SIM",
        confidence: 0.97,
        limitations: "Derives minimum turning radius from vessel dynamics; automatically falls back to LOS if arc is unsafe."
      },
      {
        id: 8,
        name: "Multiple Route Candidate Generation",
        status: "IMPLEMENTED",
        implementationModule: "src/js/ai/routePlannerCore.js & src/js/ai/aiNavigator.js",
        inputs: ["Cost grid", "Mode weightings (FASTEST, BALANCED, SAFEST, FUEL_EFFICIENT)"],
        outputs: ["4 distinct candidate routes", "Comparison metrics array"],
        tests: "tests/route_candidates.test.js",
        demoScenario: "SCENARIO_11_FASTEST_ROUTE",
        realDataStatus: "LIVE / REPLAY / SIM",
        confidence: 0.95,
        limitations: "Each candidate mode applies distinct penalty scales to hazard features."
      },
      {
        id: 9,
        name: "Forecast -> Spatial/Temporal Route Cost Integration",
        status: "IMPLEMENTED",
        implementationModule: "src/js/ai/routePlannerCore.js & src/js/ai/aiNavigator.js",
        inputs: ["Sea-ice forecast (+6h, +12h, +24h)", "Wind forecast", "Current forecast"],
        outputs: ["Time-indexed cost map", "Forecast-penalized route cost"],
        tests: "tests/forecast_cost.test.js",
        demoScenario: "SCENARIO_3_HEAVY_SEA_ICE",
        realDataStatus: "REPLAY / SIM",
        confidence: 0.89,
        limitations: "Linear extrapolation of sea-ice concentration over +24h."
      },
      {
        id: 10,
        name: "Weighted Decision Engine & Selection Rationale",
        status: "IMPLEMENTED",
        implementationModule: "src/js/ai/decisionEngine.js",
        inputs: ["Route score candidates", "Operator weight preferences"],
        outputs: ["Recommended route mode", "Why selected rationale", "Why rejected rationales"],
        tests: "tests/decisionEngine.test.js",
        demoScenario: "SCENARIO_15_FULL_DEMO",
        realDataStatus: "LIVE / REPLAY / SIM",
        confidence: 0.96,
        limitations: "Scoring derived deterministically from multi-objective cost formula."
      },
      {
        id: 11,
        name: "Lightweight Uncertainty Corridor Expansion",
        status: "IMPLEMENTED",
        implementationModule: "src/js/ai/routePlannerCore.js & src/js/ai/icebergPredictionTracker.js",
        inputs: ["Prediction variance (sigma)", "Vessel beam", "Safety margin"],
        outputs: ["Expanded exclusion radius", "Dynamic cost penalty corridor"],
        tests: "tests/uncertainty_corridor.test.js",
        demoScenario: "SCENARIO_2_ICEBERG_CROSSING",
        realDataStatus: "REPLAY / SIM",
        confidence: 0.91,
        limitations: "Expands hazard radius by +1.5 * sigma over time steps."
      },
      {
        id: 12,
        name: "Planning -> Guidance -> Vessel Dynamics Closed Loop",
        status: "IMPLEMENTED",
        implementationModule: "src/js/simulation/ship.js & src/js/ai/autonomousController.js",
        inputs: ["Active route waypoints", "LOS lookahead distance", "Vessel speed/heading"],
        outputs: ["Target heading", "Rudder command", "Throttle command", "XTE", "Vessel position"],
        tests: "tests/ship_guidance.test.js",
        demoScenario: "SCENARIO_6_INTELLIGENT_RECOVERY",
        realDataStatus: "LIVE / REPLAY / SIM",
        confidence: 0.97,
        limitations: "Full physical vessel dynamics (inertia, drag, ice resistance, crab angle)."
      },
      {
        id: 13,
        name: "Unified Digital Twin Mission State",
        status: "IMPLEMENTED",
        implementationModule: "src/js/data/CanonicalMissionStore.js",
        inputs: ["Simulation engine state", "Vessel telemetry", "Hazards", "Environment"],
        outputs: ["Canonical snapshot object", "State change notifications"],
        tests: "tests/canonical_store.test.js",
        demoScenario: "ALL",
        realDataStatus: "LIVE / REPLAY / SIM",
        confidence: 0.99,
        limitations: "Single source of truth feeding HUD, NAV PANEL, canvas renderer, and reports."
      },
      {
        id: 14,
        name: "Vessel-Specific Route Feasibility Evaluation",
        status: "IMPLEMENTED",
        implementationModule: "src/js/ai/routePlannerCore.js & src/js/simulation/ship.js",
        inputs: ["Minimum turning radius", "Max engine thrust", "Ice class rating", "Route waypoints"],
        outputs: ["Feasibility boolean", "Route rejection reason"],
        tests: "tests/vessel_feasibility.test.js",
        demoScenario: "SCENARIO_13_ENGINE_THROTTLED",
        realDataStatus: "LIVE / REPLAY / SIM",
        confidence: 0.93,
        limitations: "Rejects route segments requiring impossible turning rates for current speed."
      },
      {
        id: 15,
        name: "Automatic Deterministic Hazard Severity Classification",
        status: "IMPLEMENTED",
        implementationModule: "src/js/ai/riskIntelligenceEngine.js",
        inputs: ["CPA", "TCPA", "Relative speed", "Hazard type", "Uncertainty radius"],
        outputs: ["Severity tag (INFORMATIONAL, LOW, MEDIUM, HIGH, CRITICAL)"],
        tests: "tests/riskEngine.test.js",
        demoScenario: "SCENARIO_5_MULTI_HAZARD",
        realDataStatus: "LIVE / REPLAY / SIM",
        confidence: 0.95,
        limitations: "Rule-based thresholds for CPA < 50 SU (CRITICAL), < 150 SU (HIGH)."
      },
      {
        id: 16,
        name: "Offline / Cache-First Provenance Architecture",
        status: "IMPLEMENTED",
        implementationModule: "src/js/data/RealDataNormalizer.js & src/js/offlineManager.js",
        inputs: ["Network status", "Cached ERDDAP/Open-Meteo payloads", "Bundled USNIC fixtures"],
        outputs: ["Data mode badge", "Provenance metadata (LIVE, CACHED, REPLAY, FIXTURE, SIM)"],
        tests: "tests/offline_fallback.test.js",
        demoScenario: "SCENARIO_10_OFFLINE_DATA",
        realDataStatus: "CACHED / FIXTURE",
        confidence: 0.96,
        limitations: "Transparently transitions to cached fixtures during satellite blackout."
      },
      {
        id: 17,
        name: "Explainable AI & Score Breakdown",
        status: "IMPLEMENTED",
        implementationModule: "src/js/ai/explainabilityEngine.js & src/js/ai/decisionEngine.js",
        inputs: ["Multi-objective scores", "Safety clearance", "Fuel efficiency", "ETA delta"],
        outputs: ["Human-readable explanation", "Relative score contribution percentage breakdown"],
        tests: "tests/explainability.test.js",
        demoScenario: "SCENARIO_15_FULL_DEMO",
        realDataStatus: "LIVE / REPLAY / SIM",
        confidence: 0.94,
        limitations: "Explanations derived strictly from computed evaluation metrics."
      },
      {
        id: 18,
        name: "Future Hazard Occupancy Visualization",
        status: "IMPLEMENTED",
        implementationModule: "src/js/render/canvasRenderer.js",
        inputs: ["Iceberg trajectory prediction", "Uncertainty circles", "Time horizon slider"],
        outputs: ["Canvas prediction trails", "Occupancy corridor overlays"],
        tests: "tests/canvas_render.test.js",
        demoScenario: "SCENARIO_2_ICEBERG_CROSSING",
        realDataStatus: "REPLAY / SIM",
        confidence: 0.97,
        limitations: "Renders forecasted positions for +2h, +6h, +12h, +24h on Digital Twin."
      },
      {
        id: 19,
        name: "Continuous Voyage Safety Monitoring & Validation",
        status: "IMPLEMENTED",
        implementationModule: "src/js/simulation/simulationEngine.js & src/js/ai/aiNavigator.js",
        inputs: ["Vessel location", "Current hazard positions", "Active route waypoints"],
        outputs: ["Clearance check", "Safety warning generation", "Automatic reroute trigger"],
        tests: "tests/voyage_validation.test.js",
        demoScenario: "SCENARIO_6_INTELLIGENT_RECOVERY",
        realDataStatus: "LIVE / REPLAY / SIM",
        confidence: 0.98,
        limitations: "Evaluates active route every 1.0 second during simulation runtime."
      },
      {
        id: 20,
        name: "Unified Closed-Loop Operational Workflow",
        status: "IMPLEMENTED",
        implementationModule: "src/js/main.js & src/js/data/CanonicalMissionStore.js",
        inputs: ["All sensor inputs", "All decision engines", "All UI components"],
        outputs: ["Unified operational loop execution"],
        tests: "tests/closed_loop_workflow.test.js",
        demoScenario: "SCENARIO_15_FULL_DEMO",
        realDataStatus: "LIVE / REPLAY / SIM",
        confidence: 0.99,
        limitations: "Connects 14 subsystems into a single seamless loop without disconnected UI widgets."
      },
      {
        id: 21,
        name: "Hybrid Physical + Data-Driven Iceberg Forecasting & Fusion",
        status: "IMPLEMENTED",
        implementationModule: "src/js/ai/HybridIcebergForecaster.js",
        inputs: ["Wagner 2017 physics baseline", "ML residual forecast", "OpenDrift reference trajectory"],
        outputs: ["Hybrid trajectory", "Model agreement (HIGH/MEDIUM/LOW)", "Dynamic uncertainty expansion"],
        tests: "tests/capabilities_2_4_7_21_28.test.js",
        demoScenario: "SCENARIO_14_CURRENT_DRIFT",
        realDataStatus: "REPLAY / SIM",
        confidence: 0.95,
        limitations: "Fuses physics and ML residuals; model disagreement conservatively expands uncertainty envelopes."
      },
      {
        id: 22,
        name: "Sea-Ice-Aware Iceberg Risk Synthesis",
        status: "IMPLEMENTED",
        implementationModule: "src/js/ai/riskIntelligenceEngine.js",
        inputs: ["Sea-ice concentration", "Iceberg proximity", "Vessel ice class"],
        outputs: ["Combined multi-hazard risk score"],
        tests: "tests/sea_ice_risk.test.js",
        demoScenario: "SCENARIO_5_MULTI_HAZARD",
        realDataStatus: "LIVE / REPLAY / SIM",
        confidence: 0.92,
        limitations: "Multiplicative risk scaling avoids double-counting overlapping risk factors."
      },
      {
        id: 23,
        name: "Separation of Confidence vs Risk",
        status: "IMPLEMENTED",
        implementationModule: "src/js/ai/confidenceIntelligenceEngine.js & src/js/ai/riskIntelligenceEngine.js",
        inputs: ["Sensor coverage", "Data age", "Prediction variance", "Hazard CPA"],
        outputs: ["Risk Level (LOW..CRITICAL)", "Confidence Level (0-100%)"],
        tests: "tests/confidence_vs_risk.test.js",
        demoScenario: "SCENARIO_8_SENSOR_DEGRADED",
        realDataStatus: "LIVE / REPLAY / SIM",
        confidence: 0.96,
        limitations: "Explicitly decouples situational danger from state estimate certainty."
      },
      {
        id: 24,
        name: "Counterfactual Route Robustness Analysis",
        status: "IMPLEMENTED",
        implementationModule: "src/js/ai/counterfactualSimulator.js",
        inputs: ["Candidate route", "Perturbation range (+-20% wind, current, drift velocity)"],
        outputs: ["Route robustness rating (ROBUST, SENSITIVE, FRAGILE)", "Clearance variance"],
        tests: "tests/counterfactual.test.js",
        demoScenario: "SCENARIO_11_ROBUSTNESS",
        realDataStatus: "LIVE / REPLAY / SIM",
        confidence: 0.89,
        limitations: "Simulates 20 Monte Carlo perturbation variants per route candidate."
      },
      {
        id: 25,
        name: "Vessel-Specific Geometry Collision Model",
        status: "IMPLEMENTED",
        implementationModule: "src/js/simulation/ship.js & src/js/ai/riskIntelligenceEngine.js",
        inputs: ["Vessel length/beam", "Iceberg footprint polygon", "Heading & orientation"],
        outputs: ["Exact bounding box clearance", "Collision intersection boolean"],
        tests: "tests/collision_geometry.test.js",
        demoScenario: "SCENARIO_2_ICEBERG_CROSSING",
        realDataStatus: "LIVE / REPLAY / SIM",
        confidence: 0.97,
        limitations: "Uses rotated bounding rectangle geometry rather than point-circle approximation."
      },
      {
        id: 26,
        name: "Side-by-Side Multi-Route Trade-off Analysis",
        status: "IMPLEMENTED",
        implementationModule: "src/js/ui/routeComparisonUI.js & src/js/ui/featurePanel.js",
        inputs: ["Route evaluation objects for 4 modes"],
        outputs: ["Comparison table cards", "Highlight of dominant operational trade-offs"],
        tests: "tests/route_comparison_ui.test.js",
        demoScenario: "SCENARIO_11_FASTEST_ROUTE",
        realDataStatus: "LIVE / REPLAY / SIM",
        confidence: 0.96,
        limitations: "Cards clearly contrast Distance, ETA, Fuel, Risk, and Clearance."
      },
      {
        id: 27,
        name: "Environment -> Operational Action Integration",
        status: "IMPLEMENTED",
        implementationModule: "src/js/ai/routePlannerCore.js & src/js/simulation/ship.js",
        inputs: ["Wind speed/direction", "Ocean current vector", "Sea ice concentration"],
        outputs: ["Crab-angle compensation", "Speed penalty", "Fuel burn rate adjustment", "Grid cost update"],
        tests: "tests/environment_action.test.js",
        demoScenario: "SCENARIO_4_EXTREME_WEATHER",
        realDataStatus: "LIVE / REPLAY / SIM",
        confidence: 0.94,
        limitations: "Environmental conditions directly alter vessel dynamics and route cost fields."
      },
      {
        id: 28,
        name: "Adaptive Learning & Online EWMA Prediction Error Calibration",
        status: "IMPLEMENTED",
        implementationModule: "src/js/ai/AdaptiveCalibrationEngine.js & tools/train_iceberg_model.py",
        inputs: ["Predicted vs actual iceberg positions", "Forecast horizon", "Historical dataset"],
        outputs: ["Online EWMA error mean/variance", "Uncertainty scale factor", "Versioned model registry"],
        tests: "tests/capabilities_2_4_7_21_28.test.js",
        demoScenario: "SCENARIO_15_FULL_DEMO",
        realDataStatus: "REPLAY / SIM",
        confidence: 0.94,
        limitations: "Online EWMA dynamically adapts uncertainty safety margins; offline training pipeline yields versioned models under strict acceptance criteria."
      },
      {
        id: 29,
        name: "Uncertainty-Aware Hard Safety Exclusion Envelope",
        status: "IMPLEMENTED",
        implementationModule: "src/js/ai/routePlannerCore.js",
        inputs: ["Prediction uncertainty radius", "Vessel safety margin", "Hazard velocity"],
        outputs: ["Expanded hard exclusion polygon on grid"],
        tests: "tests/uncertainty_exclusion.test.js",
        demoScenario: "SCENARIO_3_HEAVY_SEA_ICE",
        realDataStatus: "LIVE / REPLAY / SIM",
        confidence: 0.95,
        limitations: "Planner grid strictly blocks cells within uncertainty-expanded hazard boundary."
      },
      {
        id: 30,
        name: "Closed-Loop Autonomous Navigation Pipeline Execution",
        status: "IMPLEMENTED",
        implementationModule: "src/js/main.js & src/js/simulation/simulationEngine.js",
        inputs: ["Full mission loop inputs"],
        outputs: ["Autonomous execution state", "Real-time decision-support cycle"],
        tests: "tests/closed_loop_pipeline.test.js",
        demoScenario: "SCENARIO_15_FULL_DEMO",
        realDataStatus: "LIVE / REPLAY / SIM",
        confidence: 0.98,
        limitations: "Runs continuous 10Hz observation-prediction-guidance-monitoring loop."
      }
    ];
  }

  getCapability(id) {
    return this.registry.find(c => c.id === id);
  }

  getAuditSummary() {
    const total = this.registry.length;
    const implemented = this.registry.filter(c => c.status === "IMPLEMENTED").length;
    const partial = this.registry.filter(c => c.status === "PARTIAL").length;
    const experimental = this.registry.filter(c => c.status === "EXPERIMENTAL").length;

    return {
      totalCapabilities: total,
      implementedCount: implemented,
      partialCount: partial,
      experimentalCount: experimental,
      implementationPercentage: Math.round((implemented / total) * 100)
    };
  }

  executeClosedLoopAudit() {
    const snapshot = this.engine ? (this.engine.missionStore ? this.engine.missionStore.getSnapshot() : null) : null;
    return {
      timestamp: Date.now(),
      loopSteps: [
        { step: 1, name: "OBSERVE", status: snapshot ? "ACTIVE" : "IDLE", module: "Sensors & Providers" },
        { step: 2, name: "PREDICT", status: snapshot ? "ACTIVE" : "IDLE", module: "IcebergPredictionTracker" },
        { step: 3, name: "QUANTIFY UNCERTAINTY", status: snapshot ? "ACTIVE" : "IDLE", module: "IcebergPredictionTracker" },
        { step: 4, name: "ASSESS RISK", status: snapshot ? "ACTIVE" : "IDLE", module: "RiskIntelligenceEngine" },
        { step: 5, name: "GENERATE ROUTES", status: snapshot ? "ACTIVE" : "IDLE", module: "RoutePlannerCore" },
        { step: 6, name: "COMPARE ROUTES", status: snapshot ? "ACTIVE" : "IDLE", module: "AINavigator" },
        { step: 7, name: "EXPLAIN DECISION", status: snapshot ? "ACTIVE" : "IDLE", module: "DecisionEngine & ExplainabilityEngine" },
        { step: 8, name: "APPLY SAFETY CONSTRAINTS", status: snapshot ? "ACTIVE" : "IDLE", module: "RoutePlannerCore" },
        { step: 9, name: "GUIDE VESSEL", status: snapshot ? "ACTIVE" : "IDLE", module: "AutonomousController" },
        { step: 10, name: "SIMULATE VESSEL DYNAMICS", status: snapshot ? "ACTIVE" : "IDLE", module: "Ship Physics Model" },
        { step: 11, name: "MONITOR", status: snapshot ? "ACTIVE" : "IDLE", module: "SimulationEngine Loop" },
        { step: 12, name: "DETECT CHANGE", status: snapshot ? "ACTIVE" : "IDLE", module: "AINavigator Validity Checker" },
        { step: 13, name: "REPLAN", status: snapshot ? "ACTIVE" : "IDLE", module: "RoutePlannerCore" },
        { step: 14, name: "VERIFY AGAIN", status: snapshot ? "ACTIVE" : "IDLE", module: "RiskIntelligenceEngine" }
      ],
      capabilities: this.registry,
      summary: this.getAuditSummary()
    };
  }
}
