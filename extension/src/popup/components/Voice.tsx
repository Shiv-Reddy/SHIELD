/**
 * The microphone in the composer, and its language.
 *
 * Speaking a task is the difference between a tool for people comfortable
 * typing English and one for everybody else, which in this country is most
 * people. Hindi is offered beside English for that reason.
 *
 * Pressing it opens a small listening window rather than listening here.
 * Chrome gives a side panel no way to ask for the microphone, and recognition
 * inside the panel failed silently on the demo laptop. The window can ask, can
 * show what it hears, and can put any failure on screen — see voice/voice.html.
 * It sends back the text; a finished utterance runs straight away, because the
 * point of voice is not having to reach for the keyboard to press send.
 */

import { useEffect, useState } from 'react';
import { MicIcon } from './Mark';
import {
  VOICE_CANCELLED,
  VOICE_RESULT,
  hasSpeechRecognition,
  type VoiceLanguage,
} from '../voice';

const LANGUAGE_KEY = 'shield.voiceLanguage';

const LANGUAGE_NAME: Record<VoiceLanguage, string> = {
  'en-IN': 'English',
  'hi-IN': 'Hindi',
};

const LANGUAGE_MARK: Record<VoiceLanguage, string> = {
  'en-IN': 'EN',
  'hi-IN': 'हिं',
};

// A per-viewer convenience, so browser storage and never anything that must
// survive: a blocked or cleared store just means English.
function storedLanguage(): VoiceLanguage {
  try {
    return localStorage.getItem(LANGUAGE_KEY) === 'hi-IN' ? 'hi-IN' : 'en-IN';
  } catch {
    return 'en-IN';
  }
}

function storeLanguage(language: VoiceLanguage): void {
  try {
    localStorage.setItem(LANGUAGE_KEY, language);
  } catch {
    // Remembering the choice is a nicety; failing to is not worth a message.
  }
}

export function Voice({
  disabled,
  onFinished,
  onListeningChange,
}: {
  disabled: boolean;
  /** The whole utterance, once they stop. */
  onFinished: (text: string) => void;
  onListeningChange: (listening: boolean) => void;
}) {
  const [language, setLanguage] = useState<VoiceLanguage>(storedLanguage);
  const [listening, setListening] = useState(false);

  useEffect(() => {
    const hear = (message: { type?: string; text?: string }) => {
      if (message?.type === VOICE_RESULT && typeof message.text === 'string') {
        setListening(false);
        onListeningChange(false);
        onFinished(message.text);
      } else if (message?.type === VOICE_CANCELLED) {
        setListening(false);
        onListeningChange(false);
      }
    };
    chrome.runtime.onMessage.addListener(hear);
    return () => chrome.runtime.onMessage.removeListener(hear);
  }, [onFinished, onListeningChange]);

  // Firefox has no recogniser at all. A control that can only explain why it
  // will not work is clutter, so there is none.
  if (!hasSpeechRecognition()) return null;

  const switchLanguage = () => {
    const next: VoiceLanguage = language === 'en-IN' ? 'hi-IN' : 'en-IN';
    setLanguage(next);
    storeLanguage(next);
  };

  const press = () => {
    setListening(true);
    onListeningChange(true);
    void chrome.windows.create({
      url: chrome.runtime.getURL(`voice/voice.html?lang=${language}`),
      type: 'popup',
      width: 460,
      height: 420,
      focused: true,
    });
  };

  const label = `Speak a task in ${LANGUAGE_NAME[language]}`;

  return (
    <div className="flex shrink-0 items-center">
      <button
        type="button"
        onClick={switchLanguage}
        disabled={disabled || listening}
        aria-label={`Voice language: ${LANGUAGE_NAME[language]}. Switch language`}
        title={`Voice language: ${LANGUAGE_NAME[language]}`}
        className="text-faint hover:text-bright rounded-control px-1.5 py-1 text-[11.5px] font-semibold transition-colors duration-100 disabled:opacity-40"
      >
        {LANGUAGE_MARK[language]}
      </button>
      <button
        type="button"
        onClick={press}
        disabled={disabled}
        aria-label={label}
        aria-pressed={listening}
        title={label}
        className={`flex size-8 items-center justify-center rounded-full transition-colors duration-100 disabled:cursor-not-allowed ${
          listening
            ? 'bg-card-raised text-bright ring-bright/70 animate-pulse ring-2'
            : 'text-dim hover:text-bright hover:bg-card-raised disabled:opacity-40'
        }`}
      >
        <MicIcon className="size-4.5" />
      </button>
    </div>
  );
}
