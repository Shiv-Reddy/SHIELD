/**
 * Helpers for writing corpus pages.
 *
 * WHY POSITIONS ARE LAID OUT RATHER THAN LEFT AT ZERO
 *
 * Metric 3 is an AREA question — coverage, redaction precision and the area
 * ratio all divide painted pixels by needed pixels. Elements stacked at the
 * same coordinates would make every page's areas identical and the three
 * numbers meaningless, and it would be an easy thing not to notice, because the
 * report would still print. So `stack` gives every element its own box, sized
 * by what it is.
 *
 * The sizes are plausible, not measured, exactly as the fixture screens' are.
 * A corpus that claimed measured pixel values it never measured would be worse
 * than one that says they are illustrative.
 */

import type { GroundTruth, LabelledPage } from '../../src/lib/benchmark/score';
import type { DomElement } from '../../src/lib/types';

const CANVAS_WIDTH = 960;
const GUTTER = 24;

export interface Draft extends Omit<DomElement, 'position' | 'selector'> {
  /** Overrides the size `stack` would give this element type. */
  size?: { width: number; height: number };
}

function draft(overrides: Partial<Draft> & { elementId: string }): Draft {
  return {
    elementType: 'input',
    label: null,
    value: null,
    inputType: 'text',
    autocomplete: null,
    name: null,
    placeholder: null,
    ...overrides,
  };
}

/** A form control. The overwhelming majority of what a real Indian form is made of. */
export function field(
  elementId: string,
  overrides: Partial<Draft> = {},
): Draft {
  return draft({ elementId, ...overrides });
}

/** Rendered page text. Where `classifyTextContent` earns or loses its recall. */
export function text(elementId: string, value: string, overrides: Partial<Draft> = {}): Draft {
  return draft({
    elementId,
    elementType: 'text',
    inputType: null,
    value,
    ...overrides,
  });
}

export function button(elementId: string, label: string): Draft {
  return draft({ elementId, elementType: 'button', inputType: null, label });
}

/**
 * An image. Nothing the DOM path can read, by construction.
 *
 * Present because real Indian portals are full of them — a scanned PAN card, a
 * photo on an EPIC, a QR code with an account behind it — and a corpus without
 * them would measure a page shape that does not exist.
 */
export function image(
  elementId: string,
  label: string,
  size = { width: 320, height: 200 },
): Draft {
  return draft({ elementId, elementType: 'image', inputType: null, label, size });
}

const DEFAULT_SIZE: Record<DomElement['elementType'], { width: number; height: number }> = {
  input: { width: 320, height: 38 },
  button: { width: 150, height: 40 },
  text: { width: 520, height: 22 },
  image: { width: 320, height: 200 },
  other: { width: 200, height: 24 },
};

/**
 * Turn drafts into an element map, laying them out down the page.
 *
 * Selectors are generated rather than written out. They are never resolved in
 * the benchmark — nothing here touches a browser — and a hand-written selector
 * per element would be several hundred lines of text that no test could check.
 */
export function stack(drafts: readonly Draft[]): DomElement[] {
  let y = GUTTER;

  return drafts.map(({ size, ...rest }) => {
    const box = size ?? DEFAULT_SIZE[rest.elementType];
    const position = {
      x: GUTTER,
      y,
      width: Math.min(box.width, CANVAS_WIDTH - GUTTER * 2),
      height: box.height,
    };
    y += box.height + 14;

    return { ...rest, selector: `html > body #${rest.elementId}`, position };
  });
}

/**
 * One corpus page: the element map fed to the detector, plus its labels.
 *
 * `elements` on the LabelledPage is derived here rather than written out, so
 * the boxes the scorer measures are always the boxes the detector saw. Keeping
 * two copies in step by hand is the kind of thing that stays correct for about
 * a month.
 */
export interface CorpusEntry extends LabelledPage {
  input: DomElement[];
  about: string;
}

export function page(spec: {
  id: string;
  source: LabelledPage['source'];
  about: string;
  elements: readonly Draft[];
  sensitive: readonly GroundTruth[];
}): CorpusEntry {
  const input = stack(spec.elements);
  const known = new Set(input.map((element) => element.elementId));

  // A label naming an element that is not on the page is a corpus bug. The
  // scorer counts it as expected-but-never-found, which reads in the report as
  // a detector failure — so it is caught here, at the point somebody can still
  // see the typo, rather than quietly lowering recall forever.
  for (const entry of spec.sensitive) {
    if (!known.has(entry.elementId)) {
      throw new Error(`${spec.id}: labelled "${entry.elementId}", which is not on the page`);
    }
  }

  const seen = new Set<string>();
  for (const element of input) {
    if (seen.has(element.elementId)) {
      throw new Error(`${spec.id}: two elements share the id "${element.elementId}"`);
    }
    seen.add(element.elementId);
  }

  return {
    id: spec.id,
    source: spec.source,
    about: spec.about,
    input,
    elements: input.map((element) => ({
      elementId: element.elementId,
      position: element.position,
    })),
    sensitive: spec.sensitive,
  };
}
