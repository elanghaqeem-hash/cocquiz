# COCQUIZ

COCQUIZ is a real-time competitive training quiz built on Cloudflare Workers and Durable Objects. The current question bank focuses on QAIP / internal audit topics and supports host-controlled sessions, timed questions, scoring, explanations, and a live leaderboard.

## Architecture

- **Cloudflare Worker** serves the web UI and API.
- **Durable Object (`QuizRoom`)** owns the authoritative state for each six-character room code.
- **SQLite-backed Durable Object namespace** is declared through Wrangler's `exports` configuration.
- The browser currently uses short polling for live updates.

The production entrypoint is `src/worker.js`. It wraps the original quiz implementation in `src/index.js` with API validation and security controls while preserving the existing question bank and UI.

## Local development

Requirements: Node.js 20 or newer.

```bash
npm install
npm run dev
```

Wrangler will print the local URL.

## Validation

```bash
npm run check
```

This performs a Wrangler deployment dry run. Pull requests and pushes to `main` also run `.github/workflows/validate.yml`, which checks JavaScript syntax and the Wrangler configuration.

## Deployment

The Worker name is `cocquiz`, with the production entrypoint configured in `wrangler.jsonc`.

```bash
npm install
npm run deploy
```

For Cloudflare Git integration, connect this repository, use branch `main`, keep the repository root as the project root, and use the Wrangler deploy command (`npm run deploy`). No application secret is required by the current codebase.

## Security controls

The hardened entrypoint adds the following controls:

- participant bearer IDs are removed from public leaderboard responses;
- host credentials are accepted through the `Authorization: Bearer` header rather than URL query strings;
- strict HTTP method and API route validation;
- JSON payload validation for room creation, joining, answering, and host actions;
- a 100-participant safety limit per room;
- cryptographically generated room codes with collision retry;
- CSP, frame protection, referrer protection, permissions policy, and MIME-sniffing protection;
- consistent JSON 404/405 responses for API errors.

## Current scale profile

The current implementation stores room state in one Durable Object and uses polling from each connected browser. This is appropriate for training-room sized sessions. For substantially larger audiences, the next architectural step should be WebSocket-based updates and normalized SQLite tables for participants/answers instead of one aggregate state object.

## Operational checks after deployment

1. Open `/health` and confirm `status: "ok"`.
2. Create a room as host.
3. Join from a second browser/device.
4. Start the quiz and submit an answer.
5. Confirm the leaderboard updates but does not expose participant IDs in the API response.
6. Let a question timer expire and confirm the room changes to reveal state.
7. Complete the quiz and verify final ranking.

## Maintenance note

The question bank and legacy UI remain in `src/index.js`. A future maintainability refactor can move questions, Durable Object logic, and UI assets into separate modules without changing the runtime behavior.
