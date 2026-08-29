/**
 * POLARIS DIGITAL TWIN - User Interface & Event Controller
 */

import { PlanningMode } from '../render/canvasRenderer.js';

export class UIController {
  constructor(simulationEngine) {
    this.engine = simulationEngine;
    this.bindElements();
    this.attachEventListeners();
    this.initCollapsibleDraggablePanels();
  }

  bindElements() {
    // Drawer Toggles
    this.envDrawer = document.getElementById('env-drawer');
    this.toggleEnvDrawerBtn = document.getElementById('toggle-env-drawer');
    this.closeEnvDrawerBtn = document.getElementById('close-env-drawer');

    // Controls & Toggles
    this.recalibrateBtn = document.getElementById('recalibrate-btn');

    // Time Controls
    this.simClockVal = document.getElementById('sim-clock-val');
    this.playPauseBtn = document.getElementById('play-pause-btn');
    this.playPauseIcon = document.getElementById('play-pause-icon');
    this.timeWarp1x = document.getElementById('timewarp-1x');
    this.timeWarp10x = document.getElementById('timewarp-10x');
    this.timeWarp100x = document.getElementById('timewarp-100x');

    // Context Panel
    this.contextPanel = document.getElementById('context-panel');
    this.contextTitle = document.getElementById('context-title');
    this.contextName = document.getElementById('context-name');
    this.contextIcon = document.getElementById('context-icon');
    this.contextContent = document.getElementById('context-content');
    this.closeContextBtn = document.getElementById('close-context-btn');

    // Add Iceberg controls
    this.addIcebergBtn = document.getElementById('add-iceberg-btn');

    // Navigation controls
    this.navPanel = document.getElementById('nav-panel');
    this.navStatus = document.getElementById('nav-status');
    this.setStartBtn = document.getElementById('set-start-btn');
    this.setDestBtn = document.getElementById('set-dest-btn');
    this.calcRouteBtn = document.getElementById('calc-route-btn');
    this.clearRouteBtn = document.getElementById('clear-route-btn');
    this.placeVesselBtn = document.getElementById('place-vessel-btn');
    this.startNavBtn = document.getElementById('start-nav-btn');
    this.followShipBtn = document.getElementById('follow-ship-btn');
    this.centerShipBtn = document.getElementById('center-ship-btn');
    this.zoomIndicator = document.getElementById('zoom-indicator');
    this.startStatus = document.getElementById('start-status');
    this.destStatus = document.getElementById('dest-status');
  }

  attachEventListeners() {
    // Drawer Logic
    if (this.toggleEnvDrawerBtn && this.envDrawer) {
      this.toggleEnvDrawerBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.envDrawer.classList.toggle('-translate-x-full');
      });
    }
    if (this.closeEnvDrawerBtn && this.envDrawer) {
      this.closeEnvDrawerBtn.addEventListener('click', () => {
        this.envDrawer.classList.add('-translate-x-full');
      });
    }

    // Stop propagation inside drawer to prevent accidental closes
    if (this.envDrawer) {
        this.envDrawer.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }

    // Connect New Sliders to Central State
    const state = this.engine.state;
    
    // Helper to bind input to state
    const bindInput = (id, pathObj, key, isCheckbox = false, isFloat = true) => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', (e) => {
                pathObj[key] = isCheckbox ? e.target.checked : (isFloat ? parseFloat(e.target.value) : e.target.value);
                if (key === 'mode') state.navigation.routeInvalid = true; // force reroute if mode changes
            });
        }
    };

    if (state) {
        bindInput('ctrl-ocean-speed', state.environment.ocean, 'currentSpeed');
        bindInput('ctrl-ocean-direction', state.environment.ocean, 'currentDirection');
        bindInput('ctrl-ocean-turb', state.environment.ocean, 'turbulence', false, true);
        bindInput('ctrl-wind-enable', state.environment.wind, 'enabled', true);
        bindInput('ctrl-wind-speed', state.environment.wind, 'speed');
        bindInput('ctrl-wind-direction', state.environment.wind, 'direction');
        bindInput('ctrl-ice-enable', state.environment.seaIce, 'enabled', true);
        bindInput('ctrl-ice-conc', state.environment.seaIce, 'averageConcentration', false, true);
        
        // Custom ship sliders
        const engPowerSlider = document.getElementById('ctrl-vessel-engine-power');
        if (engPowerSlider) {
            engPowerSlider.addEventListener('input', (e) => {
                state.vessel.enginePower = parseFloat(e.target.value) / 100;
            });
        }

        bindInput('ctrl-vessel-max-speed', state.vessel, 'maxSpeed');
        bindInput('ctrl-vessel-autopilot-throttle', state.vessel, 'autopilotThrottle');
        
        // Fix scaling for slider (0-100 to 0-1)
        const iceConcSlider = document.getElementById('ctrl-ice-conc');
        if (iceConcSlider) {
            iceConcSlider.addEventListener('input', (e) => {
                state.environment.seaIce.averageConcentration = parseFloat(e.target.value) / 100;
                state.navigation.routeInvalid = true; // Force A* recalculation on ice change
            });
        }

        bindInput('ctrl-ib-enable', state.icebergs, 'enabled', true);
        
        const ibDriftSlider = document.getElementById('ctrl-ib-drift');
        if (ibDriftSlider) {
            ibDriftSlider.addEventListener('input', (e) => {
                state.icebergs.driftStrength = parseFloat(e.target.value) / 100;
            });
        }

        bindInput('ctrl-vessel-auto', state.vessel, 'autopilot', true);
        bindInput('ctrl-vessel-throttle', state.vessel, 'throttle');
        bindInput('ctrl-vessel-rudder', state.vessel, 'rudder');
        
        const navMode = document.getElementById('ctrl-nav-mode');
        if (navMode) {
            navMode.addEventListener('change', (e) => {
                state.navigation.mode = e.target.value;
                state.navigation.routeInvalid = true;
            });
        }

        // Presets
        document.querySelectorAll('.preset-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const p = e.target.dataset.preset;
                if (p === 'STORM') {
                    state.environment.wind.speed = 120;
                    state.environment.ocean.currentSpeed = 35;
                    state.environment.ocean.turbulence = 0.8;
                } else if (p === 'CALM') {
                    state.environment.wind.speed = 10;
                    state.environment.ocean.currentSpeed = 5;
                    state.environment.ocean.turbulence = 0.1;
                } else if (p === 'ICE_FIELD') {
                    state.environment.seaIce.enabled = true;
                    state.environment.seaIce.averageConcentration = 0.8;
                    state.icebergs.driftStrength = 2.0;
                }
                this.updateSlidersFromState();
            });
        });
    }

    // Re-calibrate Button
    if (this.recalibrateBtn) {
      this.recalibrateBtn.addEventListener('click', () => {
        this.engine.resetToDefaults();
        this.updateSlidersFromState();
      });
    }

    // Time Play / Pause
    if (this.playPauseBtn) {
      this.playPauseBtn.addEventListener('click', () => {
        this.engine.state.simulation.isPaused = !this.engine.state.simulation.isPaused;
        if (this.playPauseIcon) {
          this.playPauseIcon.textContent = this.engine.state.simulation.isPaused ? 'play_arrow' : 'pause';
        }
      });
    }

    // Time Warp Buttons
    const warpBtns = [
      { btn: this.timeWarp1x, speed: 1 },
      { btn: this.timeWarp10x, speed: 10 },
      { btn: this.timeWarp100x, speed: 100 }
    ];

    warpBtns.forEach(({ btn, speed }) => {
      if (btn) {
        btn.addEventListener('click', () => {
          warpBtns.forEach(b => b.btn && b.btn.classList.remove('bg-outline/30', 'text-secondary'));
          btn.classList.add('bg-outline/30', 'text-secondary');
          this.engine.state.simulation.timeWarp = speed;
        });
      }
    });

    // Add Iceberg
    if (this.addIcebergBtn) {
      this.addIcebergBtn.addEventListener('click', () => {
        this.engine.renderer.addIcebergMode = true;
        this.engine.renderer.pendingIcebergCfg = { mass: 8.0, size: 1000 };
        this.engine.renderer.onPlaceIceberg = (wx, wy) => {
          this.engine.spawnIcebergAt(wx, wy, 8.0, 1000);
        };
      });
    }

    // Context Panel Close
    if (this.closeContextBtn) {
        this.closeContextBtn.addEventListener('click', () => {
            this.hideContextPanel();
            this.engine.renderer.selectedEntity = null;
        });
    }

    // Canvas click delegation for Context Panel
    if (this.engine.renderer.canvas) {
        this.engine.renderer.canvas.addEventListener('click', () => {
            const entity = this.engine.renderer.selectedEntity;
            if (entity) {
                this.showContextPanel(entity);
            }
        });
    }

    // ── Navigation Panel ──────────────────────────────────────────────
    if (this.setStartBtn) {
      this.setStartBtn.addEventListener('click', () => {
        this.engine.setPlanningMode(PlanningMode.SET_START);
        this.updateNavButtons();
      });
    }
    if (this.setDestBtn) {
      this.setDestBtn.addEventListener('click', () => {
        this.engine.setPlanningMode(PlanningMode.SET_DESTINATION);
        this.updateNavButtons();
      });
    }
    if (this.calcRouteBtn) {
      this.calcRouteBtn.addEventListener('click', () => this.engine.calculateRoute());
    }
    if (this.clearRouteBtn) {
      this.clearRouteBtn.addEventListener('click', () => this.engine.clearRoute());
    }
    if (this.placeVesselBtn) {
      this.placeVesselBtn.addEventListener('click', () => this.engine.placeVesselAtStart());
    }
    if (this.startNavBtn) {
      this.startNavBtn.addEventListener('click', () => this.engine.startNavigation());
    }
    if (this.followShipBtn) {
      this.followShipBtn.addEventListener('click', () => {
        const on = !this.engine.renderer.trackShip;
        this.engine.renderer.setFollowShip(on);
        this.updateNavButtons();
      });
    }
    if (this.centerShipBtn) {
      this.centerShipBtn.addEventListener('click', () => {
        this.engine.renderer.centerOnShip(this.engine.ship);
        this.updateNavButtons();
      });
    }

    const aiExecuteBtn = document.getElementById('ai-execute-btn');
    if (aiExecuteBtn) {
      aiExecuteBtn.addEventListener('click', () => {
        const aiNav = this.engine.aiNavigator;
        if (aiNav && aiNav.aiRecommendation) {
          const rec = aiNav.aiRecommendation;
          state.navigation.mode = rec.recommendedMode;
          state.navigation.routeInvalid = true;
          
          if (rec.status === 'REDUCE SPEED' || rec.status === 'CRITICAL COLLISION RISK') {
            state.vessel.autopilotThrottle = 25; // Safe speed
          } else {
            state.vessel.autopilotThrottle = 65; // Normal speed
          }
          this.engine.calculateRoute();
        }
      });
    }

    const aiAutoToggleBtn = document.getElementById('ai-auto-toggle-btn');
    if (aiAutoToggleBtn) {
      aiAutoToggleBtn.addEventListener('click', () => {
        const autoCtrl = this.engine.autonomousController;
        if (autoCtrl) {
          autoCtrl.toggleActive();
          const active = autoCtrl.isActive;
          aiAutoToggleBtn.innerText = active ? 'ACTIVE' : 'STANDBY';
          aiAutoToggleBtn.className = active 
            ? 'border border-secondary text-secondary bg-secondary/10 px-2 py-0.5 rounded hover:bg-secondary/20 transition-colors font-bold text-[9px]'
            : 'border border-error text-error px-2 py-0.5 rounded hover:bg-error/10 transition-colors font-bold text-[9px]';
        }
      });
    }

    // AI Copilot Button bindings
    const bindCopilotBtn = (id, qType) => {
      const btn = document.getElementById(id);
      if (btn) {
        btn.addEventListener('click', () => {
          if (this.engine.aiClient) {
            this.engine.aiClient.requestCopilotExplanation(qType);
          }
        });
      }
    };
    bindCopilotBtn('copilot-btn-general', 'general');
    bindCopilotBtn('copilot-btn-slowdown', 'slowdown');
    bindCopilotBtn('copilot-btn-reroute', 'reroute');
    bindCopilotBtn('copilot-btn-refresh', 'general');

    this.bindDemoButtons();

    const valToggleBtn = document.getElementById('val-toggle-btn');
    if (valToggleBtn) {
      valToggleBtn.addEventListener('click', () => {
        const valEngine = this.engine.validationEngine;
        if (valEngine) {
          valEngine.validationModeActive = !valEngine.validationModeActive;
          const active = valEngine.validationModeActive;
          valToggleBtn.innerText = active ? '🧠 DISABLE MAP VALIDATION OVERLAYS' : '🧠 ENABLE MAP VALIDATION OVERLAYS';
          valToggleBtn.className = active 
            ? 'w-full border border-secondary text-secondary bg-secondary/10 py-1 rounded hover:bg-secondary/20 transition-colors font-bold text-[9px]'
            : 'w-full border border-outline hover:bg-outline/20 text-on-surface py-1 rounded transition-colors font-bold text-[9px]';
        }
      });
    }

    const valToggleRiskBtn = document.getElementById('val-toggle-risk-btn');
    if (valToggleRiskBtn) {
      valToggleRiskBtn.addEventListener('click', () => {
        const ri = this.engine.riskIntelligenceEngine;
        if (ri) {
          ri.heatmapActive = !ri.heatmapActive;
          const active = ri.heatmapActive;
          valToggleRiskBtn.innerText = active ? '🧠 DISABLE MAP RISK OVERLAYS' : '🧠 ENABLE MAP RISK OVERLAYS';
          valToggleRiskBtn.className = active 
            ? 'w-full border border-secondary text-secondary bg-secondary/10 py-1 rounded hover:bg-secondary/20 transition-colors font-bold text-[9px]'
            : 'w-full border border-outline hover:bg-outline/20 text-on-surface py-1 rounded transition-colors font-bold text-[9px]';
        }
      });
    }

    this.bindMissionPlannerControls();
    this.bindDataModeControls();
    this.bindWhatIfControls();
    this.bindConfidenceControls();
    this.bindDecisionCenterControls();

    this.updateNavStatus();
    this.updateNavButtons();
  }

  updateNavStatus() {
    const nav = this.engine.state.navigation;
    if (this.navStatus) this.navStatus.textContent = nav.statusMessage;
    if (this.startStatus) {
      this.startStatus.textContent = nav.startPoint
        ? `${nav.startPoint.x}, ${nav.startPoint.y}` : 'NOT SET';
      this.startStatus.className = nav.startPoint ? 'text-secondary' : 'text-on-surface-variant';
    }
    if (this.destStatus) {
      this.destStatus.textContent = nav.destinationPoint
        ? `${nav.destinationPoint.x}, ${nav.destinationPoint.y}` : 'NOT SET';
      this.destStatus.className = nav.destinationPoint ? 'text-secondary' : 'text-on-surface-variant';
    }
    if (this.zoomIndicator) {
      this.zoomIndicator.textContent = `${Math.round(this.engine.renderer.zoom * 100)}%`;
    }
  }

  updateNavButtons() {
    const followOn = this.engine.renderer.trackShip;
    if (this.followShipBtn) {
      this.followShipBtn.textContent = followOn ? 'FOLLOW: ON' : 'FOLLOW: OFF';
      this.followShipBtn.classList.toggle('bg-secondary/20', followOn);
      this.followShipBtn.classList.toggle('text-secondary', followOn);
    }
    const mode = this.engine.state.navigation.planningMode;
    if (this.setStartBtn) {
      this.setStartBtn.classList.toggle('ring-1', mode === PlanningMode.SET_START);
      this.setStartBtn.classList.toggle('ring-secondary', mode === PlanningMode.SET_START);
    }
    if (this.setDestBtn) {
      this.setDestBtn.classList.toggle('ring-1', mode === PlanningMode.SET_DESTINATION);
      this.setDestBtn.classList.toggle('ring-secondary', mode === PlanningMode.SET_DESTINATION);
    }
  }

  showContextPanel(entity) {
      if (!this.contextPanel) return;
      this.contextPanel.classList.remove('hidden');

      if (entity.isShip) {
          this.contextIcon.textContent = 'directions_boat';
          this.contextIcon.className = 'material-symbols-outlined mr-2 text-secondary';
          this.contextName.textContent = 'V-ALPHA';
          
          const speed = (entity.velocity ? Math.sqrt(entity.velocity.x**2 + entity.velocity.y**2) : 14.3).toFixed(1);
          
          this.contextContent.innerHTML = `
            <div class="flex justify-between border-b border-outline/50 pb-1">
                <span>SPEED</span> <span class="text-primary">${speed} kts</span>
            </div>
            <div class="flex justify-between border-b border-outline/50 pb-1">
                <span>HEADING</span> <span class="text-primary">${(entity.heading * 180 / Math.PI).toFixed(0)}°</span>
            </div>
            <div class="flex justify-between border-b border-outline/50 pb-1">
                <span>POSITION</span> <span class="text-primary">${entity.x.toFixed(0)}, ${entity.y.toFixed(0)}</span>
            </div>
            <div class="flex justify-between">
                <span>ROUTE STATUS</span> <span class="text-secondary">NOMINAL</span>
            </div>
          `;
      } else {
        // Iceberg
        this.contextIcon.textContent = 'ac_unit';
        this.contextIcon.className = 'material-symbols-outlined mr-2 text-primary';
        this.contextName.textContent = `HAZARD-${String(entity.id).substring(0,4)}`;
        
        const speed = Math.sqrt(entity.vx**2 + entity.vy**2).toFixed(1);
        const radius = entity.radius || Math.max(10, entity.size / 35);
        
        this.contextContent.innerHTML = `
            <div class="flex justify-between border-b border-outline/50 pb-1">
                <span>SIZE</span> <span class="text-primary">${radius.toFixed(0)}m</span>
            </div>
            <div class="flex justify-between border-b border-outline/50 pb-1">
                <span>DRIFT SPEED</span> <span class="text-primary">${speed} kts</span>
            </div>
            <div class="flex justify-between border-b border-outline/50 pb-1">
                <span>RISK RADIUS</span> <span class="text-error">${(radius * 1.5).toFixed(0)}m</span>
            </div>
            <div class="flex justify-between">
                <span>NAV IMPACT</span> <span class="text-error">MODERATE</span>
            </div>
          `;
      }
  }

  hideContextPanel() {
      if (this.contextPanel) {
          this.contextPanel.classList.add('hidden');
      }
  }

  updateSlidersFromState() {
    const state = this.engine.state;
    if (!state) return;
    
    const setVal = (id, val, isCheckbox = false) => {
        const el = document.getElementById(id);
        if (el) {
            if (isCheckbox) el.checked = val;
            else el.value = val;
        }
    };
    
    setVal('ctrl-ocean-speed', state.environment.ocean.currentSpeed);
    setVal('ctrl-ocean-direction', state.environment.ocean.currentDirection);
    setVal('ctrl-ocean-turb', state.environment.ocean.turbulence);
    setVal('ctrl-wind-enable', state.environment.wind.enabled, true);
    setVal('ctrl-wind-speed', state.environment.wind.speed);
    setVal('ctrl-wind-direction', state.environment.wind.direction);
    setVal('ctrl-ice-enable', state.environment.seaIce.enabled, true);
    setVal('ctrl-ice-conc', state.environment.seaIce.averageConcentration * 100);
    setVal('ctrl-ib-enable', state.icebergs.enabled, true);
    setVal('ctrl-ib-drift', state.icebergs.driftStrength * 100);
    setVal('ctrl-vessel-auto', state.vessel.autopilot, true);
    setVal('ctrl-vessel-throttle', state.vessel.throttle);
    setVal('ctrl-vessel-rudder', state.vessel.rudder);
    setVal('ctrl-vessel-engine-power', state.vessel.enginePower * 100);
    setVal('ctrl-vessel-max-speed', state.vessel.maxSpeed);
    setVal('ctrl-vessel-autopilot-throttle', state.vessel.autopilotThrottle);
    setVal('ctrl-nav-mode', state.navigation.mode);
  }

  showRerouteAlert() {
    if (this.rerouteAlertBanner) {
      this.rerouteAlertBanner.classList.remove('hidden');
      this.rerouteAlertBanner.classList.add('top-24');
      setTimeout(() => {
        this.rerouteAlertBanner.classList.add('hidden');
        this.rerouteAlertBanner.classList.remove('top-24');
      }, 4000);
    }
  }

  updateTelemetry(ship, aiNavigator, simTimeHours) {
    ship = ship || this.engine.ship;
    aiNavigator = aiNavigator || this.engine.aiNavigator;
    const state = this.engine.state;
    simTimeHours = simTimeHours !== undefined ? simTimeHours : state.simulation.simTimeHours;
    const client = this.engine.aiClient;

    if (this.simClockVal) {
      const baseTime = new Date('2042-11-04T14:00:00Z').getTime();
      const simMs = baseTime + (simTimeHours * 60 * 60 * 1000);
      const d = new Date(simMs);
      this.simClockVal.innerText = d.toISOString().replace('T', '_').replace('.000', '');
    }

    // Update Telemetry Panel / Sidebar
    const fuelEl = document.getElementById('telemetry-fuel');
    const fuelBarEl = document.getElementById('telemetry-fuel-bar');
    const fuelWarnEl = document.getElementById('telemetry-fuel-warn');
    if (fuelEl && fuelBarEl) {
      fuelEl.innerText = `${ship.fuel.toFixed(1)}%`;
      fuelBarEl.style.width = `${ship.fuel}%`;
      if (ship.fuel < 20) {
        fuelBarEl.className = 'bg-error h-full';
        fuelWarnEl && fuelWarnEl.classList.remove('hidden');
      } else {
        fuelBarEl.className = 'bg-secondary h-full';
        fuelWarnEl && fuelWarnEl.classList.add('hidden');
      }
    }

    const speedEl = document.getElementById('telemetry-speed');
    const desSpeedEl = document.getElementById('telemetry-desired-speed');
    if (speedEl && desSpeedEl) {
      speedEl.innerText = ship.speedKnots.toFixed(1);
      desSpeedEl.innerText = (ship.desiredSpeed / 1.8).toFixed(1);
    }

    const throttleEl = document.getElementById('telemetry-throttle');
    const throttleBarEl = document.getElementById('telemetry-throttle-bar');
    if (throttleEl && throttleBarEl) {
      throttleEl.innerText = `${Math.round(ship.throttle)}%`;
      throttleBarEl.style.width = `${ship.throttle}%`;
    }

    const engineEl = document.getElementById('telemetry-engine');
    if (engineEl) {
      let label = `${Math.round((state.vessel.enginePower || 1.0) * 100)}%`;
      if (ship.extraThrustMultiplier > 1.01) {
        label += ` (OVERLOAD x${ship.extraThrustMultiplier.toFixed(1)})`;
        engineEl.className = 'text-error font-bold';
      } else {
        engineEl.className = 'text-primary';
      }
      engineEl.innerText = label;
    }

    const autoEl = document.getElementById('telemetry-auto');
    if (autoEl) {
      autoEl.innerText = state.vessel.autopilot ? 'ACTIVE' : 'MANUAL';
      autoEl.className = state.vessel.autopilot ? 'text-secondary font-bold' : 'text-on-surface-variant';
    }

    const navModeEl = document.getElementById('telemetry-navmode');
    if (navModeEl) {
      navModeEl.innerText = state.navigation.mode;
    }

    const apStatusEl = document.getElementById('telemetry-ap-status');
    if (apStatusEl) {
      apStatusEl.innerText = state.vessel.autopilotStatus || 'NORMAL_TRACKING';
      if (state.vessel.autopilotStatus === 'FIGHTING_CURRENT' || state.vessel.autopilotStatus === 'ROUTE_RECOVERY') {
        apStatusEl.className = 'text-error font-bold';
      } else if (state.vessel.autopilotStatus === 'COMPENSATING_DRIFT') {
        apStatusEl.className = 'text-amber-400 font-bold';
      } else {
        apStatusEl.className = 'text-secondary font-bold';
      }
    }

    const xteEl = document.getElementById('telemetry-xte');
    if (xteEl) {
      xteEl.innerText = `${(state.vessel.crossTrackError || 0.0).toFixed(1)} SU`;
      if (Math.abs(state.vessel.crossTrackError || 0.0) > 15) {
        xteEl.className = 'text-error font-bold';
      } else {
        xteEl.className = 'text-secondary font-bold';
      }
    }

    const driftCorrEl = document.getElementById('telemetry-drift-corr');
    if (driftCorrEl) {
      driftCorrEl.innerText = `${(state.vessel.driftCorrection || 0.0).toFixed(1)}°`;
    }

    const crabAngleEl = document.getElementById('telemetry-crab-angle');
    if (crabAngleEl) {
      crabAngleEl.innerText = `${(state.vessel.crabAngle || 0.0).toFixed(1)}°`;
    }

    const envResistEl = document.getElementById('telemetry-env-resist');
    if (envResistEl) {
      envResistEl.innerText = (state.vessel.environmentalResistance || 0.0).toFixed(1);
    }

    const distWpEl = document.getElementById('telemetry-dist-wp');
    if (distWpEl) {
      distWpEl.innerText = ship.targetWaypoint 
        ? `${Math.hypot(ship.targetWaypoint.x - ship.x, ship.targetWaypoint.y - ship.y).toFixed(0)} SU`
        : '0 SU';
    }

    const distDestEl = document.getElementById('telemetry-dist-dest');
    if (distDestEl) {
      distDestEl.innerText = state.navigation.destinationPoint
        ? `${Math.hypot(state.navigation.destinationPoint.x - ship.x, state.navigation.destinationPoint.y - ship.y).toFixed(0)} SU`
        : '0 SU';
    }

    // Update Hazard Warnings List
    const hazardListEl = document.getElementById('hazard-list');
    if (hazardListEl) {
      if (!ship.hazards || ship.hazards.length === 0) {
        hazardListEl.innerHTML = '<div class="text-on-surface-variant text-[10px]">No immediate hazards detected.</div>';
      } else {
        hazardListEl.innerHTML = ship.hazards.map(h => {
          let colorClass = 'text-secondary';
          if (h.level === 'CRITICAL') colorClass = 'text-error font-bold';
          else if (h.level === 'HIGH') colorClass = 'text-error';
          else if (h.level === 'MEDIUM') colorClass = 'text-amber-400';
          
          return `
            <div class="p-2 bg-surface rounded border border-outline/50 space-y-1">
              <div class="flex justify-between font-bold">
                <span class="text-primary">${h.name} (${h.size})</span>
                <span class="${colorClass}">${h.level}</span>
              </div>
              <div class="flex justify-between text-[10px] text-on-surface-variant">
                <span>DISTANCE:</span>
                <span>${h.distance.toFixed(0)} m</span>
              </div>
              <div class="flex justify-between text-[10px] text-on-surface-variant">
                <span>CLOSING SPEED:</span>
                <span>${(h.closingSpeed / 1.8).toFixed(1)} kts</span>
              </div>
            </div>
          `;
        }).join('');
      }
    }

    // Keep ship context panel updated if it's open
    if (this.engine.renderer.selectedEntity === ship && !this.contextPanel.classList.contains('hidden')) {
        this.showContextPanel(ship);
    }

    // Update AI Recommendation panel
    if (aiNavigator.aiRecommendation) {
      const rec = aiNavigator.aiRecommendation;
      const recStatusEl = document.getElementById('ai-rec-status');
      const recExplanationEl = document.getElementById('ai-rec-explanation');
      if (recStatusEl && recExplanationEl) {
        recStatusEl.innerText = rec.status;
        recExplanationEl.innerText = rec.explanation;
        
        // Color coding
        if (rec.status === 'SAFE TO PROCEED' || rec.status === 'MAINTAIN COURSE') {
          recStatusEl.className = 'text-secondary font-bold';
        } else if (rec.status === 'REDUCE SPEED' || rec.status === 'ALTER COURSE' || rec.status === 'REROUTE RECOMMENDED') {
          recStatusEl.className = 'text-amber-400 font-bold';
        } else {
          recStatusEl.className = 'text-error font-bold';
        }
      }
    }

    // Update Route Strategy Comparisons
    const compareEl = document.getElementById('ai-routes-compare');
    if (compareEl && aiNavigator.routeComparisons) {
      const { shortest, balanced, safest } = aiNavigator.routeComparisons;
      
      const renderRow = (info, title, isRecommended) => {
        let riskColor = 'text-secondary';
        if (info.risk === 'HIGH') riskColor = 'text-error font-bold';
        else if (info.risk === 'MEDIUM') riskColor = 'text-amber-400';
        
        return `
          <div class="p-2 bg-surface rounded border ${isRecommended ? 'border-secondary bg-secondary/5' : 'border-outline/50'} space-y-1">
            <div class="flex justify-between font-bold text-[10px]">
              <span class="text-primary">${isRecommended ? '★ ' : ''}${title}${isRecommended ? ' (RECOMMENDED)' : ''}</span>
              <span class="${riskColor}">${info.risk} RISK</span>
            </div>
            <div class="grid grid-cols-4 gap-1 text-[8px] text-on-surface-variant text-center pt-0.5 border-t border-outline/10">
              <div>ETA<span class="block text-primary font-bold">${info.eta.toFixed(1)}h</span></div>
              <div>FUEL<span class="block text-primary font-bold">${info.fuel.toFixed(0)}L</span></div>
              <div>ICE-ML<span class="block text-amber-400 font-bold">${(info.icebergRisk*100).toFixed(0)}%</span></div>
              <div>SEA-ML<span class="block text-amber-400 font-bold">${(info.seaIceRisk*100).toFixed(0)}%</span></div>
            </div>
          </div>
        `;
      };

      const recMode = aiNavigator.aiRecommendation ? aiNavigator.aiRecommendation.recommendedMode : 'BALANCED';
      
      compareEl.innerHTML = `
        ${renderRow(shortest, 'FASTEST', recMode === 'SHORTEST')}
        ${renderRow(balanced, 'BALANCED', recMode === 'BALANCED')}
        ${renderRow(safest, 'SAFEST', recMode === 'SAFEST')}
      `;
    }

    // Update Autonomous Controller Telemetry
    const autoCtrl = this.engine.autonomousController;
    if (autoCtrl) {
      const modeEl = document.getElementById('ai-ctrl-mode');
      const routeEl = document.getElementById('ai-ctrl-route-mode');
      const hdgEl = document.getElementById('ai-ctrl-hdg');
      const spdEl = document.getElementById('ai-ctrl-spd');
      const historyEl = document.getElementById('ai-decision-history');

      if (modeEl) {
        modeEl.innerText = autoCtrl.currentCommand.mode;
        if (autoCtrl.currentCommand.mode === 'SAFE_TO_PROCEED' || autoCtrl.currentCommand.mode === 'MAINTAIN_COURSE') {
          modeEl.className = 'text-secondary font-bold';
        } else if (autoCtrl.currentCommand.mode === 'ALTER_COURSE' || autoCtrl.currentCommand.mode === 'REROUTE') {
          modeEl.className = 'text-amber-400 font-bold';
        } else {
          modeEl.className = 'text-error font-bold';
        }
      }
      if (routeEl) routeEl.innerText = state.navigation.mode;
      if (hdgEl) hdgEl.innerText = `${autoCtrl.currentCommand.targetHeading}°`;
      if (spdEl) spdEl.innerText = `${autoCtrl.currentCommand.targetSpeed} kts`;

      if (historyEl && autoCtrl.history.length > 0) {
        historyEl.innerHTML = autoCtrl.history.map(item => `
          <div class="text-[9px] leading-tight border-b border-outline/10 pb-0.5 pt-0.5">
            <span class="text-on-surface-variant font-bold">[${item.time}]</span> 
            <span class="text-secondary font-bold ml-1">${item.mode}</span>
            <span class="text-on-surface-variant block mt-0.5">${item.reason}</span>
          </div>
        `).join('');
      }
    }

    // Update Validation Intelligence Telemetry
    const valEngine = this.engine.validationEngine;
    if (valEngine) {
      const valIceStatusEl = document.getElementById('val-iceberg-status');
      const valIceConfEl = document.getElementById('val-iceberg-conf');
      const valIceCountEl = document.getElementById('val-iceberg-count');
      const valIceErrEl = document.getElementById('val-iceberg-err');

      if (valIceStatusEl && client) {
        valIceStatusEl.innerText = client.status;
        valIceStatusEl.className = client.status === 'ONLINE' ? 'font-bold text-secondary' : 'font-bold text-error';
      }
      if (valIceConfEl && client) {
        valIceConfEl.innerText = client.status === 'ONLINE' ? `${(client.confidence * 100).toFixed(0)}%` : 'N/A';
      }
      if (valIceCountEl) valIceCountEl.innerText = valEngine.validatedCount;
      if (valIceErrEl) {
        valIceErrEl.innerText = valEngine.validatedCount > 0 ? `${valEngine.averageError.toFixed(1)} SU` : 'N/A';
      }

      const valSeaStatusEl = document.getElementById('val-seaice-status');
      const valSeaConfEl = document.getElementById('val-seaice-conf');
      const valSeaTrendEl = document.getElementById('val-seaice-trend');

      if (valSeaStatusEl && client) {
        valSeaStatusEl.innerText = client.status;
        valSeaStatusEl.className = client.status === 'ONLINE' ? 'font-bold text-secondary' : 'font-bold text-error';
      }
      if (valSeaConfEl && client) {
        valSeaConfEl.innerText = client.status === 'ONLINE' && client.seaIceForecast ? `${(client.seaIceForecast.confidence * 100).toFixed(0)}%` : 'N/A';
      }
      if (valSeaTrendEl && client && client.seaIceForecast) {
        const fc = client.seaIceForecast;
        const diff = fc.ice_24h - fc.current_ice;
        valSeaTrendEl.innerText = diff > 0.05 ? 'INCREASING' : (diff < -0.05 ? 'DECREASING' : 'STABLE');
        valSeaTrendEl.className = diff > 0.05 ? 'font-bold text-error' : (diff < -0.05 ? 'font-bold text-secondary' : 'font-bold text-on-surface-variant');
      }

      const valAutoStatusEl = document.getElementById('val-auto-status');
      const valAutoConfEl = document.getElementById('val-auto-conf');
      const valAutoModeEl = document.getElementById('val-auto-mode');

      if (valAutoStatusEl && autoCtrl) {
        valAutoStatusEl.innerText = autoCtrl.isActive ? 'ACTIVE' : 'STANDBY';
        valAutoStatusEl.className = autoCtrl.isActive ? 'font-bold text-secondary' : 'font-bold text-error';
      }
      if (valAutoModeEl && autoCtrl) {
        valAutoModeEl.innerText = autoCtrl.currentCommand.mode;
      }
      if (valAutoConfEl && autoCtrl) {
        const iceC = client ? client.confidence : 0.5;
        const seaC = client && client.seaIceForecast ? client.seaIceForecast.confidence : 0.6;
        const activeRoute = aiNav && aiNav.routeComparisons && state.navigation.mode 
          ? (state.navigation.mode === 'SHORTEST' ? aiNav.routeComparisons.shortest : (state.navigation.mode === 'SAFEST' ? aiNav.routeComparisons.safest : aiNav.routeComparisons.balanced))
          : null;
        const safetyC = activeRoute ? activeRoute.overallSafety : 0.8;
        const stabilityC = autoCtrl.currentCommand.mode === 'SAFE_TO_PROCEED' || autoCtrl.currentCommand.mode === 'MAINTAIN_COURSE' ? 0.95 : 0.75;
        const compositeConf = (iceC + seaC + safetyC + stabilityC) / 4;
        valAutoConfEl.innerText = `${(compositeConf * 100).toFixed(0)}%`;
      }

      const setStep = (id, text, colorClass) => {
        const el = document.getElementById(id);
        if (el) {
          el.innerText = text;
          el.className = `font-bold ${colorClass}`;
        }
      };

      setStep('pipe-step-1', 'COMPLETE', 'text-secondary');
      setStep('pipe-step-2', ship.hazards && ship.hazards.length > 0 ? 'COMPLETE' : 'WAITING', ship.hazards && ship.hazards.length > 0 ? 'text-secondary' : 'text-on-surface-variant');
      setStep('pipe-step-3', client && client.status === 'ONLINE' ? 'COMPLETE' : 'WARNING', client && client.status === 'ONLINE' ? 'text-secondary' : 'text-error');
      setStep('pipe-step-4', aiNav && aiNav.routeComparisons ? 'COMPLETE' : 'WAITING', aiNav && aiNav.routeComparisons ? 'text-secondary' : 'text-on-surface-variant');
      setStep('pipe-step-5', autoCtrl ? 'COMPLETE' : 'WAITING', autoCtrl ? 'text-secondary' : 'text-on-surface-variant');
      setStep('pipe-step-6', state.navigation.isNavigating ? 'ACTIVE' : 'WAITING', state.navigation.isNavigating ? 'text-amber-400' : 'text-on-surface-variant');
      setStep('pipe-step-7', valEngine.validatedCount > 0 ? 'COMPLETE' : (valEngine.snapshots.length > 0 ? 'ACTIVE' : 'WAITING'), valEngine.validatedCount > 0 ? 'text-secondary' : (valEngine.snapshots.length > 0 ? 'text-amber-400' : 'text-on-surface-variant'));
    }

    // Update Risk Intelligence Telemetry
    const ri = this.engine.riskIntelligenceEngine;
    if (ri) {
      const curCell = ri.getRiskAt(ship.x, ship.y);
      const curRiskVal = curCell ? curCell.risk : 0.0;
      
      const riskStatusEl = document.getElementById('risk-lbl-status');
      const riskCurrentEl = document.getElementById('risk-lbl-current');
      const riskRouteEl = document.getElementById('risk-lbl-route');
      const riskMaxEl = document.getElementById('risk-lbl-max');
      const riskConfEl = document.getElementById('risk-lbl-conf');
      
      const riskIceEl = document.getElementById('risk-lbl-ice');
      const riskSeaiceEl = document.getElementById('risk-lbl-seaice');
      
      const riskTopThreatEl = document.getElementById('risk-lbl-topthreat');
      const riskRecommendationEl = document.getElementById('risk-lbl-recommendation');
      const riskReasonEl = document.getElementById('risk-lbl-reason');

      if (riskStatusEl) {
        riskStatusEl.innerText = client && client.status === 'ONLINE' ? 'ONLINE' : 'FALLBACK';
        riskStatusEl.className = client && client.status === 'ONLINE' ? 'font-bold text-secondary' : 'font-bold text-error';
      }
      if (riskCurrentEl) riskCurrentEl.innerText = `${(curRiskVal * 100).toFixed(0)}%`;
      
      const exp = ri.getExplanation();
      if (riskRouteEl) {
        riskRouteEl.innerText = exp.classification;
        if (exp.classification === 'CRITICAL') riskRouteEl.className = 'font-bold text-error';
        else if (exp.classification === 'HIGH') riskRouteEl.className = 'font-bold text-amber-400';
        else if (exp.classification === 'MODERATE') riskRouteEl.className = 'font-bold text-primary';
        else riskRouteEl.className = 'font-bold text-secondary';
      }
      if (riskMaxEl) riskMaxEl.innerText = `${(ri.routeExposure.maximumRisk * 100).toFixed(0)}%`;
      if (riskConfEl) {
        riskConfEl.innerText = client && client.status === 'ONLINE' ? `${(client.confidence * 100).toFixed(0)}%` : 'N/A';
      }

      let maxIceRisk = 0.0;
      let maxSeaIceRisk = 0.0;
      for (let x = 0; x < ri.gridW; x++) {
        for (let y = 0; y < ri.gridH; y++) {
          maxIceRisk = Math.max(maxIceRisk, ri.riskGrid[x][y].icebergRisk);
          maxSeaIceRisk = Math.max(maxSeaIceRisk, ri.riskGrid[x][y].seaIceRisk);
        }
      }

      if (riskIceEl) riskIceEl.innerText = `${(maxIceRisk * 100).toFixed(0)}%`;
      if (riskSeaiceEl) riskSeaiceEl.innerText = `${(maxSeaIceRisk * 100).toFixed(0)}%`;

      if (riskTopThreatEl) {
        riskTopThreatEl.innerText = exp.topThreat.replace('_', ' ');
      }
      if (riskRecommendationEl) {
        const recStatus = autoCtrl && autoCtrl.isActive ? autoCtrl.currentCommand.mode : 'STANDBY';
        riskRecommendationEl.innerText = recStatus;
        if (recStatus === 'REROUTE' || recStatus === 'EMERGENCY_STOP') {
          riskRecommendationEl.className = 'font-bold text-error';
        } else if (recStatus === 'REDUCE_SPEED' || recStatus === 'ALTER_COURSE') {
          riskRecommendationEl.className = 'font-bold text-amber-400';
        } else {
          riskRecommendationEl.className = 'font-bold text-secondary';
        }
      }
      if (riskReasonEl) {
        riskReasonEl.innerText = exp.reasons.join(' ');
      }
    }

    this.updateMissionUI();
    this.updateDataModeUI();
    this.updateExplainabilityUI();
    this.updateConfidenceUI();
    this.updateDecisionCenterUI();

    this.updateScenarioUI();

    this.updateNavStatus();
    this.updateNavButtons();
  }

  initCollapsibleDraggablePanels() {
    const setupDraggablePanel = (panelId, headerId, bodyId, toggleId) => {
      const panel = document.getElementById(panelId);
      const header = document.getElementById(headerId);
      const body = document.getElementById(bodyId);
      const toggle = document.getElementById(toggleId);

      if (!panel || !header) return;

      // Collapse / Expand logic
      const toggleCollapse = (e) => {
        if (e) e.stopPropagation();
        const isCollapsed = body.classList.toggle('hidden');
        if (toggle) {
          toggle.innerText = isCollapsed ? '+' : '−';
        }
      };

      header.addEventListener('click', (e) => {
        if (e.button === 0 && body.classList.contains('hidden')) {
          toggleCollapse(e);
        }
      });

      if (toggle) {
        toggle.addEventListener('click', toggleCollapse);
      }

      // Dragging logic via Right Click
      let isDragging = false;
      let startX = 0;
      let startY = 0;
      let initialLeft = 0;
      let initialTop = 0;

      header.addEventListener('contextmenu', (e) => {
        e.preventDefault();
      });

      header.addEventListener('mousedown', (e) => {
        if (e.button !== 2) return; // Right click only

        e.stopPropagation();
        e.preventDefault();

        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;

        const rect = panel.getBoundingClientRect();
        initialLeft = rect.left;
        initialTop = rect.top;

        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
        panel.style.left = `${initialLeft}px`;
        panel.style.top = `${initialTop}px`;
      });

      const onMouseMove = (e) => {
        if (!isDragging) return;
        e.stopPropagation();

        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        let newLeft = initialLeft + dx;
        let newTop = initialTop + dy;

        // Viewport clamping
        const rect = panel.getBoundingClientRect();
        const headerRect = header.getBoundingClientRect();
        const pW = rect.width;
        const hH = headerRect.height || 30;

        newLeft = Math.max(0, Math.min(window.innerWidth - pW, newLeft));
        newTop = Math.max(0, Math.min(window.innerHeight - hH, newTop));

        panel.style.left = `${newLeft}px`;
        panel.style.top = `${newTop}px`;
      };

      const onMouseUp = (e) => {
        if (isDragging) {
          isDragging = false;
          e.stopPropagation();
        }
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);

      window.addEventListener('resize', () => {
        const rect = panel.getBoundingClientRect();
        const headerRect = header.getBoundingClientRect();
        const pW = rect.width;
        const hH = headerRect.height || 30;

        let currentLeft = parseFloat(panel.style.left) || rect.left;
        let currentTop = parseFloat(panel.style.top) || rect.top;

        currentLeft = Math.max(0, Math.min(window.innerWidth - pW, currentLeft));
        currentTop = Math.max(0, Math.min(window.innerHeight - hH, currentTop));

        panel.style.left = `${currentLeft}px`;
        panel.style.top = `${currentTop}px`;
      });
    };

    setupDraggablePanel('nav-panel', 'nav-panel-header', 'nav-panel-body', 'nav-panel-toggle');
    setupDraggablePanel('ship-status-panel', 'ship-status-panel-header', 'ship-status-panel-body', 'ship-status-panel-toggle');
    setupDraggablePanel('hazard-panel', 'hazard-panel-header', 'hazard-panel-body', 'hazard-panel-toggle');
    setupDraggablePanel('ai-advisor-panel', 'ai-advisor-panel-header', 'ai-advisor-panel-body', 'ai-advisor-panel-toggle');
    setupDraggablePanel('context-panel', 'context-panel-header', 'context-panel-body', 'context-panel-toggle');
    setupDraggablePanel('demo-scenarios-panel', 'demo-scenarios-panel-header', 'demo-scenarios-panel-body', 'demo-scenarios-panel-toggle');
    setupDraggablePanel('ai-validation-panel', 'ai-validation-panel-header', 'ai-validation-panel-body', 'ai-validation-panel-toggle');
    setupDraggablePanel('ai-risk-panel', 'ai-risk-panel-header', 'ai-risk-panel-body', 'ai-risk-panel-toggle');
    setupDraggablePanel('ai-mission-panel', 'ai-mission-panel-header', 'ai-mission-panel-body', 'ai-mission-panel-toggle');
    setupDraggablePanel('ai-data-mode-panel', 'ai-data-mode-panel-header', 'ai-data-mode-panel-body', 'ai-data-mode-panel-toggle');
    setupDraggablePanel('ai-explain-panel', 'ai-explain-panel-header', 'ai-explain-panel-body', 'ai-explain-panel-toggle');
    setupDraggablePanel('ai-whatif-panel', 'ai-whatif-panel-header', 'ai-whatif-panel-body', 'ai-whatif-panel-toggle');
    setupDraggablePanel('ai-confidence-panel', 'ai-confidence-panel-header', 'ai-confidence-panel-body', 'ai-confidence-panel-toggle');
    setupDraggablePanel('ai-decision-center-panel', 'ai-decision-center-panel-header', 'ai-decision-center-panel-body', 'ai-decision-center-panel-toggle');
  }

  bindDemoButtons() {
    const bindBtn = (id, scenarioName) => {
      const btn = document.getElementById(id);
      if (btn) {
        btn.addEventListener('click', () => {
          const mgr = this.engine.scenarioManager;
          if (mgr) {
            mgr.activateScenario(scenarioName);
            this.updateScenarioUI();
          }
        });
      }
    };
    bindBtn('demo-btn-normal', 'NORMAL_TRANSIT');
    bindBtn('demo-btn-iceberg', 'ICEBERG_CROSSING');
    bindBtn('demo-btn-seaice', 'INCREASING_SEA_ICE');
    bindBtn('demo-btn-weather', 'EXTREME_WEATHER');

    const autoBtn = document.getElementById('demo-btn-auto');
    if (autoBtn) {
      autoBtn.addEventListener('click', () => {
        const mgr = this.engine.scenarioManager;
        if (mgr) {
          mgr.toggleAutoDemo();
          autoBtn.innerText = mgr.isAutoDemo ? '■ STOP AUTO' : '▶ AUTO DEMO';
          autoBtn.className = mgr.isAutoDemo 
            ? 'border border-error text-error bg-error/5 hover:bg-error/10 rounded py-1.5 text-[9px] font-bold'
            : 'border border-primary text-primary bg-primary/5 hover:bg-primary/10 rounded py-1.5 text-[9px] font-bold';
          this.updateScenarioUI();
        }
      });
    }

    const resetBtn = document.getElementById('demo-btn-reset');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        const mgr = this.engine.scenarioManager;
        if (mgr) {
          mgr.reset();
          if (autoBtn) {
            autoBtn.innerText = '▶ AUTO DEMO';
            autoBtn.className = 'border border-primary text-primary bg-primary/5 hover:bg-primary/10 rounded py-1.5 text-[9px] font-bold';
          }
          this.updateScenarioUI();
        }
      });
    }
  }

  updateScenarioUI() {
    const mgr = this.engine.scenarioManager;
    if (!mgr) return;
    
    mgr.updateScenarioPhases();

    const activeEl = document.getElementById('demo-lbl-active');
    const phaseEl = document.getElementById('demo-lbl-phase');

    if (activeEl) activeEl.innerText = mgr.activeScenarioName.replace('_', ' ');
    if (phaseEl) {
      phaseEl.innerText = mgr.currentPhase;
      if (mgr.currentPhase === 'EXECUTION') {
        phaseEl.className = 'font-bold text-secondary';
      } else if (mgr.currentPhase === 'DECISION' || mgr.currentPhase === 'PREDICTION') {
        phaseEl.className = 'font-bold text-amber-400';
      } else {
        phaseEl.className = 'font-bold text-primary';
      }
    }
  }

  bindMissionPlannerControls() {
    const fInp = document.getElementById('mp-inp-fuel');
    const rInp = document.getElementById('mp-inp-risk');
    const hInp = document.getElementById('mp-inp-hours');
    
    const fVal = document.getElementById('mp-val-fuel');
    const rVal = document.getElementById('mp-val-risk');
    const hVal = document.getElementById('mp-val-hours');

    if (fInp && fVal) {
      fInp.addEventListener('input', () => fVal.innerText = `${fInp.value}%`);
    }
    if (rInp && rVal) {
      rInp.addEventListener('input', () => rVal.innerText = rInp.value);
    }
    if (hInp && hVal) {
      hInp.addEventListener('input', () => hVal.innerText = `${hInp.value}h`);
    }

    const planBtn = document.getElementById('mp-btn-plan');
    if (planBtn) {
      planBtn.addEventListener('click', () => {
        const mp = this.engine.missionPlanner;
        if (mp) {
          const constraints = {
            maxFuelPercent: parseFloat(fInp.value),
            maxRisk: parseFloat(rInp.value),
            arrivalTargetHours: parseFloat(hInp.value),
            priority: document.getElementById('mp-inp-priority').value
          };
          const plan = mp.planMission(constraints);
          this.renderMissionPlanResult(plan);
        }
      });
    }

    const applyBtn = document.getElementById('mp-btn-apply');
    if (applyBtn) {
      applyBtn.addEventListener('click', () => {
        const plan = this.engine.missionPlan;
        if (plan && plan.recommendedStrategy) {
          this.engine.state.navigation.mode = plan.recommendedStrategy;
          this.engine.state.navigation.routeInvalid = true;
          this.engine.calculateRoute();
        }
      });
    }

    const resetBtn = document.getElementById('mp-btn-reset');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        if (fInp) { fInp.value = 65; fVal.innerText = '65%'; }
        if (rInp) { rInp.value = 0.45; rVal.innerText = '0.45'; }
        if (hInp) { hInp.value = 20; hVal.innerText = '20h'; }
        const rBox = document.getElementById('mp-results-box');
        if (rBox) rBox.classList.add('hidden');
        this.engine.missionPlan = null;
        this.engine.state.navigation.mode = 'BALANCED';
        this.engine.state.navigation.routeInvalid = true;
        this.engine.calculateRoute();
      });
    }
  }

  renderMissionPlanResult(plan) {
    this.engine.missionPlan = plan;
    const rBox = document.getElementById('mp-results-box');
    if (!rBox) return;

    rBox.classList.remove('hidden');
    
    const stratEl = document.getElementById('mp-lbl-strategy');
    const etaEl = document.getElementById('mp-lbl-eta');
    const fuelEl = document.getElementById('mp-lbl-fuel');
    const riskEl = document.getElementById('mp-lbl-risk');
    const safetyEl = document.getElementById('mp-lbl-safety');
    const confEl = document.getElementById('mp-lbl-conf');
    const tradeEl = document.getElementById('mp-lbl-tradeoffs');
    const statusEl = document.getElementById('mp-lbl-status');

    if (stratEl) stratEl.innerText = `${plan.recommended.strategy} ★`;
    if (etaEl) etaEl.innerText = `${plan.recommended.etaHours.toFixed(1)}h`;
    if (fuelEl) fuelEl.innerText = `${plan.recommended.fuelPercent.toFixed(0)}%`;
    if (riskEl) riskEl.innerText = `${(plan.recommended.maxRisk * 100).toFixed(0)}%`;
    if (safetyEl) safetyEl.innerText = `${(plan.recommended.safetyMargin * 100).toFixed(0)}%`;
    if (confEl) confEl.innerText = `${(plan.confidence * 100).toFixed(0)}%`;
    
    if (tradeEl) {
      tradeEl.innerHTML = plan.tradeoffs.map(t => `<li>${t}</li>`).join('');
    }

    if (statusEl) {
      if (plan.feasible) {
        statusEl.innerText = 'MISSION FEASIBLE ✓';
        statusEl.className = 'text-center pt-1 border-t border-outline/10 font-bold text-[9px] text-secondary';
      } else {
        statusEl.innerText = '⚠ CONSTRAINT CONFLICT';
        statusEl.className = 'text-center pt-1 border-t border-outline/10 font-bold text-[9px] text-error';
      }
    }
  }

  updateMissionUI() {
    const mp = this.engine.missionPlanner;
    if (mp && mp.outdated) {
      const statusEl = document.getElementById('mp-lbl-status');
      if (statusEl) {
        statusEl.innerText = 'MISSION PLAN: OUTDATED';
        statusEl.className = 'text-center pt-1 border-t border-outline/10 font-bold text-[9px] text-amber-400';
      }
    }
  }

  bindDataModeControls() {
    const btnSim = document.getElementById('data-mode-btn-sim');
    const btnData = document.getElementById('data-mode-btn-data');

    const updateUIStyles = () => {
      const mode = this.engine.state.environment.mode;
      if (mode === 'DATA-DRIVEN') {
        if (btnSim) btnSim.className = 'border border-outline hover:bg-outline/20 text-on-surface rounded py-1.5 text-[9px] font-bold transition-all';
        if (btnData) btnData.className = 'border border-secondary text-secondary bg-secondary/10 hover:bg-secondary/20 rounded py-1.5 text-[9px] font-bold transition-all';
      } else {
        if (btnSim) btnSim.className = 'border border-secondary text-secondary bg-secondary/10 hover:bg-secondary/20 rounded py-1.5 text-[9px] font-bold transition-all';
        if (btnData) btnData.className = 'border border-outline hover:bg-outline/20 text-on-surface rounded py-1.5 text-[9px] font-bold transition-all';
      }
    };

    const handleModeSwitch = (newMode) => {
      if (this.engine.state.environment.mode === newMode) return;
      this.engine.state.environment.mode = newMode;
      this.engine.antarcticDataManager.active = (newMode === 'DATA-DRIVEN');
      
      // Invalidate current route / risk grid to trigger controlled recalculations
      this.engine.state.navigation.routeInvalid = true;
      if (this.engine.riskIntelligenceEngine) {
        this.engine.riskIntelligenceEngine.update(performance.now(), true);
      }
      this.engine.calculateRoute();
      updateUIStyles();
    };

    if (btnSim) btnSim.addEventListener('click', () => handleModeSwitch('SIMULATION'));
    if (btnData) btnData.addEventListener('click', () => handleModeSwitch('DATA-DRIVEN'));

    updateUIStyles();
  }

  updateDataModeUI() {
    const adm = this.engine.antarcticDataManager;
    if (!adm) return;

    const lblStatus = document.getElementById('data-lbl-status');
    const lblDataset = document.getElementById('data-lbl-dataset');
    const lblSeaice = document.getElementById('data-lbl-seaice');
    const lblCurrent = document.getElementById('data-lbl-current');
    const lblWind = document.getElementById('data-lbl-wind');
    const lblIceberg = document.getElementById('data-lbl-iceberg');

    const mode = this.engine.state.environment.mode;

    if (mode === 'DATA-DRIVEN') {
      if (lblStatus) {
        if (adm.status === 'FALLBACK') {
          lblStatus.innerText = 'DATA STATUS: FALLBACK';
          lblStatus.className = 'font-bold text-error';
        } else {
          lblStatus.innerText = 'DATA MODE ACTIVE';
          lblStatus.className = 'font-bold text-secondary';
        }
      }
      if (lblDataset) lblDataset.innerText = adm.metadata.time_period || 'ANTARCTIC SAMPLE';
      if (lblSeaice) lblSeaice.innerText = 'OBSERVED GRID';
      if (lblCurrent) lblCurrent.innerText = 'OBSERVED FIELD';
      if (lblWind) lblWind.innerText = 'OBSERVED FIELD';
      if (lblIceberg) lblIceberg.innerText = 'TRACK DATA';
    } else {
      if (lblStatus) {
        lblStatus.innerText = 'SIMULATION ACTIVE';
        lblStatus.className = 'font-bold text-secondary';
      }
      if (lblDataset) lblDataset.innerText = 'N/A';
      if (lblSeaice) lblSeaice.innerText = 'PROCEDURAL';
      if (lblCurrent) lblCurrent.innerText = 'PROCEDURAL';
      if (lblWind) lblWind.innerText = 'PROCEDURAL';
      if (lblIceberg) lblIceberg.innerText = 'PROCEDURAL';
    }
  }

  bindWhatIfControls() {
    const btnWhatIfToggle = document.getElementById('toolbar-btn-whatif');
    const panel = document.getElementById('ai-whatif-panel');
    
    if (btnWhatIfToggle && panel) {
      btnWhatIfToggle.addEventListener('click', () => {
        panel.classList.toggle('hidden');
        if (!panel.classList.contains('hidden')) {
          this.engine.counterfactualSimulator.captureBaseline();
        }
      });
    }

    const inpWind = document.getElementById('wi-inp-wind');
    const lblWind = document.getElementById('wi-lbl-wind');
    const inpCurrent = document.getElementById('wi-inp-current');
    const lblCurrent = document.getElementById('wi-lbl-current');
    const inpIce = document.getElementById('wi-inp-ice');
    const lblIce = document.getElementById('wi-lbl-ice');
    const inpIceberg = document.getElementById('wi-inp-iceberg');
    const lblIceberg = document.getElementById('wi-lbl-iceberg');

    const updateSliderLabels = () => {
      if (inpWind && lblWind) lblWind.innerText = `${Math.round(inpWind.value * 100)}%`;
      if (inpCurrent && lblCurrent) lblCurrent.innerText = `${Math.round(inpCurrent.value * 100)}%`;
      if (inpIce && lblIce) lblIce.innerText = `+${Math.round(inpIce.value * 100)}%`;
      if (inpIceberg && lblIceberg) lblIceberg.innerText = `${Math.round(inpIceberg.value * 100)}%`;
    };

    [inpWind, inpCurrent, inpIce, inpIceberg].forEach(inp => {
      if (inp) inp.addEventListener('input', updateSliderLabels);
    });

    const btnRun = document.getElementById('wi-btn-run');
    const btnReset = document.getElementById('wi-btn-reset');
    const resultsBox = document.getElementById('wi-results-box');
    const recBox = document.getElementById('wi-recommend-box');
    const chkShowRoute = document.getElementById('wi-chk-show-route');

    if (btnRun) {
      btnRun.addEventListener('click', () => {
        const cs = this.engine.counterfactualSimulator;
        cs.setHypotheticalConditions(
          parseFloat(inpWind.value),
          parseFloat(inpCurrent.value),
          parseFloat(inpIce.value),
          parseFloat(inpIceberg.value)
        );
        cs.runSimulation();

        // Render Results
        const res = cs.results;
        if (res) {
          if (resultsBox) resultsBox.classList.remove('hidden');
          if (recBox) recBox.classList.remove('hidden');

          document.getElementById('wi-lbl-base-eta').innerText = `${res.baseline.eta.toFixed(1)}h`;
          document.getElementById('wi-lbl-hypo-eta').innerText = `${res.hypothetical.eta.toFixed(1)}h`;
          
          document.getElementById('wi-lbl-base-fuel').innerText = `${res.baseline.fuel.toFixed(0)}%`;
          document.getElementById('wi-lbl-hypo-fuel').innerText = `${res.hypothetical.fuel.toFixed(0)}%`;

          const getRiskLabel = (r) => r > 0.6 ? 'CRITICAL' : (r > 0.4 ? 'HIGH' : (r > 0.25 ? 'MODERATE' : 'LOW'));
          document.getElementById('wi-lbl-base-risk').innerText = getRiskLabel(res.baseline.risk);
          document.getElementById('wi-lbl-hypo-risk').innerText = res.hypothetical.riskLabel;
          document.getElementById('wi-lbl-hypo-risk').className = res.hypothetical.riskLabel === 'CRITICAL' || res.hypothetical.riskLabel === 'HIGH' ? 'text-error font-bold' : 'text-secondary font-bold';

          document.getElementById('wi-lbl-rec-strat').innerText = res.recommendation.strategy;
          document.getElementById('wi-lbl-rec-conf').innerText = `${(res.recommendation.confidence * 100).toFixed(0)}%`;
          document.getElementById('wi-lbl-rec-action').innerText = res.recommendation.action;
          document.getElementById('wi-lbl-rec-reasons').innerHTML = res.recommendation.reasons.map(r => `<div>• ${r}</div>`).join('');
        }
      });
    }

    if (btnReset) {
      btnReset.addEventListener('click', () => {
        inpWind.value = 1.0;
        inpCurrent.value = 1.0;
        inpIce.value = 0.0;
        inpIceberg.value = 1.0;
        updateSliderLabels();

        const cs = this.engine.counterfactualSimulator;
        cs.reset();

        if (resultsBox) resultsBox.classList.add('hidden');
        if (recBox) recBox.classList.add('hidden');
        if (chkShowRoute) chkShowRoute.checked = false;
        cs.showHypotheticalRoute = false;
      });
    }

    if (chkShowRoute) {
      chkShowRoute.addEventListener('change', (e) => {
        this.engine.counterfactualSimulator.showHypotheticalRoute = e.target.checked;
      });
    }

    updateSliderLabels();
  }

  bindConfidenceControls() {
    const btnConfToggle = document.getElementById('toolbar-btn-conf');
    const panel = document.getElementById('ai-confidence-panel');
    if (btnConfToggle && panel) {
      btnConfToggle.addEventListener('click', () => {
        panel.classList.toggle('hidden');
      });
    }
  }

  updateConfidenceUI() {
    const cie = this.engine.confidenceIntelligenceEngine;
    if (!cie) return;

    // Compound score
    const lblTotal = document.getElementById('conf-lbl-total');
    const barTotal = document.getElementById('conf-bar-total');
    const lblLevel = document.getElementById('conf-lbl-level');
    const lblCompleteness = document.getElementById('conf-lbl-completeness');

    if (lblTotal) lblTotal.innerText = `${cie.decisionConfidence}%`;
    if (barTotal) {
      barTotal.style.width = `${cie.decisionConfidence}%`;
      barTotal.className = cie.decisionConfidence >= 75 ? 'bg-secondary h-full transition-all duration-300' :
                           (cie.decisionConfidence >= 55 ? 'bg-amber-400 h-full transition-all duration-300' :
                           'bg-error h-full transition-all duration-300');
    }
    if (lblLevel) lblLevel.innerText = cie.decisionLevel;
    if (lblCompleteness) lblCompleteness.innerText = `${Math.round(cie.dataCompleteness * 100)}%`;

    // Horizons
    const lblIce6 = document.getElementById('conf-lbl-ice-6');
    const lblIce12 = document.getElementById('conf-lbl-ice-12');
    const lblIce24 = document.getElementById('conf-lbl-ice-24');

    if (lblIce6) lblIce6.innerText = `${Math.round(cie.icebergConfidence.c6 * 100)}% ${cie.icebergConfidence.reliability6}`;
    if (lblIce12) lblIce12.innerText = `${Math.round(cie.icebergConfidence.c12 * 100)}% ${cie.icebergConfidence.reliability12}`;
    if (lblIce24) {
      lblIce24.innerText = `${Math.round(cie.icebergConfidence.c24 * 100)}% ${cie.icebergConfidence.reliability24}`;
      lblIce24.className = cie.icebergConfidence.c24 >= 0.55 ? 'font-bold text-amber-400' : 'font-bold text-error';
    }

    // Sea ice
    const lblSeaVal = document.getElementById('conf-lbl-sea-val');
    const lblSeaReliability = document.getElementById('conf-lbl-sea-reliability');

    if (lblSeaVal) lblSeaVal.innerText = `${Math.round(cie.seaIceConfidence.confidence * 100)}%`;
    if (lblSeaReliability) lblSeaReliability.innerText = cie.seaIceConfidence.reliability;

    // Live validation
    const lblValMean = document.getElementById('conf-lbl-val-mean');
    const lblValTrend = document.getElementById('conf-lbl-val-trend');
    const lblValSamples = document.getElementById('conf-lbl-val-samples');

    if (lblValMean) lblValMean.innerText = `${cie.validationMetrics.meanError.toFixed(1)} SU`;
    if (lblValTrend) {
      lblValTrend.innerText = cie.validationMetrics.trend;
      lblValTrend.className = cie.validationMetrics.trend === 'IMPROVING' ? 'font-bold text-secondary' :
                              (cie.validationMetrics.trend === 'DEGRADING' ? 'font-bold text-error' : 'font-bold text-on-surface-variant');
    }
    if (lblValSamples) lblValSamples.innerText = cie.validationMetrics.samples;

    // Uncertainty stability
    const lblEnvStable = document.getElementById('conf-lbl-env-stable');
    const lblCtrlStable = document.getElementById('conf-lbl-ctrl-stable');

    if (lblEnvStable) lblEnvStable.innerText = `${Math.round(cie.envStability * 100)}%`;
    if (lblCtrlStable) {
      lblCtrlStable.innerText = cie.controllerStability;
      lblCtrlStable.className = cie.controllerStability === 'STABLE' ? 'font-bold text-secondary' : 'font-bold text-amber-400';
    }

    // Boosters and reducers list
    const boostersList = document.getElementById('conf-boosters-list');
    const reducersList = document.getElementById('conf-reducers-list');
    const exp = cie.getConfidenceExplanation();

    if (boostersList) {
      boostersList.innerHTML = exp.boosters.map(b => `<div>✓ ${b}</div>`).join('');
    }
    if (reducersList) {
      reducersList.innerHTML = exp.reducers.map(r => `<div>⚠ ${r}</div>`).join('');
    }
  }

  bindDecisionCenterControls() {
    const btnDcToggle = document.getElementById('toolbar-btn-dc');
    const panel = document.getElementById('ai-decision-center-panel');
    if (btnDcToggle && panel) {
      btnDcToggle.addEventListener('click', () => {
        panel.classList.toggle('hidden');
      });
    }
  }

  updateDecisionCenterUI() {
    const dce = this.engine.decisionIntelligenceEngine;
    if (!dce) return;

    // Current action & reason
    const dec = dce.getCurrentDecision();
    const actionEl = document.getElementById('dc-lbl-action');
    const reasonEl = document.getElementById('dc-lbl-reason');
    if (actionEl) {
      actionEl.innerText = dec.decision;
      actionEl.className = dec.decision === 'STANDBY' ? 'text-on-surface-variant font-bold text-xs tracking-wider uppercase' :
                           (dec.decision === 'EMERGENCY_DODGE' || dec.decision === 'REROUTE_WAIT' ? 'text-error font-bold text-xs tracking-wider uppercase' :
                           'text-secondary font-bold text-xs tracking-wider uppercase');
    }
    if (reasonEl) reasonEl.innerText = dec.reason;

    // Timeline pipeline render
    const pipelineListEl = document.getElementById('dc-pipeline-list');
    if (pipelineListEl) {
      const pipeline = dce.getPipeline();
      pipelineListEl.innerHTML = pipeline.map(t => {
        let colorClass = 'text-secondary';
        if (t.status === 'WARNING' || t.status === 'FALLBACK') colorClass = 'text-amber-400';
        else if (t.status === 'CRITICAL' || t.status === 'OFFLINE') colorClass = 'text-error';
        return `
          <div class="flex items-center space-x-2 text-[8px] leading-tight">
            <div class="w-2.5 h-2.5 rounded-full border border-outline flex items-center justify-center text-[6px] font-bold ${colorClass}">●</div>
            <div class="flex-1">
              <div class="font-bold text-[8px] text-on-surface">${t.stage} — <span class="${colorClass}">${t.status}</span></div>
              <div class="text-[7px] text-on-surface-variant opacity-85">${t.desc} <span class="font-bold text-primary">(${t.metric})</span></div>
            </div>
          </div>
        `;
      }).join('');
    }

    // Expected impacts
    const etaEl = document.getElementById('dc-lbl-impact-eta');
    const fuelEl = document.getElementById('dc-lbl-impact-fuel');
    const riskEl = document.getElementById('dc-lbl-impact-risk');
    const confEl = document.getElementById('dc-lbl-impact-conf');

    if (etaEl) etaEl.innerText = dec.expectedImpact.etaDelta;
    if (fuelEl) fuelEl.innerText = dec.expectedImpact.fuelDelta;
    if (riskEl) riskEl.innerText = dec.expectedImpact.riskDelta;
    if (confEl) confEl.innerText = `${dec.confidence}%`;

    // Event Log
    const eventsListEl = document.getElementById('dc-events-list');
    if (eventsListEl) {
      eventsListEl.innerHTML = dce.events.map(ev => {
        let colorClass = 'text-on-surface-variant';
        if (ev.severity === 'WARNING') colorClass = 'text-amber-400';
        else if (ev.severity === 'CRITICAL') colorClass = 'text-error';
        else if (ev.severity === 'SUCCESS') colorClass = 'text-secondary';
        return `
          <div class="border-b border-outline/10 pb-1 leading-tight flex justify-between">
            <span class="opacity-60 text-[7px]">${ev.time}</span>
            <span class="${colorClass} text-right flex-1 ml-2">${ev.msg}</span>
          </div>
        `;
      }).join('');
    }
  }

  updateExplainabilityUI() {
    const ee = this.engine.explainabilityEngine;
    if (!ee) return;

    // 1. Top 3 reasons
    const reasonsListEl = document.getElementById('explain-reasons-list');
    if (reasonsListEl) {
      const reasons = ee.getTopReasons();
      reasonsListEl.innerHTML = reasons.map(r => `
        <div class="p-2 rounded bg-surface border border-outline/30 space-y-1">
          <div class="font-bold flex items-center text-primary text-[9px]">
            <span class="mr-1.5 text-xs">${r.icon}</span>
            ${r.title}
          </div>
          <div class="text-[8px] text-on-surface-variant leading-tight">${r.desc}</div>
        </div>
      `).join('');
    }

    // 2. Tradeoff summary
    const tradeoffEl = document.getElementById('explain-lbl-tradeoff');
    if (tradeoffEl) {
      tradeoffEl.innerText = ee.getTradeoffs();
    }

    // 3. Counterfactuals (Why not?)
    const counterfactualsListEl = document.getElementById('explain-counterfactuals-list');
    if (counterfactualsListEl) {
      const counterfactuals = ee.getCounterfactuals();
      if (counterfactuals.length === 0) {
        counterfactualsListEl.innerHTML = '<div class="text-[8px] text-on-surface-variant italic">No rejected strategies.</div>';
      } else {
        counterfactualsListEl.innerHTML = counterfactuals.map(c => `
          <div class="flex justify-between items-start border-b border-outline/10 pb-1">
            <span class="font-bold text-amber-400 text-[8px]">${c.strategy}:</span>
            <span class="text-[8px] text-on-surface-variant text-right leading-tight max-w-[70%]">${c.reason}</span>
          </div>
        `).join('');
      }
    }

    // 4. Confidence Breakdown
    const conf = ee.getDecisionConfidence();
    const confTotalEl = document.getElementById('explain-lbl-conf-total');
    const confMlEl = document.getElementById('explain-lbl-conf-ml');
    const confRiskEl = document.getElementById('explain-lbl-conf-risk');
    const confSafetyEl = document.getElementById('explain-lbl-conf-safety');
    const confStabilityEl = document.getElementById('explain-lbl-conf-stability');

    if (confTotalEl) confTotalEl.innerText = `${(conf.compound * 100).toFixed(0)}%`;
    if (confMlEl) confMlEl.innerText = `${(conf.mlForecast * 100).toFixed(0)}%`;
    if (confRiskEl) confRiskEl.innerText = `${(conf.riskMap * 100).toFixed(0)}%`;
    if (confSafetyEl) confSafetyEl.innerText = `${(conf.routeSafety * 100).toFixed(0)}%`;
    if (confStabilityEl) confStabilityEl.innerText = `${(conf.stability * 100).toFixed(0)}%`;

    // 5. Timeline List
    const timelineListEl = document.getElementById('explain-timeline-list');
    if (timelineListEl) {
      const timeline = ee.getDecisionTimeline();
      timelineListEl.innerHTML = timeline.map(t => {
        let colorClass = 'text-secondary';
        if (t.status === 'FALLBACK') colorClass = 'text-amber-400';
        else if (t.status === 'OFFLINE') colorClass = 'text-error';
        return `
          <div class="flex items-center space-x-2 text-[8px] leading-tight">
            <div class="w-2.5 h-2.5 rounded-full border border-outline flex items-center justify-center text-[6px] font-bold ${colorClass}">●</div>
            <div class="flex-1">
              <div class="font-bold text-[8px] text-on-surface">${t.stage} — <span class="${colorClass}">${t.status}</span></div>
              <div class="text-[7px] text-on-surface-variant opacity-85">${t.desc}</div>
            </div>
          </div>
        `;
      }).join('');
    }
  }
}
