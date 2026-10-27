import type { PlanOption } from "./api";

export function formatClock(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString("nl-NL", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function friendlyError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("could not resolve") || lower.includes("niet gevonden")) {
    return "We konden dit adres of station niet vinden. Probeer een andere schrijfwijze.";
  }
  if (lower.includes("429") || lower.includes("rate limit")) {
    return "Even te druk bij de reisplanner. Probeer het zo opnieuw.";
  }
  if (lower.includes("failed to fetch") || lower.includes("network")) {
    return "Geen verbinding met de server. Check of de API draait.";
  }
  return "Er ging iets mis bij het plannen. Probeer het opnieuw.";
}

/** Map API modality strings to short Dutch labels. */
export function modalityNl(raw?: string): string {
  if (!raw) return "Onderweg";
  const text = raw.trim();
  const upper = text.toUpperCase();

  if (upper === "WALK" || upper.startsWith("WALK ")) return "Lopen";
  if (upper.startsWith("BUS")) {
    const num = text.replace(/^BUS\s*/i, "").trim();
    return num ? `Bus ${num}` : "Bus";
  }
  if (upper.startsWith("TRAM")) {
    const num = text.replace(/^TRAM\s*/i, "").trim();
    return num ? `Tram ${num}` : "Tram";
  }
  if (upper.startsWith("METRO") || upper.startsWith("SUBWAY")) {
    const num = text.replace(/^(METRO|SUBWAY)\s*/i, "").trim();
    return num ? `Metro ${num}` : "Metro";
  }
  if (upper.startsWith("FERRY")) return "Veer";
  if (
    upper.includes("INTERCITY") ||
    upper === "IC" ||
    upper.startsWith("REGIONAL_RAIL") ||
    upper.includes("SPRINTER") ||
    upper.includes("TRAIN")
  ) {
    if (upper.includes("SPRINTER")) return "Sprinter";
    if (upper.includes("INTERCITY") || upper === "IC") return "Intercity";
    const rest = text
      .replace(/^REGIONAL_RAIL\s*/i, "")
      .replace(/^TRAIN\s*/i, "")
      .trim();
    return rest || "Trein";
  }

  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

export function userFacingNotes(option: PlanOption): string[] {
  const notes: string[] = [];

  if (option.walkMetersOrigin >= 80) {
    const where = option.fromStation?.name;
    notes.push(
      where
        ? `${Math.round(option.walkMetersOrigin)} m lopen naar ${where}`
        : `${Math.round(option.walkMetersOrigin)} m lopen bij vertrek`,
    );
  }
  if (option.walkMetersDestination >= 80) {
    const where = option.toStation?.name;
    notes.push(
      where
        ? `${Math.round(option.walkMetersDestination)} m lopen vanaf ${where}`
        : `${Math.round(option.walkMetersDestination)} m lopen bij aankomst`,
    );
  }

  // Keep only human walk notes from API; drop technical source noise.
  for (const note of option.notes ?? []) {
    const n = note.toLowerCase();
    if (n.includes("transitous") || n.includes("ns marked") || n.includes("status:")) {
      continue;
    }
    if (n.includes("multimodal")) continue;
    if (n.includes("walk to") || n.includes("walk from") || n.includes("lopen")) {
      // Already covered via walkMeters when possible.
      continue;
    }
  }

  return notes;
}

export function transfersLabel(count: number): string | null {
  if (count <= 0) return null;
  if (count === 1) return "1 overstap";
  return `${count} overstappen`;
}

export function summarizeLegs(option: PlanOption): string {
  const parts = option.legs
    .map((leg) => modalityNl(leg.modality))
    .filter((label, index, arr) => {
      // Collapse consecutive identical "Lopen"
      if (label === "Lopen" && arr[index - 1] === "Lopen") return false;
      return true;
    });
  return parts.join(" · ");
}
