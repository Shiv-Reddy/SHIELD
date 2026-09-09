/**
 * The whole page, redacted, as a picture — held on this machine and sent nowhere.
 *
 * WHY THIS EXISTS RATHER THAN A FULL-PAGE CAPTURE
 *
 * The obvious version of "protect the whole page" is to capture and transmit
 * the whole page. That was costed and rejected, and the decisive number is not
 * latency or memory but resolution: vision APIs downscale to roughly 1500px on
 * the longest side, so a five-screen page arrives about 600px wide and 16px
 * text lands at ~5px. The model would receive the same page at a third of the
 * detail it gets now. A full-page capture makes the agent worse.
 *
 * What a full-page image is genuinely good for is PROOF — showing a person that
 * every screen of their page was examined and everything sensitive on it was
 * covered. That job has no network in it at all, so it is done here: the scan
 * already walks every screen, and each one is redacted and kept.
 *
 * A FILMSTRIP, NOT A STITCH
 *
 * Deliberately screen by screen rather than joined into one tall image. Sticky
 * headers and `position: fixed` furniture repeat at every seam, so a stitched
 * page shows content that never coexisted on screen and repeats banners that
 * appear once. This is the surface whose entire value is that it can be
 * believed literally; a composite would be the one place in the product showing
 * somebody a page that does not exist.
 *
 * ONLY REDACTED FRAMES ARE EVER WRITTEN HERE
 *
 * `recordScanProof` accepts frames that have already been through the redaction
 * engine, and the scan drops a screen entirely rather than storing a raw one
 * when redaction fails. Storage outlives the page, the tab and the browser
 * session, so a raw frame written here would be a screenshot of somebody's
 * private page sitting on disk — a far longer-lived exposure than anything else
 * in this pipeline handles.
 */

const STORAGE_KEY = 'scanProof';

/** One screen the scan examined, after redaction. */
export interface ProofScreen {
  /** Document offset this screen was captured at, so the order is checkable. */
  at: number;
  /** Redacted frame, as a data URL. Never a raw one — see the note above. */
  dataUrl: string;
  /** How many sensitive regions were painted out of this screen. */
  covered: number;
}

export interface ScanProof {
  at: number;
  documentHeight: number;
  viewportHeight: number;
  /** True when the scan stopped before the end of the page. */
  truncated: boolean;
  /**
   * Screens that were examined but could not be redacted, and so are absent.
   *
   * Counted rather than quietly dropped. A filmstrip with a hole in it that
   * says nothing about the hole is the "checked and safe" misreading again:
   * whoever is looking would take the screens present as the whole page.
   */
  omitted: number;
  screens: ProofScreen[];
}

/**
 * Most screens kept.
 *
 * `chrome.storage.local` is finite and shared with everything else the
 * extension keeps, and a redacted JPEG runs 60-70KB as base64. Twelve is the
 * scan's own stop cap, so this never truncates a scan that itself completed.
 */
export const MAX_PROOF_SCREENS = 12;

/** Store the proof. Never throws — evidence must not break what it records. */
export async function recordScanProof(proof: ScanProof): Promise<void> {
  try {
    await chrome.storage.local.set({
      [STORAGE_KEY]: { ...proof, screens: proof.screens.slice(0, MAX_PROOF_SCREENS) },
    });
  } catch (error) {
    console.warn('[shield] could not store the scan proof', error);
  }
}

export async function readScanProof(): Promise<ScanProof | null> {
  try {
    const stored = await chrome.storage.local.get([STORAGE_KEY]);
    const value = stored[STORAGE_KEY];
    if (typeof value !== 'object' || value === null) return null;
    return value as ScanProof;
  } catch (error) {
    console.warn('[shield] could not read the scan proof', error);
    return null;
  }
}

export async function clearScanProof(): Promise<void> {
  try {
    await chrome.storage.local.remove([STORAGE_KEY]);
  } catch (error) {
    console.warn('[shield] could not clear the scan proof', error);
  }
}

/**
 * One line describing what the filmstrip shows.
 *
 * Pure, so the wording is testable — and it is worth testing, because this
 * sentence is the caption on the strongest visual claim the product makes and
 * it must not overstate it by a word.
 */
export function describeProof(proof: ScanProof): string {
  const screens = proof.screens.length;
  const covered = proof.screens.reduce((sum, screen) => sum + screen.covered, 0);

  const looked =
    `${screens} screen${screens === 1 ? '' : 's'} of this page ` +
    `${screens === 1 ? 'was' : 'were'} examined`;

  const hidden =
    covered === 0
      ? 'nothing sensitive was found'
      : `${covered} area${covered === 1 ? '' : 's'} ${covered === 1 ? 'was' : 'were'} covered`;

  const gaps: string[] = [];
  if (proof.truncated) gaps.push('the scan stopped before the end of the page');
  if (proof.omitted > 0) {
    gaps.push(
      `${proof.omitted} screen${proof.omitted === 1 ? '' : 's'} could not be shown`,
    );
  }

  const caveat = gaps.length > 0 ? ` — ${gaps.join(', and ')}` : '';
  return `${looked}, and ${hidden}${caveat}. None of this was sent anywhere.`;
}
