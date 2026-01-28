import 'package:freezed_annotation/freezed_annotation.dart';

part 'speech_state.freezed.dart';

/// Speech recognition state (v1.5 Voice Input)
@freezed
abstract class SpeechState with _$SpeechState {
  const factory SpeechState({
    /// Whether speech recognition is available on this device
    @Default(false) bool isAvailable,

    /// Whether currently listening for speech
    @Default(false) bool isListening,

    /// Whether processing the recorded audio
    @Default(false) bool isProcessing,

    /// The transcribed text from speech
    @Default('') String transcribedText,

    /// Current sound level (0.0 to 1.0) for visual feedback
    @Default(0.0) double soundLevel,

    /// Error message if speech recognition failed
    String? errorMessage,

    /// Error code for programmatic handling
    String? errorCode,

    /// Selected locale for speech recognition
    @Default('en_US') String locale,
  }) = _SpeechState;

  const SpeechState._();

  /// Whether there's an error state
  bool get hasError => errorMessage != null;

  /// Whether speech is in any active state
  bool get isActive => isListening || isProcessing;
}

/// Speech recognition error codes
class SpeechErrorCodes {
  static const String permissionDenied = 'PERMISSION_DENIED';
  static const String serviceUnavailable = 'SERVICE_UNAVAILABLE';
  static const String noSpeechDetected = 'NO_SPEECH_DETECTED';
  static const String networkError = 'NETWORK_ERROR';
  static const String timeout = 'TIMEOUT';
  static const String unknown = 'UNKNOWN';
}
