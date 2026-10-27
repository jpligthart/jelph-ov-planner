# Jelph OV Planner

Smartere multimodale OV-routeplanner voor Nederland: fans out over nabije haltes/stations, rankt deur-tot-deur opties, en biedt CLI / MCP / web UI.

## Architectuur

npm workspaces-monorepo. Alle slimme routing zit in **`@jelph/planner`**. De apps zijn dunne shells: zelfde core, andere interface.

```
                    ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
                    │  apps/web   │  │  apps/cli   │  │  apps/mcp   │
                    │ Vite/React  │  │  terminal   │  │   Cursor    │
                    └──────┬──────┘  └──────┬──────┘  └──────┬──────┘
                           │ HTTP           │ import         │ import
                           ▼                │                │
                    ┌─────────────┐         │                │
                    │  apps/api   │◄────────┴────────────────┘
                    │   Fastify   │   (cli/mcp praten ook
                    └──────┬──────┘    direct met planner)
                           │
                           ▼
                 ┌─────────────────────┐
                 │  packages/planner   │  ← enige business-logica
                 │  (@jelph/planner)   │
                 └──────────┬──────────┘
              ┌─────────────┼─────────────┐
              ▼             ▼             ▼
         NS Places     NS Trips     Transitous MOTIS
         / Stations    (fan-out)    (bus/tram/metro/trein)
```

| Laag | Map | Rol |
|------|-----|-----|
| Core | `packages/planner` | Places, hubs, fan-out, ranking, NS + Transitous clients |
| API | `apps/api` | REST, validatie (zod), `NS_API_KEY`, strip debug voor UI |
| Web | `apps/web` | NL UX; praat alleen met `/api/*` (Vite proxy → `:3000`) |
| CLI | `apps/cli` | Zelfde `planRoute` vanuit de terminal |
| MCP | `apps/mcp` | Tools voor Cursor (`plan`, stations, …) |
| Deploy | `docker-compose.yml`, `Dockerfile.*`, `deploy/` | API + nginx-web op `:8080` |

### Planner-package (`packages/planner/src`)

```
ns/           # NS API-wrappers
  client.ts     HTTP + subscription key
  places.ts     adres / halte / station zoeken & resolven
  stations.ts   stations zoeken / dichtstbij
  trips.ts      reistrajecten tussen stations
  types.ts      gedeelde NS-types

transitous/
  client.ts     MOTIS /api/v5/plan (multimodaal)

planner/      # orchestratie
  plan.ts       planRoute + toPublicPlanResult
  hubs.ts       nabije OV-hubs (halte/station)
  nearby.ts     nabije stations (oude pad)
  rank.ts       dedupe + score / top-K
  geo.ts        haversine, looptijd
```

Publieke exports: `packages/planner/src/index.ts` (`planRoute`, `searchPlaces`, clients, …).

### Plan-flow (`planRoute`)

1. **Resolve** `from` / `to` (coords, Places-query, of station).
2. **NS deur-tot-deur** — als de key dat mag (vaak niet op NsApp).
3. **NS fan-out** — nabije hubs aan beide kanten, combinaties van trips + loopminuten.
4. **Transitous** — multimodale itineraries (bus/tram/metro/trein).
5. **Dedupe + rank** → top-K opties.

Intern: `PlanResult` (incl. `warnings` / debug). Naar buiten via API: `toPublicPlanResult` — UI krijgt nette opties; tech-details blijven in API-logs.

### Secrets & grenzen

- `NS_API_KEY` alleen in API / CLI / MCP-env — **niet** in de browser.
- Web → API → planner; CLI/MCP → planner rechtstreeks.
- Auth is een stub (`GET /api/me`); later om de API heen, niet in de planner.

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

NsApp-keys geven typisch `API_KEY_NOT_ALLOWED_TO_PLAN_DOOR_TO_DOOR`; Transitous vangt dat op voor non-commercieel / FOSS fair-use (**GPL-3.0-or-later**, zie `LICENSE`). Attributie: [Transitous sources](https://transitous.org/sources/) en © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright) (ODbL).

Uitzetten met `TRANSITOUS_ENABLED=false` indien nodig.

Login kan later om `/api/*` heen zonder de planner-package aan te passen.
