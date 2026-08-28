/**
 * POLARIS DIGITAL TWIN - User Interface & Event Controller
 */

export class UIController {
  constructor(simulationEngine) {
    this.engine = simulationEngine;
    this.bindElements();
    this.attachEventListeners();
    // Reflect default states
    this._updateTrackShipBtn(true);
    this._updatePanBtn(false);
  }

  bindElements() {
    // Environmental Sliders & Readouts
    this.windSpeedInput = document.getElementById('wind-speed-input');
    this.windSpeedVal = document.getElementById('wind-speed-val');
    this.currentSpeedInput = document.getElementById('current-speed-input');
    this.currentSpeedVal = document.getElementById('current-speed-val');
    this.tidalPeriodInput = document.getElementById('tidal-period-input');
    this.tidalPeriodVal = document.getElementById('tidal-period-val');
    this.waveHeightInput = document.getElementById('wave-height-input');
    this.waveHeightVal = document.getElementById('wave-height-val');

    // Controls & Toggles
    this.stormBtn = document.getElementById('storm-mode-btn');
    this.recalibrateBtn = document.getElementById('recalibrate-btn');

    // Time Controls
    this.simClockVal = document.getElementById('sim-clock-val');
    this.playPauseBtn = document.getElementById('play-pause-btn');
    this.playPauseIcon = document.getElementById('play-pause-icon');
    this.timeWarp1x = document.getElementById('timewarp-1x');
    this.timeWarp10x = document.getElementById('timewarp-10x');
    this.timeWarp100x = document.getElementById('timewarp-100x');
    this.timeWarp1000x = document.getElementById('timewarp-1000x');

    // AI Telemetry Readouts
    this.sysRiskScoreVal = document.getElementById('sys-risk-score');
    this.sysRiskBadgeVal = document.getElementById('sys-risk-badge');
    this.routeConfidenceVal = document.getElementById('route-confidence-val');
    this.routeConfidenceBar = document.getElementById('route-confidence-bar');
    this.fuelCurrentVal = document.getElementById('fuel-current-val');
    this.fuelOptimalVal = document.getElementById('fuel-optimal-val');
    this.trackedEntitiesList = document.getElementById('tracked-entities-list');

    // Iceberg Inspector Modal/Panel
    this.icebergInspector = document.getElementById('iceberg-inspector');
    this.icebergInspectorName = document.getElementById('inspector-iceberg-name');
    this.inspectorLat = document.getElementById('inspector-lat');
    this.inspectorLon = document.getElementById('inspector-lon');
    this.inspectorMass = document.getElementById('inspector-mass');
    this.inspectorSize = document.getElementById('inspector-size');
    this.inspectorDriftCurrent = document.getElementById('inspector-drift-current');
    this.inspectorDriftWind = document.getElementById('inspector-drift-wind');
    this.inspectorHeading = document.getElementById('inspector-heading');
    this.inspectorForecast6h = document.getElementById('inspector-forecast-6h');
    this.inspectorForecast12h = document.getElementById('inspector-forecast-12h');
    this.inspectorForecast24h = document.getElementById('inspector-forecast-24h');
    this.targetShipBtn = document.getElementById('inspector-target-ship-btn');

    // Reroute Alert Banner
    this.rerouteAlertBanner = document.getElementById('reroute-alert-banner');
    this.rerouteAlertMsg = document.getElementById('reroute-alert-msg');

    // Mode Switcher & Synthetic Drawer
    this.modeSimulateBtn = document.getElementById('mode-simulate-btn');
    this.modeLiveBtn = document.getElementById('mode-live-btn');
    this.syntheticDrawerBtn = document.getElementById('synthetic-drawer-btn');
    this.syntheticDrawer = document.getElementById('synthetic-drawer');
    this.syntheticLogsContainer = document.getElementById('synthetic-logs');
    this.generateSyntheticBtn = document.getElementById('generate-synthetic-btn');

    // Camera / Pan tool buttons
    this.trackShipBtn   = document.getElementById('track-ship-btn');
    this.trackShipLabel = document.getElementById('track-ship-label');
    this.panToolBtn     = document.getElementById('pan-tool-btn');

    // Add Iceberg controls
    this.addIcebergBtn        = document.getElementById('add-iceberg-btn');
    this.addIcebergPanel      = document.getElementById('add-iceberg-panel');
    this.closeAddIcebergBtn   = document.getElementById('close-add-iceberg-btn');
    this.ibMassInput          = document.getElementById('ib-mass-input');
    this.ibMassVal            = document.getElementById('ib-mass-val');
    this.ibSizeInput          = document.getElementById('ib-size-input');
    this.ibSizeVal            = document.getElementById('ib-size-val');
    this.ibCurrInput          = document.getElementById('ib-curr-input');
    this.ibCurrVal            = document.getElementById('ib-curr-val');
    this.ibCountBadge         = document.getElementById('ib-count-badge');
  }

  attachEventListeners() {
    // Environmental Sliders
    if (this.windSpeedInput) {
      this.windSpeedInput.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (this.windSpeedVal) this.windSpeedVal.innerHTML = `${val.toFixed(1)} <span class="text-[10px] text-on-surface-variant">km/h</span>`;
        this.engine.vectorField.setParams({ windSpeed: val });
      });
    }

    if (this.currentSpeedInput) {
      this.currentSpeedInput.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value) / 10;
        if (this.currentSpeedVal) this.currentSpeedVal.innerHTML = `${val.toFixed(1)} <span class="text-[10px] text-on-surface-variant">m/s</span>`;
        this.engine.vectorField.setParams({ currentSpeed: val });
      });
    }

    if (this.tidalPeriodInput) {
      this.tidalPeriodInput.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value) / 10;
        if (this.tidalPeriodVal) this.tidalPeriodVal.innerHTML = `${val.toFixed(1)} <span class="text-[10px] text-on-surface-variant">hrs</span>`;
        this.engine.vectorField.setParams({ tidalPeriod: val });
      });
    }

    if (this.waveHeightInput) {
      this.waveHeightInput.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value) / 10;
        if (this.waveHeightVal) this.waveHeightVal.innerHTML = `${val.toFixed(1)} <span class="text-[10px] text-on-surface-variant">m</span>`;
        this.engine.vectorField.setParams({ waveHeight: val });
      });
    }

    // Storm Mode Toggle Button
    if (this.stormBtn) {
      this.stormBtn.addEventListener('click', () => {
        this.toggleStormMode();
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
        this.engine.isPaused = !this.engine.isPaused;
        if (this.playPauseIcon) {
          this.playPauseIcon.textContent = this.engine.isPaused ? 'play_arrow' : 'pause';
        }
      });
    }

    // Time Warp Buttons
    const warpBtns = [
      { btn: this.timeWarp1x, speed: 1 },
      { btn: this.timeWarp10x, speed: 10 },
      { btn: this.timeWarp100x, speed: 100 },
      { btn: this.timeWarp1000x, speed: 1000 }
    ];

    warpBtns.forEach(({ btn, speed }) => {
      if (btn) {
        btn.addEventListener('click', () => {
          warpBtns.forEach(b => b.btn && b.btn.classList.remove('bg-primary-container/20', 'text-primary-container'));
          btn.classList.add('bg-primary-container/20', 'text-primary-container');
          this.engine.timeWarp = speed;
        });
      }
    });

    // Iceberg Target Ship Override Button
    if (this.targetShipBtn) {
      this.targetShipBtn.addEventListener('click', () => {
        const selectedIceberg = this.engine.renderer.selectedEntity;
        if (selectedIceberg) {
          selectedIceberg.setManualTarget(this.engine.ship.x, this.engine.ship.y);
          this.engine.aiNavigator.triggerReroute(this.engine.ship, this.engine.icebergs);
        }
      });
    }

    // Mode Switchers
    if (this.modeSimulateBtn) {
      this.modeSimulateBtn.addEventListener('click', () => {
        this.setMode('WHAT_IF');
      });
    }

    if (this.modeLiveBtn) {
      this.modeLiveBtn.addEventListener('click', () => {
        this.setMode('REAL_DATA');
      });
    }

    // Synthetic Data Generator Drawer Toggle
    if (this.syntheticDrawerBtn) {
      this.syntheticDrawerBtn.addEventListener('click', () => {
        if (this.syntheticDrawer) {
          this.syntheticDrawer.classList.toggle('hidden');
        }
      });
    }

    if (this.generateSyntheticBtn) {
      this.generateSyntheticBtn.addEventListener('click', () => {
        this.generateSyntheticScenarios();
      });
    }

    // ── Add Iceberg button ────────────────────────────────────────────
    if (this.addIcebergBtn) {
      this.addIcebergBtn.addEventListener('click', () => {
        const renderer = this.engine.renderer;
        const next = !renderer.addIcebergMode;
        renderer.addIcebergMode = next;
        this._updateAddIcebergBtn(next);
        if (next) {
          // open panel, disengage pan
          if (this.addIcebergPanel) this.addIcebergPanel.classList.remove('hidden');
          renderer.setPanTool(false);
          this._updatePanBtn(false);
          renderer.canvas.style.cursor = 'cell';
          // Wire placement callback
          renderer.onPlaceIceberg = (wx, wy, cfg) => this.placeIceberg(wx, wy, cfg);
        } else {
          if (this.addIcebergPanel) this.addIcebergPanel.classList.add('hidden');
          renderer.canvas.style.cursor = 'crosshair';
          renderer.onPlaceIceberg = null;
        }
      });
    }

    // Close panel X button
    if (this.closeAddIcebergBtn) {
      this.closeAddIcebergBtn.addEventListener('click', () => {
        const renderer = this.engine.renderer;
        renderer.addIcebergMode = false;
        renderer.onPlaceIceberg = null;
        renderer.canvas.style.cursor = 'crosshair';
        if (this.addIcebergPanel) this.addIcebergPanel.classList.add('hidden');
        this._updateAddIcebergBtn(false);
      });
    }

    // Iceberg panel sliders
    if (this.ibMassInput) {
      this.ibMassInput.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value) / 10;
        if (this.ibMassVal) this.ibMassVal.innerHTML = `${val.toFixed(1)} <span class="text-[9px] text-outline">Mt</span>`;
        this.engine.renderer.pendingIcebergCfg.mass = val;
      });
    }
    if (this.ibSizeInput) {
      this.ibSizeInput.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        if (this.ibSizeVal) this.ibSizeVal.innerHTML = `${val} <span class="text-[9px] text-outline">m</span>`;
        this.engine.renderer.pendingIcebergCfg.size = val;
      });
    }
    if (this.ibCurrInput) {
      this.ibCurrInput.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value) / 100;
        if (this.ibCurrVal) this.ibCurrVal.textContent = val.toFixed(2);
        this.engine.renderer.pendingIcebergCfg.currentResponse = val;
      });
    }

    // Quick preset buttons
    document.querySelectorAll('.ib-preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const mass = parseFloat(btn.dataset.mass);
        const size = parseInt(btn.dataset.size);
        const curr = parseFloat(btn.dataset.curr) / 100;
        // Update sliders
        if (this.ibMassInput)  this.ibMassInput.value  = mass * 10;
        if (this.ibSizeInput)  this.ibSizeInput.value  = size;
        if (this.ibCurrInput)  this.ibCurrInput.value  = curr * 100;
        // Update labels
        if (this.ibMassVal)  this.ibMassVal.innerHTML  = `${mass.toFixed(1)} <span class="text-[9px] text-outline">Mt</span>`;
        if (this.ibSizeVal)  this.ibSizeVal.innerHTML  = `${size} <span class="text-[9px] text-outline">m</span>`;
        if (this.ibCurrVal)  this.ibCurrVal.textContent = curr.toFixed(2);
        // Sync to renderer
        this.engine.renderer.pendingIcebergCfg = { mass, size, currentResponse: curr };
      });
    });

    // ── Track Ship button ─────────────────────────────────────────────
    if (this.trackShipBtn) {
      this.trackShipBtn.addEventListener('click', () => {
        const renderer = this.engine.renderer;
        renderer.trackShip = !renderer.trackShip;
        this._updateTrackShipBtn(renderer.trackShip);
        // When re-enabling tracking, also disengage pan mode
        if (renderer.trackShip && renderer.panToolActive) {
          renderer.setPanTool(false);
          this._updatePanBtn(false);
        }
      });
    }

    // ── Hand / Pan tool button ────────────────────────────────────────
    if (this.panToolBtn) {
      this.panToolBtn.addEventListener('click', () => {
        const renderer = this.engine.renderer;
        const next = !renderer.panToolActive;
        renderer.setPanTool(next);
        this._updatePanBtn(next);
        // Panning disables tracking
        if (next) {
          renderer.trackShip = false;
          this._updateTrackShipBtn(false);
        }
      });
    }
  }

  _updateTrackShipBtn(active) {
    if (!this.trackShipBtn) return;
    if (active) {
      this.trackShipBtn.classList.add('bg-secondary/20', 'border-secondary', 'text-secondary');
      this.trackShipBtn.classList.remove('text-on-surface-variant', 'border-secondary/50');
      if (this.trackShipLabel) this.trackShipLabel.textContent = 'TRACKING ●';
    } else {
      this.trackShipBtn.classList.remove('bg-secondary/20', 'border-secondary');
      this.trackShipBtn.classList.add('text-on-surface-variant', 'border-secondary/50');
      if (this.trackShipLabel) this.trackShipLabel.textContent = 'TRACK SHIP';
    }
  }

  _updatePanBtn(active) {
    if (!this.panToolBtn) return;
    if (active) {
      this.panToolBtn.classList.add('bg-primary-container/20', 'border-primary-container', 'text-primary-container');
      this.panToolBtn.classList.remove('text-on-surface-variant', 'border-primary-container/40');
    } else {
      this.panToolBtn.classList.remove('bg-primary-container/20', 'border-primary-container', 'text-primary-container');
      this.panToolBtn.classList.add('text-on-surface-variant', 'border-primary-container/40');
    }
  }

  toggleStormMode() {
    const stormState = !this.engine.vectorField.stormMode;
    this.engine.vectorField.setParams({ stormMode: stormState });

    if (stormState) {
      this.stormBtn.classList.add('storm-glow', 'bg-error/20');
      // Surge sliders visually
      if (this.windSpeedInput) this.windSpeedInput.value = 85;
      if (this.windSpeedVal) this.windSpeedVal.innerHTML = `85.0 <span class="text-[10px] text-on-surface-variant">km/h</span>`;
      this.engine.vectorField.setParams({ windSpeed: 85, waveHeight: 5.8, currentSpeed: 3.2 });
      this.engine.aiNavigator.triggerReroute(this.engine.ship, this.engine.icebergs);
    } else {
      this.stormBtn.classList.remove('storm-glow', 'bg-error/20');
      this.updateSlidersFromState();
    }
  }

  setMode(mode) {
    if (mode === 'REAL_DATA') {
      if (this.modeLiveBtn) this.modeLiveBtn.classList.add('border-b-2', 'border-primary', 'text-primary');
      if (this.modeSimulateBtn) this.modeSimulateBtn.classList.remove('border-b-2', 'border-primary', 'text-primary');
      this.engine.loadAntarcticPreset('DRAKE_PASSAGE');
    } else {
      if (this.modeSimulateBtn) this.modeSimulateBtn.classList.add('border-b-2', 'border-primary', 'text-primary');
      if (this.modeLiveBtn) this.modeLiveBtn.classList.remove('border-b-2', 'border-primary', 'text-primary');
      this.engine.loadAntarcticPreset('SANDBOX');
    }
  }

  updateSlidersFromState() {
    const vf = this.engine.vectorField;
    if (this.windSpeedInput) this.windSpeedInput.value = vf.windSpeed;
    if (this.windSpeedVal) this.windSpeedVal.innerHTML = `${vf.windSpeed.toFixed(1)} <span class="text-[10px] text-on-surface-variant">km/h</span>`;

    if (this.currentSpeedInput) this.currentSpeedInput.value = vf.currentSpeed * 10;
    if (this.currentSpeedVal) this.currentSpeedVal.innerHTML = `${vf.currentSpeed.toFixed(1)} <span class="text-[10px] text-on-surface-variant">m/s</span>`;

    if (this.tidalPeriodInput) this.tidalPeriodInput.value = vf.tidalPeriod * 10;
    if (this.tidalPeriodVal) this.tidalPeriodVal.innerHTML = `${vf.tidalPeriod.toFixed(1)} <span class="text-[10px] text-on-surface-variant">hrs</span>`;
  }

  updateTelemetry() {
    const ai = this.engine.aiNavigator;
    const ship = this.engine.ship;

    // Clock
    if (this.simClockVal) {
      const totalSecs = Math.floor(this.engine.simTimeHours * 3600);
      const hours = String(Math.floor((totalSecs / 3600) % 24)).padStart(2, '0');
      const mins = String(Math.floor((totalSecs / 60) % 60)).padStart(2, '0');
      const secs = String(totalSecs % 60).padStart(2, '0');
      this.simClockVal.textContent = `2042.11.04_${hours}:${mins}:${secs}Z`;
    }

    // SYS_RISK
    if (this.sysRiskScoreVal) this.sysRiskScoreVal.textContent = ai.riskScore.toFixed(2);
    if (this.sysRiskBadgeVal) {
      this.sysRiskBadgeVal.textContent = ai.riskLevel;
      if (ai.riskLevel === 'LOW') {
        this.sysRiskBadgeVal.className = 'font-label-caps text-label-caps text-secondary bg-secondary/10 px-2 py-0.5 rounded-sm';
      } else if (ai.riskLevel === 'MEDIUM') {
        this.sysRiskBadgeVal.className = 'font-label-caps text-label-caps text-tertiary bg-tertiary/10 px-2 py-0.5 rounded-sm';
      } else {
        this.sysRiskBadgeVal.className = 'font-label-caps text-label-caps text-error bg-error/10 px-2 py-0.5 rounded-sm pulse-danger';
      }
    }

    // Route Confidence
    if (this.routeConfidenceVal) this.routeConfidenceVal.textContent = `${ai.routeConfidence.toFixed(1)}%`;
    if (this.routeConfidenceBar) this.routeConfidenceBar.style.width = `${ai.routeConfidence}%`;

    // Fuel Efficiency
    if (this.fuelCurrentVal) this.fuelCurrentVal.textContent = `${ai.currentFuelRate.toFixed(1)} t/d`;
    if (this.fuelOptimalVal) this.fuelOptimalVal.textContent = `${ai.optimalFuelRate.toFixed(1)} t/d`;

    // Tracked Entities List
    if (this.trackedEntitiesList) {
      let html = `
        <div class="flex justify-between text-[11px] font-mono-data bg-surface-variant/30 px-2 py-1 border-l-2 border-secondary">
          <span class="text-secondary font-bold">${ship.name}</span>
          <span class="text-primary">${ship.speedKnots.toFixed(1)}kts</span>
        </div>
      `;

      for (let ice of this.engine.icebergs) {
        const iceKts = (Math.hypot(ice.vx, ice.vy) / 1.8).toFixed(1);
        const colorClass = ice.isSelected ? 'text-error font-bold' : 'text-primary-container';
        html += `
          <div class="flex justify-between text-[11px] font-mono-data bg-surface-variant/30 px-2 py-1 hover:bg-surface-variant/50 cursor-pointer" data-ice-id="${ice.id}">
            <span class="${colorClass}">${ice.name}</span>
            <span class="text-primary">${iceKts}kts</span>
          </div>
        `;
      }
      this.trackedEntitiesList.innerHTML = html;
    }

    // Reroute Alert Banner
    if (this.rerouteAlertBanner && ai.rerouteAlert) {
      this.rerouteAlertBanner.classList.remove('hidden');
      if (this.rerouteAlertMsg) this.rerouteAlertMsg.textContent = ai.rerouteMessage;
      setTimeout(() => {
        ai.rerouteAlert = false;
        this.rerouteAlertBanner.classList.add('hidden');
      }, 4000);
    }
  }

  showIcebergInspector(iceberg) {
    if (!this.icebergInspector) return;

    if (!iceberg) {
      this.icebergInspector.classList.add('hidden');
      return;
    }

    this.icebergInspector.classList.remove('hidden');
    if (this.icebergInspectorName) this.icebergInspectorName.textContent = `${iceberg.name} TELEMETRY`;
    if (this.inspectorLat) this.inspectorLat.textContent = iceberg.lat.toFixed(3);
    if (this.inspectorLon) this.inspectorLon.textContent = iceberg.lon.toFixed(3);
    if (this.inspectorMass) this.inspectorMass.textContent = `${iceberg.mass} Mt`;
    if (this.inspectorSize) this.inspectorSize.textContent = `${iceberg.size} m`;

    const currDrift = (iceberg.currentResponse * this.engine.vectorField.currentSpeed).toFixed(1);
    const windDrift = (iceberg.windResponse * (this.engine.vectorField.windSpeed / 3.6)).toFixed(1);
    if (this.inspectorDriftCurrent) this.inspectorDriftCurrent.textContent = `${currDrift} m/s`;
    if (this.inspectorDriftWind) this.inspectorDriftWind.textContent = `${windDrift} m/s`;
    if (this.inspectorHeading) this.inspectorHeading.textContent = `${iceberg.heading.toFixed(0)}°`;

    if (iceberg.trajectoryForecast.length >= 3) {
      const f6 = iceberg.trajectoryForecast[1];
      const f12 = iceberg.trajectoryForecast[2];
      const f24 = iceberg.trajectoryForecast[3];
      if (this.inspectorForecast6h) this.inspectorForecast6h.textContent = `6h  → ${f6.lat.toFixed(2)}, ${f6.lon.toFixed(2)}`;
      if (this.inspectorForecast12h) this.inspectorForecast12h.textContent = `12h → ${f12.lat.toFixed(2)}, ${f12.lon.toFixed(2)}`;
      if (this.inspectorForecast24h) this.inspectorForecast24h.textContent = `24h → ${f24.lat.toFixed(2)}, ${f24.lon.toFixed(2)}`;
    }
  }

  generateSyntheticScenarios() {
    if (!this.syntheticLogsContainer) return;

    let logsHtml = '';
    for (let i = 1; i <= 5; i++) {
      const scNum = String(i).padStart(3, '0');
      const curr = (1.0 + Math.random() * 3.5).toFixed(1);
      const wind = (10 + Math.random() * 60).toFixed(0);
      const iceCount = Math.floor(10 + Math.random() * 25);
      const risk = (0.1 + Math.random() * 0.7).toFixed(2);

      logsHtml += `
        <div class="p-2 border-b border-outline-variant/20 font-mono-data text-[11px] hover:bg-surface-variant/30">
          <div class="text-secondary font-bold">SCENARIO_${scNum}</div>
          <div class="text-on-surface-variant">Current: ${curr} m/s | Wind: ${wind} km/h | Icebergs: ${iceCount}</div>
          <div class="text-primary-container">Ground Truth Collision Risk: ${risk}</div>
        </div>
      `;
    }

    this.syntheticLogsContainer.innerHTML = logsHtml;
  }
}
