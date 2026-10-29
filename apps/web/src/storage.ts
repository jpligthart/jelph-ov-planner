import { DEFAULT_FILTERS, FILTER_MODES, WALK_CHOICES, type Filters } from "./filters";

const FILTERS_KEY = "jelph.filters.v4";
const RECENT_KEY = "jelph.recent.v1";
const MAX_RECENT = 5;

export type RecentTrip = { from: string; to: string };

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or disabled; preferences are best-effort.
  }
}

export function loadFilters(): Filters {
  const saved = read<Partial<Filters>>(FILTERS_KEY);
  if (!saved) return DEFAULT_FILTERS;
  const modes = Array.isArray(saved.modes)
    ? FILTER_MODES.filter((m) => saved.modes?.includes(m))
    : DEFAULT_FILTERS.modes;
  // A walk limit that is no longer offered (e.g. the old 10 min) falls back
  // to the default, so one of the choices is always selected.
  const maxWalk = WALK_CHOICES.some((c) => c.value === saved.maxWalk)
    ? saved.maxWalk
    : DEFAULT_FILTERS.maxWalk;
  return {
    ...DEFAULT_FILTERS,
    ...saved,
    maxWalk: maxWalk ?? null,
    modes: modes.length > 0 ? modes : DEFAULT_FILTERS.modes,
  };
}

export function saveFilters(filters: Filters) {
  write(FILTERS_KEY, filters);
}

export function loadRecent(): RecentTrip[] {
  const list = read<RecentTrip[]>(RECENT_KEY);
  return Array.isArray(list) ? list.filter((t) => t?.from && t?.to) : [];
}

export function pushRecent(trip: RecentTrip): RecentTrip[] {
  const key = (t: RecentTrip) => `${t.from}\u0000${t.to}`.toLowerCase();
  const next = [trip, ...loadRecent().filter((t) => key(t) !== key(trip))].slice(
    0,
    MAX_RECENT,
  );
  write(RECENT_KEY, next);
  return next;
}

/** Unique place names from recent trips, newest first. */
export function recentPlaces(trips: RecentTrip[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of trips) {
    for (const name of [t.from, t.to]) {
      const k = name.toLowerCase();
      if (!seen.has(k)) {
        seen.add(k);
        out.push(name);
      }
    }
  }
  return out;
}
