/**
 * The run, as it happens.
 *
 * Every agent people already know shows its steps while it works, and a panel
 * that only says "Done" leaves the one thing worth watching — what the AI chose
 * and what Shield kept from it — to the console. Each line comes from the
 * service worker and is written from the redacted view, so this can be on a
 * projector: the AI's choices appear here in the same labels it was shown.
 *
 * THE SHAPE
 *
 * The task, then the result, then the steps. The result sits above the steps
 * because it is what somebody glancing back at the panel wants, and the steps
 * are how they check it. Steps are a checklist on a rail: a tick for each one
 * finished, a turning ring for the one in progress. Coloured dots, one per
 * kind of line, made people ask what the colours meant, and they meant nothing
 * a reader needed.
 */

import type { ActivityEntry, ShieldState } from '../../lib/status';
import { STATUS_LABEL } from '../../lib/status';
import { isRunning } from './Masthead';
import { AgainIcon, AlertIcon, CheckIcon, InfoIcon } from './Mark';

const TONE = {
  done: { box: 'border-ok/30 bg-ok/10', icon: 'text-ok', Icon: CheckIcon },
  stop: { box: 'border-edge-lit bg-card', icon: 'text-dim', Icon: InfoIcon },
  error: { box: 'border-alarm/35 bg-alarm/10', icon: 'text-alarm', Icon: AlertIcon },
} as const;

function Step({ entry, last }: { entry: ActivityEntry; last: boolean }) {
  const acted = entry.kind === 'act';
  return (
    <li className="relative flex gap-3 pb-3 last:pb-0">
      {last ? null : (
        <span aria-hidden="true" className="bg-edge-lit absolute top-5 bottom-0 left-[7.5px] w-px" />
      )}
      <span
        aria-hidden="true"
        className={`mt-[1px] flex size-4 shrink-0 items-center justify-center rounded-full ${
          acted ? 'bg-ok/15 text-ok' : 'bg-card-raised text-dim'
        }`}
      >
        <CheckIcon className="size-3" />
      </span>
      <span className={`text-[13px] leading-snug ${acted ? 'text-bright' : 'text-dim'}`}>
        {entry.text}
      </span>
    </li>
  );
}

export function Activity({
  state,
  onRunAgain,
}: {
  state: ShieldState;
  onRunAgain: (task: string) => void;
}) {
  const running = isRunning(state.status) && state.status !== 'scanning';
  if (!state.taskQuery || (state.activity.length === 0 && !running)) return null;

  const ownWorkMs = state.timings
    .filter((timing) => timing.stage !== 'network')
    .reduce((sum, timing) => sum + timing.durationMs, 0);
  const tone = TONE[state.outcomeTone ?? (state.status === 'error' ? 'error' : 'done')];
  const task = state.taskQuery;

  return (
    <section aria-labelledby="run-title" aria-live="polite">
      <h1
        id="run-title"
        className="text-bright text-[15px] leading-snug font-semibold"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        {task}
      </h1>

      {state.outcome ? (
        <div className={`rounded-card mt-3 flex gap-2.5 border px-3.5 py-3 ${tone.box}`}>
          <tone.Icon className={`mt-[1px] size-4 shrink-0 ${tone.icon}`} />
          <p className="text-bright m-0 text-[13px] leading-snug">{state.outcome}</p>
        </div>
      ) : null}

      <ol className="mt-4">
        {state.activity.map((entry, index) => (
          <Step
            key={`${entry.at}-${entry.text}`}
            entry={entry}
            last={!running && index === state.activity.length - 1}
          />
        ))}
        {running ? (
          <li className="flex gap-3">
            <span
              aria-hidden="true"
              className="border-edge-lit border-t-bright mt-[1px] size-4 shrink-0 animate-spin rounded-full border-2"
            />
            <span className="text-bright text-[13px] leading-snug">
              {STATUS_LABEL[state.status]}…
            </span>
          </li>
        ) : null}
      </ol>

      {running ? null : (
        <div className="mt-3.5 flex items-center gap-3">
          <button
            type="button"
            onClick={() => onRunAgain(task)}
            className="text-dim hover:text-bright hover:bg-card rounded-control -ml-1.5 flex items-center gap-1.5 px-1.5 py-1 text-[12.5px] transition-colors duration-100"
          >
            <AgainIcon className="size-3.5" />
            Run again
          </button>
          {ownWorkMs > 0 ? (
            <span
              className="text-faint ml-auto text-[12px] tabular-nums"
              title="Reading, finding and hiding, on this laptop. The AI's reply time is not included."
            >
              {ownWorkMs.toFixed(0)} ms on this laptop
            </span>
          ) : null}
        </div>
      )}
    </section>
  );
}
