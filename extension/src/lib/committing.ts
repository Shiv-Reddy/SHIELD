/**
 * Which clicks are final.
 *
 * Found on the KYC console on the first real run, 2026-09-25: the agent
 * approved the right application, and then — seeing a fresh screen and knowing
 * nothing of what it had just done, because the server is stateless — found
 * another row that looked approvable and approved that too, and kept going
 * until the step cap stopped it. Every step was a reasonable reading of the
 * screen in front of it. The run as a whole approved customers nobody asked it
 * to.
 *
 * So a click that commits something — approve, pay, submit, sign in — ends the
 * run. Shield does one, reports it, and hands control back; a second commitment
 * needs a second request from the person. It costs nothing on the tasks this
 * product is for, and it removes the round trip that used to follow every
 * submission only to be told there was nothing left to do.
 *
 * Deliberately a word list, and deliberately broad. A false positive stops a
 * run one step early, which the person sees and can continue. A false negative
 * is a second payment.
 */

import type { DomElement, ShieldAction } from './types';

const FINAL_WORDS =
  /\b(approve|approved|reject|decline|submit|confirm|pay|payment|transfer|send|sign in|log in|login|sign up|signup|register|create (?:an |my |your )?account|place order|order now|buy|purchase|book|delete|remove|save|apply|accept offer|checkout|check out|release|disburse|sanction|shortlist|admit|hold|refund|resolve|close ticket|escalate|cancel)\b/i;

export function isFinalClick(action: ShieldAction, element: DomElement | undefined): boolean {
  if (action.type !== 'click' || !element || element.elementType !== 'button') return false;
  // Both, because a submit input carries its words in `value` and a button with
  // an accessible name carries them in `label`. These are the page's own
  // control names, read on the device and never sent.
  const words = `${element.label ?? ''} ${element.value ?? ''}`;
  return FINAL_WORDS.test(words);
}
