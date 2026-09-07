---
name: review-telemetry-privacy-perf
description: Review system telemetry collection, OS monitoring daemons, and client metric streams for privacy, data minimization (zero keystroke/PII logging), CPU sampling overhead, and connection resilience.
---

# Review Telemetry, Privacy & Performance

A specialized review lens for system telemetry collectors, OS metrics polling, and daemon streaming (`src/telemetry/**`).
Ensures that ambient system monitoring respects user privacy, minimizes data footprint, and executes with negligible resource overhead.

## 1. Scope

Review only files responsible for gathering system statistics (CPU, memory, load, processes), event tracking (mouse, keyboard, GUI activity), and streaming telemetry payloads over WebSockets or IPC.

## 2. Review Rubric & Rules

### A. Strict Data Minimization & Anti-Keylogging (Must-Fix)
- **Zero Raw Input Capture**: Never record, log, serialize, or transmit raw key codes, character strings, typed text, window titles, or clipboard contents.
- **Pulse/Rate Only**: Activity metrics must be reduced strictly to numerical event counters, frequency deltas, or weighted activity pulse rates (e.g. `activityRate: 0.0 - 1.0`).
- No sensitive user identifiers, host machine identities, or filesystem paths may be exposed in telemetry payloads.

### B. Daemon CPU Overhead & Non-Blocking Sampling (Must-Fix)
- Metric collection must not introduce noticeable CPU overhead. Sampling loops must be throttled (default interval >= 500ms).
- CPU usage calculations must use delta diffing on cumulative CPU tick counters (`user + sys + idle`) rather than synchronous blocking sleep calls.
- Sampling must not block the Node.js event loop or starve WebSocket message processing.

### C. Connection Lifecycle & Error Resilience (Consider)
- Ensure WebSocket servers and client socket listeners gracefully handle unexpected disconnects, error events, and malformed client payloads without crashing the process.
- Background intervals must be properly cleared on daemon termination (`SIGINT`/`SIGTERM`).

## 3. Reporting Guidance

- Anchor each finding to the exact line number in the diff.
- Flag any potential privacy leak as a high-severity / must-fix finding with clear remediation.
- If all telemetry code adheres to data minimization and non-blocking performance standards, confirm approval succinctly.
