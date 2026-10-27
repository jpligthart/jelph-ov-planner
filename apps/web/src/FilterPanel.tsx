import {
  FILTER_MODES,
  TRANSFER_CHOICES,
  WALK_CHOICES,
  type Filters,
} from "./filters";
import { MODE_LABELS } from "./format";
import { ModeIcon } from "./icons";

type Props = {
  filters: Filters;
  onChange: (filters: Filters) => void;
  /** Modes in the current result; others are hidden unless switched off. */
  availableModes?: Set<string>;
};

function Choices<T extends number | null>({
  label,
  choices,
  value,
  onSelect,
}: {
  label: string;
  choices: Array<{ value: T; label: string }>;
  value: T;
  onSelect: (value: T) => void;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {choices.map((choice) => (
        <button
          key={choice.label}
          type="button"
          role="radio"
          aria-checked={value === choice.value}
          className={value === choice.value ? "is-on" : undefined}
          onClick={() => onSelect(choice.value)}
        >
          {choice.label}
        </button>
      ))}
    </div>
  );
}

export function FilterPanel({ filters, onChange, availableModes }: Props) {
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });

  function toggleMode(mode: (typeof FILTER_MODES)[number]) {
    const on = filters.modes.includes(mode);
    const modes = on
      ? filters.modes.filter((m) => m !== mode)
      : FILTER_MODES.filter((m) => m === mode || filters.modes.includes(m));
    // Never allow an empty selection; that would hide everything.
    if (modes.length > 0) set({ modes });
  }

  // After a search, only show modes that occur (plus any the user switched
  // off, so they can always switch them back on).
  const shownModes = FILTER_MODES.filter(
    (mode) =>
      !availableModes || availableModes.has(mode) || !filters.modes.includes(mode),
  );

  return (
    <div className="filters">
      <section className="filter-group">
        <h3>Vervoer</h3>
        <div className="chip-row">
          {shownModes.map((mode) => {
            const on = filters.modes.includes(mode);
            return (
              <button
                key={mode}
                type="button"
                className={`chip mode-chip-toggle mode-${mode}${on ? " is-on" : ""}`}
                aria-pressed={on}
                onClick={() => toggleMode(mode)}
              >
                <ModeIcon kind={mode} size={16} />
                {MODE_LABELS[mode]}
              </button>
            );
          })}
        </div>
      </section>

      <section className="filter-group">
        <h3>Maximaal overstappen</h3>
        <Choices
          label="Maximaal overstappen"
          choices={TRANSFER_CHOICES}
          value={filters.maxTransfers}
          onSelect={(maxTransfers) => set({ maxTransfers })}
        />
      </section>

      <section className="filter-group">
        <h3>Maximaal lopen</h3>
        <Choices
          label="Maximaal lopen"
          choices={WALK_CHOICES}
          value={filters.maxWalk}
          onSelect={(maxWalk) => set({ maxWalk })}
        />
        <p className="filter-hint">
          Totale looptijd, ook bij overstappen. Weinig is ± 5 minuten.
        </p>
      </section>
    </div>
  );
}
