/**
 * useVoiceOutput Hook
 *
 * A React hook that wraps the Web Speech API (speechSynthesis) for text-to-speech output.
 * Provides speak, stop, pause, and resume functions with state tracking and error handling.
 */

import { useState, useCallback, useEffect, useRef } from 'react';

export interface UseVoiceOutputOptions {
  /** Language for speech synthesis (default: 'en-US') */
  language?: string;
  /** Speech rate (0.1 to 10, default: 1) */
  rate?: number;
  /** Speech pitch (0 to 2, default: 1) */
  pitch?: number;
  /** Speech volume (0 to 1, default: 1) */
  volume?: number;
  /** Voice name to use (will fall back to first available voice if not found) */
  voiceName?: string;
  /** Callback when speech starts */
  onStart?: () => void;
  /** Callback when speech ends */
  onEnd?: () => void;
  /** Callback when an error occurs */
  onError?: (error: string) => void;
}

export interface UseVoiceOutputReturn {
  /** Start speaking the given text */
  speak: (text: string) => void;
  /** Stop current speech */
  stop: () => void;
  /** Pause current speech */
  pause: () => void;
  /** Resume paused speech */
  resume: () => void;
  /** Whether speech is currently playing */
  isSpeaking: boolean;
  /** Whether speech is currently paused */
  isPaused: boolean;
  /** Current error message (null if no error) */
  error: string | null;
  /** Available voices */
  voices: SpeechSynthesisVoice[];
}

export function useVoiceOutput(options: UseVoiceOutputOptions = {}): UseVoiceOutputReturn {
  const {
    language = 'en-US',
    rate = 1,
    pitch = 1,
    volume = 1,
    voiceName,
    onStart,
    onEnd,
    onError,
  } = options;

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [isSupported, setIsSupported] = useState(true);

  // Refs to hold current callbacks (avoids stale closures)
  const onStartRef = useRef(onStart);
  const onEndRef = useRef(onEnd);
  const onErrorRef = useRef(onError);

  // Update refs when callbacks change
  useEffect(() => {
    onStartRef.current = onStart;
    onEndRef.current = onEnd;
    onErrorRef.current = onError;
  }, [onStart, onEnd, onError]);

  // Check for browser support and load voices
  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      setIsSupported(false);
      setError('Speech synthesis is not supported in this browser');
      return;
    }

    // Get initial voices
    const loadVoices = () => {
      const availableVoices = window.speechSynthesis.getVoices();
      setVoices(availableVoices);
    };

    loadVoices();

    // Listen for voices changed event (some browsers load voices asynchronously)
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }

    return () => {
      // Cleanup: cancel any ongoing speech when unmounting
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (!isSupported || typeof window === 'undefined' || !window.speechSynthesis) {
        return;
      }

      // Clear any previous error
      setError(null);

      // Cancel any ongoing speech
      window.speechSynthesis.cancel();

      // Create new utterance
      const utterance = new window.SpeechSynthesisUtterance(text);
      utterance.lang = language;
      utterance.rate = rate;
      utterance.pitch = pitch;
      utterance.volume = volume;

      // Set voice if specified
      const availableVoices = window.speechSynthesis.getVoices();
      if (voiceName) {
        const selectedVoice = availableVoices.find((v) => v.name === voiceName);
        if (selectedVoice) {
          utterance.voice = selectedVoice;
        } else if (availableVoices.length > 0) {
          // Fall back to first voice if specified voice not found
          utterance.voice = availableVoices[0];
        }
      }

      // Set up event handlers
      utterance.onstart = () => {
        setIsSpeaking(true);
        setIsPaused(false);
        onStartRef.current?.();
      };

      utterance.onend = () => {
        setIsSpeaking(false);
        setIsPaused(false);
        onEndRef.current?.();
      };

      utterance.onerror = (event) => {
        setIsSpeaking(false);
        setIsPaused(false);
        const errorMessage = event.error;
        setError(errorMessage);
        onErrorRef.current?.(errorMessage);
      };

      utterance.onpause = () => {
        setIsPaused(true);
      };

      utterance.onresume = () => {
        setIsPaused(false);
      };

      // Start speaking
      window.speechSynthesis.speak(utterance);
    },
    [isSupported, language, rate, pitch, volume, voiceName]
  );

  const stop = useCallback(() => {
    if (!isSupported || typeof window === 'undefined' || !window.speechSynthesis) {
      return;
    }

    window.speechSynthesis.cancel();
    setIsSpeaking(false);
    setIsPaused(false);
  }, [isSupported]);

  const pause = useCallback(() => {
    if (!isSupported || typeof window === 'undefined' || !window.speechSynthesis) {
      return;
    }

    window.speechSynthesis.pause();
  }, [isSupported]);

  const resume = useCallback(() => {
    if (!isSupported || typeof window === 'undefined' || !window.speechSynthesis) {
      return;
    }

    window.speechSynthesis.resume();
  }, [isSupported]);

  return {
    speak,
    stop,
    pause,
    resume,
    isSpeaking,
    isPaused,
    error,
    voices,
  };
}
