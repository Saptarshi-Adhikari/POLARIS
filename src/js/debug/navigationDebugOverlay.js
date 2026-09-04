 /**
 * ASTRALIS Nav-OS — Live Navigation Debug Overlay & Shortcuts Controller
 *
 * Provides F6 (Overlay Toggle), F7 (Recorder Toggle), F8 (Recorder Export JSON), F9 (Clear Data).
 * Renders overlay panel with color warnings and real-time state metrics.
 */

export class NavigationDebugOverlay {
  constructor(flightRecorder, canvasRenderer) {
    this.recorder = flightRecorder;
    this.renderer = canvasRenderer;
    this.visible = false;
    this.overlayElement = null;
    this.setupKeyboardShortcuts();
    this.createOverlayElement();
  }

  setupKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      if (e.key === 'F6') {
        e.preventDefault();
        this.toggleOverlay();
      } else if (e.key === 'F7') {
        e.preventDefault();
        if (this.recorder.enabled) {
          this.recorder.stop();
          console.log('[FlightRecorder] Stopped. Samples:', this.recorder.samples.length);
        } else {
          this.recorder.start();
          console.log('[FlightRecorder] Started.');
        }
      } else if (e.key === 'F8') {
        e.preventDefault();
        this.exportJsonFile();
      } else if (e.key === 'F9') {
        e.preventDefault();
        this.recorder.clear();
        console.log('[FlightRecorder] Data cleared.');
      }
    });
  }

  toggleOverlay() {
    this.visible = !this.visible;
    if (this.renderer) {
      this.renderer.showDebugOverlay = this.visible;
    }
    if (this.overlayElement) {
      this.overlayElement.style.display = this.visible ? 'block' : 'none';
    }
  }

  createOverlayElement() {
    if (document.getElementById('nav-debug-overlay')) return;

    const div = document.createElement('div');
    div.id = 'nav-debug-overlay';
    div.style.position = 'absolute';
    div.style.top = '12px';
    div.style.left = '12px';
    div.style.width = '320px';
    div.style.backgroundColor = 'rgba(6, 14, 32, 0.92)';
    div.style.border = '1px solid #3f494a';
    div.style.borderRadius = '6px';
    div.style.padding = '10px 14px';
    div.style.color = '#e2e8f0';
    div.style.fontFamily = '"JetBrains Mono", monospace';
    div.style.fontSize = '11px';
    div.style.lineHeight = '1.45';
    div.style.zIndex = '9999';
    div.style.display = 'none';
    div.style.pointerEvents = 'none';
    div.style.boxShadow = '0 8px 24px rgba(0,0,0,0.5)';

    document.body.appendChild(div);
    this.overlayElement = div;
  }

  update(snapshot, watchdog) {
    if (!this.visible || !this.overlayElement || !snapshot) return;

    const r = snapshot.route || {};
    const s = snapshot.ship || {};
    const g = snapshot.guidance || {};
    const rec = this.recorder.getSummary();
    const w = watchdog || {};

    const targetColor = r.selected_target_is_forward ? '#22c55e' : '#ef4444';
    const statusColor = g.is_current_limited ? '#f97316' : '#22c55e';

    let watchdogColor = '#22c55e'; // Green
    if (w.status === 'WARNING') watchdogColor = '#f59e0b'; // Yellow
    else if (w.status === 'CRITICAL') watchdogColor = '#ef4444'; // Red

    this.overlayElement.innerHTML = `
      <div style="font-weight: bold; border-bottom: 1px solid #334155; padding-bottom: 4px; margin-bottom: 6px; color: #a1eff8; display: flex; justify-content: space-between;">
        <span>NAVIGATION DEBUG [F6]</span>
        <span style="color: ${rec.enabled ? '#22c55e' : '#94a3b8'}">${rec.enabled ? '● REC' : '○ OFF'}</span>
      </div>
      <div style="margin-bottom: 6px; padding: 4px 6px; background-color: rgba(15, 23, 42, 0.8); border-radius: 4px; border-left: 3px solid ${watchdogColor};">
        <div><strong>WATCHDOG:</strong> <span style="color: ${watchdogColor}; font-weight: bold;">${w.status || 'OK'}</span> (Mode: ${w.mode || 'analyze'})</div>
        <div><strong>ROUTE STABILITY:</strong> ${w.routeStability || 'STABLE'}</div>
        <div><strong>TRACK:</strong> ${w.trackStatus || 'CONVERGING'} | <strong>RUDDER-YAW:</strong> ${w.rudderYawStatus || 'CONSISTENT'}</div>
        <div><strong>LAST EVENT:</strong> ${w.lastEvent || 'NONE'}</div>
      </div>
      <div><strong>Route ID:</strong> ${r.id || 'N/A'}</div>
      <div><strong>Progress:</strong> Wp ${r.selected_waypoint_index} | Frac ${(r.route_progress_fraction * 100).toFixed(1)}%</div>
      <div><strong>Target Forward?:</strong> <span style="color: ${targetColor}">${r.selected_target_is_forward ? 'YES' : 'NO (REJECTED)'}</span></div>
      <div><strong>Guidance Mode:</strong> <span style="color: ${statusColor}">${g.mode || 'NORMAL'}</span></div>
      <div style="margin-top: 6px; font-weight: bold; color: #cbd5e1;">SHIP & HEADING</div>
      <div><strong>Position:</strong> (${s.position?.x?.toFixed(1)}, ${s.position?.y?.toFixed(1)})</div>
      <div><strong>SHIP HEADING:</strong> ${s.heading_deg?.toFixed(1)}°</div>
      <div><strong>TARGET HEADING:</strong> ${s.target_heading_deg?.toFixed(1)}°</div>
      <div><strong>RUDDER COMMAND:</strong> ${(s.rudder_command / 35.0)?.toFixed(2)}</div>
      <div><strong>Debug Radians:</strong> hdg=${s.heading_rad?.toFixed(3)}, tgt=${(s.target_heading_deg * Math.PI / 180)?.toFixed(3)}</div>
      <div style="margin-top: 6px; font-weight: bold; color: #cbd5e1;">VELOCITY & CURRENT</div>
      <div><strong>Ground Speed:</strong> ${s.ground_speed?.toFixed(1)} SU/s</div>
      <div><strong>Water Speed:</strong> ${s.water_speed?.toFixed(1)} SU/s</div>
      <div><strong>Current Vector:</strong> (${g.current_velocity?.x?.toFixed(2)}, ${g.current_velocity?.y?.toFixed(2)})</div>
      <div><strong>Cross-Track Error:</strong> ${g.cross_track_error?.toFixed(2)} SU</div>
      <div style="margin-top: 6px; font-weight: bold; color: #cbd5e1;">FLIGHT RECORDER [F7-F10]</div>
      <div><strong>Samples / Events:</strong> ${rec.totalSamples} / ${rec.totalEvents}</div>
      <div style="color: #94a3b8; font-size: 10px; margin-top: 2px;">F8: Export JSON | F10: Download Audit</div>
    `;
  }

  exportJsonFile() {
    const jsonStr = this.recorder.exportJson();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `astralis_flight_telemetry_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    console.log('[FlightRecorder] Telemetry JSON exported successfully.');
  }
}
