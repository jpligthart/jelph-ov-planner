/** Shared mark — keep in sync with `public/favicon.svg`. */
export function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <svg
      className="logo-mark"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="jelph-logo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#3a66ff" />
          <stop offset="100%" stopColor="#1f3fd1" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="url(#jelph-logo)" />
      <path
        d="M20.75 10V18.75a6.5 6.5 0 0 1-13 0"
        fill="none"
        stroke="#fff"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      <circle cx="7.75" cy="18.75" r="2.75" fill="#fff" />
      <circle cx="20.75" cy="9" r="4.25" fill="#ffc61a" stroke="#fff" strokeWidth="2" />
    </svg>
  );
}

export function Logo() {
  return (
    <a className="logo" href="/" aria-label="Jelph OV Planner, home">
      <LogoMark />
      <span className="logo-text">
        Jelph <strong>OV</strong>
      </span>
    </a>
  );
}
