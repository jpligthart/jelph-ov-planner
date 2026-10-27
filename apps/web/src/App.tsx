import { useState, type FormEvent } from "react";
import { planTrip, type PlanResponse } from "./api";
import {
  formatClock,
  friendlyError,
  modalityNl,
  summarizeLegs,
  transfersLabel,
  userFacingNotes,
} from "./format";
import { PlaceField } from "./PlaceField";

export function App() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [when, setWhen] = useState("");
  const [arrive, setArrive] = useState(false);
  const [walk, setWalk] = useState(1200);
  const [showMore, setShowMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PlanResponse | null>(null);

  function swapPlaces() {
    setFrom(to);
    setTo(from);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const dateTime = when.trim()
        ? new Date(when.trim()).toISOString()
        : undefined;
      const data = await planTrip({
        from: from.trim(),
        to: to.trim(),
        dateTime,
        searchForArrival: arrive,
        maxWalkMeters: walk,
        maxNearby: 3,
        topK: 8,
      });
      setResult(data);
    } catch (err) {
      setResult(null);
      const message = err instanceof Error ? err.message : String(err);
      setError(friendlyError(message));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <header className="hero">
        <p className="brand">Jelph OV Planner</p>
        <h1>Plan je reis</h1>
        <p className="lede">
          Van deur tot deur — met slimme alternatieven als iets verder lopen
          sneller is.
        </p>
      </header>

      <form className="planner" onSubmit={onSubmit}>
        <div className="places">
          <PlaceField
            label="Van"
            value={from}
            onChange={setFrom}
            placeholder="Adres, halte of station"
          />
          <button
            type="button"
            className="swap"
            onClick={swapPlaces}
            aria-label="Van en naar omdraaien"
            title="Omdraaien"
          >
            ↕
          </button>
          <PlaceField
            label="Naar"
            value={to}
            onChange={setTo}
            placeholder="Adres, halte of station"
          />
        </div>

        <div className="row">
          <label>
            <span>Tijd</span>
            <input
              type="datetime-local"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
            />
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={arrive}
              onChange={(e) => setArrive(e.target.checked)}
            />
            <span>Aankomsttijd</span>
          </label>
        </div>

        <button
          type="button"
          className="more-toggle"
          onClick={() => setShowMore((v) => !v)}
          aria-expanded={showMore}
        >
          {showMore ? "Minder opties" : "Meer opties"}
        </button>

        {showMore ? (
          <label className="walk">
            <span>
              Maximale loopafstand: <strong>{walk} m</strong>
            </span>
            <input
              type="range"
              min={300}
              max={2500}
              step={100}
              value={walk}
              onChange={(e) => setWalk(Number(e.target.value))}
            />
          </label>
        ) : null}

        <div className="actions">
          <button type="submit" className="primary" disabled={loading}>
            {loading ? "Bezig met plannen…" : "Plan reis"}
          </button>
        </div>
      </form>

      {error ? <p className="error" role="alert">{error}</p> : null}

      {result ? (
        <section className="results" aria-live="polite">
          <header className="results-head">
            <h2>
              {result.from.label}
              <span className="arrow"> → </span>
              {result.to.label}
            </h2>
            <p>
              {result.options.length === 0
                ? "Geen reis gevonden"
                : result.options.length === 1
                  ? "1 reisoptie"
                  : `${result.options.length} reisopties`}
            </p>
          </header>

          {result.options.length === 0 ? (
            <p className="empty">
              Probeer een ander tijdstip of een grotere loopafstand onder meer
              opties.
            </p>
          ) : (
            <ol className="option-list">
              {result.options.map((option, index) => {
                const notes = userFacingNotes(option);
                const transfer = transfersLabel(option.transfers);
                return (
                  <li key={option.id} className="option">
                    <div className="option-main">
                      <div className="option-times">
                        <span className="clock">
                          {formatClock(option.departure)}
                        </span>
                        <span className="time-sep">→</span>
                        <span className="clock">
                          {formatClock(option.arrival)}
                        </span>
                      </div>
                      <div className="option-meta">
                        <strong>{option.totalDoorToDoorMinutes} min</strong>
                        {transfer ? (
                          <span className="dot-meta"> · {transfer}</span>
                        ) : (
                          <span className="dot-meta"> · direct</span>
                        )}
                      </div>
                    </div>

                    <p className="leg-summary">{summarizeLegs(option)}</p>

                    {notes.length > 0 ? (
                      <ul className="notes">
                        {notes.map((note) => (
                          <li key={note}>{note}</li>
                        ))}
                      </ul>
                    ) : null}

                    <details className="leg-details">
                      <summary>Stappen</summary>
                      <ol>
                        {option.legs.map((leg, i) => (
                          <li key={`${option.id}-${i}`}>
                            <span className="modality">
                              {modalityNl(leg.modality)}
                            </span>
                            <span>
                              {leg.origin} → {leg.destination}
                            </span>
                            <span className="leg-time">
                              {formatClock(leg.plannedDeparture)}
                              {leg.plannedArrival
                                ? ` – ${formatClock(leg.plannedArrival)}`
                                : ""}
                            </span>
                          </li>
                        ))}
                      </ol>
                    </details>

                    <span className="option-index" aria-hidden="true">
                      {index + 1}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      ) : null}

      <footer className="foot">
        <span>
          Reisdata o.a. via{" "}
          <a
            href="https://transitous.org/sources/"
            target="_blank"
            rel="noreferrer"
          >
            Transitous
          </a>{" "}
          /{" "}
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noreferrer"
          >
            OpenStreetMap
          </a>
        </span>
      </footer>
    </div>
  );
}
