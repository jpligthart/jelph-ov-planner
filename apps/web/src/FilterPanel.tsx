import type { CSSProperties } from "react";
import {
  DEFAULT_FILTERS,
  FILTER_MODES,
  WALK_STEPS,
  type Filters,
} from "./filters";
import { MODE_LABELS, formatDistance } from "./format";
import { ModeIcon } from "./icons";

type Props = {
  filters: Filters;
  onChange: (filters: Filters) => void;
  /** Options per mode in the current result, to grey out absent ones. */
  availableModes?: Set<string>;
};

const TRANSFER_CHOICES: Array<{ value: number | null; label: string }> = [
  { value: null, label: "Alle" },
  { value: 0, label: "Direct" },
  { value: 1, label: "Max 1" },
  { value: 2, label: "Max 2" },
];

// Slider index WALK_STEPS.length means "no limit".
function walkToIndex(maxWalk: number | null): number {
  if (maxWalk === null) return WALK_STEPS.length;
  const i = WALK_STEPS.findIndex((s) => s >= maxWalk);
  return i === -1 ? WALK_STEPS.length : i;
}

export function FilterPanel({ filters, onChange, availableModes }: Props) {
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });
  const walkIndex = walkToIndex(filters.maxWalk);

  function toggleMode(mode: (typeof FILTER_MODES)[number]) {
    const on = filters.modes.includes(mode);
    const modes = on
      ? filters.modes.filter((m) => m !== mode)
      : FILTER_MODES.filter((m) => m === mode || filters.modes.includes(m));
    // Never allow an empty selection; that would hide everything.
    if (modes.length > 0) set({ modes });
  }

  return (
    <div className="filters">
      <section className="filter-group">
        <div className="filter-head">
          <h3 id="walk-label">Maximaal lopen</h3>
          <output className="filter-value">
            {filters.maxWalk === null ? "Geen limiet" : formatDistance(filters.maxWalk)}
          </output>
        </div>
        <input
          type="range"
          className="range"
          min={0}
          max={WALK_STEPS.length}
          step={1}
          value={walkIndex}
          aria-labelledby="walk-label"
          aria-valuetext={
            filters.maxWalk === null ? "Geen limiet" : formatDistance(filters.maxWalk)
          }
          style={{ "--fill": `${(walkIndex / WALK_STEPS.length) * 100}%` } as CSSProperties}
          onChange={(e) => {
            const i = Number(e.target.value);
            set({ maxWalk: i >= WALK_STEPS.length ? null : WALK_STEPS[i] });
          }}
        />
        <div className="range-scale" aria-hidden="true">
          <span>{formatDistance(WALK_STEPS[0])}</span>
          <span>{formatDistance(WALK_STEPS[3])}</span>
          <span>∞</span>
        </div>
        <p className="filter-hint">Totaal, inclusief lopen bij overstappen.</p>
      </section>

      <section className="filter-group">
        <h3>Overstappen</h3>
        <div className="segmented segmented--4" role="radiogroup" aria-label="Overstappen">
          {TRANSFER_CHOICES.map((choice) => (
            <button
              key={choice.label}
              type="button"
              role="radio"
              aria-checked={filters.maxTransfers === choice.value}
              className={filters.maxTransfers === choice.value ? "is-on" : undefined}
              onClick={() => set({ maxTransfers: choice.value })}
            >
              {choice.label}
            </button>
          ))}
        </div>
      </section>

      <section className="filter-group">
        <h3>Vervoer</h3>
        <div className="mode-grid">
          {FILTER_MODES.map((mode) => {
            const on = filters.modes.includes(mode);
            const absent = availableModes && !availableModes.has(mode);
            return (
              <button
                key={mode}
                type="button"
                className={`mode-toggle mode-${mode}${on ? " is-on" : ""}${absent ? " is-absent" : ""}`}
                aria-pressed={on}
                onClick={() => toggleMode(mode)}
                title={absent ? "Komt niet voor in deze resultaten" : undefined}
              >
                <ModeIcon kind={mode} size={18} />
                <span>{MODE_LABELS[mode]}</span>
              </button>
            );
          })}
        </div>
      </section>

      <button
        type="button"
        className="link-button"
        onClick={() => onChange({ ...DEFAULT_FILTERS, sort: filters.sort })}
      >
        Filters wissen
      </button>
    </div>
  );
}
