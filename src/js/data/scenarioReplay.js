/**
 * ASTRALIS Nav-OS — Scenario Replay System (Phase 10)
 *
 * Records and replays navigation scenarios with metadata, event timestamps,
 * and JSON import/export functionality.
 */

export class ScenarioReplay {
  constructor() {
    this.recordings = [];
    this.currentRecording = null;
    this.isRecording = false;
    this.isReplaying = false;

    this.playbackIndex = 0;
    this.playbackStartTime = 0;
    this.playbackSpeed = 1.0;

    this.onPlaybackEvent = null;
  }

  startRecording(scenarioName = 'Antarctic_Mission') {
    if (this.isRecording) {
      console.warn('[ScenarioReplay] Already recording');
      return;
    }

    this.currentRecording = {
      name: scenarioName,
      startTime: performance.now(),
      events: [],
      metadata: {
        timestamp: new Date().toISOString(),
        notes: 'ASTRALIS Nav-OS Scenario Recording'
      }
    };

    this.isRecording = true;
    this.recordings.push(this.currentRecording);

    console.info(`[ScenarioReplay] Started recording scenario: ${scenarioName}`);
  }

  stopRecording() {
    if (!this.isRecording || !this.currentRecording) return;

    const duration = (performance.now() - this.currentRecording.startTime) / 1000;
    this.currentRecording.duration = duration;
    this.isRecording = false;

    console.info(`[ScenarioReplay] Stopped recording ${this.currentRecording.name}: ${this.currentRecording.events.length} events (${duration.toFixed(1)}s)`);
    this.currentRecording = null;
  }

  recordEvent(eventType, data) {
    if (!this.isRecording || !this.currentRecording) return;

    const event = {
      timestamp: performance.now() - this.currentRecording.startTime,
      type: eventType,
      data: JSON.parse(JSON.stringify(data || {}))
    };

    this.currentRecording.events.push(event);
  }

  exportRecording(recordingIndex = null, filename = null) {
    const idx = recordingIndex !== null ? recordingIndex : (this.recordings.length - 1);
    const recording = this.recordings[idx];

    if (!recording) {
      console.error('[ScenarioReplay] No recording found to export');
      return;
    }

    const exportData = {
      name: recording.name,
      events: recording.events,
      metadata: recording.metadata,
      duration: recording.duration || 0
    };

    const jsonData = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = filename || `scenario_${recording.name.replace(/\s+/g, '_')}.json`;
    link.style.display = 'none';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);

    console.info(`[ScenarioReplay] Exported scenario: ${recording.name}`);
  }

  importRecording(jsonData) {
    try {
      const importData = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;

      const recording = {
        name: importData.name || 'Imported Scenario',
        startTime: 0,
        events: importData.events || [],
        metadata: importData.metadata || {},
        duration: importData.duration || 0
      };

      this.recordings.push(recording);
      console.info(`[ScenarioReplay] Imported scenario: ${recording.name} (${recording.events.length} events)`);
      return recording;
    } catch (error) {
      console.error('[ScenarioReplay] Import failed:', error);
      return null;
    }
  }

  playRecording(recordingIndex = null, speed = 1.0) {
    const idx = recordingIndex !== null ? recordingIndex : (this.recordings.length - 1);
    const recording = this.recordings[idx];

    if (!recording || recording.events.length === 0) {
      console.warn('[ScenarioReplay] No events to play');
      return;
    }

    this.isReplaying = true;
    this.isRecording = false;
    this.playbackIndex = 0;
    this.playbackStartTime = performance.now();
    this.playbackSpeed = speed;

    console.info(`[ScenarioReplay] Playing scenario ${recording.name} at ${speed}x speed`);
    this.scheduleNextEvent(recording);
  }

  scheduleNextEvent(recording) {
    if (!this.isReplaying || this.playbackIndex >= recording.events.length) {
      this.stopPlayback();
      return;
    }

    const event = recording.events[this.playbackIndex];
    const scheduledTime = this.playbackStartTime + (event.timestamp / this.playbackSpeed);
    const delay = Math.max(0, scheduledTime - performance.now());

    setTimeout(() => {
      if (this.isReplaying) {
        this.triggerEvent(event);
        this.playbackIndex++;
        this.scheduleNextEvent(recording);
      }
    }, delay);
  }

  triggerEvent(event) {
    if (this.onPlaybackEvent) {
      this.onPlaybackEvent(event);
    }
    console.debug(`[Replay Event ${this.playbackIndex}] ${event.type}:`, event.data);
  }

  stopPlayback() {
    this.isReplaying = false;
    this.playbackIndex = 0;
    console.info('[ScenarioReplay] Playback stopped');
  }

  pausePlayback() {
    this.isReplaying = false;
    console.info('[ScenarioReplay] Playback paused');
  }

  getRecordings() {
    return this.recordings.map((r, i) => ({
      index: i,
      name: r.name,
      eventCount: r.events.length,
      duration: r.duration || 0
    }));
  }

  clearRecordings() {
    this.recordings = [];
    this.currentRecording = null;
    console.info('[ScenarioReplay] Recordings cleared');
  }
}

export const scenarioReplay = new ScenarioReplay();
