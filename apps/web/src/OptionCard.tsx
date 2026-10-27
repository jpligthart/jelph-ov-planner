import { useId, useState, type CSSProperties } from "react";
import type { PlanOption } from "./api";
import { BADGE_LABELS, type Badge } from "./filters";
import {
  buildSteps,
  doorArrival,
  doorDeparture,
  formatClock,
  formatDistance,
  formatDuration,
  transfersLabel,
  walkMetersTotal,
  type Step,
} from "./format";
import { BoltIcon, ChevronIcon, ModeIcon, StarIcon, TransferIcon, WalkIcon } from "./icons";

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

export function OptionCard({ option, fromLabel, toLabel, badges }: Props) {
  const [open, setOpen] = useState(false);
  const detailsId = useId();

  const steps = buildSteps(option, fromLabel, toLabel);
  const depart = doorDeparture(option);
  const arrive = doorArrival(option);
  const walk = walkMetersTotal(option);
  const transit = steps.filter((s) => s.kind !== "walk");
  const cancelled = option.legs.some((l) => l.cancelled);

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
            <span className="clock">{formatClock(depart)}</span>
            <span className="time-arrow" aria-hidden="true" />
            <span className="clock">{formatClock(arrive)}</span>
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

      {open ? (
        <ol className="steps" id={detailsId}>
          {steps.map((s, i) => (
            <li key={i} className={`step mode-${s.kind}${s.cancelled ? " is-cancelled" : ""}`}>
              <span className="step-time">{formatClock(s.start)}</span>
              <span className="step-rail" aria-hidden="true">
                <span className="step-icon">
                  <ModeIcon kind={s.kind} size={14} />
                </span>
              </span>
              <span className="step-body">
                <span className="step-place">{s.origin}</span>
                <span className="step-detail">
                  {s.label}
                  {s.kind !== "walk" ? ` → ${s.destination}` : ""}
                  <span className="step-meta">
                    {formatDuration(s.minutes)}
                    {s.meters ? ` · ${formatDistance(s.meters)}` : ""}
                  </span>
                  {s.cancelled ? <span className="fact-alert">Vervalt</span> : null}
                </span>
              </span>
            </li>
          ))}
          <li className="step step--end">
            <span className="step-time">{formatClock(arrive)}</span>
            <span className="step-rail" aria-hidden="true">
              <span className="step-icon step-icon--end" />
            </span>
            <span className="step-body">
              <span className="step-place">{toLabel}</span>
            </span>
          </li>
        </ol>
      ) : null}
    </li>
  );
}
