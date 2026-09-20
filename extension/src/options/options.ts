/**
 * Settings.
 *
 * Every control writes on change. There is no Save button, because a settings
 * page with an unsaved-changes state is a settings page that can be closed
 * having done nothing — and the two switches here already behave that way in
 * the popup, so a different rule on this page would be the inconsistency.
 *
 * WHAT THIS DELIBERATELY CANNOT DO
 *
 * There is no control that makes Shield hide less. `redactionLevel`'s range
 * only goes up from `standard`, and the page says so rather than offering a
 * lower option that would then have to be refused. Redaction is not gated on a
 * confidence threshold and adding one to fill this page out would convert a
 * guarantee into a preference (SECURITY_PRIVACY.md Section 4, dom-rules.ts).
 */

import { MSG } from '../lib/messages';
import {
  DEFAULT_ENDPOINT,
  REDACTION_FLOORS,
  readSettings,
  setForceBackend,
  setObserveOnly,
  setRedactionLevel,
  setRequireConsent,
  type RedactionLevel,
} from '../lib/settings';

declare const __SHIELD_BUILD__: string;

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Options markup is missing ${selector}`);
  return element;
}

/**
 * What each level actually costs, from the recorded sweep.
 *
 * Measured rather than described. A settings page whose options differ only in
 * adjective — "balanced", "strict", "paranoid" — is asking somebody to pick a
 * mood, and the numbers here are exactly the evidence that makes the choice a
 * real one. Figures from docs/BENCHMARK.md, quoted with the floor they belong
 * to so the two cannot drift apart silently.
 */
const LEVELS: ReadonlyArray<{
  level: RedactionLevel;
  name: string;
  detail: string;
  measured: string;
}> = [
  {
    level: 'standard',
    name: 'Standard',
    detail:
      'Reads text out of images large enough to be a document — an ID card, a ' +
      'statement, a screenshot. The floor, not the middle.',
    measured: '69.2% redaction precision · 1.00x area covered',
  },
  {
    level: 'thorough',
    name: 'Thorough',
    detail: 'Also reads smaller images: avatars, thumbnails, inline badges.',
    measured: '56.3% redaction precision · 1.23x area covered',
  },
  {
    level: 'maximum',
    name: 'Maximum',
    detail:
      'Reads almost every image on the page. Recall barely moves and a great ' +
      'deal more of the page is covered — worth it only if you would rather ' +
      'lose the page than miss anything.',
    measured: '27.3% redaction precision · 2.54x area covered',
  },
];

const levelBox = required<HTMLDivElement>('#redaction-level');
const endpointBox = required<HTMLInputElement>('#endpoint');
const endpointNote = required<HTMLParagraphElement>('#endpoint-note');
const backendBox = required<HTMLSelectElement>('#force-backend');
const hostBox = required<HTMLSelectElement>('#force-host');
const observeBox = required<HTMLInputElement>('#observe-only');
const consentBox = required<HTMLInputElement>('#require-consent');
const buildLine = required<HTMLParagraphElement>('#build');

/** Rebuild the vision host so a pinned backend or host actually takes hold. */
async function restartInference(): Promise<void> {
  try {
    await chrome.runtime.sendMessage({ type: MSG.RESTART_BACKEND });
  } catch {
    // A sleeping worker is ordinary. The setting is stored either way and the
    // next run reads it, so there is nothing to report and nothing to retry.
  }
}

function drawLevels(current: RedactionLevel): void {
  levelBox.replaceChildren(
    ...LEVELS.map(({ level, name, detail, measured }) => {
      const floor = REDACTION_FLOORS[level];

      const row = document.createElement('label');
      row.className = 'choice';

      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'redaction-level';
      radio.value = level;
      radio.checked = level === current;
      radio.addEventListener('change', () => {
        if (radio.checked) void setRedactionLevel(level);
      });

      const text = document.createElement('span');

      const title = document.createElement('span');
      title.className = 'choice-name';
      title.textContent = name;

      const body = document.createElement('span');
      body.className = 'choice-detail';
      body.textContent = detail;

      const figures = document.createElement('span');
      figures.className = 'choice-measured';
      // The floor is read from the same constant the detector uses, so the
      // number on screen cannot drift from the number in force.
      figures.textContent = `images from ${floor.width}x${floor.height}px · ${measured}`;

      text.append(title, body, figures);
      row.append(radio, text);
      return row;
    }),
  );
}

/**
 * Store the endpoint, or say why it was not stored.
 *
 * Written on every keystroke would store half-typed URLs, and a settings page
 * that silently persists `http://127.0.0.1:87` while somebody is still typing
 * is one that breaks the next run for a reason nobody can see. Committed on
 * blur and on Enter instead, and an unusable value is refused out loud.
 */
function commitEndpoint(): void {
  const value = endpointBox.value.trim();

  if (value.length === 0) {
    endpointBox.value = DEFAULT_ENDPOINT;
    endpointBox.dataset['invalid'] = 'false';
    endpointNote.textContent = 'Back to the default.';
    void chrome.storage.local.remove('endpoint');
    return;
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    endpointBox.dataset['invalid'] = 'true';
    endpointNote.textContent = 'That is not a URL, so it was not saved.';
    return;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    endpointBox.dataset['invalid'] = 'true';
    endpointNote.textContent = 'Only http and https addresses can be used.';
    return;
  }

  endpointBox.dataset['invalid'] = 'false';
  // Said plainly rather than left implicit: a non-local address means the
  // redacted context crosses the network, and that is a thing somebody should
  // be told at the moment they choose it rather than in a document.
  endpointNote.textContent =
    parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost'
      ? 'Saved. This is a local address — nothing leaves this machine.'
      : 'Saved. Redacted context will be sent over the network to this address.';

  void chrome.storage.local.set({ endpoint: value });
}

async function load(): Promise<void> {
  const settings = await readSettings();

  drawLevels(settings.redactionLevel);
  endpointBox.value = settings.endpoint;
  backendBox.value = settings.forceBackend ?? '';
  hostBox.value = settings.forceInferenceHost ?? '';
  observeBox.checked = settings.observeOnly;
  consentBox.checked = settings.requireConsent;
  buildLine.textContent = `build ${__SHIELD_BUILD__}`;
}

endpointBox.addEventListener('blur', commitEndpoint);
endpointBox.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') commitEndpoint();
});

backendBox.addEventListener('change', () => {
  const value = backendBox.value;
  void (async () => {
    await setForceBackend(value === 'webgpu' || value === 'wasm' ? value : null);
    await restartInference();
  })();
});

hostBox.addEventListener('change', () => {
  const value = hostBox.value;
  void (async () => {
    if (value === 'document' || value === 'worker') {
      await chrome.storage.local.set({ forceInferenceHost: value });
    } else {
      await chrome.storage.local.remove('forceInferenceHost');
    }
    await restartInference();
  })();
});

observeBox.addEventListener('change', () => {
  void setObserveOnly(observeBox.checked);
});

consentBox.addEventListener('change', () => {
  void setRequireConsent(consentBox.checked);
});

void load();
