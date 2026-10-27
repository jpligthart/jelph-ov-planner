export type TimeMode = "depart" | "arrive";

export type TimeChoice = {
  mode: TimeMode;
  /** Follow the clock ("Nu"); only meaningful for departures. */
  now: boolean;
  /** Local date, YYYY-MM-DD. */
  date: string;
  /** Local time, HH:MM. */
  time: string;
};

const pad = (n: number) => String(n).padStart(2, "0");

export function toDateInput(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function toTimeInput(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromInputs(date: string, time: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0);
}

function roundUp(d: Date, stepMinutes: number): Date {
  const step = stepMinutes * 60000;
  return new Date(Math.ceil(d.getTime() / step) * step);
}

function choiceAt(mode: TimeMode, d: Date, now = false): TimeChoice {
  return { mode, now, date: toDateInput(d), time: toTimeInput(d) };
}

/**
 * Smart defaults: depart "now"; arrive about an hour from now,
 * rounded up to the next quarter.
 */
export function defaultChoice(mode: TimeMode, clock = new Date()): TimeChoice {
  if (mode === "arrive") {
    return choiceAt("arrive", roundUp(new Date(clock.getTime() + 60 * 60000), 15));
  }
  return choiceAt("depart", clock, true);
}

export function choiceDate(choice: TimeChoice): Date {
  return choice.now ? new Date() : fromInputs(choice.date, choice.time);
}

export function setChoiceDate(choice: TimeChoice, d: Date): TimeChoice {
  return choiceAt(choice.mode, d);
}

export function shiftChoice(choice: TimeChoice, minutes: number): TimeChoice {
  const base = choice.now ? roundUp(new Date(), 5) : choiceDate(choice);
  return setChoiceDate(choice, new Date(base.getTime() + minutes * 60000));
}

/** Keep "now" choices ticking so the shown time stays current. */
export function refreshNow(choice: TimeChoice): TimeChoice {
  return choice.now ? choiceAt(choice.mode, new Date(), true) : choice;
}

export function dayOptions(count = 14, clock = new Date()): Array<{ value: string; label: string }> {
  const out: Array<{ value: string; label: string }> = [];
  for (let i = 0; i < count; i += 1) {
    const d = new Date(clock.getFullYear(), clock.getMonth(), clock.getDate() + i);
    out.push({ value: toDateInput(d), label: dayLabel(toDateInput(d), clock) });
  }
  return out;
}

export function dayLabel(date: string, clock = new Date()): string {
  const target = fromInputs(date, "00:00");
  const today = new Date(clock.getFullYear(), clock.getMonth(), clock.getDate());
  const diff = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return "Vandaag";
  if (diff === 1) return "Morgen";
  if (diff === -1) return "Gisteren";
  return target.toLocaleDateString("nl-NL", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export function describeChoice(choice: TimeChoice): string {
  if (choice.now) return "Nu vertrekken";
  const verb = choice.mode === "arrive" ? "Aankomst uiterlijk" : "Vertrek";
  return `${verb} ${dayLabel(choice.date).toLowerCase()} ${choice.time}`;
}
