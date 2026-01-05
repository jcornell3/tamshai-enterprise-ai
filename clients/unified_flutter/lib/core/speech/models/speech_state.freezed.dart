// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'speech_state.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

final _privateConstructorUsedError = UnsupportedError(
    'It seems like you constructed your class using `MyClass._()`. This constructor is only meant to be used by freezed and you are not supposed to need it nor use it.\nPlease check the documentation here for more information: https://github.com/rrousselGit/freezed#adding-getters-and-methods-to-our-models');

/// @nodoc
mixin _$SpeechState {
  /// Whether speech recognition is available on this device
  bool get isAvailable => throw _privateConstructorUsedError;

  /// Whether currently listening for speech
  bool get isListening => throw _privateConstructorUsedError;

  /// Whether processing the recorded audio
  bool get isProcessing => throw _privateConstructorUsedError;

  /// The transcribed text from speech
  String get transcribedText => throw _privateConstructorUsedError;

  /// Current sound level (0.0 to 1.0) for visual feedback
  double get soundLevel => throw _privateConstructorUsedError;

  /// Error message if speech recognition failed
  String? get errorMessage => throw _privateConstructorUsedError;

  /// Error code for programmatic handling
  String? get errorCode => throw _privateConstructorUsedError;

  /// Selected locale for speech recognition
  String get locale => throw _privateConstructorUsedError;

  /// Create a copy of SpeechState
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  $SpeechStateCopyWith<SpeechState> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $SpeechStateCopyWith<$Res> {
  factory $SpeechStateCopyWith(
          SpeechState value, $Res Function(SpeechState) then) =
      _$SpeechStateCopyWithImpl<$Res, SpeechState>;
  @useResult
  $Res call(
      {bool isAvailable,
      bool isListening,
      bool isProcessing,
      String transcribedText,
      double soundLevel,
      String? errorMessage,
      String? errorCode,
      String locale});
}

/// @nodoc
class _$SpeechStateCopyWithImpl<$Res, $Val extends SpeechState>
    implements $SpeechStateCopyWith<$Res> {
  _$SpeechStateCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  /// Create a copy of SpeechState
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? isAvailable = null,
    Object? isListening = null,
    Object? isProcessing = null,
    Object? transcribedText = null,
    Object? soundLevel = null,
    Object? errorMessage = freezed,
    Object? errorCode = freezed,
    Object? locale = null,
  }) {
    return _then(_value.copyWith(
      isAvailable: null == isAvailable
          ? _value.isAvailable
          : isAvailable // ignore: cast_nullable_to_non_nullable
              as bool,
      isListening: null == isListening
          ? _value.isListening
          : isListening // ignore: cast_nullable_to_non_nullable
              as bool,
      isProcessing: null == isProcessing
          ? _value.isProcessing
          : isProcessing // ignore: cast_nullable_to_non_nullable
              as bool,
      transcribedText: null == transcribedText
          ? _value.transcribedText
          : transcribedText // ignore: cast_nullable_to_non_nullable
              as String,
      soundLevel: null == soundLevel
          ? _value.soundLevel
          : soundLevel // ignore: cast_nullable_to_non_nullable
              as double,
      errorMessage: freezed == errorMessage
          ? _value.errorMessage
          : errorMessage // ignore: cast_nullable_to_non_nullable
              as String?,
      errorCode: freezed == errorCode
          ? _value.errorCode
          : errorCode // ignore: cast_nullable_to_non_nullable
              as String?,
      locale: null == locale
          ? _value.locale
          : locale // ignore: cast_nullable_to_non_nullable
              as String,
    ) as $Val);
  }
}

/// @nodoc
abstract class _$$SpeechStateImplCopyWith<$Res>
    implements $SpeechStateCopyWith<$Res> {
  factory _$$SpeechStateImplCopyWith(
          _$SpeechStateImpl value, $Res Function(_$SpeechStateImpl) then) =
      __$$SpeechStateImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call(
      {bool isAvailable,
      bool isListening,
      bool isProcessing,
      String transcribedText,
      double soundLevel,
      String? errorMessage,
      String? errorCode,
      String locale});
}

/// @nodoc
class __$$SpeechStateImplCopyWithImpl<$Res>
    extends _$SpeechStateCopyWithImpl<$Res, _$SpeechStateImpl>
    implements _$$SpeechStateImplCopyWith<$Res> {
  __$$SpeechStateImplCopyWithImpl(
      _$SpeechStateImpl _value, $Res Function(_$SpeechStateImpl) _then)
      : super(_value, _then);

  /// Create a copy of SpeechState
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? isAvailable = null,
    Object? isListening = null,
    Object? isProcessing = null,
    Object? transcribedText = null,
    Object? soundLevel = null,
    Object? errorMessage = freezed,
    Object? errorCode = freezed,
    Object? locale = null,
  }) {
    return _then(_$SpeechStateImpl(
      isAvailable: null == isAvailable
          ? _value.isAvailable
          : isAvailable // ignore: cast_nullable_to_non_nullable
              as bool,
      isListening: null == isListening
          ? _value.isListening
          : isListening // ignore: cast_nullable_to_non_nullable
              as bool,
      isProcessing: null == isProcessing
          ? _value.isProcessing
          : isProcessing // ignore: cast_nullable_to_non_nullable
              as bool,
      transcribedText: null == transcribedText
          ? _value.transcribedText
          : transcribedText // ignore: cast_nullable_to_non_nullable
              as String,
      soundLevel: null == soundLevel
          ? _value.soundLevel
          : soundLevel // ignore: cast_nullable_to_non_nullable
              as double,
      errorMessage: freezed == errorMessage
          ? _value.errorMessage
          : errorMessage // ignore: cast_nullable_to_non_nullable
              as String?,
      errorCode: freezed == errorCode
          ? _value.errorCode
          : errorCode // ignore: cast_nullable_to_non_nullable
              as String?,
      locale: null == locale
          ? _value.locale
          : locale // ignore: cast_nullable_to_non_nullable
              as String,
    ));
  }
}

/// @nodoc

class _$SpeechStateImpl extends _SpeechState {
  const _$SpeechStateImpl(
      {this.isAvailable = false,
      this.isListening = false,
      this.isProcessing = false,
      this.transcribedText = '',
      this.soundLevel = 0.0,
      this.errorMessage,
      this.errorCode,
      this.locale = 'en_US'})
      : super._();

  /// Whether speech recognition is available on this device
  @override
  @JsonKey()
  final bool isAvailable;

  /// Whether currently listening for speech
  @override
  @JsonKey()
  final bool isListening;

  /// Whether processing the recorded audio
  @override
  @JsonKey()
  final bool isProcessing;

  /// The transcribed text from speech
  @override
  @JsonKey()
  final String transcribedText;

  /// Current sound level (0.0 to 1.0) for visual feedback
  @override
  @JsonKey()
  final double soundLevel;

  /// Error message if speech recognition failed
  @override
  final String? errorMessage;

  /// Error code for programmatic handling
  @override
  final String? errorCode;

  /// Selected locale for speech recognition
  @override
  @JsonKey()
  final String locale;

  @override
  String toString() {
    return 'SpeechState(isAvailable: $isAvailable, isListening: $isListening, isProcessing: $isProcessing, transcribedText: $transcribedText, soundLevel: $soundLevel, errorMessage: $errorMessage, errorCode: $errorCode, locale: $locale)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$SpeechStateImpl &&
            (identical(other.isAvailable, isAvailable) ||
                other.isAvailable == isAvailable) &&
            (identical(other.isListening, isListening) ||
                other.isListening == isListening) &&
            (identical(other.isProcessing, isProcessing) ||
                other.isProcessing == isProcessing) &&
            (identical(other.transcribedText, transcribedText) ||
                other.transcribedText == transcribedText) &&
            (identical(other.soundLevel, soundLevel) ||
                other.soundLevel == soundLevel) &&
            (identical(other.errorMessage, errorMessage) ||
                other.errorMessage == errorMessage) &&
            (identical(other.errorCode, errorCode) ||
                other.errorCode == errorCode) &&
            (identical(other.locale, locale) || other.locale == locale));
  }

  @override
  int get hashCode => Object.hash(
      runtimeType,
      isAvailable,
      isListening,
      isProcessing,
      transcribedText,
      soundLevel,
      errorMessage,
      errorCode,
      locale);

  /// Create a copy of SpeechState
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  @pragma('vm:prefer-inline')
  _$$SpeechStateImplCopyWith<_$SpeechStateImpl> get copyWith =>
      __$$SpeechStateImplCopyWithImpl<_$SpeechStateImpl>(this, _$identity);
}

abstract class _SpeechState extends SpeechState {
  const factory _SpeechState(
      {final bool isAvailable,
      final bool isListening,
      final bool isProcessing,
      final String transcribedText,
      final double soundLevel,
      final String? errorMessage,
      final String? errorCode,
      final String locale}) = _$SpeechStateImpl;
  const _SpeechState._() : super._();

  /// Whether speech recognition is available on this device
  @override
  bool get isAvailable;

  /// Whether currently listening for speech
  @override
  bool get isListening;

  /// Whether processing the recorded audio
  @override
  bool get isProcessing;

  /// The transcribed text from speech
  @override
  String get transcribedText;

  /// Current sound level (0.0 to 1.0) for visual feedback
  @override
  double get soundLevel;

  /// Error message if speech recognition failed
  @override
  String? get errorMessage;

  /// Error code for programmatic handling
  @override
  String? get errorCode;

  /// Selected locale for speech recognition
  @override
  String get locale;

  /// Create a copy of SpeechState
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  _$$SpeechStateImplCopyWith<_$SpeechStateImpl> get copyWith =>
      throw _privateConstructorUsedError;
}
