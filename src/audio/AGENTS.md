# Audio engine guidance

- Treat control values as persistent engine state. Store changes even before initialization or playback, and apply the stored value when its Tone node is created.
- Smooth every audible parameter change made during playback with Tone/Web Audio automation. Do not directly assign active gain, frequency, resonance, pan, volume, or tempo parameters when a ramp is available.
- Keep the signal path behind the existing master headroom: sources route through the master gain and limiter rather than directly to the destination.
- Create recurring voices and effects once and reuse them. If a feature must allocate a node dynamically, disconnect and dispose it after completion and also clean it up in `stop()`.
- Make start and stop idempotent. Clear scheduled transport events, release active voices, and stop continuous sources so repeated start/stop cycles do not add callbacks or graph nodes.
- Keep `Tone.start()` behind the user-triggered start path.
- Validate audio changes with `npm run build`, then exercise pre-start controls, repeated start/stop cycles, and live telemetry transitions in a browser. Listen for clicks, pops, clipping, and overlapping stale voices.
