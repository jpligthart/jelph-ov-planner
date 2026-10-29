import { useEffect, useId, useState, type CSSProperties } from "react";
import { fetchAlternatives, type ConnectionAlternative, type PlanLeg, type PlanOption } from "./api";
import { BADGE_LABELS, SEARCH_RADIUS_METERS, type Badge } from "./filters";
import {
  buildItinerary,
  type ItineraryItem,
  buildSteps,
  doorArrival,
  doorDeparture,
  formatClock,
  formatDistance,
  formatDuration,
  modalityNl,
  modeKind,
  transfersLabel,
  walkMetersTotal,
  type Step,
} from "./format";
import { BoltIcon, ChevronIcon, ClockIcon, ModeIcon, StarIcon, TransferIcon, WalkIcon } from "./icons";

const BADGE_ICONS: Record<Badge, typeof BoltIcon> = {
  recommended: StarIcon,
  fastest: BoltIcon,
  leastWalk: WalkIcon,
  fewestTransfers: TransferIcon,
};

type Props = {
  option: PlanOption;
  fromLabel: string;
  toLabel: string;
  /** Where the trip ends, to look for other ways to get there. */
  destination: { lat: number; lng: number };
  badges: Badge[];
};

/** Proportional bar: one coloured segment per step, gaps are waiting time. */
function Timeline({ steps, start, end }: { steps: Step[]; start?: Date; end?: Date }) {
  const t0 = start?.getTime();
  const t1 = end?.getTime();
  const span = t0 !== undefined && t1 !== undefined ? t1 - t0 : 0;

  if (!span || span <= 0) {
    const total = steps.reduce((sum, s) => sum + Math.max(1, s.minutes), 0);
    return (
      <div className="timeline" aria-hidden="true">
        {steps.map((s, i) => (
          <span
            key={i}
            className={`seg mode-${s.kind}`}
            style={{ flexGrow: Math.max(1, s.minutes) / total } as CSSProperties}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="timeline timeline--abs" aria-hidden="true">
      {steps.map((s, i) => {
        const a = s.start?.getTime() ?? t0!;
        const b = s.end?.getTime() ?? a;
        const left = Math.max(0, ((a - t0!) / span) * 100);
        const width = Math.max(2, ((b - a) / span) * 100);
        return (
          <span
            key={i}
            className={`seg mode-${s.kind}`}
            style={{ left: `${left}%`, width: `${Math.min(width, 100 - left)}%` }}
          />
        );
      })}
    </div>
  );
}

/**
 * A time as the NS app shows it: the timetable time, plus how many minutes
 * late it runs ("10:15 +4"). `at` is the expected time.
 */
function Clock({ at, delay, label }: { at?: Date; delay: number; label?: string }) {
  const prefix = label ? `${label} ` : "";
  if (!at || delay <= 0) {
    return <span aria-label={label ? `${prefix}${formatClock(at)}` : undefined}>{formatClock(at)}</span>;
  }
  const scheduled = new Date(at.getTime() - delay * 60000);
  return (
    <span
      aria-label={`${prefix}${formatClock(scheduled)}, ${delay} min vertraagd, nu ${formatClock(at)}`}
    >
      {formatClock(scheduled)}
      <span className="delay" aria-hidden="true">
        +{delay}
      </span>
    </span>
  );
}

function StopTime({
  arrive,
  depart,
  arriveDelay,
  departDelay,
}: {
  arrive?: Date;
  depart?: Date;
  arriveDelay: number;
  departDelay: number;
}) {
  const both = arrive && depart && formatClock(arrive) !== formatClock(depart);
  if (both) {
    return (
      <span className="it-time">
        <span className="it-time-sub">
          <Clock at={arrive} delay={arriveDelay} label="aankomst" />
        </span>
        <Clock at={depart} delay={departDelay} label="vertrek" />
      </span>
    );
  }
  return (
    <span className="it-time">
      {depart ? <Clock at={depart} delay={departDelay} /> : <Clock at={arrive} delay={arriveDelay} />}
    </span>
  );
}

/** Rail paint for the piece of line belonging to an item. */
function railPaint(item?: ItineraryItem): string {
  if (!item || item.type === "stop") return "transparent";
  if (item.type === "wait") return "var(--line-strong)";
  if (item.step.kind === "walk") {
    return "repeating-linear-gradient(to bottom, var(--mode-walk) 0 3px, transparent 3px 7px)";
  }
  return `var(--mode-${item.step.kind})`;
}

/** Stops are dots, moves are the line between them, waits sit at a stop. */
function Itinerary({ id, steps }: { id: string; steps: Step[] }) {
  const items = buildItinerary(steps);
  return (
    <ol className="itinerary" id={id}>
      {items.map((item, i) => {
        if (item.type === "stop") {
          return (
            <li
              key={i}
              className={`it-row it-stop it-stop--${item.role}`}
              style={
                {
                  // The line runs through the dot in the colours on either side.
                  "--above": railPaint(items[i - 1]),
                  "--below": railPaint(items[i + 1]),
                } as CSSProperties
              }
            >
              <StopTime
                arrive={item.arrive}
                depart={item.depart}
                arriveDelay={item.arriveDelay}
                departDelay={item.departDelay}
              />
              <span className="it-rail" aria-hidden="true">
                <span className="it-dot" />
              </span>
              <span className="it-name">
                {item.name}
                {item.detail ? (
                  <span className={`it-kind${item.trackWas ? " is-changed" : ""}`}>
                    {item.detail}
                    {item.trackWas ? ` (was ${item.trackWas})` : null}
                  </span>
                ) : null}
              </span>
            </li>
          );
        }
        if (item.type === "wait") {
          return (
            <li key={i} className={`it-row it-wait${item.tight ? " is-tight" : ""}`}>
              <span className="it-time" />
              <span className="it-rail" aria-hidden="true" />
              <span className="it-note">
                <ClockIcon size={14} />
                {item.tight
                  ? item.minutes > 0
                    ? `Krappe overstap: ${item.minutes} min`
                    : "Krappe overstap"
                  : `${formatDuration(item.minutes)} overstaptijd`}
              </span>
            </li>
          );
        }
        const s = item.step;
        const walk = s.kind === "walk";
        return (
          <li
            key={i}
            className={`it-row it-move mode-${s.kind}${s.cancelled ? " is-cancelled" : ""}`}
          >
            <span className="it-time" />
            <span className="it-rail" aria-hidden="true" />
            <span className="it-note">
              <ModeIcon kind={s.kind} size={14} />
              {walk ? (
                <span>
                  {formatDuration(s.minutes)} lopen
                  {item.toward ? ` ${item.toward}` : ""}
                  {s.meters ? ` · ${formatDistance(s.meters)}` : ""}
                </span>
              ) : (
                <span>
                  <strong>{s.label}</strong> → {s.destination}
                  <span className="it-meta"> · {formatDuration(s.minutes)}</span>
                </span>
              )}
              {s.cancelled ? <span className="fact-alert">Vervalt</span> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

type Connection = {
  /** Where you get off before the last vehicle, e.g. "Eindhoven". */
  stop: string;
  lat: number;
  lng: number;
  readyAt: string;
};

/**
 * The last change onto a vehicle: missing it is what a delay usually costs
 * you, so that is where a backup helps. Null for direct trips.
 */
function lastConnection(legs: PlanLeg[]): Connection | null {
  const rides = legs.filter((l) => modeKind(l.modality) !== "walk");
  if (rides.length < 2) return null;
  const before = rides[rides.length - 2]!;
  const last = rides[rides.length - 1]!;
  const lat = before.destinationLat ?? last.originLat;
  const lng = before.destinationLng ?? last.originLng;
  if (lat === undefined || lng === undefined || !before.plannedArrival) return null;
  return { stop: before.destination, lat, lng, readyAt: before.plannedArrival };
}

/** Backups for the last connection, shown only inside an opened trip. */
function Alternatives({
  connection,
  alternatives,
  planned,
}: {
  connection: Connection;
  alternatives: ConnectionAlternative[];
  planned?: Date;
}) {
  return (
    <section className="alts" aria-label="Andere aansluitingen">
      <h4 className="alts-title">Mis je de aansluiting in {connection.stop}?</h4>
      <ul className="alts-list">
        {alternatives.map((alt) => {
          const rides = alt.legs.filter((l) => modeKind(l.modality) !== "walk");
          const arrive = alt.arrival ? new Date(alt.arrival) : undefined;
          const later =
            planned && arrive ? Math.round((arrive.getTime() - planned.getTime()) / 60000) : 0;
          // Expected times only, delays already included: a backup is about
          // when it really goes, and a second kind of "+" next to "later"
          // would make the row hard to read.
          return (
            <li key={alt.id} className="alt">
              <span className="alt-times">
                {formatClock(alt.departure)} → {formatClock(arrive)}
              </span>
              <span className="mode-chips">
                {rides.map((leg, i) => {
                  const kind = modeKind(leg.modality);
                  return (
                    <span key={i} className={`mode-chip mode-${kind}`}>
                      <ModeIcon kind={kind} size={14} />
                      {modalityNl(leg.modality)}
                    </span>
                  );
                })}
              </span>
              {later > 0 ? <span className="alt-later">{formatDuration(later)} later</span> : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function OptionCard({ option, fromLabel, toLabel, destination, badges }: Props) {
  const [open, setOpen] = useState(false);
  const detailsId = useId();
  const [alternatives, setAlternatives] = useState<ConnectionAlternative[] | null>(null);
  const connection = lastConnection(option.legs);

  const steps = buildSteps(option, fromLabel, toLabel);
  const depart = doorDeparture(option);
  const arrive = doorArrival(option);
  const walk = walkMetersTotal(option);
  const transit = steps.filter((s) => s.kind !== "walk");
  const cancelled = option.legs.some((l) => l.cancelled);

  // Looked up once, the first time the trip is opened. Failures just show
  // nothing: the backup is a nice-to-have, not part of the trip.
  const wantAlternatives = open && connection !== null && alternatives === null;
  useEffect(() => {
    if (!wantAlternatives || !connection || !arrive) return;
    let current = true;
    fetchAlternatives({
      fromLat: connection.lat,
      fromLng: connection.lng,
      toLat: destination.lat,
      toLng: destination.lng,
      readyAt: connection.readyAt,
      arrival: arrive.toISOString(),
      maxWalkMeters: SEARCH_RADIUS_METERS,
    })
      .catch(() => [])
      .then((list) => current && setAlternatives(list));
    return () => {
      current = false;
    };
  }, [wantAlternatives]);

  return (
    <li className={`option${open ? " is-open" : ""}${cancelled ? " is-cancelled" : ""}`}>
      <button
        type="button"
        className="option-head"
        aria-expanded={open}
        aria-controls={detailsId}
        onClick={() => setOpen((v) => !v)}
      >
        {badges.length > 0 ? (
          <span className="badges">
            {badges.map((b) => {
              const Icon = BADGE_ICONS[b];
              return (
                <span key={b} className={`badge badge--${b}`}>
                  <Icon size={13} strokeWidth={2.5} />
                  {BADGE_LABELS[b]}
                </span>
              );
            })}
          </span>
        ) : null}

        <span className="option-top">
          <span className="option-times">
            <span className="clock">
              <Clock at={depart} delay={transit[0]?.departDelay ?? 0} label="vertrek" />
            </span>
            <span className="time-arrow" aria-hidden="true" />
            <span className="clock">
              <Clock at={arrive} delay={transit[transit.length - 1]?.arriveDelay ?? 0} label="aankomst" />
            </span>
          </span>
          <span className="option-duration">
            {formatDuration(option.totalDoorToDoorMinutes)}
          </span>
        </span>

        <Timeline steps={steps} start={depart} end={arrive} />

        <span className="option-bottom">
          <span className="mode-chips">
            {transit.length === 0 ? (
              <span className="mode-chip mode-walk">
                <WalkIcon size={14} /> Lopen
              </span>
            ) : (
              transit.map((s, i) => (
                <span key={i} className={`mode-chip mode-${s.kind}`}>
                  <ModeIcon kind={s.kind} size={14} />
                  {s.label}
                </span>
              ))
            )}
          </span>
          <span className="option-facts">
            <span>{transfersLabel(option.transfers)}</span>
            {walk >= 50 ? (
              <span className="fact-walk">
                <WalkIcon size={14} />
                {formatDistance(walk)}
              </span>
            ) : null}
            {cancelled ? <span className="fact-alert">Rit vervalt</span> : null}
          </span>
          <ChevronIcon size={18} className="option-chevron" />
        </span>
      </button>

      {open ? <Itinerary id={detailsId} steps={steps} /> : null}
      {open && connection && alternatives && alternatives.length > 0 ? (
        <Alternatives connection={connection} alternatives={alternatives} planned={arrive} />
      ) : null}
    </li>
  );
}
