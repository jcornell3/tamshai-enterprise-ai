import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/speech/providers/speech_provider.dart';
import '../../../core/speech/models/speech_state.dart';

/// Chat input widget with send button, voice input, and keyboard handling
class ChatInput extends ConsumerStatefulWidget {
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
  ConsumerState<ChatInput> createState() => _ChatInputState();
}

class _ChatInputState extends ConsumerState<ChatInput>
    with SingleTickerProviderStateMixin {
  late AnimationController _pulseController;
  late Animation<double> _pulseAnimation;

  @override
  void initState() {
    super.initState();
    // Pulse animation for recording indicator
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1000),
    );
    _pulseAnimation = Tween<double>(begin: 1.0, end: 1.3).animate(
      CurvedAnimation(parent: _pulseController, curve: Curves.easeInOut),
    );
  }

  @override
  void dispose() {
    _pulseController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final speechState = ref.watch(speechProvider);

    // Control pulse animation based on listening state
    if (speechState.isListening && !_pulseController.isAnimating) {
      _pulseController.repeat(reverse: true);
    } else if (!speechState.isListening && _pulseController.isAnimating) {
      _pulseController.stop();
      _pulseController.reset();
    }

    // Update text field when transcription completes and auto-submit
    ref.listen<SpeechState>(speechProvider, (previous, next) {
      if (previous?.isListening == true &&
          next.isListening == false &&
          next.transcribedText.isNotEmpty) {
        // Set transcribed text as the query
        final transcribedText = next.transcribedText;
        widget.controller.text = transcribedText;
        widget.controller.selection = TextSelection.fromPosition(
          TextPosition(offset: widget.controller.text.length),
        );
        // Clear transcription
        ref.read(speechProvider.notifier).clearTranscription();

        // Auto-submit the voice query after a brief delay
        // (allows UI to update and user to see what was recognized)
        Future.delayed(const Duration(milliseconds: 200), () {
          if (widget.controller.text.isNotEmpty) {
            widget.onSend();
          }
        });
      }
    });

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
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Error message display
            if (speechState.hasError)
              _buildErrorBanner(theme, speechState.errorMessage!),

            // Recording indicator
            if (speechState.isListening)
              _buildRecordingIndicator(theme, speechState),

            Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                // Microphone button
                if (speechState.isAvailable) ...[
                  _buildMicrophoneButton(theme, speechState),
                  const SizedBox(width: 8),
                ],

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
                          widget.onSend();
                        }
                      },
                      child: TextField(
                        controller: widget.controller,
                        focusNode: widget.focusNode,
                        maxLines: null,
                        textInputAction: TextInputAction.newline,
                        enabled: !widget.isLoading && !speechState.isListening,
                        decoration: InputDecoration(
                          hintText: _getHintText(speechState),
                          border: InputBorder.none,
                          contentPadding: const EdgeInsets.symmetric(
                            horizontal: 20,
                            vertical: 12,
                          ),
                        ),
                        onSubmitted: (_) => widget.onSend(),
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                _buildActionButton(theme),
              ],
            ),
          ],
        ),
      ),
    );
  }

  String _getHintText(SpeechState speechState) {
    if (speechState.isListening) {
      return 'Listening...';
    } else if (speechState.isProcessing) {
      return 'Processing speech...';
    } else if (widget.isStreaming) {
      return 'AI is responding...';
    }
    return 'Type a message or hold mic to speak...';
  }

  Widget _buildErrorBanner(ThemeData theme, String message) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: theme.colorScheme.errorContainer,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        children: [
          Icon(
            Icons.error_outline,
            size: 16,
            color: theme.colorScheme.onErrorContainer,
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              message,
              style: TextStyle(
                color: theme.colorScheme.onErrorContainer,
                fontSize: 12,
              ),
            ),
          ),
          IconButton(
            icon: const Icon(Icons.close, size: 16),
            onPressed: () => ref.read(speechProvider.notifier).clearError(),
            padding: EdgeInsets.zero,
            constraints: const BoxConstraints(),
            color: theme.colorScheme.onErrorContainer,
          ),
        ],
      ),
    );
  }

  Widget _buildRecordingIndicator(ThemeData theme, SpeechState speechState) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      decoration: BoxDecoration(
        color: theme.colorScheme.primaryContainer,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Pulsing recording dot
          AnimatedBuilder(
            animation: _pulseAnimation,
            builder: (context, child) {
              return Transform.scale(
                scale: _pulseAnimation.value,
                child: Container(
                  width: 8,
                  height: 8,
                  decoration: BoxDecoration(
                    color: theme.colorScheme.error,
                    shape: BoxShape.circle,
                  ),
                ),
              );
            },
          ),
          const SizedBox(width: 8),

          // Sound level visualization
          SizedBox(
            width: 60,
            height: 16,
            child: CustomPaint(
              painter: _SoundLevelPainter(
                level: speechState.soundLevel,
                color: theme.colorScheme.onPrimaryContainer,
              ),
            ),
          ),
          const SizedBox(width: 8),

          Text(
            'Listening...',
            style: TextStyle(
              color: theme.colorScheme.onPrimaryContainer,
              fontSize: 12,
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(width: 8),

          // Cancel button
          GestureDetector(
            onTap: () => ref.read(speechProvider.notifier).cancelListening(),
            child: Icon(
              Icons.close,
              size: 16,
              color: theme.colorScheme.onPrimaryContainer,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildMicrophoneButton(ThemeData theme, SpeechState speechState) {
    final isListening = speechState.isListening;
    final isProcessing = speechState.isProcessing;

    if (isProcessing) {
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

    return GestureDetector(
      // Push-to-hold: start on long press, stop on release
      onLongPressStart: (_) {
        HapticFeedback.mediumImpact();
        ref.read(speechProvider.notifier).startListening();
      },
      onLongPressEnd: (_) {
        HapticFeedback.lightImpact();
        ref.read(speechProvider.notifier).stopListening();
      },
      // Alternative: tap to toggle
      onTap: () {
        if (isListening) {
          HapticFeedback.lightImpact();
          ref.read(speechProvider.notifier).stopListening();
        } else {
          HapticFeedback.mediumImpact();
          ref.read(speechProvider.notifier).startListening();
        }
      },
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        width: 48,
        height: 48,
        decoration: BoxDecoration(
          color: isListening
              ? theme.colorScheme.error
              : theme.colorScheme.surfaceContainerHighest,
          shape: BoxShape.circle,
          boxShadow: isListening
              ? [
                  BoxShadow(
                    color: theme.colorScheme.error.withOpacity(0.4),
                    blurRadius: 12,
                    spreadRadius: 2,
                  ),
                ]
              : null,
        ),
        child: Icon(
          isListening ? Icons.stop : Icons.mic,
          color: isListening
              ? theme.colorScheme.onError
              : theme.colorScheme.onSurfaceVariant,
          size: 22,
        ),
      ),
    );
  }

  Widget _buildActionButton(ThemeData theme) {
    if (widget.isStreaming) {
      return _buildButton(
        theme: theme,
        icon: Icons.stop,
        onPressed: widget.onCancel,
        backgroundColor: theme.colorScheme.error,
        foregroundColor: theme.colorScheme.onError,
        tooltip: 'Stop generating',
      );
    }

    if (widget.isLoading) {
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
      onPressed: widget.onSend,
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

/// Custom painter for sound level visualization
class _SoundLevelPainter extends CustomPainter {
  final double level;
  final Color color;

  _SoundLevelPainter({required this.level, required this.color});

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color.withOpacity(0.3)
      ..style = PaintingStyle.fill;

    final activePaint = Paint()
      ..color = color
      ..style = PaintingStyle.fill;

    const barCount = 5;
    final barWidth = (size.width - (barCount - 1) * 3) / barCount;
    final activeCount = (level * barCount).ceil();

    for (var i = 0; i < barCount; i++) {
      final barHeight = size.height * (0.3 + 0.7 * (i + 1) / barCount);
      final x = i * (barWidth + 3);
      final y = (size.height - barHeight) / 2;

      final rect = RRect.fromRectAndRadius(
        Rect.fromLTWH(x, y, barWidth, barHeight),
        const Radius.circular(2),
      );

      canvas.drawRRect(
        rect,
        i < activeCount ? activePaint : paint,
      );
    }
  }

  @override
  bool shouldRepaint(covariant _SoundLevelPainter oldDelegate) {
    return oldDelegate.level != level || oldDelegate.color != color;
  }
}
