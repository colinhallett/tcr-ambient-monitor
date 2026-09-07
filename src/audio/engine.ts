import * as Tone from 'tone';
import type { SoundModulationParameters } from '../telemetry/types.js';

export interface VisualizerAudioData {
  frequencyData: Float32Array;
  waveformTimeDomain: Float32Array;
}

export class AmbientAudioEngine {
  private isRunning = false;
  private isInitialized = false;

  // Audio nodes & synths
  private masterLimiter!: Tone.Limiter;
  private masterGain!: Tone.Gain;
  private mainFilter!: Tone.Filter;
  private reverb!: Tone.Reverb;
  private delay!: Tone.PingPongDelay;
  private chorus!: Tone.Chorus;
  private analyserFft!: Tone.Analyser;
  private analyserWave!: Tone.Analyser;

  private droneSynth!: Tone.PolySynth;
  private arpeggioSynth!: Tone.PolySynth;
  private noiseGenerator!: Tone.Noise;
  private noiseFilter!: Tone.Filter;
  private noiseGain!: Tone.Gain;

  // Generative state
  private loopEventId: number | null = null;
  private scaleNotes = ['Eb3', 'Gb3', 'Ab3', 'Bb3', 'Db4', 'Eb4', 'F4', 'Gb4', 'Bb4', 'C5', 'Eb5'];
  private droneChords = [
    ['Eb2', 'Bb2', 'Gb3', 'Db4'],
    ['Ab1', 'Eb2', 'C3', 'Gb3'],
    ['B1', 'Gb2', 'Eb3', 'Bb3'],
    ['Db2', 'Ab2', 'F3', 'C4']
  ];
  private currentChordIndex = 0;

  public async initialize(): Promise<void> {
    if (this.isInitialized) return;

    // Master bus chain
    this.masterLimiter = new Tone.Limiter(-1).toDestination();
    this.masterGain = new Tone.Gain(0.8).connect(this.masterLimiter);

    // Spatial & spectral effects
    this.reverb = new Tone.Reverb({ decay: 7, wet: 0.6 }).connect(this.masterGain);
    await this.reverb.generate();

    this.delay = new Tone.PingPongDelay({ delayTime: '8n.', feedback: 0.4, wet: 0.35 }).connect(this.reverb);
    this.chorus = new Tone.Chorus({ frequency: 0.5, delayTime: 3.5, depth: 0.7, wet: 0.4 }).connect(this.delay);
    this.chorus.start();

    this.mainFilter = new Tone.Filter({
      frequency: 800,
      type: 'lowpass',
      rolloff: -24,
      Q: 2.0
    }).connect(this.chorus);

    // Analyzers for the visualizer
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

    // 3. Subtle Ambient Texture / Noise
    this.noiseFilter = new Tone.Filter({ frequency: 400, type: 'bandpass', Q: 4 }).connect(this.reverb);
    this.noiseGain = new Tone.Gain(0.04).connect(this.noiseFilter);
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

    // Trigger initial drone chord
    this.triggerNextDrone();

    // Schedule generative ambient ticks
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
    this.noiseGenerator.stop();
    Tone.getTransport().stop();
    this.isRunning = false;
  }

  public get isActive(): boolean {
    return this.isRunning;
  }

  public updateModulation(params: SoundModulationParameters): void {
    if (!this.isInitialized || !this.isRunning) return;

    const now = Tone.now();

    // Smooth filter cutoff ramp based on CPU tension (range: 400Hz to 3800Hz)
    const targetCutoff = 400 + params.tension * 3400;
    this.mainFilter.frequency.rampTo(targetCutoff, 0.4, now);

    // Timbre & resonance modulation
    this.mainFilter.Q.rampTo(1.0 + params.timbre * 4.0, 0.5, now);

    // Reverb decay adaptation
    const targetDecay = 3.0 + params.reverbSpace * 8.0;
    this.reverb.decay = targetDecay;

    // Tempo adjustment
    Tone.getTransport().bpm.rampTo(params.tempoBpm, 1.0);
  }

  private triggerNextDrone(): void {
    if (!this.isRunning) return;

    const chord = this.droneChords[this.currentChordIndex];
    this.currentChordIndex = (this.currentChordIndex + 1) % this.droneChords.length;

    // Smooth transition between ambient drone voicings
    this.droneSynth.triggerAttackRelease(chord, '8m', undefined, 0.5);
  }

  private scheduleGenerativeLoop(): void {
    let stepCount = 0;

    this.loopEventId = Tone.getTransport().scheduleRepeat((time) => {
      stepCount++;

      // Drone chord progression every 16 steps
      if (stepCount % 16 === 0) {
        this.triggerNextDrone();
      }

      // Stochastic arpeggiation probability
      const triggerChance = 0.45;
      if (Math.random() < triggerChance) {
        const randomNote = this.scaleNotes[Math.floor(Math.random() * this.scaleNotes.length)];
        const velocity = 0.2 + Math.random() * 0.4;
        this.arpeggioSynth.triggerAttackRelease(randomNote, '4n', time, velocity);
      }

      // Secondary harmonizing accent
      if (Math.random() < 0.2) {
        const accentNote = this.scaleNotes[(Math.floor(Math.random() * this.scaleNotes.length) + 4) % this.scaleNotes.length];
        this.arpeggioSynth.triggerAttackRelease(accentNote, '2n', time + 0.2, 0.25);
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
