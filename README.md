# Jelph OV Planner

Smartere multimodale OV-routeplanner voor Nederland: fans out over nabije haltes/stations, rankt deur-tot-deur opties, en biedt CLI / MCP / web UI.

## Monorepo

```
packages/planner   # NS + Transitous + smart planner core
apps/api           # Fastify REST API (houdt NS_API_KEY)
apps/web           # Vite + React UI
apps/cli           # CLI
apps/mcp           # MCP server voor Cursor
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
    "jelph-ov-planner": {
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

`NS_API_KEY` komt uit `.env` alleen in de `api`-service.

## API

| Method | Path | Notes |
|--------|------|--------|
| GET | `/health` | Liveness |
| GET | `/api/me` | Auth stub (`user: null`) |
| GET | `/api/places?q=` | Adres / halte / station autocomplete (NS Places) |
| GET | `/api/stations?q=` | Station search |
| POST | `/api/plan` | Body: `{ from, to, dateTime?, searchForArrival?, maxWalkMeters?, maxNearby?, topK? }` — `from`/`to` mag adres, halte, station of `lat,lng` zijn |

Planning resolved adressen via NS Places, daarna:

1. **NS** deur-tot-deur als je key dat toelaat (vaak geblokkeerd op publieke NsApp)
2. **NS** station fan-out + loopafstand
3. **[Transitous](https://transitous.org/)** MOTIS multimodaal (bus/tram/metro/trein)

NsApp-keys geven typisch `API_KEY_NOT_ALLOWED_TO_PLAN_DOOR_TO_DOOR`; Transitous vangt dat op voor non-commercieel / FOSS fair-use. Attributie: [Transitous sources](https://transitous.org/sources/) en [OpenStreetMap](https://www.openstreetmap.org/copyright).

Uitzetten met `TRANSITOUS_ENABLED=false` indien nodig.

Login kan later om `/api/*` heen zonder de planner-package aan te passen.
