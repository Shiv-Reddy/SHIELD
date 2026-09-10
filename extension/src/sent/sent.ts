/**
 * The frame that was transmitted, rendered.
 *
 * A thin reader over `lib/redaction/evidence.ts` and nothing else. It holds no
 * state, makes no requests, and has no way to reach the network — the same
 * property the scan record's page has, and it matters here for the same
 * reason: this page holds a picture of somebody's screen. A redacted picture,
 * but the shortest description of this file should stay "it reads storage and
 * puts one image on a page".
 */

import { readLastTransmission } from '../lib/redaction/evidence';

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Sent-frame markup is missing ${selector}`);
  return element;
}

const summary = required<HTMLParagraphElement>('#summary');
const empty = required<HTMLParagraphElement>('#empty');
const missing = required<HTMLParagraphElement>('#missing');
const figure = required<HTMLElement>('#figure');
const image = required<HTMLImageElement>('#image');

async function render(): Promise<void> {
  const transmission = await readLastTransmission();

  if (!transmission) {
    empty.hidden = false;
    summary.textContent = '';
    return;
  }

  // The time and the destination, because "what was sent" is incomplete
  // without "when" and "where". The endpoint is the one piece of routing
  // information that belongs to us rather than to the user's page.
  const when = new Date(transmission.at).toLocaleString();
  const kb = (transmission.frameBytes / 1024).toFixed(0);
  summary.textContent = `Sent ${when} to ${transmission.endpoint} — ${kb}KB image.`;

  // A missing frame is a missing PICTURE, never a missing record. Said in
  // those words so nobody reads an absent image as "nothing was sent".
  if (!transmission.frame) {
    missing.hidden = false;
    return;
  }

  image.src = transmission.frame;
  figure.hidden = false;
}

void render();
