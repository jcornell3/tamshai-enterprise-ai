/// Utility for parsing display directives from AI responses
///
/// Directives follow the format: display:<domain>:<component>:<params>
/// Example: display:hr:org_chart:userId=me,depth=1
class DirectiveParser {
  /// Regular expression to match display directives
  /// Matches: display:domain:component:key=value,key=value
  static final RegExp _directivePattern = RegExp(
    r'display:(\w+):(\w+):([^\s]+)',
    caseSensitive: false,
  );

  /// Check if text contains a display directive
  static bool containsDirective(String text) {
    return _directivePattern.hasMatch(text);
  }

  /// Parse a display directive from text
  /// Returns null if no valid directive is found
  static ParsedDirective? parse(String text) {
    final match = _directivePattern.firstMatch(text);
    if (match == null) return null;

    final domain = match.group(1)!;
    final component = match.group(2)!;
    final paramsStr = match.group(3)!;

    // Parse key=value pairs
    final params = <String, String>{};
    for (final pair in paramsStr.split(',')) {
      final parts = pair.split('=');
      if (parts.length == 2) {
        params[parts[0].trim()] = parts[1].trim();
      }
    }

    return ParsedDirective(
      fullMatch: match.group(0)!,
      domain: domain,
      component: component,
      params: params,
    );
  }

  /// Extract text before and after the directive
  static DirectiveContext? extractContext(String text) {
    final match = _directivePattern.firstMatch(text);
    if (match == null) return null;

    return DirectiveContext(
      textBefore: text.substring(0, match.start).trim(),
      textAfter: text.substring(match.end).trim(),
      directive: parse(text)!,
    );
  }
}

/// Parsed display directive
class ParsedDirective {
  /// The full matched directive string
  final String fullMatch;

  /// The domain (e.g., 'hr', 'sales', 'finance')
  final String domain;

  /// The component type (e.g., 'org_chart', 'customer', 'budget')
  final String component;

  /// Parsed parameters
  final Map<String, String> params;

  const ParsedDirective({
    required this.fullMatch,
    required this.domain,
    required this.component,
    required this.params,
  });

  /// Convert to API directive format
  String toApiDirective() => fullMatch;

  @override
  String toString() => 'ParsedDirective($fullMatch)';
}

/// Context around a directive including surrounding text
class DirectiveContext {
  final String textBefore;
  final String textAfter;
  final ParsedDirective directive;

  const DirectiveContext({
    required this.textBefore,
    required this.textAfter,
    required this.directive,
  });

  bool get hasTextBefore => textBefore.isNotEmpty;
  bool get hasTextAfter => textAfter.isNotEmpty;
}
