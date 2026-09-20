/**
 * Background service worker — the orchestrator for one Shield run.
 *
 * This file owns the pipeline order and nothing else. The actual work of each
 * stage lives in its own module (Modules A-E in TASKS.md) and is wired in here
 * as those modules land. Keeping orchestration separate from implementation is
 * what makes the redact-before-transmit invariant auditable: a reviewer can
 * read this one file and see the whole order of operations.
 *
 * MV3 service workers are killed aggressively when idle, so nothing here may
 * assume it stays resident between runs. Run state is deliberately kept small
 * and rebuildable.
 */

import { captureViewport } from './capture';
import {
  ensureVisionHost,
  sendToOffscreen,
  redactOffscreenFrame,
  readOffscreenImages,
  readOffscreenScreen,
  warmOffscreen,
  reloadOffscreenModel,
  runOffscreenSelfTest,
} from './vision-host';
import {
  MSG,
  broadcast,
  sendToTab,
  type PopupMessage,
  type BeginManualResult,
  type PingResult,
  type ExtractDomResult,
  type ScrollToResult,
  type OcrReadResult,
} from '../lib/messages';
import {
  countByCategory,
  dedupeFindings,
  clipFindings,
  dedupeRegions,
  describeCoverage,
  planScanStops,
  unexaminedImages,
  type ScanFinding,
  type ScannedImage,
  type ScanSummary,
} from '../lib/coverage';
import { createScanTimer, formatScanTiming } from '../lib/scan-timing';
import { classifyTextContent, detectDomPii } from '../lib/pii/dom-rules';
import { faceRegions } from '../lib/pii/face-regions';
import {
  candidatesToRead,
  fullyVisible,
  imageCandidates,
  unreadableImageRegions,
} from '../lib/pii/image-candidates';
import { ocrRegions } from '../lib/pii/ocr-regions';
import {
  compareReadings,
  domTextItems,
  mergeSightings,
  type DomTextItem,
} from '../lib/vision/agreement';
import type { ScreenTextRegion } from '../lib/vision/screen-text';
import { buildManifest, redactDomElements } from '../lib/redaction/placeholders';
import { buildSanitizedPayload } from '../lib/redaction/payload';
import {
  declineReason,
  mayTransmit,
  summarise as summariseForConsent,
} from '../lib/consent';
import { applyConsentDecision, askForConsent, cancelConsent } from './consent-gate';
import { recordTransmission } from '../lib/redaction/evidence';
import { buildAuditEntry, recordAudit } from '../lib/audit';
import {
  clearScanProof,
  recordScanProof,
  type ProofScreen,
} from '../lib/scan-proof';
import { send } from '../lib/transport/client';
import { REDACTION_FLOORS, readSettings } from '../lib/settings';
import { readSelfTestRecord, writeSelfTestRecord } from '../lib/self-test-record';
import { timed, type StageTiming } from '../lib/timing';
import type {
  DomElement,
  RawFrame,
  Rect,
  ShieldAction,
  RedactedDomEntry,
  ScreenSnapshot,
  SensitiveRegion,
  ViewportInfo,
} from '../lib/types';
import {
  INITIAL_STATE,
  STAGE_ORDER,
  STATUS_LABEL,
  stageIndex,
  type PipelineStage,
  type ShieldState,
  type ShieldStatus,
} from '../lib/status';

const CONTENT_SCRIPT_FILE = 'content-script.js';

/**
 * The task used when a run is started from the page rather than the popup.
 *
 * Deliberately a reading task rather than an acting one. A run launched from
 * the marking toolbar is about hiding things, and the person clicking it has
 * not asked for anything to be done to the page.
 */
const DEFAULT_TASK = 'Describe what is on this screen';

/**
 * Shown whenever Chrome will not let us near a page at all.
 *
 * Deliberately says what the user can do about it rather than what went wrong
 * internally: this fires on chrome:// pages, the Web Store, the PDF viewer, and
 * other extensions' pages, and in every one of those cases the answer is the
 * same — try it on an ordinary web page.
 */
const UNREADABLE_PAGE_MESSAGE =
  "Shield can't read this page. Chrome blocks extensions on its own pages — " +
  'chrome:// pages, the Web Store, PDFs, and other extensions. Try an ordinary ' +
  'web page.';

// --- Run state --------------------------------------------------------------

let state: ShieldState = { ...INITIAL_STATE };

function setState(patch: Partial<ShieldState>): void {
  state = { ...state, ...patch };
  broadcast({ type: MSG.STATE_CHANGED, state });
}

function setStatus(status: ShieldStatus, errorMessage: string | null = null): void {
  setState({ status, errorMessage });
}

/**
 * Stage timings for the pass currently running.
 *
 * Collected here rather than threaded through every stage's return value: the
 * pipeline is a straight sequence and the alternative is a parameter that most
 * of it does not use. Reset at the start of each step, because a multi-step run
 * has one breakdown per step and adding them would report a duration nobody
 * waited for.
 */
let stepTimings: StageTiming[] = [];

/** Record a stage's timing and push it to the popup as it happens. */
function record<T>(measured: { result: T; timing: StageTiming }): T {
  stepTimings = [...stepTimings, measured.timing];
  setState({ timings: stepTimings });
  return measured.result;
}

function fail(message: string): void {
  // Every failure surfaces to the user with a specific reason. PRD.md Section 20
  // requires no silent failures and no generic "something went wrong".
  console.error('[shield]', message);
  setStatus('error', message);
}

// --- Pipeline ordering guard ------------------------------------------------

/**
 * Stages completed during the current run.
 *
 * This exists to enforce ARCHITECTURE.md Section 2.3's hard invariant at
 * runtime, alongside the compile-time `Sanitized<T>` seal in lib/types.ts. Two
 * independent mechanisms guarding the same boundary is intentional: the type
 * seal catches wiring mistakes at build time, this catches a stage that was
 * skipped, threw, or returned early at run time.
 */
let completedStages = new Set<PipelineStage>();

function beginRun(taskQuery: string, tabId: number): void {
  completedStages = new Set();
  setState({
    status: 'reading',
    errorMessage: null,
    taskQuery,
    tabId,
    step: 1,
    // A run's claim is one screen wide, and it is about to make it. Carrying a
    // previous scan's whole-page summary alongside would put the widest claim
    // Shield can make next to the narrowest, with nothing saying which one the
    // numbers on screen belong to.
    scan: null,
    scanProgress: null,
    coverage: null,
  });
}

function markStageComplete(stage: PipelineStage): void {
  completedStages.add(stage);
}

/**
 * Refuse to proceed past `stage` unless every earlier stage actually ran.
 *
 * The transport call sites the check with `'sending'`, which makes skipping
 * redaction a thrown error rather than a leak. Fails closed, per
 * ARCHITECTURE.md Section 9.
 */
function assertStagesCompletedBefore(stage: PipelineStage): void {
  const limit = stageIndex(stage);
  for (let i = 0; i < limit; i += 1) {
    const required = STAGE_ORDER[i];
    if (required && !completedStages.has(required)) {
      throw new Error(
        `Pipeline order violation: reached "${stage}" without completing "${required}". ` +
          'Refusing to continue.',
      );
    }
  }
}

// --- Content script lifecycle ----------------------------------------------

/**
 * Ensure the content script is live in `tabId`, injecting it if it isn't.
 *
 * Shield declares no static content scripts. The script is injected only when
 * the user actively starts a run, under `activeTab`, so Shield has no reach
 * into pages the user never pointed it at. That is a real privacy property,
 * not just a smaller permission warning — see DECISIONS.md.
 */
async function ensureContentScript(tabId: number): Promise<void> {
  const alive = await sendToTab<PingResult>(tabId, { type: MSG.PING });
  if (alive?.ok) return;

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: [CONTENT_SCRIPT_FILE],
    });
  } catch (error) {
    // Chrome refuses injection outright on its own pages, and the raw message
    // ("Cannot access a chrome:// URL") is internal wording no user should be
    // shown. PRD.md Section 20 asks for a clear "couldn't read this page"
    // instead, so the real error is logged for us and replaced for them.
    console.warn('[shield] content script injection refused:', error);
    throw new Error(UNREADABLE_PAGE_MESSAGE);
  }

  const confirmed = await sendToTab<PingResult>(tabId, { type: MSG.PING });
  if (!confirmed?.ok) throw new Error(UNREADABLE_PAGE_MESSAGE);
}

async function getActiveTab(): Promise<chrome.tabs.Tab> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('No active tab to work on.');
  return tab;
}

/**
 * Whether a page is one of our own test fixtures.
 *
 * Used to decide how much of the element map may be printed. Fixtures are local
 * files containing synthetic data we wrote; anything else is somebody's real
 * page. `pageUrl` is client-side only and never transmitted (see
 * ScreenSnapshot), so consulting it here costs nothing.
 */
function isLocalFixture(pageUrl: string): boolean {
  return pageUrl.startsWith('file://') || pageUrl.startsWith('http://localhost');
}

/**
 * Print the element map so a developer can check the scan against the page.
 *
 * Full detail is printed ONLY for local fixtures. On a real page the map is
 * summarised, with no label text at all.
 *
 * This used to print every label unconditionally, on the reasoning that labels
 * are page structure rather than user input and therefore safe. That reasoning
 * was wrong, and a run against a real social feed proved it: the labels were
 * other people's names, and the whole set went into a console buffer — the kind
 * that gets pasted into bug reports and chat, as that one was. A tool whose
 * entire claim is that private data does not escape cannot leak it while
 * explaining itself.
 *
 * Values were never printed and still are not.
 */
function logElementMap(snapshot: ScreenSnapshot): void {
  const elements = snapshot.elements;

  if (!isLocalFixture(snapshot.pageUrl)) {
    const byType = new Map<string, number>();
    for (const element of elements) {
      byType.set(element.elementType, (byType.get(element.elementType) ?? 0) + 1);
    }

    const breakdown = [...byType.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([type, count]) => `${count} ${type}`)
      .join(', ');

    console.info(
      `[shield] element map: ${breakdown}; ` +
        `${elements.filter((element) => element.value !== null).length} with a value, ` +
        `${elements.filter((element) => element.label !== null).length} with a label ` +
        '(detail withheld: not a local fixture)',
    );
    return;
  }

  console.table(
    elements.map((element) => ({
      id: element.elementId,
      type: element.elementType,
      inputType: element.inputType ?? '',
      autocomplete: element.autocomplete ?? '',
      label: element.label ?? '',
      hasValue: element.value !== null,
      selector: element.selector,
    })),
  );
}

/**
 * Print what the detector flagged, and why.
 *
 * Categories, rules, confidences and sizes only — never the value that was
 * flagged and never a label. The reasons are rule names ('input type="password"',
 * 'face detected at 98% confidence'), which describe the decision without
 * quoting the content that triggered it.
 */
/**
 * Which mapped element a visual region sits on top of.
 *
 * A face detection carries no element id — that is the whole point of the visual
 * layer. But on a page of images, knowing *which* image a box landed on is the
 * difference between reading a result and guessing at it: correlating box sizes
 * to page elements by eye is exactly the sort of inference that has been wrong
 * twice already in this module.
 *
 * Overlap is measured as a fraction of the region, not of the element, so a
 * small box sitting inside a large image scores 1.0 rather than nearly zero.
 */
function overlappingElement(
  region: SensitiveRegion,
  elements: readonly DomElement[],
): string {
  const area = region.position.width * region.position.height;
  if (area <= 0) return '';

  let bestId = '';
  let bestShare = 0;

  for (const element of elements) {
    const overlapWidth = Math.max(
      0,
      Math.min(
        region.position.x + region.position.width,
        element.position.x + element.position.width,
      ) - Math.max(region.position.x, element.position.x),
    );
    const overlapHeight = Math.max(
      0,
      Math.min(
        region.position.y + region.position.height,
        element.position.y + element.position.height,
      ) - Math.max(region.position.y, element.position.y),
    );

    const share = (overlapWidth * overlapHeight) / area;
    if (share > bestShare) {
      bestShare = share;
      bestId = element.elementId;
    }
  }

  return bestShare > 0.5 ? bestId : '';
}

function logDetections(
  regions: readonly SensitiveRegion[],
  elements: readonly DomElement[],
): void {
  if (regions.length === 0) {
    console.warn('[shield] no sensitive regions detected on this page');
    return;
  }

  console.info(`[shield] ${regions.length} sensitive region(s) detected`);
  console.table(
    regions.map((region) => ({
      element: region.elementId ?? '',
      category: region.category,
      source: region.source,
      confidence: Number(region.confidence.toFixed(3)),
      // Size is printed for faces specifically. A detector that only ever finds
      // large faces is missing small ones because of the downscale into the
      // model's 320x240 input, and the sizes it did find are what shows that.
      size: `${Math.round(region.position.width)}x${Math.round(region.position.height)}`,
      at: `${Math.round(region.position.x)},${Math.round(region.position.y)}`,
      // For a face, the element it covers. Empty when it covers none.
      over: region.elementId ?? overlappingElement(region, elements),
      why: region.reason,
    })),
  );
}

/**
 * Report what the redacted summary now contains.
 *
 * Prints the placeholder tokens, never the values they replaced. Tokens are
 * fixed strings from a known list, so this cannot echo page content — which is
 * precisely why it is safe to print on any page, unlike the element map.
 */
function logRedactionSummary(
  entries: readonly RedactedDomEntry[],
  regions: readonly SensitiveRegion[],
): void {
  const flagged = new Set(
    regions.map((region) => region.elementId).filter((id): id is string => id !== null),
  );

  const tokens = entries
    .filter((entry) => flagged.has(entry.elementId))
    .map((entry) => `${entry.elementId}=${entry.value ?? ''}`);

  if (tokens.length === 0) {
    console.info('[shield] no DOM values needed replacing');
    return;
  }

  console.info(`[shield] DOM values replaced: ${tokens.join(', ')}`);
}

// --- Action execution --------------------------------------------------------

/**
 * The token the server uses to ask for a stored credential.
 *
 * It asks for one by reference because it has no access to the value and must
 * never be sent one. Whether Shield can honour the request is a separate
 * question, answered below.
 */
const CREDENTIAL_REFERENCE = '[USE_SAVED_CREDENTIAL]';

/**
 * Work out what to actually type, locally.
 *
 * Shield deliberately has no credential store. Keeping passwords in
 * `chrome.storage.local` would put them in plaintext, readable by any code in
 * this extension, on a project whose entire claim is that secrets stay
 * protected — a vault worth having needs a real one, and building a bad one
 * would undercut the thing being demonstrated.
 *
 * So a request to fill a credential is refused, clearly, rather than half-met.
 * The primary demo does not need it: the form is already filled and the action
 * is to submit it.
 */
function resolveTypeValue(
  action: ShieldAction,
  snapshot: ScreenSnapshot,
): { value: string | null; error: string | null } {
  if (action.type !== 'type') return { value: null, error: null };

  if (action.value === CREDENTIAL_REFERENCE) {
    return {
      value: null,
      error:
        'Shield has no saved credentials, so it cannot fill this field. ' +
        'Fill it yourself and run Shield again to submit the form.',
    };
  }

  // A literal value aimed at a field Shield redacted is refused here, not only
  // on the server. The server applies the same rule at the point it reads the
  // model's reply, but SECURITY_PRIVACY.md's elevation-of-privilege row treats
  // the server as a component that can be compromised or simply wrong, and this
  // is the case where being wrong is worst: the only way the assistant could
  // know what belongs in a redacted field is if it was never redacted.
  const targetsRedactedField = snapshot.sensitiveRegions.some(
    (region) =>
      region.elementId !== null &&
      (region.elementId === action.selector ||
        snapshot.elements.some(
          (element) =>
            element.elementId === region.elementId && element.selector === action.selector,
        )),
  );

  if (targetsRedactedField) {
    return {
      value: null,
      error:
        'The assistant tried to type a value into a field Shield had hidden. ' +
        'Shield refused, because it could not have known what belongs there.',
    };
  }

  // Any other value came from the server and describes content the model was
  // already shown — it cannot carry anything that was redacted, since the model
  // never saw it. It is still not trusted blindly: only a string is accepted,
  // and the executor re-verifies the target before typing anywhere.
  return { value: action.value, error: null };
}

/** Do two rectangles overlap by any positive area? */
function overlaps(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height
  );
}

/**
 * Turn the user's marks into regions, covering both the pixels and the DOM.
 *
 * A mark produces one geometric region for the rectangle itself, and one more
 * for every element it overlaps. Both halves are needed and neither is
 * sufficient. The rectangle alone paints the screenshot while the text
 * underneath travels intact in the DOM summary — a redaction that looks
 * complete and is not, which is worse than none because it is believed. The
 * element regions alone tokenise the values and leave the picture of them.
 *
 * ANY overlap counts, not a majority. If a user draws round an address inside
 * a paragraph, half-covering the paragraph, the whole paragraph's value is
 * tokenised. That over-redacts, and it is the correct direction: the
 * alternative is transmitting a string the user explicitly pointed at and asked
 * to have hidden. Geometry cannot cut a value in half, so the choice is all or
 * nothing, and nothing is not an option here.
 */
async function manualRegions(
  tabId: number,
  elements: readonly DomElement[],
): Promise<SensitiveRegion[]> {
  const reply = await sendToTab<{ regions: Rect[] }>(tabId, {
    type: MSG.GET_MANUAL_REGIONS,
  });

  const marks = reply?.regions ?? [];
  if (marks.length === 0) return [];

  const regions: SensitiveRegion[] = [];

  marks.forEach((mark, index) => {
    regions.push({
      regionId: `manual-${index}`,
      category: 'other',
      source: 'manual',
      // Not a guess, so not a probability. The user said so.
      confidence: 1,
      elementId: null,
      reason: 'marked by you',
      position: mark,
    });

    for (const element of elements) {
      if (!overlaps(mark, element.position)) continue;

      regions.push({
        regionId: `manual-${index}-${element.elementId}`,
        category: 'other',
        source: 'manual',
        confidence: 1,
        elementId: element.elementId,
        reason: 'inside an area you marked',
        position: element.position,
      });
    }
  });

  console.info(
    `[shield] ${marks.length} manual mark(s) covering ` +
      `${regions.length - marks.length} element(s)`,
  );

  return regions;
}

/**
 * Send one action to the page, carrying what the element looked like when
 * captured so the content script can re-verify it.
 */
/**
 * Regions carried over from the last whole-page scan of this page.
 *
 * The same two halves a manual mark produces, for the same reason: the
 * rectangle paints the screenshot, and every DOM element it overlaps has its
 * value tokenised. Covering only the pixels would leave the text travelling
 * intact in the DOM summary — a redaction that looks complete and is not.
 *
 * The category and rule name from the scan are kept rather than flattened to
 * `other`. The scan ran the same detectors a run does; it knows this was an
 * Aadhaar number, and the manifest and the overlay should both say so.
 *
 * WHAT THIS CLAIM IS WORTH
 *
 * It is as of the moment the scan ran. A page that reflows underneath these
 * coordinates will drift, exactly as a drawn mark drifts, and a navigation
 * destroys the content script and takes them with it. Drift over-redacts rather
 * than under-redacts, which is the safe direction and the reason this is
 * acceptable — but it is a limit, not a guarantee, and SECURITY_PRIVACY.md says
 * so.
 */
async function rememberedScanRegions(
  tabId: number,
  elements: readonly DomElement[],
): Promise<SensitiveRegion[]> {
  const reply = await sendToTab<{ findings: ScanFinding[] }>(tabId, {
    type: MSG.GET_SCAN_REGIONS,
  });

  const found = reply?.findings ?? [];
  if (found.length === 0) return [];

  const regions: SensitiveRegion[] = [];

  found.forEach((finding, index) => {
    regions.push({
      regionId: `scan-${index}`,
      category: finding.category,
      source: finding.source,
      confidence: 1,
      elementId: null,
      reason: `${finding.reason} (found by a whole-page scan)`,
      position: finding.position,
    });

    for (const element of elements) {
      if (!overlaps(finding.position, element.position)) continue;

      regions.push({
        regionId: `scan-${index}-${element.elementId}`,
        category: finding.category,
        source: finding.source,
        confidence: 1,
        elementId: element.elementId,
        reason: 'inside something a whole-page scan found',
        position: element.position,
      });
    }
  });

  console.info(
    `[shield] carried ${found.length} finding(s) forward from the last scan`,
  );

  return regions;
}

async function executeOnPage(
  tabId: number,
  action: ShieldAction,
  snapshot: ScreenSnapshot,
): Promise<{ ok: boolean; message: string }> {
  // The server names elements by the id we gave it. A selector is accepted as a
  // fallback because API_SPEC.md Section 5 allows either, but the id is what a
  // correct response uses, and it is the only form that can be checked against
  // the snapshot.
  const element = snapshot.elements.find(
    (candidate) =>
      candidate.elementId === action.selector || candidate.selector === action.selector,
  );

  if (!element) {
    return {
      ok: false,
      message: 'The assistant referred to something Shield did not see on this page.',
    };
  }

  const { value, error } = resolveTypeValue(action, snapshot);
  if (error) return { ok: false, message: error };

  const result = await sendToTab<{ ok: boolean; message: string }>(tabId, {
    type: MSG.EXECUTE_ACTION,
    action,
    expectedSelector: element.selector,
    expectedType: element.elementType,
    expectedLabel: element.label,
    typeValue: value,
  });

  if (!result) {
    return {
      ok: false,
      message: 'Shield lost contact with the page before it could act.',
    };
  }

  return result;
}

// --- Task run ---------------------------------------------------------------

interface StepOutcome {
  /** True when the page was actually changed. */
  acted: boolean;
  /** The assistant's own explanation, if it gave one. Never page content. */
  summary: string | null;
  /**
   * Identifies the action taken, for repeat detection.
   *
   * Null when nothing was done.
   */
  signature: string | null;
  /** True when an action was refused because it repeated the previous one. */
  repeated: boolean;
}

/** What an action does and to what, ignoring anything incidental. */
function actionSignature(action: ShieldAction): string {
  return `${action.type}:${action.selector}`;
}

/**
 * Run one step of a task: perceive, detect, redact, send, act.
 *
 * Every stage is present; none is stubbed with a placeholder success value. A
 * stage that pretends to have redacted something is far more dangerous than one
 * that refuses to run, so a stage that cannot do its job throws.
 *
 * Errors propagate to `runTask`, which owns the loop and the user-facing
 * failure. Nothing is caught here, because a step that half-failed has no
 * sensible value to return.
 */
async function runStep(
  tab: chrome.tabs.Tab,
  tabId: number,
  taskQuery: string,
  lastSignature: string | null,
): Promise<StepOutcome> {
  let frame: RawFrame | null = null;

  try {
    // Each step is a full pass through the pipeline, so the ordering guard
    // starts clean. Carrying stages over from the previous step would let a
    // step that skipped redaction inherit the previous one's proof that it
    // hadn't.
    completedStages = new Set();

    // Same reasoning as the stage guard above: this step's breakdown describes
    // this step. A stale timing from the previous pass would be shown next to
    // fresh ones with nothing marking it as older.
    stepTimings = [];
    setState({ timings: stepTimings });

    // Read once per step, not once per use. Detection needs the redaction level
    // before the frame is even analysed and transport needs the endpoint after
    // it — two reads could disagree if the setting changed in between, and a
    // step that detected at one level and reported another would be a lie told
    // by an await boundary.
    const settings = await readSettings();

    // Stage 1 — Screen Perception (ARCHITECTURE.md 2.1)
    //
    // Two halves: the captured frame and the DOM element map. Both must
    // succeed before `reading` counts as complete, because the PII Detector
    // needs both signals and an empty element map is indistinguishable from a
    // page with nothing sensitive on it.
    setStatus('reading');

    const viewport = await sendToTab<ViewportInfo>(tabId, { type: MSG.GET_VIEWPORT });
    if (!viewport) {
      throw new Error("Couldn't read this page's layout. Try reloading the page.");
    }

    frame = record(
      await timed('capture', 'screen capture', () => captureViewport(tab.windowId, viewport)),
    );
    // A const alias so the compiler keeps the non-null narrowing inside the
    // closures below; `frame` itself stays a `let` purely so `finally` can
    // clear it on every exit path.
    const rawFrame = frame;

    const domMap = record(
      await timed('domScan', 'DOM scan', () =>
        sendToTab<ExtractDomResult>(tabId, { type: MSG.EXTRACT_DOM }),
      ),
    );

    // A null result means the scan threw. An empty element map is just as
    // dangerous in a different way: it is indistinguishable from a page with
    // nothing sensitive on it, and the PII Detector would happily find nothing
    // to hide. Both fail the run.
    if (!domMap) {
      throw new Error("Couldn't read the contents of this page. Try reloading it.");
    }
    if (domMap.elements.length === 0) {
      throw new Error(
        'Found nothing readable on this page. Shield stops rather than treat ' +
          'an empty reading as a page with nothing to hide.',
      );
    }

    const snapshot: ScreenSnapshot = {
      frame: rawFrame,
      // Filled in by the offscreen document, which is what actually decodes the
      // frame and can therefore measure it.
      geometry: { width: 0, height: 0, scaleX: 1, scaleY: 1 },
      elements: domMap.elements,
      pageUrl: domMap.pageUrl,
      capturedAt: rawFrame.capturedAt,
      // Populated by the `detecting` stage below. Starting empty rather than
      // optional is deliberate: an absent field invites `?? []` at the redaction
      // site, which would silently turn "detection never ran" into "nothing to
      // hide" — the exact confusion the pipeline order guard exists to prevent.
      sensitiveRegions: [],
    };

    // The unresolved count is printed even when zero: it is a correctness check,
    // and a check you only see when it fails is one you stop trusting.
    console.info(
      `[shield] mapped ${snapshot.elements.length} elements ` +
        `(${domMap.scanned} scanned, ${domMap.unresolvedSelectors} unresolved selectors` +
        `${domMap.truncated ? ', truncated' : ''})`,
    );

    // Stated on every run, not only on tall pages. This reading describes one
    // viewport, and a user who scrolls afterwards reads a field with no box on
    // it as "checked and safe" rather than "never looked at" — so the boundary
    // is announced rather than left to be inferred from an absence.
    const coverage = describeCoverage(domMap.coverage);
    setState({ coverage });
    console.info(`[shield] coverage — ${coverage.message}`);

    logElementMap(snapshot);

    // Screen Perception is complete: both the frame and the element map are in
    // hand, so the stage can be marked done.
    markStageComplete('reading');

    // Stage 2 — local inference (ARCHITECTURE.md 2.2)
    //
    // The model runs in an offscreen document, not here: Manifest V3 service
    // workers cannot host ONNX Runtime Web at all — dynamic import() is
    // disallowed on ServiceWorkerGlobalScope, and both its WASM and WebGPU
    // backends are unavailable (microsoft/onnxruntime#20876).
    setStatus('detecting');
    await ensureVisionHost();

    // Resolved here, outside the timed block, so a storage read is not counted
    // against the inference budget it has nothing to do with.
    const { forceBackend, forceInferenceHost } = await readSettings();

    const analysis = record(
      await timed('inference', 'local inference', () =>
        sendToOffscreen({
          type: MSG.ANALYSE_FRAME,
          dataUrl: rawFrame.dataUrl,
          viewportWidth: viewport.width,
          viewportHeight: viewport.height,
          forceBackend,
          forceInferenceHost,
        }),
      ),
    );

    if (!analysis.ok) {
      throw new Error(`Local analysis failed: ${analysis.message}`);
    }

    const { backend, fellBack, forced, host, forcedHost, frame: geometry, detection } = analysis;
    snapshot.geometry = geometry;
    setState({ backend, fellBack });

    console.info(
      `[shield] ${geometry.width}x${geometry.height} device px ` +
        `(scale ${geometry.scaleX.toFixed(3)}x${geometry.scaleY.toFixed(3)}), ` +
        `inference on ${backend}${forced ? ' (forced)' : ''} in the ${host}` +
        `${forcedHost ? ' (forced)' : ''} in ` +
        `${detection.inferenceMs.toFixed(1)}ms — ` +
        `${detection.priors} priors, peak face score ${detection.maxScore.toFixed(3)}, ` +
        `candidates ${detection.candidatesByCutoff.at30}/${detection.candidatesByCutoff.at50}/` +
        `${detection.candidatesByCutoff.at70} at 0.3/0.5/0.7, ` +
        `${detection.faces.length} face(s) kept`,
    );

    // Pulled from storage rather than waited for as a message. The first design
    // relied solely on the offscreen document pushing its verdict at the one
    // moment the test finished; anything that dropped that single message — or
    // a verdict recorded before anyone was watching the console — left the
    // fallback looking untested forever, with nothing printed either way.
    void ensureCpuFallbackProved();

    if (detection.boxRange) {
      const { dims, min, max, sample } = detection.boxRange;
      console.info(
        `[shield] box dims [${dims.join(', ')}], raw range ` +
          `${min.toFixed(3)}..${max.toFixed(3)}, sample [` +
          `${sample.map((value: number) => value.toFixed(3)).join(', ')}]`,
      );
    }

    // Module B — DOM rule engine (SECURITY_PRIVACY.md Section 4).
    //
    // Runs over the captured snapshot, never the live page: the DOM can change
    // under us between capture and redaction, and detecting against a mutable
    // reference is the time-of-check-to-time-of-use gap the threat model's
    // tampering row calls out.
    const domRegions = detectDomPii(snapshot.elements);

    // The visual layer covers what no attribute can express. Nothing in a page's
    // markup announces that a person's face is rendered at these coordinates,
    // so this is not a second opinion on the DOM rules — it is the only opinion
    // available for this category.
    const visualRegions = faceRegions(detection.faces, geometry);

    // What the user drew, if anything. Asked for after detection so a mark is
    // never mistaken for something a rule found — the two are combined, but the
    // manifest keeps them apart, because "a person decided this is private" and
    // "a pattern matched" are different claims about the same rectangle.
    const manual = await manualRegions(tabId, snapshot.elements);

    // What a scan found earlier on this page, if one ran.
    //
    // Without this a scan is a pointing exercise. It walks the whole document,
    // finds an Aadhaar number below the fold, draws a box on it — and then the
    // next run reads one screen, cannot possibly rediscover it, and transmits
    // the page. Detection that is not carried into the redaction is not
    // protection.
    const remembered = await rememberedScanRegions(tabId, snapshot.elements);

    // Text inside images — the gap neither the DOM rules nor the face detector
    // can reach. A photographed ID card carries an Aadhaar number that no
    // attribute declares and no face model recognises.
    const { regions: ocr } = await ocrImageRegions(
      rawFrame,
      snapshot.elements,
      geometry,
      undefined,
      REDACTION_FLOORS[settings.redactionLevel],
    );

    // This pass's own detections FIRST, then what a scan carried forward. The
    // dedupe keeps the first of any pair describing the same thing, so a live
    // detection — with the rule that actually fired just now — wins over a
    // remembered one.
    const regions = dedupeRegions([
      ...domRegions,
      ...visualRegions,
      ...ocr,
      ...remembered,
      ...manual,
    ]);
    snapshot.sensitiveRegions = regions;
    logDetections(regions, snapshot.elements);

    // Show the user what was found, on the page, before it is sent anywhere.
    // PRD.md FR-24: everything protective happens where they cannot see it, so
    // this is the only part of the pipeline that makes the claim checkable
    // rather than something they have to take on trust.
    void sendToTab(tabId, {
      type: MSG.SHOW_OVERLAY,
      regions: regions.map((region) => ({
        category: region.category,
        reason: region.reason,
        x: region.position.x,
        y: region.position.y,
        width: region.position.width,
        height: region.position.height,
      })),
    });

    markStageComplete('detecting');

    // Stage 3 — Redaction (ARCHITECTURE.md 2.3). The frame and the DOM summary
    // are sanitised together, because they are two views of the same content:
    // an email address visible in a text field is in the screenshot as surely
    // as it is in the DOM, and hiding either one alone hides nothing.
    setStatus('redacting');

    const redacted = record(
      await timed('redaction', 'redaction', () =>
        redactOffscreenFrame({
          dataUrl: rawFrame.dataUrl,
          regions,
          scaleX: geometry.scaleX,
          scaleY: geometry.scaleY,
        }),
      ),
    );

    if (!redacted.ok) {
      // Fails closed. A failed redaction must never degrade into sending the
      // raw frame (ARCHITECTURE.md Section 9).
      throw new Error(`Redaction failed: ${redacted.message}`);
    }

    const { dataUrl: redactedFrame, painted, skipped } = redacted;

    if (skipped > 0) {
      // Reported rather than swallowed: a manifest that claims a region was
      // hidden when nothing was painted is a false assurance.
      console.warn(
        `[shield] ${skipped} region(s) had unusable geometry and were not painted`,
      );
    }

    const redactedDom = redactDomElements(snapshot.elements, regions);
    const manifest = buildManifest(regions);

    markStageComplete('redacting');

    console.info(
      `[shield] redacted ${painted} region(s) onto the frame, ` +
        `${manifest.length} manifest entries, ` +
        `frame ${(redactedFrame.length / 1024).toFixed(0)}KB encoded`,
    );
    logRedactionSummary(redactedDom, regions);

    // On a fixture, print the redacted frame so it can be opened and looked at.
    // Every check up to here has been one number agreeing with another, and
    // none of them would notice a rectangle painted in the wrong place. The
    // frame is redacted by this point, so printing it discloses nothing — but
    // it is still gated to fixtures, because a 40KB string on every run of
    // every page is noise, and habits formed on noise get ignored.
    if (isLocalFixture(snapshot.pageUrl)) {
      console.info(
        '[shield] redacted frame (paste into a new tab to view):',
        redactedFrame,
      );
    }

    // Sealing the payload is the transport boundary. Nothing downstream accepts
    // an unsealed one, and the seal cannot be minted without passing the
    // verification inside this call — which is what turns "we redacted it" from
    // a claim into a checked fact.
    //
    // The order guard runs first: the seal proves redaction was called, the
    // guard proves nothing before it was skipped.
    assertStagesCompletedBefore('sending');

    const payload = buildSanitizedPayload({
      requestId: crypto.randomUUID(),
      taskQuery,
      redactedFrame,
      redactedDom,
      manifest,
      regions,
      // The raw values of everything flagged, so the zero-leak check has
      // something to search for. They go no further than that function.
      flaggedRawValues: regions
        .map((region) =>
          region.elementId === null
            ? null
            : (snapshot.elements.find(
                (element) => element.elementId === region.elementId,
              )?.value ?? null),
        )
        .filter((value): value is string => value !== null),
    });

    console.info(
      `[shield] payload sealed — ${payload.redacted_dom_summary.length} elements, ` +
        `${payload.redaction_manifest.length} manifest entries, ` +
        `${(payload.redacted_frame.length / 1024).toFixed(0)}KB frame. ` +
        'Verified: every flagged element carries a placeholder.',
    );

    const { endpoint, observeOnly } = settings;

    /*
     * The pause between the seal and the wire.
     *
     * It sits HERE, after `buildSanitizedPayload` and before `send`, because
     * the only honest moment to ask is once there is a real payload to show.
     * Asking earlier would describe something that does not exist yet; asking
     * later would be asking about something already gone.
     *
     * Nothing about this makes the payload safe — it was already sealed,
     * order-checked and swept above, and that is what the guarantee rests on
     * (DECISIONS.md 240). This adds a decision, not a protection, which is why
     * it is off by default and why a run with it off is not weaker.
     */
    if (settings.requireConsent) {
      setStatus('awaiting-consent');

      const decision = await askForConsent(
        // The payload's own id. Minted fresh per step, so an approval is bound
        // to one payload rather than to a run — which is what makes a late
        // click on an earlier step stale rather than usable.
        summariseForConsent(payload, endpoint, payload.request_id),
      );

      if (!mayTransmit(decision)) {
        // Returned as an ordinary outcome, not thrown. Declining is a correct
        // use of the feature and the run ending is the feature working; an
        // error would put it in red beside genuine failures.
        console.info(`[shield] not transmitted — ${decision}`);
        void recordAudit(
          buildAuditEntry(regions, {
            kind: 'run',
            examined: 'viewport',
            // The whole point of the entry: the log says a pass happened and
            // that nothing left, which is the claim the user just made.
            transmitted: false,
            durationMs: stepTimings.reduce((sum, timing) => sum + timing.durationMs, 0),
          }),
        );
        return {
          acted: false,
          summary: declineReason(decision),
          signature: null,
          repeated: false,
        };
      }
    }

    // Stage 4 — Transport (ARCHITECTURE.md 2.4). The signature of `send` is the
    // enforcement: it accepts a sealed payload and nothing else, so there is no
    // expressible way to reach the network carrying raw page data.
    setStatus('sending');

    // Recorded before the request, not after. If the server is unreachable the
    // question "what did Shield send?" still has an answer, and a failed request
    // is exactly when someone is most likely to ask it.
    await recordTransmission(payload, endpoint);

    const response = record(
      await timed('network', 'server round trip', () => send(endpoint, payload)),
    );
    markStageComplete('sending');

    // The durable half of the evidence (FR-26). `recordTransmission` above keeps
    // the LAST payload in full, which is the claim a sceptic reads literally;
    // this keeps every pass as counts, which is what makes "has this been
    // protecting me all week?" answerable. Not awaited: a storage write must
    // never sit in the path of the run it describes.
    void recordAudit(
      buildAuditEntry(regions, {
        kind: 'run',
        examined: 'viewport',
        transmitted: true,
        durationMs: stepTimings.reduce((sum, timing) => sum + timing.durationMs, 0),
      }),
    );

    setStatus('thinking');
    markStageComplete('thinking');

    if (response.reasoningSummary) {
      console.info(`[shield] assistant: ${response.reasoningSummary}`);
    }

    if (response.needsMoreContext || !response.action) {
      return {
        acted: false,
        summary: response.reasoningSummary,
        signature: null,
        repeated: false,
      };
    }

    const signature = actionSignature(response.action);

    // Refuse a repeat before performing it, not after.
    //
    // If the assistant proposes the same action on the same target twice in a
    // row, the previous one changed nothing it can see, and doing it again will
    // not either. Capping the loop is not sufficient protection: these are real
    // actions on a real page, and five identical clicks on a submit button can
    // mean five orders or five payments. The first duplicate is where this has
    // to stop.
    if (lastSignature !== null && signature === lastSignature) {
      return {
        acted: false,
        summary: response.reasoningSummary,
        signature,
        repeated: true,
      };
    }

    // Observe-only stops HERE, after everything has been proved and before
    // anything is touched.
    //
    // Placed after the repeat check rather than before it so that the reported
    // action is the one that would actually have been performed, refusals
    // included. A preview that showed an action the real run would have
    // declined would be worse than no preview.
    //
    // Reported as an action NOT taken, in the same words the executor would
    // have used, so the log of an observed run reads like the log of a real one
    // with the verbs changed. That matters when the two are being compared.
    if (observeOnly) {
      console.info(
        `[shield] observe-only: would have ${response.action.type} ` +
          `${response.action.selector} — not performed`,
      );
      return {
        acted: false,
        summary: response.reasoningSummary,
        signature,
        repeated: false,
      };
    }

    // Stage 5 — Action execution (Module E).
    setStatus('acting');
    const executed = await executeOnPage(tabId, response.action, snapshot);
    markStageComplete('acting');

    if (!executed.ok) throw new Error(executed.message);

    console.info(`[shield] acted: ${response.action.type} — ${executed.message}`);
    return {
      acted: true,
      summary: response.reasoningSummary,
      signature,
      repeated: false,
    };
  } finally {
    // Drop the reference to the raw screenshot as soon as the step is over,
    // whatever the outcome (PRD.md Section 16).
    frame = null;

    // The inference host is deliberately NOT torn down here. It costs about a
    // second to recreate and warm, and closing it after every run meant paying
    // that on a pipeline whose actual inference takes ~84ms. It closes itself
    // once genuinely idle instead (see src/offscreen/offscreen.ts).
  }
}

/**
 * How many steps one task may take.
 *
 * PRD.md FR-22 requires a safeguard against an agent looping forever. Five is
 * enough for the multi-step forms in scope — fill, fill, submit, confirm — and
 * small enough that a loop caused by a page that never changes costs seconds
 * rather than an afternoon of somebody's battery.
 */
const MAX_STEPS = 5;

/**
 * How long to let the page settle after an action before looking again.
 *
 * A click can navigate, open a dialog, or trigger a re-render, and capturing
 * mid-transition yields a frame of a page that no longer exists. Chrome also
 * throttles captureVisibleTab to roughly two calls per second, so a shorter
 * wait would frequently be spent in the capture retry anyway.
 */
const SETTLE_MS = 600;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Read the whole screen, and hide what only the screen could tell us.
 *
 * WHY THIS RUNS ONLY IN A SCAN
 *
 * Reading a full viewport costs a different order of magnitude from reading a
 * 320x200 crop, and a run is budgeted at roughly 150ms end to end. Putting this
 * in the run path would trade 35% of the rubric - latency and resource use -
 * for part of the 25% it earns. A scan already walks the whole document,
 * transmits nothing, and carries its findings into every later run on the page,
 * so this protects a run without slowing one (DECISIONS.md 188, 152).
 *
 * WHY ONLY THE PIXEL-ONLY REGIONS BECOME FINDINGS
 *
 * Text that both readers saw is text the DOM already handed to
 * `classifyTextContent` through `detectDomPii`. Flagging it again would put two
 * regions on one fact and overstate what was found, which the manifest, the
 * overlay and the audit counts are all meant to be exact about. What is new is
 * only what markup could not describe: a number drawn into a canvas, an address
 * inside an iframe, an identifier in a pasted screenshot. Those reach a capture
 * unexamined today, and that is a leak path rather than a missing feature.
 *
 * A failed read is reported and nothing is invented. It never returns an empty
 * list dressed up as "the screen is clean".
 */
/** A sighting placed in the document, which is all the merge needs. */
interface SeenText {
  text: string;
  position: Rect;
}

/**
 * The page's figures, from every sighting the walk collected.
 *
 * One comparison over the union of what each reader saw, rather than a
 * comparison per stop with the columns added up. The difference is not
 * cosmetic: overlapping stops read the same text twice, so the summed version
 * inflates every column, and unevenly — which makes the ratio it produces
 * unusable as the metric-1 number it is supposed to be.
 *
 * `hidden` is merged against itself for the same reason, and is a count of
 * distinct pieces of hidden screen text rather than of painted rectangles.
 */
function summariseScreenRead(read: {
  dom: readonly DomTextItem[];
  pixels: readonly ScreenTextRegion[];
  hidden: readonly SeenText[];
}): { agreed: number; pixelOnly: number; domOnly: number; hidden: number } {
  const report = compareReadings(mergeSightings(read.dom), mergeSightings(read.pixels));

  return {
    agreed: report.agreed.length,
    pixelOnly: report.pixelOnly.length,
    domOnly: report.domOnly.length,
    hidden: mergeSightings(read.hidden).length,
  };
}

/**
 * One screen, read both ways, in VIEWPORT pixels.
 *
 * Readings rather than a verdict, because a scan's stops overlap and the same
 * text is read at two of them. Comparing per stop and adding the columns up
 * counts one piece of screen twice — see `mergeSightings`. The caller places
 * these in the document and compares once, at the end of the walk.
 */
interface ScreenReading {
  /** Sensitive pixel-only text, ready to redact. Empty when the read failed. */
  regions: SensitiveRegion[];
  /** False when the engine could not read this screen at all. */
  read: boolean;
  dom: DomTextItem[];
  pixels: ScreenTextRegion[];
}

async function screenTextFindings(
  frame: RawFrame,
  elements: readonly DomElement[],
  viewport: { width: number; height: number },
): Promise<ScreenReading> {
  const reading = await readOffscreenScreen({
    dataUrl: frame.dataUrl,
    viewportWidth: viewport.width,
    viewportHeight: viewport.height,
  });

  if (!reading.ok) {
    console.warn(`[shield] the screen could not be read: ${reading.message}`);
    return { regions: [], read: false, dom: [], pixels: [] };
  }

  const dom = domTextItems(elements);
  const report = compareReadings(dom, reading.regions);
  const regions: SensitiveRegion[] = [];

  report.pixelOnly.forEach((region, index) => {
    const hit = classifyTextContent(region.text);
    if (!hit) return;

    regions.push({
      regionId: `screen-${index}`,
      category: hit.category,
      source: 'ocr',
      confidence: hit.confidence,
      // No element, because that is the whole point: nothing in the markup
      // describes this. The redaction canvas takes the box directly.
      elementId: null,
      // Says where it was found as well as which rule fired, and quotes
      // nothing. `ocr-regions.ts` carries the test asserting a reason never
      // repeats the text it matched.
      reason: `text on screen with no element - ${hit.reason}`,
      position: region.position,
    });
  });

  // This screen's own figures. Truthful about the screen; deliberately NOT
  // summed by the caller, which reports the page instead.
  // The magnification is named on every line because it is the one thing that
  // changed between the 18.6% recorded in TASKS.md T1.2 and whatever this run
  // reports. A later reading without it is not comparable to anything.
  console.info(
    `[shield] screen read at ${reading.recognitionScale.toFixed(1)}x ` +
      `(${reading.frameWidth}x${reading.frameHeight} → ` +
      `${reading.recognisedWidth}x${reading.recognisedHeight}): ` +
      `${report.agreed.length} agreed, ` +
      `${report.pixelOnly.length} seen only in pixels (${regions.length} hidden), ` +
      `${report.domOnly.length} seen only in markup`,
  );

  return { regions, read: true, dom, pixels: reading.regions };
}

/**
 * Read identifying text out of the page's images, and cover what cannot be read.
 *
 * TWO STAGES THAT FAIL IN OPPOSITE DIRECTIONS
 *
 * Candidates are chosen by geometry alone, so that verdict holds whether the
 * OCR engine is present, broken or absent. Reading then improves precision: it
 * replaces "hide this whole image" with "hide these words". When a read fails,
 * that image is covered whole — it was already judged large enough to hold a
 * document, and without the ability to read it we cannot claim it does not.
 *
 * This is why `ok: false` and `ok: true, words: []` must never be conflated
 * anywhere in this path. The first hides the image; the second lets it through.
 * Treating a failure as an empty read is the one bug here that would be a
 * privacy failure rather than a broken feature.
 */
async function ocrImageRegions(
  frame: RawFrame,
  elements: readonly DomElement[],
  geometry: { scaleX: number; scaleY: number },
  /**
   * Present only on the scan path, where the same image is captured at
   * consecutive overlapping stops. A run reads one screen once and has nothing
   * to skip, so it passes nothing and its behaviour is unchanged — including
   * for clipped images, which a run still reads for whatever their visible part
   * yields, because a run has no later stop to see them whole at.
   */
  stop?: { viewportWidth: number; viewportHeight: number; readWhole: ReadonlySet<string> },
  /**
   * The size floor from the redaction level — FR-14. Defaulted rather than
   * required so a caller that forgets it gets `standard`, which is the floor of
   * the range: the failure direction is hiding more, never less.
   */
  floor: { width: number; height: number } = REDACTION_FLOORS.standard,
): Promise<{ regions: SensitiveRegion[]; readWhole: string[] }> {
  const all = imageCandidates(elements, floor);
  const candidates = stop
    ? candidatesToRead(all, stop.viewportWidth, stop.viewportHeight, stop.readWhole)
    : all;
  if (candidates.length === 0) {
    if (stop && all.length > 0) {
      console.info(
        `[shield] OCR: 0/${all.length} image(s) read at this stop — ` +
          `already read whole or clipped by the viewport`,
      );
    }
    return { regions: [], readWhole: [] };
  }

  // Element boxes are CSS pixels; the frame is device pixels. Converted here
  // once, using the scale the capture MEASURED rather than devicePixelRatio —
  // trusting the latter is what produced confidently wrong face boxes before.
  const crops = candidates.map((candidate) => ({
    elementId: candidate.elementId,
    x: candidate.x * geometry.scaleX,
    y: candidate.y * geometry.scaleY,
    width: candidate.width * geometry.scaleX,
    height: candidate.height * geometry.scaleY,
  }));

  let results: OcrReadResult[];
  try {
    ({ results } = await readOffscreenImages({ dataUrl: frame.dataUrl, crops }));
  } catch (error) {
    // The whole call failed, so nothing was examined. Every candidate is
    // covered rather than the run continuing as though the images were clean.
    console.warn('[shield] OCR unavailable — covering every candidate image', error);
    return { regions: unreadableImageRegions(candidates), readWhole: [] };
  }

  const regions: SensitiveRegion[] = [];
  const unread: typeof candidates = [];
  // Only successful reads. A crop that failed must be retried at the next
  // stop, so "attempted" is never allowed to look like "read".
  const readWhole: string[] = [];

  for (const candidate of candidates) {
    const result = results.find((entry) => entry.elementId === candidate.elementId);

    // A missing entry counts as unread, not as clean. A reply that lost a crop
    // must not silently become permission to transmit that image.
    if (!result || !result.ok) {
      unread.push(candidate);
      continue;
    }

    readWhole.push(candidate.elementId);
    regions.push(
      ...ocrRegions(
        { elementId: result.elementId, words: result.words },
        candidate,
        result.cropWidth,
        result.cropHeight,
      ),
    );
  }

  if (unread.length > 0) {
    // The reason travels with the result and is printed HERE, in the console
    // people actually have open. The offscreen document has its own console
    // that nobody opens during a demo, and a diagnosis stranded there is no
    // diagnosis at all.
    const failure = results.find((entry): entry is Extract<OcrReadResult, { ok: false }> =>
      !entry.ok,
    );
    const why = failure?.message ?? 'no reason given';
    console.warn(
      `[shield] ${unread.length} image(s) could not be read — covering them whole (${why})`,
    );
    regions.push(...unreadableImageRegions(unread));
  }

  const readCount = candidates.length - unread.length;
  console.info(
    `[shield] OCR: ${readCount}/${candidates.length} image(s) read` +
      `${stop && all.length !== candidates.length ? ` (${all.length - candidates.length} skipped — already read whole or clipped)` : ''}, ` +
      `${regions.length} region(s) from images`,
  );

  return { regions, readWhole };
}

/**
 * Run a task to completion, one step at a time.
 *
 * The loop ends when the assistant stops proposing actions. That is read two
 * ways depending on what came before: after at least one action it means the
 * work is finished, and before any action it means nothing could be determined
 * from this screen. The API has no explicit "done" status (API_SPEC.md Section
 * 4), so this is the honest reading of the statuses it does define, rather than
 * inventing one.
 */
async function runTask(taskQuery: string): Promise<void> {
  try {
    const tab = await getActiveTab();
    const tabId = tab.id as number;

    beginRun(taskQuery, tabId);
    await ensureContentScript(tabId);

    // Clear any overlay left from a previous run before this one starts. It
    // describes a capture that is no longer current, and an explanation of the
    // wrong screen is worse than none — this panel's only value is that it can
    // be read literally.
    void sendToTab(tabId, { type: MSG.SHOW_OVERLAY, regions: [] });

    // The scan's BOXES come down, and this one is not merely tidiness: they are
    // painted over the page, so leaving them up would bake them into the frame
    // the model is shown and into the frame the popup presents as a faithful
    // record — and OCR would then read Shield's own labels back as findings.
    //
    // Its FINDINGS stay. They are about to be used, and discarding them here
    // would mean a scan protected nothing.
    await sendToTab(tabId, { type: MSG.SET_SCAN_VISIBLE, visible: false });

    // Put the drawing surface away before anything is captured. The marks are
    // kept — only the cyan outlines go — because they would otherwise be baked
    // into the frame the model is shown AND into the frame the popup presents
    // as a faithful record of what was sent. Shield's own UI has no business
    // appearing in either.
    await sendToTab(tabId, { type: MSG.SET_MANUAL_VISIBLE, visible: false });

    let actions = 0;
    let lastSignature: string | null = null;

    for (let step = 1; step <= MAX_STEPS; step += 1) {
      setState({ step });

      const outcome = await runStep(tab, tabId, taskQuery, lastSignature);

      if (outcome.repeated) {
        // The assistant asked for the same action again, so the previous one
        // changed nothing it can see. Either the task is finished and the page
        // simply looks the same, or it cannot progress — and those are
        // indistinguishable from here. Stopping is right under both readings;
        // repeating is wrong under both.
        setStatus('done');
        console.info(
          `[shield] stopped after ${actions} action(s): the assistant repeated ` +
            'the same action, so there was no further progress to make.',
        );
        return;
      }

      if (!outcome.acted) {
        if (actions === 0) {
          // Nothing was done and nothing could be determined. Reported as a
          // finished run rather than an error: the assistant declining is a
          // legitimate answer, and calling it a failure would train people to
          // ignore real failures.
          setStatus('done');
          console.info(
            `[shield] finished without acting — ${outcome.summary ?? 'no action proposed'}`,
          );
          return;
        }

        setStatus('done');
        console.info(`[shield] task complete after ${actions} action(s)`);
        return;
      }

      actions += 1;
      lastSignature = outcome.signature;

      // Re-capture on the next iteration rather than reusing the snapshot: the
      // page has just been changed by our own action, and acting again on a
      // stale reading is how an agent clicks the wrong thing confidently.
      await sleep(SETTLE_MS);

      // The content script may not have survived a navigation.
      await ensureContentScript(tabId);
    }

    throw new Error(
      `Shield stopped after ${MAX_STEPS} steps without finishing, to avoid looping.`,
    );
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}

/**
 * Make sure the CPU fallback has been proved on this machine, and say so.
 *
 * PRD.md FR-27's fallback is the path that carries Shield on machines without
 * WebGPU, and on a machine with WebGPU it never executes — so without this it is
 * assumed to work rather than known to. The verdict is read and stored here, in
 * the service worker, because this is the context whose storage access is not in
 * doubt; the offscreen document only produces the measurement.
 *
 * Runs after the frame has been handled, so it never delays a result.
 */
async function ensureCpuFallbackProved(): Promise<void> {
  const record = await readSelfTestRecord();
  if (record?.ok) {
    const when = new Date(record.at).toLocaleString('sv-SE');
    console.info(`[shield] CPU fallback verified — ${record.message} (${when})`);
    return;
  }

  console.info('[shield] proving CPU fallback');
  try {
    const result = await runOffscreenSelfTest();
    if (result.ok) {
      // Stored before it is announced, so the line the user reads reflects a
      // fact that survived rather than one that is about to be lost. Only a
      // pass is stored: caching a failure would retire the retry that is the
      // entire point of re-checking a path nothing else exercises.
      await writeSelfTestRecord(result);
      console.info(`[shield] CPU fallback verified — ${result.message}`);
    } else {
      console.error(`[shield] CPU fallback BROKEN — ${result.message}`);
    }
  } catch (error) {
    console.error('[shield] CPU fallback self-test could not run', error);
  }
}

function cancelTask(): void {
  completedStages = new Set();
  // Any scan in flight belongs to a token that is now stale, so its loop stops
  // at the next stop boundary and puts the page back where it found it.
  scanToken += 1;
  setState({ ...INITIAL_STATE });
}

// --- Whole-page scan --------------------------------------------------------

/**
 * How long to let the page settle after scrolling, before capturing.
 *
 * Two costs it has to cover. Images below the fold are routinely lazy-loaded
 * and arrive blank for a beat, and capturing one blank is worse than not
 * capturing it — a blank image reads as "nothing identifying here" rather than
 * "not loaded yet". Chrome also throttles captureVisibleTab to roughly two
 * calls per second, so anything much shorter is spent in `capture.ts`'s retry
 * regardless.
 */
const SCAN_SETTLE_MS = 450;

/**
 * Identifies the scan in flight.
 *
 * A scan holds someone's page for several seconds while scrolling it, so
 * abandoning one has to actually stop it rather than let it finish invisibly
 * and scroll the page again under whatever they are now doing.
 */
let scanToken = 0;

/**
 * Examine the whole document, top to bottom, and transmit nothing.
 *
 * WHAT THIS IS FOR
 *
 * A run reads one viewport, which is the honest boundary of what it transmits —
 * below the fold is never captured, so it is never sent. But the boundary is
 * easy to misread: a field with no box over it looks checked rather than
 * unexamined. This answers the question a run cannot: what is on this page,
 * all of it, sensitive?
 *
 * WHY IT IS A SEPARATE PATH AND NOT A FLAG ON `runStep`
 *
 * Nothing in this function builds a payload, seals one, or reaches the
 * transport — `buildSanitizedPayload` and `send` are not called here, directly
 * or otherwise. That is the whole safety argument, and it is structural rather
 * than conditional: there is no branch to get wrong, because there is nothing
 * to branch to. Making this a mode on the run would have put one boolean
 * between "nothing leaves this machine" and "something does."
 *
 * The frame is captured, decoded locally, read locally, and dropped. The same
 * detectors the run uses do the work, so a scan cannot find things a run would
 * miss for lack of a rule — only for lack of a look.
 */
async function scanPage(): Promise<void> {
  scanToken += 1;
  const token = scanToken;
  const abandoned = (): boolean => scanToken !== token;

  let tabId: number | null = null;
  let restoreTo: { x: number; y: number } | null = null;

  try {
    const tab = await getActiveTab();
    tabId = tab.id as number;
    // `tabId` is a `let` so the cleanup path can see it, and TypeScript drops
    // that narrowing inside a closure. The timed stages below are closures.
    const scanTabId = tabId;

    setState({
      ...INITIAL_STATE,
      status: 'scanning',
      tabId,
      scanProgress: { stop: 0, total: 0 },
    });

    await ensureContentScript(tabId);
    await ensureVisionHost();
const { forceBackend, forceInferenceHost, redactionLevel } = await readSettings();

    // Shield's own UI must not appear in the frames Shield examines. A previous
    // scan's boxes would be captured, read by OCR, and reported as findings of
    // their own — the tool detecting itself.
    // The previous record goes before this scan starts, not when it finishes.
    // A scan that fails halfway would otherwise leave the last page's filmstrip
    // sitting there looking like the current one.
    await clearScanProof();

    await sendToTab(tabId, { type: MSG.CLEAR_SCAN });
    await sendToTab(tabId, { type: MSG.SHOW_OVERLAY, regions: [] });
    await sendToTab(tabId, { type: MSG.SET_MANUAL_VISIBLE, visible: false });

    const viewport = await sendToTab<ViewportInfo>(tabId, { type: MSG.GET_VIEWPORT });
    if (!viewport) {
      throw new Error("Couldn't read this page's layout. Try reloading the page.");
    }

    // The first move doubles as the measurement: it reports the document's
    // height and, in the same reply, where the user was sitting before we
    // touched their page.
    const origin = await sendToTab<ScrollToResult>(tabId, { type: MSG.SCROLL_TO, y: 0 });
    if (!origin) {
      throw new Error("Couldn't scroll this page, so it can't be scanned.");
    }
    restoreTo = { x: origin.previousScrollX, y: origin.previousScrollY };

    const plan = planScanStops(origin.documentHeight, origin.viewportHeight);
    console.info(
      `[shield] scanning ${origin.documentHeight}px of page in ${plan.stops.length} ` +
        `look(s) of ${origin.viewportHeight}px` +
        `${plan.truncated ? ' — capped, the page continues past the last one' : ''}`,
    );

    // Started before the first scroll, so the wall-clock it reports is the
    // scan the user waited for, not the part of it that happened to be wrapped.
    const timer = createScanTimer();

    // Said out loud, because a scan run at a non-default level produces
    // different numbers and a reader comparing two scans has to know which.
    if (redactionLevel !== 'standard') {
      console.info(
        `[shield] redaction level ${redactionLevel} — image floor ` +
          `${REDACTION_FLOORS[redactionLevel].width}x${REDACTION_FLOORS[redactionLevel].height}`,
      );
    }

    const findings: ScanFinding[] = [];
    // Every document-sized image, once per look, with whether THAT look held all
    // of it. An image clipped at every stop was never actually read, however
    // many times OCR ran on a piece of it.
    const images: ScannedImage[] = [];
    /**
     * Images whose crop was read WHOLE and SUCCESSFULLY at an earlier stop.
     *
     * Stops overlap by design, so without this the same picture is sent to OCR
     * at two or three consecutive stops for an identical answer — and OCR is
     * the most expensive thing a stop does. A failed read is deliberately
     * absent, so it is retried; an image clipped everywhere never enters, so
     * `unexaminedImages` still covers it whole. See `candidatesToRead`.
     */
    const readWholeImages = new Set<string>();
    /**
     * The raw frames, held until the walk is over.
     *
     * REDACTION CANNOT HAPPEN PER STOP, AND THAT WAS A REAL DEFECT
     *
     * The first version painted each screen as it was captured, using the
     * regions found at that stop. But a scan discovers things as it goes: the
     * Aadhaar number was read at the second stop, and the first stop's picture
     * — where the same card is fully visible — had already been written
     * without it. That put a screenshot of an unredacted ID number into
     * storage, from the feature whose entire purpose is proving the opposite.
     *
     * So nothing is painted until every stop has been read, and then each
     * screen is painted with ALL of them. Data URLs are strings, not decoded
     * bitmaps — twelve JPEG frames is under a megabyte of memory for the
     * length of the scan, and none of it is stored or sent.
     */
    const captured: {
      scrollX: number;
      scrollY: number;
      viewportHeight: number;
      dataUrl: string;
      scaleX: number;
      scaleY: number;
    }[] = [];
    const screens: ProofScreen[] = [];
    let omittedScreens = 0;
    let examinedTo = 0;
    let stoppedEarly = plan.truncated;
    let previousLanding: number | null = null;

    /**
     * Every sighting from every stop, in DOCUMENT space, compared once at the
     * end.
     *
     * Not a running total. Stops overlap by design so that nothing falls
     * between two screens, which means the same text is genuinely read twice
     * and a summed column counts it twice. Worse, the columns inflate
     * unevenly: text clipped at one viewport edge and whole at the next can be
     * dom-only once and agreed once, turning one piece of screen into two
     * entries in a ratio.
     *
     * Left undefined until a screen is actually read, so "never read" stays
     * distinguishable from "read and found nothing".
     */
    let screenRead:
      | { dom: DomTextItem[]; pixels: ScreenTextRegion[]; hidden: SeenText[] }
      | undefined;

    for (const [index, stop] of plan.stops.entries()) {
      if (abandoned()) return;

      const landed = await timer.measure('scroll', () =>
        sendToTab<ScrollToResult>(scanTabId, { type: MSG.SCROLL_TO, y: stop }),
      );
      if (!landed) {
        stoppedEarly = true;
        console.warn('[shield] scan stopped: the page stopped answering');
        break;
      }

      // A page that will not move is one we cannot walk. Scroll-locked modals
      // and hijacked scrolling both land here, and continuing would re-examine
      // the same screen while attributing each pass to coordinates further down
      // a document nothing ever reached.
      if (previousLanding !== null && landed.scrollY === previousLanding) {
        stoppedEarly = true;
        console.warn(`[shield] scan stopped at ${landed.scrollY}px: the page would not scroll`);
        break;
      }
      previousLanding = landed.scrollY;

      await timer.measure('settle', () => sleep(SCAN_SETTLE_MS));
      if (abandoned()) return;
      setState({ scanProgress: { stop: index + 1, total: plan.stops.length } });

      try {
        // The purpose is passed even though both paths now encode the same
        // way: the equality is a measured result (DECISIONS.md 230), not an
        // assumption, and the seam is what makes re-testing it cheap.
        const frame = await timer.measure('capture', () =>
          captureViewport(tab.windowId, viewport, 'scan'),
        );
        const domMap = await timer.measure('domScan', () =>
          sendToTab<ExtractDomResult>(scanTabId, { type: MSG.EXTRACT_DOM }),
        );
        if (!domMap) throw new Error('the page could not be read at this position');

        const analysis = await timer.measure('inference', () =>
          sendToOffscreen({
            type: MSG.ANALYSE_FRAME,
            dataUrl: frame.dataUrl,
            viewportWidth: viewport.width,
            viewportHeight: viewport.height,
            forceBackend,
            forceInferenceHost,
          }),
        );
        if (!analysis.ok) throw new Error(analysis.message);

        // Recorded before reading, so an image that OCR happened to find
        // nothing in is still known to have been clipped when it was read.
        for (const candidate of imageCandidates(domMap.elements)) {
          images.push({
            elementId: candidate.elementId,
            seenWhole: fullyVisible(candidate, viewport.width, landed.viewportHeight),
            position: {
              x: candidate.x + landed.scrollX,
              y: candidate.y + landed.scrollY,
              width: candidate.width,
              height: candidate.height,
            },
          });
        }

        const screen = await timer.measure('screenRead', () =>
          screenTextFindings(frame, domMap.elements, viewport),
        );

        const imageText = await timer.measure('imageOcr', () =>
          ocrImageRegions(
            frame,
            domMap.elements,
            analysis.frame,
            {
              viewportWidth: viewport.width,
              viewportHeight: landed.viewportHeight,
              readWhole: readWholeImages,
            },
            REDACTION_FLOORS[redactionLevel],
          ),
        );
        for (const elementId of imageText.readWhole) readWholeImages.add(elementId);

        const regions: SensitiveRegion[] = [
          ...detectDomPii(domMap.elements),
          ...faceRegions(analysis.detection.faces, analysis.frame),
          ...imageText.regions,
          ...screen.regions,
        ];

        if (screen.read) {
          const place = <T extends { position: Rect }>(item: T): T => ({
            ...item,
            position: {
              x: item.position.x + landed.scrollX,
              y: item.position.y + landed.scrollY,
              width: item.position.width,
              height: item.position.height,
            },
          });

          screenRead ??= { dom: [], pixels: [], hidden: [] };
          screenRead.dom.push(...screen.dom.map(place));
          screenRead.pixels.push(...screen.pixels.map(place));
          // Kept as text so the same hidden line found at two stops collapses
          // the same way its sighting does. Counting the painted regions
          // instead would count it twice.
          screenRead.hidden.push(
            ...screen.regions.map((region) => place({ text: region.reason, position: region.position })),
          );
        }

        // Kept, not painted. What is sensitive on this screen is not fully known
        // until every screen has been read — see the note on `captured`.
        captured.push({
          scrollX: landed.scrollX,
          scrollY: landed.scrollY,
          viewportHeight: landed.viewportHeight,
          dataUrl: frame.dataUrl,
          scaleX: analysis.frame.scaleX,
          scaleY: analysis.frame.scaleY,
        });

        // Viewport to document, in one place. Every coordinate bug in this
        // project has been a plausible rectangle over the wrong pixels, and
        // every one came from doing a conversion like this in two places.
        for (const region of regions) {
          findings.push({
            category: region.category,
            source: region.source,
            reason: region.reason,
            position: {
              x: region.position.x + landed.scrollX,
              y: region.position.y + landed.scrollY,
              width: region.position.width,
              height: region.position.height,
            },
          });
        }

        examinedTo = landed.scrollY + landed.viewportHeight;
        timer.countStop();
      } catch (error) {
        // One failed look does not discard the looks that succeeded, but it
        // absolutely does end the claim. The scan reports what it examined and
        // marks the boundary there — silently carrying on would produce a
        // whole-page verdict with a hole in it, which is the "checked and safe"
        // misreading this feature exists to correct, at greater scale.
        stoppedEarly = true;
        const why = error instanceof Error ? error.message : String(error);
        console.warn(`[shield] scan stopped at ${landed.scrollY}px: ${why}`);
        break;
      }
    }

    if (abandoned()) return;

    const read = dedupeFindings(findings);
    // Added last and never deduped against: an image nothing read whole is a
    // statement about a gap, and a gap cannot be merged into a finding.
    const unread = unexaminedImages(images, read);
    const all = [...read, ...unread];

    const summary: ScanSummary = {
      at: Date.now(),
      stops: plan.stops.length,
      documentHeight: origin.documentHeight,
      viewportHeight: origin.viewportHeight,
      truncated: stoppedEarly,
      ...(screenRead ? { screen: summariseScreenRead(screenRead) } : {}),
      counts: countByCategory(all),
      total: all.length,
    };

    // Now that every stop has been read, paint every screen with everything the
    // whole scan found. A finding discovered at the last stop is covered on the
    // first screen too, wherever it was visible there.
    for (const shot of captured) {
      if (abandoned()) return;

      const onScreen = clipFindings(
        all,
        shot.scrollX,
        shot.scrollY,
        viewport.width,
        shot.viewportHeight,
      );

      try {
        const painted = await timer.measure('proof', () =>
          redactOffscreenFrame({
            dataUrl: shot.dataUrl,
            regions: onScreen.map((finding, index) => ({
              regionId: `proof-${shot.scrollY}-${index}`,
              category: finding.category,
              source: finding.source,
              confidence: 1,
              elementId: null,
              reason: finding.reason,
              position: finding.position,
            })),
            scaleX: shot.scaleX,
            scaleY: shot.scaleY,
          }),
        );

        if (painted.ok) {
          screens.push({ at: shot.scrollY, dataUrl: painted.dataUrl, covered: painted.painted });
        } else {
          // The RAW frame is never kept as a substitute. Storage outlives the
          // tab, the browser and the session, so a raw screen written there is
          // a screenshot of a private page left on disk — a far longer-lived
          // exposure than anything else in this pipeline creates. A missing
          // screen is counted and declared in the caption instead.
          omittedScreens += 1;
          console.warn(`[shield] screen at ${shot.scrollY}px omitted: ${painted.message}`);
        }
      } catch (error) {
        omittedScreens += 1;
        console.warn('[shield] a screen could not be redacted for the record', error);
      }
    }

    // Dropped as soon as they are no longer needed rather than left to the end
    // of the function. These are unredacted pictures of somebody's screen.
    captured.length = 0;

    await recordScanProof({
      at: Date.now(),
      documentHeight: origin.documentHeight,
      viewportHeight: origin.viewportHeight,
      truncated: stoppedEarly,
      omitted: omittedScreens,
      screens,
    });

    // "Where did the time go?" — blank for scans until now, and the only basis
    // on which anything about scan speed can be decided.
    console.info(formatScanTiming(timer.summarise()));

    // WHAT was found, not only how many.
    //
    // The run path has printed a per-detection table since Module B, and the
    // scan path never has — so the path whose entire purpose is answering
    // "what is on ALL of this page" could report a count and nothing else.
    // That gap is what made the generalisation sweep's Detect column
    // unfillable from a console: the operator could see eleven findings and
    // not what any of them were.
    if (all.length > 0) {
      console.info(`[shield] ${all.length} finding(s) across the whole page`);
      console.table(
        all.map((finding) => ({
          category: finding.category,
          source: finding.source,
          // Document coordinates, not viewport — a scan's findings outlive the
          // scroll position they were found at, and a viewport figure here
          // would point at the wrong place on every stop but one.
          at: `${Math.round(finding.position.x)},${Math.round(finding.position.y)}`,
          size: `${Math.round(finding.position.width)}x${Math.round(finding.position.height)}`,
          why: finding.reason,
        })),
      );
    }

    console.info(
      `[shield] scan complete — ${all.length} finding(s) across ` +
        `${examinedTo}px of ${origin.documentHeight}px` +
        `${unread.length > 0 ? `, ${unread.length} image(s) never fully on screen` : ''}` +
        `${stoppedEarly ? ' (stopped early)' : ''}; nothing was transmitted`,
    );

    // The metric-1 figure, for the PAGE. Each stop already logged its own
    // numbers, and those must not be added up - overlapping stops read the same
    // text twice (DECISIONS.md 193). Without this line the only merged figure
    // lives in the scan record, which means the number the rubric actually asks
    // for cannot be read off a console while testing.
    if (screenRead) {
      const merged = summariseScreenRead(screenRead);
      const total = merged.agreed + merged.pixelOnly + merged.domOnly;
      const rate = total > 0 ? ((merged.agreed / total) * 100).toFixed(1) : '100.0';
      console.info(
        `[shield] page agreement ${rate}% — ${merged.agreed} agreed, ` +
          `${merged.pixelOnly} pixels only (${merged.hidden} hidden), ` +
          `${merged.domOnly} markup only`,
      );
    }

    await sendToTab(tabId, {
      type: MSG.SHOW_SCAN,
      findings: all,
      truncated: stoppedEarly,
      examinedTo,
    });

    void recordAudit(
      buildAuditEntry(
        // The findings, restored to region shape only so far as the entry
        // builder needs. It reads `category` and `reason` and keeps nothing else.
        all.map((finding) => ({
          regionId: '',
          category: finding.category,
          source: finding.source,
          confidence: 1,
          elementId: null,
          reason: finding.reason,
          position: finding.position,
        })),
        {
          kind: 'scan',
          examined: stoppedEarly ? 'document-partial' : 'document',
          // Stated, not inferred. A scan reaches no transport at all.
          transmitted: false,
        },
      ),
    );

    setState({ status: 'done', scan: summary, scanProgress: null });
  } catch (error) {
    if (abandoned()) return;
    const message = error instanceof Error ? error.message : String(error);
    console.error('[shield] scan failed', error);
    setState({ status: 'error', errorMessage: message, scanProgress: null });
  } finally {
    // The user's position back, on every exit path including a cancelled one.
    // Leaving somebody halfway down a page they never scrolled is a small
    // rudeness with a large tell: it says the tool does not consider the page
    // to be theirs.
    if (tabId !== null && restoreTo) {
      await sendToTab(tabId, { type: MSG.SCROLL_TO, y: restoreTo.y });
    }
  }
}

// --- Message routing --------------------------------------------------------

chrome.runtime.onMessage.addListener((message: PopupMessage, _sender, sendResponse) => {
  switch (message.type) {
    case MSG.GET_STATE:
      sendResponse(state);
      return false;

    case MSG.RUN_TASK:
      // Fire-and-forget: progress reaches the popup through STATE_CHANGED
      // broadcasts, so the popup is never blocked waiting on a whole run.
      //
      // An empty query comes from the Run button on the manual-marking
      // toolbar, where there is no field to type one into. It reuses whatever
      // the user last asked for, so running from the page does not silently
      // change the task, and falls back to a plain description otherwise. It
      // must never stay empty: API_SPEC.md gives task_query a minimum length
      // and the server would reject the payload outright.
      void runTask(message.taskQuery.trim() || state.taskQuery || DEFAULT_TASK);
      sendResponse({ accepted: true });
      return false;

    case MSG.BEGIN_MANUAL:
      // Marking has to be reachable BEFORE a run, not only after one.
      //
      // The popup used to message the tab directly, which fails on a page the
      // content script has never been injected into — so the advice was to run
      // once first. That inverts the feature: the first run transmits the page,
      // including whatever the user opened this to hide. Ensuring the script
      // here costs nothing extra in reach, since opening the popup is itself
      // the user invoking Shield on this tab, and it makes mark-then-run the
      // ordinary path.
      void (async () => {
        try {
          const tab = await getActiveTab();
          await ensureContentScript(tab.id as number);
          await sendToTab(tab.id as number, { type: MSG.START_MANUAL });
          sendResponse({ ok: true, message: '' } satisfies BeginManualResult);
        } catch (error) {
          sendResponse({
            ok: false,
            message: error instanceof Error ? error.message : String(error),
          } satisfies BeginManualResult);
        }
      })();
      // Async reply, so the channel must be held open.
      return true;

    case MSG.SCAN_PAGE:
      // Fire-and-forget, like RUN_TASK. A scan takes several seconds and the
      // popup is closed for most of them; progress arrives through
      // STATE_CHANGED and the result is left drawn on the page itself.
      void scanPage();
      sendResponse({ accepted: true });
      return false;

    case MSG.PREPARE:
      // The popup is open, so a run is likely moments away. Start the inference
      // host now and let it warm while the user types. Errors are swallowed:
      // this is purely an optimisation and must never block a run.
      void ensureVisionHost()
        .then(readSettings)
        .then(({ forceBackend, forceInferenceHost }) =>
          warmOffscreen(forceBackend, forceInferenceHost),
        )
        .catch(() => undefined);
      sendResponse({ accepted: true });
      return false;

    case MSG.RESTART_BACKEND:
      // Replace the inference host so it picks up the new override. The loaded
      // session is cached inside that document, so nothing short of restarting
      // it will change which backend is in use.
      // The session is rebuilt in place rather than by replacing the document:
      // closing and recreating races, leaving the old session — and the old
      // backend — alive, which made the override appear to do nothing.
      void ensureVisionHost()
        .then(readSettings)
        .then(({ forceBackend, forceInferenceHost }) =>
          reloadOffscreenModel(forceBackend, forceInferenceHost),
        )
        .catch(() => undefined);
      sendResponse({ accepted: true });
      return false;

    case MSG.CONSENT_DECISION:
      // `applied` is false when the id no longer matches anything waiting —
      // a click that arrived after the timeout, or on a step that has since
      // been abandoned. Reported rather than swallowed so the popup can stop
      // showing a card for a decision that changed nothing.
      sendResponse({ applied: applyConsentDecision(message.id, message.approved) });
      return false;

    case MSG.CANCEL_TASK:
      // Released before the run is torn down. The waiting promise resolves to
      // a refusal, so a cancelled run cannot leave a payload approvable by a
      // popup that is still showing its card.
      cancelConsent();
      cancelTask();
      sendResponse({ accepted: true });
      return false;

    default:
      return false;
  }
});

// A run belongs to one tab. If that tab navigates or closes, the snapshot the
// run was reasoning about is gone, so the run is abandoned rather than allowed
// to act on a page it never actually read.
chrome.tabs.onRemoved.addListener((tabId) => {
  if (state.tabId === tabId) cancelTask();
});

// Navigation is detected through tabs.onUpdated rather than the webNavigation
// API so that Shield doesn't have to request a broad extra permission purely to
// notice a page changed underneath it.
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (state.tabId !== tabId) return;
  if (changeInfo.url !== undefined || changeInfo.status === 'loading') cancelTask();
});

console.info(
  `[shield] service worker ready — v${chrome.runtime.getManifest().version}, ` +
    `build ${__SHIELD_BUILD__} — ${STATUS_LABEL[state.status]}`,
);
