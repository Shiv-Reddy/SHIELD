/**
 * What was sent on the last run, told in plain words first.
 *
 * The audience is someone who has never heard of a redacted payload — a judge,
 * a manager, a compliance officer — so the page opens with the claim as a
 * number, says what the AI got and what it never got, shows one stretch of the
 * page exactly as the AI read it, and only then the picture and the raw
 * message. Every word of that is read out of the stored record of the last
 * transmission; nothing is written from assumptions about what a run does.
 *
 * A thin reader over `lib/redaction/evidence.ts` and nothing else. It makes no
 * requests and has no way to reach the network.
 */

import { readLastTransmission } from '../lib/redaction/evidence';

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Sent-frame markup is missing ${selector}`);
  return element;
}

interface SentEntry {
  elementType?: string;
  label?: string | null;
  value?: string | null;
}

interface SentPayload {
  task_query?: string;
  redacted_dom_summary?: SentEntry[];
  redaction_manifest?: { category?: string; method?: string }[];
}

const KIND: Record<string, [string, string]> = {
  name: ['name', 'names'],
  id_number: ['ID or account number', 'ID and account numbers'],
  phone: ['phone number', 'phone numbers'],
  email: ['email address', 'email addresses'],
  address: ['address', 'addresses'],
  password: ['password', 'passwords'],
  face: ['face', 'faces'],
  other: ['other private detail', 'other private details, like amounts'],
};

const TOKEN = /^\[[A-Z_]+\]$/;

function describe(category: string, count: number): string {
  const [one, many] = KIND[category] ?? [category, category];
  return count === 1 ? one : many;
}

/**
 * A short run of elements around the first hidden value, as the AI read them.
 *
 * Starts one element before the first token, so the reader sees a readable
 * reference beside the hidden values — "KYC-2043 · [NAME] · [ID_NUMBER]…" —
 * which is the whole idea in one line: the AI can tell rows apart and act on
 * the right one without knowing whose row it is.
 */
function sampleRow(entries: SentEntry[]): string[] {
  const first = entries.findIndex((entry) => TOKEN.test(entry.value ?? ''));
  if (first < 0) return [];
  const from = Math.max(0, first - 1);
  return entries
    .slice(from, from + 10)
    .map((entry) => (entry.value ?? entry.label ?? '').trim())
    .filter((text) => text.length > 0 && text.length <= 60);
}

async function render(): Promise<void> {
  const transmission = await readLastTransmission();

  if (!transmission) {
    required<HTMLElement>('#empty').hidden = false;
    return;
  }

  required<HTMLElement>('#story').hidden = false;

  let payload: SentPayload = {};
  try {
    payload = JSON.parse(transmission.json) as SentPayload;
  } catch {
    // The raw message still shows below; only the summary is lost.
  }

  const manifest = payload.redaction_manifest ?? [];
  const entries = payload.redacted_dom_summary ?? [];
  const hidden = manifest.length;

  required<HTMLElement>('#headline').textContent =
    hidden === 0
      ? 'Nothing on this page needed hiding, so the AI received it as it was.'
      : `${hidden} private ${hidden === 1 ? 'item was' : 'items were'} hidden before anything left this laptop.`;

  const tally = new Map<string, number>();
  for (const entry of manifest) {
    const category = entry.category ?? 'other';
    tally.set(category, (tally.get(category) ?? 0) + 1);
  }
  const kinds = required<HTMLUListElement>('#kinds');
  for (const [category, count] of [...tally.entries()].sort((a, b) => b[1] - a[1])) {
    const item = document.createElement('li');
    const number = document.createElement('strong');
    number.textContent = String(count);
    item.append(number, describe(category, count));
    kinds.append(item);
  }
  const fromPictures = manifest.filter((entry) => entry.method === 'ocr' || entry.method === 'visual').length;
  if (fromPictures > 0) {
    const item = document.createElement('li');
    const number = document.createElement('strong');
    number.textContent = String(fromPictures);
    item.append(number, fromPictures === 1 ? 'found inside a picture' : 'found inside pictures');
    kinds.append(item);
  }

  required<HTMLElement>('#task').textContent = payload.task_query ?? '';
  required<HTMLElement>('#layout').textContent =
    `The page's layout: ${entries.length} buttons, fields and pieces of text, with every private value replaced by a label such as [NAME]`;
  required<HTMLElement>('#never-values').textContent =
    hidden === 0
      ? 'Nothing private was found on this page'
      : `The real values behind those ${hidden} labels`;

  const row = sampleRow(entries);
  if (row.length > 0) {
    const line = required<HTMLParagraphElement>('#row');
    row.forEach((text, index) => {
      if (index > 0) line.append(' · ');
      if (TOKEN.test(text)) {
        const token = document.createElement('span');
        token.className = 'token';
        token.textContent = text;
        line.append(token);
      } else {
        line.append(text);
      }
    });
    required<HTMLElement>('#row-block').hidden = false;
  }

  const when = new Date(transmission.at).toLocaleString();
  const kb = (transmission.frameBytes / 1024).toFixed(0);
  required<HTMLParagraphElement>('#summary').textContent =
    `Sent ${when} to ${transmission.endpoint}, with a ${kb}KB image.`;
  required<HTMLPreElement>('#json').textContent = transmission.json;

  // A missing frame is a missing PICTURE, never a missing record.
  if (!transmission.frame) {
    required<HTMLElement>('#missing').hidden = false;
    return;
  }

  required<HTMLImageElement>('#image').src = transmission.frame;
  required<HTMLElement>('#figure').hidden = false;
}

void render();
