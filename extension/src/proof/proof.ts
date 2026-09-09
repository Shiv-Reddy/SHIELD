/**
 * The scan record, rendered.
 *
 * A thin reader over `lib/scan-proof.ts` and nothing else. It holds no state,
 * makes no requests, and has no way to reach the network — which matters more
 * here than in most pages, because this one holds pictures of somebody's
 * screen. They are redacted pictures, but the shortest description of this file
 * should stay "it reads storage and puts images on a page".
 */

import { describeProof, readScanProof, type ProofScreen } from '../lib/scan-proof';

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Proof markup is missing ${selector}`);
  return element;
}

const summary = required<HTMLParagraphElement>('#summary');
const empty = required<HTMLParagraphElement>('#empty');
const screens = required<HTMLOListElement>('#screens');
const boundary = required<HTMLParagraphElement>('#boundary');

function screenRow(screen: ProofScreen, index: number): HTMLLIElement {
  const row = document.createElement('li');
  row.className = 'screen';

  const caption = document.createElement('p');
  caption.className = 'caption';

  const label = document.createElement('span');
  label.className = 'caption-label';
  // The document offset is shown, not just an index. It is what makes the strip
  // checkable against the page: a reader can scroll their own page to 1,240px
  // and compare.
  label.textContent = `Screen ${index + 1} · from ${screen.at}px down the page`;

  const covered = document.createElement('span');
  covered.className = 'caption-covered';
  covered.dataset['none'] = String(screen.covered === 0);
  covered.textContent =
    screen.covered === 0
      ? 'nothing to hide here'
      : `${screen.covered} area${screen.covered === 1 ? '' : 's'} covered`;

  caption.append(label, covered);

  const image = document.createElement('img');
  image.className = 'shot';
  image.src = screen.dataUrl;
  image.alt = `Screen ${index + 1} of the page, with sensitive areas painted out`;
  // Decoding a dozen full-size screenshots at once stalls the first paint, and
  // this page is opened to be looked at immediately.
  image.loading = 'lazy';

  row.append(caption, image);
  return row;
}

void (async () => {
  const proof = await readScanProof();

  if (!proof || proof.screens.length === 0) {
    empty.hidden = false;
    summary.hidden = true;
    return;
  }

  summary.textContent = describeProof(proof);
  screens.replaceChildren(...proof.screens.map(screenRow));

  // Shown at the END of the strip, where a reader arrives after looking at
  // everything that WAS examined. Stated up top it would read as a disclaimer
  // to skip; stated here it is the last thing seen.
  boundary.hidden = !proof.truncated;
})();
