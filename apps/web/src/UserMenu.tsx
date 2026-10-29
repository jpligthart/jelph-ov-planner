import { useEffect, useRef, useState } from "react";
import { InfoIcon, LogoutIcon } from "./icons";

type Props = {
  /** Logged-in user; without login there is nothing to sign out of. */
  user?: string;
  onAbout: () => void;
  onLogout?: () => void;
};

/**
 * One quiet control in the top bar. Logged in: your initial, opening a menu
 * with who you are, "Over" and "Uitloggen". Without login: just "Over".
 */
export function UserMenu({ user, onAbout, onLogout }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
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

  if (!onLogout) {
    return (
      <button type="button" className="icon-button topbar-button" onClick={onAbout} aria-label="Over Jelph OV">
        <InfoIcon size={18} />
      </button>
    );
  }

  const choose = (action: () => void) => () => {
    setOpen(false);
    action();
  };

  return (
    <div className="user-menu" ref={root}>
      <button
        ref={trigger}
        type="button"
        className="icon-button topbar-button avatar"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={user ? `Menu voor ${user}` : "Menu"}
      >
        {user ? user.trim().charAt(0).toUpperCase() : <InfoIcon size={18} />}
      </button>
      {open ? (
        <div className="menu" role="menu">
          {user ? (
            <p className="menu-head">
              Ingelogd als <strong>{user}</strong>
            </p>
          ) : null}
          <button type="button" role="menuitem" className="menu-item" onClick={choose(onAbout)}>
            <InfoIcon size={16} />
            Over Jelph OV
          </button>
          <button type="button" role="menuitem" className="menu-item" onClick={choose(onLogout)}>
            <LogoutIcon size={16} />
            Uitloggen
          </button>
        </div>
      ) : null}
    </div>
  );
}
