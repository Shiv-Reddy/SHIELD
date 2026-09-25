/**
 * The listening window. Every step and every failure is shown on screen.
 *
 * The side-panel version failed silently on the demo laptop, so this one
 * assumes nothing: it asks for the microphone itself, checks the on-device
 * recogniser, downloads the language pack if needed, listens, and hands the
 * text to the panel. Each of those can fail, and each failure says in words
 * what happened and what to do.
 */

import {
  VOICE_CANCELLED,
  VOICE_RESULT,
  installVoice,
  listen,
  voiceReadiness,
  type VoiceLanguage,
} from '../popup/voice';

const language: VoiceLanguage =
  new URLSearchParams(location.search).get('lang') === 'hi-IN' ? 'hi-IN' : 'en-IN';
const languageName = language === 'hi-IN' ? 'Hindi' : 'English';

const status = document.getElementById('status') as HTMLParagraphElement;
const heard = document.getElementById('heard') as HTMLParagraphElement;
const again = document.getElementById('again') as HTMLButtonElement;
const done = document.getElementById('done') as HTMLButtonElement;
const cancel = document.getElementById('cancel') as HTMLButtonElement;
const settings = document.getElementById('settings') as HTMLButtonElement;

// Shield's own entry in Chrome's site settings, where a per-extension block
// lives. The general microphone page does not show it.
settings.addEventListener('click', () => {
  void chrome.tabs.create({
    url: `chrome://settings/content/siteDetails?site=${encodeURIComponent(location.origin)}`,
  });
});

let delivered = false;
let stop: (() => void) | null = null;

function show(state: 'starting' | 'listening' | 'error' | 'done', title: string, detail = ''): void {
  document.body.dataset.state = state;
  status.textContent = title;
  heard.textContent = detail;
  again.hidden = state !== 'error';
  settings.hidden = true;
  done.hidden = state !== 'listening';
  console.info(`[shield] voice window: ${state} — ${title}`);
}

function deliver(text: string): void {
  delivered = true;
  show('done', 'Got it', text);
  void chrome.runtime.sendMessage({ type: VOICE_RESULT, text });
  setTimeout(() => window.close(), 700);
}

/** Null when the microphone can be used, otherwise the browser's error name. */
async function microphoneProblem(): Promise<string | null> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // Only asking. The recogniser opens its own stream.
    for (const track of stream.getTracks()) track.stop();
    return null;
  } catch (error) {
    const name = error instanceof DOMException ? error.name : String(error);
    console.info('[shield] voice window: microphone refused', name);
    return name;
  }
}

// Chrome's general microphone switch can be on while this extension has been
// blocked individually, or while Windows itself refuses desktop apps the
// microphone. Each reads the same from here until the error name is shown, so
// it is: the demo laptop hit this with the general switch on.
const MIC_HELP: Record<string, string> = {
  NotAllowedError:
    'Chrome or Windows is blocking it. Press "Shield permissions" and set Microphone to Allow. If it already says Allow, open Windows Settings → Privacy & security → Microphone and turn on "Let desktop apps access your microphone".',
  NotFoundError: 'No microphone was found. Plug one in or check it is enabled in Windows sound settings.',
  NotReadableError:
    'The microphone is busy or blocked by Windows. Close Zoom, Teams or Meet, and check Windows Settings → Privacy & security → Microphone.',
  AbortError: 'The microphone stopped unexpectedly. Press Try again.',
};

async function begin(): Promise<void> {
  show('starting', 'Getting ready…');
  // Chrome's prompt can take a moment to appear, and until it is answered the
  // request simply waits. Saying what is being waited on keeps that from
  // looking like a hang.
  const nudge = setTimeout(
    () => show('starting', 'Allow the microphone when Chrome asks', 'The prompt appears at the top of this window.'),
    1200,
  );
  const problem = await microphoneProblem();
  clearTimeout(nudge);

  if (problem) {
    show('error', `Microphone unavailable (${problem})`, MIC_HELP[problem] ?? 'Press Shield permissions and allow the microphone, then Try again.');
    settings.hidden = false;
    return;
  }

  let readiness = await voiceReadiness(language);
  if (readiness === 'unsupported') {
    show(
      'error',
      'Voice isn’t available here',
      `This Chrome can’t turn ${languageName} speech into text on the device, and Shield won’t send your voice anywhere else.`,
    );
    return;
  }

  if (readiness !== 'ready') {
    show('starting', `Downloading ${languageName} voice…`, 'One time only. After this, voice works offline.');
    const installed = await installVoice(language);
    readiness = installed ? 'ready' : await voiceReadiness(language);
    if (readiness !== 'ready') {
      show(
        'error',
        'Voice pack still downloading',
        `The ${languageName} pack isn’t ready yet. Wait a few seconds, then press Try again.`,
      );
      return;
    }
  }

  show('listening', 'Listening… say your task', '');

  stop = listen(language, {
    onInterim: (text) => {
      heard.textContent = text;
    },
    onFinal: deliver,
    onError: (code) => {
      if (code === 'aborted') return;
      const reasons: Record<string, string> = {
        'no-speech': 'Nothing was heard. Press Try again and speak after the circle starts pulsing.',
        'audio-capture': 'No microphone was found. Check one is connected and not in use by another app.',
        'not-allowed': 'The microphone was refused. Allow it for Shield, then press Try again.',
        'service-not-allowed': 'Chrome refused on-device speech here. Press Try again; if it repeats, type the task instead.',
        'language-not-supported': `${languageName} isn’t installed for on-device speech yet. Press Try again.`,
        network: 'Chrome tried to reach a speech service. Shield only uses on-device speech, so type the task instead.',
      };
      show('error', 'Voice stopped', reasons[code] ?? `Chrome reported "${code}". Press Try again, or type the task.`);
    },
    onEnd: () => {
      stop = null;
      if (!delivered && document.body.dataset.state === 'listening') {
        show('error', 'Nothing was heard', 'Press Try again and speak after the circle starts pulsing.');
      }
    },
  });
}

again.addEventListener('click', () => void begin());
done.addEventListener('click', () => stop?.());
cancel.addEventListener('click', () => {
  stop?.();
  window.close();
});

// The panel is waiting on this window. Closing it any way other than with a
// result tells the panel so, or the task box would say "Listening…" forever.
window.addEventListener('pagehide', () => {
  if (!delivered) void chrome.runtime.sendMessage({ type: VOICE_CANCELLED });
});

void begin();
