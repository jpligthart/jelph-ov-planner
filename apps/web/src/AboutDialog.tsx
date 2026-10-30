import { useEffect, useRef } from "react";
import { CloseIcon, ExternalIcon, HeartIcon } from "./icons";
import { LogoMark } from "./Logo";

type Props = {
  open: boolean;
  onClose: () => void;
};

const SOURCES = [
  {
    name: "Transitous",
    what: "Bus, tram, metro en actuele tijden",
    href: "https://transitous.org/sources/",
  },
  {
    name: "OpenStreetMap contributors",
    what: "Kaart, looproutes en straatnetwerk (ODbL)",
    href: "https://www.openstreetmap.org/copyright",
  },
  {
    name: "OpenFreeMap",
    what: "Kaarttegels voor de routekaart",
    href: "https://openfreemap.org/",
  },
];

/** Bottom sheet on mobile, centred dialog on desktop. */
export function AboutDialog({ open, onClose }: Props) {
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeButton.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="about-host">
      <div className="about-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="about-dialog" role="dialog" aria-modal="true" aria-labelledby="about-title">
        <header className="about-head">
          <LogoMark size={36} />
          <div className="about-heading">
            <h2 id="about-title">Over Jelph OV</h2>
            <p>Slimme deur-tot-deur OV-planner voor Nederland</p>
          </div>
          <button
            ref={closeButton}
            type="button"
            className="icon-button about-close"
            onClick={onClose}
            aria-label="Sluiten"
          >
            <CloseIcon size={18} />
          </button>
        </header>

        <p className="about-intro">
          We zoeken haltes en stations in de buurt van je vertrek- en
          aankomstpunt en rangschikken echte reisalternatieven, ook als iets
          verder lopen sneller is.
        </p>

        <section className="about-section">
          <h3>Data &amp; bronnen</h3>
          <ul className="about-links">
            {SOURCES.map((source) => (
              <li key={source.name}>
                <a href={source.href} target="_blank" rel="noreferrer">
                  <span>
                    <strong>{source.name}</strong>
                    <span>{source.what}</span>
                  </span>
                  <ExternalIcon size={16} />
                </a>
              </li>
            ))}
          </ul>
          <p className="about-note">
            De attributie van alle databronnen staat op de pagina van Transitous.
          </p>
        </section>

        <section className="about-section">
          <h3>Steun</h3>
          <a
            className="about-support"
            href="https://ko-fi.com/jelphme"
            target="_blank"
            rel="noreferrer"
          >
            <HeartIcon size={16} />
            Handig gevonden? Tip via Ko-fi
          </a>
        </section>
      </div>
    </div>
  );
}
