/**
 * Chat Store - Zustand State Management
 *
 * Manages conversation messages and confirmations
 */

import { create } from 'zustand';
import { Message, ApprovalMessage } from '../types';
import { approveConfirmation, rejectConfirmation } from '../services/confirmation.service';

interface PendingConfirmation {
  id: string;
  message: string;
  confirmationData?: Record<string, unknown>;
  createdAt: number;
  expiresAt: number;
}

interface ChatState {
  // Messages
  messages: Message[];
  addMessage: (message: Message) => void;
  updateMessage: (id: string, updates: Partial<Message>) => void;
  clearMessages: () => void;

  // Confirmations
  pendingConfirmations: Map<string, PendingConfirmation>;
  addConfirmation: (id: string, data: Omit<PendingConfirmation, 'id' | 'createdAt' | 'expiresAt'>) => void;
  removeConfirmation: (id: string) => void;
  approveConfirmation: (id: string, token: string) => Promise<void>;
  rejectConfirmation: (id: string, token: string) => Promise<void>;
}

export const useChatStore = create<ChatState>((set, get) => ({
  // ==================== Messages ====================
  messages: [],

  addMessage: (message) => {
    set(state => ({
      messages: [...state.messages, message],
    }));
  },

  updateMessage: (id, updates) => {
    set(state => ({
      messages: state.messages.map(msg =>
        msg.id === id ? { ...msg, ...updates } as Message : msg
      ),
    }));
  },

  clearMessages: () => {
    set({ messages: [] });
  },

  // ==================== Confirmations ====================
  pendingConfirmations: new Map(),

  addConfirmation: (id, data) => {
    const now = Date.now();
    const expiresAt = now + (5 * 60 * 1000); // 5 minutes TTL

    set(state => {
      const newMap = new Map(state.pendingConfirmations);
      newMap.set(id, {
        id,
        ...data,
        createdAt: now,
        expiresAt,
      });
      return { pendingConfirmations: newMap };
    });

    // Auto-remove after expiration
    setTimeout(() => {
      const confirmation = get().pendingConfirmations.get(id);
      if (confirmation) {
        get().removeConfirmation(id);

        // Show notification
        window.electronAPI.showNotification(
          'Confirmation Expired',
          'The action request has expired. Please retry.'
        );
      }
    }, 5 * 60 * 1000);
  },

  removeConfirmation: (id) => {
    set(state => {
      const newMap = new Map(state.pendingConfirmations);
      newMap.delete(id);
      return { pendingConfirmations: newMap };
    });
  },

  approveConfirmation: async (id, token) => {
    const result = await approveConfirmation(id, token);

    if (result.success) {
      // Update message status
      get().updateMessage(id, {
        status: 'approved',
      } as Partial<ApprovalMessage>);

      // Remove from pending
      get().removeConfirmation(id);

      // Show notification
      window.electronAPI.showNotification(
        'Success',
        result.message || 'Action completed successfully'
      );

      // Add success message to chat
      get().addMessage({
        id: `${id}-result`,
        role: 'system',
        type: 'text',
        content: result.message || '✅ Action completed successfully',
        timestamp: Date.now(),
      });
    } else {
      // Show error notification
      window.electronAPI.showNotification(
        'Error',
        result.error || 'Failed to complete action'
      );

      // Add error message to chat
      get().addMessage({
        id: `${id}-error`,
        role: 'system',
        type: 'text',
        content: `❌ Error: ${result.error}`,
        timestamp: Date.now(),
      });
    }
  },

  rejectConfirmation: async (id, token) => {
    const result = await rejectConfirmation(id, token);

    // Update message status
    get().updateMessage(id, {
      status: 'rejected',
    } as Partial<ApprovalMessage>);

    // Remove from pending
    get().removeConfirmation(id);

    if (result.success) {
      // Show notification
      window.electronAPI.showNotification(
        'Cancelled',
        'Action cancelled'
      );

      // Add cancellation message to chat
      get().addMessage({
        id: `${id}-cancelled`,
        role: 'system',
        type: 'text',
        content: '❌ Action cancelled',
        timestamp: Date.now(),
      });
    }
  },
}));
