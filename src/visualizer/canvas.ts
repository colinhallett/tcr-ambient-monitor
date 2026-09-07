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

interface WarpStream {
  x: number;
  y: number;
  length: number;
  speed: number;
  alpha: number;
  hue: number;
}

interface Shockwave {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  alpha: number;
  hue: number;
}

export class AmbientVisualizer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private animationFrameId: number | null = null;
  private particles: Particle[] = [];
  private warpStreams: WarpStream[] = [];
  private shockwaves: Shockwave[] = [];
  private numParticles = 180;
  private mouseX = 0;
  private mouseY = 0;
  private targetMouseX = 0;
  private targetMouseY = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not get 2D canvas context');
    this.ctx = context;

    this.resize();
    this.initParticles();
    this.initWarpStreams();
    this.setupListeners();
  }

  private resize(): void {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.mouseX = this.canvas.width / 2;
    this.mouseY = this.canvas.height / 2;
    this.targetMouseX = this.mouseX;
    this.targetMouseY = this.mouseY;
  }

  private setupListeners(): void {
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('mousemove', (e) => {
      this.targetMouseX = e.clientX;
      this.targetMouseY = e.clientY;
    });
    window.addEventListener('pointerdown', (e) => {
      this.addShockwave(e.clientX, e.clientY);
    });
  }

  public addShockwave(x?: number, y?: number): void {
    const posX = x ?? this.canvas.width / 2 + (Math.random() - 0.5) * 200;
    const posY = y ?? this.canvas.height / 2 + (Math.random() - 0.5) * 200;
    this.shockwaves.push({
      x: posX,
      y: posY,
      radius: 5,
      maxRadius: 180 + Math.random() * 120,
      alpha: 0.9,
      hue: Math.random() * 60 + 190
    });
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
        vx: 0,
        vy: 0,
        radius: 1.5 + Math.random() * 3,
        baseRadius: 1.5 + Math.random() * 3,
        alpha: 0.25 + Math.random() * 0.6,
        angle: Math.random() * Math.PI * 2,
        orbitRadius: 30 + Math.random() * (maxDimension * 0.48),
        orbitSpeed: (0.002 + Math.random() * 0.006) * (Math.random() > 0.5 ? 1 : -1),
        hueOffset: Math.random() * 70 - 35
      });
    }
  }

  private initWarpStreams(): void {
    this.warpStreams = [];
    const count = 40;
    for (let i = 0; i < count; i++) {
      this.warpStreams.push({
        x: Math.random() * this.canvas.width,
        y: Math.random() * this.canvas.height,
        length: 20 + Math.random() * 80,
        speed: 4 + Math.random() * 12,
        alpha: 0.1 + Math.random() * 0.4,
        hue: 180 + Math.random() * 80
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

    // Smooth mouse interpolation for parallax
    this.mouseX += (this.targetMouseX - this.mouseX) * 0.05;
    this.mouseY += (this.targetMouseY - this.mouseY) * 0.05;

    const offsetX = (this.mouseX - width / 2) * 0.15;
    const offsetY = (this.mouseY - height / 2) * 0.15;
    const centerX = width / 2 + offsetX;
    const centerY = height / 2 + offsetY;

    // Motion blur trail
    ctx.fillStyle = 'rgba(10, 14, 23, 0.2)';
    ctx.fillRect(0, 0, width, height);

    const tension = modulation?.tension ?? 0.2;
    const density = modulation?.density ?? 0.3;
    const shimmer = modulation?.shimmer ?? 0;
    const warpSpeed = modulation?.warpSpeed ?? 0;
    const networkAct = metrics?.network.activity ?? 0;
    const isCharging = metrics?.power.isCharging ?? true;

    // Audio energy integration
    let audioEnergy = 0;
    if (audioData.frequencyData && audioData.frequencyData.length > 0) {
      let sum = 0;
      for (let i = 0; i < audioData.frequencyData.length; i++) {
        const val = Math.max(0, (audioData.frequencyData[i] + 90) / 90);
        sum += val;
      }
      audioEnergy = sum / audioData.frequencyData.length;
    }

    // Dynamic base hue: shifts with tension and charging state
    const baseHue = isCharging
      ? 200 + tension * 120
      : 280 + tension * 80;

    // 1. Draw Network Warp Streams (shooting stars / bandwidth rays)
    if (networkAct > 0.05 || warpSpeed > 0.1) {
      ctx.save();
      for (const s of this.warpStreams) {
        s.x += s.speed * (1 + warpSpeed * 3);
        if (s.x > width + 100) {
          s.x = -100;
          s.y = Math.random() * height;
        }

        ctx.beginPath();
        const grad = ctx.createLinearGradient(s.x, s.y, s.x - s.length * (1 + warpSpeed * 2), s.y);
        grad.addColorStop(0, `hsla(${baseHue + 40}, 95%, 75%, ${s.alpha * (0.4 + networkAct * 0.6)})`);
        grad.addColorStop(1, 'transparent');
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.5 + networkAct * 2;
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x - s.length * (1 + warpSpeed * 2), s.y);
        ctx.stroke();
      }
      ctx.restore();
    }

    // 2. Render and animate Shockwaves
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const sw = this.shockwaves[i];
      sw.radius += 5.5 + tension * 4;
      sw.alpha *= 0.94;

      if (sw.alpha < 0.02 || sw.radius > sw.maxRadius) {
        this.shockwaves.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.beginPath();
      ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
      ctx.strokeStyle = `hsla(${sw.hue}, 90%, 65%, ${sw.alpha})`;
      ctx.lineWidth = 3;
      ctx.shadowBlur = 20;
      ctx.shadowColor = `hsl(${sw.hue}, 100%, 70%)`;
      ctx.stroke();
      ctx.restore();
    }

    // 3. Central glowing circular waveform
    if (audioData.waveformTimeDomain && audioData.waveformTimeDomain.length > 0) {
      ctx.save();
      ctx.beginPath();
      const wave = audioData.waveformTimeDomain;
      const baseRingRadius = Math.min(width, height) * 0.18 + audioEnergy * 35;

      for (let i = 0; i < wave.length; i++) {
        const angle = (i / wave.length) * Math.PI * 2;
        const amplitude = (wave[i] || 0) * (50 + tension * 90 + shimmer * 40);
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
      ctx.strokeStyle = `hsla(${baseHue}, 85%, 65%, ${0.35 + audioEnergy * 0.55})`;
      ctx.lineWidth = 2 + tension * 2.5;
      ctx.shadowBlur = 18 + tension * 25 + shimmer * 15;
      ctx.shadowColor = `hsl(${baseHue}, 90%, 60%)`;
      ctx.stroke();
      ctx.restore();
    }

    // 4. Orbit Particles & Vortex Swirl
    for (const p of this.particles) {
      p.angle += p.orbitSpeed * (1 + tension * 2.5 + density * 1.5 + warpSpeed * 2);

      const wobble = Math.sin(p.angle * 4) * (10 + audioEnergy * 45);
      const currentOrbit = p.orbitRadius + wobble;

      p.x = centerX + Math.cos(p.angle) * currentOrbit;
      p.y = centerY + Math.sin(p.angle) * currentOrbit;

      const dynamicRadius = p.baseRadius * (1 + audioEnergy * 1.8 + shimmer * 0.8);
      const hue = (baseHue + p.hueOffset + 360) % 360;

      ctx.save();
      ctx.beginPath();
      ctx.arc(p.x, p.y, dynamicRadius, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${hue}, 85%, 60%, ${p.alpha * (0.6 + audioEnergy * 0.8)})`;
      ctx.shadowBlur = 8 + audioEnergy * 15 + shimmer * 12;
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
