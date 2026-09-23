/**
 * POLARIS Nav-OS — Text-to-Speech (TTS) Bridge Voice Alerts (Phase 4)
 *
 * Provides audible voice alerts for bridge officers with rate limiting, cooldowns,
 * priority levels, and mute controls using the Web SpeechSynthesis API.
 */

export const ALERT_PRIORITY = {
  INFO: 1,
  WARNING: 2,
  CRITICAL: 3,
  EMERGENCY: 4
};

export class BridgeVoiceAlerts {
  constructor(options = {}) {
    this.enabled = options.enabled !== undefined ? options.enabled : true;
    this.muted = options.muted || false;
    this.cooldownMs = options.cooldownMs || 5000; // 5s speech cooldown between alerts
    this.lastSpokenTime = 0;
    this.lastSpokenText = "";
    
    this.synth = (typeof window !== 'undefined' && 'speechSynthesis' in window) ? window.speechSynthesis : null;
    this.selectedVoice = null;

    if (this.synth) {
      this._initVoice();
    }
  }

  _initVoice() {
    if (!this.synth) return;
    const loadVoices = () => {
      const voices = this.synth.getVoices();
      // Prefer English nautical / clear voice
      this.selectedVoice = voices.find(v => v.lang.startsWith('en') && v.name.includes('Natural')) ||
                         voices.find(v => v.lang.startsWith('en')) ||
                         voices[0];
    };
    loadVoices();
    if (this.synth.onvoiceschanged !== undefined) {
      this.synth.onvoiceschanged = loadVoices;
    }
  }

  /**
   * Speak bridge alert with rate limiting and priority evaluation.
   */
  speak(text, priority = ALERT_PRIORITY.WARNING) {
    if (!this.enabled || this.muted || !this.synth) return false;
    
    const now = performance.now();
    
    // Suppress duplicate or high-frequency announcements
    if (text === this.lastSpokenText && (now - this.lastSpokenTime < this.cooldownMs * 2)) {
      return false;
    }
    if (priority < ALERT_PRIORITY.CRITICAL && (now - this.lastSpokenTime < this.cooldownMs)) {
      return false;
    }

    try {
      // Cancel previous utterances if emergency alert is declared
      if (priority >= ALERT_PRIORITY.CRITICAL) {
        this.synth.cancel();
      }

      const utterance = new SpeechSynthesisUtterance(text);
      if (this.selectedVoice) {
        utterance.voice = this.selectedVoice;
      }
      utterance.rate = 1.0;
      utterance.pitch = priority >= ALERT_PRIORITY.EMERGENCY ? 1.2 : 1.0;
      utterance.volume = 1.0;

      this.synth.speak(utterance);
      this.lastSpokenTime = now;
      this.lastSpokenText = text;
      return true;
    } catch (e) {
      console.warn('[BridgeVoiceAlerts] Speech synthesis failed:', e.message);
      return false;
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.muted && this.synth) {
      this.synth.cancel();
    }
    return this.muted;
  }
}
