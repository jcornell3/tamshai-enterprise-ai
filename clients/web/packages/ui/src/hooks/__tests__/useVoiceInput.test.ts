/**
 * TDD RED Phase Tests for useVoiceInput Hook
 *
 * These tests define the expected behavior of the useVoiceInput hook
 * which wraps the Web Speech API (webkitSpeechRecognition) for voice input.
 *
 * The hook should return:
 * - isListening: boolean - whether speech recognition is active
 * - transcript: string - the recognized speech text
 * - error: string | null - error message if recognition fails or not supported
 * - startListening: () => void - begins speech recognition
 * - stopListening: () => void - stops speech recognition
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useVoiceInput } from '../useVoiceInput';

// Mock SpeechRecognition interface
interface MockSpeechRecognitionEvent {
  results: {
    [index: number]: {
      [index: number]: {
        transcript: string;
      };
    };
    length: number;
  };
}

interface MockSpeechRecognitionErrorEvent {
  error: string;
  message?: string;
}

// Create mock SpeechRecognition class
const createMockSpeechRecognition = () => {
  let onresult: ((event: MockSpeechRecognitionEvent) => void) | null = null;
  let onerror: ((event: MockSpeechRecognitionErrorEvent) => void) | null = null;
  let onend: (() => void) | null = null;
  let onstart: (() => void) | null = null;
  let isStarted = false;

  const mockRecognition = {
    continuous: false,
    interimResults: false,
    lang: 'en-US',
    start: jest.fn(() => {
      isStarted = true;
      if (onstart) onstart();
    }),
    stop: jest.fn(() => {
      isStarted = false;
      if (onend) onend();
    }),
    abort: jest.fn(() => {
      isStarted = false;
      if (onend) onend();
    }),
    set onresult(handler: ((event: MockSpeechRecognitionEvent) => void) | null) {
      onresult = handler;
    },
    get onresult() {
      return onresult;
    },
    set onerror(handler: ((event: MockSpeechRecognitionErrorEvent) => void) | null) {
      onerror = handler;
    },
    get onerror() {
      return onerror;
    },
    set onend(handler: (() => void) | null) {
      onend = handler;
    },
    get onend() {
      return onend;
    },
    set onstart(handler: (() => void) | null) {
      onstart = handler;
    },
    get onstart() {
      return onstart;
    },
    // Helper methods for tests to trigger events
    _simulateResult: (transcript: string) => {
      if (onresult) {
        onresult({
          results: {
            0: { 0: { transcript } },
            length: 1,
          },
        });
      }
    },
    _simulateError: (error: string, message?: string) => {
      if (onerror) {
        onerror({ error, message });
      }
    },
    _simulateEnd: () => {
      isStarted = false;
      if (onend) onend();
    },
    _isStarted: () => isStarted,
  };

  return mockRecognition;
};

describe('useVoiceInput', () => {
  let mockRecognition: ReturnType<typeof createMockSpeechRecognition>;
  let originalWebkitSpeechRecognition: typeof window.webkitSpeechRecognition;
  let originalSpeechRecognition: typeof window.SpeechRecognition | undefined;

  beforeEach(() => {
    // Store originals
    originalWebkitSpeechRecognition = (window as unknown as { webkitSpeechRecognition: unknown }).webkitSpeechRecognition as typeof window.webkitSpeechRecognition;
    originalSpeechRecognition = (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition as typeof window.SpeechRecognition | undefined;

    // Create fresh mock for each test
    mockRecognition = createMockSpeechRecognition();

    // Mock the SpeechRecognition constructor
    (window as unknown as { webkitSpeechRecognition: unknown }).webkitSpeechRecognition = jest.fn(() => mockRecognition);

    // Ensure standard SpeechRecognition is not set (so webkit is used by default)
    delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
  });

  afterEach(() => {
    // Restore originals
    (window as unknown as { webkitSpeechRecognition: unknown }).webkitSpeechRecognition = originalWebkitSpeechRecognition;
    if (originalSpeechRecognition !== undefined) {
      (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = originalSpeechRecognition;
    } else {
      delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
    }
    jest.clearAllMocks();
  });

  describe('Initial State', () => {
    it('returns isListening as false initially', () => {
      const { result } = renderHook(() => useVoiceInput());

      expect(result.current.isListening).toBe(false);
    });

    it('returns empty transcript initially', () => {
      const { result } = renderHook(() => useVoiceInput());

      expect(result.current.transcript).toBe('');
    });

    it('returns null error initially when Speech API is supported', () => {
      const { result } = renderHook(() => useVoiceInput());

      expect(result.current.error).toBeNull();
    });

    it('returns startListening function', () => {
      const { result } = renderHook(() => useVoiceInput());

      expect(typeof result.current.startListening).toBe('function');
    });

    it('returns stopListening function', () => {
      const { result } = renderHook(() => useVoiceInput());

      expect(typeof result.current.stopListening).toBe('function');
    });
  });

  describe('Browser Support Detection', () => {
    it('sets error when Speech API is not supported', () => {
      // Remove Speech API
      delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
      delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;

      const { result } = renderHook(() => useVoiceInput());

      expect(result.current.error).toBe('Speech recognition is not supported in this browser');
    });

    it('works with standard SpeechRecognition API', () => {
      // Remove webkit version, add standard
      delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
      (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = jest.fn(() => mockRecognition);

      const { result } = renderHook(() => useVoiceInput());

      expect(result.current.error).toBeNull();
    });

    it('prefers standard SpeechRecognition over webkit prefix', () => {
      const standardMock = createMockSpeechRecognition();
      (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = jest.fn(() => standardMock);

      const { result } = renderHook(() => useVoiceInput());

      act(() => {
        result.current.startListening();
      });

      // Standard API should be used
      expect((window as unknown as { SpeechRecognition: jest.Mock }).SpeechRecognition).toHaveBeenCalled();
    });
  });

  describe('startListening', () => {
    it('sets isListening to true when called', () => {
      const { result } = renderHook(() => useVoiceInput());

      act(() => {
        result.current.startListening();
      });

      expect(result.current.isListening).toBe(true);
    });

    it('calls recognition.start()', () => {
      const { result } = renderHook(() => useVoiceInput());

      act(() => {
        result.current.startListening();
      });

      expect(mockRecognition.start).toHaveBeenCalled();
    });

    it('clears previous transcript when starting', () => {
      const { result } = renderHook(() => useVoiceInput());

      // First session
      act(() => {
        result.current.startListening();
      });
      act(() => {
        mockRecognition._simulateResult('first transcript');
      });
      act(() => {
        result.current.stopListening();
      });

      // Second session should clear transcript
      act(() => {
        result.current.startListening();
      });

      expect(result.current.transcript).toBe('');
    });

    it('clears previous error when starting', () => {
      const { result } = renderHook(() => useVoiceInput());

      // Trigger an error
      act(() => {
        result.current.startListening();
      });
      act(() => {
        mockRecognition._simulateError('network', 'Network error');
      });

      expect(result.current.error).not.toBeNull();

      // Starting again should clear error
      act(() => {
        result.current.startListening();
      });

      expect(result.current.error).toBeNull();
    });

    it('does nothing if already listening', () => {
      const { result } = renderHook(() => useVoiceInput());

      act(() => {
        result.current.startListening();
      });
      act(() => {
        result.current.startListening();
      });

      // start should only be called once
      expect(mockRecognition.start).toHaveBeenCalledTimes(1);
    });

    it('sets error when start fails', () => {
      mockRecognition.start.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const { result } = renderHook(() => useVoiceInput());

      act(() => {
        result.current.startListening();
      });

      expect(result.current.error).toBe('Permission denied');
      expect(result.current.isListening).toBe(false);
    });
  });

  describe('stopListening', () => {
    it('sets isListening to false when called', () => {
      const { result } = renderHook(() => useVoiceInput());

      act(() => {
        result.current.startListening();
      });
      act(() => {
        result.current.stopListening();
      });

      expect(result.current.isListening).toBe(false);
    });

    it('calls recognition.stop()', () => {
      const { result } = renderHook(() => useVoiceInput());

      act(() => {
        result.current.startListening();
      });
      act(() => {
        result.current.stopListening();
      });

      expect(mockRecognition.stop).toHaveBeenCalled();
    });

    it('does nothing if not listening', () => {
      const { result } = renderHook(() => useVoiceInput());

      act(() => {
        result.current.stopListening();
      });

      expect(mockRecognition.stop).not.toHaveBeenCalled();
    });

    it('preserves transcript after stopping', () => {
      const { result } = renderHook(() => useVoiceInput());

      act(() => {
        result.current.startListening();
      });
      act(() => {
        mockRecognition._simulateResult('hello world');
      });
      act(() => {
        result.current.stopListening();
      });

      expect(result.current.transcript).toBe('hello world');
    });
  });

  describe('Transcript Updates', () => {
    it('updates transcript when speech is recognized', () => {
      const { result } = renderHook(() => useVoiceInput());

      act(() => {
        result.current.startListening();
      });
      act(() => {
        mockRecognition._simulateResult('hello world');
      });

      expect(result.current.transcript).toBe('hello world');
    });

    it('updates transcript with latest result', () => {
      const { result } = renderHook(() => useVoiceInput());

      act(() => {
        result.current.startListening();
      });
      act(() => {
        mockRecognition._simulateResult('hello');
      });
      act(() => {
        mockRecognition._simulateResult('hello world');
      });

      expect(result.current.transcript).toBe('hello world');
    });

    it('handles empty transcript gracefully', () => {
      const { result } = renderHook(() => useVoiceInput());

      act(() => {
        result.current.startListening();
      });
      act(() => {
        mockRecognition._simulateResult('');
      });

      expect(result.current.transcript).toBe('');
    });
  });

  describe('Error Handling', () => {
    it('sets error on recognition error event', () => {
      const { result } = renderHook(() => useVoiceInput());

      act(() => {
        result.current.startListening();
      });
      act(() => {
        mockRecognition._simulateError('network', 'Network connection failed');
      });

      expect(result.current.error).toBe('network');
    });

    it('sets isListening to false on error', () => {
      const { result } = renderHook(() => useVoiceInput());

      act(() => {
        result.current.startListening();
      });
      act(() => {
        mockRecognition._simulateError('not-allowed', 'Microphone permission denied');
      });

      expect(result.current.isListening).toBe(false);
    });

    it('handles no-speech error', () => {
      const { result } = renderHook(() => useVoiceInput());

      act(() => {
        result.current.startListening();
      });
      act(() => {
        mockRecognition._simulateError('no-speech', 'No speech detected');
      });

      expect(result.current.error).toBe('no-speech');
    });

    it('handles aborted error', () => {
      const { result } = renderHook(() => useVoiceInput());

      act(() => {
        result.current.startListening();
      });
      act(() => {
        mockRecognition._simulateError('aborted', 'Speech recognition aborted');
      });

      expect(result.current.error).toBe('aborted');
    });

    it('handles audio-capture error', () => {
      const { result } = renderHook(() => useVoiceInput());

      act(() => {
        result.current.startListening();
      });
      act(() => {
        mockRecognition._simulateError('audio-capture', 'No microphone found');
      });

      expect(result.current.error).toBe('audio-capture');
    });
  });

  describe('End Event Handling', () => {
    it('sets isListening to false when recognition ends', () => {
      const { result } = renderHook(() => useVoiceInput());

      act(() => {
        result.current.startListening();
      });
      act(() => {
        mockRecognition._simulateEnd();
      });

      expect(result.current.isListening).toBe(false);
    });

    it('preserves transcript when recognition ends naturally', () => {
      const { result } = renderHook(() => useVoiceInput());

      act(() => {
        result.current.startListening();
      });
      act(() => {
        mockRecognition._simulateResult('final result');
      });
      act(() => {
        mockRecognition._simulateEnd();
      });

      expect(result.current.transcript).toBe('final result');
    });
  });

  describe('Configuration Options', () => {
    it('accepts language option', () => {
      renderHook(() => useVoiceInput({ language: 'es-ES' }));

      expect(mockRecognition.lang).toBe('es-ES');
    });

    it('defaults language to en-US', () => {
      renderHook(() => useVoiceInput());

      expect(mockRecognition.lang).toBe('en-US');
    });

    it('accepts continuous option', () => {
      renderHook(() => useVoiceInput({ continuous: true }));

      expect(mockRecognition.continuous).toBe(true);
    });

    it('accepts interimResults option', () => {
      renderHook(() => useVoiceInput({ interimResults: true }));

      expect(mockRecognition.interimResults).toBe(true);
    });
  });

  describe('Cleanup on Unmount', () => {
    it('stops recognition when hook unmounts', () => {
      const { result, unmount } = renderHook(() => useVoiceInput());

      act(() => {
        result.current.startListening();
      });

      unmount();

      expect(mockRecognition.stop).toHaveBeenCalled();
    });

    it('aborts recognition when hook unmounts', () => {
      const { result, unmount } = renderHook(() => useVoiceInput());

      act(() => {
        result.current.startListening();
      });

      unmount();

      expect(mockRecognition.abort).toHaveBeenCalled();
    });
  });

  describe('Callback Support', () => {
    it('calls onResult callback when speech is recognized', () => {
      const onResult = jest.fn();
      const { result } = renderHook(() => useVoiceInput({ onResult }));

      act(() => {
        result.current.startListening();
      });
      act(() => {
        mockRecognition._simulateResult('hello world');
      });

      expect(onResult).toHaveBeenCalledWith('hello world');
    });

    it('calls onError callback when error occurs', () => {
      const onError = jest.fn();
      const { result } = renderHook(() => useVoiceInput({ onError }));

      act(() => {
        result.current.startListening();
      });
      act(() => {
        mockRecognition._simulateError('network', 'Network error');
      });

      expect(onError).toHaveBeenCalledWith('network');
    });

    it('calls onEnd callback when recognition ends', () => {
      const onEnd = jest.fn();
      const { result } = renderHook(() => useVoiceInput({ onEnd }));

      act(() => {
        result.current.startListening();
      });
      act(() => {
        mockRecognition._simulateEnd();
      });

      expect(onEnd).toHaveBeenCalled();
    });
  });
});
