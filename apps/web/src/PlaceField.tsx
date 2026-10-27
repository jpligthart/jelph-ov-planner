import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { searchPlaces, type PlaceHit } from "./api";
import { isCoords } from "./format";
import {
  CloseIcon,
  HistoryIcon,
  LocateIcon,
  PinIcon,
  TrainIcon,
  BusIcon,
} from "./icons";

type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  recent?: string[];
  allowLocate?: boolean;
  marker: "origin" | "destination";
};

type Item =
  | { type: "locate" }
  | { type: "recent"; name: string }
  | { type: "place"; place: PlaceHit };

function kindLabel(kind: PlaceHit["kind"]): string {
  if (kind === "address") return "Adres";
  if (kind === "stop") return "Halte";
  if (kind === "station") return "Station";
  return "Plaats";
}

function KindIcon({ kind }: { kind: PlaceHit["kind"] }) {
  if (kind === "station") return <TrainIcon size={18} />;
  if (kind === "stop") return <BusIcon size={18} />;
  return <PinIcon size={18} />;
}

export function PlaceField({
  label,
  value,
  onChange,
  placeholder,
  recent = [],
  allowLocate = false,
  marker,
}: Props) {
  const listId = useId();
  const inputId = useId();
  const [suggestions, setSuggestions] = useState<PlaceHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [active, setActive] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  const showsLocation = isCoords(value);
  const displayValue = showsLocation ? "Huidige locatie" : value;

  useEffect(() => {
    const q = value.trim();
    if (q.length < 3 || isCoords(q)) {
      setSuggestions([]);
      setLoading(false);
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
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [value]);

  const empty = value.trim().length === 0;
  const items: Item[] = empty
    ? [
        ...(allowLocate && "geolocation" in navigator
          ? [{ type: "locate" } as const]
          : []),
        ...recent.slice(0, 5).map((name) => ({ type: "recent", name }) as const),
      ]
    : suggestions.map((place) => ({ type: "place", place }) as const);

  const expanded = open && items.length > 0;

  useEffect(() => setActive(-1), [value, open]);

  function locate() {
    setOpen(false);
    setLocating(true);
    // Paint the spinner before the browser sits on the location lookup.
    window.setTimeout(() => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLocating(false);
          onChange(
            `${pos.coords.latitude.toFixed(5)},${pos.coords.longitude.toFixed(5)}`,
          );
        },
        () => setLocating(false),
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 },
      );
    }, 0);
  }

  function choose(item: Item) {
    if (item.type === "locate") {
      locate();
      return;
    }
    onChange(item.type === "recent" ? item.name : item.place.name);
    setOpen(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(items.length - 1, i + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => Math.max(-1, i - 1));
    } else if (event.key === "Enter" && expanded && active >= 0) {
      event.preventDefault();
      choose(items[active]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className={`place-field place-field--${marker}`}>
      <span className="place-marker" aria-hidden="true" />
      <label className="place-label" htmlFor={inputId}>
        {label}
      </label>
      <input
        ref={inputRef}
        id={inputId}
        value={displayValue}
        onChange={(e) => {
          onChange(showsLocation ? "" : e.target.value);
          setOpen(true);
        }}
        onFocus={(e) => {
          setOpen(true);
          if (showsLocation) e.target.select();
        }}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onKeyDown={onKeyDown}
        placeholder={locating ? "Locatie bepalen…" : placeholder}
        readOnly={locating}
        aria-busy={locating}
        required
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="next"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        className={showsLocation ? "is-location" : undefined}
      />
      {loading || locating ? (
        <span
          className="place-spinner"
          aria-label={locating ? "Locatie bepalen" : "Zoeken"}
        />
      ) : null}
      {!empty && !loading ? (
        <button
          type="button"
          className="place-clear"
          aria-label={`${label} wissen`}
          onClick={() => {
            onChange("");
            inputRef.current?.focus();
          }}
        >
          <CloseIcon size={16} />
        </button>
      ) : null}

      {expanded ? (
        <ul
          id={listId}
          className="suggestions"
          role="listbox"
          onMouseDown={(e) => e.preventDefault()}
        >
          {items.map((item, index) => {
            const common = {
              id: `${listId}-${index}`,
              role: "option" as const,
              "aria-selected": index === active,
              className: index === active ? "is-active" : undefined,
              onClick: () => choose(item),
              onMouseEnter: () => setActive(index),
            };
            if (item.type === "locate") {
              return (
                <li key="locate" {...common}>
                  <span className="sug-icon sug-icon--accent">
                    <LocateIcon size={18} />
                  </span>
                  <span className="sug-name">Huidige locatie</span>
                </li>
              );
            }
            if (item.type === "recent") {
              return (
                <li key={`r-${item.name}`} {...common}>
                  <span className="sug-icon">
                    <HistoryIcon size={18} />
                  </span>
                  <span className="sug-name">{item.name}</span>
                  <span className="sug-kind">Recent</span>
                </li>
              );
            }
            return (
              <li key={item.place.id} {...common}>
                <span className="sug-icon">
                  <KindIcon kind={item.place.kind} />
                </span>
                <span className="sug-name">{item.place.name}</span>
                <span className="sug-kind">{kindLabel(item.place.kind)}</span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
