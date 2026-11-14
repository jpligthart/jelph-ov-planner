import type { NsClient } from "./client.js";
import type {
  LegStop,
  NsTrip,
  TripLegSummary,
  TripMessage,
  TripsQuery,
} from "./types.js";

type RawStop = {
  name?: string;
  plannedDateTime?: string;
  actualDateTime?: string;
  plannedTrack?: string;
  actualTrack?: string;
  lat?: number;
  lng?: number;
};

/** A stop on the leg's route, origin and destination included. */
type RawLegStop = {
  name?: string;
  plannedArrivalDateTime?: string;
  actualArrivalDateTime?: string;
  plannedDepartureDateTime?: string;
  actualDepartureDateTime?: string;
  cancelled?: boolean;
  /** The train runs through without stopping. */
  passing?: boolean;
};

/** Shown by NS as a coloured banner; `type` is e.g. "warning" or "error". */
type RawNesProperties = { type?: string };

type RawLeg = {
  cancelled?: boolean;
  /** Part of the train's route is cancelled; maybe not the part you ride. */
  partCancelled?: boolean;
  messages?: Array<{ text?: string; type?: string; nesProperties?: RawNesProperties }>;
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
  changePossible?: boolean;
  reachable?: boolean;
  stops?: RawLegStop[];
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
  /** NS's main notice for the trip, e.g. "Trein rijdt niet". */
  primaryMessage?: {
    title?: string;
    type?: string;
    nesProperties?: RawNesProperties;
  };
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

function mapStops(stops: RawLegStop[] | undefined): LegStop[] | undefined {
  if (!Array.isArray(stops) || stops.length <= 2) return undefined;
  return stops
    .slice(1, -1)
    .filter((s) => !s.passing && s.name)
    .map((s) => ({
      name: s.name!,
      arrival: s.actualArrivalDateTime ?? s.plannedArrivalDateTime,
      departure: s.actualDepartureDateTime ?? s.plannedDepartureDateTime,
      scheduledArrival: s.plannedArrivalDateTime,
      scheduledDeparture: s.plannedDepartureDateTime,
      cancelled: s.cancelled === true || undefined,
    }));
}

/**
 * The leg can't be ridden: the whole train is cancelled, or it no longer
 * calls where you get on or off. NS then only sets `partCancelled` on the
 * leg and `cancelled` on that stop, so the stop ends must be checked too.
 */
function legCancelled(leg: RawLeg): boolean {
  if (leg.cancelled === true) return true;
  const stops = Array.isArray(leg.stops) ? leg.stops : [];
  const first = stops[0];
  const last = stops[stops.length - 1];
  return first?.cancelled === true || last?.cancelled === true;
}

function messageLevel(nes?: RawNesProperties): TripMessage["level"] {
  const type = (nes?.type ?? "").toLowerCase();
  if (type === "error" || type === "alert") return "alert";
  if (type === "warning") return "warning";
  return "info";
}

function legMessages(leg: RawLeg): TripMessage[] | undefined {
  if (!Array.isArray(leg.messages)) return undefined;
  const seen = new Set<string>();
  const list: TripMessage[] = [];
  for (const m of leg.messages) {
    const text = m.text?.trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    list.push({ text, level: messageLevel(m.nesProperties) });
  }
  return list.length > 0 ? list : undefined;
}

function mapLeg(leg: RawLeg): TripLegSummary {
  const cancelled = legCancelled(leg);
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
    cancelled,
    partCancelled: !cancelled && leg.partCancelled === true ? true : undefined,
    messages: legMessages(leg),
    missedConnection:
      leg.changePossible === false || leg.reachable === false ? true : undefined,
    distanceMeters: leg.distanceInMeters ?? leg.distance,
    originTrack: leg.origin?.actualTrack ?? leg.origin?.plannedTrack,
    destinationTrack:
      leg.destination?.actualTrack ?? leg.destination?.plannedTrack,
    scheduledOriginTrack: leg.origin?.plannedTrack,
    scheduledDestinationTrack: leg.destination?.plannedTrack,
    stops: mapStops(leg.stops),
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
  const status = String(raw.status ?? "NORMAL");
  const legs = Array.isArray(raw.legs) ? raw.legs.map(mapLeg) : [];
  // NS calls the whole trip off but no leg says which: then it is the one
  // with a cancelled part, so the trip never looks like it runs normally.
  if (status === "CANCELLED" && !legs.some((l) => l.cancelled)) {
    for (const leg of legs) {
      if (leg.partCancelled) {
        leg.cancelled = true;
        leg.partCancelled = undefined;
      }
    }
  }
  const title = raw.primaryMessage?.title?.trim();
  return {
    uid: String(raw.uid ?? raw.ctxRecon),
    ctxRecon: raw.ctxRecon,
    plannedDurationInMinutes: Number.isFinite(planned) ? planned : 0,
    actualDurationInMinutes: Number.isFinite(actual) ? actual : 0,
    transfers: Number(raw.transfers ?? 0),
    status,
    message: title
      ? { text: title, level: messageLevel(raw.primaryMessage?.nesProperties) }
      : undefined,
    optimal: raw.optimal,
    type: raw.type,
    legs,
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
