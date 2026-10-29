import type { NsClient } from "../ns/client.js";
import {
  resolvePlaceQuery,
  type PlaceHit,
  type PlaceKind,
} from "../ns/places.js";
import { resolveStationByCodeOrName } from "../ns/stations.js";
import { searchTrips } from "../ns/trips.js";
import type { NsTrip, Station, TripsQuery } from "../ns/types.js";
import {
  TransitousClient,
  createTransitousClientFromEnv,
  type TransitousItinerary,
} from "../transitous/client.js";
import { haversineMeters, walkMinutes } from "./geo.js";
import type { TransitHub } from "./hubs.js";
import { findNearbyStations } from "./nearby.js";
import {
  dedupeOptions,
  dropDominated,
  markMissedConnections,
  rankOptions,
  type RankedOption,
} from "./rank.js";

export type PlaceInput =
  | { kind: "coords"; lat: number; lng: number; name?: string }
  | { kind: "station"; station: Station }
  | { kind: "place"; place: PlaceHit }
  | { kind: "query"; query: string };

export type PlanRequest = {
  from: PlaceInput;
  to: PlaceInput;
  dateTime?: string;
  searchForArrival?: boolean;
  maxWalkMeters?: number;
  maxNearby?: number;
  topK?: number;
  /** Include Transitous multimodal results (default: true / env). */
  useTransitous?: boolean;
  transitousClient?: TransitousClient;
};

export type PlanResult = {
  from: ResolvedPlace;
  to: ResolvedPlace;
  nearbyFrom: TransitHub[];
  nearbyTo: TransitHub[];
  options: RankedOption[];
  queriedCombinations: number;
  warnings: string[];
  transitousUsed: boolean;
};

export type ResolvedPlace = {
  label: string;
  lat: number;
  lng: number;
  kind: PlaceKind | "coords";
  station?: Station;
  placeId?: string;
};

const LAT_LNG_RE =
  /^\s*(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*$/;

export function parsePlaceString(raw: string): PlaceInput {
  const trimmed = raw.trim();
  const match = LAT_LNG_RE.exec(trimmed);
  if (match) {
    return {
      kind: "coords",
      lat: Number(match[1]),
      lng: Number(match[2]),
      name: trimmed,
    };
  }
  return { kind: "query", query: trimmed };
}

async function resolvePlace(
  client: NsClient,
  input: PlaceInput,
): Promise<ResolvedPlace> {
  if (input.kind === "coords") {
    return {
      label: input.name ?? `${input.lat},${input.lng}`,
      lat: input.lat,
      lng: input.lng,
      kind: "coords",
    };
  }
  if (input.kind === "station") {
    return {
      label: input.station.name,
      lat: input.station.lat,
      lng: input.station.lng,
      kind: "station",
      station: input.station,
    };
  }
  if (input.kind === "place") {
    return {
      label: input.place.name,
      lat: input.place.lat,
      lng: input.place.lng,
      kind: input.place.kind,
      placeId: input.place.id,
      station:
        input.place.kind === "station" && input.place.stationCode
          ? {
              code: input.place.stationCode,
              uicCode: input.place.uicCode ?? input.place.stationCode,
              name: input.place.name,
              lat: input.place.lat,
              lng: input.place.lng,
            }
          : undefined,
    };
  }

  const place = await resolvePlaceQuery(client, input.query);
  if (place) {
    return {
      label: place.name,
      lat: place.lat,
      lng: place.lng,
      kind: place.kind,
      placeId: place.id,
      station:
        place.kind === "station" && place.stationCode
          ? {
              code: place.stationCode,
              uicCode: place.uicCode ?? place.stationCode,
              name: place.name,
              lat: place.lat,
              lng: place.lng,
            }
          : undefined,
    };
  }

  const station = await resolveStationByCodeOrName(client, input.query);
  if (!station) {
    throw new Error(`Could not resolve place: "${input.query}"`);
  }
  return {
    label: station.name,
    lat: station.lat,
    lng: station.lng,
    kind: "station",
    station,
  };
}

function firstDeparture(trip: NsTrip): string | undefined {
  return trip.legs[0]?.plannedDeparture;
}

function lastArrival(trip: NsTrip): string | undefined {
  return trip.legs[trip.legs.length - 1]?.plannedArrival;
}

function hubAsStation(hub: TransitHub): Station {
  return {
    code: hub.code,
    uicCode: hub.code,
    name: hub.name,
    lat: hub.lat,
    lng: hub.lng,
    distanceMeters: hub.distanceMeters,
  };
}

function asStationHub(place: ResolvedPlace): TransitHub | null {
  if (!place.station?.code) return null;
  return {
    id: `station:${place.station.code}`,
    code: place.station.code,
    name: place.station.name,
    lat: place.station.lat,
    lng: place.station.lng,
    kind: "station",
    distanceMeters: 0,
  };
}

function buildOption(args: {
  trip: NsTrip;
  fromHub?: TransitHub;
  toHub?: TransitHub;
  origin: ResolvedPlace;
  destination: ResolvedPlace;
  walkMetersOrigin: number;
  walkMetersDestination: number;
  source: RankedOption["source"];
  includeWalkInTransit: boolean;
}): RankedOption {
  const walkMinOrigin = walkMinutes(args.walkMetersOrigin);
  const walkMinDest = walkMinutes(args.walkMetersDestination);
  const transitMinutes = args.trip.actualDurationInMinutes;
  const extraWalk = args.includeWalkInTransit
    ? 0
    : walkMinOrigin + walkMinDest;
  const totalDoorToDoorMinutes = transitMinutes + extraWalk;

  const notes: string[] = [];
  if (args.walkMetersOrigin > 50 && args.fromHub) {
    notes.push(
      `${Math.round(args.walkMetersOrigin)} m lopen naar ${args.fromHub.name}`,
    );
  }
  if (args.walkMetersDestination > 50 && args.toHub) {
    notes.push(
      `${Math.round(args.walkMetersDestination)} m lopen vanaf ${args.toHub.name}`,
    );
  }

  const fromLabel = args.fromHub?.name ?? args.origin.label;
  const toLabel = args.toHub?.name ?? args.destination.label;
  const summary = `${fromLabel} → ${toLabel} · ${totalDoorToDoorMinutes} min · ${args.trip.transfers} overstappen`;

  return {
    id: `${args.source}:${args.trip.uid}:${args.fromHub?.id ?? "o"}-${args.toHub?.id ?? "d"}`,
    summary,
    totalDoorToDoorMinutes,
    transitMinutes,
    walkMetersOrigin: args.walkMetersOrigin,
    walkMetersDestination: args.walkMetersDestination,
    walkMinutesOrigin: walkMinOrigin,
    walkMinutesDestination: walkMinDest,
    transfers: args.trip.transfers,
    status: args.trip.status,
    departure: firstDeparture(args.trip),
    arrival: lastArrival(args.trip),
    fromStation: args.fromHub ? hubAsStation(args.fromHub) : undefined,
    toStation: args.toHub ? hubAsStation(args.toHub) : undefined,
    notes,
    legs: markMissedConnections(args.trip.legs),
    trip: args.trip,
    source: args.source,
  };
}

/** NS trip calls run in parallel, but capped so we don't burst the NS API. */
const NS_CONCURRENCY = 4;

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await fn(items[index]!);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

async function tryTrips(
  client: NsClient,
  query: TripsQuery,
): Promise<NsTrip[]> {
  try {
    return await searchTrips(client, query);
  } catch {
    return [];
  }
}

function stationToHub(station: Station): TransitHub {
  return {
    id: `station:${station.code || station.uicCode}`,
    code: station.code || station.uicCode,
    name: station.name,
    lat: station.lat,
    lng: station.lng,
    kind: "station",
    distanceMeters: station.distanceMeters ?? 0,
  };
}

/**
 * Train stations within walking distance of a place. When the place is itself
 * a station it comes first, followed by other stations in walking range.
 */
async function nearbyStationHubs(
  client: NsClient,
  place: ResolvedPlace,
  options: { maxWalkMeters: number; maxNearby: number },
): Promise<TransitHub[]> {
  const self = asStationHub(place);
  const stations = await findNearbyStations(
    client,
    place.lat,
    place.lng,
    options,
  ).catch(() => [] as Station[]);

  const hubs = self ? [self] : [];
  for (const hub of stations.map(stationToHub)) {
    if (hubs.length >= options.maxNearby) break;
    if (hubs.some((h) => h.code === hub.code)) continue;
    hubs.push(hub);
  }
  return hubs;
}

/**
 * Transitous returns trips for a limited time span. NS trips beyond it have
 * no bus or tram trip to be compared with, so a detour there (walking to a
 * station when a bus would do) would fill the list unchecked. "Eerdere/
 * Latere reizen" fetch the next span. Without Transitous trips, keep all.
 */
function withinTransitousSpan(
  options: RankedOption[],
  itineraries: TransitousItinerary[],
  arriveBy: boolean,
): RankedOption[] {
  const timed = itineraries.filter((i) => !i.direct);
  const edges = timed
    .map((i) => Date.parse((arriveBy ? i.endTime : i.startTime) ?? ""))
    .filter(Number.isFinite);
  if (edges.length === 0) return options;
  const minute = 60_000;
  if (arriveBy) {
    const earliest = Math.min(...edges);
    return options.filter((o) => {
      if (o.source !== "nearby_combo" || !o.arrival) return true;
      return Date.parse(o.arrival) + o.walkMinutesDestination * minute >= earliest;
    });
  }
  const latest = Math.max(...edges);
  return options.filter((o) => {
    if (o.source !== "nearby_combo" || !o.departure) return true;
    return Date.parse(o.departure) - o.walkMinutesOrigin * minute <= latest;
  });
}

export async function planRoute(
  client: NsClient,
  request: PlanRequest,
): Promise<PlanResult> {
  const maxWalkMeters = request.maxWalkMeters ?? 1200;
  const maxNearby = request.maxNearby ?? 3;
  const topK = request.topK ?? 8;
  const warnings: string[] = [];

  const [from, to] = await Promise.all([
    resolvePlace(client, request.from),
    resolvePlace(client, request.to),
  ]);

  const wantTransitous = request.useTransitous !== false;
  const transitous =
    request.transitousClient ??
    (wantTransitous ? createTransitousClientFromEnv() : null);

  // Bus/tram/metro and alternative stops in walking range come from Transitous:
  // one call, MOTIS considers every stop within the walk radius itself.
  // The NS API only does station-to-station for non-employee keys.
  const transitousPromise =
    wantTransitous && transitous?.enabled
      ? transitous
          .plan({
            fromLat: from.lat,
            fromLng: from.lng,
            toLat: to.lat,
            toLng: to.lng,
            dateTime: request.dateTime,
            searchForArrival: request.searchForArrival,
            maxWalkMeters,
            numItineraries: Math.min(topK, 5),
          })
          .then(
            (itineraries) => ({ itineraries, error: undefined }),
            (error: unknown) => ({
              itineraries: [],
              error: error instanceof Error ? error.message : String(error),
            }),
          )
      : null;

  const [nearbyFromList, nearbyToList] = await Promise.all([
    nearbyStationHubs(client, from, { maxWalkMeters, maxNearby }),
    nearbyStationHubs(client, to, { maxWalkMeters, maxNearby }),
  ]);

  // A station further away than the destination itself is a detour, e.g.
  // walking to Eindhoven Centraal to ride back to where you started.
  const tripMeters = haversineMeters(from.lat, from.lng, to.lat, to.lng);
  const withinTrip = (hub: TransitHub) => hub.distanceMeters <= tripMeters;
  const combos = nearbyFromList.filter(withinTrip).flatMap((originHub) =>
    nearbyToList
      .filter((destHub) => destHub.code !== originHub.code && withinTrip(destHub))
      .map((destHub) => ({ originHub, destHub })),
  );

  const comboResults = await mapWithConcurrency(
    combos,
    NS_CONCURRENCY,
    async ({ originHub, destHub }) => ({
      originHub,
      destHub,
      trips: await tryTrips(client, {
        fromStation: originHub.code,
        toStation: destHub.code,
        dateTime: request.dateTime,
        searchForArrival: request.searchForArrival,
      }),
    }),
  );

  const options: RankedOption[] = [];
  let queriedCombinations = combos.length;

  for (const { originHub, destHub, trips } of comboResults) {
    for (const trip of trips) {
      options.push(
        buildOption({
          trip,
          fromHub: originHub,
          toHub: destHub,
          origin: from,
          destination: to,
          walkMetersOrigin: originHub.distanceMeters,
          walkMetersDestination: destHub.distanceMeters,
          source: "nearby_combo",
          includeWalkInTransit: false,
        }),
      );
    }
  }

  let transitousUsed = false;
  let candidates = options;
  if (transitousPromise) {
    queriedCombinations += 1;
    const { itineraries, error } = await transitousPromise;
    if (error) {
      warnings.push(`Transitous niet beschikbaar: ${error}`);
    }
    transitousUsed = itineraries.length > 0;
    for (const item of itineraries) {
      options.push(
        buildOption({
          trip: item.trip,
          origin: from,
          destination: to,
          walkMetersOrigin: 0,
          walkMetersDestination: 0,
          source: "transitous",
          includeWalkInTransit: true,
        }),
      );
    }
    if (transitousUsed) {
      warnings.push("Multimodale opties toegevoegd via Transitous.");
    }
    candidates = withinTransitousSpan(options, itineraries, request.searchForArrival === true);
  }

  const ranked = rankOptions(dropDominated(dedupeOptions(candidates))).slice(
    0,
    topK,
  );
  if (ranked.length === 0) {
    warnings.push("Geen reisadviezen gevonden voor deze combinatie.");
  }

  return {
    from,
    to,
    nearbyFrom: nearbyFromList,
    nearbyTo: nearbyToList,
    options: ranked,
    queriedCombinations,
    warnings,
    transitousUsed,
  };
}

export type PublicPlanResult = {
  from: ResolvedPlace;
  to: ResolvedPlace;
  options: Array<{
    id: string;
    summary: string;
    totalDoorToDoorMinutes: number;
    transitMinutes: number;
    walkMetersOrigin: number;
    walkMetersDestination: number;
    walkMinutesOrigin: number;
    walkMinutesDestination: number;
    transfers: number;
    departure?: string;
    arrival?: string;
    fromStation?: {
      code: string;
      name: string;
      distanceMeters?: number;
    };
    toStation?: {
      code: string;
      name: string;
      distanceMeters?: number;
    };
    notes: string[];
    legs: NsTrip["legs"];
  }>;
  debug: {
    queriedCombinations: number;
    warnings: string[];
    transitousUsed: boolean;
    nearbyFrom: Array<{
      code: string;
      name: string;
      kind: string;
      distanceMeters: number;
    }>;
    nearbyTo: Array<{
      code: string;
      name: string;
      kind: string;
      distanceMeters: number;
    }>;
    optionSources: Array<{ id: string; source: string; tripType?: string }>;
  };
};

/** Serialize plan result: UI fields + separate debug block for logging. */
export function toPublicPlanResult(result: PlanResult): PublicPlanResult {
  return {
    from: result.from,
    to: result.to,
    options: result.options.map((o) => ({
      id: o.id,
      summary: o.summary,
      totalDoorToDoorMinutes: o.totalDoorToDoorMinutes,
      transitMinutes: o.transitMinutes,
      walkMetersOrigin: Math.round(o.walkMetersOrigin),
      walkMetersDestination: Math.round(o.walkMetersDestination),
      walkMinutesOrigin: o.walkMinutesOrigin,
      walkMinutesDestination: o.walkMinutesDestination,
      transfers: o.transfers,
      departure: o.departure,
      arrival: o.arrival,
      fromStation: o.fromStation
        ? {
            code: o.fromStation.code,
            name: o.fromStation.name,
            distanceMeters: o.fromStation.distanceMeters
              ? Math.round(o.fromStation.distanceMeters)
              : undefined,
          }
        : undefined,
      toStation: o.toStation
        ? {
            code: o.toStation.code,
            name: o.toStation.name,
            distanceMeters: o.toStation.distanceMeters
              ? Math.round(o.toStation.distanceMeters)
              : undefined,
          }
        : undefined,
      notes: o.notes,
      legs: o.legs,
    })),
    debug: {
      queriedCombinations: result.queriedCombinations,
      warnings: result.warnings,
      transitousUsed: result.transitousUsed,
      nearbyFrom: result.nearbyFrom.map((h) => ({
        code: h.code,
        name: h.name,
        kind: h.kind,
        distanceMeters: Math.round(h.distanceMeters),
      })),
      nearbyTo: result.nearbyTo.map((h) => ({
        code: h.code,
        name: h.name,
        kind: h.kind,
        distanceMeters: Math.round(h.distanceMeters),
      })),
      optionSources: result.options.map((o) => ({
        id: o.id,
        source: o.source,
        tripType: o.trip.type,
      })),
    },
  };
}
