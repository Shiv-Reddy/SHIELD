/**
 * Typed message envelopes for the three extension contexts.
 *
 * Chrome's messaging API is untyped (`any` in, `any` out), which is a poor fit
 * for a project whose central claim is about what data goes where. Every
 * message therefore has an explicit shape here, and the helpers at the bottom
 * are the only sanctioned way to send one.
 */

import type { CropRequest, OcrReadResult } from '../offscreen/ocr';
import type { PageCoverage, ScanFinding } from './coverage';
import type { ScreenTextRegion } from './vision/screen-text';
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
  /**
   * Worker -> popup: a sealed payload is waiting for a decision.
   *
   * Broadcast rather than a request, because the popup may not be open. A
   * broadcast nobody receives is the timeout path, which refuses — see
   * lib/consent.ts.
   */
  CONSENT_REQUESTED: 'shield/consent-requested',
  /** Popup -> worker: the user's answer to one consent request. */
  CONSENT_DECISION: 'shield/consent-decision',
  /** Worker -> offscreen document: drop the loaded session and rebuild it. */
  RELOAD_MODEL: 'shield/reload-model',
  /** Worker -> offscreen document: run the CPU fallback self-test now. */
  RUN_SELF_TEST: 'shield/run-self-test',
  /** Worker -> offscreen document: paint sensitive regions out of the frame. */
  REDACT_FRAME: 'shield/redact-frame',
  /** Worker -> offscreen document: read text out of image crops of the frame. */
  READ_IMAGES: 'shield/read-images',
  /**
   * Worker -> offscreen document: read every word on the whole frame.
   *
   * Separate from READ_IMAGES, which reads named image elements. This reads
   * the screen itself, including what no element describes - text drawn into a
   * canvas, inside an iframe, or baked into a pasted screenshot. It costs far
   * more than a crop, so it belongs to the scan path and never to a run
   * (DECISIONS.md 188).
   */
  READ_SCREEN: 'shield/read-screen',
  /**
   * Popup -> worker: examine the whole page, top to bottom, and send nothing.
   *
   * Deliberately not a mode on RUN_TASK. A run acts on the page and transmits a
   * sanitized payload to do it; a scan does neither, and the two sharing an
   * entry point would mean one flag stood between "nothing leaves this machine"
   * and "something does". They are separate paths so that the scan path simply
   * has no transport in it to reach.
   */
  SCAN_PAGE: 'shield/scan-page',
  /** Worker -> content script: scroll to a document offset and report where it landed. */
  SCROLL_TO: 'shield/scroll-to',
  /** Worker -> content script: draw the whole-page findings, in document space. */
  SHOW_SCAN: 'shield/show-scan',
  /** Popup or worker -> content script: discard the scan result entirely. */
  CLEAR_SCAN: 'shield/clear-scan',
  /** Worker -> content script: show or hide the scan boxes, keeping the findings. */
  SET_SCAN_VISIBLE: 'shield/set-scan-visible',
  /** Worker -> content script: hand back the scan's findings, in viewport space. */
  GET_SCAN_REGIONS: 'shield/get-scan-regions',
  /** Popup -> content script: how many findings this page is carrying. */
  SCAN_STATUS: 'shield/scan-status',
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

/**
 * Examine the whole document rather than the screen, and transmit nothing.
 *
 * Fire-and-forget like RUN_TASK: a scan takes seconds and the popup is closed
 * for most of them, so progress arrives through STATE_CHANGED and the result
 * is left on the page.
 */
export interface ScanPageMessage {
  type: typeof MSG.SCAN_PAGE;
}

/**
 * One answer to one consent request.
 *
 * The id is carried back so a late click cannot authorise a payload the user
 * never saw: an approval for step 1, arriving after step 2 has sealed, is
 * discarded as stale rather than applied (lib/consent.ts).
 */
export interface ConsentDecisionMessage {
  type: typeof MSG.CONSENT_DECISION;
  id: string;
  approved: boolean;
}

export type PopupMessage =
  | RunTaskMessage
  | CancelTaskMessage
  | GetStateMessage
  | PrepareMessage
  | BeginManualMessage
  | ScanPageMessage
  | RestartBackendMessage
  | ConsentDecisionMessage;

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
 * Move the page to a document offset, and say where it actually ended up.
 *
 * The reply is not a formality. A page can refuse to scroll where it was asked
 * — a scroll-locked modal, a container that owns the overflow, a document that
 * grew or shrank since it was measured — and a scan that assumed it arrived
 * would attribute every finding from that stop to coordinates hundreds of
 * pixels from where they really are. The caller compares what it asked for with
 * what it got, and stops when the page stops moving.
 */
export interface ScrollToMessage {
  type: typeof MSG.SCROLL_TO;
  y: number;
}

export interface ScrollToResult {
  scrollY: number;
  scrollX: number;
  /**
   * Where the page was before this call.
   *
   * Carried so the first stop of a scan captures the user's own position in the
   * same round trip that starts the walk. A scan moves someone's page out from
   * under them and owes them the exact position back — asking for it separately
   * would be a second message that can fail on its own, leaving them stranded
   * somewhere they never scrolled to.
   */
  previousScrollY: number;
  previousScrollX: number;
  documentHeight: number;
  viewportHeight: number;
}

/**
 * Draw the scan's findings, pinned to the document rather than the screen.
 *
 * The opposite of `SHOW_OVERLAY`, and for a reason that is worth stating rather
 * than looking like an inconsistency. A run's overlay MUST clear on scroll,
 * because it describes one viewport and boxes that followed the page would keep
 * looking authoritative over content nothing ever examined. A scan examined the
 * whole document, so its boxes stay exactly as wide as its evidence — pinning
 * them to the content is what makes them true rather than what makes them a
 * lie.
 */
export interface ShowScanMessage {
  type: typeof MSG.SHOW_SCAN;
  findings: ScanFinding[];
  /** True when the stop cap was hit, so the page below was never examined. */
  truncated: boolean;
  /** How far down the document the scan actually reached. */
  examinedTo: number;
}

export interface ClearScanMessage {
  type: typeof MSG.CLEAR_SCAN;
}

/**
 * Hide the boxes without forgetting what they mean.
 *
 * The distinction is the whole reason a scan is worth running. The boxes must
 * come down before any capture, or they are baked into the frame the model is
 * shown and OCR reads Shield's own labels back as findings. The FINDINGS must
 * not come down, or a scan that discovered an Aadhaar number below the fold has
 * done nothing but point at it — the run that follows reads one screen and
 * cannot rediscover it.
 */
export interface SetScanVisibleMessage {
  type: typeof MSG.SET_SCAN_VISIBLE;
  visible: boolean;
}

/**
 * The scan's findings, converted to the current viewport.
 *
 * Converted on the content side because that is where the scroll position
 * lives, exactly as manual marks are. Findings entirely outside the viewport
 * are dropped: the capture only contains what is on screen, so a finding above
 * or below it has no pixels to cover.
 */
export interface GetScanRegionsMessage {
  type: typeof MSG.GET_SCAN_REGIONS;
}

/**
 * How many findings this page is carrying.
 *
 * Sent straight to the tab and NOT through the worker, for the same reason
 * `MANUAL_STATUS` is: asking the question must never be what injects Shield
 * into a page the user has not pointed it at. No content script means no
 * findings, and the failed send is that answer.
 */
export interface ScanStatusMessage {
  type: typeof MSG.SCAN_STATUS;
}

export interface ScanStatusResult {
  count: number;
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
  | ScrollToMessage
  | ShowScanMessage
  | ClearScanMessage
  | SetScanVisibleMessage
  | GetScanRegionsMessage
  | ScanStatusMessage
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
  /**
   * How much of the document this reading speaks for.
   *
   * Present on every scan, not only on tall pages, because a boundary reported
   * only when it is bad is a boundary nobody learns to look for.
   */
  coverage: PageCoverage;
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
  /**
   * Inference-host override. Null means choose per browser.
   *
   * Travels beside `forceBackend` because they are the same kind of thing: a
   * diagnostic pin that makes an otherwise-unreachable path testable on the
   * machine in front of you. DECISIONS.md 216.
   */
  forceInferenceHost: 'document' | 'worker' | null;
}

export interface WarmUpMessage {
  type: typeof MSG.WARM_UP;
  forceBackend: 'webgpu' | 'wasm' | null;
  /**
   * Inference-host override. Null means choose per browser.
   *
   * Travels beside `forceBackend` because they are the same kind of thing: a
   * diagnostic pin that makes an otherwise-unreachable path testable on the
   * machine in front of you. DECISIONS.md 216.
   */
  forceInferenceHost: 'document' | 'worker' | null;
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
  /**
   * Inference-host override. Null means choose per browser.
   *
   * Travels beside `forceBackend` because they are the same kind of thing: a
   * diagnostic pin that makes an otherwise-unreachable path testable on the
   * machine in front of you. DECISIONS.md 216.
   */
  forceInferenceHost: 'document' | 'worker' | null;
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

export interface ReadScreenMessage {
  type: typeof MSG.READ_SCREEN;
  /** Raw and unredacted. Never leaves the extension. */
  dataUrl: string;
  /** CSS pixels, so frame coordinates can be converted exactly once. */
  viewportWidth: number;
  viewportHeight: number;
}

export type ReadScreenReply =
  | {
      ok: true;
      regions: ScreenTextRegion[];
      /** The captured frame, in its own device pixels. */
      frameWidth: number;
      frameHeight: number;
      /**
       * What the engine actually worked on. Larger than the frame, because the
       * scan path enlarges it before recognition — see
       * `vision/recognition-scale.ts` and DECISIONS.md 212.
       */
      recognisedWidth: number;
      recognisedHeight: number;
      /** Recognised size over frame size. 1 means read at capture resolution. */
      recognitionScale: number;
      /** Every word read, before grouping. Counted, never logged. */
      words: number;
    }
  | { ok: false; message: string };

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
  | ReadScreenMessage
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
      /**
       * Where inference ran — the offscreen document, or a dedicated Worker.
       *
       * Reported rather than assumed from the browser, because DECISIONS.md 216
       * gates the worker becoming Chrome's default on comparing the two hosts
       * on the SAME browser. A measurement whose host is inferred is not one.
       */
      host: 'document' | 'worker';
      /**
       * Set when a local override pinned the host.
       *
       * Reported for the same reason `host` is. A run that says `worker` with
       * this null is the browser's own default and a finding; one with this set
       * is somebody taking a measurement. Conflating the two is how a silent
       * default change reads as a deliberate one.
       */
      forcedHost: 'document' | 'worker' | null;
      frame: FrameGeometry;
      detection: RawDetectionSummary;
    }
  | { ok: false; message: string };

// --- Service worker -> popup (broadcast) ------------------------------------

import type { ShieldState } from './status';
import type { ConsentRequest } from './consent';

export interface StateChangedMessage {
  type: typeof MSG.STATE_CHANGED;
  state: ShieldState;
}

/** A sealed payload, described in counts, awaiting a decision. */
export interface ConsentRequestedMessage {
  type: typeof MSG.CONSENT_REQUESTED;
  request: ConsentRequest;
}

export type WorkerBroadcast = StateChangedMessage | ConsentRequestedMessage;

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

/*
 * The offscreen-calling helpers used to live here and now live in
 * `background/vision-host.ts`.
 *
 * They each had exactly one caller — the service worker — and Firefox needs
 * them to branch: there is no offscreen document there, so the same work is
 * dispatched in-process instead of sent across a context boundary. That branch
 * reaches ONNX Runtime, and this file is imported by the popup and the content
 * script, which would then have carried the engine for no reason. The message
 * TYPES stay here, which is the part the other bundles actually use.
 */

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
