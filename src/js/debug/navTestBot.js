/**
 * POLARIS Nav-OS — Navigation Test Bot (Phase 6: Episode Lifecycle, Scenarios & Dataset v2)
 *
 * Implements automated episode execution, 10 Hz telemetry sampling, discrete event logging,
 * metrics calculation, bounded memory buffer, and Dataset Engine v2 JSONL export.
 * Preserves 100% backward compatibility with Phase 3/4 legacy schema fields.
 */

import { ScenarioGenerator, SCENARIO_CLASSES, ROUTE_MODES } from './navTestScenarios.js';
import { EpisodeRunner } from '../dataset/episodeRunner.js';
import { DatasetExporter } from '../dataset/datasetExporter.js';
import { TerminationReason, EventLabel } from '../dataset/datasetSchema.js';

export const MAX_EPISODE_BUFFER = 10;
export const MAX_SIM_HOURS_PER_EPISODE = 2.0;

export class NavTestBot {
  constructor(ship, icebergs, aiNavigator, state, flightRecorder, options = {}) {
    let opts = {};
    if (typeof ship === 'object' && ship !== null && ship.ship) {
      opts = ship;
      this.ship = opts.ship;
      this.icebergs = opts.icebergs;
      this.aiNavigator = opts.aiNavigator;
      this.state = opts.state;
      this.flightRecorder = opts.flightRecorder;
      this.engine = opts;
    } else {
      this.ship = ship;
      this.icebergs = icebergs;
      this.aiNavigator = aiNavigator;
      this.state = state;
      this.flightRecorder = flightRecorder;
      this.engine = (ship && typeof ship.calculateRoute === 'function') ? ship : { ship, icebergs, aiNavigator, state, flightRecorder };
    }

    const baseDir = opts.baseDir || options.baseDir || 'datasets/v2';
    this.enabled = false;
    this.statusElement = null;
    this.scenarioGenerator = new ScenarioGenerator();
    this.episodeRunner = new EpisodeRunner({ baseDir });
    this.datasetExporter = new DatasetExporter(baseDir);

    // Lifecycle state
    this.stateMode = 'IDLE'; // 'IDLE', 'RUNNING', 'COMPLETED'
    this.currentSeed = 1001;
    this.currentScenarioIndex = 0;
    this.currentEpisode = null;
    this.completedEpisodes = [];
    this.directoryHandle = null;

    // Fixed-Round Auto-Stop Configuration & Session Counter
    this.targetEpisodeCount = null; // null = unlimited
    this.sessionEpisodeCount = 0;   // lifetime episode count for active session

    // Monitored state transitions
    this._prevEmergencyAvoidance = false;
    this._prevActiveRouteId = null;
    this._lastNearMissLog = 0;

    this.setupKeyboardShortcuts();
    this.createStatusElement();
  }

  setTargetEpisodeCount(count) {
    if (count === null || count === undefined || count === '' || isNaN(count)) {
      this.targetEpisodeCount = null;
    } else {
      const val = parseInt(count, 10);
      this.targetEpisodeCount = val > 0 ? val : null;
    }
    this.updateStatusUI();
  }

  setupKeyboardShortcuts() {
    if (typeof window === 'undefined') return;
    if (window._polarisNavBotShiftF6Bound) return;
    window._polarisNavBotShiftF6Bound = true;

    window.addEventListener('keydown', async (e) => {
      if (e.key === 'F6' && e.shiftKey) {
        e.preventDefault();
        await this.toggle();
      }
    });
  }

  async requestExportDirectory() {
    if (typeof window === 'undefined' || typeof window.showDirectoryPicker !== 'function') {
      console.info('[NavTestBot] File System Access API (showDirectoryPicker) not supported in this environment.');
      return null;
    }
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      this.directoryHandle = handle;
      console.log(`[NavTestBot] Target export directory set to: ${handle.name}`);
      this.updateStatusUI();
      return handle;
    } catch (e) {
      if (e.name !== 'AbortError') {
        console.warn('[NavTestBot] Directory picker failed or rejected:', e);
      }
      return null;
    }
  }

  async toggle(engineRef = null) {
    const targetEngine = engineRef || this.engine;

    // Handle completed training state: second Shift+F6 flushes & exports dataset
    if (this.stateMode === 'COMPLETE') {
      try {
        if (this.completedEpisodes.length > 0) {
          await this.exportBatchJSON();
        }
      } catch (err) {
        console.error('[NavTestBot] Failed to export dataset on Shift+F6:', err);
        if (this.statusElement) {
          this.statusElement.innerHTML = `<span style="color: #f43f5e; font-weight: bold;">EXPORT ERROR — TELEMETRY PRESERVED IN MEMORY</span>`;
        }
        return;
      }
      this.enabled = false;
      this.stateMode = 'IDLE';
      this.updateStatusUI();
      return;
    }

    this.enabled = !this.enabled;
    console.log(`[NavTestBot] Status changed -> ${this.enabled ? 'ENABLED' : 'DISABLED'}`);

    if (this.enabled) {
      this.sessionEpisodeCount = 0; // Reset session episode counter on enable
      this.stateMode = 'RUNNING';
      if (typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function' && !this.directoryHandle) {
        await this.requestExportDirectory().catch(() => {});
      }
      if (targetEngine) {
        if (targetEngine.state && targetEngine.state.simulation) {
          targetEngine.state.simulation.isPaused = false;
        }
        this.startNextEpisode(targetEngine);
      }
    } else {
      if (this.stateMode === 'RUNNING' && this.currentEpisode && targetEngine) {
        this.endEpisode(TerminationReason.MANUAL_STOP, targetEngine);
      }
      if (this.completedEpisodes.length > 0) {
        await this.exportBatchJSON();
      }
      this.stateMode = 'IDLE';
    }
    this.updateStatusUI();
  }

  createStatusElement() {
    if (typeof document === 'undefined') return;
    if (document.getElementById('nav-test-bot-status')) return;

    const div = document.createElement('div');
    div.id = 'nav-test-bot-status';
    div.style.position = 'fixed';
    div.style.top = '12px';
    div.style.right = '12px';
    div.style.backgroundColor = 'rgba(6, 14, 32, 0.92)';
    div.style.border = '1px solid #3f494a';
    div.style.borderRadius = '6px';
    div.style.padding = '6px 12px';
    div.style.color = '#e2e8f0';
    div.style.fontFamily = '"JetBrains Mono", monospace';
    div.style.fontSize = '11px';
    div.style.fontWeight = 'bold';
    div.style.zIndex = '9999';
    div.style.display = 'none';
    div.style.pointerEvents = 'auto';
    div.style.cursor = 'pointer';
    div.style.boxShadow = '0 4px 16px rgba(0,0,0,0.5)';

    div.addEventListener('click', () => {
      if (typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function') {
        this.requestExportDirectory().catch(() => {});
      }
    });

    document.body.appendChild(div);
    this.statusElement = div;
    this.updateStatusUI();
  }

  updateStatusUI() {
    if (!this.statusElement) return;
    const isComplete = this.stateMode === 'COMPLETE';
    this.statusElement.style.display = (this.enabled || isComplete) ? 'block' : 'none';

    const ep = this.currentEpisode;
    const activeShip = this.engine?.ship || this.ship;
    const activeState = this.engine?.state || this.state;

    if (isComplete) {
      const statusText = '<span style="color: #38bdf8; font-weight: bold;">COMPLETE: TRAINING DATA READY — PRESS SHIFT+F6 TO EXPORT</span>';
      const targetStr = this.targetEpisodeCount ? `/${this.targetEpisodeCount}` : '';
      const epCountText = ` (${this.sessionEpisodeCount}${targetStr} episodes)`;
      const dirText = this.directoryHandle ? ` <span style="color: #38bdf8;" title="Exported to ${this.directoryHandle.name}">[DIR: ${this.directoryHandle.name}]</span>` : '';
      this.statusElement.innerHTML = `${statusText}${epCountText}${dirText}`;
      return;
    }

    const statusText = this.enabled ? '<span style="color: #22c55e;">ON</span>' : '<span style="color: #94a3b8;">OFF</span>';
    const targetStr = this.targetEpisodeCount ? `/${this.targetEpisodeCount}` : '';
    const seed = ep ? ep.seed : this.currentSeed;
    const scenario = ep ? ep.scenarioClass : 'NONE';
    const simTime = activeState?.simulation?.simTimeHours ? (activeState.simulation.simTimeHours * 3600).toFixed(1) : '0.0';
    const samples = ep ? ep.telemetry.length : 0;
    const hazards = ep ? (ep.iceberg_config?.count || 0) : 0;
    const replans = this.engine?.aiNavigator?.plannerCalls || 0;

    this.statusElement.innerHTML = `BOT: ${statusText} | EP: ${this.sessionEpisodeCount}${targetStr} | SEED: ${seed} | SCENARIO: ${scenario} | TIME: ${simTime}s | SAMPLES: ${samples} | HAZARDS: ${hazards} | REPLANS: ${replans}`;
  }

  startNextEpisode(engine) {
    if (!engine) return;
    this.engine = engine;

    const k = this.sessionEpisodeCount;
    const classIndex = k % SCENARIO_CLASSES.length;
    const passIndex = Math.floor(k / SCENARIO_CLASSES.length);
    const modeIndex = (classIndex + passIndex) % ROUTE_MODES.length;

    const scenarioClass = SCENARIO_CLASSES[classIndex];
    const routeMode = ROUTE_MODES[modeIndex];

    this.startEpisode(engine, this.currentSeed, scenarioClass, routeMode);

    this.currentSeed += 1;
    this.currentScenarioIndex = (k + 1) % SCENARIO_CLASSES.length;
  }

  startEpisode(engine, seed, scenarioClass, routeMode = 'BALANCED') {
    const scenario = this.scenarioGenerator.generateScenario(seed, scenarioClass);

    // Reset Monitored state transition flags for episode isolation
    this._prevEmergencyAvoidance = false;
    this._prevActiveRouteId = null;
    this._lastNearMissLog = 0;

    // Set active route mode on engine navigation state
    if (!engine.state) engine.state = {};
    if (!engine.state.navigation) engine.state.navigation = {};
    engine.state.navigation.mode = routeMode;

    // Reset Engine State using EpisodeRunner canonical reset
    this.episodeRunner.resetState(engine, scenario, seed, { routeMode });

    if (typeof engine.calculateRoute === 'function') {
      engine.calculateRoute();
    }

    const activeShip = engine.ship || this.ship;
    const activeState = engine.state || this.state;
    const initialSimTime = activeState.simulation.simTimeHours || 0;

    this.currentEpisode = {
      schema_version: "2.0",
      dataset_schema_version: "1.0", // Backward compatibility for Phase 3/4 tests
      episodeId: `ep_${seed}_${Date.now()}`,
      episode_id: `ep_${seed}_${Date.now()}`,
      seed,
      scenarioClass,
      scenario_class: scenarioClass,
      routeMode,
      route_mode: routeMode,
      event_label: EventLabel.SUCCESS,
      started_at: new Date().toISOString(),
      simStartHours: initialSimTime,
      lastSampleSimTimeHours: -1,
      initialState: {
        ship: { x: activeShip.x, y: activeShip.y, heading: activeShip.heading },
        destination: { x: scenario.destination.x, y: scenario.destination.y },
        icebergCount: scenario.icebergs.length,
        routeMode
      },
      start_state: {
        x: activeShip.x,
        y: activeShip.y,
        heading: activeShip.heading,
        speed: activeShip.speed || 12.0
      },
      destination: {
        x: scenario.destination.x,
        y: scenario.destination.y,
        tolerance: 15.0
      },
      environment_config: {
        current_x: engine.vectorField?.getVelocityAt ? engine.vectorField.getVelocityAt(activeShip.x, activeShip.y).u : 0,
        current_y: engine.vectorField?.getVelocityAt ? engine.vectorField.getVelocityAt(activeShip.x, activeShip.y).v : 0,
        wind_x: 0,
        wind_y: 0
      },
      ship_config: {
        collisionRadius: activeShip.collisionRadius || 15,
        maxSpeed: 20.0
      },
      iceberg_config: {
        count: scenario.icebergs.length
      },
      route_events: [],
      collision_events: [],
      near_miss_events: [],
      events: [],
      telemetry: [],
      metrics: null,
      termination_reason: null,
      data_quality: { valid: true, errors: [], warnings: [] },
      result: null
    };

    this.stateMode = 'RUNNING';
    this.logEvent('EPISODE_START', { seed, scenarioClass, routeMode });

    this.updateStatusUI();
  }

  resetEpisode(engine) {
    if (!engine) return;
    const defaultScenario = {
      start: { x: 400, y: 1800, heading: 330 },
      destination: { x: 3000, y: 600 },
      icebergs: []
    };
    this.episodeRunner.resetState(engine, defaultScenario, 1001);
    this.currentEpisode = null;
    this.stateMode = 'IDLE';
  }

  logEvent(type, details = {}) {
    if (!this.currentEpisode) return;
    const eventObj = {
      timestamp_ms: Date.now(),
      type,
      details
    };
    this.currentEpisode.events.push(eventObj);

    if (type.startsWith('ROUTE_') || type === 'REPLAN_DECISION') {
      this.currentEpisode.route_events.push(eventObj);
    }
  }

  evaluateFrame(engine, snapshot = null) {
    if (engine) this.engine = engine;
    if (!this.enabled || this.stateMode !== 'RUNNING' || !this.currentEpisode) return;

    const activeShip = engine.ship || this.ship;
    const activeState = engine.state || this.state;
    const activeNav = engine.aiNavigator || this.aiNavigator;
    const currentSimHours = activeState.simulation.simTimeHours || 0;

    // 10 Hz Telemetry Sampling Gate
    const samplingIntervalHours = 1 / 36000;
    if (snapshot) {
      const formattedSnapshot = {
        ...snapshot,
        ship: {
          x: snapshot.ship?.x ?? activeShip.x ?? 0,
          y: snapshot.ship?.y ?? activeShip.y ?? 0,
          heading: snapshot.ship?.heading ?? activeShip.heading ?? 0,
          speed: snapshot.ship?.speed ?? activeShip.speed ?? 12,
          ...(typeof snapshot.ship === 'object' ? snapshot.ship : {})
        }
      };

      if (this.currentEpisode.lastSampleSimTimeHours < 0) {
        this.currentEpisode.telemetry.push(formattedSnapshot);
        this.currentEpisode.lastSampleSimTimeHours = currentSimHours;
      } else {
        while (currentSimHours - this.currentEpisode.lastSampleSimTimeHours >= samplingIntervalHours - 1e-12) {
          this.currentEpisode.lastSampleSimTimeHours += samplingIntervalHours;
          this.currentEpisode.telemetry.push({
            ...formattedSnapshot,
            simulation_time: this.currentEpisode.lastSampleSimTimeHours
          });
        }
      }
    }


    // Monitor Near Miss Events
    if (snapshot && snapshot.icebergs) {
      for (let ice of snapshot.icebergs) {
        const centerDist = Math.hypot(activeShip.x - ice.x, activeShip.y - ice.y);
        const physClearance = centerDist - (activeShip.collisionRadius || 15) - (ice.collisionRadius || 20);

        if (physClearance < 30 && physClearance > 0) {
          if (this.currentEpisode.event_label !== EventLabel.COLLISION) {
            this.currentEpisode.event_label = EventLabel.NEAR_MISS;
          }
          const nearMissObj = {
            simulation_time: currentSimHours,
            ship_position: { x: activeShip.x, y: activeShip.y },
            iceberg_id: ice.id,
            iceberg_position: { x: ice.x, y: ice.y },
            physical_clearance: parseFloat(physClearance.toFixed(2))
          };
          if (!this._lastNearMissLog || Date.now() - this._lastNearMissLog > 2000) {
            this.currentEpisode.near_miss_events.push(nearMissObj);
            this._lastNearMissLog = Date.now();
          }
        }
      }
    }

    // Monitored Event Transitions
    if (activeShip._inEmergencyAvoidance && !this._prevEmergencyAvoidance) {
      this.logEvent('EMERGENCY_AVOIDANCE', { heading: activeShip.heading });
    }
    this._prevEmergencyAvoidance = !!activeShip._inEmergencyAvoidance;

    const activeRouteId = activeState.navigation.activeRoute?.id;
    if (activeRouteId && activeRouteId !== this._prevActiveRouteId) {
      const reason = activeNav?.lastReplanReason || 'REPLAN';
      this.logEvent('ROUTE_GENERATED', { routeId: activeRouteId, reason });
      this._prevActiveRouteId = activeRouteId;
    }

    // Check Completion & Failure Conditions
    const dest = activeState.navigation.destinationPoint || { x: 3000, y: 600 };
    const distToDest = Math.hypot(activeShip.x - dest.x, activeShip.y - dest.y);

    // 1. SUCCESS Condition
    if (distToDest < 15 || activeShip.autopilotStatus === 'ARRIVED') {
      this.logEvent('DESTINATION_REACHED', { distToDest });
      this.endEpisode(TerminationReason.DESTINATION_REACHED, engine);
      return;
    }

    // 2. COLLISION Condition
    if (activeShip.lastCollisionEvent && activeShip.lastCollisionEvent.collisionDetected) {
      const colEvt = {
        simulation_time: currentSimHours,
        ship_position: { x: activeShip.x, y: activeShip.y },
        iceberg_id: activeShip.lastCollisionEvent.icebergId,
        distance: activeShip.lastCollisionEvent.distanceAtCollision,
        relativeVelocity: activeShip.lastCollisionEvent.relativeVelocity
      };
      this.currentEpisode.collision_events.push(colEvt);
      this.logEvent('COLLISION', colEvt);
      this.endEpisode(TerminationReason.COLLISION, engine);
      return;
    }

    // 3. TIMEOUT Condition (2.0 sim hours)
    const elapsedSimHours = currentSimHours - this.currentEpisode.simStartHours;
    if (elapsedSimHours >= MAX_SIM_HOURS_PER_EPISODE) {
      this.logEvent('TIMEOUT', { elapsedSimHours });
      this.endEpisode(TerminationReason.TIMEOUT, engine);
      return;
    }
  }

  endEpisode(terminationReason, engine) {
    if (!this.currentEpisode) return;

    const activeShip = engine.ship || this.ship;
    const activeState = engine.state || this.state;
    const telemetry = this.currentEpisode.telemetry;

    if (telemetry && telemetry.length > 0) {
      telemetry[telemetry.length - 1].terminal_sample = true;
    }

    this.currentEpisode.termination_reason = terminationReason;
    if (terminationReason === TerminationReason.COLLISION) {
      this.currentEpisode.event_label = EventLabel.COLLISION;
    } else if (terminationReason === TerminationReason.DESTINATION_REACHED && this.currentEpisode.event_label !== EventLabel.NEAR_MISS) {
      this.currentEpisode.event_label = EventLabel.SUCCESS;
    } else if (terminationReason === TerminationReason.MANUAL_STOP) {
      if (this.currentEpisode.event_label !== EventLabel.NEAR_MISS && this.currentEpisode.event_label !== EventLabel.COLLISION) {
        this.currentEpisode.event_label = EventLabel.SUCCESS;
      }
    }

    // Extract Pre-Collision Training Window
    if (terminationReason === TerminationReason.COLLISION) {
      const windowCount = Math.min(300, telemetry.length);
      this.currentEpisode.pre_collision_window = telemetry.slice(telemetry.length - windowCount).map((s, idx, arr) => ({
        t_offset_seconds: parseFloat(((idx - (arr.length - 1)) * 0.1).toFixed(1)),
        sim_time: s.simulation_time,
        ship: s.ship,
        nearest_iceberg: s.nearest_iceberg
      }));
    }

    const nav = engine.aiNavigator || this.aiNavigator || {};
    const endSimHours = activeState.simulation.simTimeHours || 0;
    const totalSimHours = Math.max(0.0001, endSimHours - this.currentEpisode.simStartHours);

    this.currentEpisode.simulation_duration_hours = parseFloat(totalSimHours.toFixed(4));
    this.currentEpisode.simulation_duration_seconds = parseFloat((totalSimHours * 3600).toFixed(2));

    const routeChanges = this.currentEpisode.route_events.filter(e => e.type === 'ROUTE_GENERATED').length;
    const totalSimMinutes = totalSimHours * 60;
    const routeChangesPerMin = routeChanges / Math.max(0.1, totalSimMinutes);
    const routeFlappingScore = parseFloat(routeChangesPerMin.toFixed(2));
    let calculatedMinClearance = Infinity;
    if (telemetry && telemetry.length > 0) {
      for (const sample of telemetry) {
        if (sample.nearest_iceberg && typeof sample.nearest_iceberg.physical_clearance === 'number') {
          if (sample.nearest_iceberg.physical_clearance < calculatedMinClearance) {
            calculatedMinClearance = sample.nearest_iceberg.physical_clearance;
          }
        }
      }
    }
    if (calculatedMinClearance === Infinity) {
      if (this.currentEpisode.collision_events && this.currentEpisode.collision_events.length > 0) {
        const colDist = this.currentEpisode.collision_events[0].distance;
        calculatedMinClearance = typeof colDist === 'number' ? colDist : 0;
      } else {
        calculatedMinClearance = 9999;
      }
    }
    const finalMinClearance = parseFloat(calculatedMinClearance.toFixed(2));

    this.currentEpisode.metrics = {
      routeMode: this.currentEpisode.routeMode || 'BALANCED',
      route_mode: this.currentEpisode.route_mode || 'BALANCED',
      maxXte: 0,
      minIcebergClearance: finalMinClearance,
      minPhysicalClearance: finalMinClearance,
      avgSpeed: activeShip.speed || 12.0,
      headingChanges: 0,
      initialDistance: 2600,
      routeChanges,
      routeChangesPerMinute: routeChangesPerMin,
      routeFlappingScore: routeFlappingScore,

      plannerCalls: nav.plannerCalls || 0,
      routeGenerationAttempts: nav.routeGenerationAttempts || nav.plannerCalls || 0,
      routeAdoptions: nav.routeAdoptions || nav.routeVersion || 1,
      routeRejections: nav.routeRejections || 0,
      routeInvalidations: nav.routeInvalidations || 0,
      emergencyEntries: nav.emergencyEntries || 0,
      emergencyExits: nav.emergencyExits || 0,
      temporalRiskEntries: nav.temporalRiskEntries || 0,
      temporalRiskExits: nav.temporalRiskExits || 0,
      destinationReached: terminationReason === TerminationReason.DESTINATION_REACHED,
      collision: terminationReason === TerminationReason.COLLISION
    };

    // Standard status code mapping for Phase 3/4 legacy tests: 'SUCCESS', 'COLLISION', 'TIMEOUT', etc.
    const legacyStatus = terminationReason === TerminationReason.DESTINATION_REACHED ? 'SUCCESS' : terminationReason;

    this.currentEpisode.result = {
      status: legacyStatus,
      collision: terminationReason === TerminationReason.COLLISION,
      destinationReached: terminationReason === TerminationReason.DESTINATION_REACHED,
      elapsedSimHours: totalSimHours,
      metrics: this.currentEpisode.metrics,
      failureForensics: terminationReason === TerminationReason.COLLISION ? activeShip.lastCollisionEvent : null
    };

    this.currentEpisode.data_quality = {
      valid: true,
      errors: [],
      warnings: []
    };

    this.stateMode = 'COMPLETED';
    this.completedEpisodes.push(this.currentEpisode);
    this.sessionEpisodeCount += 1;

    // Export single episode JSONL
    try {
      const res = this.datasetExporter.exportEpisodeJSONL(this.currentEpisode);
      if (this.directoryHandle && res && res.content) {
        const filename = `${this.currentEpisode.episode_id}.jsonl`;
        this.datasetExporter.exportFileWithDirectoryHandle(this.directoryHandle, filename, res.content).catch(() => {});
      }
    } catch (e) {
      console.error("[NavTestBot] Failed to export episode JSONL:", e);
    }

    console.log(`[NavTestBot] Episode ${this.currentEpisode.episode_id} finished -> ${terminationReason}`);

    // Bounded Memory Buffer check (Phase 3 compatibility: export batch and reset buffer if >= 10)
    if (this.completedEpisodes.length >= MAX_EPISODE_BUFFER) {
      this.exportBatchJSON();
    }

    // Fixed-Round Auto-Stop Gate
    const isTargetReached = (this.targetEpisodeCount !== null && this.sessionEpisodeCount >= this.targetEpisodeCount);

    if (isTargetReached) {
      this.enabled = false;
      this.stateMode = 'COMPLETE';
      if (this.completedEpisodes.length > 0) {
        this.exportBatchJSON();
      }
      console.log(`[NavTestBot] Target episode count reached (${this.sessionEpisodeCount}/${this.targetEpisodeCount}). Auto-stop complete.`);
      this.updateStatusUI();
    } else if (this.enabled) {
      this.startNextEpisode(engine);
    } else {
      this.stateMode = 'IDLE';
      this.updateStatusUI();
    }
  }

  async exportBatchJSON() {
    if (this.completedEpisodes.length === 0) return;
    const manifest = this.datasetExporter.getManifest();
    console.log(`[NavTestBot] Manifest updated. Total episodes: ${manifest?.episode_count}`);
    const filename = `nav_test_bot_batch_${Date.now()}.json`;
    const contentStr = JSON.stringify(this.completedEpisodes, null, 2);

    let directWriteSuccess = false;
    if (this.directoryHandle && typeof this.datasetExporter.exportFileWithDirectoryHandle === 'function') {
      const res = await this.datasetExporter.exportFileWithDirectoryHandle(this.directoryHandle, filename, contentStr);
      directWriteSuccess = res.success;
      if (directWriteSuccess) {
        console.log(`[NavTestBot] Batch exported directly to directory handle: ${filename}`);
        const manifestStr = JSON.stringify(manifest, null, 2);
        await this.datasetExporter.exportFileWithDirectoryHandle(this.directoryHandle, 'manifest.json', manifestStr).catch(() => {});
      }
    }

    if (!directWriteSuccess) {
      this.triggerDownload(contentStr, filename);
    }

    this.completedEpisodes = []; // Clear in-memory buffer
    this.updateStatusUI();
  }

  exportSingleEpisodeJSON(episodeObj) {
    const dataStr = JSON.stringify(episodeObj || this.currentEpisode, null, 2);
    this.triggerDownload(dataStr, `nav_test_bot_episode_${Date.now()}.json`);
  }

  triggerDownload(contentStr, filename) {
    this.lastDownload = { contentStr, filename, timestamp: Date.now() };
    if (typeof this.onDownload === 'function') {
      this.onDownload(contentStr, filename);
    }
    if (typeof document === 'undefined') return;
    const blob = new Blob([contentStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}
