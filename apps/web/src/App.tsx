import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { planTrip, type PlanResponse } from "./api";
import { FilterPanel } from "./FilterPanel";
import {
  DEFAULT_FILTERS,
  FILTER_MODES,
  SORT_LABELS,
  activeFilterCount,
  applyFilters,
  computeBadges,
  optionModes,
  searchRadius,
  type Filters,
  type SortKey,
} from "./filters";
import {
  MODE_LABELS,
  doorArrival,
  doorDeparture,
  formatDistance,
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
  setChoiceDate,
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
  choice: TimeChoice;
  radius: number;
  /** Resolved search time; "now" is frozen at the moment of searching. */
  at: number;
};

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
  const pool = useMemo(() => {
    if (!result) return [];
    if (!searched || searched.choice.mode === "arrive") return result.options;
    const earliest = searched.at - 60000;
    return result.options.filter(
      (o) => (doorDeparture(o)?.getTime() ?? earliest) >= earliest,
    );
  }, [result, searched]);

  const visible = useMemo(() => applyFilters(pool, filters), [pool, filters]);
  const badges = useMemo(
    () =>
      computeBadges(
        visible,
        searched ? { mode: searched.choice.mode, at: searched.at } : undefined,
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
  const wantedRadius = searchRadius(filters.maxWalk);
  const radiusTooSmall = searched !== null && wantedRadius > searched.radius;

  async function runSearch(next: { from: string; to: string; choice: TimeChoice }) {
    const f = next.from.trim();
    const t = next.to.trim();
    if (!f || !t) return;

    const id = ++requestId.current;
    const radius = searchRadius(filters.maxWalk);
    const at = choiceDate(next.choice);
    setLoading(true);
    setError(null);
    try {
      const data = await planTrip({
        from: f,
        to: t,
        dateTime: at.toISOString(),
        searchForArrival: next.choice.mode === "arrive",
        maxWalkMeters: radius,
        maxNearby: 3,
        topK: 20,
      });
      if (id !== requestId.current) return;
      setResult(data);
      setSearched({ from: f, to: t, choice: next.choice, radius, at: at.getTime() });
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
  function shiftSearch(direction: -1 | 1) {
    if (!result || !searched) return;
    const arrive = searched.choice.mode === "arrive";
    const times = result.options
      .map((o) => (arrive ? doorArrival(o) : doorDeparture(o))?.getTime())
      .filter((t): t is number => t !== undefined && Number.isFinite(t));
    const base = choiceDate(searched.choice).getTime();
    const edge = times.length
      ? direction > 0
        ? Math.max(...times)
        : Math.min(...times)
      : base;
    const offsetMin =
      direction > 0 ? (arrive ? 60 : 1) : arrive ? -1 : -60;
    const choice = setChoiceDate(searched.choice, new Date(edge + offsetMin * 60000));
    setTime(choice);
    setTimeTouched(true);
    void runSearch({ from: searched.from, to: searched.to, choice });
  }

  const fromTitle = result ? placeLabel(result.from.label) : "";
  const toTitle = result ? placeLabel(result.to.label) : "";
  const places = recentPlaces(recent);

  const filterPills: Array<{ key: string; label: string; clear: Partial<Filters> }> = [];
  if (filters.maxWalk !== null) {
    filterPills.push({
      key: "walk",
      label: `Max ${formatDistance(filters.maxWalk)} lopen`,
      clear: { maxWalk: null },
    });
  }
  if (filters.maxTransfers !== null) {
    filterPills.push({
      key: "transfers",
      label:
        filters.maxTransfers === 0
          ? "Alleen direct"
          : `Max ${filters.maxTransfers} overstap${filters.maxTransfers > 1 ? "pen" : ""}`,
      clear: { maxTransfers: null },
    });
  }
  if (filters.modes.length !== FILTER_MODES.length) {
    const off = FILTER_MODES.filter((m) => !filters.modes.includes(m));
    filterPills.push({
      key: "modes",
      label: `Zonder ${off.map((m) => MODE_LABELS[m].toLowerCase()).join(", ")}`,
      clear: { modes: [...FILTER_MODES] },
    });
  }

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
              <div className="results-head">
                {result ? (
                  <h1 className="results-title">
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

              {filterPills.length > 0 ? (
                <div className="pills">
                  {filterPills.map((pill) => (
                    <button
                      key={pill.key}
                      type="button"
                      className="pill"
                      onClick={() => setFilters({ ...filters, ...pill.clear })}
                      aria-label={`Filter verwijderen: ${pill.label}`}
                    >
                      {pill.label}
                      <CloseIcon size={14} />
                    </button>
                  ))}
                </div>
              ) : null}

              {radiusTooSmall && !loading ? (
                <div className="notice">
                  Je loopfilter is ruimer dan de laatste zoekopdracht.
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => void runSearch(searched)}
                  >
                    Opnieuw zoeken
                  </button>
                </div>
              ) : null}

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
                    onClick={() => shiftSearch(-1)}
                  >
                    Eerdere reizen
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
                  <button
                    type="button"
                    className="shift-button"
                    onClick={() => shiftSearch(1)}
                  >
                    Latere reizen
                  </button>
                  {hiddenCount > 0 ? (
                    <p className="hidden-note">
                      {hiddenCount} {hiddenCount === 1 ? "reis" : "reizen"} verborgen door
                      filters.
                    </p>
                  ) : null}
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
      </footer>
    </div>
  );
}
