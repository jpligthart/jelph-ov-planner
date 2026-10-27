# NSPlanner

Smarter Dutch Railways route planner: fans out over nearby stations within walking distance, ranks **door-to-door** options, and exposes CLI / MCP / web UI.

## Monorepo

```
packages/planner   # NS client + smart planner core
apps/api           # Fastify REST API (holds NS_API_KEY)
apps/web           # Vite + React UI
apps/cli           # CLI
apps/mcp           # MCP server for Cursor
```

## Setup

```powershell
cd c:\Users\jplig\source\repos\NSPlanner
copy .env.example .env
# Set NS_API_KEY in .env
npm install
npm run build:planner
```

## Local development

Terminal 1 — API:

```powershell
npm run dev:api
```

Terminal 2 — Web (proxies `/api` → `:3000`):

```powershell
npm run dev:web
```

Open http://127.0.0.1:5173

CLI / MCP:

```powershell
npm run cli -- stations Utrecht
npm run cli -- plan --from "Amsterdam Centraal" --to "Utrecht Centraal"
npm run mcp
```

### Cursor MCP

```json
{
  "mcpServers": {
    "ns-smart-planner": {
      "command": "npx",
      "args": ["tsx", "apps/mcp/src/server.ts"],
      "cwd": "c:\\Users\\jplig\\source\\repos\\NSPlanner",
      "env": {
        "NS_API_KEY": "your-key"
      }
    }
  }
}
```

## Docker (self-host)

```powershell
docker compose up --build -d
```

App: http://localhost:8080  
API health via nginx: http://localhost:8080/health

`NS_API_KEY` comes from `.env` into the `api` service only.

## API

| Method | Path | Notes |
|--------|------|--------|
| GET | `/health` | Liveness |
| GET | `/api/me` | Auth stub (`user: null`) |
| GET | `/api/places?q=` | Address / stop / station autocomplete (Places API) |
| GET | `/api/stations?q=` | Station search |
| POST | `/api/plan` | Body: `{ from, to, dateTime?, searchForArrival?, maxWalkMeters?, maxNearby?, topK? }` — `from`/`to` may be address, stop, station or `lat,lng` |

Planning resolves addresses via NS Places, then merges:

1. **NS** door-to-door if your key allows it (often blocked on public NsApp)
2. **NS** station fan-out + walk estimates
3. **[Transitous](https://transitous.org/)** MOTIS multimodal (bus/tram/metro/train) — public second source

NsApp keys typically return `API_KEY_NOT_ALLOWED_TO_PLAN_DOOR_TO_DOOR`; Transitous covers that gap for non-commercial / FOSS fair-use. Attribution: [Transitous sources](https://transitous.org/sources/) and [OpenStreetMap](https://www.openstreetmap.org/copyright).

Toggle with `TRANSITOUS_ENABLED=false` if needed.

Login can later wrap these `/api/*` routes without touching the planner package.
