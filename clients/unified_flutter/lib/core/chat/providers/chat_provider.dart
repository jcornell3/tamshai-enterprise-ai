import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:logger/logger.dart';
import 'package:uuid/uuid.dart';
import '../../api/token_interceptor.dart';
import '../../auth/providers/auth_provider.dart';
import '../models/chat_state.dart';
import '../services/chat_service.dart';

/// Chat service provider
final chatServiceProvider = Provider<ChatService>((ref) {
  return ChatService(
    dio: ref.watch(dioProvider),
    logger: ref.watch(loggerProvider),
  );
});

/// Chat state provider (Riverpod 3.x NotifierProvider)
final chatNotifierProvider = NotifierProvider<ChatNotifier, ChatState>(() {
  return ChatNotifier();
});

/// Chat state notifier (Riverpod 3.x Notifier pattern)
class ChatNotifier extends Notifier<ChatState> {
  late final ChatService _chatService;
  late final Logger _logger;
  final Uuid _uuid = const Uuid();

  StreamSubscription<SSEChunk>? _currentStream;

  @override
  ChatState build() {
    _chatService = ref.watch(chatServiceProvider);
    _logger = ref.watch(loggerProvider);

    // Cleanup on dispose
    ref.onDispose(() {
      _currentStream?.cancel();
    });

    return const ChatState();
  }

  /// Send a message and stream the response
  Future<void> sendMessage(String content) async {
    if (content.trim().isEmpty) return;
    if (state.isLoading || state.isStreaming) return;

    // Add user message
    final userMessage = ChatMessage(
      id: _uuid.v4(),
      content: content,
      role: MessageRole.user,
      timestamp: DateTime.now(),
    );

    state = state.copyWith(
      messages: [...state.messages, userMessage],
      isLoading: true,
      error: null,
    );

    // Create placeholder for assistant response
    final assistantMessageId = _uuid.v4();
    final assistantMessage = ChatMessage(
      id: assistantMessageId,
      content: '',
      role: MessageRole.assistant,
      timestamp: DateTime.now(),
      isStreaming: true,
    );

    state = state.copyWith(
      messages: [...state.messages, assistantMessage],
      isLoading: false,
      isStreaming: true,
      currentStreamingMessageId: assistantMessageId,
    );

    // Start streaming response
    try {
      _currentStream = _chatService.sendQuery(content).listen(
        (chunk) => _handleSSEChunk(chunk, assistantMessageId),
        onError: (error) {
          _logger.e('Stream error', error: error);
          _updateMessage(assistantMessageId, (msg) => msg.copyWith(
            isStreaming: false,
            content: msg.content.isEmpty
                ? 'Error: $error'
                : msg.content,
          ));
          state = state.copyWith(
            isStreaming: false,
            currentStreamingMessageId: null,
            error: error.toString(),
          );
        },
        onDone: () {
          _updateMessage(assistantMessageId, (msg) => msg.copyWith(
            isStreaming: false,
          ));
          state = state.copyWith(
            isStreaming: false,
            currentStreamingMessageId: null,
          );
        },
      );
    } catch (e, stackTrace) {
      _logger.e('Failed to start stream', error: e, stackTrace: stackTrace);
      _updateMessage(assistantMessageId, (msg) => msg.copyWith(
        isStreaming: false,
        content: 'Failed to connect: $e',
      ));
      state = state.copyWith(
        isStreaming: false,
        currentStreamingMessageId: null,
        error: e.toString(),
      );
    }
  }

  /// Handle incoming SSE chunk
  void _handleSSEChunk(SSEChunk chunk, String messageId) {
    switch (chunk.type) {
      case SSEEventType.contentBlockDelta:
        if (chunk.text != null) {
          _updateMessage(messageId, (msg) => msg.copyWith(
            content: msg.content + chunk.text!,
          ));
        }

        // Check for truncation warning
        if (chunk.metadata?['truncated'] == true) {
          _updateMessage(messageId, (msg) => msg.copyWith(
            isTruncated: true,
            truncationWarning: chunk.text,
          ));
        }

        // Check for pending confirmation
        if (chunk.metadata?['pending_confirmation'] != null) {
          final confirmation = chunk.metadata!['pending_confirmation'] as Map<String, dynamic>;
          _updateMessage(messageId, (msg) => msg.copyWith(
            pendingConfirmation: PendingConfirmation(
              confirmationId: confirmation['confirmationId'] as String,
              message: confirmation['message'] as String,
              action: confirmation['action'] as String? ?? 'unknown',
              confirmationData: confirmation['confirmationData'] as Map<String, dynamic>?,
            ),
          ));
        }
        break;

      case SSEEventType.error:
        _updateMessage(messageId, (msg) => msg.copyWith(
          content: msg.content.isEmpty
              ? 'Error: ${chunk.error}'
              : '${msg.content}\n\nError: ${chunk.error}',
          isStreaming: false,
        ));
        state = state.copyWith(
          isStreaming: false,
          currentStreamingMessageId: null,
          error: chunk.error,
        );
        break;

      case SSEEventType.done:
      case SSEEventType.messageStop:
        _updateMessage(messageId, (msg) => msg.copyWith(
          isStreaming: false,
        ));
        state = state.copyWith(
          isStreaming: false,
          currentStreamingMessageId: null,
        );
        break;

      default:
        // Ignore other event types
        break;
    }
  }

  /// Update a specific message in the list
  void _updateMessage(String messageId, ChatMessage Function(ChatMessage) update) {
    final messages = state.messages.map((msg) {
      if (msg.id == messageId) {
        return update(msg);
      }
      return msg;
    }).toList();

    state = state.copyWith(messages: messages);
  }

  /// Confirm a pending action
  Future<void> confirmAction(String messageId, String confirmationId, {required bool approved}) async {
    try {
      _logger.i('Confirming action: $confirmationId, approved: $approved');

      final result = await _chatService.confirmAction(confirmationId, approved: approved);

      // Update the message to show confirmation result
      _updateMessage(messageId, (msg) {
        final confirmation = msg.pendingConfirmation;
        if (confirmation == null) return msg;

        final resultText = approved
            ? '\n\n✅ Action confirmed: ${result['status'] ?? 'Success'}'
            : '\n\n❌ Action cancelled';

        return msg.copyWith(
          content: msg.content + resultText,
          pendingConfirmation: null,
        );
      });
    } catch (e, stackTrace) {
      _logger.e('Failed to confirm action', error: e, stackTrace: stackTrace);

      _updateMessage(messageId, (msg) => msg.copyWith(
        content: '${msg.content}\n\n⚠️ Confirmation failed: $e',
        pendingConfirmation: msg.pendingConfirmation?.copyWith(isExpired: true),
      ));
    }
  }

  /// Cancel the current streaming response
  void cancelStream() {
    _currentStream?.cancel();
    _currentStream = null;

    if (state.currentStreamingMessageId != null) {
      _updateMessage(state.currentStreamingMessageId!, (msg) => msg.copyWith(
        isStreaming: false,
        content: msg.content.isEmpty ? 'Cancelled' : '${msg.content}\n\n[Cancelled]',
      ));
    }

    state = state.copyWith(
      isStreaming: false,
      currentStreamingMessageId: null,
    );
  }

  /// Clear chat history
  void clearChat() {
    cancelStream();
    state = const ChatState();
  }
}
