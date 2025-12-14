/**
 * Chat Store (Zustand)
 *
 * State management for chat messages and AI interactions.
 * Handles SSE streaming, confirmations, and message history.
 */

import { create } from 'zustand';
import { ChatMessage, PendingConfirmation } from '../types';
import * as apiService from '../services/api';
import { getAccessToken } from './authStore';

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

export const useChatStore = create<ChatStore>((set, get) => ({
  // Initial state
  messages: [],
  isStreaming: false,
  error: null,
  currentStreamingId: null,

  // Actions
  sendMessage: async (content: string) => {
    const accessToken = await getAccessToken();

    if (!accessToken) {
      set({ error: 'Not authenticated. Please log in.' });
      return;
    }

    // Add user message
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: new Date(),
    };

    // Create placeholder for assistant response
    const assistantId = crypto.randomUUID();
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isStreaming: true,
    };

    set((state) => ({
      messages: [...state.messages, userMessage, assistantMessage],
      isStreaming: true,
      error: null,
      currentStreamingId: assistantId,
    }));

    // Setup abort controller
    streamAbortController = new AbortController();

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
