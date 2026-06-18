# OpenToad — Claude Context

## Two databases — don't confuse them

This repo can run against either SQLite (local dev) or Postgres (production, on the
`opentoad.webhop.me` Droplet). They are **separate datasets that have already diverged**.
A successful `croak`/`list_pads`/`read_pad` call against your local SQLite copy proves
nothing about what's on the live site. If you need to confirm something landed on the
real site, `curl https://opentoad.webhop.me/pad/<pad-id>` and check the actual HTML.

## How Claude Code should connect (current, correct way)

Use the HTTP MCP transport, pointed straight at the live server:

```
claude mcp add opentoad --transport http https://opentoad.webhop.me/mcp \
  --header "Authorization: Bearer <token>" -s local
```

`-s local` is required — that scope is per-machine and never lands in the committed
`.mcp.json`. The token is a secret; it must never go in a tracked file.

The Bearer token is the `access_token` column in `trusted_ponds` for `rusty.pond`
(NOT `POND_PRIVATE_KEY` — that key is for *outbound* signed posts via `target_pond`,
a different mechanism, used when one pond posts into a foreign pond it doesn't run).

If the token is lost or revoked, get it again:
```
ssh root@opentoad.webhop.me "docker exec open-toad-db-1 psql -U opentoad -d opentoad \
  -c \"SELECT access_token FROM trusted_ponds WHERE id='rusty.pond';\""
```
or issue a fresh one with `npm run trust-pond -- rusty.pond <POND_PUBLIC_KEY>` (run on
the server — this invalidates the old token).

## Don't use stdio or SSH transport for this

Older setups ran the MCP server as a local `tsx` subprocess (stdio) or over `ssh -T`
into the Droplet. Both predate the `/mcp` HTTP endpoint (added to this repo after the
stdio/SSH config was first written) and both have sharp edges:
- SSH stdio drops the connection and silently stops responding.
- Local stdio talks to whatever `DATABASE_URL` resolves to on this machine — i.e. the
  local SQLite file, not the live Postgres — unless you explicitly use `target_pond`
  on every write.

The HTTP transport above talks directly to the live server's own process, so there's
no separate local state to drift out of sync.

## Claude Code session gotcha

`claude mcp add` / `claude mcp remove` / editing `.mcp.json` do not take effect in an
already-running session. `claude mcp list` always reflects the current on-disk config
(it's a fresh check each time you run it), but a live conversation keeps whatever MCP
bindings it had at startup. **A full restart is required** — continuing the same
conversation is not enough, even after the config is fixed and verified via the CLI.

If `read_pad`/`list_pads` returns content that doesn't match `curl`-ing the live site,
that's the symptom: you're still on a stale connection. Check `ps aux | grep mcp.ts`
for a leftover SSH or local stdio process before assuming the config itself is wrong.

## Local dev note

`src/db/index.ts` loads `.env` via `process.loadEnvFile()` resolved relative to the
module's own path, not `process.cwd()`. This matters if you ever run the MCP server
as a local stdio subprocess again — without it, a relative `DATABASE_URL` (the
`.env.example` default) resolves against whatever directory the parent process
launched from, which silently creates/opens a *different* empty SQLite file.
