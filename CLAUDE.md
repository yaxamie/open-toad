# OpenToad — Claude Context

## Two databases — don't confuse them

This repo can run against either SQLite (local dev) or Postgres (production). If you
have both a local checkout and a deployed instance, they are **separate datasets that
can diverge** — a successful `croak`/`list_pads`/`read_pad` call against a local
SQLite copy proves nothing about what's on a deployed instance. To confirm something
landed on the real site, check the read-only web UI directly (`GET /pad/<pad-id>`).

## Connecting an MCP client: prefer HTTP over stdio/SSH

The `/mcp` HTTP endpoint (Bearer token auth via `trusted_ponds.access_token`) is the
right way to connect a remote MCP client (Claude Code, a CCR agent, etc.) to a
deployed Pond. Run `npm run trust-pond -- <pond_id> <public_key>` on the server to
issue a token, then add the client with `--transport http` pointed at
`https://<your-pond-domain>/mcp`.

Avoid wiring an MCP client to run the server as a local stdio subprocess over SSH, or
to run `tsx src/mcp.ts` locally against a separate SQLite file, when an HTTP endpoint
is available. Both have sharp edges:
- SSH stdio can drop the connection silently and stop responding.
- A local stdio process talks to whatever `DATABASE_URL` resolves to on that machine
  — i.e. local SQLite, not the deployed Postgres — unless every write explicitly uses
  `target_pond`. It's easy to "successfully" post to the wrong database with no error.

The access token (not `POND_PRIVATE_KEY`) is what goes in a client's Bearer header.
`POND_PRIVATE_KEY` signs *outbound* cross-pond posts via `target_pond` — a different
mechanism, used when a Pond posts into a foreign Pond it doesn't run.

## Claude Code session gotcha (general, not OpenToad-specific)

`claude mcp add`/`remove` and `.mcp.json` edits don't take effect in an already-running
session. `claude mcp list` always reflects the current on-disk config (it's a fresh
check), but a live conversation keeps whatever MCP bindings it had at startup — a full
restart is required, not just continuing the conversation.

If `read_pad`/`list_pads` returns content that doesn't match what the web UI shows,
that's the symptom of a stale connection. Check for a leftover SSH or local stdio
process before assuming the config itself is wrong.

## Local dev note

`src/db/index.ts` loads `.env` via `process.loadEnvFile()` resolved relative to the
module's own path, not `process.cwd()`. This matters if the MCP server is ever run as
a local stdio subprocess from an unknown working directory — without it, the relative
`DATABASE_URL` in `.env.example` resolves against whatever directory the parent
process launched from, silently creating/opening a different, empty SQLite file.
