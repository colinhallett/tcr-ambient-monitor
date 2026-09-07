# Ambient System Slop 🎵⚡

A real-time ambient music generator and generative visualizer modulated by system activity (CPU load, memory usage, keypress/mouse activity rates). Built to demonstrate **Tessl Code Review** with custom, path-scoped review lenses.

---

## 🎧 Overview

The app creates a generative, ever-evolving ambient soundscape that mirrors your computer's current workload:
* **Audio Synthesis Engine (`src/audio/`)**:
  * Procedural drone pads and pentatonic chime arpeggios powered by [Tone.js](https://tonejs.github.io/) / Web Audio API.
  * System CPU load drives audio tension and resonant lowpass filter sweeps.
  * Activity pulses modulate arpeggio note density and tempo.
  * Master limiter and stereo reverb/delay for a lush, artifact-free ambient sound.
* **Telemetry Collector Daemon (`src/telemetry/`)**:
  * Lightweight Node.js daemon sampling OS metrics (`os.cpus()`, memory, load averages) and streaming via WebSockets.
  * **Privacy-First**: Measures interaction frequency and event pulses only — zero raw keystroke or character logging.
* **Generative Visualizer (`src/visualizer/`)**:
  * HTML5 Canvas particle orbital field with real-time waveform oscilloscope reacting to FFT audio frequencies and telemetry state.

---

## 🔍 Tessl Code Review Configuration

This repository includes a Tessl Code Review profile (`.tessl-code-review.yml`) configured with **2 custom path-scoped lenses**:

```yaml
schemaVersion: 1

reviewMode: relaxed
requestChangesAt: major

lenses:
  # 1. Custom DSP & Web Audio Architecture Lens
  - ref: ./skills/review-audio-dsp/SKILL.md
    globs:
      - 'src/audio/**'

  # 2. Custom Telemetry, Privacy & Daemon Performance Lens
  - ref: ./skills/review-telemetry-privacy-perf/SKILL.md
    globs:
      - 'src/telemetry/**'
```

### Lens 1: Audio DSP & Synthesis Engine (`skills/review-audio-dsp/SKILL.md`)
* **Scope**: `src/audio/**`
* **Focus**: Web Audio graph lifecycle management (preventing memory leaks from abandoned audio nodes), clipping prevention, glitch/pop elimination via audio parameter ramps (`rampTo` / `setTargetAtTime`), and browser autoplay policy compliance.

### Lens 2: Telemetry Privacy & Performance (`skills/review-telemetry-privacy-perf/SKILL.md`)
* **Scope**: `src/telemetry/**`
* **Focus**: Strict data minimization (ensuring zero keylogging or sensitive string capture), non-blocking CPU delta sampling, and WebSocket lifecycle error resilience.

---

## 🚀 Quickstart

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Both Frontend and Telemetry Daemon
```bash
npm start
```
* **Frontend**: [http://localhost:5173](http://localhost:5173)
* **Telemetry WebSocket**: `ws://localhost:8765`

### Or Run Services Separately:
```bash
# Terminal 1: Telemetry daemon
npm run server

# Terminal 2: Vite frontend
npm run dev
```
