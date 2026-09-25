/**
 * Voice input, on-device only.
 *
 * The browser's ordinary speech recognition streams the microphone to a cloud
 * service. For this product that would be the one indefensible feature: a tool
 * whose whole claim is that nothing private leaves the machine, sending the
 * user's voice somewhere to be transcribed. So recognition runs with
 * `processLocally`, and where the browser cannot do that, voice is unavailable
 * and says so. There is no fallback to the cloud, by design, not by omission.
 *
 * Chrome ships the on-device path as static `available()` and `install()` on
 * SpeechRecognition plus a `processLocally` flag on the instance. Language
 * packs are downloaded once and then work offline.
 */

export type VoiceLanguage = 'en-IN' | 'hi-IN';

/** Sent from the listening window to the panel. */
export const VOICE_RESULT = 'SHIELD_VOICE_RESULT';
export const VOICE_CANCELLED = 'SHIELD_VOICE_CANCELLED';

/**
 * Whether this browser has a recogniser at all. Firefox has none, and there the
 * microphone is not shown. Whether it can run ON THE DEVICE is decided in the
 * listening window, which can say so on screen.
 */
export function hasSpeechRecognition(): boolean {
  return recognitionClass() !== null;
}

/** What the mic control should offer, from what the browser reports. */
export type VoiceReadiness =
  | 'ready' // on-device pack installed
  | 'needs-download' // on-device possible, pack not installed yet
  | 'downloading'
  | 'unsupported'; // no on-device recognition: voice stays off

type Availability = 'available' | 'downloadable' | 'downloading' | 'unavailable';

interface RecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
}

interface RecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  processLocally?: boolean;
  onstart?: (() => void) | null;
  onaudiostart?: (() => void) | null;
  onspeechstart?: (() => void) | null;
  onresult: ((event: { resultIndex: number; results: ArrayLike<RecognitionResultLike> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

interface RecognitionClass {
  new (): RecognitionLike;
  available?: (options: { langs: string[]; processLocally: boolean }) => Promise<Availability>;
  install?: (options: { langs: string[]; processLocally: boolean }) => Promise<boolean>;
}

function recognitionClass(): RecognitionClass | null {
  const scope = globalThis as unknown as {
    SpeechRecognition?: RecognitionClass;
    webkitSpeechRecognition?: RecognitionClass;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

/**
 * Map the browser's answer to what the control offers.
 *
 * Pure, and exported for the test: the rule that matters is that anything
 * short of a real on-device path is `unsupported`, never "fine, use the cloud".
 */
export function readinessFrom(
  hasOnDeviceApi: boolean,
  availability: Availability | null,
): VoiceReadiness {
  if (!hasOnDeviceApi || availability === null) return 'unsupported';
  if (availability === 'available') return 'ready';
  if (availability === 'downloadable') return 'needs-download';
  if (availability === 'downloading') return 'downloading';
  return 'unsupported';
}

// Voice is new and runs inside a side panel, where Chrome is least forthcoming
// about permissions. Every transition is logged so a failure on the demo laptop
// can be read from the panel's console instead of guessed at. No transcript
// text is logged: what someone says is theirs.
function trace(message: string): void {
  console.info(`[shield] voice: ${message}`);
}

export async function voiceReadiness(language: VoiceLanguage): Promise<VoiceReadiness> {
  const Recognition = recognitionClass();
  const onDevice =
    Recognition !== null &&
    typeof Recognition.available === 'function' &&
    'processLocally' in Recognition.prototype;

  if (!onDevice || !Recognition?.available) return readinessFrom(false, null);

  try {
    const availability = await Recognition.available({ langs: [language], processLocally: true });
    trace(`${language} on-device availability is "${availability}"`);
    return readinessFrom(true, availability);
  } catch (error) {
    trace(`availability check failed: ${String(error)}`);
    return 'unsupported';
  }
}

/** Download the language pack. One-off; afterwards recognition works offline. */
export async function installVoice(language: VoiceLanguage): Promise<boolean> {
  const Recognition = recognitionClass();
  if (!Recognition?.install) return false;
  trace(`installing the ${language} pack`);
  try {
    const installed = await Recognition.install({ langs: [language], processLocally: true });
    trace(`install finished: ${installed}`);
    return installed;
  } catch (error) {
    trace(`install failed: ${String(error)}`);
    return false;
  }
}

export interface ListenHandlers {
  onInterim: (text: string) => void;
  onFinal: (text: string) => void;
  /** `not-allowed` means the microphone permission has not been granted. */
  onError: (code: string) => void;
  onEnd: () => void;
}

/** Start one utterance. Returns a function that stops listening. */
export function listen(language: VoiceLanguage, handlers: ListenHandlers): () => void {
  const Recognition = recognitionClass();
  if (!Recognition) {
    handlers.onError('unsupported');
    return () => {};
  }

  const recognition = new Recognition();
  // Set before anything else, and checked: a browser that silently ignored the
  // flag would transcribe in the cloud while this code believed otherwise.
  recognition.processLocally = true;
  if (recognition.processLocally !== true) {
    handlers.onError('unsupported');
    return () => {};
  }

  recognition.lang = language;
  recognition.interimResults = true;
  recognition.continuous = false;
  recognition.maxAlternatives = 1;

  let finalText = '';

  recognition.onresult = (event) => {
    let interim = '';
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      if (!result) continue;
      if (result.isFinal) finalText += result[0].transcript;
      else interim += result[0].transcript;
    }
    handlers.onInterim((finalText + interim).trim());
  };

  recognition.onstart = () => trace('recognition started');
  recognition.onaudiostart = () => trace('microphone audio is flowing');
  recognition.onspeechstart = () => trace('speech detected');

  recognition.onerror = (event) => {
    trace(`error "${event.error}"`);
    handlers.onError(event.error);
  };

  recognition.onend = () => {
    const text = finalText.trim();
    trace(`ended with ${text ? `${text.length} characters` : 'no text'}`);
    if (text) handlers.onFinal(text);
    handlers.onEnd();
  };

  trace(`starting in ${language}`);
  try {
    recognition.start();
  } catch (error) {
    trace(`start threw: ${String(error)}`);
    handlers.onError('start-failed');
    handlers.onEnd();
  }
  return () => recognition.stop();
}
