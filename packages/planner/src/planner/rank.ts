import type { NsTrip } from "../ns/types.js";
import type { Station } from "../ns/types.js";

export type RankedOption = {
  id: string;
  summary: string;
  totalDoorToDoorMinutes: number;
  transitMinutes: number;
  walkMetersOrigin: number;
  walkMetersDestination: number;
  walkMinutesOrigin: number;
  walkMinutesDestination: number;
  transfers: number;
  status: string;
  departure?: string;
  arrival?: string;
  fromStation?: Station;
  toStation?: Station;
  notes: string[];
  legs: NsTrip["legs"];
  trip: NsTrip;
  source: "nearby_combo" | "transitous";
};

function tripSignature(trip: NsTrip): string {
  const first = trip.legs[0];
  const last = trip.legs[trip.legs.length - 1];
  const legKey = trip.legs
    .map((l) => `${l.origin}>${l.destination}|${l.modality ?? ""}`)
    .join(";");
  return [
    first?.plannedDeparture ?? "",
    last?.plannedArrival ?? "",
    trip.transfers,
    legKey,
  ].join("||");
}

export function dedupeOptions(options: RankedOption[]): RankedOption[] {
  const seen = new Set<string>();
  const out: RankedOption[] = [];
  for (const option of options) {
    const key = tripSignature(option.trip);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(option);
  }
  return out;
}

/** Walking that costs more than one transfer; below this a transfer counts. */
const WALK_WORTH_A_TRANSFER_METERS = 1000;

const WALK_MODALITY_RE = /^(walk|lopen|foot)/i;

function walkMetersOf(option: RankedOption): number {
  let meters = option.walkMetersOrigin + option.walkMetersDestination;
  for (const leg of option.legs) {
    if (WALK_MODALITY_RE.test(leg.modality ?? "")) {
      meters += leg.distanceMeters ?? 0;
    }
  }
  return meters;
}

/** Leave-the-door and arrive-at-the-door times in ms, including walks to hubs. */
function doorTimes(option: RankedOption): { leave: number; arrive: number } | null {
  const dep = option.departure ? Date.parse(option.departure) : NaN;
  const arr = option.arrival ? Date.parse(option.arrival) : NaN;
  if (Number.isNaN(dep) || Number.isNaN(arr)) return null;
  return {
    leave: dep - option.walkMinutesOrigin * 60_000,
    arrive: arr + option.walkMinutesDestination * 60_000,
  };
}

type Profile = {
  option: RankedOption;
  times: { leave: number; arrive: number } | null;
  walk: number;
  cancelled: boolean;
};

/**
 * `a` makes `b` pointless: leave no earlier, arrive no later, walk no more, and
 * no extra transfers unless it saves a long walk, and better on at least one.
 */
function dominates(a: Profile, b: Profile): boolean {
  if (a.cancelled || !a.times || !b.times) return false;
  if (a.times.leave < b.times.leave) return false;
  if (a.times.arrive > b.times.arrive) return false;
  if (a.walk > b.walk) return false;
  const savedWalk = b.walk - a.walk;
  const transfers = a.option.transfers;
  if (transfers > b.option.transfers && savedWalk < WALK_WORTH_A_TRANSFER_METERS) {
    return false;
  }
  return (
    a.times.leave > b.times.leave ||
    a.times.arrive < b.times.arrive ||
    savedWalk > 0 ||
    transfers < b.option.transfers
  );
}

/**
 * Drop options another option beats on every count, e.g. walking to the next
 * station for a slower stopping train when a later, faster trip exists.
 * Options with a cancelled leg never push others out, so a detour stays
 * available when the regular service is not running.
 */
export function dropDominated(options: RankedOption[]): RankedOption[] {
  const profiles: Profile[] = options.map((option) => ({
    option,
    times: doorTimes(option),
    walk: walkMetersOf(option),
    cancelled: option.legs.some((l) => l.cancelled),
  }));
  return profiles
    .filter((p) => !profiles.some((other) => other !== p && dominates(other, p)))
    .map((p) => p.option);
}

export function rankOptions(options: RankedOption[]): RankedOption[] {
  return [...options].sort((a, b) => {
    if (a.totalDoorToDoorMinutes !== b.totalDoorToDoorMinutes) {
      return a.totalDoorToDoorMinutes - b.totalDoorToDoorMinutes;
    }
    if (a.transfers !== b.transfers) return a.transfers - b.transfers;
    const walkA = a.walkMetersOrigin + a.walkMetersDestination;
    const walkB = b.walkMetersOrigin + b.walkMetersDestination;
    if (walkA !== walkB) return walkA - walkB;
    return a.summary.localeCompare(b.summary);
  });
}
