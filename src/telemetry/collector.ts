import * as os from 'node:os';
import type { SystemMetrics, SoundModulationParameters, TelemetryPayload } from './types.js';

interface CpuSnapshot {
  idle: number;
  total: number;
}

export class TelemetryCollector {
  private lastCpuSnapshot: CpuSnapshot | null = null;
  private activityPulseCounter = 0;
  private maxObservedPulse = 20;

  constructor() {
    this.lastCpuSnapshot = this.getCpuSnapshot();
  }

  private getCpuSnapshot(): CpuSnapshot {
    const cpus = os.cpus();
    let idle = 0;
    let total = 0;

    for (const cpu of cpus) {
      idle += cpu.times.idle;
      total += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.irq + cpu.times.idle;
    }

    return { idle, total };
  }

  public registerActivityPulse(weight = 1): void {
    // Collects only volume/frequency of activity pulses (data minimization: no payload/keys captured)
    this.activityPulseCounter += weight;
  }

  public sampleMetrics(): SystemMetrics {
    const currentSnapshot = this.getCpuSnapshot();
    let cpuUsage = 0.1;

    if (this.lastCpuSnapshot) {
      const idleDelta = currentSnapshot.idle - this.lastCpuSnapshot.idle;
      const totalDelta = currentSnapshot.total - this.lastCpuSnapshot.total;
      if (totalDelta > 0) {
        cpuUsage = Math.max(0, Math.min(1, 1 - idleDelta / totalDelta));
      }
    }
    this.lastCpuSnapshot = currentSnapshot;

    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const memoryUsage = Math.max(0, Math.min(1, (totalMem - freeMem) / totalMem));

    const coreCount = os.cpus().length || 1;
    const loadAvg = Math.max(0, Math.min(1, (os.loadavg()[0] || 0) / coreCount));

    // Calculate activity rate and reset counter for the next interval
    const activityRate = Math.min(1, this.activityPulseCounter / this.maxObservedPulse);
    this.activityPulseCounter = 0;

    return {
      cpuUsage,
      memoryUsage,
      uptime: os.uptime(),
      loadAvg,
      activityRate,
      timestamp: Date.now()
    };
  }

  public computeModulation(metrics: SystemMetrics): SoundModulationParameters {
    // Map raw system telemetry into musical ambient modulators
    // CPU usage increases tension and filter brightness
    const tension = Math.min(1, metrics.cpuUsage * 0.7 + metrics.loadAvg * 0.3);

    // Activity rate and memory modulate arpeggiator note density
    const density = Math.min(1, metrics.activityRate * 0.6 + metrics.memoryUsage * 0.4);

    // Timbre / harmonic resonance derived from memory pressure and CPU
    const timbre = Math.min(1, 0.2 + metrics.cpuUsage * 0.5 + (metrics.memoryUsage * 0.3));

    // Reverb decay space expands when system is calm (low CPU)
    const reverbSpace = Math.max(0.2, 1 - metrics.cpuUsage * 0.6);

    // BPM subtly tracks overall system energy (50 to 95 BPM for ambient chill/focus)
    const tempoBpm = Math.round(50 + tension * 35 + metrics.activityRate * 10);

    return {
      tension,
      density,
      timbre,
      reverbSpace,
      tempoBpm
    };
  }

  public getPayload(): TelemetryPayload {
    const metrics = this.sampleMetrics();
    const modulation = this.computeModulation(metrics);

    return {
      type: 'telemetry',
      metrics,
      modulation
    };
  }
}
