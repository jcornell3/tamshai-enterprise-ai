/**
 * useVoiceInput Hook
 *
 * A React hook that wraps the Web Speech API (SpeechRecognition or webkitSpeechRecognition)
 * for voice input functionality.
 *
 * Features:
 * - Browser support detection
 * - Recognition lifecycle management (start, stop, events)
 * - Transcript updates from recognition results
 * - Error handling
 * - Configuration options (language, continuous, interimResults)
 * - Cleanup on unmount
 * - Callback support (onResult, onError, onEnd)
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';

// Extend Window interface for Speech Recognition API
declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition;
    webkitSpeechRecognition: typeof SpeechRecognition;
  }
}

/**
 * Configuration options for the useVoiceInput hook
 */
export interface UseVoiceInputOptions {
  /** Language for speech recognition (default: 'en-US') */
  language?: string;
  /** Whether to continuously recognize speech (default: false) */
  continuous?: boolean;
  /** Whether to return interim results (default: false) */
  interimResults?: boolean;
  /** Callback when speech is recognized */
  onResult?: (transcript: string) => void;
  /** Callback when an error occurs */
  onError?: (error: string) => void;
  /** Callback when recognition ends */
  onEnd?: () => void;
}

/**
 * Return type for the useVoiceInput hook
 */
export interface UseVoiceInputReturn {
  /** Whether speech recognition is currently active */
  isListening: boolean;
  /** The recognized speech text */
  transcript: string;
  /** Error message if recognition fails or is not supported */
  error: string | null;
  /** Function to start speech recognition */
  startListening: () => void;
  /** Function to stop speech recognition */
  stopListening: () => void;
}

/**
 * Get the SpeechRecognition constructor from the browser
 * Prefers standard SpeechRecognition over webkit prefix
 */
function getSpeechRecognition(): (new () => SpeechRecognition) | null {
  if (typeof window === 'undefined') {
    return null;
  }

  // Prefer standard SpeechRecognition over webkit prefix
  if ('SpeechRecognition' in window) {
    return window.SpeechRecognition;
  }

  if ('webkitSpeechRecognition' in window) {
    return window.webkitSpeechRecognition;
  }

  return null;
}

/**
 * React hook for voice input using the Web Speech API
 *
 * @param options - Configuration options for speech recognition
 * @returns Object containing state and control functions
 *
 * @example
 * ```tsx
 * function VoiceInput() {
 *   const { isListening, transcript, error, startListening, stopListening } = useVoiceInput({
 *     language: 'en-US',
 *     onResult: (text) => console.log('Recognized:', text),
 *   });
 *
 *   return (
 *     <div>
 *       <button onClick={isListening ? stopListening : startListening}>
 *         {isListening ? 'Stop' : 'Start'} Listening
 *       </button>
 *       {transcript && <p>Transcript: {transcript}</p>}
 *       {error && <p>Error: {error}</p>}
 *     </div>
 *   );
 * }
 * ```
 */
export function useVoiceInput(options: UseVoiceInputOptions = {}): UseVoiceInputReturn {
  const {
    language = 'en-US',
    continuous = false,
    interimResults = false,
    onResult,
    onError,
    onEnd,
  } = options;

  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(() => {
    // Check for browser support on initial render
    const SpeechRecognitionClass = getSpeechRecognition();
    if (!SpeechRecognitionClass) {
      return 'Speech recognition is not supported in this browser';
    }
    return null;
  });

  // Track if recognition is active (separate from isListening state for immediate checks)
  const isActiveRef = useRef(false);

  // Store callbacks in refs to avoid recreating recognition on callback changes
  const onResultRef = useRef(onResult);
  const onErrorRef = useRef(onError);
  const onEndRef = useRef(onEnd);

  // Update callback refs when callbacks change
  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    onEndRef.current = onEnd;
  }, [onEnd]);

  // Create recognition instance synchronously using useMemo
  // This ensures the instance is available immediately when the hook renders
  const recognition = useMemo(() => {
    const SpeechRecognitionClass = getSpeechRecognition();
    if (!SpeechRecognitionClass) {
      return null;
    }

    const instance = new SpeechRecognitionClass();
    instance.lang = language;
    instance.continuous = continuous;
    instance.interimResults = interimResults;

    return instance;
  }, [language, continuous, interimResults]);

  // Store recognition in a ref for cleanup access
  const recognitionRef = useRef<SpeechRecognition | null>(recognition);
  recognitionRef.current = recognition;

  // Set up event handlers
  useEffect(() => {
    if (!recognition) {
      return;
    }

    // Handle speech recognition results
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const result = event.results[0];
      if (result && result[0]) {
        const recognizedText = result[0].transcript;
        setTranscript(recognizedText);
        onResultRef.current?.(recognizedText);
      }
    };

    // Handle errors
    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      const errorType = event.error;
      setError(errorType);
      setIsListening(false);
      isActiveRef.current = false;
      onErrorRef.current?.(errorType);
    };

    // Handle recognition start
    recognition.onstart = () => {
      setIsListening(true);
      isActiveRef.current = true;
    };

    // Handle recognition end
    recognition.onend = () => {
      setIsListening(false);
      isActiveRef.current = false;
      onEndRef.current?.();
    };

    // Cleanup on unmount or config change
    return () => {
      if (recognitionRef.current && isActiveRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current.abort();
      }
    };
  }, [recognition]);

  /**
   * Start speech recognition
   * Clears previous transcript and error before starting
   */
  const startListening = useCallback(() => {
    // Don't start if already listening
    if (isActiveRef.current) {
      return;
    }

    // Can't start if no recognition instance (browser not supported)
    if (!recognition) {
      return;
    }

    // Clear previous state
    setTranscript('');
    setError(null);

    try {
      recognition.start();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to start speech recognition';
      setError(errorMessage);
      setIsListening(false);
      isActiveRef.current = false;
    }
  }, [recognition]);

  /**
   * Stop speech recognition
   * Preserves the transcript after stopping
   */
  const stopListening = useCallback(() => {
    // Only stop if currently listening
    if (!isActiveRef.current || !recognition) {
      return;
    }

    recognition.stop();
  }, [recognition]);

  return {
    isListening,
    transcript,
    error,
    startListening,
    stopListening,
  };
}

export default useVoiceInput;
