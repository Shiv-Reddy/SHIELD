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
import { ClockIcon, ReceiptIcon } from './components/Mark';
import { ScanCard } from './components/ScanCard';
import { Redactions, type Redaction } from './components/Redactions';
import { Protect } from './components/Protect';
import { Audit } from './components/Audit';
import { Consent } from './components/Consent';
import type { ConsentRequest } from '../lib/consent';
import { CorpusCapture } from './components/CorpusCapture';
import { readSettings, setForceBackend, type ExecutionBackend } from '../lib/settings';

// Both build-time constants are declared once, in src/env.d.ts. Redeclaring
// __SHIELD_DEV__ here would put a second mention of it in this file, and
// "exactly one use of the dev flag" is a property tests/dev-gate.test.ts
// checks — a second one is how "hidden but present" came back the first time.

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
  const [forcedBackend, setForcedBackend] = useState<ExecutionBackend | null>(null);
  const [consent, setConsent] = useState<ConsentRequest | null>(null);
  const taskBox = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const listen = (message: {
      type?: string;
      state?: ShieldState;
      request?: ConsentRequest;
    }) => {
      if (message?.type === MSG.CONSENT_REQUESTED && message.request) {
        setConsent(message.request);
        return;
      }
      if (message?.type === MSG.STATE_CHANGED && message.state) {
        // The card belongs to one payload. Once the run has moved off the
        // pause — approved, refused, timed out or abandoned — it is stale, and
        // a card left on screen would invite a click that authorises nothing.
        if (message.state.status !== 'awaiting-consent') setConsent(null);
        setState(message.state);
        // A popup reopened mid-run has an empty box and a run in flight, which
        // reads as "it forgot what I asked". The worker still knows, so the
        // box is refilled from it — but only when empty, or this would
        // overwrite what the user is in the middle of typing.
        const asked = message.state.taskQuery;
        if (asked) setTask((current) => current || asked);
      }
    };
    chrome.runtime.onMessage.addListener(listen);

    // Read rather than assumed, so a pinned backend is visible on the build
    // line instead of being a setting somebody left on weeks ago.
    void readSettings().then((settings) => setForcedBackend(settings.forceBackend));

    // Fired the instant the popup opens, before a character is typed. Loading
    // the model takes about a second and typing a task takes several; doing
    // them concurrently makes that second disappear.
    void toWorker({ type: MSG.PREPARE });

    void (async () => {
      const current = await toWorker<ShieldState>({ type: MSG.GET_STATE });
      if (current) {
        setState(current);
        if (current.taskQuery) setTask((task) => task || current.taskQuery || '');
      }
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

  /**
   * Pin inference to the CPU, or release it.
   *
   * The loaded model is cached by the host, so the override does not take hold
   * until that session is replaced — which is what RESTART_BACKEND is for. A
   * version of this that only wrote the setting would appear to work and
   * change nothing until the next reload.
   */
  const cycleBackend = useCallback(() => {
    void (async () => {
      const next: ExecutionBackend | null = forcedBackend === 'wasm' ? null : 'wasm';
      await setForceBackend(next);
      setForcedBackend(next);
      await toWorker({ type: MSG.RESTART_BACKEND });
    })();
  }, [forcedBackend]);

  return (
    <div className="bg-void text-bright">
      <Masthead
        status={state.status}
        label={STATUS_LABEL[state.status]}
        build={__SHIELD_BUILD__}
        forcedBackend={forcedBackend}
        onCycleBackend={cycleBackend}
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

        {/*
          Directly under the hero, above the task box: this is the one thing on
          screen with a run waiting on it, and anything between it and the top
          would be something to scroll past while a payload sits held.
        */}
        {consent ? <Consent request={consent} onDecided={() => setConsent(null)} /> : null}

        {state.errorMessage || problem ? (
          <div className="border-alarm/40 bg-alarm/10 rounded-card border px-3.5 py-2.5">
            <p className="text-[12px] leading-snug">{state.errorMessage ?? problem}</p>
          </div>
        ) : null}

        {/*
          PRD.md Section 20 requires the fallback to be automatic AND for the
          user to be told things may be slower. A silent 10x slowdown looks
          like a bug, and the trust story depends on Shield never being quietly
          worse than it claims. This is a notice, not an error — it reports a
          working system running on its slower path.
        */}
        {state.fellBack ? (
          <div className="border-warn/35 bg-warn/10 rounded-card border px-3.5 py-2.5">
            <p className="text-[12px] leading-snug">
              This computer's graphics acceleration isn't available to Shield, so
              it's running on the CPU. Everything still works — it will just be
              slower.
            </p>
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

        <ScanCard
          state={state}
          busy={running}
          onScan={() => void toWorker({ type: MSG.SCAN_PAGE })}
          onClear={() => void toWorker({ type: MSG.CLEAR_SCAN })}
        />

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

        <Audit />

        {/*
          Compiled out entirely unless the build asked for it. The define makes
          this `false ? … : null`, the bundler drops the branch and with it the
          import above, and `tools/check-dev-gate.mjs` confirms after every
          build that it really did — see CorpusCapture.tsx for why that is
          checked rather than trusted.
        */}
        {__SHIELD_DEV__ ? <CorpusCapture /> : null}
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
