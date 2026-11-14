import type { LegStop, NsTrip, TripLegSummary, TripMessage } from "../ns/types.js";
import { WALK_METERS_PER_MINUTE } from "../planner/geo.js";

const DEFAULT_BASE = "https://api.transitous.org";
const USER_AGENT = "JelphOVPlanner/0.3.0 (+https://jelph.nl)";

export type TransitousPlanQuery = {
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
  dateTime?: string;
  searchForArrival?: boolean;
  maxWalkMeters?: number;
  /** Walk limit at the start only; defaults to maxWalkMeters. */
  maxStartWalkMeters?: number;
  numItineraries?: number;
  /** How far past `dateTime` departures are searched; MOTIS default otherwise. */
  searchWindowMinutes?: number;
};

export type TransitousItinerary = {
  id: string;
  durationSeconds: number;
  transfers: number;
  startTime?: string;
  endTime?: string;
  trip: NsTrip;
  /** Walking all the way, no transit: can start at any time. */
  direct?: boolean;
};

/** A GTFS-RT service alert, as MOTIS attaches it to a stop or leg. */
type RawAlert = {
  headerText?: string;
  effect?: string;
  impactPeriod?: Array<{ start?: string; end?: string }>;
};

type RawPlace = {
  name?: string;
  lat?: number;
  lon?: number;
  arrival?: string;
  departure?: string;
  scheduledArrival?: string;
  scheduledDeparture?: string;
  track?: string;
  scheduledTrack?: string;
  cancelled?: boolean;
  alerts?: RawAlert[];
};

type RawLeg = {
  mode?: string;
  from?: RawPlace;
  to?: RawPlace;
  duration?: number;
  startTime?: string;
  endTime?: string;
  scheduledStartTime?: string;
  scheduledEndTime?: string;
  distance?: number;
  routeShortName?: string;
  headsign?: string;
  /** The trip is cancelled (real-time); MOTIS also sets it on some walks. */
  cancelled?: boolean;
  alerts?: RawAlert[];
  legGeometry?: { points?: string; precision?: number };
  intermediateStops?: RawPlace[];
};

type RawItinerary = {
  id?: string;
  duration?: number;
  transfers?: number;
  startTime?: string;
  endTime?: string;
  legs?: RawLeg[];
};

function modalityLabel(leg: RawLeg): string {
  const mode = (leg.mode ?? "LEG").toUpperCase();
  if (mode === "WALK") return "Walk";
  if (leg.routeShortName) return `${mode} ${leg.routeShortName}`;
  return mode;
}

function mapStops(stops: RawPlace[] | undefined): LegStop[] | undefined {
  if (!Array.isArray(stops) || stops.length === 0) return undefined;
  return stops
    .filter((s) => s.name)
    .map((s) => ({
      name: s.name!,
      arrival: s.arrival ?? s.scheduledArrival,
      departure: s.departure ?? s.scheduledDeparture,
      scheduledArrival: s.scheduledArrival,
      scheduledDeparture: s.scheduledDeparture,
      cancelled: s.cancelled === true || undefined,
    }));
}

/**
 * The ride can't be taken: the trip is cancelled, or it skips the stop where
 * you get on or off. Walks are left alone: MOTIS marks a change walk between
 * two stops as cancelled when nothing is, which would scare for no reason.
 */
function rideCancelled(leg: RawLeg): boolean {
  if ((leg.mode ?? "").toUpperCase() === "WALK") return false;
  return (
    leg.cancelled === true ||
    leg.from?.cancelled === true ||
    leg.to?.cancelled === true
  );
}

/** Effects that mean the ride may not run, or not where you need it. */
const ALERT_EFFECTS = new Set(["NO_SERVICE", "STOP_MOVED"]);
const WARNING_EFFECTS = new Set([
  "REDUCED_SERVICE",
  "SIGNIFICANT_DELAYS",
  "DETOUR",
  "MODIFIED_SERVICE",
]);

/**
 * Service alerts on the ride and its stops that apply while you ride. MOTIS
 * also returns alerts for later, e.g. a holiday timetable next month. A stop's
 * alert may be about another line calling there (works on metro D shown for
 * metro E), so from stops only the ones that change the trip are kept.
 */
function rideMessages(leg: RawLeg): TripMessage[] | undefined {
  if ((leg.mode ?? "").toUpperCase() === "WALK") return undefined;
  const start = Date.parse(leg.startTime ?? leg.scheduledStartTime ?? "");
  const end = Date.parse(leg.endTime ?? leg.scheduledEndTime ?? "");
  const applies = (alert: RawAlert) => {
    const periods = alert.impactPeriod ?? [];
    if (periods.length === 0 || !Number.isFinite(start)) return true;
    return periods.some((p) => {
      const from = p.start ? Date.parse(p.start) : -Infinity;
      const to = p.end ? Date.parse(p.end) : Infinity;
      return from <= (Number.isFinite(end) ? end : start) && to >= start;
    });
  };
  const alerts = [
    ...(leg.alerts ?? []).map((alert) => ({ alert, atStop: false })),
    ...[...(leg.from?.alerts ?? []), ...(leg.to?.alerts ?? [])].map((alert) => ({
      alert,
      atStop: true,
    })),
  ];
  const seen = new Set<string>();
  const list: TripMessage[] = [];
  for (const { alert, atStop } of alerts) {
    const text = alert.headerText?.trim();
    if (!text || seen.has(text) || !applies(alert)) continue;
    const effect = (alert.effect ?? "").toUpperCase();
    const level: TripMessage["level"] = ALERT_EFFECTS.has(effect)
      ? "alert"
      : WARNING_EFFECTS.has(effect)
        ? "warning"
        : "info";
    if (atStop && level === "info") continue;
    seen.add(text);
    list.push({ text, level });
  }
  return list.length > 0 ? list : undefined;
}

function mapLeg(leg: RawLeg): TripLegSummary {
  return {
    origin: leg.from?.name && leg.from.name !== "START" ? leg.from.name : "Start",
    destination:
      leg.to?.name && leg.to.name !== "END" ? leg.to.name : "End",
    plannedDeparture:
      leg.startTime ??
      leg.scheduledStartTime ??
      leg.from?.departure ??
      leg.from?.scheduledDeparture,
    plannedArrival:
      leg.endTime ??
      leg.scheduledEndTime ??
      leg.to?.arrival ??
      leg.to?.scheduledArrival,
    scheduledDeparture: leg.scheduledStartTime ?? leg.from?.scheduledDeparture,
    scheduledArrival: leg.scheduledEndTime ?? leg.to?.scheduledArrival,
    modality: modalityLabel(leg),
    cancelled: rideCancelled(leg),
    messages: rideMessages(leg),
    distanceMeters:
      typeof leg.distance === "number" && Number.isFinite(leg.distance)
        ? Math.round(leg.distance)
        : undefined,
    originTrack: leg.from?.track ?? leg.from?.scheduledTrack,
    destinationTrack: leg.to?.track ?? leg.to?.scheduledTrack,
    scheduledOriginTrack: leg.from?.scheduledTrack,
    scheduledDestinationTrack: leg.to?.scheduledTrack,
    stops: mapStops(leg.intermediateStops),
    geometry: leg.legGeometry?.points
      ? { points: leg.legGeometry.points, precision: leg.legGeometry.precision ?? 6 }
      : undefined,
    originLat: leg.from?.lat,
    originLng: leg.from?.lon,
    destinationLat: leg.to?.lat,
    destinationLng: leg.to?.lon,
  };
}

function mapItinerary(
  raw: RawItinerary,
  fallbackId: string,
  direct = false,
): TransitousItinerary | null {
  const legs = Array.isArray(raw.legs) ? raw.legs.map(mapLeg) : [];
  if (legs.length === 0) return null;

  const durationSeconds = Number(raw.duration ?? 0);
  const durationMinutes = Math.max(1, Math.round(durationSeconds / 60));
  const transfers = Number(raw.transfers ?? 0);
  const id = String(raw.id ?? fallbackId);

  const trip: NsTrip = {
    uid: id,
    plannedDurationInMinutes: durationMinutes,
    actualDurationInMinutes: durationMinutes,
    transfers: Number.isFinite(transfers) ? transfers : 0,
    status: "NORMAL",
    type: direct ? "TRANSITOUS_DIRECT" : "TRANSITOUS",
    legs,
    raw,
  };

  return {
    id,
    durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : durationMinutes * 60,
    transfers: trip.transfers,
    startTime: raw.startTime ?? legs[0]?.plannedDeparture,
    endTime: raw.endTime ?? legs[legs.length - 1]?.plannedArrival,
    trip,
    direct: direct || undefined,
  };
}

export type TransitousClientOptions = {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  userAgent?: string;
  enabled?: boolean;
};

export class TransitousClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly userAgent: string;
  readonly enabled: boolean;

  constructor(options: TransitousClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE).replace(/\/$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.userAgent = options.userAgent ?? USER_AGENT;
    this.enabled = options.enabled ?? true;
  }

  async plan(query: TransitousPlanQuery): Promise<TransitousItinerary[]> {
    if (!this.enabled) return [];

    const url = new URL(`${this.baseUrl}/api/v5/plan`);
    url.searchParams.set(
      "fromPlace",
      `${query.fromLat},${query.fromLng}`,
    );
    url.searchParams.set("toPlace", `${query.toLat},${query.toLng}`);
    url.searchParams.set(
      "arriveBy",
      query.searchForArrival ? "true" : "false",
    );
    url.searchParams.set(
      "numItineraries",
      String(query.numItineraries ?? 5),
    );
    // MOTIS limits first/last-mile walking by time; it then considers every
    // stop reachable within that time, not just the one nearest the coords.
    const walkSeconds = (meters: number) =>
      String(Math.round((meters / WALK_METERS_PER_MINUTE) * 60));
    const startWalk = query.maxStartWalkMeters ?? query.maxWalkMeters;
    if (startWalk) url.searchParams.set("maxPreTransitTime", walkSeconds(startWalk));
    if (query.maxWalkMeters) {
      url.searchParams.set("maxPostTransitTime", walkSeconds(query.maxWalkMeters));
      // The walk-only route ("direct") within the same walking limit.
      url.searchParams.set("maxDirectTime", walkSeconds(query.maxWalkMeters));
    }
    if (query.searchWindowMinutes) {
      url.searchParams.set("searchWindow", String(query.searchWindowMinutes * 60));
    }
    if (query.dateTime) {
      // MOTIS accepts ISO-8601 timestamps.
      url.searchParams.set("time", query.dateTime);
    }

    const response = await this.fetchImpl(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": this.userAgent,
      },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `Transitous ${response.status}: ${body.slice(0, 240)}`,
      );
    }

    const json = (await response.json()) as {
      itineraries?: RawItinerary[];
      direct?: RawItinerary[];
    };
    const list = Array.isArray(json.itineraries) ? json.itineraries : [];
    const direct = Array.isArray(json.direct) ? json.direct : [];
    return [
      ...list.map((item, index) => mapItinerary(item, `transitous-${index}`)),
      ...direct.map((item, index) => mapItinerary(item, `direct-${index}`, true)),
    ].filter((item): item is TransitousItinerary => item !== null);
  }
}

export function createTransitousClientFromEnv(): TransitousClient {
  const enabledRaw = (process.env.TRANSITOUS_ENABLED ?? "true").toLowerCase();
  const enabled = !["0", "false", "no", "off"].includes(enabledRaw);
  return new TransitousClient({
    baseUrl: process.env.TRANSITOUS_BASE_URL ?? DEFAULT_BASE,
    userAgent: process.env.TRANSITOUS_USER_AGENT ?? USER_AGENT,
    enabled,
  });
}
