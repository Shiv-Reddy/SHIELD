/**
 * Popup controller.
 *
 * The popup is a thin view over the service worker's state. It holds no run
 * state of its own — a popup is destroyed the moment it loses focus, so any
 * state kept here would silently vanish mid-run. It asks for state on open and
 * then listens for broadcasts.
 */

import {
  MSG,
  sendToWorker,
  type BeginManualResult,
  type ManualStatusResult,
  type ExtractDomResult,
  type ScanStatusResult,
  type StateChangedMessage,
  type WorkerBroadcast,
} from '../lib/messages';
import { INITIAL_STATE, STATUS_LABEL, type ShieldState } from '../lib/status';
import { readSettings, setForceBackend, setObserveOnly } from '../lib/settings';
import { readLastTransmission } from '../lib/redaction/evidence';
import { auditJson, clearAudit, readAudit } from '../lib/audit';
import { clearScanProof } from '../lib/scan-proof';
import {
  mapExportFilename,
  mapExportJson,
  reviewableValues,
  type ReviewableValue,
} from '../lib/benchmark/export-map';

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Popup markup is missing ${selector}`);
  return element;
}

const statusDot = required<HTMLSpanElement>('#status-dot');
const statusLabel = required<HTMLSpanElement>('#status-label');
const statusDetail = required<HTMLParagraphElement>('#status-detail');
const taskForm = required<HTMLFormElement>('#task-form');
const taskInput = required<HTMLInputElement>('#task-input');
const runButton = required<HTMLButtonElement>('#run-button');
// The label is a span beside an icon, so the button's own textContent must not
// be written — doing so would delete the icon with it.
const runLabel = required<HTMLSpanElement>('#run-label');
const progress = required<HTMLDivElement>('#progress');
const cancelButton = required<HTMLButtonElement>('#cancel-button');
const buildInfo = required<HTMLParagraphElement>('#build-info');
const backendNotice = required<HTMLParagraphElement>('#backend-notice');
const observeOnly = required<HTMLInputElement>('#observe-only');
const coverageNotice = required<HTMLParagraphElement>('#coverage-notice');
const scanButton = required<HTMLButtonElement>('#scan-button');
const scanState = required<HTMLParagraphElement>('#scan-state');
const scanSummary = required<HTMLSpanElement>('#scan-summary');
const scanClear = required<HTMLButtonElement>('#scan-clear');
const scanProof = required<HTMLButtonElement>('#scan-proof');
const manualButton = required<HTMLButtonElement>('#manual-button');
const manualClear = required<HTMLButtonElement>('#manual-clear');
const manualState = required<HTMLParagraphElement>('#manual-state');
const manualCount = required<HTMLSpanElement>('#manual-count');
const evidenceToggle = required<HTMLButtonElement>('#evidence-toggle');
const evidenceToggleLabel = required<HTMLSpanElement>('#evidence-toggle-label');
const evidenceBody = required<HTMLDivElement>('#evidence-body');
const evidenceMeta = required<HTMLParagraphElement>('#evidence-meta');
const evidenceJson = required<HTMLPreElement>('#evidence-json');
const evidenceFrame = required<HTMLButtonElement>('#evidence-frame');
const auditToggle = required<HTMLButtonElement>('#audit-toggle');
const auditToggleLabel = required<HTMLSpanElement>('#audit-toggle-label');
const auditBody = required<HTMLDivElement>('#audit-body');
const auditMeta = required<HTMLParagraphElement>('#audit-meta');
const auditList = required<HTMLUListElement>('#audit-list');
const auditExport = required<HTMLButtonElement>('#audit-export');
const auditClear = required<HTMLButtonElement>('#audit-clear');
const latencyToggle = required<HTMLButtonElement>('#latency-toggle');
const latencyToggleLabel = required<HTMLSpanElement>('#latency-toggle-label');
const latencyBody = required<HTMLDivElement>('#latency-body');
const latencyList = required<HTMLUListElement>('#latency-list');
const latencyTotal = required<HTMLParagraphElement>('#latency-total');

// Rendered once on open. The popup is rebuilt from the current bundle every
// time it is shown, so this is the one place that cannot report a build other
// than the one actually installed.
const BUILD_LABEL = `v${chrome.runtime.getManifest().version} · build ${__SHIELD_BUILD__}`;

/**
 * Render the build line, noting a pinned backend when one is set.
 *
 * Clicking this line cycles the override. It is deliberately unlabelled: it is a
 * developer and demo affordance, not a user-facing setting, and PRD.md Section
 * 14 does not put backend selection in the popup. It earns its place twice over
 * — the CPU fallback required by FR-27 is otherwise impossible to exercise on
 * hardware where WebGPU works, and being able to show that fallback live is a
 * direct answer to the obvious judge question about machines without a GPU.
 */
async function renderBuildInfo(): Promise<void> {
  const { forceBackend } = await readSettings();
  buildInfo.textContent = forceBackend
    ? `${BUILD_LABEL} · forced: ${forceBackend}`
    : BUILD_LABEL;
  buildInfo.title = forceBackend
    ? `Inference pinned to ${forceBackend}. Click to return to automatic.`
    : 'Click to force CPU (WASM) inference, for testing the fallback path.';
}

buildInfo.addEventListener('click', () => {
  void (async () => {
    const { forceBackend } = await readSettings();
    await setForceBackend(forceBackend === 'wasm' ? null : 'wasm');
    await renderBuildInfo();
    // The host caches its session, so it must be replaced for this to take hold.
    await sendToWorker({ type: MSG.RESTART_BACKEND });
  })();
});

void renderBuildInfo();

/**
 * Observe-only: run the whole pipeline, then report the action instead of
 * performing it.
 *
 * Persisted rather than per-run, because the runs it exists for come in
 * batches — pointing Shield at one live site after another — and a checkbox
 * that reset itself each time the popup closed would be off exactly when it was
 * being relied on.
 *
 * The state is read back from storage on open rather than assumed, so the box
 * always shows what the next run will actually do.
 */
void (async () => {
  const { observeOnly: enabled } = await readSettings();
  observeOnly.checked = enabled;
})();

/**
 * Hand the page over to the user to mark up.
 *
 * The popup closes immediately afterwards, and that is not a side effect to
 * work around — it is required. Drawing needs the mouse over the page, and a
 * popup holds focus until it is dismissed, so leaving it open would mean the
 * first drag went to the popup rather than to the page.
 *
 * The request goes to the service worker rather than straight to the tab. It
 * used to go straight to the tab, which fails on any page the content script
 * has not been injected into yet — and the advice for that failure was to run
 * Shield once first. That inverted the whole feature: the first run transmits
 * the page, so the user had already sent the thing they opened this to hide.
 * The worker can inject, so marking now works as the FIRST thing done on a
 * page, which is the order that makes sense.
 */
manualButton.addEventListener('click', () => {
  void (async () => {
    manualButton.disabled = true;
    const result = await sendToWorker<BeginManualResult>({ type: MSG.BEGIN_MANUAL });
    manualButton.disabled = false;

    if (result?.ok) {
      window.close();
      return;
    }

    // Closing onto a page where nothing will happen would look like the button
    // did nothing, so the popup stays open and says why instead.
    statusDetail.textContent =
      result?.message ?? 'Shield could not open marking mode on this page.';
    statusDetail.hidden = false;
  })();
});

manualClear.addEventListener('click', () => {
  void (async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    try {
      await chrome.tabs.sendMessage(tab.id, { type: MSG.CLEAR_MANUAL });
    } catch {
      // No content script means no marks to clear. Nothing to report.
    }
    await renderManualCount();
  })();
});

/**
 * Show how many areas this page is carrying, if any.
 *
 * Asked of the tab DIRECTLY, never through the worker, because the worker would
 * inject the content script to answer it. Opening the popup must not be what
 * puts Shield on a page — injection stays tied to the user actually starting a
 * run or choosing to mark. A page with no content script has no marks, and the
 * failed send is exactly that answer.
 */
async function renderManualCount(): Promise<void> {
  let count = 0;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    try {
      const status = (await chrome.tabs.sendMessage(tab.id, {
        type: MSG.MANUAL_STATUS,
      })) as ManualStatusResult | undefined;
      count = status?.count ?? 0;
    } catch {
      count = 0;
    }
  }

  manualState.hidden = count === 0;
  manualCount.textContent =
    count === 1 ? '1 area marked on this page' : `${count} areas marked on this page`;
}

void renderManualCount();

observeOnly.addEventListener('change', () => {
  void setObserveOnly(observeOnly.checked);
});

/**
 * Show exactly what left the machine on the last run.
 *
 * Read fresh each time the panel is opened rather than cached: showing a stale
 * payload as though it were the current one would be worse than showing
 * nothing, since the entire value of this panel is that it can be trusted
 * literally.
 */
async function renderEvidence(): Promise<void> {
  const transmission = await readLastTransmission();

  if (!transmission) {
    evidenceMeta.textContent = 'Nothing has been sent yet.';
    evidenceJson.textContent = '';
    evidenceFrame.hidden = true;
    return;
  }

  // Offered only when the picture is actually there. A button that opens an
  // apology is worse than no button, and a frame can be absent because storage
  // refused it - which costs the picture and never the record.
  evidenceFrame.hidden = transmission.frame === undefined;

  const when = new Date(transmission.at).toLocaleTimeString();
  evidenceMeta.textContent = `Sent to ${transmission.endpoint} at ${when}.`;
  evidenceJson.textContent = transmission.json;
}

evidenceFrame.addEventListener('click', () => {
  void chrome.tabs.create({ url: chrome.runtime.getURL('sent/sent.html') });
});

evidenceToggle.addEventListener('click', () => {
  const opening = evidenceBody.hidden;
  evidenceBody.hidden = !opening;
  evidenceToggle.setAttribute('aria-expanded', String(opening));
  evidenceToggleLabel.textContent = opening ? 'Hide what was sent' : 'What was sent?';
  if (opening) void renderEvidence();
});

/**
 * Show where the time went on the last pass.
 *
 * Driven entirely by the timings the pipeline already records against the
 * ARCHITECTURE.md Section 6 budget, so the panel cannot disagree with the
 * console: there is one measurement and two readers of it.
 *
 * The budget is shown next to each number on purpose. "Inference 49ms" means
 * nothing to someone seeing it for the first time; "49ms of 500ms" says both
 * how fast it was and that somebody decided in advance how fast it needed to
 * be. A stage over budget is marked rather than hidden — the whole point of
 * measuring is to see the bad runs.
 */
function renderLatency(state: ShieldState): void {
  const timings = state.timings;
  latencyToggle.hidden = timings.length === 0;

  if (timings.length === 0) {
    latencyBody.hidden = true;
    latencyToggle.setAttribute('aria-expanded', 'false');
    latencyList.replaceChildren();
    latencyTotal.textContent = '';
    return;
  }

  const rows = timings.map((timing) => {
    const row = document.createElement('li');
    row.className = 'latency-row';
    if (timing.overBudget) row.dataset['over'] = 'true';

    const label = document.createElement('span');
    label.className = 'latency-label';
    label.textContent = timing.label;

    const value = document.createElement('span');
    value.className = 'latency-value';
    value.textContent = `${timing.durationMs.toFixed(0)}ms / ${timing.budgetMs}ms`;

    row.append(label, value);
    return row;
  });

  latencyList.replaceChildren(...rows);

  const total = timings.reduce((sum, timing) => sum + timing.durationMs, 0);
  // "Measured" and not "total time you waited": the stages between these
  // measurements — setting up the offscreen document, waiting for the page to
  // settle after an action — are real time that this sum does not include, and
  // presenting it as the whole would overstate how fast Shield is.
  latencyTotal.textContent =
    `${total.toFixed(0)}ms measured across ${timings.length} stages` +
    (state.step > 1 ? ` · step ${state.step}` : '');
}

/**
 * How many passes the panel lists.
 *
 * The log keeps two hundred; a popup that rendered all of them would be a
 * scroll nobody reaches the bottom of. The export is the complete record — this
 * is the recent history, which is what the panel is actually read for.
 */
const AUDIT_ROWS = 12;

/**
 * Every pass Shield has made, as counts.
 *
 * Read fresh each time the panel opens, for the same reason the payload panel
 * is: a stale history shown as the current one would be worse than showing
 * none, and the value of both panels is that they can be read literally.
 */
async function renderAudit(): Promise<void> {
  const entries = await readAudit();

  auditMeta.textContent =
    entries.length === 0
      ? 'Nothing recorded yet.'
      : `${entries.length} pass${entries.length === 1 ? '' : 'es'} recorded. ` +
        'Categories, counts and rule names only — no page content.';

  auditList.replaceChildren(
    ...entries.slice(0, AUDIT_ROWS).map((entry) => {
      const row = document.createElement('li');
      row.className = 'audit-row';

      const when = document.createElement('span');
      when.className = 'audit-when';
      when.textContent = new Date(entry.at).toLocaleString();

      const what = document.createElement('span');
      what.className = 'audit-what';
      // The scope is spelled out on every row. A scan and a run report numbers
      // in the same shape while making claims of very different widths, and a
      // list that showed only the numbers would invite comparing them.
      const scope =
        entry.examined === 'viewport'
          ? 'this screen'
          : entry.examined === 'document'
            ? 'whole page'
            : 'part of the page';
      const found =
        entry.total === 0
          ? 'nothing found'
          : entry.counts
              .map(({ category, count }) => `${count} ${CATEGORY_LABEL[category] ?? category}`)
              .join(', ');
      what.textContent = `${found} · ${scope} · ${entry.transmitted ? 'sent' : 'not sent'}`;

      row.append(when, what);
      return row;
    }),
  );
}

auditToggle.addEventListener('click', () => {
  const opening = auditBody.hidden;
  auditBody.hidden = !opening;
  auditToggle.setAttribute('aria-expanded', String(opening));
  auditToggleLabel.textContent = opening ? 'Hide history' : 'What has been hidden?';
  if (opening) void renderAudit();
});

/**
 * Hand the log over as a file.
 *
 * A blob URL and an anchor rather than the `downloads` permission: this is one
 * file the user asked for, and asking Chrome for download access across every
 * site in order to save it would be a permission far wider than the feature.
 */
auditExport.addEventListener('click', () => {
  void (async () => {
    const json = auditJson(await readAudit());
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const link = document.createElement('a');

    link.href = url;
    link.download = `shield-audit-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();

    // Revoked once the click has been handled, or the blob is held for the life
    // of the document.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  })();
});

auditClear.addEventListener('click', () => {
  void (async () => {
    await clearAudit();
    await renderAudit();
  })();
});

/**
 * Capturing a real page for the benchmark corpus - dev builds only.
 *
 * WHY THE PANEL IS BUILT HERE RATHER THAN WRITTEN IN popup.html
 *
 * Because the first version was not actually gated. `__SHIELD_DEV__` set
 * `panel.hidden`, which hides a panel that is still entirely present: the
 * markup shipped in popup.html and every listener was still attached, so
 * anybody with devtools could unhide it and use it. A capability that writes
 * real field values to a file has to be ABSENT from a build somebody
 * installed, not merely out of sight. Wrapped in `if (__SHIELD_DEV__)` the
 * define makes this `if (false)`, and the whole thing - markup included -
 * leaves the bundle.
 *
 * WHY SAVING TAKES A SECOND CLICK
 *
 * The file carries field values verbatim, because a benchmark fed sanitised
 * input measures a detector on a page that does not exist: Verhoeff runs on the
 * actual digits (DECISIONS.md 171). So nothing is written until the values have
 * been listed and looked at. "Only capture when logged out" is unenforceable;
 * being shown the contents is not.
 */
function wireCorpusCapture(): void {
  // Read once, into a variable, so the file that gets saved is the page that
  // was reviewed rather than whatever the page has become since.
  let reviewed: { elements: ExtractDomResult['elements']; values: ReviewableValue[] } | null = null;

  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.innerHTML = [
    '<button class="panel-toggle" type="button" aria-expanded="false">',
    '  <span>Capture this page for the corpus</span>',
    '  <svg class="chevron" viewBox="0 0 20 20" aria-hidden="true">',
    '    <path d="m7.5 4.5 6 5.5-6 5.5"/>',
    '  </svg>',
    '</button>',
    '<div class="panel-body" hidden>',
    '  <p class="evidence-meta">Development build. Field values are exported',
    '    verbatim - capture only from logged-out or synthetic-data pages.</p>',
    '  <label class="dev-label" for="devtools-about">What is this page?</label>',
    '  <input id="devtools-about" class="dev-input" type="text"',
    '         placeholder="e.g. state transport booking, logged out" />',
    '  <button class="linkish" type="button">Read the page</button>',
    '  <p class="evidence-meta"></p>',
    '  <ul class="audit-list"></ul>',
    '  <button class="linkish" type="button" hidden>Save these values to a file</button>',
    '</div>',
  ].join('\n');

  const find = <T extends Element>(selector: string, index = 0): T => {
    const element = panel.querySelectorAll<T>(selector)[index];
    if (!element) throw new Error(`Capture panel is missing ${selector}`);
    return element;
  };

  const toggle = find<HTMLButtonElement>('.panel-toggle');
  const toggleLabel = find<HTMLSpanElement>('.panel-toggle span');
  const body = find<HTMLDivElement>('.panel-body');
  const about = find<HTMLInputElement>('.dev-input');
  const read = find<HTMLButtonElement>('.linkish', 0);
  const meta = find<HTMLParagraphElement>('.evidence-meta', 1);
  const values = find<HTMLUListElement>('.audit-list');
  const save = find<HTMLButtonElement>('.linkish', 1);

  // Appended after the history panel, which is where it belongs on screen and
  // is also the only anchor available now that the markup is not in the HTML.
  (auditToggle.closest('.panel') ?? auditToggle.parentElement)?.after(panel);

  function clearReview(): void {
    reviewed = null;
    save.hidden = true;
    values.replaceChildren();
  }

  /**
   * Get the content script onto the tab, the way a run does.
   *
   * Shield declares no static content script - it is injected under
   * `activeTab` only when the user points Shield at a page, which is a real
   * privacy property rather than a smaller permission warning. The consequence
   * is that a freshly opened tab has nothing to talk to, and the first version
   * of this panel simply failed there and told the user to reload the page.
   * That advice could never work: there is no declared script for a reload to
   * bring back.
   */
  async function ensureReadable(tabId: number): Promise<boolean> {
    const alive = (await chrome.tabs
      .sendMessage(tabId, { type: MSG.PING })
      .catch(() => null)) as { ok?: boolean } | null;
    if (alive?.ok) return true;

    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ['content-script.js'] });
    } catch {
      // Chrome refuses injection on its own pages outright, and the raw message
      // is internal wording no user should be shown.
      return false;
    }

    const confirmed = (await chrome.tabs
      .sendMessage(tabId, { type: MSG.PING })
      .catch(() => null)) as { ok?: boolean } | null;
    return confirmed?.ok === true;
  }

  async function readPageForCorpus(): Promise<void> {
    clearReview();
    meta.textContent = 'Reading...';

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      meta.textContent = 'No active tab.';
      return;
    }

    if (!(await ensureReadable(tab.id))) {
      meta.textContent = 'Shield cannot read this page. Chrome blocks its own pages.';
      return;
    }

    const result = (await chrome.tabs
      .sendMessage(tab.id, { type: MSG.EXTRACT_DOM })
      .catch(() => null)) as ExtractDomResult | null;

    if (!result) {
      meta.textContent = 'The page could not be read.';
      return;
    }

    const reviewable = reviewableValues(result.elements);
    reviewed = { elements: result.elements, values: reviewable };

    meta.textContent =
      `${result.elements.length} elements. ` +
      (reviewable.length === 0
        ? 'No field values at all - nothing here to leak.'
        : `${reviewable.length} value${reviewable.length === 1 ? '' : 's'} would be written. ` +
          'Read them before saving.');

    values.replaceChildren(
      ...reviewable.map((entry) => {
        const row = document.createElement('li');
        row.className = 'audit-row';

        const field = document.createElement('span');
        field.className = 'audit-when';
        field.textContent = `${entry.elementId} · ${entry.field}`;

        // textContent, never innerHTML. This is page-authored content being
        // shown inside an extension page, which is the one place on this
        // surface where markup must never be allowed to run.
        const value = document.createElement('span');
        value.className = 'audit-what';
        value.textContent = entry.value;

        row.append(field, value);
        return row;
      }),
    );

    save.hidden = false;
  }

  toggle.addEventListener('click', () => {
    const opening = body.hidden;
    body.hidden = !opening;
    toggle.setAttribute('aria-expanded', String(opening));
    toggleLabel.textContent = opening ? 'Hide capture' : 'Capture this page for the corpus';
    // A review belongs to the moment it was made. Closing the panel ends it.
    if (!opening) clearReview();
  });

  read.addEventListener('click', () => {
    void readPageForCorpus();
  });

  save.addEventListener('click', () => {
    if (!reviewed) return;

    const json = mapExportJson({ elements: reviewed.elements }, about.value.trim());
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const link = document.createElement('a');

    link.href = url;
    link.download = mapExportFilename();
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);

    meta.textContent = 'Saved. Label it from the PAGE, never from the detector output.';
    clearReview();
  });
}

// Resolved to `if (false)` by the define, so nothing above survives a build
// that did not ask for it.
if (__SHIELD_DEV__) wireCorpusCapture();

latencyToggle.addEventListener('click', () => {
  const opening = latencyBody.hidden;
  latencyBody.hidden = !opening;
  latencyToggle.setAttribute('aria-expanded', String(opening));
  latencyToggleLabel.textContent = opening ? 'Hide timings' : 'Where did the time go?';
});

/**
 * Start a whole-page scan.
 *
 * The popup deliberately stays open, unlike marking. A scan takes several
 * seconds and moves the page while it works, and something that scrolls
 * somebody's screen unprompted needs a visible reason on screen the whole time
 * it is happening — plus a Cancel button, which is right here.
 */
scanButton.addEventListener('click', () => {
  void sendToWorker({ type: MSG.SCAN_PAGE });
  render({ ...INITIAL_STATE, status: 'scanning' });
});

const CATEGORY_LABEL: Readonly<Record<string, string>> = {
  password: 'password',
  name: 'name',
  email: 'email',
  phone: 'phone',
  address: 'address',
  id_number: 'ID number',
  face: 'face',
  other: 'unidentified',
};

/**
 * Say how much of the page the last run actually read.
 *
 * Two different sentences rather than one warning that appears only sometimes.
 * A page that fit on screen gets a quiet confirmation; a page that did not gets
 * the same line the console printed, weighted so it reads as a limit rather
 * than a status.
 */
function renderCoverage(state: ShieldState): void {
  const coverage = state.coverage;
  // Suppressed during a scan, which is examining the whole document and is
  // about to replace this claim with a wider one.
  if (!coverage || state.status === 'scanning') {
    coverageNotice.hidden = true;
    return;
  }

  coverageNotice.hidden = false;
  coverageNotice.dataset['partial'] = String(coverage.partial);
  coverageNotice.textContent = coverage.partial
    ? `${coverage.message} Scan the whole page to check the rest.`
    : coverage.message;
}

/**
 * How many findings the page is currently carrying.
 *
 * Asked of the tab DIRECTLY, never through the worker, for the same reason
 * `renderManualCount` is: the worker would inject the content script to answer,
 * and opening the popup must not be what puts Shield on a page.
 *
 * Read on open rather than taken from run state, because the state is lost when
 * the service worker is evicted while the findings — which live in the page —
 * are not. Without this, reopening the popup would report no protection while
 * the protection was still in place.
 */
async function scanFindingCount(): Promise<number> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return 0;

  try {
    const status = (await chrome.tabs.sendMessage(tab.id, {
      type: MSG.SCAN_STATUS,
    })) as ScanStatusResult | undefined;
    return status?.count ?? 0;
  } catch {
    // No content script means no findings.
    return 0;
  }
}

/** Show what a scan found, or how far one has got. */
function renderScan(state: ShieldState): void {
  const progress = state.scanProgress;

  if (state.status === 'scanning') {
    scanState.hidden = false;
    scanState.dataset['tone'] = 'accent';
    scanClear.hidden = true;
    scanProof.hidden = true;
    scanSummary.textContent =
      progress && progress.total > 0
        ? `Reading screen ${progress.stop} of ${progress.total}…`
        : 'Measuring the page…';
    return;
  }

  const scan = state.scan;
  if (!scan) {
    // No run state, but the page may still be carrying findings from a scan
    // this popup did not witness.
    void (async () => {
      const count = await scanFindingCount();
      scanState.hidden = count === 0;
      scanClear.hidden = count === 0;
      scanProof.hidden = count === 0;
      scanState.dataset['tone'] = 'accent';
      scanSummary.textContent = `${count} area${count === 1 ? '' : 's'} from the last scan · hidden on every run`;
    })();
    return;
  }

  scanState.hidden = false;
  scanClear.hidden = false;
  // Offered even when nothing was found. "Shield looked at all six screens and
  // there was nothing to hide" is a result worth being able to show somebody,
  // not an empty state to suppress.
  scanProof.hidden = false;
  scanState.dataset['tone'] = scan.truncated ? 'warn' : 'accent';

  const looked = `${scan.stops} screen${scan.stops === 1 ? '' : 's'}`;

  if (scan.total === 0) {
    scanClear.hidden = true;
    scanSummary.textContent = scan.truncated
      ? `Nothing found in ${looked} — the scan stopped before the end of the page`
      : `Nothing sensitive found across ${looked}`;
    return;
  }

  // Named by category rather than totalled, because "6 found" says nothing
  // about whether that is six headings or six ID numbers. And the sentence ends
  // with what Shield will DO about them: a scan that only reported would be
  // pointing at an Aadhaar number and leaving it there.
  const breakdown = scan.counts
    .map(({ category, count }) => `${count} ${CATEGORY_LABEL[category] ?? category}`)
    .join(', ');

  scanSummary.textContent = scan.truncated
    ? `${breakdown} — stopped early · hidden on every run`
    : `${breakdown} across ${looked} · hidden on every run`;
}

/**
 * Open the scan record in a tab of its own.
 *
 * A tab rather than a panel: this is the one artefact meant to be looked at
 * rather than glanced at, and a 348px popup cannot show a screenshot at a size
 * where somebody can check that their ID number really was covered.
 */
scanProof.addEventListener('click', () => {
  void chrome.tabs.create({ url: chrome.runtime.getURL('proof/proof.html') });
  window.close();
});

scanClear.addEventListener('click', () => {
  void (async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    try {
      await chrome.tabs.sendMessage(tab.id, { type: MSG.CLEAR_SCAN });
    } catch {
      // No content script means nothing to clear.
    }
    // The pictures go with the findings. Leaving a filmstrip behind after the
    // protection it documents has been cleared would show a record of something
    // that is no longer true.
    await clearScanProof();
    scanState.hidden = true;
  })();
});

/** Statuses during which a run is genuinely in flight. */
const BUSY_STATUSES = new Set<ShieldState['status']>([
  'reading',
  'detecting',
  'redacting',
  'sending',
  'thinking',
  'acting',
  // A scan is not a run, but it holds the page for several seconds and must not
  // have a run started underneath it.
  'scanning',
]);

function render(state: ShieldState): void {
  const busy = BUSY_STATUSES.has(state.status);

  statusDot.dataset['status'] = state.status;
  statusLabel.textContent = STATUS_LABEL[state.status];

  if (state.errorMessage) {
    statusDetail.textContent = state.errorMessage;
    statusDetail.hidden = false;
  } else {
    statusDetail.textContent = '';
    statusDetail.hidden = true;
  }

  if (state.fellBack) {
    backendNotice.textContent =
      "This computer's graphics acceleration isn't available to Shield, so it's " +
      'running on the CPU. Everything still works — it will just be slower.';
    backendNotice.hidden = false;
  } else {
    backendNotice.hidden = true;
  }

  runButton.disabled = busy;
  runLabel.textContent = busy ? 'Working…' : 'Run Shield';
  cancelButton.hidden = !busy;
  taskInput.disabled = busy;
  scanButton.disabled = busy;
  manualButton.disabled = busy;
  // The status word alone cannot separate "working" from "stalled" at a glance.
  progress.hidden = !busy;

  renderLatency(state);
  renderCoverage(state);
  renderScan(state);

  // Restore the in-flight task text, since the popup may have been closed and
  // reopened partway through a run.
  if (state.taskQuery && !taskInput.value) taskInput.value = state.taskQuery;
}

taskForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const taskQuery = taskInput.value.trim();
  if (!taskQuery) return;

  // Paint the optimistic state immediately so the button can't be pressed
  // twice while the worker spins up.
  render({ ...INITIAL_STATE, status: 'reading', taskQuery });
  void sendToWorker({ type: MSG.RUN_TASK, taskQuery });
});

cancelButton.addEventListener('click', () => {
  void sendToWorker({ type: MSG.CANCEL_TASK });
  render(INITIAL_STATE);
});

chrome.runtime.onMessage.addListener((message: WorkerBroadcast) => {
  if (message.type === MSG.STATE_CHANGED) {
    render((message as StateChangedMessage).state);
  }
});

// Fired the instant the popup opens, before the user has typed a character.
// Loading the model takes about a second; typing a task takes several. Doing
// them concurrently makes that second disappear.
void sendToWorker({ type: MSG.PREPARE });

void (async () => {
  const state = await sendToWorker<ShieldState>({ type: MSG.GET_STATE });
  render(state ?? INITIAL_STATE);
  if (!state || !BUSY_STATUSES.has(state.status)) taskInput.focus();
})();
