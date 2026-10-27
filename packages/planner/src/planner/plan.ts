import { NsApiError, type NsClient } from "../ns/client.js";
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
} from "../transitous/client.js";
import { walkMinutes } from "./geo.js";
import { findNearbyHubs, type TransitHub } from "./hubs.js";
import {
  dedupeOptions,
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
  doorToDoorAvailable: boolean;
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
    legs: args.trip.legs,
    trip: args.trip,
    source: args.source,
  };
}

type TripAttempt = {
  trips: NsTrip[];
  doorToDoorBlocked: boolean;
  errorMessage?: string;
};

async function attemptTrips(
  client: NsClient,
  query: TripsQuery,
): Promise<TripAttempt> {
  try {
    return { trips: await searchTrips(client, query), doorToDoorBlocked: false };
  } catch (error) {
    if (error instanceof NsApiError && error.isDoorToDoorForbidden) {
      return {
        trips: [],
        doorToDoorBlocked: true,
        errorMessage: error.message,
      };
    }
    return {
      trips: [],
      doorToDoorBlocked: false,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function planRoute(
  client: NsClient,
  request: PlanRequest,
): Promise<PlanResult> {
  const maxWalkMeters = request.maxWalkMeters ?? 1200;
  const maxNearby = request.maxNearby ?? 3;
  const topK = request.topK ?? 8;
  const warnings: string[] = [];

  const from = await resolvePlace(client, request.from);
  const to = await resolvePlace(client, request.to);

  const nearbyFrom =
    asStationHub(from) ??
    (await findNearbyHubs(client, from.lat, from.lng, {
      maxWalkMeters,
      maxNearby,
    }));

  const nearbyTo =
    asStationHub(to) ??
    (await findNearbyHubs(client, to.lat, to.lng, {
      maxWalkMeters,
      maxNearby,
    }));

  const nearbyFromList = Array.isArray(nearbyFrom) ? nearbyFrom : [nearbyFrom];
  const nearbyToList = Array.isArray(nearbyTo) ? nearbyTo : [nearbyTo];

  const options: RankedOption[] = [];
  let queriedCombinations = 0;
  let doorToDoorAvailable = true;

  queriedCombinations += 1;
  const baseline = await attemptTrips(client, {
    originLat: from.lat,
    originLng: from.lng,
    originName: from.label,
    destinationLat: to.lat,
    destinationLng: to.lng,
    destinationName: to.label,
    dateTime: request.dateTime,
    searchForArrival: request.searchForArrival,
    originWalk: true,
    destinationWalk: true,
  });

  if (baseline.doorToDoorBlocked) {
    doorToDoorAvailable = false;
    warnings.push(
      "NS API-key blokkeert deur-tot-deur (bus/tram/metro). Transitous + NS station-alternatieven worden gebruikt.",
    );
  } else {
    for (const trip of baseline.trips) {
      options.push(
        buildOption({
          trip,
          origin: from,
          destination: to,
          walkMetersOrigin: 0,
          walkMetersDestination: 0,
          source: "baseline",
          includeWalkInTransit: true,
        }),
      );
    }
  }

  const fromStations = nearbyFromList.filter((h) => h.kind === "station");
  const toStations = nearbyToList.filter((h) => h.kind === "station");

  for (const originHub of fromStations) {
    for (const destHub of toStations) {
      if (originHub.code === destHub.code) continue;
      queriedCombinations += 1;
      const attempt = await attemptTrips(client, {
        fromStation: originHub.code,
        toStation: destHub.code,
        dateTime: request.dateTime,
        searchForArrival: request.searchForArrival,
      });
      for (const trip of attempt.trips) {
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
  }

  if (doorToDoorAvailable) {
    const originStops = nearbyFromList
      .filter((h) => h.kind === "stop")
      .slice(0, maxNearby);
    const destStops = nearbyToList
      .filter((h) => h.kind === "stop")
      .slice(0, maxNearby);

    for (const originHub of originStops) {
      queriedCombinations += 1;
      const attempt = await attemptTrips(client, {
        originLat: originHub.lat,
        originLng: originHub.lng,
        originName: originHub.name,
        destinationLat: to.lat,
        destinationLng: to.lng,
        destinationName: to.label,
        dateTime: request.dateTime,
        searchForArrival: request.searchForArrival,
        originWalk: true,
        destinationWalk: true,
      });
      if (attempt.doorToDoorBlocked) {
        doorToDoorAvailable = false;
        break;
      }
      for (const trip of attempt.trips) {
        options.push(
          buildOption({
            trip,
            fromHub: originHub,
            origin: from,
            destination: to,
            walkMetersOrigin: originHub.distanceMeters,
            walkMetersDestination: 0,
            source: "nearby_combo",
            includeWalkInTransit: false,
          }),
        );
      }
    }

    if (doorToDoorAvailable) {
      for (const destHub of destStops) {
        queriedCombinations += 1;
        const attempt = await attemptTrips(client, {
          originLat: from.lat,
          originLng: from.lng,
          originName: from.label,
          destinationLat: destHub.lat,
          destinationLng: destHub.lng,
          destinationName: destHub.name,
          dateTime: request.dateTime,
          searchForArrival: request.searchForArrival,
          originWalk: true,
          destinationWalk: true,
        });
        if (attempt.doorToDoorBlocked) {
          doorToDoorAvailable = false;
          break;
        }
        for (const trip of attempt.trips) {
          options.push(
            buildOption({
              trip,
              toHub: destHub,
              origin: from,
              destination: to,
              walkMetersOrigin: 0,
              walkMetersDestination: destHub.distanceMeters,
              source: "nearby_combo",
              includeWalkInTransit: false,
            }),
          );
        }
      }
    }
  }

  let transitousUsed = false;
  const wantTransitous = request.useTransitous !== false;
  const transitous =
    request.transitousClient ??
    (wantTransitous ? createTransitousClientFromEnv() : null);

  if (wantTransitous && transitous?.enabled) {
    queriedCombinations += 1;
    try {
      const itineraries = await transitous.plan({
        fromLat: from.lat,
        fromLng: from.lng,
        toLat: to.lat,
        toLng: to.lng,
        dateTime: request.dateTime,
        searchForArrival: request.searchForArrival,
        maxWalkMeters,
        numItineraries: Math.min(topK, 5),
      });
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
    } catch (error) {
      warnings.push(
        `Transitous niet beschikbaar: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  const ranked = rankOptions(dedupeOptions(options)).slice(0, topK);
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
    doorToDoorAvailable,
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
    doorToDoorAvailable: boolean;
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
      doorToDoorAvailable: result.doorToDoorAvailable,
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
