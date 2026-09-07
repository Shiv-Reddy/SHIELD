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
};
