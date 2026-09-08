import { WebSocketServer, WebSocket } from 'ws';
import { TelemetryCollector } from './collector.js';

const PORT = Number(process.env.TELEMETRY_PORT) || 8765;
const SAMPLE_INTERVAL_MS = 1000;

const wss = new WebSocketServer({ port: PORT });
const collector = new TelemetryCollector();

console.log(`[Telemetry Daemon] Server listening on ws://localhost:${PORT}`);

wss.on('connection', (ws: WebSocket) => {
  console.log('[Telemetry Daemon] New client connected');

  // Immediately send initial state
  ws.send(JSON.stringify(collector.getPayload()));

  ws.on('message', (data: Buffer | string) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'activity_pulse') {
        if (msg.key) {
          console.log(`[Telemetry Daemon] Captured key input: ${msg.key}`);
          collector.registerKeyInput(msg.key);
        } else {
          collector.registerActivityPulse(msg.weight || 1);
        }
      }
    } catch {
      // Ignore malformed messages safely
    }
  });

  ws.on('close', () => {
    console.log('[Telemetry Daemon] Client disconnected');
  });

  ws.on('error', (err) => {
    console.error('[Telemetry Daemon] Client error:', err.message);
  });
});

// Periodic broadcast
const interval = setInterval(() => {
  if (wss.clients.size === 0) return;

  const payload = JSON.stringify(collector.getPayload());
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}, SAMPLE_INTERVAL_MS);

process.on('SIGINT', () => {
  clearInterval(interval);
  wss.close(() => {
    console.log('[Telemetry Daemon] Server closed');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  clearInterval(interval);
  wss.close(() => {
    process.exit(0);
  });
});
