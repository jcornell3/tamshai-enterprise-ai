import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:unified_flutter/core/chat/models/chat_state.dart';
import 'package:unified_flutter/features/chat/widgets/message_bubble.dart';

void main() {
  group('MessageBubble', () {
    Widget buildTestWidget(ChatMessage message, {VoidCallback? onCopy}) {
      return MaterialApp(
        theme: ThemeData.light(useMaterial3: true),
        home: Scaffold(
          body: SingleChildScrollView(
            child: MessageBubble(
              message: message,
              onCopy: onCopy,
            ),
          ),
        ),
      );
    }

    testWidgets('displays user message correctly', (tester) async {
      final message = ChatMessage(
        id: '1',
        content: 'Hello, AI!',
        role: MessageRole.user,
        timestamp: DateTime.now(),
      );

      await tester.pumpWidget(buildTestWidget(message));

      expect(find.text('Hello, AI!'), findsOneWidget);
      expect(find.byIcon(Icons.person), findsOneWidget);
    });

    testWidgets('displays assistant message correctly', (tester) async {
      final message = ChatMessage(
        id: '2',
        content: 'Hello! How can I help you today?',
        role: MessageRole.assistant,
        timestamp: DateTime.now(),
      );

      await tester.pumpWidget(buildTestWidget(message));

      expect(find.text('Hello! How can I help you today?'), findsOneWidget);
      expect(find.byIcon(Icons.smart_toy), findsOneWidget);
    });

    testWidgets('displays system message correctly', (tester) async {
      final message = ChatMessage(
        id: '3',
        content: 'System notification',
        role: MessageRole.system,
        timestamp: DateTime.now(),
      );

      await tester.pumpWidget(buildTestWidget(message));

      expect(find.text('System notification'), findsOneWidget);
      expect(find.byIcon(Icons.info), findsOneWidget);
    });

    testWidgets('shows streaming indicator when message is streaming',
        (tester) async {
      final message = ChatMessage(
        id: '4',
        content: 'Generating response',
        role: MessageRole.assistant,
        timestamp: DateTime.now(),
        isStreaming: true,
      );

      await tester.pumpWidget(buildTestWidget(message));

      expect(find.text('Thinking...'), findsOneWidget);
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
    });

    testWidgets('shows ellipsis for empty streaming message', (tester) async {
      final message = ChatMessage(
        id: '5',
        content: '',
        role: MessageRole.assistant,
        timestamp: DateTime.now(),
        isStreaming: true,
      );

      await tester.pumpWidget(buildTestWidget(message));

      expect(find.text('...'), findsOneWidget);
    });

    testWidgets('displays truncation warning when truncated', (tester) async {
      final message = ChatMessage(
        id: '6',
        content: 'Here are the first 50 employees...',
        role: MessageRole.assistant,
        timestamp: DateTime.now(),
        isTruncated: true,
        truncationWarning: 'Only 50 of 150+ records shown.',
      );

      await tester.pumpWidget(buildTestWidget(message));

      expect(find.text('Only 50 of 150+ records shown.'), findsOneWidget);
      expect(find.byIcon(Icons.warning_amber), findsOneWidget);
    });

    testWidgets('shows copy button for assistant messages with callback',
        (tester) async {
      var copyPressed = false;
      final message = ChatMessage(
        id: '7',
        content: 'Copy this text',
        role: MessageRole.assistant,
        timestamp: DateTime.now(),
      );

      await tester.pumpWidget(buildTestWidget(
        message,
        onCopy: () => copyPressed = true,
      ));

      expect(find.byIcon(Icons.copy), findsOneWidget);

      await tester.tap(find.byIcon(Icons.copy));
      expect(copyPressed, isTrue);
    });

    testWidgets('does not show copy button for user messages', (tester) async {
      final message = ChatMessage(
        id: '8',
        content: 'User message',
        role: MessageRole.user,
        timestamp: DateTime.now(),
      );

      await tester.pumpWidget(buildTestWidget(message, onCopy: () {}));

      expect(find.byIcon(Icons.copy), findsNothing);
    });

    testWidgets('formats timestamp correctly for today', (tester) async {
      final now = DateTime.now();
      final message = ChatMessage(
        id: '9',
        content: 'Test',
        role: MessageRole.user,
        timestamp: now,
      );

      await tester.pumpWidget(buildTestWidget(message));

      final expectedTime =
          '${now.hour.toString().padLeft(2, '0')}:${now.minute.toString().padLeft(2, '0')}';
      expect(find.text(expectedTime), findsOneWidget);
    });

    testWidgets('formats timestamp with date for previous days',
        (tester) async {
      final yesterday = DateTime.now().subtract(const Duration(days: 1));
      final message = ChatMessage(
        id: '10',
        content: 'Test',
        role: MessageRole.user,
        timestamp: yesterday,
      );

      await tester.pumpWidget(buildTestWidget(message));

      final expectedTime =
          '${yesterday.hour.toString().padLeft(2, '0')}:${yesterday.minute.toString().padLeft(2, '0')}';
      final expectedDate = '${yesterday.month}/${yesterday.day} $expectedTime';
      expect(find.text(expectedDate), findsOneWidget);
    });

    testWidgets('user messages are aligned to the right', (tester) async {
      final message = ChatMessage(
        id: '11',
        content: 'User message',
        role: MessageRole.user,
        timestamp: DateTime.now(),
      );

      await tester.pumpWidget(buildTestWidget(message));

      final row = tester.widget<Row>(find.byType(Row).first);
      expect(row.mainAxisAlignment, MainAxisAlignment.end);
    });

    testWidgets('assistant messages are aligned to the left', (tester) async {
      final message = ChatMessage(
        id: '12',
        content: 'Assistant message',
        role: MessageRole.assistant,
        timestamp: DateTime.now(),
      );

      await tester.pumpWidget(buildTestWidget(message));

      final row = tester.widget<Row>(find.byType(Row).first);
      expect(row.mainAxisAlignment, MainAxisAlignment.start);
    });
  });
}
