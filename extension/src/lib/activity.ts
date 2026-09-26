/**
 * The words of the panel's run feed.
 *
 * Built only from counts and from the redacted view the AI was sent, so a
 * line can never carry a value Shield hid — the feed is meant to be read off
 * a projector.
 */

import type { RedactedDomEntry, ShieldAction } from './types';

const HIDDEN_WORD: Record<string, [string, string]> = {
  name: ['name', 'names'],
  id_number: ['ID number', 'ID numbers'],
  phone: ['phone number', 'phone numbers'],
  email: ['email', 'emails'],
  address: ['address', 'addresses'],
  password: ['password', 'passwords'],
  face: ['face', 'faces'],
  other: ['other detail', 'other details'],
};

/** "12 names, 20 ID numbers and 10 phone numbers" — counts only, never values. */
export function describeHidden(counts: readonly { category: string; count: number }[]): string {
  const parts = counts.map(({ category, count }) => {
    const [one, many] = HIDDEN_WORD[category] ?? [category, category];
    return `${count} ${count === 1 ? one : many}`;
  });
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/**
 * The action in words, from the entry the AI was shown.
 *
 * The redacted entry rather than the live element, so a button labelled with a
 * customer's name reads as "[NAME]" here exactly as it did to the model.
 */
export function describeAction(action: ShieldAction, entries: readonly RedactedDomEntry[]): string {
  const entry = entries.find((candidate) => candidate.elementId === action.selector);
  const raw = (entry?.label || entry?.value || 'an item on the page').replace(/\s+/g, ' ').trim();
  const target = raw.length > 60 ? `${raw.slice(0, 57)}…` : raw;
  if (action.type === 'click') return `click “${target}”`;
  if (action.type === 'type') {
    const text = (action.value ?? '').replace(/\s+/g, ' ').trim();
    const shown = text.length > 50 ? `${text.slice(0, 47)}…` : text;
    return shown ? `type “${shown}” into “${target}”` : `type into “${target}”`;
  }
  return 'scroll the page';
}

export function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "click “Send”" becomes "clicked “Send”", for lines about what was done. */
const PAST: Record<string, string> = { click: 'clicked', type: 'typed', scroll: 'scrolled' };

export function pastTense(described: string): string {
  return described.replace(/^(click|type|scroll) /, (_match, verb: string) => `${PAST[verb]} `);
}
