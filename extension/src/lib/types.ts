/**
 * Shared type contract for the Shield client pipeline.
 *
 * The types here are deliberately split along the trust boundary described in
 * ARCHITECTURE.md Section 4: everything produced before the Redaction Engine
 * runs is unsafe to transmit, everything after it is safe by construction.
 * Keeping that split in the type system means a mistake in the wiring is a
 * build failure rather than a privacy incident discovered in the demo.
 */

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

/** Viewport-relative CSS pixel box. Origin is the top-left of the visible area. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ---------------------------------------------------------------------------
// Screen Perception — ARCHITECTURE.md 2.1
// ---------------------------------------------------------------------------

/** Coarse element classification, matching the vocabulary in API_SPEC.md Section 3. */
export type ElementType = 'input' | 'button' | 'text' | 'image' | 'other';

/**
 * One element from the DOM walk.
 *
 * UNSAFE TO TRANSMIT. `value` may hold a real password or a real email address.
 * This type must never appear inside an AnalyzePayload — the Redaction Engine
 * converts it into a RedactedDomEntry first.
 */
export interface DomElement {
  /** Stable-within-a-snapshot handle. Actions refer back to elements by this. */
  elementId: string;
  elementType: ElementType;
  /** CSS selector used to re-find this element at action time (PRD FR-21). */
  selector: string;
  /** Visible/accessible label, if one could be resolved. */
  label: string | null;
  /** Raw field content. Frequently sensitive — treat as radioactive. */
  value: string | null;
  /** `input` elements only: the `type` attribute. Primary password signal. */
  inputType: string | null;
  /** `input` elements only: the `autocomplete` attribute. Primary PII signal. */
  autocomplete: string | null;
  /**
   * The `name` attribute, and the placeholder text.
   *
   * Both are author-written page structure, not user-entered content, so unlike
   * `value` they are safe to read and reason about. They exist because
   * SECURITY_PRIVACY.md Section 4 specifies field-name pattern matching as part
   * of the DOM detection method, and a great many real forms label their fields
   * only through these.
   */
  name: string | null;
  placeholder: string | null;
  /**
   * For text inside a table cell: that column's header text. Read by the
   * detector only, and never added to the payload — it is the page's own
   * heading, but the payload carries exactly the fields API_SPEC.md lists.
   */
  columnHeader?: string | null;
  /**
   * Which table row, list item or card the element sits in, numbered in page
   * order; null outside one. A number, never text: it carries the page's
   * structure to the model and nothing the page says.
   */
  row?: number | null;
  position: Rect;
}

/** The page's own view of its viewport, reported by the content script. */
export interface ViewportInfo {
  /** Viewport size in CSS pixels, scrollbars included. */
  width: number;
  height: number;
  /** What the page believes its device pixel ratio to be. */
  devicePixelRatio: number;
}

/**
 * A captured frame as it leaves the service worker.
 *
 * UNSAFE TO TRANSMIT. This is a raw, unredacted screenshot.
 *
 * It is deliberately still encoded. The service worker never decodes a frame —
 * decoding happens only in the offscreen document (src/offscreen/), which is
 * also where redaction will happen. That split is the point: the context that
 * can see pixels is not the context that talks to the network, so no single
 * module is in a position to send raw pixels anywhere.
 *
 * The service worker holds this only long enough to forward it, in-process, to
 * the offscreen document. It never crosses the extension boundary.
 */
export interface RawFrame {
  /** `data:image/png;base64,...` exactly as captureVisibleTab returned it. */
  dataUrl: string;
  /** What the page reported about its own viewport, in CSS pixels. */
  viewport: ViewportInfo;
  capturedAt: number;
}

/**
 * A decoded frame's geometry, measured by the offscreen document.
 *
 * `scaleX`/`scaleY` are derived from the frame actually received rather than
 * from `devicePixelRatio`. Scrollbar width, page zoom and Chrome's own rounding
 * all move the real ratio, and redaction rectangles are computed from DOM
 * coordinates in CSS pixels — so a systematic scale error would offset every
 * blur box on the frame. A redaction that misses its target is a leak, not a
 * cosmetic bug. Measuring beats trusting.
 */
export interface FrameGeometry {
  width: number;
  height: number;
  scaleX: number;
  scaleY: number;
}

/**
 * Everything Screen Perception produces for one step of a task.
 *
 * UNSAFE TO TRANSMIT in its entirety.
 */
export interface ScreenSnapshot {
  frame: RawFrame;
  geometry: FrameGeometry;
  elements: DomElement[];
  /**
   * Client-side only, for tab bookkeeping and stale-snapshot checks. This does
   * not appear in the request schema in API_SPEC.md and must not be added to
   * it — a URL alone can be identifying.
   */
  pageUrl: string;
  capturedAt: number;
  /**
   * What the PII Detector flagged on this snapshot.
   *
   * Empty until the `detecting` stage has run. The Redaction Engine reads this
   * to decide what to mask, so an empty array after detection means "nothing
   * sensitive found", never "detection has not happened" — the pipeline order
   * guard in the service worker is what keeps those two apart.
   */
  sensitiveRegions: SensitiveRegion[];
}

// ---------------------------------------------------------------------------
// PII Detection — ARCHITECTURE.md 2.2
// ---------------------------------------------------------------------------

/** Categories carried in the redaction manifest (API_SPEC.md Section 3). */
export type SensitiveCategory =
  | 'password'
  | 'name'
  | 'email'
  | 'phone'
  | 'address'
  | 'face'
  | 'id_number'
  /**
   * Sensitive, but of no identified kind.
   *
   * A field holding content that no rule recognised. SECURITY_PRIVACY.md
   * Section 4 requires ambiguous DOM signals to be treated as sensitive by
   * default, and without a category for "we do not know what this is" that rule
   * could only be written in the docs, never in the code.
   */
  | 'other';

/**
 * One detected face, in coordinates normalised to the frame (0..1).
 *
 * Normalised rather than pixels because the frame is resized on its way into the
 * model and may be resized again on its way to the canvas. A ratio survives
 * both; a pixel count silently means the wrong thing after either.
 */
export interface FaceBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  score: number;
}

/**
 * Which sub-detector flagged a region.
 *
 * `manual` is not a detector. It means the person looking at the screen drew a
 * box round something and said hide this, and it is kept distinct from the
 * three that guess because it is the only one that is never wrong about intent.
 * Automatic detection will always miss something on a page nobody wrote for us
 * — the real-site runs proved that twice in an afternoon — and the honest
 * answer is to let the user say so rather than to keep widening the rules.
 */
export type DetectionSource = 'dom' | 'visual' | 'ocr' | 'manual';

/** One region the PII Detector decided is sensitive. */
export interface SensitiveRegion {
  regionId: string;
  category: SensitiveCategory;
  source: DetectionSource;
  /** 0..1. Low confidence still means redact — see DECISIONS.md, default-to-hide. */
  confidence: number;
  /** Set when the region came from a DOM element rather than pixel analysis. */
  elementId: string | null;
  /**
   * Which rule fired, in words.
   *
   * Client-only and deliberately absent from the redaction manifest in
   * API_SPEC.md Section 3 — the server has no need for it. It exists for the
   * explainable redaction overlay (PRD.md FR-24), which has to tell the user
   * *why* something was hidden, and for making a wrong detection debuggable
   * without re-running the page.
   */
  reason: string;
  position: Rect;
}

// ---------------------------------------------------------------------------
// Redaction — ARCHITECTURE.md 2.3
// ---------------------------------------------------------------------------

export type RedactionMethod = 'dom' | 'visual' | 'ocr' | 'manual';

/**
 * A rectangle the user drew, in DOCUMENT coordinates.
 *
 * Document rather than viewport, deliberately. Viewport coordinates are only
 * true until the page scrolls — that is precisely the defect found in the
 * explainable overlay, where every box ended up sitting the scroll offset away
 * from the thing it named. A mark the user made must stay on what they marked,
 * so it is stored against the page and converted to viewport space at capture
 * time, when the scroll position is known.
 */
export interface ManualRegion {
  id: string;
  /** Page coordinates: viewport position plus scroll offset at draw time. */
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Audit record of one redaction, mirrored to the server and to the trust UI. */
export interface RedactionManifestEntry {
  regionId: string;
  category: SensitiveCategory;
  method: RedactionMethod;
}

/**
 * A DOM element after redaction. `value` is either non-sensitive content or a
 * semantic placeholder token such as `[PASSWORD]` (see DECISIONS.md). It is
 * never a real sensitive value.
 */
export interface RedactedDomEntry {
  elementId: string;
  elementType: ElementType;
  label: string | null;
  value: string | null;
  /**
   * Whether the field actually held content at capture time.
   *
   * A redacted field reads `[PASSWORD]` whether it is full or empty, because the
   * token says what belongs there rather than what is there. That hides a
   * distinction the assistant needs: "this field still needs filling" and "this
   * form is ready to submit" are different situations requiring different
   * actions, and without this they are indistinguishable.
   *
   * Emptiness is not sensitive. It says nothing about content — only that there
   * is none — and it is the minimum needed for the assistant to make progress
   * at all.
   */
  filled: boolean;
  /** See DomElement.row. Omitted when the element is not in a row. */
  row?: number;
  position: Rect;
}

// ---------------------------------------------------------------------------
// The transmission seal
// ---------------------------------------------------------------------------

/**
 * A phantom marker that only the Redaction Engine may attach.
 *
 * `unique symbol` + `declare` means this property has no runtime existence at
 * all — it is purely a compile-time claim. Because the symbol is not exported,
 * no other module can construct a value bearing it. The single legitimate way
 * to obtain a `Sanitized<T>` is through the Redaction Engine's sealing
 * function, which is the only place allowed to assert it.
 */
declare const REDACTION_SEAL: unique symbol;

/**
 * `T`, plus a compile-time proof that it passed through the Redaction Engine.
 *
 * The Transport Layer accepts only sealed values. Handing it a structurally
 * identical but unsealed object is a type error, which is exactly the mistake
 * we most need the compiler to catch (ARCHITECTURE.md 2.4).
 */
export type Sanitized<T> = T & { readonly [REDACTION_SEAL]: 'redacted' };

/**
 * The only way to mint a `Sanitized<T>`.
 *
 * The seal symbol is declared but never exported, so no other module can
 * construct the type — this cast is the single place in the codebase where a
 * value becomes transmittable. That makes the invariant greppable: searching
 * for `sealAsRedacted` finds every point where something was declared safe to
 * send, and there should only ever be one, inside the Redaction Engine.
 *
 * The name is deliberately awkward. This is not a function anyone should reach
 * for casually, and it should read as an assertion being made rather than a
 * conversion being performed.
 */
export function sealAsRedacted<T>(value: T): Sanitized<T> {
  return value as Sanitized<T>;
}

// ---------------------------------------------------------------------------
// Transport — API_SPEC.md Section 3
// ---------------------------------------------------------------------------

/** Request body for POST /analyze, before sealing. */
export interface AnalyzePayload {
  request_id: string;
  task_query: string;
  /** Base64 image whose sensitive regions have already been painted over. */
  redacted_frame: string;
  redacted_dom_summary: RedactedDomEntry[];
  redaction_manifest: RedactionManifestEntry[];
}

/** The only shape the Transport Layer will send. */
export type SanitizedAnalyzePayload = Sanitized<AnalyzePayload>;

// ---------------------------------------------------------------------------
// Action vocabulary — API_SPEC.md Section 5
// ---------------------------------------------------------------------------

/**
 * The fixed allowlist. Validated on the server AND re-validated on the client
 * as defence in depth (SECURITY_PRIVACY.md Section 3). Adding a member here is
 * a security-relevant change, not a routine one.
 */
export const ALLOWED_ACTIONS = ['click', 'type', 'scroll'] as const;

export type ActionType = (typeof ALLOWED_ACTIONS)[number];

export interface ShieldAction {
  type: ActionType;
  /** DOM selector, or an `element_id` from the redacted DOM summary. */
  selector: string;
  /** Only meaningful for `type`. Never a sensitive value (API_SPEC.md Section 5). */
  value: string | null;
}

/** Narrowing guard for anything arriving from the network. */
export function isAllowedAction(candidate: unknown): candidate is ActionType {
  return (
    typeof candidate === 'string' &&
    (ALLOWED_ACTIONS as readonly string[]).includes(candidate)
  );
}

// ---------------------------------------------------------------------------
// Server responses — API_SPEC.md Section 3
// ---------------------------------------------------------------------------

export type ShieldErrorCode =
  | 'MALFORMED_REQUEST'
  | 'MODEL_UNAVAILABLE'
  | 'ACTION_REJECTED'
  | 'INTERNAL_ERROR';

export interface AnalyzeActionResponse {
  request_id: string;
  status: 'action_ready';
  action: ShieldAction;
  confidence: number;
  reasoning_summary: string;
}

export interface AnalyzeNeedsContextResponse {
  request_id: string;
  status: 'needs_more_context';
  message: string;
}

export interface AnalyzeErrorResponse {
  request_id: string;
  status: 'error';
  error_code: ShieldErrorCode;
  message: string;
}

export type AnalyzeResponse =
  | AnalyzeActionResponse
  | AnalyzeNeedsContextResponse
  | AnalyzeErrorResponse;
