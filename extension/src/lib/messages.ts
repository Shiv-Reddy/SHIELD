/**
 * Typed message envelopes for the three extension contexts.
 *
 * Chrome's messaging API is untyped (`any` in, `any` out), which is a poor fit
 * for a project whose central claim is about what data goes where. Every
 * message therefore has an explicit shape here, and the helpers at the bottom
 * are the only sanctioned way to send one.
 */

import type { CropRequest, OcrReadResult } from '../offscreen/ocr';
import type {
  DomElement,
  SensitiveCategory,
  SensitiveRegion,
  ShieldAction,
  ViewportInfo,
} from './types';

export const MSG = {
  /** Popup -> worker: begin a task on the active tab. */
  RUN_TASK: 'shield/run-task',
  /** Popup -> worker: abandon the current run. */
  CANCEL_TASK: 'shield/cancel-task',
  /** Popup -> worker: fetch current state on popup open. */
  GET_STATE: 'shield/get-state',
  /** Worker -> popup (broadcast): state changed. */
  STATE_CHANGED: 'shield/state-changed',
  /** Worker -> content script: confirm the script is injected and alive. */
  PING: 'shield/ping',
  /** Worker -> content script: report viewport size and pixel ratio. */
  GET_VIEWPORT: 'shield/get-viewport',
  /** Worker -> content script: walk the DOM and return the element map. */
  EXTRACT_DOM: 'shield/extract-dom',
  /** Worker -> content script: perform one validated action on the page. */
  EXECUTE_ACTION: 'shield/execute-action',
  /** Worker -> content script: draw or clear the redaction overlay. */
  SHOW_OVERLAY: 'shield/show-overlay',
  /**
   * Popup -> worker: get the page ready to be marked up, then hand it over.
   *
   * Routed through the worker rather than sent straight to the tab because the
   * content script is injected on demand and is absent until a run has
   * happened. Talking to the tab directly meant the only way to reach a live
   * script was to run first — which transmits the very page the user opened
   * this to hide something on.
   */
  BEGIN_MANUAL: 'shield/begin-manual',
  /** Worker -> content script: let the user draw regions to hide. */
  START_MANUAL: 'shield/start-manual',
  /** Popup -> content script: how many marks are set on this page. */
  MANUAL_STATUS: 'shield/manual-status',
  /** Worker -> content script: hand back what the user drew, in viewport space. */
  GET_MANUAL_REGIONS: 'shield/get-manual-regions',
  /** Worker -> content script: show or hide the drawing surface, keeping the marks. */
  SET_MANUAL_VISIBLE: 'shield/set-manual-visible',
  /** Popup -> content script: discard every manual region on this page. */
  CLEAR_MANUAL: 'shield/clear-manual',
  /** Worker -> offscreen document: decode a frame and run local inference. */
  ANALYSE_FRAME: 'shield/analyse-frame',
  /** Popup -> worker: the user is here; get the inference host ready. */
  PREPARE: 'shield/prepare',
  /** Worker -> offscreen document: load and warm the model now. */
  WARM_UP: 'shield/warm-up',
  /** Popup -> worker: backend override changed; restart the inference host. */
  RESTART_BACKEND: 'shield/restart-backend',
  /** Worker -> offscreen document: drop the loaded session and rebuild it. */
  RELOAD_MODEL: 'shield/reload-model',
  /** Worker -> offscreen document: run the CPU fallback self-test now. */
  RUN_SELF_TEST: 'shield/run-self-test',
  /** Worker -> offscreen document: paint sensitive regions out of the frame. */
  REDACT_FRAME: 'shield/redact-frame',
  /** Worker -> offscreen document: read text out of image crops of the frame. */
  READ_IMAGES: 'shield/read-images',
} as const;

// --- Popup -> service worker ------------------------------------------------

export interface RunTaskMessage {
  type: typeof MSG.RUN_TASK;
  taskQuery: string;
}

export interface CancelTaskMessage {
  type: typeof MSG.CANCEL_TASK;
}

export interface GetStateMessage {
  type: typeof MSG.GET_STATE;
}

/**
 * Sent when the popup opens, before the user has typed anything.
 *
 * Opening the popup is a strong signal that a run is about to happen, and the
 * seconds spent typing a task are seconds the inference host can spend loading.
 * Measured first-run overhead was ~940ms of document creation, session build and
 * shader warm-up; this hides essentially all of it behind think-time instead of
 * making the user wait for it after they press Run.
 */
export interface PrepareMessage {
  type: typeof MSG.PREPARE;
}

/**
 * Sent after the backend override is changed.
 *
 * The offscreen document caches its loaded session, so a new override has no
 * effect until that document is replaced — without this the toggle would appear
 * to do nothing until the host happened to idle out, which is exactly the kind
 * of "it didn't work, try again" confusion worth engineering away.
 */
export interface RestartBackendMessage {
  type: typeof MSG.RESTART_BACKEND;
}

/**
 * Prepare the page for marking, injecting the content script if needed.
 *
 * The reply distinguishes "ready" from "this page cannot be read", so the popup
 * can close on success and explain itself on failure instead of closing onto a
 * page where nothing will happen.
 */
export interface BeginManualMessage {
  type: typeof MSG.BEGIN_MANUAL;
}

export interface BeginManualResult {
  ok: boolean;
  message: string;
}

export type PopupMessage =
  | RunTaskMessage
  | CancelTaskMessage
  | GetStateMessage
  | PrepareMessage
  | BeginManualMessage
  | RestartBackendMessage;

// --- Service worker -> content script ---------------------------------------

export interface PingMessage {
  type: typeof MSG.PING;
}

export interface GetViewportMessage {
  type: typeof MSG.GET_VIEWPORT;
}

export interface ExtractDomMessage {
  type: typeof MSG.EXTRACT_DOM;
}

/**
 * Perform one action.
 *
 * The expected selector, type and label travel with it so the content script can
 * re-verify the target against what was captured, rather than trusting that the
 * page has not changed underneath the round trip.
 */
export interface ExecuteActionMessage {
  type: typeof MSG.EXECUTE_ACTION;
  action: ShieldAction;
  expectedSelector: string;
  expectedType: string;
  expectedLabel: string | null;
  /**
   * The text to type, resolved on this machine.
   *
   * Never the value the server sent. The server has no access to a credential
   * and must never be the source of one; it names a field, and the client
   * decides what goes in it.
   */
  typeValue: string | null;
}

/**
 * Draw the explainable redaction overlay.
 *
 * Carries categories, reasons and geometry — never values. The reasons are rule
 * names, which by construction describe a decision without quoting the content
 * that triggered it.
 */
export interface ShowOverlayMessage {
  type: typeof MSG.SHOW_OVERLAY;
  regions: {
    category: SensitiveCategory;
    reason: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }[];
}

/** Popup -> content script: enter or leave the drawing mode. */
export interface StartManualMessage {
  type: typeof MSG.START_MANUAL;
}

/**
 * Worker -> content script: the marks, converted to viewport coordinates.
 *
 * Converted on the content side because that is where the scroll position
 * lives. Regions entirely outside the viewport are dropped: the capture only
 * ever contains what is on screen, so a mark above or below it has nothing to
 * cover.
 */
export interface GetManualRegionsMessage {
  type: typeof MSG.GET_MANUAL_REGIONS;
}

export interface SetManualVisibleMessage {
  type: typeof MSG.SET_MANUAL_VISIBLE;
  visible: boolean;
}

export interface ClearManualMessage {
  type: typeof MSG.CLEAR_MANUAL;
}

/**
 * How many marks this page is carrying.
 *
 * Sent straight to the tab and NOT through the worker, so that a popup opening
 * never injects anything. A page with no content script has no marks, and the
 * failed send is that answer — asking the question must not be what puts Shield
 * on a page the user never pointed it at.
 */
export interface ManualStatusMessage {
  type: typeof MSG.MANUAL_STATUS;
}

export interface ManualStatusResult {
  count: number;
}

export type ContentMessage =
  | StartManualMessage
  | ManualStatusMessage
  | GetManualRegionsMessage
  | SetManualVisibleMessage
  | ClearManualMessage
  | PingMessage
  | GetViewportMessage
  | ExtractDomMessage
  | ExecuteActionMessage
  | ShowOverlayMessage;

export interface ExecuteActionResult {
  ok: boolean;
  message: string;
}

export interface PingResult {
  ok: true;
  /** Extension version the injected script was built from, to catch stale injections. */
  version: string;
}

export interface ExtractDomResult {
  elements: DomElement[];
  /**
   * Client-side only. Never added to the request schema in API_SPEC.md — a URL
   * alone can identify a person or an internal system.
   */
  pageUrl: string;
  viewport: ViewportInfo;
  /** How many elements were considered, for diagnostics. */
  scanned: number;
  /** True when the element cap was hit and some text/image context was dropped. */
  truncated: boolean;
  /** Selectors that failed to resolve back to their own element at capture time. */
  unresolvedSelectors: number;
}

export type { ViewportInfo };
// Re-exported so the service worker can name an OCR outcome without importing
// from the offscreen document, which it never otherwise reaches into.
export type { CropRequest, OcrReadResult };

// --- Service worker -> offscreen document -----------------------------------

export interface AnalyseFrameMessage {
  type: typeof MSG.ANALYSE_FRAME;
  /** The captured frame. Raw and unredacted; never leaves the extension. */
  dataUrl: string;
  /** CSS-pixel viewport size, used to derive the frame scale. */
  viewportWidth: number;
  viewportHeight: number;
  /** Backend override, resolved by the worker. Null means prefer WebGPU. */
  forceBackend: 'webgpu' | 'wasm' | null;
}

export interface WarmUpMessage {
  type: typeof MSG.WARM_UP;
  forceBackend: 'webgpu' | 'wasm' | null;
}

/**
 * Build and run an independent CPU session, and report what happened.
 *
 * Driven by the service worker rather than decided inside the offscreen
 * document: the worker owns the record of whether the fallback has been proved
 * on this machine, so it is the only context that can know whether running the
 * test again is worth the work.
 */
export interface RunSelfTestMessage {
  type: typeof MSG.RUN_SELF_TEST;
}

export interface SelfTestRunResult {
  ok: boolean;
  inferenceMs: number;
  initMs: number;
  message: string;
  at: number;
}

/**
 * Drop the cached inference session and build a fresh one.
 *
 * The backend is chosen when the session is created, so a changed override has
 * no effect until the session is rebuilt. Doing that in place is deliberate: the
 * first attempt closed and recreated the whole offscreen document, which races —
 * `getContexts` can still report the closing document as alive, so the recreate
 * is skipped and the old session survives with the old backend, making the
 * override look broken.
 */
export interface ReloadModelMessage {
  type: typeof MSG.RELOAD_MODEL;
  forceBackend: 'webgpu' | 'wasm' | null;
}

/**
 * Paint sensitive regions out of a captured frame.
 *
 * Carries the raw frame back to the offscreen document rather than keeping a
 * decoded bitmap alive there between stages: a second decode costs ~15ms, and
 * holding an unredacted screenshot in memory across the whole detection stage
 * costs an invariant.
 */
export interface RedactFrameMessage {
  type: typeof MSG.REDACT_FRAME;
  /** Raw, unredacted. Never leaves the extension. */
  dataUrl: string;
  regions: SensitiveRegion[];
  scaleX: number;
  scaleY: number;
}

/**
 * Read text out of the given crops of a frame.
 *
 * Crops are in FRAME (device) pixels, because that is the space the offscreen
 * document's bitmap is in. Only rectangles travel — the image itself never
 * leaves the offscreen document, and only words come back.
 */
export interface ReadImagesMessage {
  type: typeof MSG.READ_IMAGES;
  /** Raw and unredacted. Never leaves the extension. */
  dataUrl: string;
  crops: CropRequest[];
}

export interface ReadImagesReply {
  /**
   * One entry per crop, each independently ok or not.
   *
   * Per-crop rather than per-request on purpose: one unreadable image must not
   * discard the words read from the others, and each failure has to stay
   * attached to the image it belongs to so that image alone is covered.
   */
  results: OcrReadResult[];
}

export type RedactFrameReply =
  | {
      ok: true;
      /** The redacted frame. This one is safe to transmit. */
      dataUrl: string;
      painted: number;
      skipped: number;
      redactionMs: number;
    }
  | { ok: false; message: string };

export type OffscreenMessage =
  | ReadImagesMessage
  | AnalyseFrameMessage
  | WarmUpMessage
  | ReloadModelMessage
  | RunSelfTestMessage
  | RedactFrameMessage;

export interface FrameGeometry {
  width: number;
  height: number;
  scaleX: number;
  scaleY: number;
}

/** One detected face, normalised to the frame (0..1). */
export interface FaceBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  score: number;
}

export interface RawDetectionSummary {
  priors: number;
  maxScore: number;
  aboveThreshold: number;
  candidatesByCutoff: { at30: number; at50: number; at70: number };
  faces: FaceBox[];
  boxRange: { dims: number[]; min: number; max: number; sample: number[] } | null;
  inferenceMs: number;
}

export type AnalyseFrameResult =
  | {
      ok: true;
      backend: 'webgpu' | 'wasm';
      /** True when WebGPU was tried and refused — the user should be told. */
      fellBack: boolean;
      /** Set when a local override pinned the backend, for diagnostics. */
      forced: 'webgpu' | 'wasm' | null;
      frame: FrameGeometry;
      detection: RawDetectionSummary;
    }
  | { ok: false; message: string };

// --- Service worker -> popup (broadcast) ------------------------------------

import type { ShieldState } from './status';

export interface StateChangedMessage {
  type: typeof MSG.STATE_CHANGED;
  state: ShieldState;
}

export type WorkerBroadcast = StateChangedMessage;

// --- Helpers ----------------------------------------------------------------

/**
 * Send a message to the service worker and await its reply.
 *
 * Wrapped rather than used raw so that the "no receiver" case — which happens
 * routinely when the popup closes mid-flight — is a resolved `null` instead of
 * an unhandled promise rejection in the console.
 */
export async function sendToWorker<TResult>(
  message: PopupMessage,
): Promise<TResult | null> {
  try {
    return (await chrome.runtime.sendMessage(message)) as TResult;
  } catch {
    return null;
  }
}

/**
 * Send a message to the offscreen document and await its reply.
 *
 * Unlike the tab and popup helpers, a failure here is NOT swallowed: the
 * offscreen document is the inference host, and silently treating a dead one as
 * "no result" would let the pipeline continue as though the frame contained
 * nothing sensitive. Fail loudly, per ARCHITECTURE.md Section 9.
 */
export async function sendToOffscreen(
  message: AnalyseFrameMessage,
): Promise<AnalyseFrameResult> {
  return (await chrome.runtime.sendMessage(message)) as AnalyseFrameResult;
}

/**
 * Ask the offscreen document to load the model, without waiting for it.
 *
 * Deliberately fire-and-forget: this is an optimisation, and a failure here must
 * never break a run. If warming fails the model simply loads lazily on the first
 * real frame, exactly as it did before.
 */
export function warmOffscreen(forceBackend: 'webgpu' | 'wasm' | null): void {
  void chrome.runtime
    .sendMessage({ type: MSG.WARM_UP, forceBackend })
    .catch(() => undefined);
}

/** Ask the offscreen document to rebuild its session on the given backend. */
export async function reloadOffscreenModel(
  forceBackend: 'webgpu' | 'wasm' | null,
): Promise<void> {
  await chrome.runtime.sendMessage({ type: MSG.RELOAD_MODEL, forceBackend });
}

/**
 * Ask the offscreen document to paint the sensitive regions out of a frame.
 *
 * Failures are not swallowed. Treating a failed redaction as "no regions to
 * hide" would ship the raw frame, so this must throw and stop the run
 * (ARCHITECTURE.md Section 9, fail closed).
 */
export async function redactOffscreenFrame(
  message: Omit<RedactFrameMessage, 'type'>,
): Promise<RedactFrameReply> {
  return (await chrome.runtime.sendMessage({
    type: MSG.REDACT_FRAME,
    ...message,
  })) as RedactFrameReply;
}

/**
 * Ask the offscreen document to read the given image crops.
 *
 * Failures are NOT swallowed here, unlike the tab and popup helpers. A thrown
 * message would otherwise surface as "no text found", and the caller treats
 * that as a clean image — transmitting a document nothing ever read.
 */
export async function readOffscreenImages(
  message: Omit<ReadImagesMessage, 'type'>,
): Promise<ReadImagesReply> {
  return (await chrome.runtime.sendMessage({
    type: MSG.READ_IMAGES,
    ...message,
  })) as ReadImagesReply;
}

/** Ask the offscreen document to prove the CPU fallback and report back. */
export async function runOffscreenSelfTest(): Promise<SelfTestRunResult> {
  return (await chrome.runtime.sendMessage({
    type: MSG.RUN_SELF_TEST,
  })) as SelfTestRunResult;
}

/** Send a message to the content script in a specific tab and await its reply. */
export async function sendToTab<TResult>(
  tabId: number,
  message: ContentMessage,
): Promise<TResult | null> {
  try {
    return (await chrome.tabs.sendMessage(tabId, message)) as TResult;
  } catch {
    return null;
  }
}

/**
 * Broadcast state to any open popup.
 *
 * The popup is usually closed, and sending to nobody rejects. That is expected,
 * not exceptional, so it is swallowed here.
 */
export function broadcast(message: WorkerBroadcast): void {
  void chrome.runtime.sendMessage(message).catch(() => undefined);
}
