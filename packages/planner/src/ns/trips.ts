import type { NsClient } from "./client.js";
import type { NsTrip, TripLegSummary, TripsQuery } from "./types.js";

type RawStop = {
  name?: string;
  plannedDateTime?: string;
  actualDateTime?: string;
  plannedTrack?: string;
  actualTrack?: string;
  lat?: number;
  lng?: number;
};

type RawLeg = {
  cancelled?: boolean;
  origin?: RawStop;
  destination?: RawStop;
  product?: {
    longCategoryName?: string;
    shortCategoryName?: string;
    type?: string;
  };
  travelType?: string;
  mode?: { name?: string };
  distance?: number;
  distanceInMeters?: number;
};

type RawTrip = {
  uid?: string;
  ctxRecon?: string;
  plannedDurationInMinutes?: number;
  actualDurationInMinutes?: number;
  transfers?: number;
  status?: string;
  optimal?: boolean;
  type?: string;
  legs?: RawLeg[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function extractRawTrips(json: unknown): RawTrip[] {
  const trips: RawTrip[] = [];

  const pushFromAdvice = (advice: unknown) => {
    const obj = asRecord(advice);
    if (!obj) return;
    const list = obj.trips;
    if (Array.isArray(list)) {
      for (const trip of list) trips.push(trip as RawTrip);
    }
  };

  if (Array.isArray(json)) {
    for (const item of json) {
      const obj = asRecord(item);
      if (obj?.trips && Array.isArray(obj.trips)) {
        pushFromAdvice(obj);
      } else if (obj?.uid || obj?.legs) {
        trips.push(item as RawTrip);
      }
    }
    return trips;
  }

  const root = asRecord(json);
  if (!root) return trips;

  if (Array.isArray(root.trips)) {
    for (const trip of root.trips) trips.push(trip as RawTrip);
  }

  if (Array.isArray(root.payload)) {
    for (const item of root.payload) pushFromAdvice(item);
  } else {
    pushFromAdvice(root.payload);
  }

  return trips;
}

function mapLeg(leg: RawLeg): TripLegSummary {
  return {
    origin: leg.origin?.name ?? "?",
    destination: leg.destination?.name ?? "?",
    plannedDeparture: leg.origin?.actualDateTime ?? leg.origin?.plannedDateTime,
    plannedArrival:
      leg.destination?.actualDateTime ?? leg.destination?.plannedDateTime,
    scheduledDeparture: leg.origin?.plannedDateTime,
    scheduledArrival: leg.destination?.plannedDateTime,
    modality:
      leg.product?.longCategoryName ??
      leg.product?.shortCategoryName ??
      leg.mode?.name ??
      leg.travelType ??
      leg.product?.type,
    cancelled: leg.cancelled === true,
    distanceMeters: leg.distanceInMeters ?? leg.distance,
    originTrack: leg.origin?.actualTrack ?? leg.origin?.plannedTrack,
    destinationTrack:
      leg.destination?.actualTrack ?? leg.destination?.plannedTrack,
    scheduledOriginTrack: leg.origin?.plannedTrack,
    scheduledDestinationTrack: leg.destination?.plannedTrack,
    originLat: leg.origin?.lat,
    originLng: leg.origin?.lng,
    destinationLat: leg.destination?.lat,
    destinationLng: leg.destination?.lng,
  };
}

function mapTrip(raw: RawTrip): NsTrip | null {
  if (!raw.uid && !raw.ctxRecon) return null;
  const planned = Number(raw.plannedDurationInMinutes ?? 0);
  const actual = Number(raw.actualDurationInMinutes ?? planned);
  return {
    uid: String(raw.uid ?? raw.ctxRecon),
    ctxRecon: raw.ctxRecon,
    plannedDurationInMinutes: Number.isFinite(planned) ? planned : 0,
    actualDurationInMinutes: Number.isFinite(actual) ? actual : 0,
    transfers: Number(raw.transfers ?? 0),
    status: String(raw.status ?? "NORMAL"),
    optimal: raw.optimal,
    type: raw.type,
    legs: Array.isArray(raw.legs) ? raw.legs.map(mapLeg) : [],
    raw,
  };
}

export async function searchTrips(
  client: NsClient,
  query: TripsQuery,
): Promise<NsTrip[]> {
  const json = await client.getJson<unknown>(
    "/reisinformatie-api/api/v3/trips",
    {
      fromStation: query.fromStation,
      toStation: query.toStation,
      originLat: query.originLat,
      originLng: query.originLng,
      originName: query.originName,
      destinationLat: query.destinationLat,
      destinationLng: query.destinationLng,
      destinationName: query.destinationName,
      dateTime: query.dateTime,
      searchForArrival: query.searchForArrival,
      originWalk: query.originWalk,
      destinationWalk: query.destinationWalk,
      lang: query.lang ?? "nl",
    },
  );

  return extractRawTrips(json)
    .map(mapTrip)
    .filter((t): t is NsTrip => t !== null);
}
