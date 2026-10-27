import { useEffect, useId, useRef, useState } from "react";
import { searchPlaces, type PlaceHit } from "./api";

type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
};

function kindLabel(kind: PlaceHit["kind"]): string {
  if (kind === "address") return "adres";
  if (kind === "stop") return "halte";
  if (kind === "station") return "station";
  return kind;
}

export function PlaceField({ label, value, onChange, placeholder }: Props) {
  const listId = useId();
  const [suggestions, setSuggestions] = useState<PlaceHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const blurTimer = useRef<number | null>(null);

  useEffect(() => {
    const q = value.trim();
    if (q.length < 3) {
      setSuggestions([]);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const places = await searchPlaces(q, 8);
        if (!cancelled) setSuggestions(places);
      } catch {
        if (!cancelled) setSuggestions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 280);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [value]);

  function pick(place: PlaceHit) {
    onChange(place.name);
    setOpen(false);
  }

  return (
    <label className="place-field">
      <span>{label}</span>
      <div className="place-wrap">
        <input
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            blurTimer.current = window.setTimeout(() => setOpen(false), 120);
          }}
          placeholder={placeholder}
          required
          autoComplete="off"
          role="combobox"
          aria-expanded={open && suggestions.length > 0}
          aria-controls={listId}
        />
        {loading ? <span className="place-hint">Zoeken…</span> : null}
        {open && suggestions.length > 0 ? (
          <ul
            id={listId}
            className="suggestions"
            role="listbox"
            onMouseDown={(e) => e.preventDefault()}
          >
            {suggestions.map((place) => (
              <li key={place.id}>
                <button type="button" onClick={() => pick(place)}>
                  <span className="sug-name">{place.name}</span>
                  <span className="sug-kind">{kindLabel(place.kind)}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </label>
  );
}
