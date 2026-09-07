export interface SystemMetrics {
  cpuUsage: number;        // 0.0 to 1.0 (average CPU utilization)
  memoryUsage: number;     // 0.0 to 1.0 (used memory fraction)
  uptime: number;          // seconds
  loadAvg: number;         // 1-minute load average normalized by core count
  activityRate: number;    // 0.0 to 1.0 (recent event/tick activity rate)
  timestamp: number;
}

export interface SoundModulationParameters {
  tension: number;         // 0.0 - 1.0: drives dissonance, cutoff frequency, and distortion
  density: number;         // 0.0 - 1.0: drives generative note rate and polyphony
  timbre: number;          // 0.0 - 1.0: controls harmonic richness and resonance
  reverbSpace: number;     // 0.0 - 1.0: controls ambient space and decay time
  tempoBpm: number;        // 40 - 120 BPM: base rhythmic pulse
}

export interface TelemetryPayload {
  type: 'telemetry';
  metrics: SystemMetrics;
  modulation: SoundModulationParameters;
}
