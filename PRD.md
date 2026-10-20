# PRD — factory-smoke-1 (smoke)

A minimal Node.js (no dependencies) HTTP service that will grow one or two
endpoints through factory issues. Keep everything in plain Node (http module);
no frameworks. The service starts with `node server.js` and listens on the
PORT from the environment (default 8100).

Contract:
- `GET /health` -> 200 with JSON body containing `"ok":true` (this exact probe is the runtime gate).
- Unknown paths must answer any non-5xx promptly (4xx fine).
- The service must not crash on malformed request bodies.

Milestone: a running service whose behavior is fully covered by runtime.json
(setup/start) and holdout.json (black-box probes) in the factory repo config.
