# Coder-agent local worker

This is a minimal local coder-agent worker used for development when you don't have a cloud coder-api.

What it does:
- Polls `outputs/` for new `ocr-*/status.json` files
- Decides whether to use OCR text or request image reprocessing based on `CONFIDENCE_THRESHOLD`
- Writes a small result into `outputs/coder-<timestamp>/result.json` and `meta.json`

Usage:
- Requires Node.js installed.
- Run from project root:

	node coder-agent/worker.js

Env vars:
- POLL_INTERVAL_MS (default 2000)
- CONFIDENCE_THRESHOLD (default 0.6)

This is intentionally minimal — it's a local simulator to test integration without a remote coder API.

Local server
------------

You can run a minimal HTTP server that accepts POST /api/coder/analyze and writes results to outputs/.

Install dependencies (from project root):

	npm install express body-parser

Run server:

	node coder-agent/server.js

Request example:

	POST http://localhost:3800/api/coder/analyze
	Content-Type: application/json

	{
		"request_id":"local-1",
		"image_uri":"/outputs/ocr-20251022T155549/image.png",
		"ocr":{"text":"function hello(){ console.log('hi') }","confidence":0.9}
	}

The server will write `outputs/coder-<timestamp>/result.json` and `meta.json`.
