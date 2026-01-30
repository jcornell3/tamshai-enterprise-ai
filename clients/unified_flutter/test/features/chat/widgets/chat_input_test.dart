import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:unified_flutter/features/chat/widgets/chat_input.dart';
import 'package:unified_flutter/core/speech/providers/speech_provider.dart';
import 'package:unified_flutter/core/speech/models/speech_state.dart';

void main() {
  group('ChatInput', () {
    late TextEditingController controller;
    late FocusNode focusNode;

    setUp(() {
      controller = TextEditingController();
      focusNode = FocusNode();
    });

    tearDown(() {
      controller.dispose();
      focusNode.dispose();
    });

    Widget buildTestWidget({
      bool isLoading = false,
      bool isStreaming = false,
      VoidCallback? onSend,
      VoidCallback? onCancel,
      SpeechState? mockSpeechState,
    }) {
      // Default speech state for testing
      final speechState = mockSpeechState ?? const SpeechState();

      return ProviderScope(
        overrides: [
          // Override the speech provider with a test notifier (Riverpod 3.x pattern)
          speechProvider.overrideWith(() => TestSpeechNotifier(speechState)),
        ],
        child: MaterialApp(
          theme: ThemeData.light(useMaterial3: true),
          home: Scaffold(
            body: ChatInput(
              controller: controller,
              focusNode: focusNode,
              isLoading: isLoading,
              isStreaming: isStreaming,
              onSend: onSend ?? () {},
              onCancel: onCancel ?? () {},
            ),
          ),
        ),
      );
    }

    testWidgets('renders text field with correct hint', (tester) async {
      await tester.pumpWidget(buildTestWidget());

      expect(find.byType(TextField), findsOneWidget);
      expect(find.text('Type a message or hold mic to speak...'), findsOneWidget);
    });

    testWidgets('shows streaming hint when streaming', (tester) async {
      await tester.pumpWidget(buildTestWidget(isStreaming: true));

      expect(find.text('AI is responding...'), findsOneWidget);
    });

    testWidgets('shows send button in normal state', (tester) async {
      await tester.pumpWidget(buildTestWidget());

      expect(find.byIcon(Icons.send), findsOneWidget);
    });

    testWidgets('shows loading indicator when loading', (tester) async {
      await tester.pumpWidget(buildTestWidget(isLoading: true));

      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      expect(find.byIcon(Icons.send), findsNothing);
    });

    testWidgets('shows stop button when streaming', (tester) async {
      await tester.pumpWidget(buildTestWidget(isStreaming: true));

      expect(find.byIcon(Icons.stop), findsOneWidget);
      expect(find.byIcon(Icons.send), findsNothing);
    });

    testWidgets('calls onSend when send button is tapped', (tester) async {
      var sendCalled = false;

      await tester.pumpWidget(buildTestWidget(
        onSend: () => sendCalled = true,
      ));

      await tester.tap(find.byIcon(Icons.send));
      expect(sendCalled, isTrue);
    });

    testWidgets('calls onCancel when stop button is tapped', (tester) async {
      var cancelCalled = false;

      await tester.pumpWidget(buildTestWidget(
        isStreaming: true,
        onCancel: () => cancelCalled = true,
      ));

      await tester.tap(find.byIcon(Icons.stop));
      expect(cancelCalled, isTrue);
    });

    testWidgets('text field is disabled when loading', (tester) async {
      await tester.pumpWidget(buildTestWidget(isLoading: true));

      final textField = tester.widget<TextField>(find.byType(TextField));
      expect(textField.enabled, isFalse);
    });

    testWidgets('text field is enabled when not loading', (tester) async {
      await tester.pumpWidget(buildTestWidget(isLoading: false));

      final textField = tester.widget<TextField>(find.byType(TextField));
      expect(textField.enabled, isTrue);
    });

    testWidgets('can enter text in text field', (tester) async {
      await tester.pumpWidget(buildTestWidget());

      await tester.enterText(find.byType(TextField), 'Hello, AI!');
      expect(controller.text, 'Hello, AI!');
    });

    testWidgets('send button has correct tooltip', (tester) async {
      await tester.pumpWidget(buildTestWidget());

      expect(find.byTooltip('Send message'), findsOneWidget);
    });

    testWidgets('stop button has correct tooltip', (tester) async {
      await tester.pumpWidget(buildTestWidget(isStreaming: true));

      expect(find.byTooltip('Stop generating'), findsOneWidget);
    });

    testWidgets('container has correct constraints', (tester) async {
      await tester.pumpWidget(buildTestWidget());

      final container = tester.widget<Container>(
        find
            .descendant(
              of: find.byType(ChatInput),
              matching: find.byType(Container),
            )
            .at(1),
      );

      expect(container.constraints?.maxHeight, 150);
    });
  });
}

/// Test speech notifier for mocking speech provider (Riverpod 3.x pattern)
///
/// This mock prevents actual speech recognition from running during tests.
/// In Riverpod 3.x, Notifiers don't have constructor parameters - instead
/// we override build() to return the initial state.
class TestSpeechNotifier extends SpeechNotifier {
  final SpeechState _initialState;

  TestSpeechNotifier(this._initialState);

  @override
  SpeechState build() {
    // Return mock state instead of initializing real speech recognition
    return _initialState;
  }

  @override
  Future<bool> startListening() async {
    // Don't actually start speech recognition in tests
    state = state.copyWith(isListening: true);
    return true;
  }

  @override
  Future<void> stopListening() async {
    // Don't actually stop speech recognition in tests
    state = state.copyWith(isListening: false);
  }

  @override
  Future<void> cancelListening() async {
    // Don't actually cancel speech recognition in tests
    state = state.copyWith(isListening: false);
  }
}
