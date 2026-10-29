import { useEffect, useRef, useState } from "react";
import { InfoIcon, LogoutIcon, MenuIcon } from "./icons";
import { THEME_LABELS, applyTheme, loadTheme, type ThemeChoice } from "./theme";

type Props = {
  /** Logged-in user; without login there is nothing to sign out of. */
  user?: string;
  onAbout: () => void;
  onLogout?: () => void;
};

const THEME_ORDER: ThemeChoice[] = ["light", "dark", "auto"];

/**
 * The one control in the top bar: a menu with who you are, the theme,
 * "Over" and, when logged in, "Uitloggen".
 */
export function UserMenu({ user, onAbout, onLogout }: Props) {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeChoice>(loadTheme);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLElement>("[aria-checked=true]")?.focus();
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const choose = (action: () => void) => () => {
    setOpen(false);
    action();
  };

  // Stays open: you see the theme change behind the menu.
  const pickTheme = (choice: ThemeChoice) => {
    setTheme(choice);
    applyTheme(choice);
  };

  return (
    <div className="user-menu" ref={root}>
      <button
        ref={trigger}
        type="button"
        className="icon-button topbar-button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Menu"
      >
        <MenuIcon size={20} />
      </button>
      {open ? (
        <div className="menu" role="menu">
          {user ? (
            <p className="menu-head">
              Ingelogd als <strong>{user}</strong>
            </p>
          ) : null}
          <div className="menu-group" role="group" aria-labelledby="menu-theme">
            <span id="menu-theme" className="menu-label">
              Weergave
            </span>
            <div className="menu-segments">
              {THEME_ORDER.map((choice) => (
                <button
                  key={choice}
                  type="button"
                  role="menuitemradio"
                  aria-checked={theme === choice}
                  className={`menu-segment${theme === choice ? " is-on" : ""}`}
                  onClick={() => pickTheme(choice)}
                >
                  {THEME_LABELS[choice]}
                </button>
              ))}
            </div>
          </div>
          <button type="button" role="menuitem" className="menu-item" onClick={choose(onAbout)}>
            <InfoIcon size={16} />
            Over Jelph OV
          </button>
          {onLogout ? (
            <button type="button" role="menuitem" className="menu-item" onClick={choose(onLogout)}>
              <LogoutIcon size={16} />
              Uitloggen
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
