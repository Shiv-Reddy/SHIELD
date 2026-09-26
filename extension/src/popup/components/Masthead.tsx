/**
 * The header — mark, name, status, settings. One line.
 *
 * It used to carry a tracked-out capitalised wordmark, a tagline and a build
 * timestamp on three lines. The timestamp is still here, as the name's
 * tooltip: it answers "which build is this?" for whoever is debugging, without
 * sitting in front of everybody who is not.
 *
 * The status sits here because it is the most-changing thing in the interface,
 * and the step count joins it while a run is in flight, so progress has one
 * home instead of two.
 */

import type { ShieldStatus } from '../../lib/status';
import { SettingsIcon, ShieldMark } from './Mark';

/**
 * Statuses where the pipeline is mid-flight.
 *
 * Mirrors the set the orchestrator treats as busy. Kept as a literal rather
 * than imported from the module being replaced, so this component depends on
 * the status vocabulary and nothing else.
 */
const RUNNING: ReadonlySet<ShieldStatus> = new Set<ShieldStatus>([
  'reading',
  'detecting',
  'redacting',
  'sending',
  'thinking',
  'acting',
  'scanning',
]);

export function isRunning(status: ShieldStatus): boolean {
  return RUNNING.has(status);
}

function dotColour(status: ShieldStatus): string {
  if (status === 'error') return 'bg-alarm';
  if (status === 'awaiting-consent') return 'bg-warn';
  if (status === 'done') return 'bg-ok';
  if (RUNNING.has(status)) return 'bg-live animate-pulse';
  return 'bg-faint';
}

export function Masthead({
  status,
  label,
  step,
  build,
  onSettings,
}: {
  status: ShieldStatus;
  label: string;
  /** Shown while running, once there is more than one step to count. */
  step: number;
  build: string;
  onSettings: () => void;
}) {
  const running = RUNNING.has(status);
  // "Ready" says what idle means to the person using it; the internal word is
  // not theirs.
  const shown = status === 'idle' ? 'Ready' : label;

  return (
    <header className="relative flex shrink-0 items-center gap-2.5 px-4 py-3">
      <ShieldMark className="text-bright size-5.5" />
      <span
        className="text-bright text-[15px] leading-none font-semibold"
        style={{ fontFamily: 'var(--font-display)' }}
        title={`Build ${build}`}
      >
        Shield
      </span>

      <span className="ml-auto flex min-w-0 items-center gap-1.5" role="status">
        <span className={`size-1.5 shrink-0 rounded-full ${dotColour(status)}`} aria-hidden="true" />
        {/* Normal leading: `leading-none` with `truncate` clipped every
            descender, so "choosing a step" lost the bottom of its g and p. */}
        <span className="text-dim truncate text-[12.5px] leading-normal">
          {running && step > 1 ? <span className="text-faint">Step {step}: </span> : null}
          {shown}
        </span>
      </span>

      <button
        type="button"
        onClick={onSettings}
        aria-label="Settings"
        title="Settings"
        className="text-dim hover:text-bright hover:bg-card rounded-control -mr-1.5 p-1.5 transition-colors duration-100"
      >
        <SettingsIcon className="size-4.5" />
      </button>

      {/*
        A mark travelling the rule while the pipeline is live, absent the rest
        of the time. It answers "is anything happening" and nothing else.
      */}
      <div className="bg-edge absolute inset-x-0 bottom-0 h-px overflow-hidden" aria-hidden="true">
        {running ? <div className="shield-sweep bg-live h-px w-1/5" /> : null}
      </div>
    </header>
  );
}
