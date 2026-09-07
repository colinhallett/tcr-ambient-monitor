import type { VisualizerAudioData } from '../audio/engine.js';
import type { SystemMetrics, SoundModulationParameters } from '../telemetry/types.js';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  baseRadius: number;
  alpha: number;
  angle: number;
  orbitRadius: number;
  orbitSpeed: number;
  hueOffset: number;
}

export class AmbientVisualizer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private animationFrameId: number | null = null;
  private particles: Particle[] = [];
  private numParticles = 160;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not get 2D canvas context');
    this.ctx = context;

    this.resize();
    this.initParticles();
    window.addEventListener('resize', () => this.resize());
  }

  private resize(): void {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  private initParticles(): void {
    this.particles = [];
    const width = this.canvas.width;
    const height = this.canvas.height;
    const maxDimension = Math.max(width, height);

    for (let i = 0; i < this.numParticles; i++) {
      this.particles.push({
        x: width / 2,
        y: height / 2,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        radius: 1.5 + Math.random() * 2.5,
        baseRadius: 1.5 + Math.random() * 2.5,
        alpha: 0.2 + Math.random() * 0.6,
        angle: Math.random() * Math.PI * 2,
        orbitRadius: 40 + Math.random() * (maxDimension * 0.45),
        orbitSpeed: (0.002 + Math.random() * 0.005) * (Math.random() > 0.5 ? 1 : -1),
        hueOffset: Math.random() * 60 - 30
      });
    }
  }

  public render(
    audioData: VisualizerAudioData,
    metrics: SystemMetrics | null,
    modulation: SoundModulationParameters | null
  ): void {
    const { ctx, canvas } = this;
    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;

    // Fade trail effect for motion blur
    ctx.fillStyle = 'rgba(10, 14, 23, 0.18)';
    ctx.fillRect(0, 0, width, height);

    const tension = modulation?.tension ?? 0.2;
    const density = modulation?.density ?? 0.3;
    const cpu = metrics?.cpuUsage ?? 0.1;

    // Calculate energy from audio FFT
    let audioEnergy = 0;
    if (audioData.frequencyData && audioData.frequencyData.length > 0) {
      let sum = 0;
      for (let i = 0; i < audioData.frequencyData.length; i++) {
        // FFT values in Tone are in dB (-100 to 0)
        const val = Math.max(0, (audioData.frequencyData[i] + 90) / 90);
        sum += val;
      }
      audioEnergy = sum / audioData.frequencyData.length;
    }

    // Dynamic base hue: shifts from deep cyan/blue (210) to purple/magenta/orange (300+) under high CPU
    const baseHue = 210 + tension * 110;

    // 1. Draw central glowing circular waveform
    if (audioData.waveformTimeDomain && audioData.waveformTimeDomain.length > 0) {
      ctx.save();
      ctx.beginPath();
      const wave = audioData.waveformTimeDomain;
      const baseRingRadius = Math.min(width, height) * 0.18 + audioEnergy * 30;

      for (let i = 0; i < wave.length; i++) {
        const angle = (i / wave.length) * Math.PI * 2;
        const amplitude = (wave[i] || 0) * (50 + tension * 80);
        const r = baseRingRadius + amplitude;
        const x = centerX + Math.cos(angle) * r;
        const y = centerY + Math.sin(angle) * r;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.closePath();
      ctx.strokeStyle = `hsla(${baseHue}, 80%, 65%, ${0.3 + audioEnergy * 0.5})`;
      ctx.lineWidth = 2 + tension * 2;
      ctx.shadowBlur = 18 + tension * 25;
      ctx.shadowColor = `hsl(${baseHue}, 90%, 60%)`;
      ctx.stroke();
      ctx.restore();
    }

    // 2. Render and update orbit particles
    for (const p of this.particles) {
      p.angle += p.orbitSpeed * (1 + tension * 2.5 + density * 1.5);

      // Particle wobble with audio reactivity
      const wobble = Math.sin(p.angle * 4) * (10 + audioEnergy * 40);
      const currentOrbit = p.orbitRadius + wobble;

      p.x = centerX + Math.cos(p.angle) * currentOrbit;
      p.y = centerY + Math.sin(p.angle) * currentOrbit;

      const dynamicRadius = p.baseRadius * (1 + audioEnergy * 1.8 + cpu * 0.8);
      const hue = (baseHue + p.hueOffset + 360) % 360;

      ctx.save();
      ctx.beginPath();
      ctx.arc(p.x, p.y, dynamicRadius, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${hue}, 85%, 60%, ${p.alpha * (0.6 + audioEnergy * 0.8)})`;
      ctx.shadowBlur = 8 + audioEnergy * 15;
      ctx.shadowColor = `hsl(${hue}, 90%, 65%)`;
      ctx.fill();
      ctx.restore();
    }
  }

  public startAnimation(
    getAudioData: () => VisualizerAudioData,
    getMetrics: () => SystemMetrics | null,
    getModulation: () => SoundModulationParameters | null
  ): void {
    const loop = () => {
      this.render(getAudioData(), getMetrics(), getModulation());
      this.animationFrameId = requestAnimationFrame(loop);
    };
    loop();
  }

  public stopAnimation(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }
}
