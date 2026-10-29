import type { ReactNode, SVGProps } from "react";
import type { ModeKind } from "./format";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 20, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const TrainIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="5" y="3" width="14" height="13" rx="3" />
    <path d="M5 10h14M9 20l-2 2M15 20l2 2M8 16l-1 4M16 16l1 4" />
    <circle cx="9" cy="13" r=".6" fill="currentColor" />
    <circle cx="15" cy="13" r=".6" fill="currentColor" />
  </Svg>
);

export const BusIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="3" width="16" height="15" rx="3" />
    <path d="M4 11h16M8 18v3M16 18v3M9 7h6" />
    <circle cx="8" cy="14.5" r=".6" fill="currentColor" />
    <circle cx="16" cy="14.5" r=".6" fill="currentColor" />
  </Svg>
);

export const TramIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 2h6M12 2v3" />
    <rect x="6" y="5" width="12" height="13" rx="3" />
    <path d="M6 11h12M9 18l-2 4M15 18l2 4" />
  </Svg>
);

export const MetroIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M8 16V8l4 5 4-5v8" />
  </Svg>
);

export const FerryIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 18c1.5 1 3 1 4.5 0s3-1 4.5 0 3 1 4.5 0 3-1 4.5 0" />
    <path d="M5 15l-1-4h16l-1 4M8 11V7h8v4M12 4v3" />
  </Svg>
);

export const WalkIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="13" cy="4" r="1.8" />
    <path d="M10 22l2-6 3 3v3M8 12l2-4 4 1 2 3 2 1M12 16l-1-4" />
  </Svg>
);

export const DotIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="4" />
  </Svg>
);

export const BoltIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />
  </Svg>
);

export const StarIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />
  </Svg>
);

export const TransferIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 12h16M14 6l6 6-6 6" />
  </Svg>
);

export const SwapIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 4v16M3 8l4-4 4 4M17 20V4M13 16l4 4 4-4" />
  </Svg>
);

export const FilterIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 6h16M7 12h10M10 18h4" />
  </Svg>
);

export const ChevronIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 9l6 6 6-6" />
  </Svg>
);

export const CloseIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);

export const LocateIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    <circle cx="12" cy="12" r="7" />
  </Svg>
);

export const ClockIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Svg>
);

export const PinIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 21s-7-6.2-7-12a7 7 0 0114 0c0 5.8-7 12-7 12z" />
    <circle cx="12" cy="9" r="2.5" />
  </Svg>
);

export const SearchIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.5-3.5" />
  </Svg>
);

export const HistoryIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 12a9 9 0 103-6.7L3 8" />
    <path d="M3 3v5h5M12 7v5l3 2" />
  </Svg>
);

export const ArrowRightIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Svg>
);

export const InfoIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 10v6M12 7h.01" />
  </Svg>
);

export const RefreshIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 11a8 8 0 1 0-2.3 5.7" />
    <path d="M20 4v7h-7" />
  </Svg>
);

export const LogoutIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
    <path d="M10 17l-5-5 5-5M5 12h11" />
  </Svg>
);

export const ExternalIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14 4h6v6M20 4l-9 9" />
    <path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" />
  </Svg>
);

export const HeartIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />
  </Svg>
);

export function ModeIcon({ kind, ...rest }: IconProps & { kind: ModeKind }) {
  switch (kind) {
    case "train":
      return <TrainIcon {...rest} />;
    case "bus":
      return <BusIcon {...rest} />;
    case "tram":
      return <TramIcon {...rest} />;
    case "metro":
      return <MetroIcon {...rest} />;
    case "ferry":
      return <FerryIcon {...rest} />;
    case "walk":
      return <WalkIcon {...rest} />;
    default:
      return <DotIcon {...rest} />;
  }
}
