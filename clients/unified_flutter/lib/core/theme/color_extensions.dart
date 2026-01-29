import 'package:flutter/material.dart';

/// Extension for warning colors (Material 3 supplement)
///
/// Material 3's ColorScheme doesn't include warning colors by default.
/// This extension adds amber-based warning colors consistent with
/// Material Design's semantic color guidelines.
extension WarningColors on ColorScheme {
  /// Container color for warning elements (amber background)
  Color get warningContainer => const Color(0xFFFFF3CD);

  /// On-container color for warning elements (dark amber text/icons)
  Color get onWarningContainer => const Color(0xFF856404);
}
