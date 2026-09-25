/**
 * The panel.
 *
 * THE SHAPE
 *
 * A header, a scrolling middle, and a dock pinned to the foot of the window
 * holding the totals and the composer. It is the shape of an assistant panel —
 * the place a person expects to type an instruction is the bottom edge, where
 * it stays however far the middle is scrolled.
 *
 * WHAT THE HERO IS
 *
 * The top of the middle is whatever Shield has hidden on this page, as bars
 * per category at real widths. Not a big number under a label — the default
 * treatment, and one that says nothing this product could not claim without
 * running. It is not boxed: it is the most important thing on screen, and a
 * box would make it one box among several. Before anything is found there are
 * no bars, because there is nothing to draw, and the space says what Shield
 * will do instead. An empty state is an invitation, not a shrug.
 *
 * WHAT IS BELOW IT, AND IN WHAT ORDER
 *
 * Three groups: what Shield can do to this page without being asked to act,
 * the evidence of what happened, and the one option a person might change. That
 * ordering is the product's own argument — protect the page, then check.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { INITIAL_STATE, STATUS_LABEL } from '../lib/status';
import type { ShieldState } from '../lib/status';
import { MSG } from '../lib/messages';
import { Masthead, isRunning } from './components/Masthead';
import { Group, KeyButton, Row } from './components/Sheet';
import { Voice } from './components/Voice';

const VOICE_ENABLED = false;
import { ArrowUpIcon, ClockIcon, OpenIcon, ReceiptIcon, ReportIcon, StopIcon } from './components/Mark';
import { ScanRows } from './components/ScanCard';
import { Redactions, type Redaction } from './components/Redactions';
import { AskFirstSwitch, MarkRows } from './components/Protect';
import { Audit } from './components/Audit';
import { Totals } from './components/Totals';
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
    // broadcast that follows is what the interface renders.
    return undefined;
  }
}

/** A line of text that needs noticing: an error, or a slower path in use. */
function Notice({
  tone,
  children,
}: {
  tone: 'alarm' | 'warn';
  children: React.ReactNode;
}) {
  return (
    <div
      role={tone === 'alarm' ? 'alert' : 'status'}
      className={`rounded-card border px-3.5 py-3 text-[12.5px] leading-snug ${
        tone === 'alarm' ? 'border-alarm/35 bg-alarm/10' : 'border-warn/30 bg-warn/10'
      }`}
    >
      {children}
    </div>
  );
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
        // Reopened mid-run with an empty box and a run in flight reads as "it
        // forgot what I asked". The worker still knows, so the box is refilled
        // from it — but only when empty, or this would overwrite what the user
        // is in the middle of typing.
        const asked = message.state.taskQuery;
        if (asked) setTask((current) => current || asked);
      }
    };
    chrome.runtime.onMessage.addListener(listen);

    // Read rather than assumed, so a pinned backend is visible instead of being
    // a setting somebody left on weeks ago.
    void readSettings().then((settings) => setForcedBackend(settings.forceBackend));

    // Fired the instant the panel opens, before a character is typed. Loading
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

  // One entry point for typed and spoken tasks, so a voice run is the same run.
  const start = useCallback((query: string) => {
    if (!query) return;
    setProblem(null);
    // Painted immediately so the control cannot be pressed twice while the
    // worker spins up. The broadcast that follows replaces it.
    setState({ ...INITIAL_STATE, status: 'reading', taskQuery: query });
    void toWorker({ type: MSG.RUN_TASK, taskQuery: query });
  }, []);

  const run = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      start(task.trim());
    },
    [task, start],
  );

  const [listening, setListening] = useState(false);

  // Stable, because the voice control subscribes to messages with these and
  // would otherwise resubscribe on every render.
  const heardTask = useCallback(
    (text: string) => {
      setTask(text);
      start(text);
    },
    [start],
  );
  const listeningChanged = useCallback((now: boolean) => {
    setListening(now);
    if (now) {
      setProblem(null);
      setTask('');
    }
  }, []);

  const stop = useCallback(() => {
    void toWorker({ type: MSG.CANCEL_TASK });
    setState(INITIAL_STATE);
  }, []);

  /**
   * Release a pinned inference backend.
   *
   * Pinning lives on the Settings page now, beside the other inference
   * controls; the panel only says when it is in force and offers the way back,
   * because an override you cannot see is how a slow reading gets mistaken for
   * the real hardware. The loaded model is cached by the host, so the release
   * does not take hold until that session is replaced — which is what
   * RESTART_BACKEND is for.
   */
  const releaseBackend = useCallback(() => {
    void (async () => {
      await setForceBackend(null);
      setForcedBackend(null);
      await toWorker({ type: MSG.RESTART_BACKEND });
    })();
  }, []);

  const scan = state.scan;

  return (
    // Full height with the dock pinned to the foot: 600px in a popup, which is
    // the most Chrome allows, and the whole window in the side panel.
    <div className="bg-void text-bright shield-reveal shell flex flex-col">
      <Masthead
        status={state.status}
        label={STATUS_LABEL[state.status]}
        step={state.step}
        build={__SHIELD_BUILD__}
        onSettings={() => void chrome.runtime.openOptionsPage?.()}
      />

      <main className="panel-scroll min-h-0 flex-1 space-y-6 overflow-y-auto px-4 pt-5 pb-6">
        {/*
          First, above everything: this is the one thing on screen with a run
          waiting on it, and anything above it would be something to scroll
          past while a payload sits held.
        */}
        {consent ? <Consent request={consent} onDecided={() => setConsent(null)} /> : null}

        {state.errorMessage || problem ? (
          <Notice tone="alarm">{state.errorMessage ?? problem}</Notice>
        ) : null}

        {/*
          PRD.md Section 20 requires the fallback to be automatic AND for the
          user to be told things may be slower. A silent 10x slowdown looks
          like a bug. This is a notice, not an error — it reports a working
          system on its slower path.
        */}
        {state.fellBack ? (
          <Notice tone="warn">
            Graphics acceleration isn't available, so Shield is running on the CPU. Everything
            still works, just more slowly.
          </Notice>
        ) : null}

        {forcedBackend ? (
          <Notice tone="warn">
            Shield is pinned to {forcedBackend === 'wasm' ? 'the CPU' : forcedBackend} in Settings.{' '}
            <button
              type="button"
              onClick={releaseBackend}
              className="text-bright underline underline-offset-2"
            >
              Use automatic
            </button>
          </Notice>
        ) : null}

        <section aria-labelledby="hero-title">
          <div className="flex items-baseline justify-between gap-3">
            <h1
              id="hero-title"
              className="text-bright text-[17px] leading-tight font-semibold"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {hidden.length > 0 ? 'Hidden on this page' : 'Nothing hidden yet'}
            </h1>
            {hidden.length > 0 ? (
              <span className="text-faint shrink-0 text-[12.5px] tabular-nums">
                {totalHidden} item{totalHidden === 1 ? '' : 's'}
              </span>
            ) : null}
          </div>

          {hidden.length > 0 ? (
            <div className="mt-4">
              <Redactions items={hidden} />
            </div>
          ) : (
            <p className="text-dim mt-2 text-[13px] leading-relaxed">
              Shield reads this page on your device and covers anything private before the
              assistant sees it. Nothing private leaves your computer.
            </p>
          )}

          {scan ? (
            <p
              className={`mt-4 text-[12px] leading-snug ${scan.truncated ? 'text-warn' : 'text-faint'}`}
            >
              {scan.truncated
                ? `The scan stopped after ${scan.stops} screens, before the end of the page. What it found is hidden on every run.`
                : `Found by scanning ${scan.stops} screen${scan.stops === 1 ? '' : 's'}. Hidden on every run.`}
            </p>
          ) : null}

          {state.coverage ? (
            <p className="text-faint mt-2 text-[12px] leading-snug">{state.coverage.message}</p>
          ) : null}
        </section>

        <Group label="This page">
          <ScanRows
            state={state}
            busy={running}
            onScan={() => void toWorker({ type: MSG.SCAN_PAGE })}
            onClear={() => void toWorker({ type: MSG.CLEAR_SCAN })}
          />
          <MarkRows onProblem={setProblem} />
        </Group>

        <Group label="Check what happened">
          <Row
            icon={<ReceiptIcon className="size-4" />}
            title="What was sent"
            detail={state.timings.length > 0 ? 'Last run' : 'Nothing yet'}
            trailing={<OpenIcon className="size-3.5" />}
            onClick={() => void chrome.tabs.create({ url: 'sent/sent.html' })}
          />
          <Row
            icon={<ClockIcon className="size-4" />}
            title="Where the time went"
            detail={state.timings.length > 0 ? `${measuredMs.toFixed(0)} ms` : undefined}
            trailing={<OpenIcon className="size-3.5" />}
            onClick={() => void chrome.tabs.create({ url: 'sent/sent.html#timing' })}
            disabled={state.timings.length === 0}
          />
          <Audit />
          <Row
            icon={<ReportIcon className="size-4" />}
            title="Compliance report"
            trailing={<OpenIcon className="size-3.5" />}
            onClick={() => void chrome.tabs.create({ url: chrome.runtime.getURL('report/report.html') })}
          />
        </Group>

        <Group label="Options">
          <AskFirstSwitch />
        </Group>

        {/*
          Compiled out entirely unless the build asked for it. The define makes
          this `false ? … : null`, the bundler drops the branch and with it the
          import above, and `tools/check-dev-gate.mjs` confirms after every
          build that it really did — see CorpusCapture.tsx for why that is
          checked rather than trusted.
        */}
        {__SHIELD_DEV__ ? <CorpusCapture /> : null}
      </main>

      <footer className="border-edge shrink-0 space-y-3.5 border-t px-4 pt-3.5 pb-4">
        <Totals />

        <form
          onSubmit={run}
          className="bg-card border-edge focus-within:border-dim/60 flex items-center gap-2 rounded-[14px] border py-1.5 pr-1.5 pl-3.5 transition-colors duration-100"
        >
          <label htmlFor="task" className="sr-only">
            What should Shield do on this page?
          </label>
          <input
            id="task"
            ref={taskBox}
            value={task}
            onChange={(event) => setTask(event.target.value)}
            disabled={running}
            placeholder={listening ? 'Listening…' : 'Tell Shield what to do on this page'}
            autoComplete="off"
            className="text-bright placeholder:text-faint min-w-0 flex-1 bg-transparent py-1.5 text-[13.5px] outline-none focus-visible:outline-none disabled:opacity-60"
          />

          {/*
            Voice is off for the event round: the microphone would not start on
            the demo laptop even with every permission allowed (DECISIONS.md
            290). A control that fails on stage is worse than none. Flip
            VOICE_ENABLED to bring it back.
          */}
          {running || !VOICE_ENABLED ? null : (
            <Voice
              disabled={running}
              onFinished={heardTask}
              onListeningChange={listeningChanged}
            />
          )}

          {running ? (
            <button
              type="button"
              onClick={stop}
              aria-label="Stop"
              title="Stop"
              className="bg-card-raised text-bright hover:bg-edge-lit flex size-8 shrink-0 items-center justify-center rounded-full transition-colors duration-100"
            >
              <StopIcon className="size-4" />
            </button>
          ) : (
            <KeyButton
              type="submit"
              shape="round"
              label="Run task"
              disabled={task.trim().length === 0}
            >
              <ArrowUpIcon className="size-4" />
            </KeyButton>
          )}
        </form>
      </footer>
    </div>
  );
}

/**
 * What to draw bars for.
 *
 * The scan's category counts, because that is the only per-category tally the
 * panel receives — a run reports timings and coverage but not a breakdown.
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
