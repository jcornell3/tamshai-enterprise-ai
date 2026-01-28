// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'speech_state.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

// dart format off
T _$identity<T>(T value) => value;
/// @nodoc
mixin _$SpeechState {

/// Whether speech recognition is available on this device
 bool get isAvailable;/// Whether currently listening for speech
 bool get isListening;/// Whether processing the recorded audio
 bool get isProcessing;/// The transcribed text from speech
 String get transcribedText;/// Current sound level (0.0 to 1.0) for visual feedback
 double get soundLevel;/// Error message if speech recognition failed
 String? get errorMessage;/// Error code for programmatic handling
 String? get errorCode;/// Selected locale for speech recognition
 String get locale;
/// Create a copy of SpeechState
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$SpeechStateCopyWith<SpeechState> get copyWith => _$SpeechStateCopyWithImpl<SpeechState>(this as SpeechState, _$identity);



@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is SpeechState&&(identical(other.isAvailable, isAvailable) || other.isAvailable == isAvailable)&&(identical(other.isListening, isListening) || other.isListening == isListening)&&(identical(other.isProcessing, isProcessing) || other.isProcessing == isProcessing)&&(identical(other.transcribedText, transcribedText) || other.transcribedText == transcribedText)&&(identical(other.soundLevel, soundLevel) || other.soundLevel == soundLevel)&&(identical(other.errorMessage, errorMessage) || other.errorMessage == errorMessage)&&(identical(other.errorCode, errorCode) || other.errorCode == errorCode)&&(identical(other.locale, locale) || other.locale == locale));
}


@override
int get hashCode => Object.hash(runtimeType,isAvailable,isListening,isProcessing,transcribedText,soundLevel,errorMessage,errorCode,locale);

@override
String toString() {
  return 'SpeechState(isAvailable: $isAvailable, isListening: $isListening, isProcessing: $isProcessing, transcribedText: $transcribedText, soundLevel: $soundLevel, errorMessage: $errorMessage, errorCode: $errorCode, locale: $locale)';
}


}

/// @nodoc
abstract mixin class $SpeechStateCopyWith<$Res>  {
  factory $SpeechStateCopyWith(SpeechState value, $Res Function(SpeechState) _then) = _$SpeechStateCopyWithImpl;
@useResult
$Res call({
 bool isAvailable, bool isListening, bool isProcessing, String transcribedText, double soundLevel, String? errorMessage, String? errorCode, String locale
});




}
/// @nodoc
class _$SpeechStateCopyWithImpl<$Res>
    implements $SpeechStateCopyWith<$Res> {
  _$SpeechStateCopyWithImpl(this._self, this._then);

  final SpeechState _self;
  final $Res Function(SpeechState) _then;

/// Create a copy of SpeechState
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? isAvailable = null,Object? isListening = null,Object? isProcessing = null,Object? transcribedText = null,Object? soundLevel = null,Object? errorMessage = freezed,Object? errorCode = freezed,Object? locale = null,}) {
  return _then(_self.copyWith(
isAvailable: null == isAvailable ? _self.isAvailable : isAvailable // ignore: cast_nullable_to_non_nullable
as bool,isListening: null == isListening ? _self.isListening : isListening // ignore: cast_nullable_to_non_nullable
as bool,isProcessing: null == isProcessing ? _self.isProcessing : isProcessing // ignore: cast_nullable_to_non_nullable
as bool,transcribedText: null == transcribedText ? _self.transcribedText : transcribedText // ignore: cast_nullable_to_non_nullable
as String,soundLevel: null == soundLevel ? _self.soundLevel : soundLevel // ignore: cast_nullable_to_non_nullable
as double,errorMessage: freezed == errorMessage ? _self.errorMessage : errorMessage // ignore: cast_nullable_to_non_nullable
as String?,errorCode: freezed == errorCode ? _self.errorCode : errorCode // ignore: cast_nullable_to_non_nullable
as String?,locale: null == locale ? _self.locale : locale // ignore: cast_nullable_to_non_nullable
as String,
  ));
}

}


/// Adds pattern-matching-related methods to [SpeechState].
extension SpeechStatePatterns on SpeechState {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _SpeechState value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _SpeechState() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _SpeechState value)  $default,){
final _that = this;
switch (_that) {
case _SpeechState():
return $default(_that);case _:
  throw StateError('Unexpected subclass');

}
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _SpeechState value)?  $default,){
final _that = this;
switch (_that) {
case _SpeechState() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( bool isAvailable,  bool isListening,  bool isProcessing,  String transcribedText,  double soundLevel,  String? errorMessage,  String? errorCode,  String locale)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _SpeechState() when $default != null:
return $default(_that.isAvailable,_that.isListening,_that.isProcessing,_that.transcribedText,_that.soundLevel,_that.errorMessage,_that.errorCode,_that.locale);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( bool isAvailable,  bool isListening,  bool isProcessing,  String transcribedText,  double soundLevel,  String? errorMessage,  String? errorCode,  String locale)  $default,) {final _that = this;
switch (_that) {
case _SpeechState():
return $default(_that.isAvailable,_that.isListening,_that.isProcessing,_that.transcribedText,_that.soundLevel,_that.errorMessage,_that.errorCode,_that.locale);case _:
  throw StateError('Unexpected subclass');

}
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( bool isAvailable,  bool isListening,  bool isProcessing,  String transcribedText,  double soundLevel,  String? errorMessage,  String? errorCode,  String locale)?  $default,) {final _that = this;
switch (_that) {
case _SpeechState() when $default != null:
return $default(_that.isAvailable,_that.isListening,_that.isProcessing,_that.transcribedText,_that.soundLevel,_that.errorMessage,_that.errorCode,_that.locale);case _:
  return null;

}
}

}

/// @nodoc


class _SpeechState extends SpeechState {
  const _SpeechState({this.isAvailable = false, this.isListening = false, this.isProcessing = false, this.transcribedText = '', this.soundLevel = 0.0, this.errorMessage, this.errorCode, this.locale = 'en_US'}): super._();
  

/// Whether speech recognition is available on this device
@override@JsonKey() final  bool isAvailable;
/// Whether currently listening for speech
@override@JsonKey() final  bool isListening;
/// Whether processing the recorded audio
@override@JsonKey() final  bool isProcessing;
/// The transcribed text from speech
@override@JsonKey() final  String transcribedText;
/// Current sound level (0.0 to 1.0) for visual feedback
@override@JsonKey() final  double soundLevel;
/// Error message if speech recognition failed
@override final  String? errorMessage;
/// Error code for programmatic handling
@override final  String? errorCode;
/// Selected locale for speech recognition
@override@JsonKey() final  String locale;

/// Create a copy of SpeechState
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$SpeechStateCopyWith<_SpeechState> get copyWith => __$SpeechStateCopyWithImpl<_SpeechState>(this, _$identity);



@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _SpeechState&&(identical(other.isAvailable, isAvailable) || other.isAvailable == isAvailable)&&(identical(other.isListening, isListening) || other.isListening == isListening)&&(identical(other.isProcessing, isProcessing) || other.isProcessing == isProcessing)&&(identical(other.transcribedText, transcribedText) || other.transcribedText == transcribedText)&&(identical(other.soundLevel, soundLevel) || other.soundLevel == soundLevel)&&(identical(other.errorMessage, errorMessage) || other.errorMessage == errorMessage)&&(identical(other.errorCode, errorCode) || other.errorCode == errorCode)&&(identical(other.locale, locale) || other.locale == locale));
}


@override
int get hashCode => Object.hash(runtimeType,isAvailable,isListening,isProcessing,transcribedText,soundLevel,errorMessage,errorCode,locale);

@override
String toString() {
  return 'SpeechState(isAvailable: $isAvailable, isListening: $isListening, isProcessing: $isProcessing, transcribedText: $transcribedText, soundLevel: $soundLevel, errorMessage: $errorMessage, errorCode: $errorCode, locale: $locale)';
}


}

/// @nodoc
abstract mixin class _$SpeechStateCopyWith<$Res> implements $SpeechStateCopyWith<$Res> {
  factory _$SpeechStateCopyWith(_SpeechState value, $Res Function(_SpeechState) _then) = __$SpeechStateCopyWithImpl;
@override @useResult
$Res call({
 bool isAvailable, bool isListening, bool isProcessing, String transcribedText, double soundLevel, String? errorMessage, String? errorCode, String locale
});




}
/// @nodoc
class __$SpeechStateCopyWithImpl<$Res>
    implements _$SpeechStateCopyWith<$Res> {
  __$SpeechStateCopyWithImpl(this._self, this._then);

  final _SpeechState _self;
  final $Res Function(_SpeechState) _then;

/// Create a copy of SpeechState
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? isAvailable = null,Object? isListening = null,Object? isProcessing = null,Object? transcribedText = null,Object? soundLevel = null,Object? errorMessage = freezed,Object? errorCode = freezed,Object? locale = null,}) {
  return _then(_SpeechState(
isAvailable: null == isAvailable ? _self.isAvailable : isAvailable // ignore: cast_nullable_to_non_nullable
as bool,isListening: null == isListening ? _self.isListening : isListening // ignore: cast_nullable_to_non_nullable
as bool,isProcessing: null == isProcessing ? _self.isProcessing : isProcessing // ignore: cast_nullable_to_non_nullable
as bool,transcribedText: null == transcribedText ? _self.transcribedText : transcribedText // ignore: cast_nullable_to_non_nullable
as String,soundLevel: null == soundLevel ? _self.soundLevel : soundLevel // ignore: cast_nullable_to_non_nullable
as double,errorMessage: freezed == errorMessage ? _self.errorMessage : errorMessage // ignore: cast_nullable_to_non_nullable
as String?,errorCode: freezed == errorCode ? _self.errorCode : errorCode // ignore: cast_nullable_to_non_nullable
as String?,locale: null == locale ? _self.locale : locale // ignore: cast_nullable_to_non_nullable
as String,
  ));
}


}

// dart format on
