/**
 * Where a whole-page scan spends its time.
 *
 * WHY THIS IS NOT `timing.ts`
 *
 * `timed()` measures a run against the per-stage budgets in ARCHITECTURE.md
 * Section 6, and warns when one is exceeded. Those budgets describe a single
 * pass over one screen, and a scan is not that: it scrolls a document, waits
 * for it to settle, and reads every screen with an OCR engine at twice native
 * resolution (DECISIONS.md 188, 212). Every stage of it would breach a run's
 * budget, every time, and a warning that always fires is a warning nobody
 * reads. Worse, it would imply the scan is failing a target it was never
 * given.
 *
 * So a scan is measured with no budgets at all. The question a scan has to
 * answer is not "was this fast enough" but "where did the time go" — which was
 * blank until now, and is the question any decision about scan speed depends
 * on.
 *
 * TOTALS ARE CUMULATIVE ACROSS STOPS, AND SAY HOW MANY
 *
 * A scan makes up to MAX_SCAN_STOPS looks and each one runs every stage, so a
 * stage total is a sum over stops and is meaningless without the count beside
 * it. Both are reported.
 *
 * UNACCOUNTED TIME IS REPORTED, NOT ABSORBED
 *
 * Shares are taken against measured wall-clock, not against the sum of the
 * stages, so anything the timer does not wrap shows up as a named remainder
 * rather than silently inflating whatever it sits next to. A profile that
 * accounts for 60% of the time and says so is useful; one that renormalises to
 * 100% is a fiction that reads like evidence.
 */

/**
 * The stages of one stop, in the order they happen, plus the painting pass
 * that runs once after the walk.
 *
 * `settle` is separated from `scroll` deliberately: the scroll is the page's
 * cost and the settle is a constant we chose (SCAN_SETTLE_MS). Conflating them
 * would hide the one number here that is ours to tune.
 */
export type ScanStage =
  | 'scroll'
  | 'settle'
  | 'capture'
  | 'domScan'
  | 'inference'
  | 'screenRead'
  | 'imageOcr'
  | 'proof';

const STAGE_LABEL: Record<ScanStage, string> = {
  scroll: 'scroll to stop',
  settle: 'settle',
  capture: 'screen capture',
  domScan: 'DOM scan',
  inference: 'face inference',
  screenRead: 'screen text',
  imageOcr: 'image OCR',
  proof: 'redacted record',
};

export interface ScanStageTotal {
  stage: ScanStage;
  label: string;
  /** Summed across every stop that ran this stage. */
  totalMs: number;
  /** How many times it ran. A total without this cannot be read. */
  calls: number;
  /** Share of measured wall-clock, not of the stage sum. */
  sharePct: number;
}

export interface ScanTimingSummary {
  stops: number;
  wallMs: number;
  /** The sum of every stage. Always ≤ wallMs. */
  measuredMs: number;
  /** wallMs − measuredMs. Time the timer did not wrap, named rather than hidden. */
  unaccountedMs: number;
  /** Heaviest first — the ordering the question "where did the time go" wants. */
  stages: ScanStageTotal[];
}

export interface ScanTimer {
  /** Run `work`, adding its duration to `stage`. Errors propagate, timed. */
  measure<T>(stage: ScanStage, work: () => Promise<T>): Promise<T>;
  /** Called once per completed stop, so totals can be read per stop. */
  countStop(): void;
  summarise(): ScanTimingSummary;
}

/**
 * `clock` is injectable so the accumulator can be tested without a browser and
 * without sleeping. Production passes nothing and gets `performance.now`.
 */
export function createScanTimer(clock: () => number = () => performance.now()): ScanTimer {
  const totals = new Map<ScanStage, { totalMs: number; calls: number }>();
  const startedAt = clock();
  let stops = 0;

  return {
    async measure<T>(stage: ScanStage, work: () => Promise<T>): Promise<T> {
      const start = clock();
      try {
        return await work();
      } finally {
        // In `finally`, so a stage that throws still reports what it spent.
        // A scan that stopped early is exactly when the profile is wanted.
        const entry = totals.get(stage) ?? { totalMs: 0, calls: 0 };
        entry.totalMs += clock() - start;
        entry.calls += 1;
        totals.set(stage, entry);
      }
    },

    countStop() {
      stops += 1;
    },

    summarise(): ScanTimingSummary {
      const wallMs = clock() - startedAt;
      let measuredMs = 0;
      for (const entry of totals.values()) measuredMs += entry.totalMs;

      const stages: ScanStageTotal[] = [...totals.entries()]
        .map(([stage, entry]) => ({
          stage,
          label: STAGE_LABEL[stage],
          totalMs: entry.totalMs,
          calls: entry.calls,
          sharePct: wallMs > 0 ? (entry.totalMs / wallMs) * 100 : 0,
        }))
        .sort((a, b) => b.totalMs - a.totalMs);

      return {
        stops,
        wallMs,
        measuredMs,
        // Clamped at zero: a clock that ticks backwards should not produce a
        // negative remainder that reads as a finding about the scan.
        unaccountedMs: Math.max(0, wallMs - measuredMs),
        stages,
      };
    },
  };
}

function seconds(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms.toFixed(0)}ms`;
}

/**
 * One console line per scan, heaviest stage first.
 *
 * Per-stop averages are given alongside the totals because the totals scale
 * with document height and the averages do not — comparing two pages needs the
 * second, and deciding what to optimise needs the first.
 */
export function formatScanTiming(summary: ScanTimingSummary): string {
  const head =
    `[shield] scan timing — ${seconds(summary.wallMs)} over ${summary.stops} stop(s)` +
    `${summary.stops > 0 ? `, ${seconds(summary.wallMs / summary.stops)}/stop` : ''}`;

  if (summary.stages.length === 0) return `${head}: nothing was measured`;

  const parts = summary.stages.map(
    (stage) =>
      `${stage.label} ${seconds(stage.totalMs)} (${stage.sharePct.toFixed(0)}%, ` +
      `${stage.calls}x, ${seconds(stage.totalMs / stage.calls)} each)`,
  );

  // Named, never folded into the stages. See the note at the top of the file.
  parts.push(`unaccounted ${seconds(summary.unaccountedMs)}`);

  return `${head}: ${parts.join(', ')}`;
}
