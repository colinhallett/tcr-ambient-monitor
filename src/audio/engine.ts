import * as Tone from 'tone';
import type { SoundModulationParameters } from '../telemetry/types.js';

export interface VisualizerAudioData {
  frequencyData: Float32Array;
  waveformTimeDomain: Float32Array;
}

export class AmbientAudioEngine {
  private isRunning = false;
  private isInitialized = false;

  // Master Audio nodes & chains
  private masterLimiter!: Tone.Limiter;
  private masterGain!: Tone.Gain;
  private mainFilter!: Tone.Filter;
  private panner!: Tone.Panner;
  private reverb!: Tone.Reverb;
  private delay!: Tone.PingPongDelay;
  private chorus!: Tone.Chorus;
  private analyserFft!: Tone.Analyser;
  private analyserWave!: Tone.Analyser;

  // Synthesis voices
  private droneSynth!: Tone.PolySynth;
  private arpeggioSynth!: Tone.PolySynth;
  private shimmerSynth!: Tone.PolySynth;
  private noiseGenerator!: Tone.Noise;
  private noiseFilter!: Tone.Filter;
  private noiseGain!: Tone.Gain;

  // Generative loop state
  private loopEventId: number | null = null;
  private scaleNotes = ['Eb3', 'Gb3', 'Ab3', 'Bb3', 'Db4', 'Eb4', 'F4', 'Gb4', 'Bb4', 'C5', 'Eb5'];
  private highShimmerNotes = ['Eb5', 'Gb5', 'Ab5', 'Bb5', 'Db6', 'Eb6'];
  private droneChords = [
    ['Eb2', 'Bb2', 'Gb3', 'Db4'],
    ['Ab1', 'Eb2', 'C3', 'Gb3'],
    ['B1', 'Gb2', 'Eb3', 'Bb3'],
    ['Db2', 'Ab2', 'F3', 'C4']
  ];
  private currentChordIndex = 0;
  private currentModulation: SoundModulationParameters | null = null;

  public async initialize(): Promise<void> {
    if (this.isInitialized) return;

    // Master bus with Limiter protection to eliminate clipping
    this.masterLimiter = new Tone.Limiter(-1).toDestination();
    this.masterGain = new Tone.Gain(0.8).connect(this.masterLimiter);

    // Dynamic spatial panner
    this.panner = new Tone.Panner(0).connect(this.masterGain);

    // Spatial & spectral effects
    this.reverb = new Tone.Reverb({ decay: 8, wet: 0.65 }).connect(this.panner);
    await this.reverb.generate();

    this.delay = new Tone.PingPongDelay({ delayTime: '8n.', feedback: 0.45, wet: 0.35 }).connect(this.reverb);
    this.chorus = new Tone.Chorus({ frequency: 0.4, delayTime: 3.5, depth: 0.7, wet: 0.4 }).connect(this.delay);
    this.chorus.start();

    this.mainFilter = new Tone.Filter({
      frequency: 800,
      type: 'lowpass',
      rolloff: -24,
      Q: 2.0
    }).connect(this.chorus);

    // Visualizer Analyzers
    this.analyserFft = new Tone.Analyser('fft', 64);
    this.analyserWave = new Tone.Analyser('waveform', 128);
    this.masterGain.connect(this.analyserFft);
    this.masterGain.connect(this.analyserWave);

    // 1. Drone Pad Synth
    this.droneSynth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'sine' },
      envelope: {
        attack: 3.0,
        decay: 2.5,
        sustain: 0.85,
        release: 4.0
      }
    }).connect(this.mainFilter);
    this.droneSynth.volume.value = -12;

    // 2. Chime / Arpeggio Synth
    this.arpeggioSynth = new Tone.PolySynth(Tone.FMSynth, {
      harmonicity: 2.5,
      modulationIndex: 1.5,
      oscillator: { type: 'sine' },
      envelope: {
        attack: 0.05,
        decay: 1.8,
        sustain: 0.1,
        release: 2.5
      },
      modulation: { type: 'triangle' },
      modulationEnvelope: {
        attack: 0.1,
        decay: 1.0,
        sustain: 0.2,
        release: 1.5
      }
    }).connect(this.delay);
    this.arpeggioSynth.volume.value = -10;

    // 3. Network Shimmer Synth (High sparkling tones reacting to bandwidth I/O)
    this.shimmerSynth = new Tone.PolySynth(Tone.AMSynth, {
      harmonicity: 3.0,
      oscillator: { type: 'sine' },
      envelope: {
        attack: 0.02,
        decay: 0.8,
        sustain: 0.05,
        release: 1.2
      }
    }).connect(this.delay);
    this.shimmerSynth.volume.value = -16;

    // 4. Noise Bed
    this.noiseFilter = new Tone.Filter({ frequency: 350, type: 'bandpass', Q: 4 }).connect(this.reverb);
    this.noiseGain = new Tone.Gain(0.03).connect(this.noiseFilter);
    this.noiseGenerator = new Tone.Noise('pink').connect(this.noiseGain);

    this.isInitialized = true;
  }

  public async start(): Promise<void> {
    if (this.isRunning) return;
    await Tone.start();
    await this.initialize();

    Tone.getTransport().start();
    this.noiseGenerator.start();
    this.isRunning = true;

    this.triggerNextDrone();
    this.scheduleGenerativeLoop();
  }

  public stop(): void {
    if (!this.isRunning) return;

    if (this.loopEventId !== null) {
      Tone.getTransport().clear(this.loopEventId);
      this.loopEventId = null;
    }

    this.droneSynth.releaseAll();
    this.arpeggioSynth.releaseAll();
    this.shimmerSynth.releaseAll();
    this.noiseGenerator.stop();
    Tone.getTransport().stop();
    this.isRunning = false;
  }

  public get isActive(): boolean {
    return this.isRunning;
  }

  public updateModulation(params: SoundModulationParameters): void {
    this.currentModulation = params;
    if (!this.isInitialized || !this.isRunning) return;

    const now = Tone.now();

    // Smooth filter cutoff ramp based on CPU tension (400Hz - 4200Hz)
    const targetCutoff = 400 + params.tension * 3800;
    this.mainFilter.frequency.rampTo(targetCutoff, 0.4, now);

    // Timbre & resonance modulation
    this.mainFilter.Q.rampTo(1.0 + params.timbre * 4.5, 0.5, now);

    // Reverb decay space
    const targetDecay = 3.0 + params.reverbSpace * 8.0;
    this.reverb.decay = targetDecay;

    // Shimmer volume tracks network activity
    const shimmerGain = -24 + params.shimmer * 12;
    this.shimmerSynth.volume.rampTo(shimmerGain, 0.3, now);

    // Master tempo ramp
    Tone.getTransport().bpm.rampTo(params.tempoBpm, 1.0);
  }

  public setPan(panValue: number): void {
    // panValue between -1.0 (left) and 1.0 (right)
    if (!this.isInitialized || !this.isRunning) return;
    const clamped = Math.max(-1, Math.min(1, panValue));
    this.panner.pan.rampTo(clamped, 0.1);
  }

  private triggerNextDrone(): void {
    if (!this.isRunning) return;

    const chord = this.droneChords[this.currentChordIndex];
    this.currentChordIndex = (this.currentChordIndex + 1) % this.droneChords.length;

    this.droneSynth.triggerAttackRelease(chord, '8m', undefined, 0.5);
  }

  private scheduleGenerativeLoop(): void {
    let stepCount = 0;

    this.loopEventId = Tone.getTransport().scheduleRepeat((time) => {
      stepCount++;

      if (stepCount % 16 === 0) {
        this.triggerNextDrone();
      }

      // Density-modulated arpeggiator probability
      const density = this.currentModulation?.density ?? 0.3;
      const triggerChance = 0.25 + density * 0.45;
      if (Math.random() < triggerChance) {
        const randomNote = this.scaleNotes[Math.floor(Math.random() * this.scaleNotes.length)];
        const velocity = 0.2 + Math.random() * 0.4;
        this.arpeggioSynth.triggerAttackRelease(randomNote, '4n', time, velocity);
      }

      // Network shimmer sparkle bursts
      const shimmer = this.currentModulation?.shimmer ?? 0;
      if (shimmer > 0.2 && Math.random() < shimmer * 0.7) {
        const shimmerNote = this.highShimmerNotes[Math.floor(Math.random() * this.highShimmerNotes.length)];
        this.shimmerSynth.triggerAttackRelease(shimmerNote, '16n', time + 0.1, 0.35);
      }
    }, '4n');
  }

  public getAudioVisualizerData(): VisualizerAudioData {
    if (!this.isInitialized) {
      return {
        frequencyData: new Float32Array(64),
        waveformTimeDomain: new Float32Array(128)
      };
    }

    return {
      frequencyData: this.analyserFft.getValue() as Float32Array,
      waveformTimeDomain: this.analyserWave.getValue() as Float32Array
    };
  }
}
