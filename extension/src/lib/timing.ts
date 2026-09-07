/**
 * Stage timing against the latency budget in ARCHITECTURE.md Section 6.
 *
 * End-to-end latency is 15% of the evaluation score, and the way that score
 * gets lost is not one catastrophic stall but a stage quietly drifting over
 * budget across many commits until nobody remembers when it was fast. Timing
 * every stage from the start, with the budget written down next to the
 * measurement, makes that drift visible the moment it happens.
 */

/**
 * Per-stage targets, copied from ARCHITECTURE.md Section 6.
 *
 * `domScan` is the one addition. Section 6's table has a single "Screen
 * capture < 100ms" line, but Screen Perception is really two independent pieces
 * of work — the screenshot and the DOM walk — with completely different
 * performance characteristics and completely different fixes when they get
 * slow. Tracking them separately is the only way to know which one to attack.
 * The pair should still add up to roughly the Section 6 budget.
 */
export const LATENCY_BUDGET_MS = {
  capture: 100,
  domScan: 100,
  /**
   * Building the ONNX session, which compiles a 26MB WASM module. Paid once per
   * offscreen document rather than per capture, so it is budgeted generously and
   * separately from `inference` — conflating a one-time cost with a per-run one
   * would make every first run look like a regression.
   */
  modelInit: 3000,
  inference: 500,
  redaction: 200,
  network: 1000,
  reasoning: 1500,
  action: 100,
} as const;

export type BudgetedStage = keyof typeof LATENCY_BUDGET_MS;

export interface StageTiming {
  stage: BudgetedStage;
  label: string;
  durationMs: number;
  budgetMs: number;
  overBudget: boolean;
}

/**
 * Run `work`, time it, and report against that stage's budget.
 *
 * Returns the result alongside the timing so callers can accumulate a
 * breakdown for the whole run — Module F's latency display reads these rather
 * than re-measuring.
 */
export async function timed<T>(
  stage: BudgetedStage,
  label: string,
  work: () => Promise<T>,
): Promise<{ result: T; timing: StageTiming }> {
  const start = performance.now();
  const result = await work();
  const durationMs = performance.now() - start;
  const budgetMs = LATENCY_BUDGET_MS[stage];

  const timing: StageTiming = {
    stage,
    label,
    durationMs,
    budgetMs,
    overBudget: durationMs > budgetMs,
  };

  const rounded = durationMs.toFixed(1);
  if (timing.overBudget) {
    console.warn(`[shield] ${label} took ${rounded}ms (budget ${budgetMs}ms)`);
  } else {
    console.info(`[shield] ${label} ${rounded}ms / ${budgetMs}ms`);
  }

  return { result, timing };
}
