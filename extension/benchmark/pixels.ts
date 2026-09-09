/**
 * Pixel ground truth — what is sensitive on a page that no element describes.
 *
 * WHY ELEMENT LABELS COULD NOT DO THIS
 *
 * A scanned ID card is one `<img>`. Labelling that element "sensitive" is true
 * and says nothing measurable: it cannot tell covering the Aadhaar number apart
 * from painting over the whole card, and metric 3 is exactly the difference
 * between those two. Until now anything reachable only through pixels appeared
 * in the report as a plain miss, which understated what the DOM path does and
 * said nothing whatever about what the visual path does.
 *
 * WHERE THESE BOXES COME FROM, EXACTLY
 *
 * From the source of `test-screens/aadhaar_sample.svg` and `pan_sample.svg` —
 * committed, fictional sample documents drawn as SVG. Every `<text>` in them
 * carries an exact x and baseline y, so the horizontal position and the
 * baseline are read from the file rather than estimated. The extent of the text
 * is computed from the font size and the character count by the model below,
 * and it is an approximation. It is stated as one.
 *
 * `test-screens/face-a.jpg` and `face-b.png` are deliberately not committed, so
 * no face box appears here: the boxes would depend on photographs this
 * repository does not contain, and inventing them would be making up the one
 * number in this file that nobody could check. Faces are labelled and
 * unmeasured, and the report says so in those words.
 *
 * COORDINATE FRAME
 *
 * A document image's own pixels, not the page's. Nothing here has to claim
 * where on a page a card sat, and a box is only ever compared with a detection
 * produced in the same frame.
 */

import type { PixelTruth } from '../src/lib/benchmark/score';
import type { OcrWord } from '../src/lib/pii/ocr-regions';

/**
 * Typographic model, in fractions of the font size.
 *
 * A renderer would give exact extents; nothing here renders. These three
 * constants are what stands in for one, and they are named rather than buried
 * as literals so that a box that looks wrong can be traced to the assumption
 * that made it.
 */
const ASCENT = 0.75;
const ADVANCE = 0.55;
const SPACE = 0.28;

interface Span {
  x: number;
  /** The SVG baseline, copied from the file. */
  baseline: number;
  size: number;
  text: string;
  spacing?: number;
  /** `text-anchor="middle"` in the source. */
  centred?: boolean;
}

function widthOf(text: string, size: number, spacing = 0): number {
  return text.length * (size * ADVANCE + spacing);
}

function boxOf(span: Span) {
  const width = widthOf(span.text, span.size, span.spacing ?? 0);
  return {
    x: span.centred ? span.x - width / 2 : span.x,
    y: span.baseline - span.size * ASCENT,
    width,
    height: span.size,
  };
}

/** One labelled line on a document. */
function line(span: Span, category: PixelTruth['category'], what: string): PixelTruth {
  return { category, position: boxOf(span), what };
}

/**
 * The same line, as the words an OCR engine would report.
 *
 * Perfect recognition, deliberately. This is not a measurement of Tesseract —
 * it cannot be, in Node — it is a measurement of everything downstream of it:
 * whether `ocrRegions` groups words back into lines, judges them with the same
 * rules a form field gets, and puts a box in the right place. That half lives
 * in this repository, it had no measurement at all, and it is where the
 * adjacency bug would live if there were one.
 */
function words(span: Span): OcrWord[] {
  const spacing = span.spacing ?? 0;
  const out: OcrWord[] = [];
  let x = span.centred ? span.x - widthOf(span.text, span.size, spacing) / 2 : span.x;

  for (const word of span.text.split(' ')) {
    const width = widthOf(word, span.size, spacing);
    out.push({
      text: word,
      x,
      y: span.baseline - span.size * ASCENT,
      width,
      height: span.size,
    });
    x += width + span.size * SPACE;
  }

  return out;
}

// --- The Aadhaar sample card, 640 x 380 --------------------------------------
//
// Labelled from the card. A name, a date of birth, an address, the number and
// the VID are what somebody would not want transmitted; the department banner,
// the SAMPLE watermark, the QR placeholder and the disclaimer footer are not.

const AADHAAR_SPANS = {
  name: { x: 164, baseline: 105, size: 18, text: 'Rahul Kumar Sharma' },
  dob: { x: 164, baseline: 128, size: 13, text: 'DOB: 15/08/1998' },
  gender: { x: 164, baseline: 150, size: 13, text: 'Gender: Male' },
  address1: { x: 164, baseline: 203, size: 12, text: '12, Sample Nagar, Near Test Chowk,' },
  address2: { x: 164, baseline: 220, size: 12, text: 'Anytown, Demo State - 000000' },
  number: { x: 24, baseline: 270, size: 26, text: '2345 6789 0124', spacing: 3 },
  vid: { x: 24, baseline: 292, size: 11, text: 'VID: 9012 3456 7890 1234 (sample, not valid)' },
  banner: { x: 24, baseline: 38, size: 14, text: 'SAMPLE / GOVERNMENT OF INDIA (FICTIONAL)' },
  authority: {
    x: 24,
    baseline: 58,
    size: 12,
    text: 'Unique Identification Authority of India - Demo Data Only',
  },
  addressLabel: { x: 164, baseline: 185, size: 12, text: 'Address (fictional):' },
  footer: {
    x: 320,
    baseline: 358,
    size: 13,
    text: 'This is a fictional sample for UI testing - not a real Aadhaar card',
    centred: true,
  },
} satisfies Record<string, Span>;

const AADHAAR_TRUTH: PixelTruth[] = [
  line(AADHAAR_SPANS.name, 'name', 'name printed on the Aadhaar card'),
  line(AADHAAR_SPANS.dob, 'other', 'date of birth on the Aadhaar card'),
  // Demographic data about a named person on an identity document. Not covered
  // by any named category, and not nothing.
  line(AADHAAR_SPANS.gender, 'other', 'gender on the Aadhaar card'),
  line(AADHAAR_SPANS.address1, 'address', 'address line 1 on the Aadhaar card'),
  line(AADHAAR_SPANS.address2, 'address', 'address line 2 on the Aadhaar card'),
  line(AADHAAR_SPANS.number, 'id_number', 'the Aadhaar number itself'),
  // A VID is a rotating stand-in for the Aadhaar number and authenticates the
  // same person. Exactly as sensitive, and printed in eleven-point type.
  line(AADHAAR_SPANS.vid, 'id_number', 'the virtual ID on the Aadhaar card'),
];

const AADHAAR_WORDS: OcrWord[] = Object.values(AADHAAR_SPANS).flatMap(words);

// --- The PAN sample card, 640 x 380 ------------------------------------------

const PAN_SPANS = {
  number: { x: 164, baseline: 118, size: 22, text: 'ABCDE1234F', spacing: 2 },
  name: { x: 164, baseline: 170, size: 15, text: 'RAHUL KUMAR SHARMA' },
  father: { x: 164, baseline: 218, size: 15, text: 'SURESH KUMAR SHARMA' },
  dob: { x: 164, baseline: 266, size: 15, text: '15/08/1998' },
  banner: { x: 24, baseline: 24, size: 13, text: 'SAMPLE / INCOME TAX DEPARTMENT (FICTIONAL)' },
  subtitle: {
    x: 24,
    baseline: 42,
    size: 11,
    text: 'GOVT. OF INDIA - Demo Data Only, Permanent Account Number Card',
  },
  numberLabel: { x: 164, baseline: 95, size: 11, text: 'Permanent Account Number' },
  nameLabel: { x: 164, baseline: 150, size: 11, text: 'Name' },
  fatherLabel: { x: 164, baseline: 198, size: 11, text: "Father's Name" },
  dobLabel: { x: 164, baseline: 246, size: 11, text: 'Date of Birth' },
  signature: { x: 490, baseline: 272, size: 10, text: 'Signature (sample)', centred: true },
  footer: {
    x: 320,
    baseline: 358,
    size: 13,
    text: 'This is a fictional sample for UI testing - not a real PAN card',
    centred: true,
  },
} satisfies Record<string, Span>;

const PAN_TRUTH: PixelTruth[] = [
  line(PAN_SPANS.number, 'id_number', 'the PAN itself'),
  line(PAN_SPANS.name, 'name', 'name printed on the PAN card'),
  // A parent's name is a standard knowledge-based authentication answer at
  // every Indian bank, and it belongs to somebody who is not at the keyboard.
  line(PAN_SPANS.father, 'name', "father's name on the PAN card"),
  line(PAN_SPANS.dob, 'other', 'date of birth on the PAN card'),
];

const PAN_WORDS: OcrWord[] = Object.values(PAN_SPANS).flatMap(words);

// --- The identity card drawn into screen 5 -----------------------------------
//
// An inline SVG, 230 x 46, reading "ID 8842 5510 0937" in fifteen-point
// monospace at x=12 with a baseline at y=29. Monospace advances wider than the
// model above assumes, which is why the size is given explicitly.

const SCREEN_5_CARD: Span = { x: 12, baseline: 29, size: 15, text: 'ID 8842 5510 0937' };

/**
 * Boxes keyed by corpus page.
 *
 * A page with no entry has no pixel content anybody has measured, which is not
 * the same as having none — the synthetic pages describe images they do not
 * contain, and no boxes are invented for them.
 */
export const PIXEL_TRUTH: Record<string, PixelTruth[]> = {
  'doc-01-aadhaar-card': AADHAAR_TRUTH,
  'doc-02-pan-card': PAN_TRUTH,
  '05-adversarial': [
    {
      category: 'id_number',
      position: boxOf(SCREEN_5_CARD),
      what: 'the identifier drawn inside the image on screen 5',
    },
  ],
};

/**
 * Perfect readings, keyed by corpus page.
 *
 * A page here can have its pixel layer scored without a browser. A page with
 * boxes but no reading is labelled and unmeasured, and reported as such rather
 * than as a failure — screen 5's card is below the candidate size floor, so the
 * engine is never handed it at all, and that is a finding about `image-
 * candidates.ts` rather than about recognition.
 */
export const PIXEL_READINGS: Record<string, { words: OcrWord[]; width: number; height: number }> = {
  'doc-01-aadhaar-card': { words: AADHAAR_WORDS, width: 640, height: 380 },
  'doc-02-pan-card': { words: PAN_WORDS, width: 640, height: 380 },
};
