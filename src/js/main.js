/**
 * POLARIS DIGITAL TWIN - Main Application Entry Point
 */

import { VectorField } from './simulation/vectorField.js';
import { Iceberg } from './simulation/iceberg.js';
import { Ship } from './simulation/ship.js';
import { AINavigator } from './ai/aiNavigator.js';
import { CanvasRenderer } from './render/canvasRenderer.js';
import { UIController } from './ui/uiController.js';

class SimulationEngine {
  constructor() {
    const canvasEl = document.getElementById('map-canvas');

    this.vectorField = new VectorField(canvasEl.clientWidth || window.innerWidth, canvasEl.clientHeight || window.innerHeight);
    this.ship = new Ship({ x: 250, y: 550, heading: 40 });
    this.aiNavigator = new AINavigator(this.vectorField.width, this.vectorField.height);

    this.icebergs = [];
    this.initDefaultIcebergs();

    this.renderer = new CanvasRenderer(canvasEl);
    this.renderer.bindEntitiesGetter(
      () => this.icebergs,
      () => this.ship
    );

    this.renderer.onSelectIceberg = (iceberg) => {
      this.uiController.showIcebergInspector(iceberg);
    };

    this.uiController = new UIController(this);

    // Simulation Loop state
    this.isPaused = false;
    this.timeWarp = 1;
    this.simTimeHours = 14.0; // 14:00Z
    this.lastTimestamp = performance.now();

    // Start Main Loop
    requestAnimationFrame((t) => this.loop(t));
  }

  initDefaultIcebergs() {
    this.icebergs = [
      new Iceberg({ id: 1, name: 'IB-01', x: 620, y: 220, mass: 4.8, size: 720, currentResponse: 0.88, windResponse: 0.12 }),
      new Iceberg({ id: 2, name: 'IB-02', x: 540, y: 460, mass: 2.3, size: 480, currentResponse: 0.80, windResponse: 0.20 }),
      new Iceberg({ id: 3, name: 'IB-03', x: 780, y: 350, mass: 6.1, size: 890, currentResponse: 0.92, windResponse: 0.08 }),
      new Iceberg({ id: 4, name: 'IB-04', x: 420, y: 310, mass: 1.5, size: 340, currentResponse: 0.75, windResponse: 0.25 }),
      new Iceberg({ id: 5, name: 'IB-05', x: 880, y: 520, mass: 3.9, size: 610, currentResponse: 0.85, windResponse: 0.15 }),
      new Iceberg({ id: 6, name: 'IB-06', x: 350, y: 180, mass: 5.2, size: 780, currentResponse: 0.90, windResponse: 0.10 })
    ];
  }

  loadAntarcticPreset(presetName) {
    if (presetName === 'DRAKE_PASSAGE') {
      this.vectorField.setParams({ currentSpeed: 3.4, windSpeed: 68, waveHeight: 4.2, stormMode: true });
    } else {
      this.vectorField.setParams({ currentSpeed: 1.8, windSpeed: 45.2, waveHeight: 1.2, stormMode: false });
    }
    this.uiController.updateSlidersFromState();
    this.uiController.toggleStormMode(false);
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
    this.ship.x = 250;
    this.ship.y = 550;
    this.ship.heading = 40;
    this.ship.fuel = 78.4;
    this.initDefaultIcebergs();
    this.aiNavigator.generateOptimalRoute(this.ship, this.icebergs);
  }

  loop(timestamp) {
    const rawDt = Math.min(0.1, (timestamp - this.lastTimestamp) / 1000);
    this.lastTimestamp = timestamp;

    if (!this.isPaused) {
      const dt = rawDt * this.timeWarp;
      this.simTimeHours += (dt / 3600);

      // Update Simulation Physics
      this.vectorField.updateGrid(this.simTimeHours);
      this.vectorField.updateParticles(rawDt, this.simTimeHours);

      for (let ice of this.icebergs) {
        ice.update(rawDt, this.vectorField, this.simTimeHours);
      }

      this.ship.update(rawDt, this.vectorField, this.simTimeHours);

      // Update AI Navigator & Dynamic Risk Evaluation
      this.aiNavigator.evaluate(this.ship, this.icebergs, this.vectorField, this.simTimeHours);
    }

    // Render Canvas Frame
    this.renderer.render(
      this.vectorField,
      this.ship,
      this.icebergs,
      this.aiNavigator,
      this.simTimeHours,
      rawDt
    );

    // Update UI Telemetry & Inspector
    this.uiController.updateTelemetry();
    if (this.renderer.selectedEntity) {
      this.uiController.showIcebergInspector(this.renderer.selectedEntity);
    }

    requestAnimationFrame((t) => this.loop(t));
  }
}

// Initialize on DOM load
window.addEventListener('DOMContentLoaded', () => {
  window.simEngine = new SimulationEngine();
});
