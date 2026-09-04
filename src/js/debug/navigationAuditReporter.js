/**
 * ASTRALIS Nav-OS — Automatic Navigation Audit Reporter & Exporter
 *
 * Automatically generates downloadable JSON and Markdown audit reports
 * upon anomaly trigger, route churn, simulation completion, or F10 keypress.
 */

export class NavigationAuditReporter {
  constructor(watchdog, flightRecorder) {
    this.watchdog = watchdog;
    this.recorder = flightRecorder;
    this.setupKeyboardShortcuts();
  }

  setupKeyboardShortcuts() {
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', (e) => {
        if (e.key === 'F10') {
          e.preventDefault();
          this.downloadAuditReport();
          console.log('[AuditReporter] Audit report generated and downloaded via F10.');
        }
      });
    }
  }

  generateReportData() {
    const summary = this.recorder ? this.recorder.getSummary() : {};
    const samples = this.watchdog ? this.watchdog.samples : [];
    const watchdogEvents = this.watchdog ? this.watchdog.events : [];
    const recEvents = this.recorder ? this.recorder.events : [];

    const firstSample = samples[0] || {};
    const lastSample = samples[samples.length - 1] || {};

    const distStart = firstSample.ship?.distance_to_destination || 0;
    const distEnd = lastSample.ship?.distance_to_destination || 0;
    let minDist = distStart;
    let maxDist = distStart;

    for (const s of samples) {
      const d = s.ship?.distance_to_destination || 0;
      minDist = Math.min(minDist, d);
      maxDist = Math.max(maxDist, d);
    }

    return {
      provenance: {
        source: "runtime simulation watchdog & telemetry",
        data_provenance: "POLARIS digital twin runtime simulation",
        is_real_vessel_field_telemetry: false
      },
      sessionId: summary.sessionId || `session_${Date.now()}`,
      exportTimestamp: new Date().toISOString(),
      watchdogStatus: this.watchdog?.status || 'UNKNOWN',
      watchdogMode: this.watchdog?.mode || 'analyze',
      totalSamples: samples.length,
      totalWatchdogEvents: watchdogEvents.length,
      routeConvergence: {
        initialDistance: distStart,
        finalDistance: distEnd,
        minimumDistance: minDist,
        maximumDistance: maxDist,
        netDistanceReduction: distStart - distEnd
      },
      watchdogEvents,
      flightRecorderEvents: recEvents,
      recentSnapshots: samples.slice(-20)
    };
  }

  downloadAuditReport() {
    const report = this.generateReportData();

    // 1. Download JSON
    const jsonStr = JSON.stringify(report, null, 2);
    const jsonBlob = new Blob([jsonStr], { type: 'application/json' });
    const jsonUrl = URL.createObjectURL(jsonBlob);
    const aJson = document.createElement('a');
    aJson.href = jsonUrl;
    aJson.download = `astralis_navigation_audit_${Date.now()}.json`;
    aJson.click();
    URL.revokeObjectURL(jsonUrl);

    // 2. Download Markdown
    const mdStr = this.generateMarkdownReport(report);
    const mdBlob = new Blob([mdStr], { type: 'text/markdown' });
    const mdUrl = URL.createObjectURL(mdBlob);
    const aMd = document.createElement('a');
    aMd.href = mdUrl;
    aMd.download = `astralis_navigation_audit_${Date.now()}.md`;
    aMd.click();
    URL.revokeObjectURL(mdUrl);
  }

  generateMarkdownReport(report) {
    const c = report.routeConvergence || {};
    const events = report.watchdogEvents || [];

    let md = `# ASTRALIS Automatic Navigation Audit Report (${report.sessionId})\n\n`;
    md += `> **Provenance**: ${report.provenance.source} | ${report.provenance.data_provenance}\n\n`;
    md += `- **Export Timestamp**: ${report.exportTimestamp}\n`;
    md += `- **Watchdog Status**: **${report.watchdogStatus}** (Mode: \`${report.watchdogMode}\`)\n`;
    md += `- **Total Samples Captured**: ${report.totalSamples}\n`;
    md += `- **Total Watchdog Events**: ${events.length}\n\n`;

    md += `## Route Convergence Metrics\n`;
    md += `- **Initial Distance**: ${c.initialDistance?.toFixed(1)} SU\n`;
    md += `- **Final Distance**: ${c.finalDistance?.toFixed(1)} SU\n`;
    md += `- **Net Distance Reduction**: ${c.netDistanceReduction?.toFixed(1)} SU\n`;
    md += `- **Minimum Distance Reached**: ${c.minimumDistance?.toFixed(1)} SU\n\n`;

    md += `## Watchdog Anomaly Events\n\n`;
    if (events.length === 0) {
      md += `*No navigation anomalies detected during this session.*\n\n`;
    } else {
      for (const e of events) {
        md += `- **[${e.severity.toUpperCase()}]** \`${e.type}\`: ${e.message} (t=${e.timestamp_ms})\n`;
      }
      md += `\n`;
    }

    md += `## System Diagnosis & Recommendations\n`;
    if (report.watchdogStatus === 'OK') {
      md += `✅ Navigation system operating within nominal parameters. Steering, current compensation, and route progress are aligned.\n`;
    } else {
      md += `⚠️ Anomalies detected. Inspect recent snapshots in JSON export for exact cross-track and rudder traces.\n`;
    }

    return md;
  }
}
