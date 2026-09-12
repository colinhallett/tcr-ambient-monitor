# Telemetry guidance

- Preserve the privacy boundary: keyboard, mouse, and other interaction input becomes only a numeric pulse or rate at capture time. Never retain, log, serialize, or broadcast raw keys, text, coordinates, window titles, clipboard data, or similar input.
- Treat WebSocket messages as untrusted. Accept only recognized message types and finite, bounded numeric values; do not rely on truthiness defaults for numeric fields.
- Keep telemetry aggregate-only: network byte rates, normalized activity, and system utilization are allowed; packet contents, destinations, hostnames, user identifiers, machine identities, and filesystem paths are not.
- Keep sampling non-blocking and throttled. Compute CPU usage from cumulative-counter deltas, run OS commands asynchronously with timeouts, and serve cached auxiliary metrics from the broadcast path.
- When changing the payload or activity protocol, update and inspect `types.ts`, `server.ts`, `collector.ts`, and the producer/consumer in `../main.ts` together. Confirm that no raw-input field crosses the WebSocket boundary.
- Give every interval, socket, and OS poll an error/shutdown path. Clear recurring work on both `SIGINT` and `SIGTERM`, and ensure malformed messages or disconnects cannot terminate the daemon.
- Validate telemetry changes with `npm run build` and run the daemon with a client through malformed-message, disconnect, and shutdown cases.
