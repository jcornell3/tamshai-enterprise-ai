/**
 * Streaming Message Component
 *
 * Displays AI response with real-time streaming via SSE
 * Architecture v1.4 - Section 6.1
 */

import { useEffect, useState, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { streamQuery, getAccessToken } from '../services/sse.service';
import { useChatStore } from '../stores/chatStore';
import { ApprovalMessage, TruncationMessage } from '../types';

interface StreamingMessageProps {
  messageId: string;
  query: string;
}

export function StreamingMessage({ messageId, query }: StreamingMessageProps) {
  const [content, setContent] = useState('');
  const [isStreaming, setIsStreaming] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<(() => void) | null>(null);

  const addMessage = useChatStore(state => state.addMessage);
  const addConfirmation = useChatStore(state => state.addConfirmation);

  useEffect(() => {
    let isMounted = true;

    const startStreaming = async () => {
      try {
        const token = await getAccessToken();

        abortRef.current = streamQuery(query, token, {
          onChunk: (text) => {
            if (isMounted) {
              setContent(prev => prev + text);
            }
          },

          onPagination: (data) => {
            if (isMounted && data.hasMore) {
              // Add truncation warning message
              const truncationMessage: TruncationMessage = {
                id: `${messageId}-truncation`,
                role: 'system',
                type: 'truncation',
                message: data.hint || 'More data available. Please refine your query.',
                cursors: data.cursors,
                timestamp: Date.now(),
              };

              addMessage(truncationMessage);
            }
          },

          onError: (errorMessage) => {
            if (isMounted) {
              setError(errorMessage);
              setIsStreaming(false);
            }
          },

          onComplete: () => {
            if (isMounted) {
              setIsStreaming(false);
            }
          },
        });
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Unknown error');
          setIsStreaming(false);
        }
      }
    };

    startStreaming();

    return () => {
      isMounted = false;
      if (abortRef.current) {
        abortRef.current();
      }
    };
  }, [messageId, query, addMessage]);

  // Check for pending_confirmation in content
  useEffect(() => {
    try {
      // Check if content looks like a confirmation response
      if (content.includes('"status":"pending_confirmation"') || content.includes('"status": "pending_confirmation"')) {
        const jsonMatch = content.match(/\{[\s\S]*"status"\s*:\s*"pending_confirmation"[\s\S]*\}/);

        if (jsonMatch) {
          const confirmationData = JSON.parse(jsonMatch[0]);

          // Add approval message
          const approvalMessage: ApprovalMessage = {
            id: confirmationData.confirmationId,
            role: 'assistant',
            type: 'approval',
            confirmationId: confirmationData.confirmationId,
            message: confirmationData.message,
            confirmationData: confirmationData.confirmationData,
            status: 'pending',
            timestamp: Date.now(),
          };

          addMessage(approvalMessage);

          // Add to confirmation store
          addConfirmation(confirmationData.confirmationId, {
            message: confirmationData.message,
            confirmationData: confirmationData.confirmationData,
          });

          // Stop streaming since we've handled the confirmation
          if (abortRef.current) {
            abortRef.current();
          }
          setIsStreaming(false);
        }
      }
    } catch (err) {
      // Ignore JSON parse errors (content may be partial)
    }
  }, [content, addMessage, addConfirmation]);

  if (error) {
    return (
      <div style={styles.errorContainer}>
        <p style={styles.errorText}>❌ Error: {error}</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.content}>
        <ReactMarkdown>{content}</ReactMarkdown>
      </div>

      {isStreaming && (
        <div style={styles.indicator}>
          <div style={styles.dot}></div>
          <div style={styles.dot}></div>
          <div style={styles.dot}></div>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    padding: '12px 16px',
    background: '#f9fafb',
    borderRadius: '8px',
    marginBottom: '8px',
  },
  content: {
    fontSize: '14px',
    lineHeight: '1.6',
    color: '#1f2937',
  },
  indicator: {
    display: 'flex',
    gap: '4px',
    marginTop: '8px',
    paddingLeft: '4px',
  },
  dot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: '#9ca3af',
    animation: 'pulse 1.4s ease-in-out infinite',
  },
  errorContainer: {
    padding: '12px 16px',
    background: '#fee2e2',
    border: '1px solid #fca5a5',
    borderRadius: '8px',
    marginBottom: '8px',
  },
  errorText: {
    fontSize: '14px',
    color: '#991b1b',
    margin: 0,
  },
};
