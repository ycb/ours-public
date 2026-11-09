import { useEffect, useId, useRef, useState } from "react";
import { useAuth } from "../features/auth/authContext";
import type { DateView } from "../features/dates/useDatesView";

/**
 * My name and Sign out, out of the way: two people use this app, so neither needs to be on every page.
 * It also holds what's waiting for my reflection (QA 2026-11-03): a dot on the avatar, never a banner.
 */
export function AccountMenu({
  name,
  partnerName = "Your partner",
  toReflect = [],
  onReflect,
}: {
  name: string;
  partnerName?: string;
  toReflect?: DateView[];
  onReflect?: (entry: DateView) => void;
}) {
  const { signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const ids = { menu: useId(), label: useId() };
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLButtonElement>("[role=menuitem]")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onPointer = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node) && !buttonRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [open]);

  return (
    <div className="menu-anchor account-anchor">
      <button
        ref={buttonRef}
        type="button"
        className="avatar avatar-mine account-button"
        aria-label={toReflect.length ? `Account, ${toReflect.length} to reflect on` : "Account"}
        aria-describedby={ids.label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? ids.menu : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
        </svg>
        <span id={ids.label} className="visually-hidden">
          {name}
        </span>
        {toReflect.length ? <span className="avatar-dot" aria-hidden="true" /> : null}
      </button>
      {open ? (
        <div ref={menuRef} id={ids.menu} role="menu" aria-label="Account" className="menu">
          {toReflect.length ? (
            <>
              <p className="menu-kicker">To reflect on</p>
              {toReflect.map((entry) => (
                <button
                  key={entry.date.id}
                  type="button"
                  role="menuitem"
                  className="menu-item menu-reflect"
                  onClick={() => {
                    setOpen(false);
                    onReflect?.(entry);
                  }}
                >
                  <span>How was {entry.title}?</span>
                  {entry.partnerReflected ? <small>{partnerName} reflected</small> : null}
                </button>
              ))}
              <hr className="menu-separator" />
            </>
          ) : null}
          <p className="menu-label">{name}</p>
          <button type="button" role="menuitem" className="menu-item" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
