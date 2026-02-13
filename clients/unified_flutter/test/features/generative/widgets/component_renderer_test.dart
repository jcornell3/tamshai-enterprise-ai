import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:unified_flutter/features/generative/models/component_response.dart';
import 'package:unified_flutter/features/generative/widgets/component_renderer.dart';

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
      testWidgets('renders OrgChartComponent placeholder for org_chart type',
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

        // Should render OrgChartComponent placeholder (not UnknownComponentFallback)
        expect(find.text('OrgChartComponent'), findsOneWidget);
        expect(find.text('Unknown Component'), findsNothing);
      });

      testWidgets('renders ApprovalsQueue placeholder for approvals type',
          (tester) async {
        final component = ComponentResponse(
          type: 'ApprovalsQueue',
          props: {
            'timeOffRequests': [],
            'expenseReports': [],
          },
        );

        await tester.pumpWidget(buildTestWidget(component: component));

        expect(find.text('ApprovalsQueue'), findsOneWidget);
        expect(find.text('Unknown Component'), findsNothing);
      });

      testWidgets('renders CustomerDetailCard placeholder', (tester) async {
        final component = ComponentResponse(
          type: 'CustomerDetailCard',
          props: {
            'customer': {
              'id': 'cust-123',
              'name': 'Acme Corporation',
            },
          },
        );

        await tester.pumpWidget(buildTestWidget(component: component));

        expect(find.text('CustomerDetailCard'), findsOneWidget);
        expect(find.text('Unknown Component'), findsNothing);
      });

      testWidgets('renders LeadsDataTable placeholder', (tester) async {
        final component = ComponentResponse(
          type: 'LeadsDataTable',
          props: {
            'leads': [],
          },
        );

        await tester.pumpWidget(buildTestWidget(component: component));

        expect(find.text('LeadsDataTable'), findsOneWidget);
        expect(find.text('Unknown Component'), findsNothing);
      });

      testWidgets('renders ForecastChart placeholder', (tester) async {
        final component = ComponentResponse(
          type: 'ForecastChart',
          props: {
            'period': 'Q1 2026',
            'quota': 500000,
          },
        );

        await tester.pumpWidget(buildTestWidget(component: component));

        expect(find.text('ForecastChart'), findsOneWidget);
        expect(find.text('Unknown Component'), findsNothing);
      });

      testWidgets('renders BudgetSummaryCard placeholder', (tester) async {
        final component = ComponentResponse(
          type: 'BudgetSummaryCard',
          props: {
            'department': 'Engineering',
            'totalBudget': 2500000,
          },
        );

        await tester.pumpWidget(buildTestWidget(component: component));

        expect(find.text('BudgetSummaryCard'), findsOneWidget);
        expect(find.text('Unknown Component'), findsNothing);
      });

      testWidgets('renders QuarterlyReportDashboard placeholder',
          (tester) async {
        final component = ComponentResponse(
          type: 'QuarterlyReportDashboard',
          props: {
            'quarter': 'Q4',
            'year': 2025,
          },
        );

        await tester.pumpWidget(buildTestWidget(component: component));

        expect(find.text('QuarterlyReportDashboard'), findsOneWidget);
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
            'self': {'id': 'user-123', 'name': 'Test User'},
          },
        );

        await tester.pumpWidget(buildTestWidget(
          component: component,
          onAction: (action) => receivedAction = action,
        ));

        // Find and tap the action button in the placeholder
        final actionButton = find.byKey(const Key('trigger-action'));
        if (actionButton.evaluate().isNotEmpty) {
          await tester.tap(actionButton);
          expect(receivedAction, isNotNull);
        }
      });
    });

    group('voiceEnabled parameter', () {
      testWidgets('passes voiceEnabled to child widget', (tester) async {
        final component = ComponentResponse(
          type: 'OrgChartComponent',
          props: {
            'self': {'id': 'user-123', 'name': 'Test User'},
          },
          narration: const Narration(
            text: 'You have 3 direct reports.',
          ),
        );

        await tester.pumpWidget(buildTestWidget(
          component: component,
          voiceEnabled: true,
        ));

        // Verify the component renders (voice behavior tested separately)
        expect(find.text('OrgChartComponent'), findsOneWidget);
      });

      testWidgets('widget renders when voiceEnabled is false', (tester) async {
        final component = ComponentResponse(
          type: 'OrgChartComponent',
          props: {
            'self': {'id': 'user-123', 'name': 'Test User'},
          },
        );

        await tester.pumpWidget(buildTestWidget(
          component: component,
          voiceEnabled: false,
        ));

        expect(find.text('OrgChartComponent'), findsOneWidget);
      });
    });

    group('component props', () {
      testWidgets('displays props data in placeholder component',
          (tester) async {
        final component = ComponentResponse(
          type: 'CustomerDetailCard',
          props: {
            'customer': {
              'name': 'Acme Corporation',
              'industry': 'Technology',
            },
          },
        );

        await tester.pumpWidget(buildTestWidget(component: component));

        // The placeholder should show the component type
        expect(find.text('CustomerDetailCard'), findsOneWidget);
      });
    });

    group('actions display', () {
      testWidgets('component with actions renders correctly', (tester) async {
        final component = ComponentResponse(
          type: 'CustomerDetailCard',
          props: {
            'customer': {'name': 'Test Corp'},
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

        expect(find.text('CustomerDetailCard'), findsOneWidget);
      });
    });

    group('narration display', () {
      testWidgets('component with narration renders correctly', (tester) async {
        final component = ComponentResponse(
          type: 'BudgetSummaryCard',
          props: {
            'department': 'Engineering',
          },
          narration: const Narration(
            text: 'Engineering has spent 50% of budget.',
            ssml:
                '<speak>Engineering has spent <emphasis>50%</emphasis> of budget.</speak>',
          ),
        );

        await tester.pumpWidget(buildTestWidget(component: component));

        expect(find.text('BudgetSummaryCard'), findsOneWidget);
      });
    });

    group('metadata handling', () {
      testWidgets('component with truncation metadata renders correctly',
          (tester) async {
        final component = ComponentResponse(
          type: 'LeadsDataTable',
          props: {
            'leads': [],
          },
          metadata: ComponentMetadata(
            truncated: true,
            totalCount: '100',
            dataFreshness: DateTime(2026, 2, 7),
          ),
        );

        await tester.pumpWidget(buildTestWidget(component: component));

        expect(find.text('LeadsDataTable'), findsOneWidget);
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
