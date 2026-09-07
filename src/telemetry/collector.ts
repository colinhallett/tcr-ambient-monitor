import * as os from 'node:os';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type { SystemMetrics, SoundModulationParameters, TelemetryPayload } from './types.js';

const execAsync = promisify(exec);

interface CpuSnapshot {
  idle: number;
  total: number;
}

interface NetworkSnapshot {
  bytesIn: number;
  bytesOut: number;
  timestamp: number;
}

export class TelemetryCollector {
  private lastCpuSnapshot: CpuSnapshot | null = null;
  private lastNetworkSnapshot: NetworkSnapshot | null = null;
  private lastSampleTime = Date.now();
  private activityPulseCounter = 0;
  private maxObservedPulse = 20;

  // Cached auxiliary metrics to prevent I/O blocking
  private cachedNetwork = { bytesInPerSec: 0, bytesOutPerSec: 0, activity: 0 };
  private cachedPower = { batteryPct: 100, isCharging: true };

  constructor() {
    this.lastCpuSnapshot = this.getCpuSnapshot();
    this.initAsyncPollers();
  }

  private initAsyncPollers(): void {
    // Poll network throughput periodically in background without blocking main event loop
    setInterval(() => this.pollNetworkStats(), 1000);
    setInterval(() => this.pollBatteryStats(), 5000);
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

  private async pollNetworkStats(): Promise<void> {
    try {
      // Sample network interface byte deltas (macOS & Linux compatible via netstat)
      // Privacy check: We only sum aggregate byte numbers, never packet contents or destinations
      const { stdout } = await execAsync('netstat -ibn', { timeout: 800 });
      const lines = stdout.split('\n');
      let totalIn = 0;
      let totalOut = 0;

      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].trim().split(/\s+/);
        // Look for link-layer interfaces excluding loopback (lo0)
        if (parts.length >= 10 && parts[0] && !parts[0].startsWith('lo') && parts[2] && parts[2].startsWith('<Link')) {
          const inBytes = parseInt(parts[6], 10);
          const outBytes = parseInt(parts[9], 10);
          if (!isNaN(inBytes)) totalIn += inBytes;
          if (!isNaN(outBytes)) totalOut += outBytes;
        }
      }

      const now = Date.now();
      if (this.lastNetworkSnapshot) {
        const timeDeltaSec = Math.max(0.2, (now - this.lastNetworkSnapshot.timestamp) / 1000);
        const inDelta = Math.max(0, totalIn - this.lastNetworkSnapshot.bytesIn);
        const outDelta = Math.max(0, totalOut - this.lastNetworkSnapshot.bytesOut);

        const bytesInPerSec = Math.round(inDelta / timeDeltaSec);
        const bytesOutPerSec = Math.round(outDelta / timeDeltaSec);

        // Calculate normalized network activity (0.0 to 1.0; 1MB/s active load = 1.0)
        const totalThroughput = bytesInPerSec + bytesOutPerSec;
        const activity = Math.min(1, Math.log10(1 + totalThroughput / 50000) / 2.0);

        this.cachedNetwork = { bytesInPerSec, bytesOutPerSec, activity };
      }

      this.lastNetworkSnapshot = {
        bytesIn: totalIn,
        bytesOut: totalOut,
        timestamp: now
      };
    } catch {
      // Fallback silently if netstat is unavailable
    }
  }

  private async pollBatteryStats(): Promise<void> {
    try {
      const { stdout } = await execAsync('pmset -g batt', { timeout: 1000 });
      const matchPct = stdout.match(/(\d+)%/);
      const isCharging = stdout.includes('charging') || stdout.includes('AC Power') || stdout.includes('charged');
      this.cachedPower = {
        batteryPct: matchPct ? parseInt(matchPct[1], 10) : 100,
        isCharging
      };
    } catch {
      // Non-macOS or battery-less desktop fallback
    }
  }

  public registerActivityPulse(weight = 1): void {
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

    const activityRate = Math.min(1, this.activityPulseCounter / this.maxObservedPulse);
    this.activityPulseCounter = 0;

    return {
      cpuUsage,
      memoryUsage,
      uptime: os.uptime(),
      loadAvg,
      activityRate,
      network: { ...this.cachedNetwork },
      power: { ...this.cachedPower },
      timestamp: Date.now()
    };
  }

  public computeModulation(metrics: SystemMetrics): SoundModulationParameters {
    const tension = Math.min(1, metrics.cpuUsage * 0.7 + metrics.loadAvg * 0.3);
    const density = Math.min(1, metrics.activityRate * 0.5 + metrics.network.activity * 0.3 + metrics.memoryUsage * 0.2);
    const timbre = Math.min(1, 0.2 + metrics.cpuUsage * 0.5 + (metrics.memoryUsage * 0.3));
    const reverbSpace = Math.max(0.2, 1 - metrics.cpuUsage * 0.5);
    const tempoBpm = Math.round(50 + tension * 30 + metrics.activityRate * 12 + metrics.network.activity * 8);

    // Shimmer sparkle driven by real-time network traffic
    const shimmer = Math.min(1, metrics.network.activity * 0.85 + metrics.activityRate * 0.15);

    // Visual warp speed combined from network + tension
    const warpSpeed = Math.min(1, metrics.network.activity * 0.6 + tension * 0.4);

    return {
      tension,
      density,
      timbre,
      reverbSpace,
      tempoBpm,
      shimmer,
      warpSpeed
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
