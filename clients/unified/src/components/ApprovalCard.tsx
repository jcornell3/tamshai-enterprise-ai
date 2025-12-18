/**
 * ApprovalCard Component (v1.4)
 *
 * Renders a confirmation card for write operations requiring user approval.
 * Used for human-in-the-loop confirmations per Architecture v1.4 Section 5.6.
 *
 * Article V Compliance:
 * - V.1: No authorization logic - just UI for approval flow
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useChatStore } from '../stores/chatStore';

interface ApprovalCardProps {
  confirmationId: string;
  message: string;
  action: string;
  isDarkMode: boolean;
}

export function ApprovalCard({
  confirmationId,
  message,
  action,
  isDarkMode,
}: ApprovalCardProps) {
  const { confirmAction } = useChatStore();
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<'approved' | 'rejected' | null>(null);

  const handleApprove = async () => {
    setIsProcessing(true);
    try {
      await confirmAction(confirmationId, true);
      setResult('approved');
    } catch (error) {
      console.error('[ApprovalCard] Approval failed:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async () => {
    setIsProcessing(true);
    try {
      await confirmAction(confirmationId, false);
      setResult('rejected');
    } catch (error) {
      console.error('[ApprovalCard] Rejection failed:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  // Show result state
  if (result) {
    return (
      <View style={[styles.container, styles.resultContainer]}>
        <Text style={styles.resultText}>
          {result === 'approved' ? 'Action approved' : 'Action cancelled'}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.warningIcon}>&#9888;</Text>
        <Text style={styles.title}>Confirm Action Required</Text>
      </View>

      {/* Message */}
      <Text style={styles.message}>{message}</Text>

      {/* Action type */}
      <Text style={styles.actionLabel}>Action: {action}</Text>

      {/* Buttons */}
      <View style={styles.buttonRow}>
        <Pressable
          style={[styles.button, styles.approveButton]}
          onPress={handleApprove}
          disabled={isProcessing}
        >
          {isProcessing ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Text style={styles.buttonText}>Approve</Text>
          )}
        </Pressable>
        <Pressable
          style={[styles.button, styles.rejectButton]}
          onPress={handleReject}
          disabled={isProcessing}
        >
          <Text style={[styles.buttonText, styles.rejectButtonText]}>Reject</Text>
        </Pressable>
      </View>

      {/* Expiry warning */}
      <Text style={styles.expiryText}>
        This confirmation will expire in 5 minutes
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 2,
    borderColor: '#EAB308', // yellow-500
    backgroundColor: '#FEF9C3', // yellow-50
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
  },
  resultContainer: {
    backgroundColor: '#E8F5E9',
    borderColor: '#4CAF50',
  },
  resultText: {
    color: '#2E7D32',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  warningIcon: {
    fontSize: 20,
    color: '#EAB308',
    marginRight: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#92400E', // yellow-800
  },
  message: {
    fontSize: 14,
    color: '#78350F', // yellow-900
    marginBottom: 8,
    lineHeight: 20,
  },
  actionLabel: {
    fontSize: 12,
    color: '#92400E',
    fontStyle: 'italic',
    marginBottom: 16,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    gap: 12,
  },
  button: {
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 8,
    minWidth: 100,
    alignItems: 'center',
  },
  approveButton: {
    backgroundColor: '#16A34A', // green-600
  },
  rejectButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#DC2626', // red-600
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  rejectButtonText: {
    color: '#DC2626',
  },
  expiryText: {
    fontSize: 11,
    color: '#92400E',
    marginTop: 12,
    fontStyle: 'italic',
  },
});
