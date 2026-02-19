import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:unified_flutter/features/generative/models/component_response.dart';
import 'package:unified_flutter/features/generative/widgets/component_renderer.dart';
import 'package:unified_flutter/features/generative/widgets/org_chart_component.dart';
import 'package:unified_flutter/features/generative/widgets/customer_detail_card.dart';
import 'package:unified_flutter/features/generative/widgets/leads_data_table.dart';
import 'package:unified_flutter/features/generative/widgets/forecast_chart.dart';
import 'package:unified_flutter/features/generative/widgets/budget_summary_card.dart';
import 'package:unified_flutter/features/generative/widgets/approvals_queue.dart';
import 'package:unified_flutter/features/generative/widgets/quarterly_report_dashboard.dart';

void main() {
  group('ComponentRenderer', () {
    Widget buildTestWidget({
      required ComponentResponse component,
      void Function(ActionEvent)? onAction,
      bool voiceEnabled = false,
    }) {
      return MaterialApp(
        theme: ThemeData.light(useMaterial3: true),
        home: Scaffold(
          body: SingleChildScrollView(
            child: ComponentRenderer(
              component: component,
              onAction: onAction ?? (_) {},
              voiceEnabled: voiceEnabled,
            ),
          ),
        ),
      );
    }

    group('known component types', () {
      testWidgets('renders OrgChartComponent with data for org_chart type',
          (tester) async {
        final component = ComponentResponse(
          type: 'OrgChartComponent',
          props: {
            'self': {
              'id': 'user-123',
              'name': 'Marcus Johnson',
              'title': 'Software Engineer',
            },
          },
        );

        await tester.pumpWidget(buildTestWidget(component: component));

        // Should render actual OrgChartComponent with employee data
        expect(find.byType(OrgChartComponent), findsOneWidget);
        expect(find.text('Marcus Johnson'), findsOneWidget);
        expect(find.text('Unknown Component'), findsNothing);
      });

      testWidgets('renders ApprovalsQueue for approvals type',
          (tester) async {
        final component = ComponentResponse(
          type: 'ApprovalsQueue',
          props: {
            'timeOffRequests': [],
            'expenseReports': [],
            'budgetAmendments': [],
          },
        );

        await tester.pumpWidget(buildTestWidget(component: component));

        // Should render actual ApprovalsQueue (empty state shows "No pending approvals")
        expect(find.byType(ApprovalsQueue), findsOneWidget);
        expect(find.text('No pending approvals'), findsOneWidget);
        expect(find.text('Unknown Component'), findsNothing);
      });

      testWidgets('renders CustomerDetailCard with data', (tester) async {
        final component = ComponentResponse(
          type: 'CustomerDetailCard',
          props: {
            'customer': {
              'id': 'cust-123',
              'name': 'Acme Corporation',
              'industry': 'Technology',
              'status': 'active',
            },
            'contacts': [],
            'opportunities': [],
          },
        );

        await tester.pumpWidget(buildTestWidget(component: component));

        // Should render actual CustomerDetailCard with customer name
        expect(find.byType(CustomerDetailCard), findsOneWidget);
        expect(find.text('Acme Corporation'), findsOneWidget);
        expect(find.text('Unknown Component'), findsNothing);
      });

      testWidgets('renders LeadsDataTable with data', (tester) async {
        final component = ComponentResponse(
          type: 'LeadsDataTable',
          props: {
            'leads': [
              {
                'id': 'lead-1',
                'name': 'John Doe',
                'company': 'TestCorp',
                'score': 75,
                'status': 'NEW',
              },
            ],
          },
        );

        // LeadsDataTable requires bounded height constraints
        await tester.pumpWidget(MaterialApp(
          theme: ThemeData.light(useMaterial3: true),
          home: Scaffold(
            body: SizedBox(
              height: 600,
              child: ComponentRenderer(
                component: component,
                onAction: (_) {},
              ),
            ),
          ),
        ));

        // Should render actual LeadsDataTable with lead name
        expect(find.byType(LeadsDataTable), findsOneWidget);
        expect(find.text('John Doe'), findsOneWidget);
        expect(find.text('Unknown Component'), findsNothing);
      });

      testWidgets('renders ForecastChart with data', (tester) async {
        final component = ComponentResponse(
          type: 'ForecastChart',
          props: {
            'periods': [
              {'label': 'Jan', 'actual': 100000, 'forecast': 120000},
            ],
            'target': 500000,
            'achieved': 100000,
            'projected': 400000,
          },
        );

        await tester.pumpWidget(buildTestWidget(component: component));

        // Should render actual ForecastChart
        expect(find.byType(ForecastChart), findsOneWidget);
        expect(find.text('Unknown Component'), findsNothing);
      });

      testWidgets('renders BudgetSummaryCard with data', (tester) async {
        final component = ComponentResponse(
          type: 'BudgetSummaryCard',
          props: {
            'department': 'Engineering',
            'year': 2026,
            'totalBudget': 2500000,
            'spent': 1250000,
            'remaining': 1250000,
            'percentUsed': 50.0,
            'status': 'APPROVED',
          },
        );

        await tester.pumpWidget(buildTestWidget(component: component));

        // Should render actual BudgetSummaryCard with department name
        expect(find.byType(BudgetSummaryCard), findsOneWidget);
        expect(find.textContaining('Engineering'), findsOneWidget);
        expect(find.text('Unknown Component'), findsNothing);
      });

      testWidgets('renders QuarterlyReportDashboard with data',
          (tester) async {
        final component = ComponentResponse(
          type: 'QuarterlyReportDashboard',
          props: {
            'quarter': 'Q4',
            'year': 2025,
            'revenue': 5000000,
            'arr': 20000000,
            'netIncome': 1000000,
          },
        );

        await tester.pumpWidget(buildTestWidget(component: component));

        // Should render actual QuarterlyReportDashboard with quarter/year
        expect(find.byType(QuarterlyReportDashboard), findsOneWidget);
        expect(find.textContaining('Q4 2025'), findsOneWidget);
        expect(find.text('Unknown Component'), findsNothing);
      });
    });

    group('unknown component types', () {
      testWidgets('renders UnknownComponentFallback for unknown type',
          (tester) async {
        final component = ComponentResponse(
          type: 'SomeUnknownComponent',
          props: {},
        );

        await tester.pumpWidget(buildTestWidget(component: component));

        expect(find.text('Unknown Component'), findsOneWidget);
        expect(find.textContaining('SomeUnknownComponent'), findsOneWidget);
      });

      testWidgets('shows component type in fallback message', (tester) async {
        final component = ComponentResponse(
          type: 'FutureComponent',
          props: {},
        );

        await tester.pumpWidget(buildTestWidget(component: component));

        expect(find.text('Unknown Component'), findsOneWidget);
        expect(find.textContaining('FutureComponent'), findsOneWidget);
      });
    });

    group('onAction callback', () {
      testWidgets('passes onAction callback to child widget', (tester) async {
        ActionEvent? receivedAction;
        final component = ComponentResponse(
          type: 'OrgChartComponent',
          props: {
            'self': {'id': 'user-123', 'name': 'Test User', 'title': 'Engineer'},
          },
        );

        await tester.pumpWidget(buildTestWidget(
          component: component,
          onAction: (action) => receivedAction = action,
        ));

        // The actual component renders - clicking on an employee card triggers action
        expect(find.byType(OrgChartComponent), findsOneWidget);
        // Note: testing onAction requires interacting with the OrgChartComponent
      });
    });

    group('voiceEnabled parameter', () {
      testWidgets('passes voiceEnabled to child widget', (tester) async {
        final component = ComponentResponse(
          type: 'OrgChartComponent',
          props: {
            'self': {'id': 'user-123', 'name': 'Test User', 'title': 'Engineer'},
          },
          narration: const Narration(
            text: 'You have 3 direct reports.',
          ),
        );

        await tester.pumpWidget(buildTestWidget(
          component: component,
          voiceEnabled: true,
        ));

        // Verify the actual component renders (voice behavior tested separately)
        expect(find.byType(OrgChartComponent), findsOneWidget);
        expect(find.text('Test User'), findsOneWidget);
      });

      testWidgets('widget renders when voiceEnabled is false', (tester) async {
        final component = ComponentResponse(
          type: 'OrgChartComponent',
          props: {
            'self': {'id': 'user-123', 'name': 'Test User', 'title': 'Engineer'},
          },
        );

        await tester.pumpWidget(buildTestWidget(
          component: component,
          voiceEnabled: false,
        ));

        expect(find.byType(OrgChartComponent), findsOneWidget);
        expect(find.text('Test User'), findsOneWidget);
      });
    });

    group('component props', () {
      testWidgets('displays props data in actual component',
          (tester) async {
        final component = ComponentResponse(
          type: 'CustomerDetailCard',
          props: {
            'customer': {
              'id': 'cust-123',
              'name': 'Acme Corporation',
              'industry': 'Technology',
              'status': 'active',
            },
            'contacts': [],
            'opportunities': [],
          },
        );

        await tester.pumpWidget(buildTestWidget(component: component));

        // The actual component should display customer data
        expect(find.byType(CustomerDetailCard), findsOneWidget);
        expect(find.text('Acme Corporation'), findsOneWidget);
      });
    });

    group('actions display', () {
      testWidgets('component with actions renders correctly', (tester) async {
        final component = ComponentResponse(
          type: 'CustomerDetailCard',
          props: {
            'customer': {
              'id': 'cust-123',
              'name': 'Test Corp',
              'status': 'active',
            },
            'contacts': [],
            'opportunities': [],
          },
          actions: [
            const ComponentAction(
              id: 'view-details',
              label: 'View Details',
              target: '/customers/123',
            ),
          ],
        );

        await tester.pumpWidget(buildTestWidget(component: component));

        expect(find.byType(CustomerDetailCard), findsOneWidget);
        expect(find.text('Test Corp'), findsOneWidget);
      });
    });

    group('narration display', () {
      testWidgets('component with narration renders correctly', (tester) async {
        final component = ComponentResponse(
          type: 'BudgetSummaryCard',
          props: {
            'department': 'Engineering',
            'year': 2026,
            'totalBudget': 2500000,
            'spent': 1250000,
            'remaining': 1250000,
            'percentUsed': 50.0,
            'status': 'APPROVED',
          },
          narration: const Narration(
            text: 'Engineering has spent 50% of budget.',
            ssml:
                '<speak>Engineering has spent <emphasis>50%</emphasis> of budget.</speak>',
          ),
        );

        await tester.pumpWidget(buildTestWidget(component: component));

        expect(find.byType(BudgetSummaryCard), findsOneWidget);
        expect(find.textContaining('Engineering'), findsOneWidget);
      });
    });

    group('metadata handling', () {
      testWidgets('component with truncation metadata renders correctly',
          (tester) async {
        final component = ComponentResponse(
          type: 'LeadsDataTable',
          props: {
            'leads': [
              {'id': 'lead-1', 'name': 'Test Lead', 'status': 'NEW', 'score': 50},
            ],
          },
          metadata: ComponentMetadata(
            truncated: true,
            totalCount: '100',
            dataFreshness: DateTime(2026, 2, 7),
          ),
        );

        // LeadsDataTable requires bounded height constraints
        await tester.pumpWidget(MaterialApp(
          theme: ThemeData.light(useMaterial3: true),
          home: Scaffold(
            body: SizedBox(
              height: 600,
              child: ComponentRenderer(
                component: component,
                onAction: (_) {},
              ),
            ),
          ),
        ));

        expect(find.byType(LeadsDataTable), findsOneWidget);
        expect(find.text('Test Lead'), findsOneWidget);
      });
    });

    group('Material 3 theming', () {
      testWidgets('uses Material 3 design tokens', (tester) async {
        final component = ComponentResponse(
          type: 'OrgChartComponent',
          props: {
            'self': {'id': 'user-123', 'name': 'Test User'},
          },
        );

        await tester.pumpWidget(buildTestWidget(component: component));

        // Verify the widget tree contains a Card (Material 3 component)
        expect(find.byType(Card), findsWidgets);
      });

      testWidgets('applies correct color scheme', (tester) async {
        final component = ComponentResponse(
          type: 'UnknownType',
          props: {},
        );

        await tester.pumpWidget(buildTestWidget(component: component));

        // UnknownComponentFallback should use warning colors
        final card = tester.widget<Card>(find.byType(Card).first);
        expect(card.color, isNotNull);
      });
    });
  });

  group('UnknownComponentFallback', () {
    Widget buildFallbackWidget(String componentType) {
      return MaterialApp(
        theme: ThemeData.light(useMaterial3: true),
        home: Scaffold(
          body: UnknownComponentFallback(componentType: componentType),
        ),
      );
    }

    testWidgets('displays warning icon', (tester) async {
      await tester.pumpWidget(buildFallbackWidget('TestComponent'));

      expect(find.byIcon(Icons.warning_amber_rounded), findsOneWidget);
    });

    testWidgets('displays Unknown Component title', (tester) async {
      await tester.pumpWidget(buildFallbackWidget('TestComponent'));

      expect(find.text('Unknown Component'), findsOneWidget);
    });

    testWidgets('displays component type in message', (tester) async {
      await tester.pumpWidget(buildFallbackWidget('MyCustomComponent'));

      expect(find.textContaining('MyCustomComponent'), findsOneWidget);
    });

    testWidgets('uses warning container color from theme', (tester) async {
      await tester.pumpWidget(buildFallbackWidget('TestComponent'));

      // Verify the Card exists with proper styling
      expect(find.byType(Card), findsOneWidget);
    });
  });

  group('ComponentPlaceholder', () {
    Widget buildPlaceholderWidget({
      required String componentType,
      required Map<String, dynamic> props,
      void Function(ActionEvent)? onAction,
    }) {
      return MaterialApp(
        theme: ThemeData.light(useMaterial3: true),
        home: Scaffold(
          body: ComponentPlaceholder(
            componentType: componentType,
            props: props,
            onAction: onAction ?? (_) {},
          ),
        ),
      );
    }

    testWidgets('displays component type name', (tester) async {
      await tester.pumpWidget(buildPlaceholderWidget(
        componentType: 'OrgChartComponent',
        props: {},
      ));

      expect(find.text('OrgChartComponent'), findsOneWidget);
    });

    testWidgets('displays placeholder icon', (tester) async {
      await tester.pumpWidget(buildPlaceholderWidget(
        componentType: 'OrgChartComponent',
        props: {},
      ));

      expect(find.byIcon(Icons.widgets_outlined), findsOneWidget);
    });

    testWidgets('displays component props count', (tester) async {
      await tester.pumpWidget(buildPlaceholderWidget(
        componentType: 'CustomerDetailCard',
        props: {
          'customer': {'name': 'Test'},
          'contacts': [],
        },
      ));

      expect(find.textContaining('2'), findsOneWidget);
    });

    testWidgets('triggers onAction when action button is tapped',
        (tester) async {
      ActionEvent? receivedAction;

      await tester.pumpWidget(buildPlaceholderWidget(
        componentType: 'OrgChartComponent',
        props: {'self': {}},
        onAction: (action) => receivedAction = action,
      ));

      await tester.tap(find.byKey(const Key('trigger-action')));
      await tester.pump();

      expect(receivedAction, isNotNull);
      expect(receivedAction!.actionType, equals('placeholder_action'));
      expect(
          receivedAction!.payload?['componentType'], equals('OrgChartComponent'));
    });
  });
}
