import type { PlanOption } from "./api";
import {
  doorArrival,
  doorDeparture,
  modeKind,
  longestWalkMeters,
  walkMetersTotal,
  type ModeKind,
} from "./format";

export type SortKey = "fastest" | "departure" | "arrival" | "transfers" | "walk";

export type FilterableMode = Exclude<ModeKind, "walk" | "other">;

export const FILTER_MODES: FilterableMode[] = ["train", "bus", "tram", "metro", "ferry"];

export type Filters = {
  /** Max total walking in meters; null = no limit. */
  maxWalk: number | null;
  /** Max transfers; null = any. */
  maxTransfers: number | null;
  /** Allowed transit modes. */
  modes: FilterableMode[];
  sort: SortKey;
};

export const DEFAULT_FILTERS: Filters = {
  // About 15 minutes on foot: hides "train + 40 min walk" options.
  maxWalk: 1200,
  maxTransfers: null,
  modes: [...FILTER_MODES],
  sort: "departure",
};

export const SORT_LABELS: Record<SortKey, string> = {
  departure: "Vertrektijd",
  fastest: "Snelst",
  arrival: "Aankomsttijd",
  transfers: "Minste overstappen",
  walk: "Minst lopen",
};

// Limit per stretch on foot, felt as time rather than meters (80 m per minute).
export const WALK_CHOICES: Array<{ value: number | null; label: string }> = [
  { value: 400, label: "± 5 min" },
  { value: 1200, label: "± 15 min" },
  { value: null, label: "Geen limiet" },
];

export const TRANSFER_CHOICES: Array<{ value: number | null; label: string }> = [
  { value: 0, label: "Direct" },
  { value: 1, label: "1" },
  { value: 2, label: "2" },
  { value: null, label: "Geen limiet" },
];

export function isDefaultFilters(filters: Filters): boolean {
  return activeFilterCount(filters) === 0;
}

export function optionModes(option: PlanOption): Set<ModeKind> {
  return new Set(option.legs.map((leg) => modeKind(leg.modality)));
}

function passes(option: PlanOption, filters: Filters): boolean {
  if (filters.maxWalk !== null && longestWalkMeters(option) > filters.maxWalk) {
    return false;
  }
  if (filters.maxTransfers !== null && option.transfers > filters.maxTransfers) {
    return false;
  }
  const allowed = new Set<ModeKind>(filters.modes);
  for (const mode of optionModes(option)) {
    if ((FILTER_MODES as ModeKind[]).includes(mode) && !allowed.has(mode)) {
      return false;
    }
  }
  return true;
}

const time = (d?: Date) => d?.getTime() ?? Number.POSITIVE_INFINITY;

const comparators: Record<SortKey, (a: PlanOption, b: PlanOption) => number> = {
  fastest: (a, b) => a.totalDoorToDoorMinutes - b.totalDoorToDoorMinutes,
  departure: (a, b) => time(doorDeparture(a)) - time(doorDeparture(b)),
  arrival: (a, b) => time(doorArrival(a)) - time(doorArrival(b)),
  transfers: (a, b) => a.transfers - b.transfers,
  walk: (a, b) => walkMetersTotal(a) - walkMetersTotal(b),
};

export function applyFilters(options: PlanOption[], filters: Filters): PlanOption[] {
  const primary = comparators[filters.sort];
  return options
    .filter((option) => passes(option, filters))
    .sort(
      (a, b) =>
        primary(a, b) ||
        comparators.fastest(a, b) ||
        comparators.departure(a, b),
    );
}

/** Filters the user changed; the defaults alone don't count. */
export function activeFilterCount(filters: Filters): number {
  let count = 0;
  if (filters.maxWalk !== DEFAULT_FILTERS.maxWalk) count += 1;
  if (filters.maxTransfers !== DEFAULT_FILTERS.maxTransfers) count += 1;
  if (filters.modes.length !== DEFAULT_FILTERS.modes.length) count += 1;
  return count;
}

/** True when every hidden option is hidden by the walking limit alone. */
export function hiddenOnlyByWalk(hidden: PlanOption[], filters: Filters): boolean {
  const withoutWalkLimit = { ...filters, maxWalk: null };
  return hidden.length > 0 && hidden.every((o) => passes(o, withoutWalkLimit));
}

export type Badge = "recommended" | "fastest" | "leastWalk" | "fewestTransfers";

export const BADGE_LABELS: Record<Badge, string> = {
  recommended: "Aanrader",
  fastest: "Snelst",
  leastWalk: "Minst lopen",
  fewestTransfers: "Minste overstappen",
};

export type SearchContext = {
  mode: "depart" | "arrive";
  at: number;
  /** Options from the user's own search, not added by "Eerdere/Latere reizen". */
  initialIds?: ReadonlySet<string>;
};

const MIN = 60000;

/**
 * Minutes between the trip and the time the user chose: how long before the
 * deadline you arrive, or how long after the chosen time you leave. Negative
 * when the trip misses that time.
 */
function waitMinutes(option: PlanOption, context: SearchContext): number {
  return context.mode === "arrive"
    ? (context.at - (doorArrival(option)?.getTime() ?? context.at)) / MIN
    : ((doorDeparture(option)?.getTime() ?? context.at) - context.at) / MIN;
}

/**
 * Overall "best" trip in minutes-equivalent (lower is better): travel time,
 * plus half the time you wait for it, plus a penalty per transfer and for
 * walking beyond a comfortable distance.
 */
function recommendScore(option: PlanOption, context: SearchContext): number {
  const wait = waitMinutes(option, context);
  // Walking in minutes beyond a comfortable amount; a long single stretch
  // weighs extra on top of the total.
  const extraWalk =
    Math.max(0, walkMetersTotal(option) - 600) / 80 +
    Math.max(0, longestWalkMeters(option) - 400) / 80;
  return (
    option.totalDoorToDoorMinutes +
    0.5 * Math.max(0, wait) +
    4 * option.transfers +
    0.5 * extraWalk
  );
}

/** Highlight the stand-out options in the visible list. */
export function computeBadges(
  options: PlanOption[],
  context?: SearchContext,
): Map<string, Badge[]> {
  const badges = new Map<string, Badge[]>();
  if (options.length < 2) return badges;

  let recommended: PlanOption | undefined;
  if (context) {
    // Only trips that fit the time the user chose, from their own search:
    // loading earlier or later trips must not move the recommendation.
    // Never one that may not work: a cancelled leg or a change you can't make.
    const fits = options.filter(
      (o) =>
        waitMinutes(o, context) >= -1 &&
        (!context.initialIds || context.initialIds.has(o.id)) &&
        !o.legs.some((l) => l.cancelled || l.missedConnection),
    );
    const candidates = fits.length > 0 ? fits : options;
    recommended = candidates.reduce((a, b) =>
      recommendScore(b, context) < recommendScore(a, context) ? b : a,
    );
    badges.set(recommended.id, ["recommended"]);
  }

  const add = (id: string, badge: Badge) =>
    badges.set(id, [...(badges.get(id) ?? []), badge]);

  // On a tie, the recommended trip, else the one closest to the chosen time.
  const closeness = (o: PlanOption) =>
    o === recommended ? -1 : context ? Math.abs(waitMinutes(o, context)) : 0;

  const pick = (score: (o: PlanOption) => number, badge: Badge) => {
    const best = Math.min(...options.map(score));
    const winners = options.filter((o) => score(o) === best);
    // A badge is only informative when not everyone shares it.
    if (winners.length === options.length) return;
    const winner = winners.reduce((a, b) => (closeness(b) < closeness(a) ? b : a));
    add(winner.id, badge);
  };

  pick((o) => o.totalDoorToDoorMinutes, "fastest");
  pick((o) => o.transfers, "fewestTransfers");
  pick(walkMetersTotal, "leastWalk");
  return badges;
}

/**
 * Walking radius for finding nearby stops. Fixed, so changing the walk filter
 * never needs a new search; the filter itself is applied client-side.
 */
export const SEARCH_RADIUS_METERS = 2500;
