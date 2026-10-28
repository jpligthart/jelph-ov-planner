import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { planTrip, type PlanOption, type PlanResponse } from "./api";
import { FilterPanel } from "./FilterPanel";
import {
  DEFAULT_FILTERS,
  FILTER_MODES,
  SORT_LABELS,
  isDefaultFilters,
  activeFilterCount,
  applyFilters,
  computeBadges,
  optionModes,
  SEARCH_RADIUS_METERS,
  hiddenOnlyByWalk,
  type Filters,
  type SortKey,
} from "./filters";
import {
  doorArrival,
  doorDeparture,
  friendlyError,
  isCoords,
  placeLabel,
} from "./format";
import {
  ArrowRightIcon,
  ClockIcon,
  CloseIcon,
  FilterIcon,
  HistoryIcon,
  SearchIcon,
  SwapIcon,
} from "./icons";
import { OptionCard } from "./OptionCard";
import { PlaceField } from "./PlaceField";
import {
  loadFilters,
  loadRecent,
  pushRecent,
  recentPlaces,
  saveFilters,
  type RecentTrip,
} from "./storage";
import { TimePicker } from "./TimePicker";
import {
  choiceDate,
  defaultChoice,
  describeChoice,
  type TimeChoice,
} from "./time";

const MOBILE_QUERY = "(max-width: 959px)";

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

type Search = {
  from: string;
  to: string;
  /** The time the user set; never changed by loading more trips. */
  choice: TimeChoice;
  /** Resolved search time; "now" is frozen at the moment of searching. */
  at: number;
  /** Earliest departure shown (departure searches); lowered by "Eerdere reizen". */
  minDepart: number;
  /** Latest arrival shown (arrival searches); raised by "Latere reizen". */
  maxArrive: number;
  /** Options of the search itself, before any "Eerdere/Latere reizen". */
  initialIds: ReadonlySet<string>;
};

/** Same trip found by different searches. */
function tripKey(o: PlanOption): string {
  return [o.departure, o.arrival, o.legs.map((l) => l.modality).join(",")].join("|");
}

function edgeTime(
  options: PlanOption[],
  pick: (o: PlanOption) => Date | undefined,
  agg: (...n: number[]) => number,
): number | undefined {
  const times = options
    .map((o) => pick(o)?.getTime())
    .filter((t): t is number => t !== undefined && Number.isFinite(t));
  return times.length ? agg(...times) : undefined;
}

export function App() {
  const isMobile = useMediaQuery(MOBILE_QUERY);

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [time, setTime] = useState<TimeChoice>(() => defaultChoice("depart"));
  const [timeTouched, setTimeTouched] = useState(false);
  const [filters, setFilters] = useState<Filters>(loadFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [recent, setRecent] = useState<RecentTrip[]>(loadRecent);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PlanResponse | null>(null);
  const [searched, setSearched] = useState<Search | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [loadingMore, setLoadingMore] = useState<-1 | 1 | null>(null);
  const requestId = useRef(0);

  useEffect(() => saveFilters(filters), [filters]);

  useEffect(() => {
    if (!filtersOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFiltersOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [filtersOpen]);

  const markTouched = useCallback(() => setTimeTouched(true), []);

  // Departures before the requested time can't be caught; drop them.
  // Departure searches: nothing that leaves before the chosen time.
  // Arrival searches: nothing that arrives after it. "Eerdere/Latere reizen"
  // widen these bounds on purpose.
  const pool = useMemo(() => {
    if (!result || !searched) return result?.options ?? [];
    const slack = 60000;
    if (searched.choice.mode === "arrive") {
      return result.options.filter(
        (o) => (doorArrival(o)?.getTime() ?? 0) <= searched.maxArrive + slack,
      );
    }
    return result.options.filter(
      (o) => (doorDeparture(o)?.getTime() ?? Infinity) >= searched.minDepart - slack,
    );
  }, [result, searched]);

  const visible = useMemo(() => applyFilters(pool, filters), [pool, filters]);
  const badges = useMemo(
    () =>
      computeBadges(
        visible,
        searched
          ? { mode: searched.choice.mode, at: searched.at, initialIds: searched.initialIds }
          : undefined,
      ),
    [visible, searched],
  );
  const availableModes = useMemo(() => {
    const set = new Set<string>();
    for (const o of pool) for (const m of optionModes(o)) set.add(m);
    return result ? set : undefined;
  }, [result, pool]);

  const filterCount = activeFilterCount(filters);
  const hiddenCount = pool.length - visible.length;
  const hiddenWalkOnly = useMemo(() => {
    const shown = new Set(visible);
    return hiddenOnlyByWalk(pool.filter((o) => !shown.has(o)), filters);
  }, [pool, visible, filters]);

  function showHidden() {
    setFilters(
      hiddenWalkOnly
        ? { ...filters, maxWalk: null }
        : { ...filters, maxWalk: null, maxTransfers: null, modes: [...FILTER_MODES] },
    );
  }

  async function runSearch(next: { from: string; to: string; choice: TimeChoice }) {
    const f = next.from.trim();
    const t = next.to.trim();
    if (!f || !t) return;

    const id = ++requestId.current;
    const at = choiceDate(next.choice);
    setLoading(true);
    setError(null);
    try {
      const data = await planTrip({
        from: f,
        to: t,
        dateTime: at.toISOString(),
        searchForArrival: next.choice.mode === "arrive",
        maxWalkMeters: SEARCH_RADIUS_METERS,
        maxNearby: 3,
        topK: 20,
      });
      if (id !== requestId.current) return;
      setResult(data);
      setSearched({
        from: f,
        to: t,
        choice: next.choice,
        at: at.getTime(),
        minDepart: at.getTime(),
        maxArrive: at.getTime(),
        initialIds: new Set(data.options.map((o) => o.id)),
      });
      if (!isCoords(f) && !isCoords(t)) setRecent(pushRecent({ from: f, to: t }));
      if (isMobile) setCollapsed(true);
    } catch (err) {
      if (id !== requestId.current) return;
      setResult(null);
      setSearched(null);
      setError(friendlyError(err instanceof Error ? err.message : String(err)));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void runSearch({ from, to, choice: time });
  }

  function pickRecent(trip: RecentTrip) {
    setFrom(trip.from);
    setTo(trip.to);
    void runSearch({ from: trip.from, to: trip.to, choice: time });
  }

  /** Earlier / later: move the search window past the current results. */
  /**
   * "Eerdere/Latere reizen": add trips just before or after the list, like
   * paging. The time the user set stays as it is.
   */
  async function loadMore(direction: -1 | 1) {
    if (!result || !searched || loadingMore) return;
    const id = requestId.current;
    const base = pool.length ? pool : result.options;
    // Later: depart just after the last departure. Earlier: arrive just
    // before the first arrival.
    const edge =
      direction > 0
        ? edgeTime(base, doorDeparture, Math.max)
        : edgeTime(base, doorArrival, Math.min);
    const when = new Date((edge ?? searched.at) + direction * 60000);

    setLoadingMore(direction);
    setError(null);
    try {
      const data = await planTrip({
        from: searched.from,
        to: searched.to,
        dateTime: when.toISOString(),
        searchForArrival: direction < 0,
        maxWalkMeters: SEARCH_RADIUS_METERS,
        maxNearby: 3,
        topK: 20,
      });
      if (id !== requestId.current) return; // a new search took over
      const known = new Set(result.options.map(tripKey));
      const added = data.options.filter((o) => !known.has(tripKey(o)));
      setResult({ ...result, options: [...result.options, ...added] });
      setSearched({
        ...searched,
        minDepart:
          direction < 0
            ? Math.min(searched.minDepart, edgeTime(added, doorDeparture, Math.min) ?? Infinity)
            : searched.minDepart,
        maxArrive:
          direction > 0
            ? Math.max(searched.maxArrive, edgeTime(added, doorArrival, Math.max) ?? -Infinity)
            : searched.maxArrive,
      });
    } catch (err) {
      if (id !== requestId.current) return;
      setError(friendlyError(err instanceof Error ? err.message : String(err)));
    } finally {
      if (id === requestId.current) setLoadingMore(null);
    }
  }

  const fromTitle = result ? placeLabel(result.from.label) : "";
  const toTitle = result ? placeLabel(result.to.label) : "";
  const places = recentPlaces(recent);

  const showForm = !(isMobile && collapsed && result);

  return (
    <div className="app">
      <header className="topbar">
        <a className="logo" href="/" aria-label="Jelph OV Planner, home">
          <span className="logo-mark" aria-hidden="true">
            <span />
          </span>
          <span className="logo-text">
            Jelph <strong>OV</strong>
          </span>
        </a>
        <span className="topbar-tag">Deur tot deur, slim gepland</span>
      </header>

      <main className="layout">
        <aside className="sidebar">
          {showForm ? (
            <form className="card search" onSubmit={onSubmit}>
              <div className="route">
                <PlaceField
                  label="Van"
                  marker="origin"
                  value={from}
                  onChange={setFrom}
                  placeholder="Adres, halte of station"
                  recent={places}
                  allowLocate
                />
                <PlaceField
                  label="Naar"
                  marker="destination"
                  value={to}
                  onChange={setTo}
                  placeholder="Waar wil je heen?"
                  recent={places}
                />
                <button
                  type="button"
                  className="swap"
                  onClick={() => {
                    setFrom(to);
                    setTo(from);
                  }}
                  aria-label="Van en naar omdraaien"
                  title="Omdraaien"
                >
                  <SwapIcon size={18} />
                </button>
              </div>

              <TimePicker
                value={time}
                onChange={setTime}
                touched={timeTouched}
                onTouched={markTouched}
              />

              <button type="submit" className="primary" disabled={loading}>
                {loading ? (
                  <>
                    <span className="btn-spinner" aria-hidden="true" /> Zoeken…
                  </>
                ) : (
                  <>
                    <SearchIcon size={18} /> Plan reis
                  </>
                )}
              </button>
            </form>
          ) : (
            <button
              type="button"
              className="card summary"
              onClick={() => setCollapsed(false)}
              aria-label="Zoekopdracht wijzigen"
            >
              <span className="summary-route">
                <span className="summary-place">{fromTitle}</span>
                <ArrowRightIcon size={16} />
                <span className="summary-place">{toTitle}</span>
              </span>
              <span className="summary-meta">
                <ClockIcon size={14} />
                {searched ? describeChoice(searched.choice) : ""}
              </span>
              <span className="summary-edit">Wijzig</span>
            </button>
          )}

          <div className={`filter-host${filtersOpen ? " is-open" : ""}`}>
            <div
              className="sheet-backdrop"
              onClick={() => setFiltersOpen(false)}
              aria-hidden="true"
            />
            <div
              className="card sheet"
              role={isMobile ? "dialog" : undefined}
              aria-modal={isMobile ? true : undefined}
              aria-labelledby="filters-title"
            >
              <div className="sheet-head">
                <h2 id="filters-title">
                  Filters
                  {filterCount > 0 ? <span className="count">{filterCount}</span> : null}
                </h2>
                {!isDefaultFilters(filters) ? (
                  <button
                    type="button"
                    className="link-button sheet-reset"
                    onClick={() => setFilters({ ...DEFAULT_FILTERS, sort: filters.sort })}
                  >
                    Herstellen
                  </button>
                ) : null}
                <button
                  type="button"
                  className="icon-button sheet-close"
                  onClick={() => setFiltersOpen(false)}
                  aria-label="Filters sluiten"
                >
                  <CloseIcon size={18} />
                </button>
              </div>
              <FilterPanel
                filters={filters}
                onChange={setFilters}
                availableModes={availableModes}
              />
              <button
                type="button"
                className="primary sheet-done"
                onClick={() => setFiltersOpen(false)}
              >
                {result
                  ? `Toon ${visible.length} ${visible.length === 1 ? "reis" : "reizen"}`
                  : "Klaar"}
              </button>
            </div>
          </div>
        </aside>

        <section
          className={`results${showForm ? "" : " is-collapsed"}`}
          aria-live="polite"
          aria-busy={loading}
        >
          {error ? (
            <div className="notice notice--error" role="alert">
              {error}
            </div>
          ) : null}

          {result || loading ? (
            <>
              <div className="results-top">
                <div className="results-head">
                  {result ? (
                    <h1 className="results-title" title={`${fromTitle} → ${toTitle}`}>
                      <span>{fromTitle}</span>
                      <ArrowRightIcon size={18} />
                      <span>{toTitle}</span>
                    </h1>
                  ) : (
                    <h1 className="results-title">Reizen zoeken…</h1>
                  )}
                  {searched ? (
                    <p className="results-sub">{describeChoice(searched.choice)}</p>
                  ) : null}
                </div>

                <div className="toolbar">
                  <button
                    type="button"
                    className={`chip chip--filter${filterCount > 0 ? " is-on" : ""}`}
                    onClick={() => setFiltersOpen(true)}
                  >
                    <FilterIcon size={16} />
                    Filters
                    {filterCount > 0 ? <span className="count">{filterCount}</span> : null}
                  </button>
                  <label className="sort">
                    <span className="sr-only">Sorteren</span>
                    <select
                      value={filters.sort}
                      onChange={(e) =>
                        setFilters({ ...filters, sort: e.target.value as SortKey })
                      }
                    >
                      {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
                        <option key={key} value={key}>
                          {SORT_LABELS[key]}
                        </option>
                      ))}
                    </select>
                  </label>
                  {result ? (
                    <span className="result-count">
                      {hiddenCount > 0
                        ? `${visible.length} van ${pool.length}`
                        : `${visible.length} ${visible.length === 1 ? "reis" : "reizen"}`}
                    </span>
                  ) : null}
                </div>
              </div>

              {loading ? (
                <ol className="option-list" aria-hidden="true">
                  {[0, 1, 2].map((i) => (
                    <li key={i} className="option skeleton">
                      <span className="sk sk-line sk-wide" />
                      <span className="sk sk-bar" />
                      <span className="sk sk-line" />
                    </li>
                  ))}
                </ol>
              ) : result && pool.length === 0 ? (
                <div className="empty">
                  <h2>Geen reis gevonden</h2>
                  <p>Probeer een ander tijdstip of controleer de adressen.</p>
                </div>
              ) : result && visible.length === 0 ? (
                <div className="empty">
                  <h2>Geen reizen met deze filters</h2>
                  <p>
                    {hiddenCount} {hiddenCount === 1 ? "reis valt" : "reizen vallen"} buiten
                    je filters.
                  </p>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() =>
                      setFilters({
                        ...DEFAULT_FILTERS,
                        maxWalk: null,
                        sort: filters.sort,
                      })
                    }
                  >
                    Alle filters uitzetten
                  </button>
                </div>
              ) : result ? (
                <>
                  <button
                    type="button"
                    className="shift-button"
                    onClick={() => void loadMore(-1)}
                    disabled={loadingMore !== null}
                  >
                    {loadingMore === -1 ? "Laden…" : "Eerdere reizen"}
                  </button>
                  <ol className="option-list">
                    {visible.map((option) => (
                      <OptionCard
                        key={option.id}
                        option={option}
                        fromLabel={fromTitle}
                        toLabel={toTitle}
                        badges={badges.get(option.id) ?? []}
                      />
                    ))}
                  </ol>
                  {hiddenCount > 0 ? (
                    <p className="hidden-note">
                      {hiddenWalkOnly
                        ? hiddenCount === 1
                          ? "1 reis met een langer stuk lopen is verborgen."
                          : `${hiddenCount} reizen met een langer stuk lopen zijn verborgen.`
                        : `${hiddenCount} ${hiddenCount === 1 ? "reis is" : "reizen zijn"} verborgen door je filters.`}{" "}
                      <button type="button" className="link-button" onClick={showHidden}>
                        Toch tonen
                      </button>
                    </p>
                  ) : null}
                  <button
                    type="button"
                    className="shift-button"
                    onClick={() => void loadMore(1)}
                    disabled={loadingMore !== null}
                  >
                    {loadingMore === 1 ? "Laden…" : "Latere reizen"}
                  </button>
                </>
              ) : null}
            </>
          ) : (
            <div className="welcome">
              <h1>Waar wil je heen?</h1>
              <p>
                Van deur tot deur — met slimme alternatieven als iets verder lopen
                sneller is.
              </p>
              {recent.length > 0 ? (
                <div className="recent">
                  <h2>Recente reizen</h2>
                  <ul>
                    {recent.map((trip) => (
                      <li key={`${trip.from}→${trip.to}`}>
                        <button type="button" onClick={() => pickRecent(trip)}>
                          <HistoryIcon size={16} />
                          <span className="recent-route">
                            <span>{trip.from}</span>
                            <ArrowRightIcon size={14} />
                            <span>{trip.to}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          )}
        </section>
      </main>

      <footer className="foot">
        Reisdata o.a. via{" "}
        <a href="https://transitous.org/sources/" target="_blank" rel="noreferrer">
          Transitous
        </a>
        {" · "}
        ©{" "}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
          OpenStreetMap contributors
        </a>
        {" "}
        (ODbL)
        {" · "}
        <a href="https://ko-fi.com/jelphme" target="_blank" rel="noreferrer">
          Ko-fi
        </a>
      </footer>
    </div>
  );
}
