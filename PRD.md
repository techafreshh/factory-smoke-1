# PRD — factory-smoke-1 (smoke)

A minimal Node.js (no dependencies) HTTP service that will grow one or two
endpoints through factory issues. Keep everything in plain Node (http module);
no frameworks. The service starts with `node server.js` and listens on the
PORT from the environment (default 8100).

Milestone: a running service whose behavior is fully covered by runtime.json
(setup/start) and holdout.json (black-box probes) in the factory repo config.
