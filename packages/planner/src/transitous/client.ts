import type { NsTrip, TripLegSummary } from "../ns/types.js";
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
};

export type TransitousItinerary = {
  id: string;
  durationSeconds: number;
  transfers: number;
  startTime?: string;
  endTime?: string;
  trip: NsTrip;
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
  intermediateStops?: unknown[];
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
    cancelled: false,
    distanceMeters:
      typeof leg.distance === "number" && Number.isFinite(leg.distance)
        ? Math.round(leg.distance)
        : undefined,
    originTrack: leg.from?.track ?? leg.from?.scheduledTrack,
    destinationTrack: leg.to?.track ?? leg.to?.scheduledTrack,
    scheduledOriginTrack: leg.from?.scheduledTrack,
    scheduledDestinationTrack: leg.to?.scheduledTrack,
    originLat: leg.from?.lat,
    originLng: leg.from?.lon,
    destinationLat: leg.to?.lat,
    destinationLng: leg.to?.lon,
  };
}

function mapItinerary(raw: RawItinerary, index: number): TransitousItinerary | null {
  const legs = Array.isArray(raw.legs) ? raw.legs.map(mapLeg) : [];
  if (legs.length === 0) return null;

  const durationSeconds = Number(raw.duration ?? 0);
  const durationMinutes = Math.max(1, Math.round(durationSeconds / 60));
  const transfers = Number(raw.transfers ?? 0);
  const id = String(raw.id ?? `transitous-${index}`);

  const trip: NsTrip = {
    uid: id,
    plannedDurationInMinutes: durationMinutes,
    actualDurationInMinutes: durationMinutes,
    transfers: Number.isFinite(transfers) ? transfers : 0,
    status: "NORMAL",
    type: "TRANSITOUS",
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

    const json = (await response.json()) as { itineraries?: RawItinerary[] };
    const list = Array.isArray(json.itineraries) ? json.itineraries : [];
    return list
      .map((item, index) => mapItinerary(item, index))
      .filter((item): item is TransitousItinerary => item !== null);
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
