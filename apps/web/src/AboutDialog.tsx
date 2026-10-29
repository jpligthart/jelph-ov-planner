import { useEffect } from "react";
import { CloseIcon } from "./icons";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function AboutDialog({ open, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="about-host is-open">
      <div className="about-backdrop" onClick={onClose} aria-hidden="true" />
      <div
        className="card sheet about-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-title"
      >
        <div className="sheet-head">
          <h2 id="about-title">Over Jelph OV</h2>
          <button
            type="button"
            className="icon-button sheet-close"
            onClick={onClose}
            aria-label="Sluiten"
          >
            <CloseIcon size={18} />
          </button>
        </div>

        <div className="about-body">
          <p>
            Slimme deur-tot-deur OV-planner voor Nederland. We zoeken nabije
            haltes en stations en rangschikken echte reisalternatieven.
          </p>

          <h3>Data &amp; bronnen</h3>
          <p>
            Reisdata o.a. via{" "}
            <a
              href="https://transitous.org/sources/"
              target="_blank"
              rel="noreferrer"
            >
              Transitous
            </a>
            . Attributie van hun databronnen staat op die pagina.
          </p>
          <p>
            ©{" "}
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noreferrer"
            >
              OpenStreetMap contributors
            </a>{" "}
            (ODbL) — gebruikt via Transitous voor routing en kaartdata.
          </p>

          <h3>Steun</h3>
          <p>
            Handig gevonden?{" "}
            <a href="https://ko-fi.com/jelphme" target="_blank" rel="noreferrer">
              Tip via Ko-fi
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
