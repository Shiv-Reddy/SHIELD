/**
 * The structural pieces.
 *
 * Three kinds of surface, and the difference between them is the hierarchy:
 *
 *   - Nothing at all, for the hero. It is the one thing on screen that matters
 *     most, and a box around it would make it one box among several.
 *   - A Group, for lists of things to do: one surface, rows divided by
 *     hairlines. The idiom of a platform settings screen, chosen because
 *     people already know how to read it.
 *   - A Card, for something that is not part of the product's ordinary flow —
 *     a decision waiting on the user, or the development-build capture panel.
 *     Being unlike the groups is the point.
 *
 * No shadows anywhere. Surfaces are separated by value and hairline.
 */

import { useState, type ReactNode } from 'react';
import { ChevronIcon } from './Mark';

/**
 * A list of rows on one surface.
 *
 * The label sits outside and above, small and grey, the way a settings screen
 * names a group. It is optional: a group whose rows name themselves does not
 * need a heading repeating them.
 */
export function Group({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <section>
      {label ? <h2 className="text-faint mb-1.5 px-1 text-[12px] leading-none">{label}</h2> : null}
      <div className="bg-card rounded-card divide-edge divide-y overflow-hidden">{children}</div>
    </section>
  );
}

/**
 * A row that does something.
 *
 * `trailing` says what kind of thing: a chevron opens something in place, the
 * outward arrow opens a tab. Nothing is drawn by default — a row that runs an
 * action in place is already obviously pressable from its hover and focus.
 * `tone="quiet"` is for secondary actions that belong to the row above, such
 * as clearing what that row produced.
 */
export function Row({
  icon,
  title,
  detail,
  trailing,
  onClick,
  disabled = false,
  tone = 'normal',
  expanded,
  indent = false,
  aside,
}: {
  icon?: ReactNode;
  title: string;
  detail?: ReactNode;
  trailing?: ReactNode;
  onClick: () => void;
  disabled?: boolean | undefined;
  tone?: 'normal' | 'quiet' | 'warn';
  expanded?: boolean;
  /**
   * Leave the icon's space empty, so a row with no icon of its own — "clear
   * what the row above made" — lines its words up with that row's.
   */
  indent?: boolean;
  /**
   * A small second action at the row's right edge — "Clear" beside what the
   * row produced. It used to be a whole row of its own, which made a group of
   * two things five rows long.
   */
  aside?: { label: string; onClick: () => void; disabled?: boolean; describe?: string } | undefined;
}) {
  const titleColour =
    tone === 'quiet' ? 'text-dim' : tone === 'warn' ? 'text-warn' : 'text-bright';

  const main = (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-expanded={expanded}
      className={`hover:bg-card-raised flex min-w-0 items-center gap-3 px-3.5 py-3 text-left transition-colors duration-100 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent ${
        aside ? 'flex-1 pr-2' : 'w-full'
      }`}
    >
      {icon ? (
        <span className="text-dim shrink-0">{icon}</span>
      ) : indent ? (
        <span className="w-4 shrink-0" aria-hidden="true" />
      ) : null}
      <span className={`${titleColour} min-w-0 flex-1 truncate text-[13.5px]`}>{title}</span>
      {detail ? (
        <span className="text-faint shrink-0 text-[12px] tabular-nums">{detail}</span>
      ) : null}
      {trailing ? <span className="text-faint shrink-0">{trailing}</span> : null}
    </button>
  );

  if (!aside) return main;

  return (
    <div className="flex items-stretch">
      {main}
      <button
        type="button"
        onClick={aside.onClick}
        disabled={aside.disabled}
        aria-label={aside.describe ?? aside.label}
        className="text-dim hover:text-bright hover:bg-card-raised shrink-0 px-3.5 text-[12.5px] transition-colors duration-100 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {aside.label}
      </button>
    </div>
  );
}

/**
 * An on/off setting, drawn as a switch rather than a checkbox.
 *
 * A native checkbox renders as a white square on this ground and looks like a
 * form from a different product. The switch is a real `role="switch"` button,
 * so it announces its state and is operated by keyboard like any other.
 */
export function SwitchRow({
  title,
  description,
  checked,
  onChange,
  locked = false,
}: {
  title: string;
  description?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Held on by someone else — the organisation — and shown so, not hidden. */
  locked?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-disabled={locked}
      onClick={() => (locked ? undefined : onChange(!checked))}
      className={`flex w-full items-start gap-3 px-3.5 py-3 text-left transition-colors duration-100 ${
        locked ? 'cursor-default' : 'hover:bg-card-raised'
      }`}
    >
      <span className="min-w-0 flex-1">
        <span className="text-bright block text-[13.5px] leading-snug">{title}</span>
        {description ? (
          <span className="text-faint mt-0.5 block text-[12px] leading-snug">{description}</span>
        ) : null}
      </span>
      <span
        aria-hidden="true"
        className={`relative mt-0.5 h-[18px] w-[30px] shrink-0 rounded-full transition-colors duration-150 ${
          checked ? 'bg-bright' : 'bg-card-raised ring-edge-lit ring-1 ring-inset'
        } ${locked ? 'opacity-50' : ''}`}
      >
        <span
          className={`absolute top-[3px] size-3 rounded-full transition-[left] duration-150 ${
            checked ? 'bg-void left-[15px]' : 'bg-dim left-[3px]'
          }`}
        />
      </span>
    </button>
  );
}

/**
 * A surface for something outside the ordinary flow.
 *
 * `caution` draws a dashed amber edge, used by exactly one card — the
 * development-build capture panel, which can write real field values to disk.
 */
export function Card({
  children,
  caution = false,
  className = '',
}: {
  children: ReactNode;
  caution?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`bg-card rounded-card border px-3.5 py-3 ${
        caution ? 'border-warn/40 border-dashed' : 'border-edge-lit'
      } ${className}`}
    >
      {children}
    </div>
  );
}

/** A heading inside a Card. Brighter than what is under it, never dimmer. */
export function Title({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-3">
      <h2 className="text-bright text-[13.5px] leading-tight font-semibold">{children}</h2>
      {aside ? <span className="text-faint text-[12px] leading-tight">{aside}</span> : null}
    </div>
  );
}

/**
 * The primary action: white, like the logo. One per view.
 *
 * A solid white control on a graphite ground is the whole of the emphasis this
 * interface allows itself. It is not repeated anywhere else.
 */
export function KeyButton({
  children,
  onClick,
  disabled = false,
  type = 'button',
  label,
  shape = 'pill',
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean | undefined;
  type?: 'button' | 'submit';
  /** Required when the button shows an icon rather than words. */
  label?: string;
  shape?: 'pill' | 'round';
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`bg-bright text-void disabled:bg-card-raised disabled:text-faint flex shrink-0 items-center justify-center font-semibold disabled:cursor-not-allowed ${
        shape === 'round' ? 'size-8 rounded-full' : 'rounded-pill px-4 py-2 text-[13px]'
      }`}
    >
      {children}
    </button>
  );
}

/** A quiet control, for anything that is not the primary action. */
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
      className="border-edge-lit text-bright hover:bg-card-raised rounded-control border px-3 py-1.5 text-[12.5px] transition-colors duration-100 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

/**
 * A section that opens, for use inside a Card.
 *
 * Opening is what triggers any work behind it, rather than mounting, and
 * `onOpenChange` is how a panel learns it was closed.
 */
export function Disclosure({
  label,
  openLabel,
  onOpenChange,
  children,
}: {
  label: string;
  openLabel: string;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          const next = !open;
          setOpen(next);
          onOpenChange?.(next);
        }}
        className="hover:text-bright text-dim flex w-full items-center gap-2 py-1 text-left text-[12.5px]"
      >
        <span>{open ? openLabel : label}</span>
        <ChevronIcon className={`ml-auto size-3.5 shrink-0 ${open ? 'rotate-90' : ''}`} />
      </button>
      {open ? <div className="mt-2">{children}</div> : null}
    </>
  );
}
