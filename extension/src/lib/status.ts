import type { CoverageReport, ScanSummary } from './coverage';
import type { ExecutionBackend } from './settings';
import type { StageTiming } from './timing';

/**
 * The pipeline status vocabulary shown to the user (PRD.md Section 14, FR-23).
 *
 * These are ordered deliberately: they are the actual stages of one task step,
 * in the order they run. The ordering is load-bearing — `STAGE_ORDER` below is
 * what lets the orchestrator assert that redaction really did happen before
 * transmission, rather than trusting that the calls were written in the right
 * sequence.
 */
export const SHIELD_STATUSES = [
  'idle',
  'reading',
  'detecting',
  'redacting',
  'sending',
  'thinking',
  'acting',
  'done',
  'error',
  /**
   * Walking the whole document, transmitting nothing.
   *
   * Listed here so the popup can show it, and deliberately absent from
   * `STAGE_ORDER` below — a scan is not a stage of a run and never reaches the
   * transport. Adding it to the pipeline sequence would be claiming it is on
   * the path the stage guard protects, which is exactly backwards: it is safe
   * because it is not on that path at all.
   */
  'scanning',
  /**
   * Sealed, verified, and waiting for the user to say whether it may go.
   *
   * Deliberately absent from `STAGE_ORDER`, like `scanning` and for a related
   * reason: this is a PAUSE between two stages, not a stage of its own. Adding
   * it to the sequence would mean the order guard could be satisfied by having
   * asked — which would make consent part of what proves the payload safe. It
   * is not. The phantom type, the stage guard and the zero-leak sweep do that,
   * and they ask nobody's permission (DECISIONS.md 240).
   */
  'awaiting-consent',
] as const;

export type ShieldStatus = (typeof SHIELD_STATUSES)[number];

/** Human-facing label for each status. Kept short enough for the popup chip. */
export const STATUS_LABEL: Record<ShieldStatus, string> = {
  idle: 'Idle',
  reading: 'Reading screen',
  detecting: 'Finding sensitive data',
  redacting: 'Hiding sensitive data',
  sending: 'Sending redacted context',
  thinking: 'Assistant is thinking',
  acting: 'Acting on the page',
  done: 'Done',
  error: 'Error',
  scanning: 'Scanning the page',
  'awaiting-consent': 'Waiting for you',
};

/**
 * The stages of a single task step, in execution order.
 *
 * `idle`, `done` and `error` are terminal/resting states and are not part of
 * the sequence, so they are excluded here.
 */
export const STAGE_ORDER = [
  'reading',
  'detecting',
  'redacting',
  'sending',
  'thinking',
  'acting',
] as const satisfies readonly ShieldStatus[];

export type PipelineStage = (typeof STAGE_ORDER)[number];

/** Position of a stage in the pipeline, used for ordering assertions. */
export function stageIndex(stage: PipelineStage): number {
  return STAGE_ORDER.indexOf(stage);
}

/** Full state of one Shield run, as surfaced to the popup. */
export interface ShieldState {
  /** Which backend local inference ran on, once known. */
  backend: ExecutionBackend | null;
  /**
   * True when WebGPU was tried and refused.
   *
   * PRD.md Section 20 requires the fallback to be automatic AND for the user to
   * be told things may be slower — a silent 10x slowdown looks like a bug, and
   * the trust story depends on Shield never being quietly worse than it claims.
   */
  fellBack: boolean;
  status: ShieldStatus;
  /** Present when `status === 'error'`. Never contains page content. */
  errorMessage: string | null;
  /** The task the user asked for, echoed back so the popup can show it. */
  taskQuery: string | null;
  /** Which tab this run belongs to. Runs are per-tab (PRD.md Section 20). */
  tabId: number | null;
  /** Step counter for the multi-step loop, guarded by MAX_STEPS. */
  step: number;
  /**
   * Stage timings for the most recent pipeline pass.
   *
   * The latest pass rather than the whole run: each step is an independent
   * capture-detect-redact-send cycle, and summing them would report a number
   * that describes no single thing the user waited for. A multi-step run shows
   * the last step's breakdown, with `step` saying which one that was.
   *
   * Durations only. Nothing here is derived from page content.
   */
  timings: StageTiming[];
  /**
   * How much of the page the last run actually examined.
   *
   * Reported whether or not anything was found, and whether or not the page
   * scrolls. A boundary that only appears when it is bad is one nobody learns
   * to look for, and the failure this guards against is a user reading a
   * missing box as "checked and safe" (lib/coverage.ts).
   */
  coverage: CoverageReport | null;
  /** Result of the last whole-page scan. Counts and geometry, never content. */
  scan: ScanSummary | null;
  /** How far a scan in flight has got, so a ten-second wait is not a blank one. */
  scanProgress: { stop: number; total: number } | null;
}

export const INITIAL_STATE: ShieldState = {
  backend: null,
  fellBack: false,
  status: 'idle',
  errorMessage: null,
  taskQuery: null,
  tabId: null,
  step: 0,
  timings: [],
  coverage: null,
  scan: null,
  scanProgress: null,
};
