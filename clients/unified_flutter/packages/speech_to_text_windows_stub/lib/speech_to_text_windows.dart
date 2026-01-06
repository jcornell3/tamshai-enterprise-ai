// Stub implementation of speech_to_text_windows
// This is a no-op implementation to allow Windows builds without the
// beta speech_to_text_windows package which has broken FFI registration.

import 'package:flutter/foundation.dart';
import 'package:speech_to_text_platform_interface/speech_to_text_platform_interface.dart';

/// Stub Windows implementation of speech_to_text.
///
/// This implementation returns [isAvailable: false] so the app gracefully
/// handles the lack of speech recognition on Windows.
class SpeechToTextWindows extends SpeechToTextPlatform {
  /// Registers this class as the default instance of [SpeechToTextPlatform].
  static void registerWith() {
    SpeechToTextPlatform.instance = SpeechToTextWindows();
    debugPrint('SpeechToTextWindows stub registered - speech not available on Windows');
  }

  @override
  Future<bool> initialize({
    dynamic debugLogging,
    List<dynamic>? options,
  }) async {
    return false; // Speech not available
  }

  @override
  Future<bool> hasPermission() async {
    return false;
  }

  @override
  Future<bool> listen({
    String? localeId,
    dynamic partialResults,
    dynamic onDevice,
    dynamic listenMode,
    dynamic sampleRate,
    dynamic options,
  }) async {
    return false;
  }

  @override
  Future<bool> stop() async {
    return true;
  }

  @override
  Future<bool> cancel() async {
    return true;
  }

  @override
  Future<List<dynamic>> locales() async {
    return [];
  }
}
