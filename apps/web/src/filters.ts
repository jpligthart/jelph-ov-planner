import type { PlanOption } from "./api";
import {
  doorArrival,
  doorDeparture,
  modeKind,
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
  // Hides "train + 40 minutes on foot" options; easy to widen in the panel.
  maxWalk: 1500,
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

export const WALK_STEPS = [300, 500, 750, 1000, 1500, 2000, 2500];

export function optionModes(option: PlanOption): Set<ModeKind> {
  return new Set(option.legs.map((leg) => modeKind(leg.modality)));
}

function passes(option: PlanOption, filters: Filters): boolean {
  if (filters.maxWalk !== null && walkMetersTotal(option) > filters.maxWalk) {
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

export function activeFilterCount(filters: Filters): number {
  let count = 0;
  if (filters.maxWalk !== null) count += 1;
  if (filters.maxTransfers !== null) count += 1;
  if (filters.modes.length !== FILTER_MODES.length) count += 1;
  return count;
}

export type Badge = "recommended" | "fastest" | "leastWalk" | "fewestTransfers";

export const BADGE_LABELS: Record<Badge, string> = {
  recommended: "Aanrader",
  fastest: "Snelst",
  leastWalk: "Minst lopen",
  fewestTransfers: "Minste overstappen",
};

export type SearchContext = { mode: "depart" | "arrive"; at: number };

/**
 * Overall "best" trip in minutes-equivalent (lower is better): travel time,
 * plus half the time you wait for it, plus a penalty per transfer and for
 * walking beyond a comfortable distance.
 */
function recommendScore(option: PlanOption, context: SearchContext): number {
  const MIN = 60000;
  const wait =
    context.mode === "arrive"
      ? (context.at - (doorArrival(option)?.getTime() ?? context.at)) / MIN
      : ((doorDeparture(option)?.getTime() ?? context.at) - context.at) / MIN;
  const extraWalk = Math.max(0, walkMetersTotal(option) - 600) / 80;
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

  if (context) {
    const best = options.reduce((a, b) =>
      recommendScore(b, context) < recommendScore(a, context) ? b : a,
    );
    badges.set(best.id, ["recommended"]);
  }

  const add = (id: string, badge: Badge) =>
    badges.set(id, [...(badges.get(id) ?? []), badge]);

  const pick = (score: (o: PlanOption) => number, badge: Badge) => {
    const best = Math.min(...options.map(score));
    const winners = options.filter((o) => score(o) === best);
    // A badge is only informative when not everyone shares it.
    if (winners.length < options.length) add(winners[0].id, badge);
  };

  pick((o) => o.totalDoorToDoorMinutes, "fastest");
  pick((o) => o.transfers, "fewestTransfers");
  pick(walkMetersTotal, "leastWalk");
  return badges;
}

/** Walking radius to request from the API for a given filter value. */
export function searchRadius(maxWalk: number | null): number {
  if (maxWalk === null) return 2500;
  return Math.min(2500, Math.max(1200, maxWalk));
}
