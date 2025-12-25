import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:unified_flutter/features/chat/widgets/chat_input.dart';

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
    }) {
      return MaterialApp(
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
      );
    }

    testWidgets('renders text field with correct hint', (tester) async {
      await tester.pumpWidget(buildTestWidget());

      expect(find.byType(TextField), findsOneWidget);
      expect(find.text('Type a message...'), findsOneWidget);
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
