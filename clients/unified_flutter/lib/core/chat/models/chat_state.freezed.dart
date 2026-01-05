// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'chat_state.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

final _privateConstructorUsedError = UnsupportedError(
    'It seems like you constructed your class using `MyClass._()`. This constructor is only meant to be used by freezed and you are not supposed to need it nor use it.\nPlease check the documentation here for more information: https://github.com/rrousselGit/freezed#adding-getters-and-methods-to-our-models');

ChatMessage _$ChatMessageFromJson(Map<String, dynamic> json) {
  return _ChatMessage.fromJson(json);
}

/// @nodoc
mixin _$ChatMessage {
  String get id => throw _privateConstructorUsedError;
  String get content => throw _privateConstructorUsedError;
  MessageRole get role => throw _privateConstructorUsedError;
  DateTime get timestamp => throw _privateConstructorUsedError;
  bool get isStreaming => throw _privateConstructorUsedError;
  bool get isTruncated => throw _privateConstructorUsedError;
  String? get truncationWarning => throw _privateConstructorUsedError;
  PendingConfirmation? get pendingConfirmation =>
      throw _privateConstructorUsedError;
  Map<String, dynamic>? get metadata => throw _privateConstructorUsedError;

  /// Serializes this ChatMessage to a JSON map.
  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;

  /// Create a copy of ChatMessage
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  $ChatMessageCopyWith<ChatMessage> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $ChatMessageCopyWith<$Res> {
  factory $ChatMessageCopyWith(
          ChatMessage value, $Res Function(ChatMessage) then) =
      _$ChatMessageCopyWithImpl<$Res, ChatMessage>;
  @useResult
  $Res call(
      {String id,
      String content,
      MessageRole role,
      DateTime timestamp,
      bool isStreaming,
      bool isTruncated,
      String? truncationWarning,
      PendingConfirmation? pendingConfirmation,
      Map<String, dynamic>? metadata});

  $PendingConfirmationCopyWith<$Res>? get pendingConfirmation;
}

/// @nodoc
class _$ChatMessageCopyWithImpl<$Res, $Val extends ChatMessage>
    implements $ChatMessageCopyWith<$Res> {
  _$ChatMessageCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  /// Create a copy of ChatMessage
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? content = null,
    Object? role = null,
    Object? timestamp = null,
    Object? isStreaming = null,
    Object? isTruncated = null,
    Object? truncationWarning = freezed,
    Object? pendingConfirmation = freezed,
    Object? metadata = freezed,
  }) {
    return _then(_value.copyWith(
      id: null == id
          ? _value.id
          : id // ignore: cast_nullable_to_non_nullable
              as String,
      content: null == content
          ? _value.content
          : content // ignore: cast_nullable_to_non_nullable
              as String,
      role: null == role
          ? _value.role
          : role // ignore: cast_nullable_to_non_nullable
              as MessageRole,
      timestamp: null == timestamp
          ? _value.timestamp
          : timestamp // ignore: cast_nullable_to_non_nullable
              as DateTime,
      isStreaming: null == isStreaming
          ? _value.isStreaming
          : isStreaming // ignore: cast_nullable_to_non_nullable
              as bool,
      isTruncated: null == isTruncated
          ? _value.isTruncated
          : isTruncated // ignore: cast_nullable_to_non_nullable
              as bool,
      truncationWarning: freezed == truncationWarning
          ? _value.truncationWarning
          : truncationWarning // ignore: cast_nullable_to_non_nullable
              as String?,
      pendingConfirmation: freezed == pendingConfirmation
          ? _value.pendingConfirmation
          : pendingConfirmation // ignore: cast_nullable_to_non_nullable
              as PendingConfirmation?,
      metadata: freezed == metadata
          ? _value.metadata
          : metadata // ignore: cast_nullable_to_non_nullable
              as Map<String, dynamic>?,
    ) as $Val);
  }

  /// Create a copy of ChatMessage
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $PendingConfirmationCopyWith<$Res>? get pendingConfirmation {
    if (_value.pendingConfirmation == null) {
      return null;
    }

    return $PendingConfirmationCopyWith<$Res>(_value.pendingConfirmation!,
        (value) {
      return _then(_value.copyWith(pendingConfirmation: value) as $Val);
    });
  }
}

/// @nodoc
abstract class _$$ChatMessageImplCopyWith<$Res>
    implements $ChatMessageCopyWith<$Res> {
  factory _$$ChatMessageImplCopyWith(
          _$ChatMessageImpl value, $Res Function(_$ChatMessageImpl) then) =
      __$$ChatMessageImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call(
      {String id,
      String content,
      MessageRole role,
      DateTime timestamp,
      bool isStreaming,
      bool isTruncated,
      String? truncationWarning,
      PendingConfirmation? pendingConfirmation,
      Map<String, dynamic>? metadata});

  @override
  $PendingConfirmationCopyWith<$Res>? get pendingConfirmation;
}

/// @nodoc
class __$$ChatMessageImplCopyWithImpl<$Res>
    extends _$ChatMessageCopyWithImpl<$Res, _$ChatMessageImpl>
    implements _$$ChatMessageImplCopyWith<$Res> {
  __$$ChatMessageImplCopyWithImpl(
      _$ChatMessageImpl _value, $Res Function(_$ChatMessageImpl) _then)
      : super(_value, _then);

  /// Create a copy of ChatMessage
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? content = null,
    Object? role = null,
    Object? timestamp = null,
    Object? isStreaming = null,
    Object? isTruncated = null,
    Object? truncationWarning = freezed,
    Object? pendingConfirmation = freezed,
    Object? metadata = freezed,
  }) {
    return _then(_$ChatMessageImpl(
      id: null == id
          ? _value.id
          : id // ignore: cast_nullable_to_non_nullable
              as String,
      content: null == content
          ? _value.content
          : content // ignore: cast_nullable_to_non_nullable
              as String,
      role: null == role
          ? _value.role
          : role // ignore: cast_nullable_to_non_nullable
              as MessageRole,
      timestamp: null == timestamp
          ? _value.timestamp
          : timestamp // ignore: cast_nullable_to_non_nullable
              as DateTime,
      isStreaming: null == isStreaming
          ? _value.isStreaming
          : isStreaming // ignore: cast_nullable_to_non_nullable
              as bool,
      isTruncated: null == isTruncated
          ? _value.isTruncated
          : isTruncated // ignore: cast_nullable_to_non_nullable
              as bool,
      truncationWarning: freezed == truncationWarning
          ? _value.truncationWarning
          : truncationWarning // ignore: cast_nullable_to_non_nullable
              as String?,
      pendingConfirmation: freezed == pendingConfirmation
          ? _value.pendingConfirmation
          : pendingConfirmation // ignore: cast_nullable_to_non_nullable
              as PendingConfirmation?,
      metadata: freezed == metadata
          ? _value._metadata
          : metadata // ignore: cast_nullable_to_non_nullable
              as Map<String, dynamic>?,
    ));
  }
}

/// @nodoc
@JsonSerializable()
class _$ChatMessageImpl implements _ChatMessage {
  const _$ChatMessageImpl(
      {required this.id,
      required this.content,
      required this.role,
      required this.timestamp,
      this.isStreaming = false,
      this.isTruncated = false,
      this.truncationWarning,
      this.pendingConfirmation,
      final Map<String, dynamic>? metadata})
      : _metadata = metadata;

  factory _$ChatMessageImpl.fromJson(Map<String, dynamic> json) =>
      _$$ChatMessageImplFromJson(json);

  @override
  final String id;
  @override
  final String content;
  @override
  final MessageRole role;
  @override
  final DateTime timestamp;
  @override
  @JsonKey()
  final bool isStreaming;
  @override
  @JsonKey()
  final bool isTruncated;
  @override
  final String? truncationWarning;
  @override
  final PendingConfirmation? pendingConfirmation;
  final Map<String, dynamic>? _metadata;
  @override
  Map<String, dynamic>? get metadata {
    final value = _metadata;
    if (value == null) return null;
    if (_metadata is EqualUnmodifiableMapView) return _metadata;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableMapView(value);
  }

  @override
  String toString() {
    return 'ChatMessage(id: $id, content: $content, role: $role, timestamp: $timestamp, isStreaming: $isStreaming, isTruncated: $isTruncated, truncationWarning: $truncationWarning, pendingConfirmation: $pendingConfirmation, metadata: $metadata)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$ChatMessageImpl &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.content, content) || other.content == content) &&
            (identical(other.role, role) || other.role == role) &&
            (identical(other.timestamp, timestamp) ||
                other.timestamp == timestamp) &&
            (identical(other.isStreaming, isStreaming) ||
                other.isStreaming == isStreaming) &&
            (identical(other.isTruncated, isTruncated) ||
                other.isTruncated == isTruncated) &&
            (identical(other.truncationWarning, truncationWarning) ||
                other.truncationWarning == truncationWarning) &&
            (identical(other.pendingConfirmation, pendingConfirmation) ||
                other.pendingConfirmation == pendingConfirmation) &&
            const DeepCollectionEquality().equals(other._metadata, _metadata));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
      runtimeType,
      id,
      content,
      role,
      timestamp,
      isStreaming,
      isTruncated,
      truncationWarning,
      pendingConfirmation,
      const DeepCollectionEquality().hash(_metadata));

  /// Create a copy of ChatMessage
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  @pragma('vm:prefer-inline')
  _$$ChatMessageImplCopyWith<_$ChatMessageImpl> get copyWith =>
      __$$ChatMessageImplCopyWithImpl<_$ChatMessageImpl>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$ChatMessageImplToJson(
      this,
    );
  }
}

abstract class _ChatMessage implements ChatMessage {
  const factory _ChatMessage(
      {required final String id,
      required final String content,
      required final MessageRole role,
      required final DateTime timestamp,
      final bool isStreaming,
      final bool isTruncated,
      final String? truncationWarning,
      final PendingConfirmation? pendingConfirmation,
      final Map<String, dynamic>? metadata}) = _$ChatMessageImpl;

  factory _ChatMessage.fromJson(Map<String, dynamic> json) =
      _$ChatMessageImpl.fromJson;

  @override
  String get id;
  @override
  String get content;
  @override
  MessageRole get role;
  @override
  DateTime get timestamp;
  @override
  bool get isStreaming;
  @override
  bool get isTruncated;
  @override
  String? get truncationWarning;
  @override
  PendingConfirmation? get pendingConfirmation;
  @override
  Map<String, dynamic>? get metadata;

  /// Create a copy of ChatMessage
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  _$$ChatMessageImplCopyWith<_$ChatMessageImpl> get copyWith =>
      throw _privateConstructorUsedError;
}

PendingConfirmation _$PendingConfirmationFromJson(Map<String, dynamic> json) {
  return _PendingConfirmation.fromJson(json);
}

/// @nodoc
mixin _$PendingConfirmation {
  String get confirmationId => throw _privateConstructorUsedError;
  String get message => throw _privateConstructorUsedError;
  String get action => throw _privateConstructorUsedError;
  Map<String, dynamic>? get confirmationData =>
      throw _privateConstructorUsedError;
  bool get isExpired => throw _privateConstructorUsedError;

  /// Serializes this PendingConfirmation to a JSON map.
  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;

  /// Create a copy of PendingConfirmation
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  $PendingConfirmationCopyWith<PendingConfirmation> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $PendingConfirmationCopyWith<$Res> {
  factory $PendingConfirmationCopyWith(
          PendingConfirmation value, $Res Function(PendingConfirmation) then) =
      _$PendingConfirmationCopyWithImpl<$Res, PendingConfirmation>;
  @useResult
  $Res call(
      {String confirmationId,
      String message,
      String action,
      Map<String, dynamic>? confirmationData,
      bool isExpired});
}

/// @nodoc
class _$PendingConfirmationCopyWithImpl<$Res, $Val extends PendingConfirmation>
    implements $PendingConfirmationCopyWith<$Res> {
  _$PendingConfirmationCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  /// Create a copy of PendingConfirmation
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? confirmationId = null,
    Object? message = null,
    Object? action = null,
    Object? confirmationData = freezed,
    Object? isExpired = null,
  }) {
    return _then(_value.copyWith(
      confirmationId: null == confirmationId
          ? _value.confirmationId
          : confirmationId // ignore: cast_nullable_to_non_nullable
              as String,
      message: null == message
          ? _value.message
          : message // ignore: cast_nullable_to_non_nullable
              as String,
      action: null == action
          ? _value.action
          : action // ignore: cast_nullable_to_non_nullable
              as String,
      confirmationData: freezed == confirmationData
          ? _value.confirmationData
          : confirmationData // ignore: cast_nullable_to_non_nullable
              as Map<String, dynamic>?,
      isExpired: null == isExpired
          ? _value.isExpired
          : isExpired // ignore: cast_nullable_to_non_nullable
              as bool,
    ) as $Val);
  }
}

/// @nodoc
abstract class _$$PendingConfirmationImplCopyWith<$Res>
    implements $PendingConfirmationCopyWith<$Res> {
  factory _$$PendingConfirmationImplCopyWith(_$PendingConfirmationImpl value,
          $Res Function(_$PendingConfirmationImpl) then) =
      __$$PendingConfirmationImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call(
      {String confirmationId,
      String message,
      String action,
      Map<String, dynamic>? confirmationData,
      bool isExpired});
}

/// @nodoc
class __$$PendingConfirmationImplCopyWithImpl<$Res>
    extends _$PendingConfirmationCopyWithImpl<$Res, _$PendingConfirmationImpl>
    implements _$$PendingConfirmationImplCopyWith<$Res> {
  __$$PendingConfirmationImplCopyWithImpl(_$PendingConfirmationImpl _value,
      $Res Function(_$PendingConfirmationImpl) _then)
      : super(_value, _then);

  /// Create a copy of PendingConfirmation
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? confirmationId = null,
    Object? message = null,
    Object? action = null,
    Object? confirmationData = freezed,
    Object? isExpired = null,
  }) {
    return _then(_$PendingConfirmationImpl(
      confirmationId: null == confirmationId
          ? _value.confirmationId
          : confirmationId // ignore: cast_nullable_to_non_nullable
              as String,
      message: null == message
          ? _value.message
          : message // ignore: cast_nullable_to_non_nullable
              as String,
      action: null == action
          ? _value.action
          : action // ignore: cast_nullable_to_non_nullable
              as String,
      confirmationData: freezed == confirmationData
          ? _value._confirmationData
          : confirmationData // ignore: cast_nullable_to_non_nullable
              as Map<String, dynamic>?,
      isExpired: null == isExpired
          ? _value.isExpired
          : isExpired // ignore: cast_nullable_to_non_nullable
              as bool,
    ));
  }
}

/// @nodoc
@JsonSerializable()
class _$PendingConfirmationImpl implements _PendingConfirmation {
  const _$PendingConfirmationImpl(
      {required this.confirmationId,
      required this.message,
      required this.action,
      final Map<String, dynamic>? confirmationData,
      this.isExpired = false})
      : _confirmationData = confirmationData;

  factory _$PendingConfirmationImpl.fromJson(Map<String, dynamic> json) =>
      _$$PendingConfirmationImplFromJson(json);

  @override
  final String confirmationId;
  @override
  final String message;
  @override
  final String action;
  final Map<String, dynamic>? _confirmationData;
  @override
  Map<String, dynamic>? get confirmationData {
    final value = _confirmationData;
    if (value == null) return null;
    if (_confirmationData is EqualUnmodifiableMapView) return _confirmationData;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableMapView(value);
  }

  @override
  @JsonKey()
  final bool isExpired;

  @override
  String toString() {
    return 'PendingConfirmation(confirmationId: $confirmationId, message: $message, action: $action, confirmationData: $confirmationData, isExpired: $isExpired)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$PendingConfirmationImpl &&
            (identical(other.confirmationId, confirmationId) ||
                other.confirmationId == confirmationId) &&
            (identical(other.message, message) || other.message == message) &&
            (identical(other.action, action) || other.action == action) &&
            const DeepCollectionEquality()
                .equals(other._confirmationData, _confirmationData) &&
            (identical(other.isExpired, isExpired) ||
                other.isExpired == isExpired));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(runtimeType, confirmationId, message, action,
      const DeepCollectionEquality().hash(_confirmationData), isExpired);

  /// Create a copy of PendingConfirmation
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  @pragma('vm:prefer-inline')
  _$$PendingConfirmationImplCopyWith<_$PendingConfirmationImpl> get copyWith =>
      __$$PendingConfirmationImplCopyWithImpl<_$PendingConfirmationImpl>(
          this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$PendingConfirmationImplToJson(
      this,
    );
  }
}

abstract class _PendingConfirmation implements PendingConfirmation {
  const factory _PendingConfirmation(
      {required final String confirmationId,
      required final String message,
      required final String action,
      final Map<String, dynamic>? confirmationData,
      final bool isExpired}) = _$PendingConfirmationImpl;

  factory _PendingConfirmation.fromJson(Map<String, dynamic> json) =
      _$PendingConfirmationImpl.fromJson;

  @override
  String get confirmationId;
  @override
  String get message;
  @override
  String get action;
  @override
  Map<String, dynamic>? get confirmationData;
  @override
  bool get isExpired;

  /// Create a copy of PendingConfirmation
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  _$$PendingConfirmationImplCopyWith<_$PendingConfirmationImpl> get copyWith =>
      throw _privateConstructorUsedError;
}

ChatState _$ChatStateFromJson(Map<String, dynamic> json) {
  return _ChatState.fromJson(json);
}

/// @nodoc
mixin _$ChatState {
  List<ChatMessage> get messages => throw _privateConstructorUsedError;
  bool get isLoading => throw _privateConstructorUsedError;
  bool get isStreaming => throw _privateConstructorUsedError;
  String? get error => throw _privateConstructorUsedError;
  String? get currentStreamingMessageId => throw _privateConstructorUsedError;

  /// Serializes this ChatState to a JSON map.
  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;

  /// Create a copy of ChatState
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  $ChatStateCopyWith<ChatState> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $ChatStateCopyWith<$Res> {
  factory $ChatStateCopyWith(ChatState value, $Res Function(ChatState) then) =
      _$ChatStateCopyWithImpl<$Res, ChatState>;
  @useResult
  $Res call(
      {List<ChatMessage> messages,
      bool isLoading,
      bool isStreaming,
      String? error,
      String? currentStreamingMessageId});
}

/// @nodoc
class _$ChatStateCopyWithImpl<$Res, $Val extends ChatState>
    implements $ChatStateCopyWith<$Res> {
  _$ChatStateCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  /// Create a copy of ChatState
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? messages = null,
    Object? isLoading = null,
    Object? isStreaming = null,
    Object? error = freezed,
    Object? currentStreamingMessageId = freezed,
  }) {
    return _then(_value.copyWith(
      messages: null == messages
          ? _value.messages
          : messages // ignore: cast_nullable_to_non_nullable
              as List<ChatMessage>,
      isLoading: null == isLoading
          ? _value.isLoading
          : isLoading // ignore: cast_nullable_to_non_nullable
              as bool,
      isStreaming: null == isStreaming
          ? _value.isStreaming
          : isStreaming // ignore: cast_nullable_to_non_nullable
              as bool,
      error: freezed == error
          ? _value.error
          : error // ignore: cast_nullable_to_non_nullable
              as String?,
      currentStreamingMessageId: freezed == currentStreamingMessageId
          ? _value.currentStreamingMessageId
          : currentStreamingMessageId // ignore: cast_nullable_to_non_nullable
              as String?,
    ) as $Val);
  }
}

/// @nodoc
abstract class _$$ChatStateImplCopyWith<$Res>
    implements $ChatStateCopyWith<$Res> {
  factory _$$ChatStateImplCopyWith(
          _$ChatStateImpl value, $Res Function(_$ChatStateImpl) then) =
      __$$ChatStateImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call(
      {List<ChatMessage> messages,
      bool isLoading,
      bool isStreaming,
      String? error,
      String? currentStreamingMessageId});
}

/// @nodoc
class __$$ChatStateImplCopyWithImpl<$Res>
    extends _$ChatStateCopyWithImpl<$Res, _$ChatStateImpl>
    implements _$$ChatStateImplCopyWith<$Res> {
  __$$ChatStateImplCopyWithImpl(
      _$ChatStateImpl _value, $Res Function(_$ChatStateImpl) _then)
      : super(_value, _then);

  /// Create a copy of ChatState
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? messages = null,
    Object? isLoading = null,
    Object? isStreaming = null,
    Object? error = freezed,
    Object? currentStreamingMessageId = freezed,
  }) {
    return _then(_$ChatStateImpl(
      messages: null == messages
          ? _value._messages
          : messages // ignore: cast_nullable_to_non_nullable
              as List<ChatMessage>,
      isLoading: null == isLoading
          ? _value.isLoading
          : isLoading // ignore: cast_nullable_to_non_nullable
              as bool,
      isStreaming: null == isStreaming
          ? _value.isStreaming
          : isStreaming // ignore: cast_nullable_to_non_nullable
              as bool,
      error: freezed == error
          ? _value.error
          : error // ignore: cast_nullable_to_non_nullable
              as String?,
      currentStreamingMessageId: freezed == currentStreamingMessageId
          ? _value.currentStreamingMessageId
          : currentStreamingMessageId // ignore: cast_nullable_to_non_nullable
              as String?,
    ));
  }
}

/// @nodoc
@JsonSerializable()
class _$ChatStateImpl implements _ChatState {
  const _$ChatStateImpl(
      {final List<ChatMessage> messages = const [],
      this.isLoading = false,
      this.isStreaming = false,
      this.error,
      this.currentStreamingMessageId})
      : _messages = messages;

  factory _$ChatStateImpl.fromJson(Map<String, dynamic> json) =>
      _$$ChatStateImplFromJson(json);

  final List<ChatMessage> _messages;
  @override
  @JsonKey()
  List<ChatMessage> get messages {
    if (_messages is EqualUnmodifiableListView) return _messages;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableListView(_messages);
  }

  @override
  @JsonKey()
  final bool isLoading;
  @override
  @JsonKey()
  final bool isStreaming;
  @override
  final String? error;
  @override
  final String? currentStreamingMessageId;

  @override
  String toString() {
    return 'ChatState(messages: $messages, isLoading: $isLoading, isStreaming: $isStreaming, error: $error, currentStreamingMessageId: $currentStreamingMessageId)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$ChatStateImpl &&
            const DeepCollectionEquality().equals(other._messages, _messages) &&
            (identical(other.isLoading, isLoading) ||
                other.isLoading == isLoading) &&
            (identical(other.isStreaming, isStreaming) ||
                other.isStreaming == isStreaming) &&
            (identical(other.error, error) || other.error == error) &&
            (identical(other.currentStreamingMessageId,
                    currentStreamingMessageId) ||
                other.currentStreamingMessageId == currentStreamingMessageId));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
      runtimeType,
      const DeepCollectionEquality().hash(_messages),
      isLoading,
      isStreaming,
      error,
      currentStreamingMessageId);

  /// Create a copy of ChatState
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  @pragma('vm:prefer-inline')
  _$$ChatStateImplCopyWith<_$ChatStateImpl> get copyWith =>
      __$$ChatStateImplCopyWithImpl<_$ChatStateImpl>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$ChatStateImplToJson(
      this,
    );
  }
}

abstract class _ChatState implements ChatState {
  const factory _ChatState(
      {final List<ChatMessage> messages,
      final bool isLoading,
      final bool isStreaming,
      final String? error,
      final String? currentStreamingMessageId}) = _$ChatStateImpl;

  factory _ChatState.fromJson(Map<String, dynamic> json) =
      _$ChatStateImpl.fromJson;

  @override
  List<ChatMessage> get messages;
  @override
  bool get isLoading;
  @override
  bool get isStreaming;
  @override
  String? get error;
  @override
  String? get currentStreamingMessageId;

  /// Create a copy of ChatState
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  _$$ChatStateImplCopyWith<_$ChatStateImpl> get copyWith =>
      throw _privateConstructorUsedError;
}

SSEChunk _$SSEChunkFromJson(Map<String, dynamic> json) {
  return _SSEChunk.fromJson(json);
}

/// @nodoc
mixin _$SSEChunk {
  SSEEventType get type => throw _privateConstructorUsedError;
  String? get text => throw _privateConstructorUsedError;
  String? get error => throw _privateConstructorUsedError;
  Map<String, dynamic>? get metadata => throw _privateConstructorUsedError;

  /// Serializes this SSEChunk to a JSON map.
  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;

  /// Create a copy of SSEChunk
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  $SSEChunkCopyWith<SSEChunk> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $SSEChunkCopyWith<$Res> {
  factory $SSEChunkCopyWith(SSEChunk value, $Res Function(SSEChunk) then) =
      _$SSEChunkCopyWithImpl<$Res, SSEChunk>;
  @useResult
  $Res call(
      {SSEEventType type,
      String? text,
      String? error,
      Map<String, dynamic>? metadata});
}

/// @nodoc
class _$SSEChunkCopyWithImpl<$Res, $Val extends SSEChunk>
    implements $SSEChunkCopyWith<$Res> {
  _$SSEChunkCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  /// Create a copy of SSEChunk
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? type = null,
    Object? text = freezed,
    Object? error = freezed,
    Object? metadata = freezed,
  }) {
    return _then(_value.copyWith(
      type: null == type
          ? _value.type
          : type // ignore: cast_nullable_to_non_nullable
              as SSEEventType,
      text: freezed == text
          ? _value.text
          : text // ignore: cast_nullable_to_non_nullable
              as String?,
      error: freezed == error
          ? _value.error
          : error // ignore: cast_nullable_to_non_nullable
              as String?,
      metadata: freezed == metadata
          ? _value.metadata
          : metadata // ignore: cast_nullable_to_non_nullable
              as Map<String, dynamic>?,
    ) as $Val);
  }
}

/// @nodoc
abstract class _$$SSEChunkImplCopyWith<$Res>
    implements $SSEChunkCopyWith<$Res> {
  factory _$$SSEChunkImplCopyWith(
          _$SSEChunkImpl value, $Res Function(_$SSEChunkImpl) then) =
      __$$SSEChunkImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call(
      {SSEEventType type,
      String? text,
      String? error,
      Map<String, dynamic>? metadata});
}

/// @nodoc
class __$$SSEChunkImplCopyWithImpl<$Res>
    extends _$SSEChunkCopyWithImpl<$Res, _$SSEChunkImpl>
    implements _$$SSEChunkImplCopyWith<$Res> {
  __$$SSEChunkImplCopyWithImpl(
      _$SSEChunkImpl _value, $Res Function(_$SSEChunkImpl) _then)
      : super(_value, _then);

  /// Create a copy of SSEChunk
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? type = null,
    Object? text = freezed,
    Object? error = freezed,
    Object? metadata = freezed,
  }) {
    return _then(_$SSEChunkImpl(
      type: null == type
          ? _value.type
          : type // ignore: cast_nullable_to_non_nullable
              as SSEEventType,
      text: freezed == text
          ? _value.text
          : text // ignore: cast_nullable_to_non_nullable
              as String?,
      error: freezed == error
          ? _value.error
          : error // ignore: cast_nullable_to_non_nullable
              as String?,
      metadata: freezed == metadata
          ? _value._metadata
          : metadata // ignore: cast_nullable_to_non_nullable
              as Map<String, dynamic>?,
    ));
  }
}

/// @nodoc
@JsonSerializable()
class _$SSEChunkImpl implements _SSEChunk {
  const _$SSEChunkImpl(
      {required this.type,
      this.text,
      this.error,
      final Map<String, dynamic>? metadata})
      : _metadata = metadata;

  factory _$SSEChunkImpl.fromJson(Map<String, dynamic> json) =>
      _$$SSEChunkImplFromJson(json);

  @override
  final SSEEventType type;
  @override
  final String? text;
  @override
  final String? error;
  final Map<String, dynamic>? _metadata;
  @override
  Map<String, dynamic>? get metadata {
    final value = _metadata;
    if (value == null) return null;
    if (_metadata is EqualUnmodifiableMapView) return _metadata;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableMapView(value);
  }

  @override
  String toString() {
    return 'SSEChunk(type: $type, text: $text, error: $error, metadata: $metadata)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$SSEChunkImpl &&
            (identical(other.type, type) || other.type == type) &&
            (identical(other.text, text) || other.text == text) &&
            (identical(other.error, error) || other.error == error) &&
            const DeepCollectionEquality().equals(other._metadata, _metadata));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(runtimeType, type, text, error,
      const DeepCollectionEquality().hash(_metadata));

  /// Create a copy of SSEChunk
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  @pragma('vm:prefer-inline')
  _$$SSEChunkImplCopyWith<_$SSEChunkImpl> get copyWith =>
      __$$SSEChunkImplCopyWithImpl<_$SSEChunkImpl>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$SSEChunkImplToJson(
      this,
    );
  }
}

abstract class _SSEChunk implements SSEChunk {
  const factory _SSEChunk(
      {required final SSEEventType type,
      final String? text,
      final String? error,
      final Map<String, dynamic>? metadata}) = _$SSEChunkImpl;

  factory _SSEChunk.fromJson(Map<String, dynamic> json) =
      _$SSEChunkImpl.fromJson;

  @override
  SSEEventType get type;
  @override
  String? get text;
  @override
  String? get error;
  @override
  Map<String, dynamic>? get metadata;

  /// Create a copy of SSEChunk
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  _$$SSEChunkImplCopyWith<_$SSEChunkImpl> get copyWith =>
      throw _privateConstructorUsedError;
}
