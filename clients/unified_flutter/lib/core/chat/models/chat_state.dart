import 'package:freezed_annotation/freezed_annotation.dart';

part 'chat_state.freezed.dart';
part 'chat_state.g.dart';

/// Chat message model
@freezed
sealed class ChatMessage with _$ChatMessage {
  const factory ChatMessage({
    required String id,
    required String content,
    required MessageRole role,
    required DateTime timestamp,
    @Default(false) bool isStreaming,
    @Default(false) bool isTruncated,
    String? truncationWarning,
    PendingConfirmation? pendingConfirmation,
    Map<String, dynamic>? metadata,
  }) = _ChatMessage;

  factory ChatMessage.fromJson(Map<String, dynamic> json) =>
      _$ChatMessageFromJson(json);
}

/// Message role (user or assistant)
enum MessageRole {
  @JsonValue('user')
  user,
  @JsonValue('assistant')
  assistant,
  @JsonValue('system')
  system,
}

/// Pending confirmation for write operations (v1.4 requirement)
@freezed
sealed class PendingConfirmation with _$PendingConfirmation {
  const factory PendingConfirmation({
    required String confirmationId,
    required String message,
    required String action,
    Map<String, dynamic>? confirmationData,
    @Default(false) bool isExpired,
  }) = _PendingConfirmation;

  factory PendingConfirmation.fromJson(Map<String, dynamic> json) =>
      _$PendingConfirmationFromJson(json);
}

/// Chat session state
@freezed
sealed class ChatState with _$ChatState {
  const factory ChatState({
    @Default([]) List<ChatMessage> messages,
    @Default(false) bool isLoading,
    @Default(false) bool isStreaming,
    String? error,
    String? currentStreamingMessageId,
  }) = _ChatState;

  factory ChatState.fromJson(Map<String, dynamic> json) =>
      _$ChatStateFromJson(json);
}

/// SSE event types from MCP Gateway
enum SSEEventType {
  messageStart,
  contentBlockStart,
  contentBlockDelta,
  contentBlockStop,
  messageStop,
  pendingConfirmation,  // v1.4: Human-in-the-loop confirmation required
  pagination,            // v1.4: More data available
  error,
  done,
}

/// SSE chunk data
@freezed
sealed class SSEChunk with _$SSEChunk {
  const factory SSEChunk({
    required SSEEventType type,
    String? text,
    String? error,
    Map<String, dynamic>? metadata,
  }) = _SSEChunk;

  factory SSEChunk.fromJson(Map<String, dynamic> json) =>
      _$SSEChunkFromJson(json);
}
