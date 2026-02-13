/**
 * TDD RED Phase Tests for useVoiceOutput Hook
 *
 * These tests define the expected behavior of the useVoiceOutput hook
 * which wraps the Web Speech API (speechSynthesis) for text-to-speech output.
 *
 * The hook should return:
 * - speak: (text: string) => void - creates utterance and speaks
 * - stop: () => void - cancels current speech
 * - isSpeaking: boolean - reflects speechSynthesis.speaking state
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useVoiceOutput } from '../useVoiceOutput';

// Mock SpeechSynthesisUtterance
class MockSpeechSynthesisUtterance {
  text: string;
  lang: string;
  voice: SpeechSynthesisVoice | null;
  volume: number;
  rate: number;
  pitch: number;
  onstart: ((event: SpeechSynthesisEvent) => void) | null;
  onend: ((event: SpeechSynthesisEvent) => void) | null;
  onerror: ((event: SpeechSynthesisErrorEvent) => void) | null;
  onpause: ((event: SpeechSynthesisEvent) => void) | null;
  onresume: ((event: SpeechSynthesisEvent) => void) | null;

  constructor(text?: string) {
    this.text = text || '';
    this.lang = 'en-US';
    this.voice = null;
    this.volume = 1;
    this.rate = 1;
    this.pitch = 1;
    this.onstart = null;
    this.onend = null;
    this.onerror = null;
    this.onpause = null;
    this.onresume = null;
  }
}

// Create mock speechSynthesis
const createMockSpeechSynthesis = () => {
  let speaking = false;
  let paused = false;
  let pending = false;
  let currentUtterance: MockSpeechSynthesisUtterance | null = null;
  const voices: SpeechSynthesisVoice[] = [
    {
      default: true,
      lang: 'en-US',
      localService: true,
      name: 'Microsoft David - English (United States)',
      voiceURI: 'Microsoft David - English (United States)',
    } as SpeechSynthesisVoice,
    {
      default: false,
      lang: 'en-GB',
      localService: true,
      name: 'Microsoft Hazel - English (United Kingdom)',
      voiceURI: 'Microsoft Hazel - English (United Kingdom)',
    } as SpeechSynthesisVoice,
  ];

  const mockSynthesis = {
    get speaking() {
      return speaking;
    },
    get paused() {
      return paused;
    },
    get pending() {
      return pending;
    },
    speak: jest.fn((utterance: MockSpeechSynthesisUtterance) => {
      currentUtterance = utterance;
      speaking = true;
      if (utterance.onstart) {
        utterance.onstart({} as SpeechSynthesisEvent);
      }
    }),
    cancel: jest.fn(() => {
      speaking = false;
      pending = false;
      if (currentUtterance && currentUtterance.onend) {
        currentUtterance.onend({} as SpeechSynthesisEvent);
      }
      currentUtterance = null;
    }),
    pause: jest.fn(() => {
      paused = true;
      if (currentUtterance && currentUtterance.onpause) {
        currentUtterance.onpause({} as SpeechSynthesisEvent);
      }
    }),
    resume: jest.fn(() => {
      paused = false;
      if (currentUtterance && currentUtterance.onresume) {
        currentUtterance.onresume({} as SpeechSynthesisEvent);
      }
    }),
    getVoices: jest.fn(() => voices),
    onvoiceschanged: null as (() => void) | null,
    // Test helpers
    _simulateSpeechEnd: () => {
      speaking = false;
      if (currentUtterance && currentUtterance.onend) {
        currentUtterance.onend({} as SpeechSynthesisEvent);
      }
      currentUtterance = null;
    },
    _simulateSpeechError: (error: string) => {
      speaking = false;
      if (currentUtterance && currentUtterance.onerror) {
        currentUtterance.onerror({
          error,
          charIndex: 0,
          elapsedTime: 0,
          name: 'SpeechSynthesisErrorEvent',
          utterance: currentUtterance,
        } as unknown as SpeechSynthesisErrorEvent);
      }
      currentUtterance = null;
    },
    _getCurrentUtterance: () => currentUtterance,
    _setSpeaking: (value: boolean) => {
      speaking = value;
    },
  };

  return mockSynthesis;
};

describe('useVoiceOutput', () => {
  let mockSynthesis: ReturnType<typeof createMockSpeechSynthesis>;
  let originalSpeechSynthesis: SpeechSynthesis;
  let originalSpeechSynthesisUtterance: typeof SpeechSynthesisUtterance;

  beforeEach(() => {
    // Store originals
    originalSpeechSynthesis = window.speechSynthesis;
    originalSpeechSynthesisUtterance = window.SpeechSynthesisUtterance;

    // Create fresh mock
    mockSynthesis = createMockSpeechSynthesis();

    // Mock window properties
    Object.defineProperty(window, 'speechSynthesis', {
      value: mockSynthesis,
      writable: true,
      configurable: true,
    });

    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      value: MockSpeechSynthesisUtterance,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    // Restore originals
    Object.defineProperty(window, 'speechSynthesis', {
      value: originalSpeechSynthesis,
      writable: true,
      configurable: true,
    });

    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      value: originalSpeechSynthesisUtterance,
      writable: true,
      configurable: true,
    });

    jest.clearAllMocks();
  });

  describe('Initial State', () => {
    it('returns isSpeaking as false initially', () => {
      const { result } = renderHook(() => useVoiceOutput());

      expect(result.current.isSpeaking).toBe(false);
    });

    it('returns speak function', () => {
      const { result } = renderHook(() => useVoiceOutput());

      expect(typeof result.current.speak).toBe('function');
    });

    it('returns stop function', () => {
      const { result } = renderHook(() => useVoiceOutput());

      expect(typeof result.current.stop).toBe('function');
    });

    it('returns null error initially when Speech Synthesis is supported', () => {
      const { result } = renderHook(() => useVoiceOutput());

      expect(result.current.error).toBeNull();
    });
  });

  describe('Browser Support Detection', () => {
    it('sets error when Speech Synthesis is not supported', () => {
      // Remove Speech Synthesis API
      Object.defineProperty(window, 'speechSynthesis', {
        value: undefined,
        writable: true,
        configurable: true,
      });

      const { result } = renderHook(() => useVoiceOutput());

      expect(result.current.error).toBe('Speech synthesis is not supported in this browser');
    });

    it('returns error state object when not supported', () => {
      Object.defineProperty(window, 'speechSynthesis', {
        value: undefined,
        writable: true,
        configurable: true,
      });

      const { result } = renderHook(() => useVoiceOutput());

      expect(result.current.isSpeaking).toBe(false);
      expect(typeof result.current.speak).toBe('function');
      expect(typeof result.current.stop).toBe('function');
    });

    it('speak does nothing when API is not supported', () => {
      Object.defineProperty(window, 'speechSynthesis', {
        value: undefined,
        writable: true,
        configurable: true,
      });

      const { result } = renderHook(() => useVoiceOutput());

      // Should not throw
      act(() => {
        result.current.speak('hello');
      });

      expect(result.current.isSpeaking).toBe(false);
    });
  });

  describe('speak Function', () => {
    it('calls speechSynthesis.speak with utterance', () => {
      const { result } = renderHook(() => useVoiceOutput());

      act(() => {
        result.current.speak('hello world');
      });

      expect(mockSynthesis.speak).toHaveBeenCalled();
    });

    it('creates utterance with correct text', () => {
      const { result } = renderHook(() => useVoiceOutput());

      act(() => {
        result.current.speak('test message');
      });

      const utterance = mockSynthesis._getCurrentUtterance();
      expect(utterance?.text).toBe('test message');
    });

    it('sets isSpeaking to true when speaking starts', () => {
      const { result } = renderHook(() => useVoiceOutput());

      act(() => {
        result.current.speak('hello');
      });

      expect(result.current.isSpeaking).toBe(true);
    });

    it('cancels previous speech before starting new speech', () => {
      const { result } = renderHook(() => useVoiceOutput());

      act(() => {
        result.current.speak('first message');
      });
      act(() => {
        result.current.speak('second message');
      });

      expect(mockSynthesis.cancel).toHaveBeenCalled();
    });

    it('handles empty text gracefully', () => {
      const { result } = renderHook(() => useVoiceOutput());

      act(() => {
        result.current.speak('');
      });

      // Should still call speak (browser handles empty text)
      expect(mockSynthesis.speak).toHaveBeenCalled();
    });

    it('handles long text', () => {
      const { result } = renderHook(() => useVoiceOutput());
      const longText = 'a'.repeat(10000);

      act(() => {
        result.current.speak(longText);
      });

      const utterance = mockSynthesis._getCurrentUtterance();
      expect(utterance?.text).toBe(longText);
    });
  });

  describe('stop Function', () => {
    it('calls speechSynthesis.cancel', () => {
      const { result } = renderHook(() => useVoiceOutput());

      act(() => {
        result.current.speak('hello');
      });
      act(() => {
        result.current.stop();
      });

      expect(mockSynthesis.cancel).toHaveBeenCalled();
    });

    it('sets isSpeaking to false when stopped', () => {
      const { result } = renderHook(() => useVoiceOutput());

      act(() => {
        result.current.speak('hello');
      });
      act(() => {
        result.current.stop();
      });

      expect(result.current.isSpeaking).toBe(false);
    });

    it('can be called when not speaking without error', () => {
      const { result } = renderHook(() => useVoiceOutput());

      // Should not throw
      act(() => {
        result.current.stop();
      });

      expect(result.current.isSpeaking).toBe(false);
    });
  });

  describe('isSpeaking State', () => {
    it('reflects speechSynthesis.speaking state', () => {
      const { result } = renderHook(() => useVoiceOutput());

      expect(result.current.isSpeaking).toBe(false);

      act(() => {
        result.current.speak('hello');
      });

      expect(result.current.isSpeaking).toBe(true);
    });

    it('updates to false when speech ends naturally', async () => {
      const { result } = renderHook(() => useVoiceOutput());

      act(() => {
        result.current.speak('hello');
      });

      expect(result.current.isSpeaking).toBe(true);

      act(() => {
        mockSynthesis._simulateSpeechEnd();
      });

      expect(result.current.isSpeaking).toBe(false);
    });

    it('updates to false when speech is cancelled', () => {
      const { result } = renderHook(() => useVoiceOutput());

      act(() => {
        result.current.speak('hello');
      });
      act(() => {
        result.current.stop();
      });

      expect(result.current.isSpeaking).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('sets error when speech synthesis fails', () => {
      const { result } = renderHook(() => useVoiceOutput());

      act(() => {
        result.current.speak('hello');
      });
      act(() => {
        mockSynthesis._simulateSpeechError('synthesis-failed');
      });

      expect(result.current.error).toBe('synthesis-failed');
    });

    it('sets isSpeaking to false on error', () => {
      const { result } = renderHook(() => useVoiceOutput());

      act(() => {
        result.current.speak('hello');
      });
      act(() => {
        mockSynthesis._simulateSpeechError('network');
      });

      expect(result.current.isSpeaking).toBe(false);
    });

    it('clears error when speaking again', () => {
      const { result } = renderHook(() => useVoiceOutput());

      // Trigger error
      act(() => {
        result.current.speak('hello');
      });
      act(() => {
        mockSynthesis._simulateSpeechError('network');
      });

      expect(result.current.error).not.toBeNull();

      // Speak again should clear error
      act(() => {
        result.current.speak('hello again');
      });

      expect(result.current.error).toBeNull();
    });

    it('handles interrupted error', () => {
      const { result } = renderHook(() => useVoiceOutput());

      act(() => {
        result.current.speak('hello');
      });
      act(() => {
        mockSynthesis._simulateSpeechError('interrupted');
      });

      expect(result.current.error).toBe('interrupted');
    });

    it('handles audio-busy error', () => {
      const { result } = renderHook(() => useVoiceOutput());

      act(() => {
        result.current.speak('hello');
      });
      act(() => {
        mockSynthesis._simulateSpeechError('audio-busy');
      });

      expect(result.current.error).toBe('audio-busy');
    });
  });

  describe('Configuration Options', () => {
    it('accepts language option', () => {
      const { result } = renderHook(() => useVoiceOutput({ language: 'es-ES' }));

      act(() => {
        result.current.speak('hola');
      });

      const utterance = mockSynthesis._getCurrentUtterance();
      expect(utterance?.lang).toBe('es-ES');
    });

    it('defaults language to en-US', () => {
      const { result } = renderHook(() => useVoiceOutput());

      act(() => {
        result.current.speak('hello');
      });

      const utterance = mockSynthesis._getCurrentUtterance();
      expect(utterance?.lang).toBe('en-US');
    });

    it('accepts rate option', () => {
      const { result } = renderHook(() => useVoiceOutput({ rate: 1.5 }));

      act(() => {
        result.current.speak('hello');
      });

      const utterance = mockSynthesis._getCurrentUtterance();
      expect(utterance?.rate).toBe(1.5);
    });

    it('accepts pitch option', () => {
      const { result } = renderHook(() => useVoiceOutput({ pitch: 0.8 }));

      act(() => {
        result.current.speak('hello');
      });

      const utterance = mockSynthesis._getCurrentUtterance();
      expect(utterance?.pitch).toBe(0.8);
    });

    it('accepts volume option', () => {
      const { result } = renderHook(() => useVoiceOutput({ volume: 0.5 }));

      act(() => {
        result.current.speak('hello');
      });

      const utterance = mockSynthesis._getCurrentUtterance();
      expect(utterance?.volume).toBe(0.5);
    });

    it('accepts voice option by name', () => {
      const { result } = renderHook(() =>
        useVoiceOutput({ voiceName: 'Microsoft David - English (United States)' })
      );

      act(() => {
        result.current.speak('hello');
      });

      const utterance = mockSynthesis._getCurrentUtterance();
      expect(utterance?.voice?.name).toBe('Microsoft David - English (United States)');
    });
  });

  describe('Voice Management', () => {
    it('provides list of available voices', () => {
      const { result } = renderHook(() => useVoiceOutput());

      expect(result.current.voices).toBeDefined();
      expect(result.current.voices.length).toBeGreaterThan(0);
    });

    it('returns getVoices result', () => {
      const { result } = renderHook(() => useVoiceOutput());

      expect(mockSynthesis.getVoices).toHaveBeenCalled();
      expect(result.current.voices[0].name).toBe('Microsoft David - English (United States)');
    });

    it('falls back to first voice if specified voice not found', () => {
      const { result } = renderHook(() =>
        useVoiceOutput({ voiceName: 'Non-existent Voice' })
      );

      act(() => {
        result.current.speak('hello');
      });

      const utterance = mockSynthesis._getCurrentUtterance();
      // Should use default voice when specified voice not found
      expect(utterance?.voice?.name).toBe('Microsoft David - English (United States)');
    });
  });

  describe('Cleanup on Unmount', () => {
    it('cancels speech when hook unmounts', () => {
      const { result, unmount } = renderHook(() => useVoiceOutput());

      act(() => {
        result.current.speak('hello');
      });

      unmount();

      expect(mockSynthesis.cancel).toHaveBeenCalled();
    });

    it('does not cause errors on unmount when not speaking', () => {
      const { unmount } = renderHook(() => useVoiceOutput());

      // Should not throw
      unmount();

      // cancel may or may not be called - just shouldn't error
    });
  });

  describe('Callback Support', () => {
    it('calls onStart callback when speech starts', () => {
      const onStart = jest.fn();
      const { result } = renderHook(() => useVoiceOutput({ onStart }));

      act(() => {
        result.current.speak('hello');
      });

      expect(onStart).toHaveBeenCalled();
    });

    it('calls onEnd callback when speech ends', () => {
      const onEnd = jest.fn();
      const { result } = renderHook(() => useVoiceOutput({ onEnd }));

      act(() => {
        result.current.speak('hello');
      });
      act(() => {
        mockSynthesis._simulateSpeechEnd();
      });

      expect(onEnd).toHaveBeenCalled();
    });

    it('calls onError callback when error occurs', () => {
      const onError = jest.fn();
      const { result } = renderHook(() => useVoiceOutput({ onError }));

      act(() => {
        result.current.speak('hello');
      });
      act(() => {
        mockSynthesis._simulateSpeechError('network');
      });

      expect(onError).toHaveBeenCalledWith('network');
    });
  });

  describe('Pause and Resume', () => {
    it('provides pause function', () => {
      const { result } = renderHook(() => useVoiceOutput());

      expect(typeof result.current.pause).toBe('function');
    });

    it('provides resume function', () => {
      const { result } = renderHook(() => useVoiceOutput());

      expect(typeof result.current.resume).toBe('function');
    });

    it('calls speechSynthesis.pause when pause is called', () => {
      const { result } = renderHook(() => useVoiceOutput());

      act(() => {
        result.current.speak('hello');
      });
      act(() => {
        result.current.pause();
      });

      expect(mockSynthesis.pause).toHaveBeenCalled();
    });

    it('calls speechSynthesis.resume when resume is called', () => {
      const { result } = renderHook(() => useVoiceOutput());

      act(() => {
        result.current.speak('hello');
      });
      act(() => {
        result.current.pause();
      });
      act(() => {
        result.current.resume();
      });

      expect(mockSynthesis.resume).toHaveBeenCalled();
    });

    it('provides isPaused state', () => {
      const { result } = renderHook(() => useVoiceOutput());

      expect(result.current.isPaused).toBe(false);

      act(() => {
        result.current.speak('hello');
      });
      act(() => {
        result.current.pause();
      });

      expect(result.current.isPaused).toBe(true);
    });
  });
});
