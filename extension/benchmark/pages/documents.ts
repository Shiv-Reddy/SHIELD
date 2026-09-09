/**
 * Pages that are a scanned identity document and little else.
 *
 * They exist so pixel ground truth has a page to attach to. The element map is
 * honest about what a browser would report — one image, an alt text, a caption
 * — and that is the whole point: the DOM path can see that a card is there and
 * nothing about what is printed on it, which is why the element label is a miss
 * and the measurement that matters is in `pixels.ts`.
 *
 * The images are `test-screens/aadhaar_sample.svg` and `pan_sample.svg`:
 * committed, fictional, and drawn as SVG so their text carries exact
 * coordinates.
 */

import { button, image, page, text } from './build';

const CARD = { width: 640, height: 380 };

export const DOCUMENTS = [
  page({
    id: 'doc-01-aadhaar-card',
    source: 'fixture',
    about: 'A sample Aadhaar card, full size. Everything identifying is pixels.',
    elements: [
      text('h', 'Uploaded document — Aadhaar'),
      image('card', 'Fictional sample Aadhaar card, not a real document', CARD),
      text('cap', 'Uploaded 09 Sep 2026 · Verified'),
      button('rm', 'Remove'),
    ],
    sensitive: [
      // The element is the whole card. True, and it cannot distinguish covering
      // the number from painting over the entire image, which is what the pixel
      // truth for this page exists to measure.
      { elementId: 'card', category: 'id_number' },
    ],
  }),

  page({
    id: 'doc-02-pan-card',
    source: 'fixture',
    about: 'A sample PAN card, full size. Two names, a number and a date.',
    elements: [
      text('h', 'Uploaded document — PAN'),
      image('card', 'Fictional sample PAN card, not a real document', CARD),
      text('cap', 'Uploaded 09 Sep 2026 · Pending verification'),
      button('rm', 'Remove'),
    ],
    sensitive: [{ elementId: 'card', category: 'id_number' }],
  }),
];
