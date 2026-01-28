// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'chat_state.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

// dart format off
T _$identity<T>(T value) => value;

/// @nodoc
mixin _$ChatMessage {

 String get id; String get content; MessageRole get role; DateTime get timestamp; bool get isStreaming; bool get isTruncated; String? get truncationWarning; PendingConfirmation? get pendingConfirmation; Map<String, dynamic>? get metadata;
/// Create a copy of ChatMessage
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$ChatMessageCopyWith<ChatMessage> get copyWith => _$ChatMessageCopyWithImpl<ChatMessage>(this as ChatMessage, _$identity);

  /// Serializes this ChatMessage to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is ChatMessage&&(identical(other.id, id) || other.id == id)&&(identical(other.content, content) || other.content == content)&&(identical(other.role, role) || other.role == role)&&(identical(other.timestamp, timestamp) || other.timestamp == timestamp)&&(identical(other.isStreaming, isStreaming) || other.isStreaming == isStreaming)&&(identical(other.isTruncated, isTruncated) || other.isTruncated == isTruncated)&&(identical(other.truncationWarning, truncationWarning) || other.truncationWarning == truncationWarning)&&(identical(other.pendingConfirmation, pendingConfirmation) || other.pendingConfirmation == pendingConfirmation)&&const DeepCollectionEquality().equals(other.metadata, metadata));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,content,role,timestamp,isStreaming,isTruncated,truncationWarning,pendingConfirmation,const DeepCollectionEquality().hash(metadata));

@override
String toString() {
  return 'ChatMessage(id: $id, content: $content, role: $role, timestamp: $timestamp, isStreaming: $isStreaming, isTruncated: $isTruncated, truncationWarning: $truncationWarning, pendingConfirmation: $pendingConfirmation, metadata: $metadata)';
}


}

/// @nodoc
abstract mixin class $ChatMessageCopyWith<$Res>  {
  factory $ChatMessageCopyWith(ChatMessage value, $Res Function(ChatMessage) _then) = _$ChatMessageCopyWithImpl;
@useResult
$Res call({
 String id, String content, MessageRole role, DateTime timestamp, bool isStreaming, bool isTruncated, String? truncationWarning, PendingConfirmation? pendingConfirmation, Map<String, dynamic>? metadata
});


$PendingConfirmationCopyWith<$Res>? get pendingConfirmation;

}
/// @nodoc
class _$ChatMessageCopyWithImpl<$Res>
    implements $ChatMessageCopyWith<$Res> {
  _$ChatMessageCopyWithImpl(this._self, this._then);

  final ChatMessage _self;
  final $Res Function(ChatMessage) _then;

/// Create a copy of ChatMessage
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? id = null,Object? content = null,Object? role = null,Object? timestamp = null,Object? isStreaming = null,Object? isTruncated = null,Object? truncationWarning = freezed,Object? pendingConfirmation = freezed,Object? metadata = freezed,}) {
  return _then(_self.copyWith(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,content: null == content ? _self.content : content // ignore: cast_nullable_to_non_nullable
as String,role: null == role ? _self.role : role // ignore: cast_nullable_to_non_nullable
as MessageRole,timestamp: null == timestamp ? _self.timestamp : timestamp // ignore: cast_nullable_to_non_nullable
as DateTime,isStreaming: null == isStreaming ? _self.isStreaming : isStreaming // ignore: cast_nullable_to_non_nullable
as bool,isTruncated: null == isTruncated ? _self.isTruncated : isTruncated // ignore: cast_nullable_to_non_nullable
as bool,truncationWarning: freezed == truncationWarning ? _self.truncationWarning : truncationWarning // ignore: cast_nullable_to_non_nullable
as String?,pendingConfirmation: freezed == pendingConfirmation ? _self.pendingConfirmation : pendingConfirmation // ignore: cast_nullable_to_non_nullable
as PendingConfirmation?,metadata: freezed == metadata ? _self.metadata : metadata // ignore: cast_nullable_to_non_nullable
as Map<String, dynamic>?,
  ));
}
/// Create a copy of ChatMessage
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$PendingConfirmationCopyWith<$Res>? get pendingConfirmation {
    if (_self.pendingConfirmation == null) {
    return null;
  }

  return $PendingConfirmationCopyWith<$Res>(_self.pendingConfirmation!, (value) {
    return _then(_self.copyWith(pendingConfirmation: value));
  });
}
}


/// Adds pattern-matching-related methods to [ChatMessage].
extension ChatMessagePatterns on ChatMessage {
/// A variant of `map` that fallback to returning `orElse`.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case _:
///     return orElse();
/// }
/// ```

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _ChatMessage value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _ChatMessage() when $default != null:
return $default(_that);case _:
  return orElse();

}
}
/// A `switch`-like method, using callbacks.
///
/// Callbacks receives the raw object, upcasted.
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case final Subclass2 value:
///     return ...;
/// }
/// ```

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _ChatMessage value)  $default,){
final _that = this;
switch (_that) {
case _ChatMessage():
return $default(_that);}
}
/// A variant of `map` that fallback to returning `null`.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case _:
///     return null;
/// }
/// ```

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _ChatMessage value)?  $default,){
final _that = this;
switch (_that) {
case _ChatMessage() when $default != null:
return $default(_that);case _:
  return null;

}
}
/// A variant of `when` that fallback to an `orElse` callback.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case _:
///     return orElse();
/// }
/// ```

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String id,  String content,  MessageRole role,  DateTime timestamp,  bool isStreaming,  bool isTruncated,  String? truncationWarning,  PendingConfirmation? pendingConfirmation,  Map<String, dynamic>? metadata)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _ChatMessage() when $default != null:
return $default(_that.id,_that.content,_that.role,_that.timestamp,_that.isStreaming,_that.isTruncated,_that.truncationWarning,_that.pendingConfirmation,_that.metadata);case _:
  return orElse();

}
}
/// A `switch`-like method, using callbacks.
///
/// As opposed to `map`, this offers destructuring.
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case Subclass2(:final field2):
///     return ...;
/// }
/// ```

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String id,  String content,  MessageRole role,  DateTime timestamp,  bool isStreaming,  bool isTruncated,  String? truncationWarning,  PendingConfirmation? pendingConfirmation,  Map<String, dynamic>? metadata)  $default,) {final _that = this;
switch (_that) {
case _ChatMessage():
return $default(_that.id,_that.content,_that.role,_that.timestamp,_that.isStreaming,_that.isTruncated,_that.truncationWarning,_that.pendingConfirmation,_that.metadata);}
}
/// A variant of `when` that fallback to returning `null`
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case _:
///     return null;
/// }
/// ```

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String id,  String content,  MessageRole role,  DateTime timestamp,  bool isStreaming,  bool isTruncated,  String? truncationWarning,  PendingConfirmation? pendingConfirmation,  Map<String, dynamic>? metadata)?  $default,) {final _that = this;
switch (_that) {
case _ChatMessage() when $default != null:
return $default(_that.id,_that.content,_that.role,_that.timestamp,_that.isStreaming,_that.isTruncated,_that.truncationWarning,_that.pendingConfirmation,_that.metadata);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _ChatMessage implements ChatMessage {
  const _ChatMessage({required this.id, required this.content, required this.role, required this.timestamp, this.isStreaming = false, this.isTruncated = false, this.truncationWarning, this.pendingConfirmation, final  Map<String, dynamic>? metadata}): _metadata = metadata;
  factory _ChatMessage.fromJson(Map<String, dynamic> json) => _$ChatMessageFromJson(json);

@override final  String id;
@override final  String content;
@override final  MessageRole role;
@override final  DateTime timestamp;
@override@JsonKey() final  bool isStreaming;
@override@JsonKey() final  bool isTruncated;
@override final  String? truncationWarning;
@override final  PendingConfirmation? pendingConfirmation;
 final  Map<String, dynamic>? _metadata;
@override Map<String, dynamic>? get metadata {
  final value = _metadata;
  if (value == null) return null;
  if (_metadata is EqualUnmodifiableMapView) return _metadata;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableMapView(value);
}


/// Create a copy of ChatMessage
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$ChatMessageCopyWith<_ChatMessage> get copyWith => __$ChatMessageCopyWithImpl<_ChatMessage>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$ChatMessageToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _ChatMessage&&(identical(other.id, id) || other.id == id)&&(identical(other.content, content) || other.content == content)&&(identical(other.role, role) || other.role == role)&&(identical(other.timestamp, timestamp) || other.timestamp == timestamp)&&(identical(other.isStreaming, isStreaming) || other.isStreaming == isStreaming)&&(identical(other.isTruncated, isTruncated) || other.isTruncated == isTruncated)&&(identical(other.truncationWarning, truncationWarning) || other.truncationWarning == truncationWarning)&&(identical(other.pendingConfirmation, pendingConfirmation) || other.pendingConfirmation == pendingConfirmation)&&const DeepCollectionEquality().equals(other._metadata, _metadata));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,content,role,timestamp,isStreaming,isTruncated,truncationWarning,pendingConfirmation,const DeepCollectionEquality().hash(_metadata));

@override
String toString() {
  return 'ChatMessage(id: $id, content: $content, role: $role, timestamp: $timestamp, isStreaming: $isStreaming, isTruncated: $isTruncated, truncationWarning: $truncationWarning, pendingConfirmation: $pendingConfirmation, metadata: $metadata)';
}


}

/// @nodoc
abstract mixin class _$ChatMessageCopyWith<$Res> implements $ChatMessageCopyWith<$Res> {
  factory _$ChatMessageCopyWith(_ChatMessage value, $Res Function(_ChatMessage) _then) = __$ChatMessageCopyWithImpl;
@override @useResult
$Res call({
 String id, String content, MessageRole role, DateTime timestamp, bool isStreaming, bool isTruncated, String? truncationWarning, PendingConfirmation? pendingConfirmation, Map<String, dynamic>? metadata
});


@override $PendingConfirmationCopyWith<$Res>? get pendingConfirmation;

}
/// @nodoc
class __$ChatMessageCopyWithImpl<$Res>
    implements _$ChatMessageCopyWith<$Res> {
  __$ChatMessageCopyWithImpl(this._self, this._then);

  final _ChatMessage _self;
  final $Res Function(_ChatMessage) _then;

/// Create a copy of ChatMessage
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? id = null,Object? content = null,Object? role = null,Object? timestamp = null,Object? isStreaming = null,Object? isTruncated = null,Object? truncationWarning = freezed,Object? pendingConfirmation = freezed,Object? metadata = freezed,}) {
  return _then(_ChatMessage(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,content: null == content ? _self.content : content // ignore: cast_nullable_to_non_nullable
as String,role: null == role ? _self.role : role // ignore: cast_nullable_to_non_nullable
as MessageRole,timestamp: null == timestamp ? _self.timestamp : timestamp // ignore: cast_nullable_to_non_nullable
as DateTime,isStreaming: null == isStreaming ? _self.isStreaming : isStreaming // ignore: cast_nullable_to_non_nullable
as bool,isTruncated: null == isTruncated ? _self.isTruncated : isTruncated // ignore: cast_nullable_to_non_nullable
as bool,truncationWarning: freezed == truncationWarning ? _self.truncationWarning : truncationWarning // ignore: cast_nullable_to_non_nullable
as String?,pendingConfirmation: freezed == pendingConfirmation ? _self.pendingConfirmation : pendingConfirmation // ignore: cast_nullable_to_non_nullable
as PendingConfirmation?,metadata: freezed == metadata ? _self._metadata : metadata // ignore: cast_nullable_to_non_nullable
as Map<String, dynamic>?,
  ));
}

/// Create a copy of ChatMessage
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$PendingConfirmationCopyWith<$Res>? get pendingConfirmation {
    if (_self.pendingConfirmation == null) {
    return null;
  }

  return $PendingConfirmationCopyWith<$Res>(_self.pendingConfirmation!, (value) {
    return _then(_self.copyWith(pendingConfirmation: value));
  });
}
}


/// @nodoc
mixin _$PendingConfirmation {

 String get confirmationId; String get message; String get action; Map<String, dynamic>? get confirmationData; bool get isExpired;
/// Create a copy of PendingConfirmation
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$PendingConfirmationCopyWith<PendingConfirmation> get copyWith => _$PendingConfirmationCopyWithImpl<PendingConfirmation>(this as PendingConfirmation, _$identity);

  /// Serializes this PendingConfirmation to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is PendingConfirmation&&(identical(other.confirmationId, confirmationId) || other.confirmationId == confirmationId)&&(identical(other.message, message) || other.message == message)&&(identical(other.action, action) || other.action == action)&&const DeepCollectionEquality().equals(other.confirmationData, confirmationData)&&(identical(other.isExpired, isExpired) || other.isExpired == isExpired));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,confirmationId,message,action,const DeepCollectionEquality().hash(confirmationData),isExpired);

@override
String toString() {
  return 'PendingConfirmation(confirmationId: $confirmationId, message: $message, action: $action, confirmationData: $confirmationData, isExpired: $isExpired)';
}


}

/// @nodoc
abstract mixin class $PendingConfirmationCopyWith<$Res>  {
  factory $PendingConfirmationCopyWith(PendingConfirmation value, $Res Function(PendingConfirmation) _then) = _$PendingConfirmationCopyWithImpl;
@useResult
$Res call({
 String confirmationId, String message, String action, Map<String, dynamic>? confirmationData, bool isExpired
});




}
/// @nodoc
class _$PendingConfirmationCopyWithImpl<$Res>
    implements $PendingConfirmationCopyWith<$Res> {
  _$PendingConfirmationCopyWithImpl(this._self, this._then);

  final PendingConfirmation _self;
  final $Res Function(PendingConfirmation) _then;

/// Create a copy of PendingConfirmation
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? confirmationId = null,Object? message = null,Object? action = null,Object? confirmationData = freezed,Object? isExpired = null,}) {
  return _then(_self.copyWith(
confirmationId: null == confirmationId ? _self.confirmationId : confirmationId // ignore: cast_nullable_to_non_nullable
as String,message: null == message ? _self.message : message // ignore: cast_nullable_to_non_nullable
as String,action: null == action ? _self.action : action // ignore: cast_nullable_to_non_nullable
as String,confirmationData: freezed == confirmationData ? _self.confirmationData : confirmationData // ignore: cast_nullable_to_non_nullable
as Map<String, dynamic>?,isExpired: null == isExpired ? _self.isExpired : isExpired // ignore: cast_nullable_to_non_nullable
as bool,
  ));
}

}


/// Adds pattern-matching-related methods to [PendingConfirmation].
extension PendingConfirmationPatterns on PendingConfirmation {
/// A variant of `map` that fallback to returning `orElse`.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case _:
///     return orElse();
/// }
/// ```

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _PendingConfirmation value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _PendingConfirmation() when $default != null:
return $default(_that);case _:
  return orElse();

}
}
/// A `switch`-like method, using callbacks.
///
/// Callbacks receives the raw object, upcasted.
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case final Subclass2 value:
///     return ...;
/// }
/// ```

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _PendingConfirmation value)  $default,){
final _that = this;
switch (_that) {
case _PendingConfirmation():
return $default(_that);}
}
/// A variant of `map` that fallback to returning `null`.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case _:
///     return null;
/// }
/// ```

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _PendingConfirmation value)?  $default,){
final _that = this;
switch (_that) {
case _PendingConfirmation() when $default != null:
return $default(_that);case _:
  return null;

}
}
/// A variant of `when` that fallback to an `orElse` callback.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case _:
///     return orElse();
/// }
/// ```

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String confirmationId,  String message,  String action,  Map<String, dynamic>? confirmationData,  bool isExpired)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _PendingConfirmation() when $default != null:
return $default(_that.confirmationId,_that.message,_that.action,_that.confirmationData,_that.isExpired);case _:
  return orElse();

}
}
/// A `switch`-like method, using callbacks.
///
/// As opposed to `map`, this offers destructuring.
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case Subclass2(:final field2):
///     return ...;
/// }
/// ```

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String confirmationId,  String message,  String action,  Map<String, dynamic>? confirmationData,  bool isExpired)  $default,) {final _that = this;
switch (_that) {
case _PendingConfirmation():
return $default(_that.confirmationId,_that.message,_that.action,_that.confirmationData,_that.isExpired);}
}
/// A variant of `when` that fallback to returning `null`
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case _:
///     return null;
/// }
/// ```

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String confirmationId,  String message,  String action,  Map<String, dynamic>? confirmationData,  bool isExpired)?  $default,) {final _that = this;
switch (_that) {
case _PendingConfirmation() when $default != null:
return $default(_that.confirmationId,_that.message,_that.action,_that.confirmationData,_that.isExpired);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _PendingConfirmation implements PendingConfirmation {
  const _PendingConfirmation({required this.confirmationId, required this.message, required this.action, final  Map<String, dynamic>? confirmationData, this.isExpired = false}): _confirmationData = confirmationData;
  factory _PendingConfirmation.fromJson(Map<String, dynamic> json) => _$PendingConfirmationFromJson(json);

@override final  String confirmationId;
@override final  String message;
@override final  String action;
 final  Map<String, dynamic>? _confirmationData;
@override Map<String, dynamic>? get confirmationData {
  final value = _confirmationData;
  if (value == null) return null;
  if (_confirmationData is EqualUnmodifiableMapView) return _confirmationData;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableMapView(value);
}

@override@JsonKey() final  bool isExpired;

/// Create a copy of PendingConfirmation
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$PendingConfirmationCopyWith<_PendingConfirmation> get copyWith => __$PendingConfirmationCopyWithImpl<_PendingConfirmation>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$PendingConfirmationToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _PendingConfirmation&&(identical(other.confirmationId, confirmationId) || other.confirmationId == confirmationId)&&(identical(other.message, message) || other.message == message)&&(identical(other.action, action) || other.action == action)&&const DeepCollectionEquality().equals(other._confirmationData, _confirmationData)&&(identical(other.isExpired, isExpired) || other.isExpired == isExpired));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,confirmationId,message,action,const DeepCollectionEquality().hash(_confirmationData),isExpired);

@override
String toString() {
  return 'PendingConfirmation(confirmationId: $confirmationId, message: $message, action: $action, confirmationData: $confirmationData, isExpired: $isExpired)';
}


}

/// @nodoc
abstract mixin class _$PendingConfirmationCopyWith<$Res> implements $PendingConfirmationCopyWith<$Res> {
  factory _$PendingConfirmationCopyWith(_PendingConfirmation value, $Res Function(_PendingConfirmation) _then) = __$PendingConfirmationCopyWithImpl;
@override @useResult
$Res call({
 String confirmationId, String message, String action, Map<String, dynamic>? confirmationData, bool isExpired
});




}
/// @nodoc
class __$PendingConfirmationCopyWithImpl<$Res>
    implements _$PendingConfirmationCopyWith<$Res> {
  __$PendingConfirmationCopyWithImpl(this._self, this._then);

  final _PendingConfirmation _self;
  final $Res Function(_PendingConfirmation) _then;

/// Create a copy of PendingConfirmation
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? confirmationId = null,Object? message = null,Object? action = null,Object? confirmationData = freezed,Object? isExpired = null,}) {
  return _then(_PendingConfirmation(
confirmationId: null == confirmationId ? _self.confirmationId : confirmationId // ignore: cast_nullable_to_non_nullable
as String,message: null == message ? _self.message : message // ignore: cast_nullable_to_non_nullable
as String,action: null == action ? _self.action : action // ignore: cast_nullable_to_non_nullable
as String,confirmationData: freezed == confirmationData ? _self._confirmationData : confirmationData // ignore: cast_nullable_to_non_nullable
as Map<String, dynamic>?,isExpired: null == isExpired ? _self.isExpired : isExpired // ignore: cast_nullable_to_non_nullable
as bool,
  ));
}


}


/// @nodoc
mixin _$ChatState {

 List<ChatMessage> get messages; bool get isLoading; bool get isStreaming; String? get error; String? get currentStreamingMessageId;
/// Create a copy of ChatState
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$ChatStateCopyWith<ChatState> get copyWith => _$ChatStateCopyWithImpl<ChatState>(this as ChatState, _$identity);

  /// Serializes this ChatState to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is ChatState&&const DeepCollectionEquality().equals(other.messages, messages)&&(identical(other.isLoading, isLoading) || other.isLoading == isLoading)&&(identical(other.isStreaming, isStreaming) || other.isStreaming == isStreaming)&&(identical(other.error, error) || other.error == error)&&(identical(other.currentStreamingMessageId, currentStreamingMessageId) || other.currentStreamingMessageId == currentStreamingMessageId));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,const DeepCollectionEquality().hash(messages),isLoading,isStreaming,error,currentStreamingMessageId);

@override
String toString() {
  return 'ChatState(messages: $messages, isLoading: $isLoading, isStreaming: $isStreaming, error: $error, currentStreamingMessageId: $currentStreamingMessageId)';
}


}

/// @nodoc
abstract mixin class $ChatStateCopyWith<$Res>  {
  factory $ChatStateCopyWith(ChatState value, $Res Function(ChatState) _then) = _$ChatStateCopyWithImpl;
@useResult
$Res call({
 List<ChatMessage> messages, bool isLoading, bool isStreaming, String? error, String? currentStreamingMessageId
});




}
/// @nodoc
class _$ChatStateCopyWithImpl<$Res>
    implements $ChatStateCopyWith<$Res> {
  _$ChatStateCopyWithImpl(this._self, this._then);

  final ChatState _self;
  final $Res Function(ChatState) _then;

/// Create a copy of ChatState
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? messages = null,Object? isLoading = null,Object? isStreaming = null,Object? error = freezed,Object? currentStreamingMessageId = freezed,}) {
  return _then(_self.copyWith(
messages: null == messages ? _self.messages : messages // ignore: cast_nullable_to_non_nullable
as List<ChatMessage>,isLoading: null == isLoading ? _self.isLoading : isLoading // ignore: cast_nullable_to_non_nullable
as bool,isStreaming: null == isStreaming ? _self.isStreaming : isStreaming // ignore: cast_nullable_to_non_nullable
as bool,error: freezed == error ? _self.error : error // ignore: cast_nullable_to_non_nullable
as String?,currentStreamingMessageId: freezed == currentStreamingMessageId ? _self.currentStreamingMessageId : currentStreamingMessageId // ignore: cast_nullable_to_non_nullable
as String?,
  ));
}

}


/// Adds pattern-matching-related methods to [ChatState].
extension ChatStatePatterns on ChatState {
/// A variant of `map` that fallback to returning `orElse`.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case _:
///     return orElse();
/// }
/// ```

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _ChatState value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _ChatState() when $default != null:
return $default(_that);case _:
  return orElse();

}
}
/// A `switch`-like method, using callbacks.
///
/// Callbacks receives the raw object, upcasted.
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case final Subclass2 value:
///     return ...;
/// }
/// ```

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _ChatState value)  $default,){
final _that = this;
switch (_that) {
case _ChatState():
return $default(_that);}
}
/// A variant of `map` that fallback to returning `null`.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case _:
///     return null;
/// }
/// ```

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _ChatState value)?  $default,){
final _that = this;
switch (_that) {
case _ChatState() when $default != null:
return $default(_that);case _:
  return null;

}
}
/// A variant of `when` that fallback to an `orElse` callback.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case _:
///     return orElse();
/// }
/// ```

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( List<ChatMessage> messages,  bool isLoading,  bool isStreaming,  String? error,  String? currentStreamingMessageId)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _ChatState() when $default != null:
return $default(_that.messages,_that.isLoading,_that.isStreaming,_that.error,_that.currentStreamingMessageId);case _:
  return orElse();

}
}
/// A `switch`-like method, using callbacks.
///
/// As opposed to `map`, this offers destructuring.
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case Subclass2(:final field2):
///     return ...;
/// }
/// ```

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( List<ChatMessage> messages,  bool isLoading,  bool isStreaming,  String? error,  String? currentStreamingMessageId)  $default,) {final _that = this;
switch (_that) {
case _ChatState():
return $default(_that.messages,_that.isLoading,_that.isStreaming,_that.error,_that.currentStreamingMessageId);}
}
/// A variant of `when` that fallback to returning `null`
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case _:
///     return null;
/// }
/// ```

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( List<ChatMessage> messages,  bool isLoading,  bool isStreaming,  String? error,  String? currentStreamingMessageId)?  $default,) {final _that = this;
switch (_that) {
case _ChatState() when $default != null:
return $default(_that.messages,_that.isLoading,_that.isStreaming,_that.error,_that.currentStreamingMessageId);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _ChatState implements ChatState {
  const _ChatState({final  List<ChatMessage> messages = const [], this.isLoading = false, this.isStreaming = false, this.error, this.currentStreamingMessageId}): _messages = messages;
  factory _ChatState.fromJson(Map<String, dynamic> json) => _$ChatStateFromJson(json);

 final  List<ChatMessage> _messages;
@override@JsonKey() List<ChatMessage> get messages {
  if (_messages is EqualUnmodifiableListView) return _messages;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_messages);
}

@override@JsonKey() final  bool isLoading;
@override@JsonKey() final  bool isStreaming;
@override final  String? error;
@override final  String? currentStreamingMessageId;

/// Create a copy of ChatState
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$ChatStateCopyWith<_ChatState> get copyWith => __$ChatStateCopyWithImpl<_ChatState>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$ChatStateToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _ChatState&&const DeepCollectionEquality().equals(other._messages, _messages)&&(identical(other.isLoading, isLoading) || other.isLoading == isLoading)&&(identical(other.isStreaming, isStreaming) || other.isStreaming == isStreaming)&&(identical(other.error, error) || other.error == error)&&(identical(other.currentStreamingMessageId, currentStreamingMessageId) || other.currentStreamingMessageId == currentStreamingMessageId));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,const DeepCollectionEquality().hash(_messages),isLoading,isStreaming,error,currentStreamingMessageId);

@override
String toString() {
  return 'ChatState(messages: $messages, isLoading: $isLoading, isStreaming: $isStreaming, error: $error, currentStreamingMessageId: $currentStreamingMessageId)';
}


}

/// @nodoc
abstract mixin class _$ChatStateCopyWith<$Res> implements $ChatStateCopyWith<$Res> {
  factory _$ChatStateCopyWith(_ChatState value, $Res Function(_ChatState) _then) = __$ChatStateCopyWithImpl;
@override @useResult
$Res call({
 List<ChatMessage> messages, bool isLoading, bool isStreaming, String? error, String? currentStreamingMessageId
});




}
/// @nodoc
class __$ChatStateCopyWithImpl<$Res>
    implements _$ChatStateCopyWith<$Res> {
  __$ChatStateCopyWithImpl(this._self, this._then);

  final _ChatState _self;
  final $Res Function(_ChatState) _then;

/// Create a copy of ChatState
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? messages = null,Object? isLoading = null,Object? isStreaming = null,Object? error = freezed,Object? currentStreamingMessageId = freezed,}) {
  return _then(_ChatState(
messages: null == messages ? _self._messages : messages // ignore: cast_nullable_to_non_nullable
as List<ChatMessage>,isLoading: null == isLoading ? _self.isLoading : isLoading // ignore: cast_nullable_to_non_nullable
as bool,isStreaming: null == isStreaming ? _self.isStreaming : isStreaming // ignore: cast_nullable_to_non_nullable
as bool,error: freezed == error ? _self.error : error // ignore: cast_nullable_to_non_nullable
as String?,currentStreamingMessageId: freezed == currentStreamingMessageId ? _self.currentStreamingMessageId : currentStreamingMessageId // ignore: cast_nullable_to_non_nullable
as String?,
  ));
}


}


/// @nodoc
mixin _$SSEChunk {

 SSEEventType get type; String? get text; String? get error; Map<String, dynamic>? get metadata;
/// Create a copy of SSEChunk
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$SSEChunkCopyWith<SSEChunk> get copyWith => _$SSEChunkCopyWithImpl<SSEChunk>(this as SSEChunk, _$identity);

  /// Serializes this SSEChunk to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is SSEChunk&&(identical(other.type, type) || other.type == type)&&(identical(other.text, text) || other.text == text)&&(identical(other.error, error) || other.error == error)&&const DeepCollectionEquality().equals(other.metadata, metadata));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,type,text,error,const DeepCollectionEquality().hash(metadata));

@override
String toString() {
  return 'SSEChunk(type: $type, text: $text, error: $error, metadata: $metadata)';
}


}

/// @nodoc
abstract mixin class $SSEChunkCopyWith<$Res>  {
  factory $SSEChunkCopyWith(SSEChunk value, $Res Function(SSEChunk) _then) = _$SSEChunkCopyWithImpl;
@useResult
$Res call({
 SSEEventType type, String? text, String? error, Map<String, dynamic>? metadata
});




}
/// @nodoc
class _$SSEChunkCopyWithImpl<$Res>
    implements $SSEChunkCopyWith<$Res> {
  _$SSEChunkCopyWithImpl(this._self, this._then);

  final SSEChunk _self;
  final $Res Function(SSEChunk) _then;

/// Create a copy of SSEChunk
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? type = null,Object? text = freezed,Object? error = freezed,Object? metadata = freezed,}) {
  return _then(_self.copyWith(
type: null == type ? _self.type : type // ignore: cast_nullable_to_non_nullable
as SSEEventType,text: freezed == text ? _self.text : text // ignore: cast_nullable_to_non_nullable
as String?,error: freezed == error ? _self.error : error // ignore: cast_nullable_to_non_nullable
as String?,metadata: freezed == metadata ? _self.metadata : metadata // ignore: cast_nullable_to_non_nullable
as Map<String, dynamic>?,
  ));
}

}


/// Adds pattern-matching-related methods to [SSEChunk].
extension SSEChunkPatterns on SSEChunk {
/// A variant of `map` that fallback to returning `orElse`.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case _:
///     return orElse();
/// }
/// ```

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _SSEChunk value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _SSEChunk() when $default != null:
return $default(_that);case _:
  return orElse();

}
}
/// A `switch`-like method, using callbacks.
///
/// Callbacks receives the raw object, upcasted.
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case final Subclass2 value:
///     return ...;
/// }
/// ```

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _SSEChunk value)  $default,){
final _that = this;
switch (_that) {
case _SSEChunk():
return $default(_that);}
}
/// A variant of `map` that fallback to returning `null`.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case _:
///     return null;
/// }
/// ```

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _SSEChunk value)?  $default,){
final _that = this;
switch (_that) {
case _SSEChunk() when $default != null:
return $default(_that);case _:
  return null;

}
}
/// A variant of `when` that fallback to an `orElse` callback.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case _:
///     return orElse();
/// }
/// ```

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( SSEEventType type,  String? text,  String? error,  Map<String, dynamic>? metadata)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _SSEChunk() when $default != null:
return $default(_that.type,_that.text,_that.error,_that.metadata);case _:
  return orElse();

}
}
/// A `switch`-like method, using callbacks.
///
/// As opposed to `map`, this offers destructuring.
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case Subclass2(:final field2):
///     return ...;
/// }
/// ```

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( SSEEventType type,  String? text,  String? error,  Map<String, dynamic>? metadata)  $default,) {final _that = this;
switch (_that) {
case _SSEChunk():
return $default(_that.type,_that.text,_that.error,_that.metadata);}
}
/// A variant of `when` that fallback to returning `null`
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case _:
///     return null;
/// }
/// ```

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( SSEEventType type,  String? text,  String? error,  Map<String, dynamic>? metadata)?  $default,) {final _that = this;
switch (_that) {
case _SSEChunk() when $default != null:
return $default(_that.type,_that.text,_that.error,_that.metadata);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _SSEChunk implements SSEChunk {
  const _SSEChunk({required this.type, this.text, this.error, final  Map<String, dynamic>? metadata}): _metadata = metadata;
  factory _SSEChunk.fromJson(Map<String, dynamic> json) => _$SSEChunkFromJson(json);

@override final  SSEEventType type;
@override final  String? text;
@override final  String? error;
 final  Map<String, dynamic>? _metadata;
@override Map<String, dynamic>? get metadata {
  final value = _metadata;
  if (value == null) return null;
  if (_metadata is EqualUnmodifiableMapView) return _metadata;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableMapView(value);
}


/// Create a copy of SSEChunk
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$SSEChunkCopyWith<_SSEChunk> get copyWith => __$SSEChunkCopyWithImpl<_SSEChunk>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$SSEChunkToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _SSEChunk&&(identical(other.type, type) || other.type == type)&&(identical(other.text, text) || other.text == text)&&(identical(other.error, error) || other.error == error)&&const DeepCollectionEquality().equals(other._metadata, _metadata));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,type,text,error,const DeepCollectionEquality().hash(_metadata));

@override
String toString() {
  return 'SSEChunk(type: $type, text: $text, error: $error, metadata: $metadata)';
}


}

/// @nodoc
abstract mixin class _$SSEChunkCopyWith<$Res> implements $SSEChunkCopyWith<$Res> {
  factory _$SSEChunkCopyWith(_SSEChunk value, $Res Function(_SSEChunk) _then) = __$SSEChunkCopyWithImpl;
@override @useResult
$Res call({
 SSEEventType type, String? text, String? error, Map<String, dynamic>? metadata
});




}
/// @nodoc
class __$SSEChunkCopyWithImpl<$Res>
    implements _$SSEChunkCopyWith<$Res> {
  __$SSEChunkCopyWithImpl(this._self, this._then);

  final _SSEChunk _self;
  final $Res Function(_SSEChunk) _then;

/// Create a copy of SSEChunk
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? type = null,Object? text = freezed,Object? error = freezed,Object? metadata = freezed,}) {
  return _then(_SSEChunk(
type: null == type ? _self.type : type // ignore: cast_nullable_to_non_nullable
as SSEEventType,text: freezed == text ? _self.text : text // ignore: cast_nullable_to_non_nullable
as String?,error: freezed == error ? _self.error : error // ignore: cast_nullable_to_non_nullable
as String?,metadata: freezed == metadata ? _self._metadata : metadata // ignore: cast_nullable_to_non_nullable
as Map<String, dynamic>?,
  ));
}


}

// dart format on
