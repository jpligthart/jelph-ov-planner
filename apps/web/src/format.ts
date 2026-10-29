import type { PlanLeg, PlanOption } from "./api";

/** Average walking speed, matches the planner's estimate. */
const WALK_METERS_PER_MINUTE = 80;

export type ModeKind =
  | "train"
  | "bus"
  | "tram"
  | "metro"
  | "ferry"
  | "walk"
  | "other";

export function formatClock(iso?: string | Date): string {
  if (!iso) return "—";
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleTimeString("nl-NL", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${h} u` : `${h} u ${rest} min`;
}

export function formatDistance(meters: number): string {
  const m = Math.max(0, Math.round(meters));
  if (m < 1000) return `${Math.round(m / 10) * 10} m`;
  return `${(m / 1000).toFixed(1).replace(".", ",")} km`;
}

export function friendlyError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("could not resolve") || lower.includes("niet vinden")) {
    return "We konden dit adres of station niet vinden. Probeer een andere schrijfwijze.";
  }
  if (lower.includes("429") || lower.includes("te druk") || lower.includes("rate limit")) {
    return "Even te druk bij de reisplanner. Probeer het zo opnieuw.";
  }
  if (lower.includes("failed to fetch") || lower.includes("network")) {
    return "Geen verbinding met de server. Check of de API draait.";
  }
  return "Er ging iets mis bij het plannen. Probeer het opnieuw.";
}

/** Classify the many NS / Transitous modality strings into a few kinds. */
export function modeKind(raw?: string): ModeKind {
  if (!raw) return "other";
  const u = raw.trim().toUpperCase();
  if (u.startsWith("WALK") || u.includes("LOPEN") || u === "FOOT") return "walk";
  if (u.startsWith("BUS") || u.startsWith("COACH")) return "bus";
  if (u.startsWith("TRAM")) return "tram";
  if (u.startsWith("METRO") || u.startsWith("SUBWAY")) return "metro";
  if (u.startsWith("FERRY") || u.includes("VEER") || u.includes("BOAT")) return "ferry";
  if (
    u.includes("RAIL") ||
    u.includes("TRAIN") ||
    u.includes("TREIN") ||
    u.includes("INTERCITY") ||
    u.includes("SPRINTER") ||
    u.includes("EUROCITY") ||
    u.includes("EUROSTAR") ||
    u.startsWith("ICE") ||
    u === "IC" ||
    u === "LONG_DISTANCE"
  ) {
    return "train";
  }
  return "other";
}

export const MODE_LABELS: Record<ModeKind, string> = {
  train: "Trein",
  bus: "Bus",
  tram: "Tram",
  metro: "Metro",
  ferry: "Veer",
  walk: "Lopen",
  other: "Overig",
};

/** Short Dutch label for a leg, e.g. "Intercity", "Bus 12", "Metro E". */
export function modalityNl(raw?: string): string {
  if (!raw) return "Onderweg";
  const text = raw.trim();
  const kind = modeKind(text);
  const rest = text.replace(/^[A-Z_]+\s*/, "").trim();
  const isUpperCode = /^[A-Z_]+(\s|$)/.test(text);

  switch (kind) {
    case "walk":
      return "Lopen";
    case "bus":
    case "tram":
    case "metro":
      return isUpperCode && rest ? `${MODE_LABELS[kind]} ${rest}` : MODE_LABELS[kind];
    case "ferry":
      return "Veer";
    case "train": {
      const u = text.toUpperCase();
      if (u.includes("SPRINTER") || /\bSPR\b/.test(u)) return "Sprinter";
      if (/\bIC\b/.test(u) && !u.includes("ICE")) return "Intercity";
      if (isUpperCode) return rest || "Trein";
      return text;
    }
    default:
      return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
  }
}

export function minutesBetween(a?: string, b?: string): number {
  if (!a || !b) return 0;
  const diff = (new Date(b).getTime() - new Date(a).getTime()) / 60000;
  return Number.isFinite(diff) ? Math.max(0, Math.round(diff)) : 0;
}

export function legMinutes(leg: PlanLeg): number {
  return minutesBetween(leg.plannedDeparture, leg.plannedArrival);
}

function walkLegMeters(leg: PlanLeg): number {
  return leg.distanceMeters ?? legMinutes(leg) * WALK_METERS_PER_MINUTE;
}

/** Total walking distance, including first/last mile and walk legs. */
export function walkMetersTotal(option: PlanOption): number {
  let meters = option.walkMetersOrigin + option.walkMetersDestination;
  for (const leg of option.legs) {
    if (modeKind(leg.modality) === "walk") meters += walkLegMeters(leg);
  }
  return Math.round(meters);
}

/**
 * Longest single stretch on foot. One long walk is what people feel, more
 * than several short ones at stations added up.
 */
export function longestWalkMeters(option: PlanOption): number {
  let longest = Math.max(option.walkMetersOrigin, option.walkMetersDestination);
  for (const leg of option.legs) {
    if (modeKind(leg.modality) === "walk") {
      longest = Math.max(longest, walkLegMeters(leg));
    }
  }
  return Math.round(longest);
}

export function walkMinutesTotal(option: PlanOption): number {
  let minutes = option.walkMinutesOrigin + option.walkMinutesDestination;
  for (const leg of option.legs) {
    if (modeKind(leg.modality) === "walk") minutes += legMinutes(leg);
  }
  return minutes;
}

function shift(iso: string | undefined, minutes: number): Date | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  return new Date(d.getTime() + minutes * 60000);
}

/** Leave-the-door time: first leg minus walking to the first hub. */
export function doorDeparture(option: PlanOption): Date | undefined {
  return shift(option.departure, -option.walkMinutesOrigin);
}

/** Arrive-at-the-door time: last leg plus walking from the last hub. */
export function doorArrival(option: PlanOption): Date | undefined {
  return shift(option.arrival, option.walkMinutesDestination);
}

export function transfersLabel(count: number): string {
  if (count <= 0) return "Direct";
  if (count === 1) return "1 overstap";
  return `${count} overstappen`;
}

export type Step = {
  kind: ModeKind;
  label: string;
  origin: string;
  destination: string;
  start?: Date;
  end?: Date;
  minutes: number;
  meters?: number;
  cancelled?: boolean;
  originTrack?: string;
  destinationTrack?: string;
  /** Minutes behind the timetable at either end; 0 when on time. */
  departDelay: number;
  arriveDelay: number;
  /** Timetable track, only when the vehicle uses another one. */
  originTrackWas?: string;
  destinationTrackWas?: string;
};

/**
 * Minutes a time runs behind the timetable; 0 when on time, early or unknown.
 * Early runs are left out, as in the NS app: you still have to be there.
 */
export function delayMinutes(expected?: string, scheduled?: string): number {
  if (!expected || !scheduled) return 0;
  const diff = Math.round((Date.parse(expected) - Date.parse(scheduled)) / 60000);
  return Number.isFinite(diff) && diff > 0 ? diff : 0;
}

function changedTrack(track?: string, scheduled?: string): string | undefined {
  return track && scheduled && track !== scheduled ? scheduled : undefined;
}

/** Door-to-door list of steps, including walks to/from nearby hubs. */
export function buildSteps(option: PlanOption, fromLabel: string, toLabel: string): Step[] {
  const steps: Step[] = [];

  if (option.walkMetersOrigin >= 50 && option.fromStation) {
    steps.push({
      kind: "walk",
      label: "Lopen",
      origin: fromLabel,
      destination: option.fromStation.name,
      start: doorDeparture(option),
      end: shift(option.departure, 0),
      minutes: option.walkMinutesOrigin,
      meters: option.walkMetersOrigin,
      departDelay: 0,
      arriveDelay: 0,
    });
  }

  for (const leg of option.legs) {
    const kind = modeKind(leg.modality);
    const minutes = legMinutes(leg);
    if (kind === "walk" && minutes === 0 && !leg.distanceMeters) continue;
    // A walk shifts with the vehicle it leads to; only vehicles run late.
    const vehicle = kind !== "walk";
    steps.push({
      kind,
      label: modalityNl(leg.modality),
      origin: leg.origin === "Start" ? fromLabel : leg.origin,
      destination: leg.destination === "End" ? toLabel : leg.destination,
      start: shift(leg.plannedDeparture, 0),
      end: shift(leg.plannedArrival, 0),
      minutes,
      meters: kind === "walk" ? walkLegMeters(leg) : undefined,
      cancelled: leg.cancelled,
      originTrack: leg.originTrack,
      destinationTrack: leg.destinationTrack,
      departDelay: vehicle ? delayMinutes(leg.plannedDeparture, leg.scheduledDeparture) : 0,
      arriveDelay: vehicle ? delayMinutes(leg.plannedArrival, leg.scheduledArrival) : 0,
      originTrackWas: vehicle ? changedTrack(leg.originTrack, leg.scheduledOriginTrack) : undefined,
      destinationTrackWas: vehicle
        ? changedTrack(leg.destinationTrack, leg.scheduledDestinationTrack)
        : undefined,
    });
  }

  if (option.walkMetersDestination >= 50 && option.toStation) {
    steps.push({
      kind: "walk",
      label: "Lopen",
      origin: option.toStation.name,
      destination: toLabel,
      start: shift(option.arrival, 0),
      end: doorArrival(option),
      minutes: option.walkMinutesDestination,
      meters: option.walkMetersDestination,
      departDelay: 0,
      arriveDelay: 0,
    });
  }

  return steps;
}

const COORDS_RE = /^\s*-?\d+(?:\.\d+)?\s*[,;\s]\s*-?\d+(?:\.\d+)?\s*$/;

export function isCoords(value: string): boolean {
  return COORDS_RE.test(value);
}

/** Friendly place label; raw coordinates come from "current location". */
export function placeLabel(label: string): string {
  return isCoords(label) ? "Huidige locatie" : label;
}

/** Walks shorter than this are noise in the itinerary (same-station hops). */
const TRIVIAL_WALK_METERS = 100;

export type ItineraryItem =
  | {
      type: "stop";
      name: string;
      /** What kind of stop this is, e.g. "Treinstation · spoor 2". */
      detail?: string;
      /** Timetable track, when the vehicle uses another one. */
      trackWas?: string;
      arrive?: Date;
      depart?: Date;
      /** Minutes behind the timetable for arrive / depart. */
      arriveDelay: number;
      departDelay: number;
      role: "start" | "via" | "end";
    }
  | { type: "move"; step: Step; toward?: string }
  | { type: "wait"; minutes: number; tight: boolean };

function isTrivialWalk(step: Step): boolean {
  if (step.kind !== "walk") return false;
  return step.meters !== undefined
    ? step.meters < TRIVIAL_WALK_METERS
    : step.minutes <= 1;
}

const STOP_LABELS: Partial<Record<ModeKind, string>> = {
  train: "Treinstation",
  bus: "Bushalte",
  tram: "Tramhalte",
  metro: "Metrostation",
  ferry: "Veerhaven",
};

const isVehicle = (step?: Step): step is Step =>
  step !== undefined && step.kind !== "walk";

/**
 * Bus stops and train stations often share a name ("Helmond, Station" is the
 * bus stop, "Helmond" the railway station), so say which one a stop is,
 * judged by the vehicle you board there, else the one you got off.
 */
function stopDetail(
  before?: Step,
  after?: Step,
): { detail?: string; trackWas?: string } {
  const [vehicle, track, trackWas] = isVehicle(after)
    ? [after, after.originTrack, after.originTrackWas]
    : isVehicle(before)
      ? [before, before.destinationTrack, before.destinationTrackWas]
      : [undefined, undefined, undefined];
  const label = vehicle ? STOP_LABELS[vehicle.kind] : undefined;
  if (!label) return {};
  if (!track) return { detail: label };
  return {
    detail: `${label} · ${vehicle!.kind === "train" ? "spoor" : "perron"} ${track}`,
    trackWas,
  };
}

/** Where a walk leads, when it takes you to a vehicle: "naar spoor 2". */
function walkToward(next?: Step): string | undefined {
  if (!isVehicle(next)) return undefined;
  if (next.kind === "train") {
    return next.originTrack ? `naar spoor ${next.originTrack}` : "naar de trein";
  }
  const label = STOP_LABELS[next.kind];
  if (!label) return undefined;
  const toward = `naar de ${label.toLowerCase()}`;
  return next.originTrack ? `${toward}, perron ${next.originTrack}` : toward;
}

const diffMinutes = (a?: Date, b?: Date) =>
  a && b ? Math.round((b.getTime() - a.getTime()) / 60000) : 0;

/**
 * Turn steps into stops (where you are) and moves (how you get to the next
 * stop), with explicit waiting time at transfers.
 */
export function buildItinerary(steps: Step[]): ItineraryItem[] {
  const kept = steps.some((s) => s.kind !== "walk")
    ? steps.filter((s) => !isTrivialWalk(s))
    : steps;
  if (kept.length === 0) return [];

  const items: ItineraryItem[] = [
    {
      type: "stop",
      name: kept[0].origin,
      ...stopDetail(undefined, kept[0]),
      depart: kept[0].start,
      arriveDelay: 0,
      departDelay: kept[0].departDelay,
      role: "start",
    },
  ];
  let rodeVehicle = false;

  kept.forEach((step, i) => {
    const next = kept[i + 1];
    items.push({
      type: "move",
      step,
      toward: step.kind === "walk" ? walkToward(next) : undefined,
    });
    if (step.kind !== "walk") rodeVehicle = true;

    if (!next) {
      items.push({
        type: "stop",
        name: step.destination,
        ...stopDetail(step, undefined),
        arrive: step.end,
        arriveDelay: step.arriveDelay,
        departDelay: 0,
        role: "end",
      });
      return;
    }

    const wait = Math.max(0, diffMinutes(step.end, next.start));
    items.push({
      type: "stop",
      name: step.destination,
      ...stopDetail(step, next),
      arrive: step.end,
      depart: next.start,
      arriveDelay: step.arriveDelay,
      departDelay: next.departDelay,
      role: "via",
    });
    // Only a transfer onto a vehicle, after riding one, can be missed.
    const tight = rodeVehicle && next.kind !== "walk" && wait <= 2;
    if (wait > 0 || tight) items.push({ type: "wait", minutes: wait, tight });
  });

  return items;
}
