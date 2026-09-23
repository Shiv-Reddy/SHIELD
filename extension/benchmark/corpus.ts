/**
 * The labelled corpus — ground truth for metrics 2 and 3.
 *
 * WHAT A LABEL MEANS HERE
 *
 * "A careful person reading this page would not want this transmitted." That
 * judgement is made by looking at the PAGE, never at what the detector does
 * with it. A corpus labelled from the detector's output measures nothing: it
 * scores 100% by construction and goes on scoring 100% through every
 * regression.
 *
 * That rule has a cost, and the cost is the point. Many labels here are things
 * the DOM path structurally cannot see — a password field with no attribute
 * that says so, a name in prose, an identifier printed inside an image, a
 * household income, a reason for a hospital visit. They are labelled sensitive
 * because they ARE sensitive. The benchmark reports them as misses, the recall
 * number is lower for it, and that number is the honest one. Removing them
 * because they are hard would be the same self-flattery as labelling from the
 * output.
 *
 * WHAT IS NOT LABELLED IS A NEGATIVE
 *
 * Every element not named in `sensitive` counts as something that must NOT be
 * flagged. This is what makes precision measurable at all, and it is why the
 * clean control pages — where the correct answer is nothing — earn their place
 * in a corpus about finding things. Several of them are dense with public
 * reference data shaped exactly like personal data: branch IFSC codes, a
 * company's own GSTIN, a PNR help page full of ten-digit examples. Shield is
 * expected to over-flag on those, and it does.
 *
 * WHERE THE PAGES COME FROM, AND WHY THAT IS PRINTED
 *
 * `source` is recorded per page and reported.
 *
 *   fixture   - the test screens, written to exercise our own code.
 *   synthetic - written from what a real page of that kind carries, in the
 *               field-naming conventions those portals actually use, but
 *               authored here. Not a page somebody else built.
 *   real      - captured from a page nobody here wrote, through the dev-only
 *               element-map export. Dropped into `captured/` and labelled by
 *               hand.
 *
 * As of this writing the corpus contains NO real pages, and the report says so
 * in those words rather than letting a reader assume otherwise. Everything in
 * it was written by the people being measured, which is a real limit on what
 * these numbers prove and is exactly what the source column exists to expose.
 * The capture path now exists; filling the `real` share is what remains of
 * TASKS.md T1.1.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import type { DomElement } from '../src/lib/types';
import type { GroundTruth, LabelledPage } from '../src/lib/benchmark/score';
import { PIXEL_TRUTH } from './pixels';
import type { CorpusEntry } from './pages/build';
import { GOVERNMENT } from './pages/government';
import { BANKING } from './pages/banking';
import { TELECOM } from './pages/telecom';
import { SERVICES } from './pages/services';
import { CONTROLS } from './pages/controls';
import { DOCUMENTS } from './pages/documents';
import {
  SCREEN_1_LOGIN,
  SCREEN_2_SIGNUP,
  SCREEN_4_CLEAN,
  SCREEN_5_ADVERSARIAL,
} from '../tests/fixtures/screens';

export type { CorpusEntry } from './pages/build';

/** Reduce an element map to what the scorer needs: an id and a box. */
function boxes(elements: readonly DomElement[]): LabelledPage['elements'] {
  return elements.map((element) => ({
    elementId: element.elementId,
    position: element.position,
  }));
}

/**
 * The four original test screens.
 *
 * Kept verbatim, including their labels. They were the whole corpus when the
 * baseline was taken, and rewriting them while the corpus grew would make the
 * before-and-after incomparable — which is the one thing a baseline is for.
 */
const FIXTURES: CorpusEntry[] = [
  {
    id: '01-login',
    source: 'fixture',
    about: 'The primary demo path. Two sensitive fields and four decoys.',
    input: SCREEN_1_LOGIN,
    elements: boxes(SCREEN_1_LOGIN),
    sensitive: [
      // Declared `autocomplete="username"` but holds an email address. The
      // label for ground truth follows the CONTENT, because that is what would
      // actually be transmitted.
      { elementId: 'e2', category: 'email' },
      { elementId: 'e3', category: 'password' },
    ],
    // Negatives worth naming: e4 is a checkbox with a value, e5 is a link whose
    // text contains "password", e6 is the submit button. Each has broken a
    // careless rule at some point.
  },
  {
    id: '02-signup',
    source: 'fixture',
    about: 'Many fields, uneven signals. The breadth case.',
    input: SCREEN_2_SIGNUP,
    elements: boxes(SCREEN_2_SIGNUP),
    sensitive: [
      { elementId: 's1', category: 'name' },
      { elementId: 's2', category: 'name' },
      { elementId: 's3', category: 'email' },
      { elementId: 's4', category: 'phone' },
      // A date of birth is personal data. It is not any of the named
      // categories, and `other` is exactly the case that exists for.
      { elementId: 's5', category: 'other' },
      { elementId: 's6', category: 'address' },
      { elementId: 's7', category: 'address' },
      { elementId: 's8', category: 'password' },
      { elementId: 's9', category: 'password' },
      { elementId: 's10', category: 'id_number' },
    ],
    // s11 "Display name" is EMPTY and public by nature — not labelled. The
    // detector flags it anyway, on the word "name". That over-flag is real and
    // the benchmark should report it rather than have it defined away.
    // s12 referral, s13 terms, s14 marketing: not personal data.
  },
  {
    id: '04-clean',
    source: 'fixture',
    about: 'The control. The correct answer is nothing at all.',
    input: SCREEN_4_CLEAN,
    elements: boxes(SCREEN_4_CLEAN),
    // Deliberately empty. Every number on this page is a date, a version, a
    // price or a section range, and each one has broken a pattern before.
    sensitive: [],
  },
  {
    id: '05-adversarial',
    source: 'fixture',
    about: 'Built to be partly failed. Labels follow the page, not our reach.',
    input: SCREEN_5_ADVERSARIAL,
    elements: boxes(SCREEN_5_ADVERSARIAL),
    sensitive: [
      { elementId: 'c1', category: 'password' },
      // A real password with nothing whatever identifying it. Nothing in the
      // markup can find this; it is labelled because it is a password.
      { elementId: 'c2', category: 'password' },
      { elementId: 't3', category: 'email' },
      // A name in prose. Missed until 2026-09-23 and caught since, by a
      // gazetteer of common given names — a list, not a model, so it still
      // misses any name the list does not carry — see
      // SECURITY_PRIVACY.md Section 5.
      { elementId: 't4', category: 'name' },
      { elementId: 't5', category: 'id_number' },
      // An identifier inside an image, below the candidate size floor. The DOM
      // path cannot reach it and OCR will not look at it. Labelled anyway.
      { elementId: 't6', category: 'id_number' },
      // Declared a nickname, holds an email. The disagreement case.
      { elementId: 'c7', category: 'email' },
    ],
    // t8 is the false-positive control: invoice numbers, section ranges and a
    // build number that all look like identifiers and are not.
  },
];

/**
 * Pages captured from the live web, dropped into `benchmark/captured/`.
 *
 * A file is the dev export (see `lib/benchmark/export-map.ts`) with two things
 * added by hand: `about`, and the `sensitive` labels. Loaded from disk rather
 * than compiled in so that adding a page is a capture and an edit, with no code
 * change — the friction here is the reason the corpus stayed at four pages.
 *
 * An unlabelled file is SKIPPED and named, never loaded. A captured page with
 * no `sensitive` array would be scored as a page with nothing sensitive on it,
 * which would quietly raise precision on every real page somebody forgot to
 * finish labelling. Silence is the failure mode this whole file exists to
 * avoid.
 */
const CAPTURED_DIR = join(dirname(fileURLToPath(import.meta.url)), 'captured');

export interface CaptureProblem {
  file: string;
  why: string;
}

export const captureProblems: CaptureProblem[] = [];

function loadCaptured(): CorpusEntry[] {
  let files: string[];
  try {
    files = readdirSync(CAPTURED_DIR).filter((name) => name.endsWith('.json'));
  } catch {
    // No directory yet is not a problem; it is the state before anyone has
    // captured anything.
    return [];
  }

  const loaded: CorpusEntry[] = [];

  for (const file of files.sort()) {
    let parsed: {
      about?: string;
      elements?: DomElement[];
      sensitive?: GroundTruth[];
    };

    try {
      parsed = JSON.parse(readFileSync(join(CAPTURED_DIR, file), 'utf8'));
    } catch (error) {
      captureProblems.push({ file, why: `could not be parsed (${String(error)})` });
      continue;
    }

    if (!Array.isArray(parsed.elements) || parsed.elements.length === 0) {
      captureProblems.push({ file, why: 'has no elements' });
      continue;
    }

    if (!Array.isArray(parsed.sensitive)) {
      captureProblems.push({
        file,
        why: 'has no "sensitive" array - label it from the page, then it will be scored',
      });
      continue;
    }

    const known = new Set(parsed.elements.map((element) => element.elementId));
    const unknown = parsed.sensitive.filter((entry) => !known.has(entry.elementId));
    if (unknown.length > 0) {
      captureProblems.push({
        file,
        why: `labels ${unknown.map((entry) => entry.elementId).join(', ')}, not on the page`,
      });
      continue;
    }

    loaded.push({
      id: file.replace(/\.json$/, ''),
      source: 'real',
      about: parsed.about ?? 'Captured page, no description given.',
      input: parsed.elements,
      elements: boxes(parsed.elements),
      sensitive: parsed.sensitive,
    });
  }

  return loaded;
}

/**
 * Pixel ground truth is attached here rather than written into each page, so a
 * page file stays a description of a page and the boxes stay next to the
 * screens they were measured on.
 */
function withPixels(entry: CorpusEntry): CorpusEntry {
  const pixels = PIXEL_TRUTH[entry.id];
  return pixels ? { ...entry, pixels } : entry;
}

export const CORPUS: CorpusEntry[] = [
  ...FIXTURES,
  ...GOVERNMENT,
  ...BANKING,
  ...TELECOM,
  ...SERVICES,
  ...CONTROLS,
  ...DOCUMENTS,
  ...loadCaptured(),
].map(withPixels);
