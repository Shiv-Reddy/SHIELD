/**
 * The Shield mark, and the line icons.
 *
 * The logo is inlined rather than loaded from `public/icons/shield-white.svg`
 * because an `<img>` in a popup flashes empty on open — the popup is destroyed
 * and rebuilt every time it is clicked, so a file fetch happens on every open
 * rather than once. Inline, it is part of the first paint.
 *
 * White only, and the mark has no coloured variant at all — black and white
 * everywhere, toolbar included. White here because: the
 * reference interface has exactly one saturated element per view and it is the
 * primary action. A coloured logo would be a second, competing with the thing
 * the design wants looked at.
 *
 * The shape is doing real work. The left half is a solid shield with an eye —
 * something watching, whole. The right half is the same silhouette dissolved
 * into squares. That is the product in one mark: what is seen on the left, and
 * what leaves on the right.
 */

export function ShieldMark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 725 725" className={className} fill="currentColor" aria-hidden="true">
      <clipPath id="shield-half">
        <rect x="0" y="0" width="347.5" height="725" />
      </clipPath>
      <path
        d="M347.5 0C245 28 128 92 47.5 163C47.5 380 140 600 347.5 725ZM100 352C165 245 258 232 347.5 232C347.5 232 347.5 472 347.5 472C258 472 165 459 100 352ZM363 352C363 390.66 331.66 422 293 422C254.34 422 223 390.66 223 352C223 313.34 254.34 282 293 282C331.66 282 363 313.34 363 352ZM349 352C349 362.49 340.49 371 330 371C319.51 371 311 362.49 311 352C311 341.51 319.51 333 330 333C340.49 333 349 341.51 349 352Z"
        fillRule="evenodd"
        clipPath="url(#shield-half)"
      />
      {[
        [352, 214, 40], [352, 297, 36], [352, 372, 36], [352, 449, 40],
        [398, 258, 46], [400, 340, 28], [398, 398, 44],
        [452, 166, 50], [455, 320, 30], [452, 440, 48],
        [505, 96, 34], [512, 250, 56], [515, 355, 36], [500, 512, 50],
        [568, 158, 46], [566, 310, 50], [560, 440, 40], [530, 592, 36],
        [636, 232, 28], [640, 366, 34], [620, 536, 28], [478, 610, 24],
      ].map(([x, y, size]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={size} height={size} />
      ))}
    </svg>
  );
}

/**
 * Line icons, drawn at a single stroke weight.
 *
 * Hand-written rather than pulled from a set: three icons is not worth a
 * dependency, and a set would arrive with a house style that is not the
 * reference's. Stroke rather than fill throughout, which is what the reference
 * uses and what keeps them quiet next to the gradient.
 */
function Icon({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 20 20"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/**
 * Settings, as two sliders. The old mark — a circle with eight short spokes —
 * read as a brightness control to everyone who was asked, which on a dark
 * panel invites the one click that does something else.
 */
export function SettingsIcon({ className = '' }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M3 6.5h7.5M14.5 6.5H17M3 13.5h2.5M9.5 13.5H17" />
      <circle cx="12.5" cy="6.5" r="2" />
      <circle cx="7.5" cy="13.5" r="2" />
    </Icon>
  );
}

/** A finished step in the run feed. */
export function CheckIcon({ className = '' }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="m5 10.5 3.2 3L15 6.5" />
    </Icon>
  );
}

/** A run that ended without acting, or stopped short. */
export function InfoIcon({ className = '' }: { className?: string }) {
  return (
    <Icon className={className}>
      <circle cx="10" cy="10" r="7" />
      <path d="M10 9v4.5M10 6.6v.1" />
    </Icon>
  );
}

/** A run that failed. */
export function AlertIcon({ className = '' }: { className?: string }) {
  return (
    <Icon className={className}>
      <circle cx="10" cy="10" r="7" />
      <path d="M10 6.2v4.6M10 13.4v.1" />
    </Icon>
  );
}

/** Run the same task again. */
export function AgainIcon({ className = '' }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M16 10a6 6 0 1 1-1.8-4.3M16 3.5v3h-3" />
    </Icon>
  );
}

export function ScanIcon({ className = '' }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M3 7V4.6A1.6 1.6 0 0 1 4.6 3H7M13 3h2.4A1.6 1.6 0 0 1 17 4.6V7M17 13v2.4a1.6 1.6 0 0 1-1.6 1.6H13M7 17H4.6A1.6 1.6 0 0 1 3 15.4V13" />
      <path d="M3 10h14" />
    </Icon>
  );
}

export function ReceiptIcon({ className = '' }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M5 3h10v14l-2.5-1.5L10 17l-2.5-1.5L5 17z" />
      <path d="M8 7.5h4M8 11h4" />
    </Icon>
  );
}

export function ClockIcon({ className = '' }: { className?: string }) {
  return (
    <Icon className={className}>
      <circle cx="10" cy="10" r="7" />
      <path d="M10 6v4.2l2.6 1.6" />
    </Icon>
  );
}

/** Opens in place — a history list, a detail. Rotated 90° when open. */
export function ChevronIcon({ className = '' }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="m7.5 4.5 5.5 5.5-5.5 5.5" />
    </Icon>
  );
}

/** Opens a tab of its own. Distinct from the chevron so the row says which. */
export function OpenIcon({ className = '' }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M8 4H5.5A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16h9a1.5 1.5 0 0 0 1.5-1.5V12" />
      <path d="M11 4h5v5M16 4l-7 7" />
    </Icon>
  );
}

/** Send, in the composer. */
export function ArrowUpIcon({ className = '' }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M10 16V4.5M5 9.5l5-5 5 5" />
    </Icon>
  );
}

/** Stop, in the composer while a run is in flight. Filled, so it reads at a glance. */
export function StopIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true">
      <rect x="6" y="6" width="8" height="8" rx="1.5" fill="currentColor" />
    </svg>
  );
}

/** A document with a rising line — the compliance report. */
export function ReportIcon({ className = '' }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M5.5 2.5h6l3 3v12h-9z" />
      <path d="M8 14l2-2.5 1.5 1.5 2-3" />
    </Icon>
  );
}

/** Voice input, in the composer. */
export function MicIcon({ className = '' }: { className?: string }) {
  return (
    <Icon className={className}>
      <rect x="7.5" y="2.5" width="5" height="9.5" rx="2.5" />
      <path d="M4.5 9.5a5.5 5.5 0 0 0 11 0M10 15v2.5" />
    </Icon>
  );
}

/** A stack of frames — the pictures a scan kept of each screen. */
export function FramesIcon({ className = '' }: { className?: string }) {
  return (
    <Icon className={className}>
      <rect x="3" y="5.5" width="11" height="9" rx="1.5" />
      <path d="M6 3h9.5A1.5 1.5 0 0 1 17 4.5V12" />
    </Icon>
  );
}

/** A list of past passes. */
export function HistoryIcon({ className = '' }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M3.5 10a6.5 6.5 0 1 0 1.9-4.6M3.5 3.5v2.9h2.9" />
      <path d="M10 6.8v3.4l2.2 1.4" />
    </Icon>
  );
}
