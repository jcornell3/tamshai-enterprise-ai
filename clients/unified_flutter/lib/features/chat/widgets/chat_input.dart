import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// Chat input widget with send button and keyboard handling
class ChatInput extends StatelessWidget {
  final TextEditingController controller;
  final FocusNode focusNode;
  final bool isLoading;
  final bool isStreaming;
  final VoidCallback onSend;
  final VoidCallback onCancel;

  const ChatInput({
    super.key,
    required this.controller,
    required this.focusNode,
    required this.isLoading,
    required this.isStreaming,
    required this.onSend,
    required this.onCancel,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        boxShadow: [
          BoxShadow(
            color: theme.shadowColor.withOpacity(0.1),
            blurRadius: 8,
            offset: const Offset(0, -2),
          ),
        ],
      ),
      child: SafeArea(
        top: false,
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Expanded(
              child: Container(
                constraints: const BoxConstraints(maxHeight: 150),
                decoration: BoxDecoration(
                  color: theme.colorScheme.surfaceContainerHighest,
                  borderRadius: BorderRadius.circular(24),
                ),
                child: KeyboardListener(
                  focusNode: FocusNode(),
                  onKeyEvent: (event) {
                    // Submit on Enter (without Shift)
                    if (event is KeyDownEvent &&
                        event.logicalKey == LogicalKeyboardKey.enter &&
                        !HardwareKeyboard.instance.isShiftPressed) {
                      onSend();
                    }
                  },
                  child: TextField(
                    controller: controller,
                    focusNode: focusNode,
                    maxLines: null,
                    textInputAction: TextInputAction.newline,
                    enabled: !isLoading,
                    decoration: InputDecoration(
                      hintText: isStreaming
                          ? 'AI is responding...'
                          : 'Type a message...',
                      border: InputBorder.none,
                      contentPadding: const EdgeInsets.symmetric(
                        horizontal: 20,
                        vertical: 12,
                      ),
                    ),
                    onSubmitted: (_) => onSend(),
                  ),
                ),
              ),
            ),
            const SizedBox(width: 8),
            _buildActionButton(theme),
          ],
        ),
      ),
    );
  }

  Widget _buildActionButton(ThemeData theme) {
    if (isStreaming) {
      return _buildButton(
        theme: theme,
        icon: Icons.stop,
        onPressed: onCancel,
        backgroundColor: theme.colorScheme.error,
        foregroundColor: theme.colorScheme.onError,
        tooltip: 'Stop generating',
      );
    }

    if (isLoading) {
      return Container(
        width: 48,
        height: 48,
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: theme.colorScheme.surfaceContainerHighest,
          shape: BoxShape.circle,
        ),
        child: CircularProgressIndicator(
          strokeWidth: 2,
          color: theme.colorScheme.primary,
        ),
      );
    }

    return _buildButton(
      theme: theme,
      icon: Icons.send,
      onPressed: onSend,
      backgroundColor: theme.colorScheme.primary,
      foregroundColor: theme.colorScheme.onPrimary,
      tooltip: 'Send message',
    );
  }

  Widget _buildButton({
    required ThemeData theme,
    required IconData icon,
    required VoidCallback onPressed,
    required Color backgroundColor,
    required Color foregroundColor,
    required String tooltip,
  }) {
    return Tooltip(
      message: tooltip,
      child: Material(
        color: backgroundColor,
        shape: const CircleBorder(),
        child: InkWell(
          onTap: onPressed,
          customBorder: const CircleBorder(),
          child: Container(
            width: 48,
            height: 48,
            alignment: Alignment.center,
            child: Icon(
              icon,
              color: foregroundColor,
              size: 22,
            ),
          ),
        ),
      ),
    );
  }
}
