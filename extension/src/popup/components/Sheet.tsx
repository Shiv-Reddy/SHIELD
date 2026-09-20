/**
 * The structural pieces, following the reference.
 *
 * Cards are one step lighter than the panel with a hairline edge, and there
 * are no shadows anywhere — the reference separates by value and line, which
 * is what keeps a dark interface from turning muddy. Radii step down with
 * nesting: window, then card, then the controls inside it.
 */

import type { ReactNode } from 'react';

/**
 * A card, optionally with a tab protruding from its top edge and a violet
 * stripe down its leading edge.
 *
 * The tab is the detail that makes the reference recognisable, and it is the
 * easiest one to leave out: it sits half outside the card, which means nothing
 * in this tree may clip its overflow. `live` draws the stripe that marks the
 * item something is currently happening to.
 */
export function Card({
  children,
  tab,
  live = false,
  className = '',
}: {
  children: ReactNode;
  tab?: ReactNode;
  live?: boolean;
  className?: string;
}) {
  return (
    <div className={`relative ${tab ? 'mt-3' : ''} ${className}`}>
      {tab ? (
        <div className="absolute -top-2.5 right-3 z-10">
          <span className="tab-out text-dim block px-2.5 py-1 text-[11px] leading-none">
            {tab}
          </span>
        </div>
      ) : null}

      <div
        className={`bg-card border-edge rounded-card relative border px-3.5 py-3 ${
          live ? 'pl-4' : ''
        }`}
      >
        {live ? (
          <span
            className="bg-live absolute top-3 bottom-3 left-0 w-[3px] rounded-r-full"
            aria-hidden="true"
          />
        ) : null}
        {children}
      </div>
    </div>
  );
}

/**
 * A section heading.
 *
 * Sentence case, no tracked-out capitals. An all-caps eyebrow above every
 * section makes a label shout at the content it is meant to be quietly
 * organising, and the reference does not use them either.
 */
export function Title({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-2 flex items-baseline justify-between">
      <h2 className="text-dim text-[12px] leading-none">{children}</h2>
      {aside ? <span className="text-faint text-[11px] leading-none">{aside}</span> : null}
    </div>
  );
}

/**
 * The primary action. One per view, and the only saturated thing on screen.
 *
 * `key-fill` owns the gradient so that retuning it is a one-place change —
 * a Tailwind arbitrary gradient repeated at two call sites is how an interface
 * acquires two slightly different accents without anybody deciding to.
 */
export function KeyButton({
  children,
  onClick,
  disabled = false,
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean | undefined;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="key-fill rounded-pill px-4 py-2 text-[13px] font-semibold disabled:cursor-not-allowed"
    >
      {children}
    </button>
  );
}

/** A quiet control — outlined, for anything that is not the primary action. */
export function GhostButton({
  children,
  onClick,
  disabled = false,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean | undefined;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="border-edge text-dim hover:border-edge-lit hover:text-bright rounded-pill border px-3.5 py-2 text-[13px] disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

/**
 * A row inside a card that behaves as a button.
 *
 * No trailing arrow: a '→' appended to every actionable label is decoration
 * pretending to be affordance, and the row already reads as pressable from its
 * icon, its hover and its focus ring.
 */
export function Row({
  icon,
  title,
  detail,
  onClick,
  disabled = false,
}: {
  icon: ReactNode;
  title: string;
  detail?: string | undefined;
  onClick: () => void;
  disabled?: boolean | undefined;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="hover:bg-card-raised rounded-control -mx-2 flex w-[calc(100%+1rem)] items-center gap-2.5 px-2 py-2 text-left disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
    >
      <span className="text-faint shrink-0">{icon}</span>
      <span className="text-bright text-[13px]">{title}</span>
      {detail ? <span className="text-faint ml-auto text-[11px]">{detail}</span> : null}
    </button>
  );
}
