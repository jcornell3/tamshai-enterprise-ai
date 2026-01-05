import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:logger/logger.dart';
import 'package:speech_to_text/speech_to_text.dart';
import 'package:speech_to_text/speech_recognition_error.dart';
import 'package:speech_to_text/speech_recognition_result.dart';
import '../../auth/providers/auth_provider.dart';
import '../models/speech_state.dart';

/// Speech configuration constants
class SpeechConfig {
  /// Silence timeout - stop listening after this duration of silence
  static const Duration silenceTimeout = Duration(seconds: 3);

  /// Maximum recording duration
  static const Duration maxDuration = Duration(seconds: 60);

  /// Minimum sound level to consider as speech
  static const double minSoundLevel = 0.1;
}

/// Speech recognition service provider
final speechProvider = StateNotifierProvider<SpeechNotifier, SpeechState>((ref) {
  return SpeechNotifier(
    logger: ref.watch(loggerProvider),
  );
});

/// Speech recognition state notifier
///
/// Manages voice-to-text functionality with:
/// - Configurable silence timeout (3 seconds)
/// - Maximum recording duration (60 seconds)
/// - Sound level feedback for UI visualization
/// - Graceful error handling
class SpeechNotifier extends StateNotifier<SpeechState> {
  final SpeechToText _speech = SpeechToText();
  final Logger _logger;
  Timer? _silenceTimer;
  Timer? _maxDurationTimer;

  SpeechNotifier({
    Logger? logger,
  })  : _logger = logger ?? Logger(),
        super(const SpeechState()) {
    _initialize();
  }

  /// Initialize the speech recognition service
  Future<void> _initialize() async {
    try {
      final available = await _speech.initialize(
        onStatus: _onStatus,
        onError: _onError,
        debugLogging: false,
      );

      state = state.copyWith(
        isAvailable: available,
        errorMessage: available ? null : 'Speech recognition not available',
        errorCode: available ? null : SpeechErrorCodes.serviceUnavailable,
      );

      if (available) {
        _logger.i('Speech recognition initialized successfully');

        // Get available locales (optional - for future locale selection)
        final locales = await _speech.locales();
        _logger.d('Available locales: ${locales.map((l) => l.localeId).join(', ')}');
      } else {
        _logger.w('Speech recognition not available on this device');
      }
    } catch (e, stackTrace) {
      _logger.e('Failed to initialize speech recognition', error: e, stackTrace: stackTrace);
      state = state.copyWith(
        isAvailable: false,
        errorMessage: 'Failed to initialize: $e',
        errorCode: SpeechErrorCodes.unknown,
      );
    }
  }

  /// Start listening for speech
  ///
  /// Returns true if listening started successfully
  Future<bool> startListening() async {
    if (!state.isAvailable) {
      _logger.w('Cannot start listening: speech recognition not available');
      return false;
    }

    if (state.isListening) {
      _logger.w('Already listening');
      return true;
    }

    try {
      // Clear any previous state
      state = state.copyWith(
        transcribedText: '',
        errorMessage: null,
        errorCode: null,
        isProcessing: false,
      );

      // Start listening with options
      await _speech.listen(
        onResult: _onResult,
        onSoundLevelChange: _onSoundLevelChange,
        listenFor: SpeechConfig.maxDuration,
        pauseFor: SpeechConfig.silenceTimeout,
        localeId: state.locale,
        listenOptions: SpeechListenOptions(
          cancelOnError: true,
          partialResults: true,
          listenMode: ListenMode.dictation,
        ),
      );

      state = state.copyWith(isListening: true);

      // Start max duration timer as backup
      _maxDurationTimer?.cancel();
      _maxDurationTimer = Timer(SpeechConfig.maxDuration, () {
        _logger.i('Max duration reached, stopping');
        stopListening();
      });

      _logger.i('Started listening for speech');
      return true;
    } catch (e, stackTrace) {
      _logger.e('Failed to start listening', error: e, stackTrace: stackTrace);
      state = state.copyWith(
        errorMessage: 'Failed to start listening: $e',
        errorCode: SpeechErrorCodes.unknown,
      );
      return false;
    }
  }

  /// Stop listening and process the transcribed text
  Future<void> stopListening() async {
    if (!state.isListening) return;

    _cancelTimers();

    try {
      state = state.copyWith(
        isListening: false,
        isProcessing: true,
      );

      await _speech.stop();

      // Brief delay to ensure final results are received
      await Future.delayed(const Duration(milliseconds: 100));

      state = state.copyWith(isProcessing: false);
      _logger.i('Stopped listening, transcribed: "${state.transcribedText}"');
    } catch (e, stackTrace) {
      _logger.e('Error stopping speech recognition', error: e, stackTrace: stackTrace);
      state = state.copyWith(
        isListening: false,
        isProcessing: false,
      );
    }
  }

  /// Cancel listening without processing (discard transcription)
  Future<void> cancelListening() async {
    _cancelTimers();

    try {
      await _speech.cancel();

      state = state.copyWith(
        isListening: false,
        isProcessing: false,
        transcribedText: '',
        soundLevel: 0.0,
      );

      _logger.i('Cancelled speech recognition');
    } catch (e, stackTrace) {
      _logger.e('Error cancelling speech recognition', error: e, stackTrace: stackTrace);
      state = state.copyWith(
        isListening: false,
        isProcessing: false,
      );
    }
  }

  /// Clear the transcribed text
  void clearTranscription() {
    state = state.copyWith(transcribedText: '');
  }

  /// Clear any error state
  void clearError() {
    state = state.copyWith(
      errorMessage: null,
      errorCode: null,
    );
  }

  /// Handle speech recognition results
  void _onResult(SpeechRecognitionResult result) {
    state = state.copyWith(
      transcribedText: result.recognizedWords,
    );

    _logger.d('Speech result: "${result.recognizedWords}" (final: ${result.finalResult})');

    // If this is the final result, stop listening
    if (result.finalResult && state.isListening) {
      stopListening();
    }
  }

  /// Handle sound level changes for visual feedback
  void _onSoundLevelChange(double level) {
    // Normalize level to 0.0 - 1.0 range
    // speech_to_text returns dB values, typically -2 to 10
    final normalized = ((level + 2) / 12).clamp(0.0, 1.0);

    state = state.copyWith(soundLevel: normalized);
  }

  /// Handle status changes from speech recognition
  void _onStatus(String status) {
    _logger.d('Speech status: $status');

    if (status == 'done' || status == 'notListening') {
      if (state.isListening) {
        state = state.copyWith(
          isListening: false,
          isProcessing: false,
          soundLevel: 0.0,
        );
      }
    }
  }

  /// Handle errors from speech recognition
  void _onError(SpeechRecognitionError error) {
    _logger.e('Speech recognition error: ${error.errorMsg} (${error.permanent})');

    String errorCode;
    String errorMessage;

    switch (error.errorMsg) {
      case 'error_permission':
        errorCode = SpeechErrorCodes.permissionDenied;
        errorMessage = 'Microphone permission denied. Please enable in settings.';
        break;
      case 'error_no_match':
      case 'error_speech_timeout':
        errorCode = SpeechErrorCodes.noSpeechDetected;
        errorMessage = 'No speech detected. Please try again.';
        break;
      case 'error_network':
      case 'error_network_timeout':
        errorCode = SpeechErrorCodes.networkError;
        errorMessage = 'Network error. Please check your connection.';
        break;
      case 'error_audio':
      case 'error_busy':
      case 'error_client':
        errorCode = SpeechErrorCodes.serviceUnavailable;
        errorMessage = 'Speech service unavailable. Please try again.';
        break;
      default:
        errorCode = SpeechErrorCodes.unknown;
        errorMessage = 'Speech recognition error: ${error.errorMsg}';
    }

    state = state.copyWith(
      isListening: false,
      isProcessing: false,
      soundLevel: 0.0,
      errorMessage: errorMessage,
      errorCode: errorCode,
    );

    _cancelTimers();
  }

  /// Cancel all active timers
  void _cancelTimers() {
    _silenceTimer?.cancel();
    _silenceTimer = null;
    _maxDurationTimer?.cancel();
    _maxDurationTimer = null;
  }

  @override
  void dispose() {
    _cancelTimers();
    _speech.stop();
    super.dispose();
  }
}
