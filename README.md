# Jelph OV Planner

Smartere multimodale OV-routeplanner voor Nederland: fans out over nabije haltes/stations, rankt deur-tot-deur opties. De **web UI + API** is het primaire pad; CLI en MCP bestaan als early/experimental shells rond dezelfde planner-core.

Toegang tot de gehoste versie is beperkt. Er is geen accountregistratie: je logt in met een vooraf ingesteld account.

Handig gevonden? [Ko-fi / tip jar](https://ko-fi.com/jelphme).

## Architectuur

npm workspaces-monorepo. Alle slimme routing zit in **`@jelph/planner`**. Web praat via de API; die houdt de key en strip’t debug voor de UI.

```
                    ┌─────────────┐
                    │  apps/web   │  ← primaire UX
                    │ Vite/React  │
                    └──────┬──────┘
                           │ HTTP /api/*
                           ▼
                    ┌─────────────┐
                    │  apps/api   │
                    │   Fastify   │
                    └──────┬──────┘
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
| Deploy | `compose.yaml`, `Dockerfile.*`, `deploy/` | API + nginx-web op `:8080` |
| CLI / MCP | `apps/cli`, `apps/mcp` | Preliminary — zie onderaan |

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

- `NS_API_KEY` alleen server-side (API-env) — **niet** in de browser.
- Web → API → planner.
- Login om `/api/*` heen (`apps/api/src/auth.ts`), niet in de planner. Geen zelfregistratie: alleen vooraf ingestelde accounts in `AUTH_USERS`. Sessie als ondertekende cookie (90 dagen). Lokaal in development mag `AUTH_USERS` leeg blijven (login uit); in productie start de API niet zonder accounts.
- Gedeeld request-budget per 5 minuten beschermt de NS-quota (`apps/api/src/budget.ts`).

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

Zonder `AUTH_USERS` in `.env` staat login uit (alleen development). De gehoste site vraagt wel om een bestaand account.

## Docker (self-host)

```powershell
docker compose up --build -d
```

App: http://localhost:8080 (alleen vanaf de machine zelf)  
API health via nginx: http://localhost:8080/health

`NS_API_KEY` komt uit `.env` alleen in de `api`-service.

### Live op een VM (nginx + HTTPS + login)

De VM bouwt niets zelf: images worden lokaal gebouwd en via een registry gedeeld.

0. **Images pushen** (op je ontwikkelmachine) — zet `IMAGE_REGISTRY` in `.env`, dan:

   ```sh
   docker login <registry-host>
   npm run docker:push      # bouwt api + web voor amd64 en arm64, pusht :latest
   ```

   Op de VM: [`deploy/compose.prod.yaml`](deploy/compose.prod.yaml) als `compose.yaml` naast een `.env` (met dezelfde `IMAGE_REGISTRY`), `docker login <registry-host>` en `docker compose up -d`. Updaten: opnieuw pushen en op de VM `docker compose up -d` (haalt altijd de nieuwste images op).

1. **Accounts instellen** — geen registratie in de app; per persoon een hash in `AUTH_USERS`:

   ```sh
   docker compose run --rm api node apps/api/dist/hash-password.js jp
   ```

   Zet de entries in `.env`, komma-gescheiden: `AUTH_USERS=jp:scrypt...,zoon:scrypt...`

2. **Secret** — `AUTH_SECRET=` met de uitvoer van `openssl rand -base64 32`.

3. **Starten** — `docker compose up -d`. Zonder `AUTH_USERS` weigert de API te starten.

4. **nginx op de VM** — zie [`deploy/host-nginx.conf`](deploy/host-nginx.conf), daarna `certbot --nginx`. De container luistert alleen op `127.0.0.1:8080`, dus alles loopt via HTTPS.

Beheer:

- **Iemand toevoegen / wachtwoord wijzigen / verwijderen** — `AUTH_USERS` aanpassen en `docker compose up -d` (herstart de API). Verwijderen of een nieuw wachtwoord beëindigt ook bestaande sessies van die persoon.
- **Iedereen uitloggen** — nieuw `AUTH_SECRET` en herstarten.
- **Limieten** — `PLAN_LIMIT_PER_5_MIN` / `SEARCH_LIMIT_PER_5_MIN` (zie `.env.example`).

## API

| Method | Path | Notes |
|--------|------|--------|
| GET | `/health` | Liveness |
| GET | `/api/me` | Ingelogde gebruiker of `user: null` (verlengt de sessie) |
| POST | `/api/login` | Body: `{ username, password }` — zet de sessie-cookie |
| POST | `/api/logout` | Wist de sessie-cookie |
| GET | `/api/places?q=` | Adres / halte / station autocomplete (NS Places) |
| GET | `/api/stations?q=` | Station search |
| POST | `/api/plan` | Body: `{ from, to, dateTime?, searchForArrival?, maxWalkMeters?, maxNearby?, topK? }` — `from`/`to` mag adres, halte, station of `lat,lng` zijn |
| POST | `/api/alternatives` | Body: `{ fromLat, fromLng, toLat, toLng, readyAt, arrival, maxWalkMeters? }` — andere manieren om vanaf de laatste overstap de bestemming te halen (alleen Transitous); de web-app vraagt dit op bij het openklappen van een reis |

Planning resolved adressen via NS Places, daarna:

1. **NS** deur-tot-deur als je key dat toelaat (vaak geblokkeerd op publieke NsApp)
2. **NS** station fan-out + loopafstand
3. **[Transitous](https://transitous.org/)** MOTIS multimodaal (bus/tram/metro/trein)

NsApp-keys geven typisch `API_KEY_NOT_ALLOWED_TO_PLAN_DOOR_TO_DOOR`; Transitous vangt dat op voor non-commercieel / FOSS fair-use (**GPL-3.0-or-later**, zie `LICENSE`). Attributie: [Transitous sources](https://transitous.org/sources/) en © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright) (ODbL).

Uitzetten met `TRANSITOUS_ENABLED=false` indien nodig.

Alle `/api/*`-routes behalve login/logout/me vereisen een sessie (anders `401`).

## CLI & MCP (preliminary)

`apps/cli` en `apps/mcp` zijn vroege experimentele shells: ze importeren `@jelph/planner` rechtstreeks, maar zijn minder uitgewerkt dan de site (geen parity met filters/UX, beperkte polish). Handig om de core te prikken; niet het aanbevolen pad voor dagelijks gebruik.

```powershell
npm run cli -- stations Utrecht
npm run cli -- plan --from "Amsterdam Centraal" --to "Utrecht Centraal"
npm run mcp
```

Cursor MCP-voorbeeld (eigen key in env):

```json
{
  "mcpServers": {
    "jelph-ov-planner": {
      "command": "npx",
      "args": ["tsx", "apps/mcp/src/server.ts"],
      "cwd": "c:\\Users\\<user>\\source\\repos\\NSPlanner",
      "env": {
        "NS_API_KEY": "your-key"
      }
    }
  }
}
```
