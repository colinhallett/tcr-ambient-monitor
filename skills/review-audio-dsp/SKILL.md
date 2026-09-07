---
name: review-audio-dsp
description: Review Web Audio API, Tone.js, DSP, and sound synthesis code for audio graph lifecycle leaks, glitch/pop artifacts, clipping prevention, parameter ramps, and browser AudioContext safety.
---

# Review Audio DSP & Synthesis Engine

A specialized review lens for ambient sound generators, DSP nodes, and Web Audio API code.
Checks diffs touching audio synthesis pipelines (`src/audio/**`) against audio engineering, performance, and stability standards.

## 1. Scope

Review only files responsible for audio synthesis, Web Audio node routing, parameter scheduling, effects, and signal analysis. Skip unrelated UI or server telemetry code.

## 2. Review Rubric & Rules

### A. Audio Node Lifecycle & Graph Leaks (Must-Fix)
- Every dynamically instantiated `Tone.AudioNode`, `Synth`, `Oscillator`, or custom audio graph node must have an explicit disposal or disconnection lifecycle when stopped or replaced.
- Unmanaged audio graph accumulation causes memory leaks and DSP thread degradation during long ambient sessions.

### B. Glitch & Pop Prevention (Must-Fix)
- Continuous parameter changes (e.g., filter cutoff, resonance, oscillator pitch, gain modulation) must use continuous audio-rate ramping (such as `rampTo()`, `linearRampToValueAtTime()`, or `setTargetAtTime()`).
- Instantaneous assignments (`setValueAtTime()` or direct property sets) during active playback create high-frequency audio pops, DC offset thumps, or buffer discontinuities.

### C. Master Headroom & Clipping Safety (Must-Fix)
- Audio routing into master outputs must include headroom management (e.g. `Tone.Limiter`, master gain ceiling <= 0.85) to prevent digital clipping / distortion when multiple polyphonic layers overlap.

### D. AudioContext Autoplay & State (Consider)
- Ensure audio graph operations and `Tone.start()` / `audioContext.resume()` are gated behind explicit user gestures to comply with browser autoplay security policies.
- Synths should gracefully handle context suspension without throwing unhandled exceptions.

## 3. Reporting Guidance

- Anchor each finding to the exact line number in the diff.
- Explain the sonic or performance defect (e.g., "Instantaneous filter frequency update causes audible click artifacts").
- Provide the concise code replacement using proper Tone.js / Web Audio ramp methods.
- If the audio diff complies with all DSP rules, state approval in one clear line.
