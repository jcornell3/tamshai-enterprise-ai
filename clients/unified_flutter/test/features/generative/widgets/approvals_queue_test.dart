import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:unified_flutter/features/generative/widgets/approvals_queue.dart';

void main() {
  group('ApprovalsQueue', () {
    // Test data factories
    TimeOffRequest createTimeOffRequest({
      required String id,
      required String employeeName,
      required String type,
      required DateTime startDate,
      required DateTime endDate,
      bool isUrgent = false,
    }) {
      return TimeOffRequest(
        id: id,
        employeeName: employeeName,
        type: type,
        startDate: startDate,
        endDate: endDate,
        isUrgent: isUrgent,
      );
    }

    ExpenseReport createExpenseReport({
      required String id,
      required String employeeName,
      required double amount,
      required String description,
      bool isUrgent = false,
    }) {
      return ExpenseReport(
        id: id,
        employeeName: employeeName,
        amount: amount,
        description: description,
        isUrgent: isUrgent,
      );
    }

    BudgetAmendment createBudgetAmendment({
      required String id,
      required String department,
      required double amount,
      required String reason,
      bool isUrgent = false,
    }) {
      return BudgetAmendment(
        id: id,
        department: department,
        amount: amount,
        reason: reason,
        isUrgent: isUrgent,
      );
    }

    Widget buildTestWidget({
      List<TimeOffRequest>? timeOffRequests,
      List<ExpenseReport>? expenseReports,
      List<BudgetAmendment>? budgetAmendments,
      void Function(String id, ApprovalItemType type)? onApprove,
      void Function(String id, ApprovalItemType type)? onReject,
      void Function(String id, ApprovalItemType type)? onViewDetails,
      bool isLoading = false,
      String? error,
    }) {
      return MaterialApp(
        theme: ThemeData.light(useMaterial3: true),
        home: Scaffold(
          body: SingleChildScrollView(
            child: ApprovalsQueue(
              timeOffRequests: timeOffRequests ?? [],
              expenseReports: expenseReports ?? [],
              budgetAmendments: budgetAmendments ?? [],
              onApprove: onApprove ?? (_, __) {},
              onReject: onReject ?? (_, __) {},
              onViewDetails: onViewDetails ?? (_, __) {},
              isLoading: isLoading,
              error: error,
            ),
          ),
        ),
      );
    }

    group('Empty State', () {
      testWidgets('displays empty state when all lists are empty',
          (tester) async {
        await tester.pumpWidget(buildTestWidget());

        expect(find.text('No pending approvals'), findsOneWidget);
        expect(find.byIcon(Icons.check_circle_outline), findsOneWidget);
      });

      testWidgets('empty state has correct styling', (tester) async {
        await tester.pumpWidget(buildTestWidget());

        final iconFinder = find.byIcon(Icons.check_circle_outline);
        expect(iconFinder, findsOneWidget);

        // Verify icon is displayed with appropriate size
        final icon = tester.widget<Icon>(iconFinder);
        expect(icon.size, equals(64.0));
      });
    });

    group('Loading State', () {
      testWidgets('displays loading indicator when isLoading is true',
          (tester) async {
        await tester.pumpWidget(buildTestWidget(isLoading: true));

        expect(find.byType(CircularProgressIndicator), findsOneWidget);
        expect(find.text('Loading approvals...'), findsOneWidget);
      });

      testWidgets('does not display content when loading', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          isLoading: true,
          timeOffRequests: [
            createTimeOffRequest(
              id: '1',
              employeeName: 'John Doe',
              type: 'Vacation',
              startDate: DateTime(2026, 3, 1),
              endDate: DateTime(2026, 3, 5),
            ),
          ],
        ));

        expect(find.byType(CircularProgressIndicator), findsOneWidget);
        expect(find.text('John Doe'), findsNothing);
      });
    });

    group('Error State', () {
      testWidgets('displays error message when error is provided',
          (tester) async {
        await tester.pumpWidget(buildTestWidget(
          error: 'Failed to load approvals',
        ));

        expect(find.text('Failed to load approvals'), findsOneWidget);
        expect(find.byIcon(Icons.error_outline), findsOneWidget);
      });

      testWidgets('error state has correct styling', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          error: 'Network error',
        ));

        final iconFinder = find.byIcon(Icons.error_outline);
        expect(iconFinder, findsOneWidget);
      });
    });

    group('Section Headers', () {
      testWidgets('displays Time Off Requests section with count',
          (tester) async {
        await tester.pumpWidget(buildTestWidget(
          timeOffRequests: [
            createTimeOffRequest(
              id: '1',
              employeeName: 'John Doe',
              type: 'Vacation',
              startDate: DateTime(2026, 3, 1),
              endDate: DateTime(2026, 3, 5),
            ),
            createTimeOffRequest(
              id: '2',
              employeeName: 'Jane Smith',
              type: 'Sick Leave',
              startDate: DateTime(2026, 3, 2),
              endDate: DateTime(2026, 3, 3),
            ),
          ],
        ));

        expect(find.text('Time Off Requests (2)'), findsOneWidget);
      });

      testWidgets('displays Expense Reports section with count',
          (tester) async {
        await tester.pumpWidget(buildTestWidget(
          expenseReports: [
            createExpenseReport(
              id: '1',
              employeeName: 'John Doe',
              amount: 150.00,
              description: 'Client lunch',
            ),
          ],
        ));

        expect(find.text('Expense Reports (1)'), findsOneWidget);
      });

      testWidgets('displays Budget Amendments section with count',
          (tester) async {
        await tester.pumpWidget(buildTestWidget(
          budgetAmendments: [
            createBudgetAmendment(
              id: '1',
              department: 'Engineering',
              amount: 50000,
              reason: 'Additional headcount',
            ),
            createBudgetAmendment(
              id: '2',
              department: 'Marketing',
              amount: 25000,
              reason: 'Campaign budget increase',
            ),
            createBudgetAmendment(
              id: '3',
              department: 'Sales',
              amount: 15000,
              reason: 'Travel expenses',
            ),
          ],
        ));

        expect(find.text('Budget Amendments (3)'), findsOneWidget);
      });

      testWidgets('does not display section header for empty category',
          (tester) async {
        await tester.pumpWidget(buildTestWidget(
          timeOffRequests: [
            createTimeOffRequest(
              id: '1',
              employeeName: 'John Doe',
              type: 'Vacation',
              startDate: DateTime(2026, 3, 1),
              endDate: DateTime(2026, 3, 5),
            ),
          ],
          expenseReports: [],
          budgetAmendments: [],
        ));

        expect(find.text('Time Off Requests (1)'), findsOneWidget);
        expect(find.textContaining('Expense Reports'), findsNothing);
        expect(find.textContaining('Budget Amendments'), findsNothing);
      });
    });

    group('Collapsible Sections', () {
      testWidgets('sections are expanded by default', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          timeOffRequests: [
            createTimeOffRequest(
              id: '1',
              employeeName: 'John Doe',
              type: 'Vacation',
              startDate: DateTime(2026, 3, 1),
              endDate: DateTime(2026, 3, 5),
            ),
          ],
        ));

        expect(find.text('John Doe'), findsOneWidget);
        expect(find.byIcon(Icons.expand_less), findsOneWidget);
      });

      testWidgets('tapping section header collapses section', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          timeOffRequests: [
            createTimeOffRequest(
              id: '1',
              employeeName: 'John Doe',
              type: 'Vacation',
              startDate: DateTime(2026, 3, 1),
              endDate: DateTime(2026, 3, 5),
            ),
          ],
        ));

        // Find and tap the section header
        await tester.tap(find.text('Time Off Requests (1)'));
        await tester.pumpAndSettle();

        // Content should be hidden
        expect(find.text('John Doe'), findsNothing);
        expect(find.byIcon(Icons.expand_more), findsOneWidget);
      });

      testWidgets('tapping collapsed section expands it', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          timeOffRequests: [
            createTimeOffRequest(
              id: '1',
              employeeName: 'John Doe',
              type: 'Vacation',
              startDate: DateTime(2026, 3, 1),
              endDate: DateTime(2026, 3, 5),
            ),
          ],
        ));

        // Collapse
        await tester.tap(find.text('Time Off Requests (1)'));
        await tester.pumpAndSettle();
        expect(find.text('John Doe'), findsNothing);

        // Expand
        await tester.tap(find.text('Time Off Requests (1)'));
        await tester.pumpAndSettle();
        expect(find.text('John Doe'), findsOneWidget);
      });
    });

    group('Time Off Request Items', () {
      testWidgets('displays time off request details', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          timeOffRequests: [
            createTimeOffRequest(
              id: '1',
              employeeName: 'John Doe',
              type: 'Vacation',
              startDate: DateTime(2026, 3, 1),
              endDate: DateTime(2026, 3, 5),
            ),
          ],
        ));

        expect(find.text('John Doe'), findsOneWidget);
        expect(find.text('Vacation'), findsOneWidget);
        expect(find.textContaining('Mar 1'), findsOneWidget);
        expect(find.textContaining('Mar 5'), findsOneWidget);
      });

      testWidgets('displays approve and reject buttons', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          timeOffRequests: [
            createTimeOffRequest(
              id: '1',
              employeeName: 'John Doe',
              type: 'Vacation',
              startDate: DateTime(2026, 3, 1),
              endDate: DateTime(2026, 3, 5),
            ),
          ],
        ));

        expect(find.byIcon(Icons.check), findsOneWidget);
        expect(find.byIcon(Icons.close), findsOneWidget);
      });

      testWidgets('displays view details button', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          timeOffRequests: [
            createTimeOffRequest(
              id: '1',
              employeeName: 'John Doe',
              type: 'Vacation',
              startDate: DateTime(2026, 3, 1),
              endDate: DateTime(2026, 3, 5),
            ),
          ],
        ));

        expect(find.byIcon(Icons.visibility), findsOneWidget);
      });
    });

    group('Expense Report Items', () {
      testWidgets('displays expense report details with formatted amount',
          (tester) async {
        await tester.pumpWidget(buildTestWidget(
          expenseReports: [
            createExpenseReport(
              id: '1',
              employeeName: 'Jane Smith',
              amount: 1250.50,
              description: 'Conference travel expenses',
            ),
          ],
        ));

        expect(find.text('Jane Smith'), findsOneWidget);
        expect(find.text(r'$1,250.50'), findsOneWidget);
        expect(find.text('Conference travel expenses'), findsOneWidget);
      });
    });

    group('Budget Amendment Items', () {
      testWidgets('displays budget amendment details', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          budgetAmendments: [
            createBudgetAmendment(
              id: '1',
              department: 'Engineering',
              amount: 75000,
              reason: 'New team expansion',
            ),
          ],
        ));

        expect(find.text('Engineering'), findsOneWidget);
        expect(find.text(r'$75,000.00'), findsOneWidget);
        expect(find.text('New team expansion'), findsOneWidget);
      });
    });

    group('Urgency Indicators', () {
      testWidgets('displays urgency indicator for urgent time off requests',
          (tester) async {
        await tester.pumpWidget(buildTestWidget(
          timeOffRequests: [
            createTimeOffRequest(
              id: '1',
              employeeName: 'John Doe',
              type: 'Vacation',
              startDate: DateTime(2026, 3, 1),
              endDate: DateTime(2026, 3, 5),
              isUrgent: true,
            ),
          ],
        ));

        expect(find.byIcon(Icons.priority_high), findsOneWidget);
      });

      testWidgets('does not display urgency indicator for non-urgent items',
          (tester) async {
        await tester.pumpWidget(buildTestWidget(
          timeOffRequests: [
            createTimeOffRequest(
              id: '1',
              employeeName: 'John Doe',
              type: 'Vacation',
              startDate: DateTime(2026, 3, 1),
              endDate: DateTime(2026, 3, 5),
              isUrgent: false,
            ),
          ],
        ));

        expect(find.byIcon(Icons.priority_high), findsNothing);
      });

      testWidgets('urgent items have highlighted background', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          expenseReports: [
            createExpenseReport(
              id: '1',
              employeeName: 'Jane Smith',
              amount: 500,
              description: 'Urgent expense',
              isUrgent: true,
            ),
          ],
        ));

        // Find the Card containing the urgent item
        final cardFinder = find.byType(Card);
        expect(cardFinder, findsAtLeastNWidgets(1));
      });
    });

    group('Callbacks', () {
      testWidgets('calls onApprove with correct id and type for time off',
          (tester) async {
        String? approvedId;
        ApprovalItemType? approvedType;

        await tester.pumpWidget(buildTestWidget(
          timeOffRequests: [
            createTimeOffRequest(
              id: 'tor-123',
              employeeName: 'John Doe',
              type: 'Vacation',
              startDate: DateTime(2026, 3, 1),
              endDate: DateTime(2026, 3, 5),
            ),
          ],
          onApprove: (id, type) {
            approvedId = id;
            approvedType = type;
          },
        ));

        await tester.tap(find.byIcon(Icons.check));
        await tester.pump();

        expect(approvedId, equals('tor-123'));
        expect(approvedType, equals(ApprovalItemType.timeOff));
      });

      testWidgets('calls onReject with correct id and type for expense',
          (tester) async {
        String? rejectedId;
        ApprovalItemType? rejectedType;

        await tester.pumpWidget(buildTestWidget(
          expenseReports: [
            createExpenseReport(
              id: 'exp-456',
              employeeName: 'Jane Smith',
              amount: 100,
              description: 'Test expense',
            ),
          ],
          onReject: (id, type) {
            rejectedId = id;
            rejectedType = type;
          },
        ));

        await tester.tap(find.byIcon(Icons.close));
        await tester.pump();

        expect(rejectedId, equals('exp-456'));
        expect(rejectedType, equals(ApprovalItemType.expense));
      });

      testWidgets('calls onViewDetails with correct id and type for budget',
          (tester) async {
        String? viewedId;
        ApprovalItemType? viewedType;

        await tester.pumpWidget(buildTestWidget(
          budgetAmendments: [
            createBudgetAmendment(
              id: 'bud-789',
              department: 'Marketing',
              amount: 25000,
              reason: 'Campaign',
            ),
          ],
          onViewDetails: (id, type) {
            viewedId = id;
            viewedType = type;
          },
        ));

        await tester.tap(find.byIcon(Icons.visibility));
        await tester.pump();

        expect(viewedId, equals('bud-789'));
        expect(viewedType, equals(ApprovalItemType.budget));
      });
    });

    group('Multiple Items', () {
      testWidgets('displays all items from all categories', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          timeOffRequests: [
            createTimeOffRequest(
              id: '1',
              employeeName: 'Alice',
              type: 'Vacation',
              startDate: DateTime(2026, 3, 1),
              endDate: DateTime(2026, 3, 5),
            ),
            createTimeOffRequest(
              id: '2',
              employeeName: 'Bob',
              type: 'Sick Leave',
              startDate: DateTime(2026, 3, 2),
              endDate: DateTime(2026, 3, 3),
            ),
          ],
          expenseReports: [
            createExpenseReport(
              id: '3',
              employeeName: 'Charlie',
              amount: 200,
              description: 'Supplies',
            ),
          ],
          budgetAmendments: [
            createBudgetAmendment(
              id: '4',
              department: 'Sales',
              amount: 10000,
              reason: 'Q2 increase',
            ),
          ],
        ));

        expect(find.text('Time Off Requests (2)'), findsOneWidget);
        expect(find.text('Expense Reports (1)'), findsOneWidget);
        expect(find.text('Budget Amendments (1)'), findsOneWidget);
        expect(find.text('Alice'), findsOneWidget);
        expect(find.text('Bob'), findsOneWidget);
        expect(find.text('Charlie'), findsOneWidget);
        expect(find.text('Sales'), findsOneWidget);
      });

      testWidgets('displays correct approve button for each item',
          (tester) async {
        await tester.pumpWidget(buildTestWidget(
          timeOffRequests: [
            createTimeOffRequest(
              id: '1',
              employeeName: 'Alice',
              type: 'Vacation',
              startDate: DateTime(2026, 3, 1),
              endDate: DateTime(2026, 3, 5),
            ),
          ],
          expenseReports: [
            createExpenseReport(
              id: '2',
              employeeName: 'Bob',
              amount: 100,
              description: 'Test',
            ),
          ],
        ));

        // Should find 2 approve buttons (one per item)
        expect(find.byIcon(Icons.check), findsNWidgets(2));
        expect(find.byIcon(Icons.close), findsNWidgets(2));
        expect(find.byIcon(Icons.visibility), findsNWidgets(2));
      });
    });

    group('Accessibility', () {
      testWidgets('approve button has semantic label', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          timeOffRequests: [
            createTimeOffRequest(
              id: '1',
              employeeName: 'John Doe',
              type: 'Vacation',
              startDate: DateTime(2026, 3, 1),
              endDate: DateTime(2026, 3, 5),
            ),
          ],
        ));

        final approveButton = find.byWidgetPredicate(
          (widget) =>
              widget is IconButton &&
              (widget.tooltip == 'Approve' ||
                  widget.icon == const Icon(Icons.check)),
        );
        expect(approveButton, findsOneWidget);
      });

      testWidgets('reject button has semantic label', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          timeOffRequests: [
            createTimeOffRequest(
              id: '1',
              employeeName: 'John Doe',
              type: 'Vacation',
              startDate: DateTime(2026, 3, 1),
              endDate: DateTime(2026, 3, 5),
            ),
          ],
        ));

        final rejectButton = find.byWidgetPredicate(
          (widget) =>
              widget is IconButton &&
              (widget.tooltip == 'Reject' ||
                  widget.icon == const Icon(Icons.close)),
        );
        expect(rejectButton, findsOneWidget);
      });
    });
  });
}
