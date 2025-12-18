/**
 * Chat Store (Zustand)
 *
 * State management for chat messages and AI interactions.
 * Handles SSE streaming, confirmations, and message history.
 */

import { create } from 'zustand';
import { ChatMessage } from '../types';
import * as apiService from '../services/api';
import { getAccessToken } from './authStore';

// Simple UUID generator (crypto.randomUUID not available in all RN environments)
function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

interface ChatState {
  messages: ChatMessage[];
  isStreaming: boolean;
  error: string | null;
  currentStreamingId: string | null;
}

interface ChatActions {
  sendMessage: (content: string) => Promise<void>;
  confirmAction: (confirmationId: string, approved: boolean) => Promise<void>;
  clearMessages: () => void;
  cancelStream: () => void;
}

interface ChatStore extends ChatState, ChatActions {}

// AbortController for cancelling streams
let streamAbortController: AbortController | null = null;

export const useChatStore = create<ChatStore>((set, _get) => ({
  // Initial state
  messages: [],
  isStreaming: false,
  error: null,
  currentStreamingId: null,

  // Actions
  sendMessage: async (content: string) => {
    console.log('[ChatStore] ====== sendMessage ENTRY ======');
    console.log('[ChatStore] content:', content);
    console.log('[ChatStore] content length:', content ? content.length : 0);

    console.log('[ChatStore] Calling getAccessToken...');
    let accessToken: string | null = null;
    try {
      accessToken = await getAccessToken();
      console.log('[ChatStore] getAccessToken returned, token length:', accessToken ? accessToken.length : 0);
    } catch (tokenError) {
      console.log('[ChatStore] getAccessToken threw:', tokenError);
      set({ error: 'Failed to get access token' });
      return;
    }

    if (!accessToken) {
      console.log('[ChatStore] No access token, returning');
      set({ error: 'Not authenticated. Please log in.' });
      return;
    }

    console.log('[ChatStore] Got token, building messages...');

    // Add user message
    const userMessage: ChatMessage = {
      id: generateId(),
      role: 'user',
      content,
      timestamp: new Date(),
    };

    // Create placeholder for assistant response
    const assistantId = generateId();
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isStreaming: true,
    };

    console.log('[ChatStore] Calling set() to add messages...');
    set((state) => ({
      messages: [...state.messages, userMessage, assistantMessage],
      isStreaming: true,
      error: null,
      currentStreamingId: assistantId,
    }));
    console.log('[ChatStore] set() returned');

    // Setup abort controller
    console.log('[ChatStore] Creating AbortController...');
    streamAbortController = new AbortController();
    console.log('[ChatStore] AbortController created');

    console.log('[ChatStore] ====== ABOUT TO CALL apiService.streamQuery ======');
    try {
      await apiService.streamQuery(
        content,
        accessToken,
        // onChunk - update streaming message
        (text: string) => {
          set((state) => ({
            messages: state.messages.map((msg) =>
              msg.id === assistantId
                ? { ...msg, content: msg.content + text }
                : msg
            ),
          }));
        },
        // onComplete - finalize message
        (completeMessage: ChatMessage) => {
          set((state) => ({
            messages: state.messages.map((msg) =>
              msg.id === assistantId
                ? {
                    ...completeMessage,
                    id: assistantId,
                    isStreaming: false,
                  }
                : msg
            ),
            isStreaming: false,
            currentStreamingId: null,
          }));
          streamAbortController = null;
        },
        // onError
        (error: Error) => {
          set((state) => ({
            messages: state.messages.map((msg) =>
              msg.id === assistantId
                ? {
                    ...msg,
                    content: msg.content || 'Sorry, an error occurred.',
                    isStreaming: false,
                  }
                : msg
            ),
            isStreaming: false,
            error: error.message,
            currentStreamingId: null,
          }));
          streamAbortController = null;
        },
        streamAbortController.signal
      );
    } catch (error) {
      // Handle any uncaught errors from streamQuery
      console.error('[ChatStore] streamQuery error:', error);
      set((state) => ({
        messages: state.messages.map((msg) =>
          msg.id === assistantId
            ? {
                ...msg,
                content: msg.content || 'Failed to connect to AI service.',
                isStreaming: false,
              }
            : msg
        ),
        isStreaming: false,
        error: error instanceof Error ? error.message : 'Connection failed',
        currentStreamingId: null,
      }));
      streamAbortController = null;
    }
  },

  confirmAction: async (confirmationId: string, approved: boolean) => {
    const accessToken = await getAccessToken();

    if (!accessToken) {
      set({ error: 'Not authenticated. Please log in.' });
      return;
    }

    try {
      const result = await apiService.confirmAction(confirmationId, approved, accessToken);

      // Update the message with confirmation result
      set((state) => ({
        messages: state.messages.map((msg) =>
          msg.pendingConfirmation?.confirmationId === confirmationId
            ? {
                ...msg,
                pendingConfirmation: {
                  ...msg.pendingConfirmation,
                  approved,
                },
                content: approved
                  ? `${msg.content}\n\n**Action confirmed.** ${result.status === 'success' ? 'Operation completed successfully.' : ''}`
                  : `${msg.content}\n\n**Action cancelled.**`,
              }
            : msg
        ),
        error: null,
      }));
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Confirmation failed',
      });
    }
  },

  clearMessages: () => {
    set({
      messages: [],
      error: null,
    });
  },

  cancelStream: () => {
    if (streamAbortController) {
      streamAbortController.abort();
      streamAbortController = null;
    }

    set((state) => ({
      isStreaming: false,
      messages: state.messages.map((msg) =>
        msg.id === state.currentStreamingId
          ? { ...msg, isStreaming: false, content: msg.content || '(Cancelled)' }
          : msg
      ),
      currentStreamingId: null,
    }));
  },
}));
