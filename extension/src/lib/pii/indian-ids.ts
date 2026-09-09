/**
 * Indian identifier detection — Aadhaar, PAN, and the rest of the set a real
 * Indian page actually carries.
 *
 * WHY A SEPARATE MODULE
 *
 * The generic content rules already redact a nine-or-more digit run, so an
 * Aadhaar number was never travelling in the clear. What they could not do is
 * say *what it was*, and two things depend on that: the placeholder the
 * reasoning model receives, and the line the user reads in the trust overlay.
 * "We hid a long number" and "we hid an Aadhaar number" are different claims.
 *
 * They also missed a whole class outright. IFSC codes, UPI addresses, voter IDs
 * and passport numbers all carry fewer than nine digits, so the digit-run rule
 * never saw them.
 *
 * THE RULE THAT MATTERS MOST HERE
 *
 * A checksum may only ever RAISE confidence or SHARPEN a label. It must never
 * be a reason to let something through.
 *
 * This is easy to get backwards. The obvious reading of "validate the Aadhaar"
 * is to reject the ones that fail — but a twelve-digit number that fails
 * Verhoeff is still a twelve-digit number on someone's screen, and it is
 * exactly as sensitive as a valid one. It may be a test value, a typo, a
 * mis-scan, or a real number this code is wrong about. Every one of those still
 * gets hidden, under the generic rule, and the checksum only decides whether we
 * name it. SECURITY_PRIVACY.md Section 4: uncertain means hide.
 */

/** An identifier kind this module can name specifically. */
export type IndianIdKind =
  | 'aadhaar'
  | 'pan'
  | 'passport'
  | 'driving_licence'
  | 'voter_id'
  | 'gstin'
  | 'ifsc'
  | 'upi'
  | 'bank_account'
  | 'card';

export interface IndianIdMatch {
  kind: IndianIdKind;
  /** What matched, so the caller can replace exactly that span. */
  value: string;
  /**
   * True when a checksum or structural rule confirmed it, not merely its shape.
   *
   * Never gates redaction. Only the label and the confidence.
   */
  verified: boolean;
}

// --- Checksums ---------------------------------------------------------------

/**
 * Verhoeff checksum — what Aadhaar actually uses.
 *
 * Not Luhn, and the difference is not academic: Verhoeff is built on the
 * dihedral group D5 and catches transpositions that Luhn misses, which is why
 * UIDAI chose it. Implemented from the published tables rather than pulled in
 * as a dependency: it is thirty lines, and this project adds no dependency it
 * can write and test in an afternoon.
 */
const D5_MULTIPLY: readonly (readonly number[])[] = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];

const D5_PERMUTE: readonly (readonly number[])[] = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

export function verhoeffValid(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false;

  let checksum = 0;
  const reversed = digits.split('').reverse();

  for (let i = 0; i < reversed.length; i += 1) {
    const digit = Number(reversed[i]);
    const permuted = D5_PERMUTE[i % 8]?.[digit];
    if (permuted === undefined) return false;
    checksum = D5_MULTIPLY[checksum]?.[permuted] ?? 0;
  }

  return checksum === 0;
}

/** Luhn — payment cards, and the one checksum most people have heard of. */
export function luhnValid(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false;

  let sum = 0;
  let double = false;

  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let digit = Number(digits[i]);
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }

  return sum % 10 === 0;
}

// --- Patterns ----------------------------------------------------------------

/**
 * Aadhaar: twelve digits, optionally grouped in fours, never starting 0 or 1.
 *
 * The leading-digit rule is UIDAI's and is worth encoding — it removes a large
 * slice of ordinary twelve-digit numbers (timestamps, order references) before
 * the checksum is even consulted.
 *
 * The trailing lookahead is not decoration, and it is belt-and-braces with the
 * ordering below. Without either, this pattern matches the FIRST TWELVE digits
 * of a sixteen-digit card number and claims the span, so the card is reported
 * as an Aadhaar and never Luhn-checked. That is how it behaved until a test
 * caught it — which is the only way a bug of this shape is ever caught.
 */
const AADHAAR = /\b[2-9]\d{3}[\s-]?\d{4}[\s-]?\d{4}\b(?![\s-]?\d)/g;

/**
 * PAN: five letters, four digits, one letter.
 *
 * The fourth character is the holder type (P individual, C company, H HUF, F
 * firm, and so on) and the fifth is the first letter of the surname. Checking
 * the fourth against the real set is what separates a PAN from any other
 * five-four-one string, and it costs one character class.
 */
const PAN = /\b[A-Z]{5}\d{4}[A-Z]\b/g;
const PAN_HOLDER_TYPES = 'ABCFGHJLPT';

/** Passport: one letter, seven digits. Optionally spaced after the letter. */
const PASSPORT = /\b[A-PR-WY][\s-]?\d{7}\b/g;

/** Driving licence: state code, RTO, year, serial. Formats vary by state. */
const DRIVING_LICENCE = /\b[A-Z]{2}[\s-]?\d{2}[\s-]?(19|20)\d{2}[\s-]?\d{7}\b/g;

/** Voter ID (EPIC): three letters, seven digits. */
const VOTER_ID = /\b[A-Z]{3}\d{7}\b/g;

/** GSTIN: state code, PAN, entity number, Z, checksum character. */
const GSTIN = /\b\d{2}[A-Z]{5}\d{4}[A-Z]\d[A-Z][\dA-Z]\b/g;

/** IFSC: four-letter bank code, a mandatory 0, six-character branch code. */
const IFSC = /\b[A-Z]{4}0[A-Z\d]{6}\b/g;

/**
 * UPI virtual payment address: handle@psp.
 *
 * Deliberately excludes anything with a dot in the domain part, because that is
 * an email address and the email rule owns it. `name@okhdfcbank` is a UPI ID;
 * `name@hdfcbank.com` is an email. Overlapping the two would double-report the
 * same string under two categories.
 */
const UPI = /\b[\w.-]{3,}@[a-z]{3,}\b(?!\.)/gi;

/** Payment card: 13-19 digits, optionally in groups of four. */
const CARD = /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{1,7}\b/g;

/**
 * Bank account: 9-18 unbroken digits.
 *
 * The loosest pattern here and the last one tried, because Indian account
 * numbers have no national format — each bank picks its own length. It exists
 * so an account number is *named* rather than falling through to the generic
 * digit-run rule; it is never the reason something is redacted.
 */
const BANK_ACCOUNT = /\b\d{9,18}\b/g;

// --- Detection ---------------------------------------------------------------

/**
 * Order matters and is not alphabetical.
 *
 * Most specific first. A GSTIN contains a PAN; a card number and an Aadhaar are
 * both digit runs; an IFSC and a voter ID are both letters-then-alphanumerics.
 * Whichever pattern is tried first claims the span, so the loosest — bank
 * account — is deliberately last, and the tightest are at the top.
 */
const PATTERNS: ReadonlyArray<readonly [IndianIdKind, RegExp]> = [
  ['gstin', GSTIN],
  ['ifsc', IFSC],
  // Card before Aadhaar, because a card is longer and therefore the more
  // specific claim on a run of digits. A card needs at least thirteen digits,
  // so it can never swallow a bare twelve-digit Aadhaar.
  ['card', CARD],
  ['aadhaar', AADHAAR],
  ['pan', PAN],
  ['driving_licence', DRIVING_LICENCE],
  ['voter_id', VOTER_ID],
  ['passport', PASSPORT],
  ['upi', UPI],
  ['bank_account', BANK_ACCOUNT],
];

/** Whether a candidate is confirmed by more than its shape. */
function verify(kind: IndianIdKind, value: string): boolean {
  const digits = value.replace(/\D/g, '');

  switch (kind) {
    case 'aadhaar':
      return digits.length === 12 && verhoeffValid(digits);
    case 'card':
      return digits.length >= 13 && luhnValid(digits);
    case 'pan':
      return PAN_HOLDER_TYPES.includes(value.toUpperCase()[3] ?? '');
    case 'gstin':
      return PAN_HOLDER_TYPES.includes(value.toUpperCase()[7] ?? '');
    // The rest have no published checksum. Shape is all there is, and shape is
    // enough to redact — it is not enough to claim certainty.
    default:
      return false;
  }
}

/**
 * Every Indian identifier in a string, most specific first, without overlaps.
 *
 * Overlaps are dropped rather than reported twice: a GSTIN contains a PAN, and
 * reporting both would put two manifest entries on one span, overstating what
 * was found. The manifest is a claim about the page and has to be exact.
 */
export function findIndianIds(text: string): IndianIdMatch[] {
  const found: IndianIdMatch[] = [];
  const claimed: { start: number; end: number }[] = [];

  for (const [kind, pattern] of PATTERNS) {
    // Fresh lastIndex per call: these are module-level globals and a leftover
    // index silently skips the front of the next string.
    const scanner = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;

    while ((match = scanner.exec(text)) !== null) {
      const start = match.index;
      const end = start + match[0].length;

      const overlaps = claimed.some((span) => start < span.end && end > span.start);
      if (overlaps) continue;

      claimed.push({ start, end });
      found.push({ kind, value: match[0], verified: verify(kind, match[0]) });
    }
  }

  return found;
}

/**
 * The most sensitive identifier in a string, or null.
 *
 * Ranked so a string carrying both a card number and an IFSC is reported as the
 * card. A verified match outranks an unverified one of the same kind, for the
 * same reason the severity ranking exists at all: when two readings compete,
 * take the one that says more.
 */
const KIND_SEVERITY: Readonly<Record<IndianIdKind, number>> = {
  ifsc: 1,
  upi: 2,
  bank_account: 3,
  voter_id: 4,
  driving_licence: 5,
  passport: 6,
  gstin: 7,
  pan: 8,
  aadhaar: 9,
  card: 10,
};

export function strongestIndianId(text: string): IndianIdMatch | null {
  const matches = findIndianIds(text);
  if (matches.length === 0) return null;

  return matches.reduce((best, candidate) => {
    const bestScore = KIND_SEVERITY[best.kind] * 2 + (best.verified ? 1 : 0);
    const score = KIND_SEVERITY[candidate.kind] * 2 + (candidate.verified ? 1 : 0);
    return score > bestScore ? candidate : best;
  });
}

/** Human wording for the trust overlay. Never quotes the value. */
export const KIND_LABEL: Readonly<Record<IndianIdKind, string>> = {
  aadhaar: 'Aadhaar number',
  pan: 'PAN',
  passport: 'passport number',
  driving_licence: 'driving licence number',
  voter_id: 'voter ID',
  gstin: 'GSTIN',
  ifsc: 'IFSC code',
  upi: 'UPI ID',
  bank_account: 'bank account number',
  card: 'payment card number',
};
