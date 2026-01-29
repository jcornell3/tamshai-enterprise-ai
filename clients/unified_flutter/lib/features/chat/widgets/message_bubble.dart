import 'package:flutter/material.dart';
import '../../../core/chat/models/chat_state.dart';
import '../../../core/theme/color_extensions.dart';

/// Message bubble widget for displaying chat messages
class MessageBubble extends StatelessWidget {
  final ChatMessage message;
  final VoidCallback? onCopy;

  const MessageBubble({
    super.key,
    required this.message,
    this.onCopy,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isUser = message.role == MessageRole.user;
    final isSystem = message.role == MessageRole.system;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment:
            isUser ? MainAxisAlignment.end : MainAxisAlignment.start,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (!isUser) ...[
            _buildAvatar(theme, isSystem),
            const SizedBox(width: 8),
          ],
          Flexible(
            child: Column(
              crossAxisAlignment:
                  isUser ? CrossAxisAlignment.end : CrossAxisAlignment.start,
              children: [
                Container(
                  constraints: BoxConstraints(
                    maxWidth: MediaQuery.of(context).size.width * 0.75,
                  ),
                  padding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 12,
                  ),
                  decoration: BoxDecoration(
                    color: isUser
                        ? theme.colorScheme.primary
                        : isSystem
                            ? theme.colorScheme.tertiaryContainer
                            : theme.colorScheme.surfaceContainerHighest,
                    borderRadius: BorderRadius.only(
                      topLeft: const Radius.circular(16),
                      topRight: const Radius.circular(16),
                      bottomLeft: Radius.circular(isUser ? 16 : 4),
                      bottomRight: Radius.circular(isUser ? 4 : 16),
                    ),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Truncation warning (v1.4 requirement)
                      if (message.isTruncated)
                        Container(
                          margin: const EdgeInsets.only(bottom: 8),
                          padding: const EdgeInsets.all(8),
                          decoration: BoxDecoration(
                            color: theme.colorScheme.warningContainer,
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(
                                Icons.warning_amber,
                                size: 16,
                                color: theme.colorScheme.onWarningContainer,
                              ),
                              const SizedBox(width: 8),
                              Flexible(
                                child: Text(
                                  message.truncationWarning ??
                                      'Results truncated. Not all data is shown.',
                                  style: theme.textTheme.bodySmall?.copyWith(
                                    color: theme.colorScheme.onWarningContainer,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),

                      // Message content
                      SelectableText(
                        message.content.isEmpty && message.isStreaming
                            ? '...'
                            : message.content,
                        style: theme.textTheme.bodyMedium?.copyWith(
                          color: isUser
                              ? theme.colorScheme.onPrimary
                              : theme.colorScheme.onSurface,
                        ),
                      ),

                      // Streaming indicator
                      if (message.isStreaming)
                        Padding(
                          padding: const EdgeInsets.only(top: 8),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              SizedBox(
                                width: 12,
                                height: 12,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: isUser
                                      ? theme.colorScheme.onPrimary
                                      : theme.colorScheme.primary,
                                ),
                              ),
                              const SizedBox(width: 8),
                              Text(
                                'Thinking...',
                                style: theme.textTheme.bodySmall?.copyWith(
                                  color: isUser
                                      ? theme.colorScheme.onPrimary
                                          .withOpacity(0.7)
                                      : theme.colorScheme.onSurface
                                          .withOpacity(0.7),
                                ),
                              ),
                            ],
                          ),
                        ),
                    ],
                  ),
                ),

                // Timestamp and actions
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        _formatTime(message.timestamp),
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: theme.colorScheme.onSurface.withOpacity(0.5),
                        ),
                      ),
                      if (!isUser && onCopy != null) ...[
                        const SizedBox(width: 8),
                        InkWell(
                          onTap: onCopy,
                          borderRadius: BorderRadius.circular(4),
                          child: Padding(
                            padding: const EdgeInsets.all(4),
                            child: Icon(
                              Icons.copy,
                              size: 14,
                              color:
                                  theme.colorScheme.onSurface.withOpacity(0.5),
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ],
            ),
          ),
          if (isUser) ...[
            const SizedBox(width: 8),
            _buildAvatar(theme, false, isUser: true),
          ],
        ],
      ),
    );
  }

  Widget _buildAvatar(ThemeData theme, bool isSystem, {bool isUser = false}) {
    return CircleAvatar(
      radius: 16,
      backgroundColor: isUser
          ? theme.colorScheme.primary
          : isSystem
              ? theme.colorScheme.tertiary
              : theme.colorScheme.secondary,
      child: Icon(
        isUser
            ? Icons.person
            : isSystem
                ? Icons.info
                : Icons.smart_toy,
        size: 18,
        color: isUser
            ? theme.colorScheme.onPrimary
            : theme.colorScheme.onSecondary,
      ),
    );
  }

  String _formatTime(DateTime timestamp) {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final messageDay = DateTime(
      timestamp.year,
      timestamp.month,
      timestamp.day,
    );

    final timeStr =
        '${timestamp.hour.toString().padLeft(2, '0')}:${timestamp.minute.toString().padLeft(2, '0')}';

    if (messageDay == today) {
      return timeStr;
    } else {
      return '${timestamp.month}/${timestamp.day} $timeStr';
    }
  }
}
