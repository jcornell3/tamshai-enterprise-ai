import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:unified_flutter/core/chat/models/chat_state.dart';
import 'package:unified_flutter/features/chat/widgets/approval_card.dart';

void main() {
  group('ApprovalCard', () {
    Widget buildTestWidget({
      required PendingConfirmation confirmation,
      VoidCallback? onApprove,
      VoidCallback? onReject,
    }) {
      return MaterialApp(
        theme: ThemeData.light(useMaterial3: true),
        home: Scaffold(
          body: SingleChildScrollView(
            child: ApprovalCard(
              confirmation: confirmation,
              onApprove: onApprove ?? () {},
              onReject: onReject ?? () {},
            ),
          ),
        ),
      );
    }

    testWidgets('displays confirmation header', (tester) async {
      final confirmation = PendingConfirmation(
        confirmationId: 'test-123',
        message: 'Delete this record?',
        action: 'delete_employee',
      );

      await tester.pumpWidget(buildTestWidget(confirmation: confirmation));

      expect(find.text('Confirmation Required'), findsOneWidget);
      expect(find.byIcon(Icons.warning_amber_rounded), findsOneWidget);
    });

    testWidgets('displays formatted action name', (tester) async {
      final confirmation = PendingConfirmation(
        confirmationId: 'test-123',
        message: 'Delete this record?',
        action: 'delete_employee',
      );

      await tester.pumpWidget(buildTestWidget(confirmation: confirmation));

      expect(find.text('Action: Delete Employee'), findsOneWidget);
    });

    testWidgets('displays confirmation message', (tester) async {
      final confirmation = PendingConfirmation(
        confirmationId: 'test-123',
        message: 'Are you sure you want to delete employee John Doe?',
        action: 'delete_employee',
      );

      await tester.pumpWidget(buildTestWidget(confirmation: confirmation));

      expect(
        find.text('Are you sure you want to delete employee John Doe?'),
        findsOneWidget,
      );
    });

    testWidgets('displays approve and cancel buttons', (tester) async {
      final confirmation = PendingConfirmation(
        confirmationId: 'test-123',
        message: 'Delete this record?',
        action: 'delete_employee',
      );

      await tester.pumpWidget(buildTestWidget(confirmation: confirmation));

      expect(find.text('Approve'), findsOneWidget);
      expect(find.text('Cancel'), findsOneWidget);
      expect(find.byIcon(Icons.check), findsOneWidget);
      expect(find.byIcon(Icons.close), findsOneWidget);
    });

    testWidgets('calls onApprove when approve button is tapped',
        (tester) async {
      var approveCalled = false;
      final confirmation = PendingConfirmation(
        confirmationId: 'test-123',
        message: 'Delete this record?',
        action: 'delete_employee',
      );

      await tester.pumpWidget(buildTestWidget(
        confirmation: confirmation,
        onApprove: () => approveCalled = true,
      ));

      await tester.tap(find.text('Approve'));
      expect(approveCalled, isTrue);
    });

    testWidgets('calls onReject when cancel button is tapped', (tester) async {
      var rejectCalled = false;
      final confirmation = PendingConfirmation(
        confirmationId: 'test-123',
        message: 'Delete this record?',
        action: 'delete_employee',
      );

      await tester.pumpWidget(buildTestWidget(
        confirmation: confirmation,
        onReject: () => rejectCalled = true,
      ));

      await tester.tap(find.text('Cancel'));
      expect(rejectCalled, isTrue);
    });

    testWidgets('displays confirmation data details when provided',
        (tester) async {
      final confirmation = PendingConfirmation(
        confirmationId: 'test-123',
        message: 'Delete this record?',
        action: 'delete_employee',
        confirmationData: {
          'employeeId': 'emp-001',
          'employeeName': 'John Doe',
          'department': 'Engineering',
        },
      );

      await tester.pumpWidget(buildTestWidget(confirmation: confirmation));

      expect(find.text('Details'), findsOneWidget);
      expect(find.text('emp-001'), findsOneWidget);
      expect(find.text('John Doe'), findsOneWidget);
      expect(find.text('Engineering'), findsOneWidget);
    });

    testWidgets('formats camelCase keys correctly', (tester) async {
      final confirmation = PendingConfirmation(
        confirmationId: 'test-123',
        message: 'Delete this record?',
        action: 'delete_employee',
        confirmationData: {
          'employeeId': 'emp-001',
          'firstName': 'John',
        },
      );

      await tester.pumpWidget(buildTestWidget(confirmation: confirmation));

      // employeeId -> Employee Id
      expect(find.textContaining('Employee Id'), findsOneWidget);
      // firstName -> First Name
      expect(find.textContaining('First Name'), findsOneWidget);
    });

    testWidgets('displays expiry warning', (tester) async {
      final confirmation = PendingConfirmation(
        confirmationId: 'test-123',
        message: 'Delete this record?',
        action: 'delete_employee',
      );

      await tester.pumpWidget(buildTestWidget(confirmation: confirmation));

      expect(
        find.text('This confirmation expires in 5 minutes'),
        findsOneWidget,
      );
      expect(find.byIcon(Icons.timer_outlined), findsOneWidget);
    });

    testWidgets('does not show details section when confirmationData is null',
        (tester) async {
      final confirmation = PendingConfirmation(
        confirmationId: 'test-123',
        message: 'Delete this record?',
        action: 'delete_employee',
        confirmationData: null,
      );

      await tester.pumpWidget(buildTestWidget(confirmation: confirmation));

      expect(find.text('Details'), findsNothing);
    });

    testWidgets(
        'does not show details section when confirmationData is empty',
        (tester) async {
      final confirmation = PendingConfirmation(
        confirmationId: 'test-123',
        message: 'Delete this record?',
        action: 'delete_employee',
        confirmationData: {},
      );

      await tester.pumpWidget(buildTestWidget(confirmation: confirmation));

      expect(find.text('Details'), findsNothing);
    });

    testWidgets('formats different action types correctly', (tester) async {
      final actions = {
        'delete_record': 'Delete Record',
        'update_salary': 'Update Salary',
        'approve_request': 'Approve Request',
        'execute_transfer': 'Execute Transfer',
      };

      for (final entry in actions.entries) {
        final confirmation = PendingConfirmation(
          confirmationId: 'test-123',
          message: 'Test action',
          action: entry.key,
        );

        await tester.pumpWidget(buildTestWidget(confirmation: confirmation));

        expect(find.text('Action: ${entry.value}'), findsOneWidget);
      }
    });
  });
}
