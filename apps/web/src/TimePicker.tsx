import { useEffect, useMemo } from "react";
import {
  dayOptions,
  defaultChoice,
  refreshNow,
  shiftChoice,
  type TimeChoice,
  type TimeMode,
} from "./time";

type Props = {
  value: TimeChoice;
  onChange: (value: TimeChoice) => void;
  /** True once the user picked a time themselves. */
  touched: boolean;
  onTouched: () => void;
};

export function TimePicker({ value, onChange, touched, onTouched }: Props) {
  const days = useMemo(() => {
    const list = dayOptions(14);
    // Keep a manually chosen date selectable even if outside the window.
    if (!list.some((d) => d.value === value.date)) {
      list.unshift({ value: value.date, label: value.date });
    }
    return list;
  }, [value.date]);

  useEffect(() => {
    if (!value.now) return;
    const timer = window.setInterval(() => onChange(refreshNow(value)), 30000);
    return () => window.clearInterval(timer);
  }, [value, onChange]);

  function setMode(mode: TimeMode) {
    if (mode === value.mode) return;
    // Untouched times jump to the smart default of the new mode.
    onChange(touched ? { ...value, mode, now: false } : defaultChoice(mode));
  }

  function update(next: TimeChoice) {
    onTouched();
    onChange(next);
  }

  return (
    <fieldset className="time-picker">
      <legend className="sr-only">Reistijd</legend>

      <div className="segmented" role="radiogroup" aria-label="Tijd geldt voor">
        {(["depart", "arrive"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={value.mode === mode}
            className={value.mode === mode ? "is-on" : undefined}
            onClick={() => setMode(mode)}
          >
            {mode === "depart" ? "Vertrek" : "Aankomst"}
          </button>
        ))}
      </div>

      <div className="time-row">
        {value.mode === "depart" ? (
          <button
            type="button"
            className={`chip chip--now${value.now ? " is-on" : ""}`}
            aria-pressed={value.now}
            onClick={() => {
              onChange(defaultChoice("depart"));
            }}
          >
            Nu
          </button>
        ) : null}

        <label className="field field--day">
          <span className="sr-only">Dag</span>
          <select
            value={value.date}
            onChange={(e) =>
              update({ ...value, now: false, date: e.target.value })
            }
          >
            {days.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </label>

        <label className="field field--time">
          <span className="sr-only">Tijd</span>
          <input
            type="time"
            value={value.time}
            className={value.now ? "is-live" : undefined}
            onChange={(e) => {
              if (!e.target.value) return;
              update({ ...value, now: false, time: e.target.value });
            }}
          />
        </label>

        <div className="stepper" role="group" aria-label="Tijd verschuiven">
          <button
            type="button"
            onClick={() => update(shiftChoice(value, -15))}
            aria-label="15 minuten eerder"
          >
            −15
          </button>
          <button
            type="button"
            onClick={() => update(shiftChoice(value, 15))}
            aria-label="15 minuten later"
          >
            +15
          </button>
        </div>
      </div>
    </fieldset>
  );
}
