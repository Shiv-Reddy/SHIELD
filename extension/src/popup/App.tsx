/**
 * The popup.
 *
 * WHAT THE HERO IS
 *
 * The first card is whatever Shield most recently protected — the bars, per
 * category, at real widths, with the count as the figure beside them. Not a
 * big number under a label, which is the default treatment and says nothing
 * this product could not have claimed without running. Before anything has
 * run there are no bars, because there is nothing to draw, and the space says
 * what will happen instead. An empty state is an invitation, not a shrug.
 *
 * WHAT IS BELOW IT, AND IN WHAT ORDER
 *
 * The task box with the one gradient control, then the things that need no
 * task at all — scanning the whole page — then the evidence. That ordering is
 * the product's own argument: act, or look without acting, and then check what
 * actually happened.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { INITIAL_STATE, STATUS_LABEL } from '../lib/status';
import type { ShieldState } from '../lib/status';
import { MSG } from '../lib/messages';
import { Masthead, isRunning } from './components/Masthead';
import { Card, GhostButton, KeyButton, Row, Title } from './components/Sheet';
import { ClockIcon, ReceiptIcon, ScanIcon } from './components/Mark';
import { Redactions, type Redaction } from './components/Redactions';
import { Protect } from './components/Protect';

declare const __SHIELD_BUILD__: string;

async function toWorker<T = unknown>(message: object): Promise<T | undefined> {
  try {
    return (await chrome.runtime.sendMessage(message)) as T;
  } catch {
    // A sleeping worker is ordinary, not an error worth showing. The state
    // broadcast that follows is what the interface actually renders.
    return undefined;
  }
}

export function App() {
  const [state, setState] = useState<ShieldState>(INITIAL_STATE);
  const [task, setTask] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const taskBox = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const listen = (message: { type?: string; state?: ShieldState }) => {
      if (message?.type === MSG.STATE_CHANGED && message.state) setState(message.state);
    };
    chrome.runtime.onMessage.addListener(listen);

    // Fired the instant the popup opens, before a character is typed. Loading
    // the model takes about a second and typing a task takes several; doing
    // them concurrently makes that second disappear.
    void toWorker({ type: MSG.PREPARE });

    void (async () => {
      const current = await toWorker<ShieldState>({ type: MSG.GET_STATE });
      if (current) setState(current);
      if (!current || !isRunning(current.status)) taskBox.current?.focus();
    })();

    return () => chrome.runtime.onMessage.removeListener(listen);
  }, []);

  const running = isRunning(state.status);
  const hidden = summariseScan(state);
  const totalHidden = hidden.reduce((sum, item) => sum + item.count, 0);
  const measuredMs = state.timings.reduce((sum, timing) => sum + timing.durationMs, 0);

  const run = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      const query = task.trim();
      if (!query) return;
      // Painted immediately so the control cannot be pressed twice while the
      // worker spins up. The broadcast that follows replaces it.
      setState({ ...INITIAL_STATE, status: 'reading', taskQuery: query });
      void toWorker({ type: MSG.RUN_TASK, taskQuery: query });
    },
    [task],
  );

  return (
    <div className="bg-void text-bright">
      <Masthead
        status={state.status}
        label={STATUS_LABEL[state.status]}
        build={__SHIELD_BUILD__}
        onSettings={() => void chrome.runtime.openOptionsPage?.()}
      />

      <div className="space-y-3 px-3.5 py-3.5">
        <Card tab={hidden.length > 0 ? `${totalHidden} hidden` : undefined} live={running}>
          {hidden.length > 0 ? (
            <>
              <Title aside="never transmitted">Covered on this page</Title>
              <Redactions items={hidden} />
            </>
          ) : (
            <p className="text-dim text-[13px] leading-snug">
              Shield reads this page on your device, covers anything private,
              and only then asks the assistant what to do.{' '}
              <span className="text-bright">Nothing private leaves.</span>
            </p>
          )}

          {state.coverage ? (
            <p className="text-faint border-edge mt-3 border-t pt-2.5 text-[11px] leading-snug">
              {state.coverage.message}
            </p>
          ) : null}
        </Card>

        {state.errorMessage || problem ? (
          <div className="border-alarm/40 bg-alarm/10 rounded-card border px-3.5 py-2.5">
            <p className="text-[12px] leading-snug">{state.errorMessage ?? problem}</p>
          </div>
        ) : null}

        <Card>
          <form onSubmit={run}>
            <label htmlFor="task" className="sr-only">
              What should Shield do on this page?
            </label>
            <input
              id="task"
              ref={taskBox}
              value={task}
              onChange={(event) => setTask(event.target.value)}
              disabled={running}
              placeholder="Log in with my saved details"
              className="bg-card-raised border-edge text-bright placeholder:text-faint focus:border-live rounded-control w-full border px-3 py-2.5 text-[13px] outline-none disabled:opacity-50"
            />

            <div className="mt-2.5 flex items-center gap-2">
              <KeyButton type="submit" disabled={running || task.trim().length === 0}>
                {running ? 'Working' : 'Run task'}
              </KeyButton>

              {running ? (
                <GhostButton
                  onClick={() => {
                    void toWorker({ type: MSG.CANCEL_TASK });
                    setState(INITIAL_STATE);
                  }}
                >
                  Stop
                </GhostButton>
              ) : null}

              {state.step > 1 ? (
                <span className="text-faint ml-auto text-[11px] tabular-nums">
                  step {state.step}
                </span>
              ) : null}
            </div>
          </form>
        </Card>

        <Card tab={state.scan ? `${state.scan.total} found` : undefined}>
          <Title>Without sending anything</Title>
          <Row
            icon={<ScanIcon className="size-4" />}
            title="Scan the whole page"
            detail={state.scanProgress ? undefined : 'every screen, top to bottom'}
            onClick={() => void toWorker({ type: MSG.SCAN_PAGE })}
            disabled={running}
          />
          {state.scanProgress ? (
            <p className="text-faint mt-1 px-2 text-[11px] tabular-nums">
              screen {state.scanProgress.stop} of {state.scanProgress.total}
            </p>
          ) : null}

          {state.scan ? (
            <div className="mt-2.5 flex gap-2">
              {/*
                The scan record: a redacted picture of every screen examined,
                kept locally. It is the only surface that proves a scan
                happened rather than reporting that it did.
              */}
              <GhostButton onClick={() => void chrome.tabs.create({ url: 'proof/proof.html' })}>
                See what it looked at
              </GhostButton>
              <GhostButton onClick={() => void toWorker({ type: MSG.CLEAR_SCAN })}>
                Clear
              </GhostButton>
            </div>
          ) : null}
        </Card>

        <Protect onProblem={setProblem} />

        <Card>
          <Title>Check what happened</Title>
          <Row
            icon={<ReceiptIcon className="size-4" />}
            title="What was sent"
            detail={state.timings.length > 0 ? 'last run' : 'nothing yet'}
            onClick={() => void chrome.tabs.create({ url: 'sent/sent.html' })}
          />
          <Row
            icon={<ClockIcon className="size-4" />}
            title="Where the time went"
            detail={state.timings.length > 0 ? `${measuredMs.toFixed(0)}ms` : undefined}
            onClick={() => void chrome.tabs.create({ url: 'sent/sent.html#timing' })}
            disabled={state.timings.length === 0}
          />
        </Card>
      </div>
    </div>
  );
}

/**
 * What to draw bars for.
 *
 * The scan's category counts, because that is the only per-category tally the
 * popup receives — a run reports timings and coverage but not a breakdown.
 * When a run has happened and no scan has, there is nothing to draw, and a
 * single undifferentiated bar for "some things were hidden" would be exactly
 * the decorative rectangle the bars exist not to be.
 */
function summariseScan(state: ShieldState): Redaction[] {
  if (!state.scan) return [];
  return state.scan.counts
    .filter((entry) => entry.count > 0)
    .map((entry) => ({ category: entry.category as string, count: entry.count }))
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));
}
