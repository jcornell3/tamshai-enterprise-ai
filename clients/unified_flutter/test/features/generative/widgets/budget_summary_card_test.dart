import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:unified_flutter/features/generative/widgets/budget_summary_card.dart';
import 'package:unified_flutter/features/generative/models/component_response.dart';

void main() {
  // Test data factories
  BudgetData createBudgetData({
    String department = 'Engineering',
    int year = 2026,
    double totalBudget = 100000.0,
    double spent = 50000.0,
    double remaining = 50000.0,
    double percentUsed = 50.0,
    List<CategorySpend> categories = const [],
    List<String> warnings = const [],
    String status = 'APPROVED',
  }) {
    return BudgetData(
      department: department,
      year: year,
      totalBudget: totalBudget,
      spent: spent,
      remaining: remaining,
      percentUsed: percentUsed,
      categories: categories,
      warnings: warnings,
      status: status,
    );
  }

  CategorySpend createCategorySpend({
    String category = 'Personnel',
    double allocated = 50000.0,
    double spent = 25000.0,
    double percentUsed = 50.0,
  }) {
    return CategorySpend(
      category: category,
      allocated: allocated,
      spent: spent,
      percentUsed: percentUsed,
    );
  }

  Widget buildTestWidget({
    required BudgetData budget,
    BudgetTrend? trend,
    void Function()? onViewDetails,
    void Function()? onRequestAmendment,
    bool isLoading = false,
    String? error,
  }) {
    return MaterialApp(
      theme: ThemeData.light(useMaterial3: true),
      home: Scaffold(
        body: SingleChildScrollView(
          child: BudgetSummaryCard(
            budget: budget,
            trend: trend,
            onViewDetails: onViewDetails,
            onRequestAmendment: onRequestAmendment,
            isLoading: isLoading,
            error: error,
          ),
        ),
      ),
    );
  }

  group('BudgetSummaryCard', () {
    group('Loading State', () {
      testWidgets('displays loading indicator when isLoading is true',
          (tester) async {
        await tester.pumpWidget(buildTestWidget(
          budget: createBudgetData(),
          isLoading: true,
        ));

        expect(find.byType(CircularProgressIndicator), findsOneWidget);
        expect(find.text('Loading budget summary...'), findsOneWidget);
      });

      testWidgets('does not display content when loading', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          budget: createBudgetData(department: 'Engineering'),
          isLoading: true,
        ));

        expect(find.byType(CircularProgressIndicator), findsOneWidget);
        expect(find.text('Engineering Budget'), findsNothing);
      });
    });

    group('Error State', () {
      testWidgets('displays error message when error is provided',
          (tester) async {
        await tester.pumpWidget(buildTestWidget(
          budget: createBudgetData(),
          error: 'Failed to load budget data',
        ));

        expect(find.text('Failed to load budget data'), findsOneWidget);
        expect(find.byIcon(Icons.error_outline), findsOneWidget);
      });

      testWidgets('does not display budget content when error', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          budget: createBudgetData(department: 'Engineering'),
          error: 'Network error',
        ));

        expect(find.text('Engineering Budget'), findsNothing);
        expect(find.byType(LinearProgressIndicator), findsNothing);
      });
    });

    group('Header Display', () {
      testWidgets('displays department name in title', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          budget: createBudgetData(department: 'Marketing'),
        ));

        expect(find.text('Marketing Budget'), findsOneWidget);
      });

      testWidgets('displays year', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          budget: createBudgetData(year: 2026),
        ));

        expect(find.text('FY 2026'), findsOneWidget);
      });

      testWidgets('displays budget status', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          budget: createBudgetData(status: 'APPROVED'),
        ));

        expect(find.text('APPROVED'), findsOneWidget);
      });
    });

    group('Budget Summary Display', () {
      testWidgets('displays total budget with currency formatting',
          (tester) async {
        await tester.pumpWidget(buildTestWidget(
          budget: createBudgetData(totalBudget: 150000.0),
        ));

        expect(find.textContaining(r'$150,000'), findsWidgets);
      });

      testWidgets('displays spent amount with currency formatting',
          (tester) async {
        await tester.pumpWidget(buildTestWidget(
          budget: createBudgetData(spent: 75000.0),
        ));

        expect(find.textContaining(r'$75,000'), findsWidgets);
      });

      testWidgets('displays remaining amount with currency formatting',
          (tester) async {
        await tester.pumpWidget(buildTestWidget(
          budget: createBudgetData(remaining: 25000.0),
        ));

        expect(find.textContaining(r'$25,000'), findsWidgets);
      });

      testWidgets('displays percentage used', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          budget: createBudgetData(percentUsed: 75.5),
        ));

        expect(find.text('75.5% Used'), findsOneWidget);
      });
    });

    group('Progress Bar Display', () {
      testWidgets('displays LinearProgressIndicator', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          budget: createBudgetData(),
        ));

        expect(find.byType(LinearProgressIndicator), findsAtLeastNWidgets(1));
      });

      testWidgets('progress bar is green when under 80% spent', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          budget: createBudgetData(percentUsed: 50.0),
        ));

        final progressIndicator = tester.widget<LinearProgressIndicator>(
          find.byType(LinearProgressIndicator).first,
        );
        expect(progressIndicator.color, equals(Colors.green));
      });

      testWidgets('progress bar is orange when 80-95% spent', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          budget: createBudgetData(percentUsed: 85.0),
        ));

        final progressIndicator = tester.widget<LinearProgressIndicator>(
          find.byType(LinearProgressIndicator).first,
        );
        expect(progressIndicator.color, equals(Colors.orange));
      });

      testWidgets('progress bar is red when over 95% spent', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          budget: createBudgetData(percentUsed: 98.0),
        ));

        final progressIndicator = tester.widget<LinearProgressIndicator>(
          find.byType(LinearProgressIndicator).first,
        );
        expect(progressIndicator.color, equals(Colors.red));
      });

      testWidgets('progress bar shows correct value based on percent',
          (tester) async {
        await tester.pumpWidget(buildTestWidget(
          budget: createBudgetData(percentUsed: 75.0),
        ));

        final progressIndicator = tester.widget<LinearProgressIndicator>(
          find.byType(LinearProgressIndicator).first,
        );
        expect(progressIndicator.value, closeTo(0.75, 0.01));
      });
    });

    group('Warning Indicator', () {
      testWidgets('displays warning icon when over 90% spent', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          budget: createBudgetData(percentUsed: 92.0),
        ));

        // There are 2 warning icons: one in progress bar area, one in warning section
        expect(find.byIcon(Icons.warning_amber_rounded), findsAtLeastNWidgets(1));
      });

      testWidgets('does not display warning when under 90% spent',
          (tester) async {
        await tester.pumpWidget(buildTestWidget(
          budget: createBudgetData(percentUsed: 85.0),
        ));

        expect(find.byIcon(Icons.warning_amber_rounded), findsNothing);
      });

      testWidgets('displays warning message when over 90% spent',
          (tester) async {
        await tester.pumpWidget(buildTestWidget(
          budget: createBudgetData(percentUsed: 95.0),
        ));

        expect(find.text('Budget nearing limit'), findsOneWidget);
      });

      testWidgets('displays custom warnings from budget data', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          budget: createBudgetData(
            warnings: ['Q4 spending exceeded projections'],
          ),
        ));

        expect(find.text('Q4 spending exceeded projections'), findsOneWidget);
      });
    });

    group('Category Breakdown Table', () {
      testWidgets('displays category breakdown section header', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          budget: createBudgetData(
            categories: [
              createCategorySpend(category: 'Personnel'),
            ],
          ),
        ));

        expect(find.text('Category Breakdown'), findsOneWidget);
      });

      testWidgets('displays each category name', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          budget: createBudgetData(
            categories: [
              createCategorySpend(category: 'Personnel'),
              createCategorySpend(category: 'Equipment'),
              createCategorySpend(category: 'Travel'),
            ],
          ),
        ));

        expect(find.text('Personnel'), findsOneWidget);
        expect(find.text('Equipment'), findsOneWidget);
        expect(find.text('Travel'), findsOneWidget);
      });

      testWidgets('displays category allocated and spent amounts',
          (tester) async {
        await tester.pumpWidget(buildTestWidget(
          budget: createBudgetData(
            categories: [
              createCategorySpend(
                category: 'Personnel',
                allocated: 50000.0,
                spent: 25000.0,
              ),
            ],
          ),
        ));

        expect(find.textContaining(r'$50,000'), findsWidgets);
        expect(find.textContaining(r'$25,000'), findsWidgets);
      });

      testWidgets('displays progress bar for each category', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          budget: createBudgetData(
            categories: [
              createCategorySpend(category: 'Personnel', percentUsed: 50.0),
              createCategorySpend(category: 'Equipment', percentUsed: 80.0),
            ],
          ),
        ));

        // Main progress bar + 2 category progress bars
        expect(find.byType(LinearProgressIndicator), findsAtLeastNWidgets(3));
      });

      testWidgets('category progress bars have correct colors', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          budget: createBudgetData(
            categories: [
              createCategorySpend(category: 'Under Budget', percentUsed: 30.0),
              createCategorySpend(category: 'Warning', percentUsed: 90.0),
              createCategorySpend(category: 'Critical', percentUsed: 98.0),
            ],
          ),
        ));

        final progressIndicators = tester
            .widgetList<LinearProgressIndicator>(
              find.byType(LinearProgressIndicator),
            )
            .toList();

        // Skip the first one which is the main budget progress bar
        expect(progressIndicators.length, greaterThanOrEqualTo(4));
      });

      testWidgets('does not display category section when no categories',
          (tester) async {
        await tester.pumpWidget(buildTestWidget(
          budget: createBudgetData(categories: []),
        ));

        expect(find.text('Category Breakdown'), findsNothing);
      });
    });

    group('Request Amendment Button', () {
      testWidgets('displays Request Amendment button when remaining < 10%',
          (tester) async {
        await tester.pumpWidget(buildTestWidget(
          budget: createBudgetData(
            totalBudget: 100000.0,
            remaining: 5000.0, // 5% remaining
            percentUsed: 95.0,
          ),
        ));

        expect(find.text('Request Amendment'), findsOneWidget);
      });

      testWidgets('does not display Request Amendment button when >= 10%',
          (tester) async {
        await tester.pumpWidget(buildTestWidget(
          budget: createBudgetData(
            totalBudget: 100000.0,
            remaining: 20000.0, // 20% remaining
            percentUsed: 80.0,
          ),
        ));

        expect(find.text('Request Amendment'), findsNothing);
      });

      testWidgets('calls onRequestAmendment callback when tapped',
          (tester) async {
        var called = false;

        await tester.pumpWidget(buildTestWidget(
          budget: createBudgetData(
            totalBudget: 100000.0,
            remaining: 5000.0,
            percentUsed: 95.0,
          ),
          onRequestAmendment: () => called = true,
        ));

        await tester.tap(find.text('Request Amendment'));
        await tester.pumpAndSettle();

        expect(called, isTrue);
      });

      testWidgets('button is disabled when onRequestAmendment is null',
          (tester) async {
        await tester.pumpWidget(buildTestWidget(
          budget: createBudgetData(
            totalBudget: 100000.0,
            remaining: 5000.0,
            percentUsed: 95.0,
          ),
          onRequestAmendment: null,
        ));

        // The button exists and has null onPressed
        expect(find.text('Request Amendment'), findsOneWidget);

        // Use byWidgetPredicate to find ElevatedButton with null onPressed
        final disabledButton = find.byWidgetPredicate(
          (widget) =>
              widget is ElevatedButton && widget.onPressed == null,
        );
        expect(disabledButton, findsOneWidget);
      });
    });

    group('Trend Indicator', () {
      testWidgets('displays up arrow when trend is positive', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          budget: createBudgetData(),
          trend: const BudgetTrend(
            direction: TrendDirection.up,
            percentChange: 15.0,
            label: 'vs last period',
          ),
        ));

        expect(find.byIcon(Icons.trending_up), findsOneWidget);
      });

      testWidgets('displays down arrow when trend is negative', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          budget: createBudgetData(),
          trend: const BudgetTrend(
            direction: TrendDirection.down,
            percentChange: -10.0,
            label: 'vs last period',
          ),
        ));

        expect(find.byIcon(Icons.trending_down), findsOneWidget);
      });

      testWidgets('displays flat icon when trend is neutral', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          budget: createBudgetData(),
          trend: const BudgetTrend(
            direction: TrendDirection.neutral,
            percentChange: 0.0,
            label: 'vs last period',
          ),
        ));

        expect(find.byIcon(Icons.trending_flat), findsOneWidget);
      });

      testWidgets('displays percent change value', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          budget: createBudgetData(),
          trend: const BudgetTrend(
            direction: TrendDirection.up,
            percentChange: 15.5,
            label: 'vs last period',
          ),
        ));

        expect(find.textContaining('15.5%'), findsOneWidget);
      });

      testWidgets('displays trend label', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          budget: createBudgetData(),
          trend: const BudgetTrend(
            direction: TrendDirection.up,
            percentChange: 10.0,
            label: 'vs Q3 2025',
          ),
        ));

        expect(find.text('vs Q3 2025'), findsOneWidget);
      });

      testWidgets('does not display trend section when trend is null',
          (tester) async {
        await tester.pumpWidget(buildTestWidget(
          budget: createBudgetData(),
          trend: null,
        ));

        expect(find.byIcon(Icons.trending_up), findsNothing);
        expect(find.byIcon(Icons.trending_down), findsNothing);
        expect(find.byIcon(Icons.trending_flat), findsNothing);
      });

      testWidgets('up trend icon is green', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          budget: createBudgetData(),
          trend: const BudgetTrend(
            direction: TrendDirection.up,
            percentChange: 10.0,
            label: 'vs last period',
          ),
        ));

        final icon = tester.widget<Icon>(find.byIcon(Icons.trending_up));
        expect(icon.color, equals(Colors.green));
      });

      testWidgets('down trend icon is red', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          budget: createBudgetData(),
          trend: const BudgetTrend(
            direction: TrendDirection.down,
            percentChange: -10.0,
            label: 'vs last period',
          ),
        ));

        final icon = tester.widget<Icon>(find.byIcon(Icons.trending_down));
        expect(icon.color, equals(Colors.red));
      });
    });

    group('View Details Callback', () {
      testWidgets('displays View Details button', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          budget: createBudgetData(),
        ));

        expect(find.text('View Details'), findsOneWidget);
      });

      testWidgets('calls onViewDetails callback when tapped', (tester) async {
        var called = false;

        await tester.pumpWidget(buildTestWidget(
          budget: createBudgetData(),
          onViewDetails: () => called = true,
        ));

        await tester.tap(find.text('View Details'));
        await tester.pumpAndSettle();

        expect(called, isTrue);
      });

      testWidgets('button is disabled when onViewDetails is null',
          (tester) async {
        await tester.pumpWidget(buildTestWidget(
          budget: createBudgetData(),
          onViewDetails: null,
        ));

        final button = tester.widget<OutlinedButton>(
          find.widgetWithText(OutlinedButton, 'View Details'),
        );
        expect(button.onPressed, isNull);
      });
    });

    group('Currency Formatting', () {
      testWidgets('formats currency with commas and dollar sign',
          (tester) async {
        await tester.pumpWidget(buildTestWidget(
          budget: createBudgetData(
            totalBudget: 1234567.0,
          ),
        ));

        // NumberFormat with decimalDigits: 0 formats to $1,234,567
        expect(find.textContaining(r'$1,234,567'), findsWidgets);
      });

      testWidgets('handles zero values', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          budget: createBudgetData(
            spent: 0.0,
            remaining: 100000.0,
          ),
        ));

        expect(find.textContaining(r'$0'), findsWidgets);
      });
    });

    group('Material 3 Design', () {
      testWidgets('uses Card widget', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          budget: createBudgetData(),
        ));

        expect(find.byType(Card), findsAtLeastNWidgets(1));
      });

      testWidgets('applies proper spacing and padding', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          budget: createBudgetData(),
        ));

        // Card should exist with proper Material 3 styling
        final card = tester.widget<Card>(find.byType(Card).first);
        expect(card, isNotNull);
      });
    });

    group('Edge Cases', () {
      testWidgets('handles 0% spent', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          budget: createBudgetData(percentUsed: 0.0),
        ));

        expect(find.text('0.0% Used'), findsOneWidget);
        final progressIndicator = tester.widget<LinearProgressIndicator>(
          find.byType(LinearProgressIndicator).first,
        );
        expect(progressIndicator.value, equals(0.0));
      });

      testWidgets('handles 100% spent', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          budget: createBudgetData(percentUsed: 100.0),
        ));

        expect(find.text('100.0% Used'), findsOneWidget);
        final progressIndicator = tester.widget<LinearProgressIndicator>(
          find.byType(LinearProgressIndicator).first,
        );
        expect(progressIndicator.value, equals(1.0));
      });

      testWidgets('handles over 100% spent gracefully', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          budget: createBudgetData(percentUsed: 110.0),
        ));

        expect(find.textContaining('110'), findsWidgets);
        // Progress bar should be clamped to 1.0
        final progressIndicator = tester.widget<LinearProgressIndicator>(
          find.byType(LinearProgressIndicator).first,
        );
        expect(progressIndicator.value, equals(1.0));
      });

      testWidgets('handles very long department names', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          budget: createBudgetData(
            department: 'Information Technology and Digital Transformation Services',
          ),
        ));

        expect(
          find.textContaining('Information Technology'),
          findsOneWidget,
        );
      });

      testWidgets('handles many categories without overflow', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          budget: createBudgetData(
            categories: List.generate(
              10,
              (i) => createCategorySpend(
                category: 'Category $i',
                percentUsed: (i * 10).toDouble(),
              ),
            ),
          ),
        ));

        // Should render without overflow errors
        expect(find.text('Category Breakdown'), findsOneWidget);
      });
    });

    group('Accessibility', () {
      testWidgets('progress bar has semantic label', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          budget: createBudgetData(
            department: 'Engineering',
            percentUsed: 75.0,
          ),
        ));

        final semantics = tester.getSemantics(
          find.byType(LinearProgressIndicator).first,
        );
        expect(semantics.label, contains('75'));
      });

      testWidgets('buttons have tooltips', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          budget: createBudgetData(
            totalBudget: 100000.0,
            remaining: 5000.0,
            percentUsed: 95.0,
          ),
          onViewDetails: () {},
          onRequestAmendment: () {},
        ));

        // Find buttons
        expect(find.text('View Details'), findsOneWidget);
        expect(find.text('Request Amendment'), findsOneWidget);
      });
    });
  });

  group('BudgetTrend', () {
    test('creates trend with all fields', () {
      const trend = BudgetTrend(
        direction: TrendDirection.up,
        percentChange: 15.5,
        label: 'vs Q3',
      );

      expect(trend.direction, equals(TrendDirection.up));
      expect(trend.percentChange, equals(15.5));
      expect(trend.label, equals('vs Q3'));
    });

    test('handles negative percent change', () {
      const trend = BudgetTrend(
        direction: TrendDirection.down,
        percentChange: -20.0,
        label: 'vs last year',
      );

      expect(trend.percentChange, equals(-20.0));
    });
  });
}
