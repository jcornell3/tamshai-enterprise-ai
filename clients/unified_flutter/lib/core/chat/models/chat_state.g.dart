// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'chat_state.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_$ChatMessageImpl _$$ChatMessageImplFromJson(Map<String, dynamic> json) =>
    _$ChatMessageImpl(
      id: json['id'] as String,
      content: json['content'] as String,
      role: $enumDecode(_$MessageRoleEnumMap, json['role']),
      timestamp: DateTime.parse(json['timestamp'] as String),
      isStreaming: json['isStreaming'] as bool? ?? false,
      isTruncated: json['isTruncated'] as bool? ?? false,
      truncationWarning: json['truncationWarning'] as String?,
      pendingConfirmation: json['pendingConfirmation'] == null
          ? null
          : PendingConfirmation.fromJson(
              json['pendingConfirmation'] as Map<String, dynamic>),
      metadata: json['metadata'] as Map<String, dynamic>?,
    );

Map<String, dynamic> _$$ChatMessageImplToJson(_$ChatMessageImpl instance) =>
    <String, dynamic>{
      'id': instance.id,
      'content': instance.content,
      'role': _$MessageRoleEnumMap[instance.role]!,
      'timestamp': instance.timestamp.toIso8601String(),
      'isStreaming': instance.isStreaming,
      'isTruncated': instance.isTruncated,
      'truncationWarning': instance.truncationWarning,
      'pendingConfirmation': instance.pendingConfirmation,
      'metadata': instance.metadata,
    };

const _$MessageRoleEnumMap = {
  MessageRole.user: 'user',
  MessageRole.assistant: 'assistant',
  MessageRole.system: 'system',
};

_$PendingConfirmationImpl _$$PendingConfirmationImplFromJson(
        Map<String, dynamic> json) =>
    _$PendingConfirmationImpl(
      confirmationId: json['confirmationId'] as String,
      message: json['message'] as String,
      action: json['action'] as String,
      confirmationData: json['confirmationData'] as Map<String, dynamic>?,
      isExpired: json['isExpired'] as bool? ?? false,
    );

Map<String, dynamic> _$$PendingConfirmationImplToJson(
        _$PendingConfirmationImpl instance) =>
    <String, dynamic>{
      'confirmationId': instance.confirmationId,
      'message': instance.message,
      'action': instance.action,
      'confirmationData': instance.confirmationData,
      'isExpired': instance.isExpired,
    };

_$ChatStateImpl _$$ChatStateImplFromJson(Map<String, dynamic> json) =>
    _$ChatStateImpl(
      messages: (json['messages'] as List<dynamic>?)
              ?.map((e) => ChatMessage.fromJson(e as Map<String, dynamic>))
              .toList() ??
          const [],
      isLoading: json['isLoading'] as bool? ?? false,
      isStreaming: json['isStreaming'] as bool? ?? false,
      error: json['error'] as String?,
      currentStreamingMessageId: json['currentStreamingMessageId'] as String?,
    );

Map<String, dynamic> _$$ChatStateImplToJson(_$ChatStateImpl instance) =>
    <String, dynamic>{
      'messages': instance.messages,
      'isLoading': instance.isLoading,
      'isStreaming': instance.isStreaming,
      'error': instance.error,
      'currentStreamingMessageId': instance.currentStreamingMessageId,
    };

_$SSEChunkImpl _$$SSEChunkImplFromJson(Map<String, dynamic> json) =>
    _$SSEChunkImpl(
      type: $enumDecode(_$SSEEventTypeEnumMap, json['type']),
      text: json['text'] as String?,
      error: json['error'] as String?,
      metadata: json['metadata'] as Map<String, dynamic>?,
    );

Map<String, dynamic> _$$SSEChunkImplToJson(_$SSEChunkImpl instance) =>
    <String, dynamic>{
      'type': _$SSEEventTypeEnumMap[instance.type]!,
      'text': instance.text,
      'error': instance.error,
      'metadata': instance.metadata,
    };

const _$SSEEventTypeEnumMap = {
  SSEEventType.messageStart: 'messageStart',
  SSEEventType.contentBlockStart: 'contentBlockStart',
  SSEEventType.contentBlockDelta: 'contentBlockDelta',
  SSEEventType.contentBlockStop: 'contentBlockStop',
  SSEEventType.messageStop: 'messageStop',
  SSEEventType.pendingConfirmation: 'pendingConfirmation',
  SSEEventType.pagination: 'pagination',
  SSEEventType.error: 'error',
  SSEEventType.done: 'done',
};
