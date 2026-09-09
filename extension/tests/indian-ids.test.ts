/**
 * Indian identifier detection — TASKS.md Day 1.
 *
 * The central test in this file is not any individual format. It is
 * `an Aadhaar that fails its checksum is still found` — the property that a
 * checksum sharpens a label and never licenses a leak. Get that backwards and
 * the module becomes a way for sensitive numbers to escape while looking
 * thoroughly validated.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  findIndianIds,
  luhnValid,
  strongestIndianId,
  verhoeffValid,
} from '../src/lib/pii/indian-ids';

// --- Checksums ---------------------------------------------------------------

test('Verhoeff accepts a known-good Aadhaar check digit', () => {
  // Verified against the published UIDAI examples.
  assert.equal(verhoeffValid('234567890124'), true);
});

test('Verhoeff rejects a single wrong digit', () => {
  assert.equal(verhoeffValid('234567890125'), false);
});

test('Verhoeff catches a transposition, which is why it is not Luhn', () => {
  // Swapping adjacent digits is the most common human error and the reason
  // UIDAI chose Verhoeff. Luhn misses many of these.
  assert.equal(verhoeffValid('234567890124'), true);
  assert.equal(verhoeffValid('234567809124'), false);
});

test('Verhoeff refuses anything that is not digits', () => {
  assert.equal(verhoeffValid('2345 6789 0124'), false);
  // Empty is false, not "vacuously valid". A checksum over nothing confirms
  // nothing, and returning true would let an empty capture look verified.
  assert.equal(verhoeffValid(''), false);
});

test('Luhn accepts a valid card number and rejects a corrupted one', () => {
  assert.equal(luhnValid('4539578763621486'), true);
  assert.equal(luhnValid('4539578763621487'), false);
});

// --- The invariant -----------------------------------------------------------

test('an Aadhaar that fails its checksum is STILL found', () => {
  // The most important test here. A twelve-digit number on someone's screen is
  // sensitive whether or not our checksum agrees with it — it may be a test
  // value, a typo, a mis-scan, or a real number this code is wrong about. The
  // checksum decides the label, never whether it is hidden.
  const hits = findIndianIds('Aadhaar: 2345 6789 0125');

  assert.equal(hits.length, 1);
  assert.equal(hits[0]?.kind, 'aadhaar');
  assert.equal(hits[0]?.verified, false);
});

test('a valid Aadhaar is found and marked verified', () => {
  const hits = findIndianIds('Aadhaar 2345 6789 0124 issued 2019');

  assert.equal(hits[0]?.kind, 'aadhaar');
  assert.equal(hits[0]?.verified, true);
});

// --- Formats -----------------------------------------------------------------

test('a PAN is recognised, and its holder-type character is checked', () => {
  const valid = findIndianIds('PAN: ABCPE1234F');
  assert.equal(valid[0]?.kind, 'pan');
  assert.equal(valid[0]?.verified, true);

  // 'X' is not a real holder type, so the shape matches but nothing confirms it.
  const shapeOnly = findIndianIds('Code ABCXE1234F');
  assert.equal(shapeOnly[0]?.kind, 'pan');
  assert.equal(shapeOnly[0]?.verified, false);
});

test('an IFSC is found — seven digits, so the generic digit rule never saw it', () => {
  // The class of identifier this module exists for. Under the old rules an IFSC
  // travelled intact, because nothing about it is nine consecutive digits.
  const hits = findIndianIds('Transfer to SBIN0001234');
  assert.equal(hits[0]?.kind, 'ifsc');
});

test('a UPI ID is found, and an email address is left to the email rule', () => {
  const upi = findIndianIds('Pay shiv@okhdfcbank');
  assert.equal(upi[0]?.kind, 'upi');

  // A dot in the domain makes it an email, which is a different rule's job.
  // Claiming it here would double-report one string under two categories.
  const email = findIndianIds('Write to shiv@hdfcbank.com');
  assert.equal(email.some((hit) => hit.kind === 'upi'), false);
});

test('voter ID and passport are recognised', () => {
  assert.equal(findIndianIds('EPIC ABC1234567')[0]?.kind, 'voter_id');
  assert.equal(findIndianIds('Passport J8369854')[0]?.kind, 'passport');
});

test('a payment card is recognised and Luhn-confirmed, not mistaken for an Aadhaar', () => {
  // Regression: the Aadhaar pattern used to match the first twelve digits of a
  // sixteen-digit card and claim the span, so the card was labelled an Aadhaar
  // and never Luhn-checked.
  const hits = findIndianIds('Card 4539 5787 6362 1486');
  assert.equal(hits[0]?.kind, 'card');
  assert.equal(hits[0]?.verified, true);
});

// --- Precision ---------------------------------------------------------------

test('ordinary prose produces nothing', () => {
  assert.deepEqual(findIndianIds('The launch window opens in March 2026.'), []);
  assert.deepEqual(findIndianIds('Order 4821 shipped on 12-03-2026.'), []);
});

test('an Aadhaar cannot start with 0 or 1, per UIDAI', () => {
  // Removes a large slice of ordinary twelve-digit numbers — timestamps, order
  // references — before the checksum is consulted at all.
  assert.equal(findIndianIds('Ref 1234 5678 9012').some((h) => h.kind === 'aadhaar'), false);
});

test('a GSTIN claims its span, and its embedded PAN is not reported twice', () => {
  // A GSTIN contains a PAN. Two manifest entries on one span would overstate
  // what was found, and the manifest is a claim about the page.
  const hits = findIndianIds('GSTIN 27ABCPE1234F1Z5');

  assert.equal(hits.length, 1);
  assert.equal(hits[0]?.kind, 'gstin');
});

// --- Ranking -----------------------------------------------------------------

test('the most sensitive identifier wins when a string carries several', () => {
  const strongest = strongestIndianId('IFSC SBIN0001234 card 4539 5787 6362 1486');
  assert.equal(strongest?.kind, 'card');
});

test('nothing in the text means nothing reported', () => {
  assert.equal(strongestIndianId('Nothing sensitive here at all.'), null);
});

// --- The scrubber path -------------------------------------------------------
//
// The classifier and the scrubber are two separate paths over the same text.
// The classifier flags an element and its value is tokenised; the scrubber
// handles free text, including labels. An identifier one path knows and the
// other does not is hidden in the value and transmitted in the label — which is
// precisely the defect found on a real site, where an account address rode out
// inside a label no field rule could see.

test('an Aadhaar inside a label is scrubbed, not just detected', async () => {
  const { scrubTextContent } = await import('../src/lib/redaction/placeholders');
  assert.equal(scrubTextContent('Aadhaar 2345 6789 0124 on file'), 'Aadhaar [ID_NUMBER] on file');
});

test('an IFSC in a label is scrubbed — the generic rules never saw it', async () => {
  const { scrubTextContent } = await import('../src/lib/redaction/placeholders');
  assert.equal(scrubTextContent('Branch SBIN0001234'), 'Branch [ID_NUMBER]');
});

test('the words around an identifier survive, because the model needs them', async () => {
  const { scrubTextContent } = await import('../src/lib/redaction/placeholders');
  const out = scrubTextContent('Pay to shiv@okhdfcbank before Friday');
  assert.equal(out.startsWith('Pay to '), true);
  assert.equal(out.endsWith(' before Friday'), true);
  assert.equal(out.includes('okhdfcbank'), false);
});

test('ordinary label text is left exactly as it was', async () => {
  const { scrubTextContent } = await import('../src/lib/redaction/placeholders');
  assert.equal(scrubTextContent('Remember me on this device'), 'Remember me on this device');
});
