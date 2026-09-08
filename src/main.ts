import { AmbientAudioEngine } from './audio/engine.js';
import { AmbientVisualizer } from './visualizer/canvas.js';
import type { SystemMetrics, SoundModulationParameters, TelemetryPayload } from './telemetry/types.js';

class AmbientApp {
  private audioEngine: AmbientAudioEngine;
  private visualizer: AmbientVisualizer;
  private ws: WebSocket | null = null;
  private metrics: SystemMetrics | null = null;
  private modulation: SoundModulationParameters | null = null;

  // UI Elements
  private btnToggleAudio!: HTMLButtonElement;
  private btnSimulatePulse!: HTMLButtonElement;
  private audioLabel!: HTMLElement;
  private audioIcon!: HTMLElement;
  private statusBadge!: HTMLElement;
  private statusDot!: HTMLElement;
  private statusText!: HTMLElement;

  private valCpu!: HTMLElement;
  private valMem!: HTMLElement;
  private valNet!: HTMLElement;
  private valPower!: HTMLElement;
  private valTension!: HTMLElement;
  private valDensity!: HTMLElement;

  private barCpu!: HTMLElement;
  private barMem!: HTMLElement;
  private barNet!: HTMLElement;
  private barPower!: HTMLElement;
  private barTension!: HTMLElement;
  private barDensity!: HTMLElement;

  constructor() {
    const canvas = document.getElementById('visualizer-canvas') as HTMLCanvasElement;
    this.audioEngine = new AmbientAudioEngine();
    this.visualizer = new AmbientVisualizer(canvas);

    this.bindUiElements();
    this.setupEventListeners();
    this.connectTelemetry();

    // Start visualizer loop immediately
    this.visualizer.startAnimation(
      () => this.audioEngine.getAudioVisualizerData(),
      () => this.metrics,
      () => this.modulation
    );
  }

  private bindUiElements(): void {
    this.btnToggleAudio = document.getElementById('btn-toggle-audio') as HTMLButtonElement;
    this.btnSimulatePulse = document.getElementById('btn-simulate-pulse') as HTMLButtonElement;
    this.audioLabel = document.getElementById('audio-label') as HTMLElement;
    this.audioIcon = document.getElementById('audio-icon') as HTMLElement;
    this.statusBadge = document.getElementById('status-badge') as HTMLElement;
    this.statusDot = document.getElementById('status-dot') as HTMLElement;
    this.statusText = document.getElementById('status-text') as HTMLElement;

    this.valCpu = document.getElementById('val-cpu') as HTMLElement;
    this.valMem = document.getElementById('val-mem') as HTMLElement;
    this.valNet = document.getElementById('val-net') as HTMLElement;
    this.valPower = document.getElementById('val-power') as HTMLElement;
    this.valTension = document.getElementById('val-tension') as HTMLElement;
    this.valDensity = document.getElementById('val-density') as HTMLElement;

    this.barCpu = document.getElementById('bar-cpu') as HTMLElement;
    this.barMem = document.getElementById('bar-mem') as HTMLElement;
    this.barNet = document.getElementById('bar-net') as HTMLElement;
    this.barPower = document.getElementById('bar-power') as HTMLElement;
    this.barTension = document.getElementById('bar-tension') as HTMLElement;
    this.barDensity = document.getElementById('bar-density') as HTMLElement;
  }

  private setupEventListeners(): void {
    this.btnToggleAudio.addEventListener('click', async () => {
      if (this.audioEngine.isActive) {
        this.audioEngine.stop();
        this.audioLabel.textContent = 'Start Ambient Engine';
        this.audioIcon.textContent = '▶';
        this.btnToggleAudio.classList.add('btn-primary');
      } else {
        await this.audioEngine.start();
        if (this.modulation) {
          this.audioEngine.updateModulation(this.modulation);
        }
        this.audioLabel.textContent = 'Pause Ambient Engine';
        this.audioIcon.textContent = '⏸';
        this.btnToggleAudio.classList.remove('btn-primary');
      }
    });

    this.btnSimulatePulse.addEventListener('click', () => {
      this.sendActivityPulse(5);
      this.visualizer.addShockwave();
    });

    // Capture user interaction rate safely (never logging or storing keys)
    window.addEventListener('keydown', () => {
      this.sendActivityPulse(1);
      this.visualizer.addShockwave();
    });

    let mouseThrottle = 0;
    window.addEventListener('mousemove', (e) => {
      const now = Date.now();
      // Calculate normalized stereo pan from mouse X position (-1.0 to 1.0)
      const pan = (e.clientX / window.innerWidth) * 2 - 1;
      this.audioEngine.setPan(pan);

      if (now - mouseThrottle > 120) {
        mouseThrottle = now;
        this.sendActivityPulse(0.5);
      }
    });
  }

  private sendActivityPulse(weight: number): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'activity_pulse', weight }));
    }
  }

  private connectTelemetry(): void {
    const wsUrl = `ws://${window.location.hostname}:8765`;
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      this.statusDot.classList.remove('offline');
      this.statusText.textContent = 'Telemetry Connected';
      this.statusBadge.style.borderColor = 'rgba(0, 242, 254, 0.4)';
    };

    this.ws.onmessage = (event) => {
      try {
        const payload: TelemetryPayload = JSON.parse(event.data);
        if (payload.type === 'telemetry') {
          this.metrics = payload.metrics;
          this.modulation = payload.modulation;

          this.updateUiMetrics(payload.metrics, payload.modulation);
          this.audioEngine.updateModulation(payload.modulation);
        }
      } catch (err) {
        console.error('Failed to parse telemetry message:', err);
      }
    };

    this.ws.onclose = () => {
      this.statusDot.classList.add('offline');
      this.statusText.textContent = 'Telemetry Disconnected (Retrying...)';
      this.statusBadge.style.borderColor = 'rgba(239, 68, 68, 0.4)';
      setTimeout(() => this.connectTelemetry(), 2500);
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  private formatBandwidth(bytesPerSec: number): string {
    if (bytesPerSec < 1024) return `${bytesPerSec} B/s`;
    if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
    return `${(bytesPerSec / (1024 * 1024)).toFixed(2)} MB/s`;
  }

  private updateUiMetrics(metrics: SystemMetrics, modulation: SoundModulationParameters): void {
    const cpuPct = Math.round(metrics.cpuUsage * 100);
    const memPct = Math.round(metrics.memoryUsage * 100);
    const totalBandwidth = metrics.network.bytesInPerSec + metrics.network.bytesOutPerSec;

    this.valCpu.textContent = `${cpuPct}%`;
    this.valMem.textContent = `${memPct}%`;
    this.valNet.textContent = this.formatBandwidth(totalBandwidth);
    this.valPower.textContent = `${metrics.power.batteryPct}% ${metrics.power.isCharging ? '⚡' : '🔋'}`;
    this.valTension.textContent = modulation.tension.toFixed(2);
    this.valDensity.textContent = modulation.density.toFixed(2);

    this.barCpu.style.width = `${cpuPct}%`;
    this.barMem.style.width = `${memPct}%`;
    this.barNet.style.width = `${Math.round(metrics.network.activity * 100)}%`;
    this.barPower.style.width = `${metrics.power.batteryPct}%`;
    this.barTension.style.width = `${Math.round(modulation.tension * 100)}%`;
    this.barDensity.style.width = `${Math.round(modulation.density * 100)}%`;
  }
}

// Initialize on DOM load
window.addEventListener('DOMContentLoaded', () => {
  new AmbientApp();
});
