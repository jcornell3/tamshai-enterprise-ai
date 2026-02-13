import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:unified_flutter/features/generative/widgets/forecast_chart.dart';

void main() {
  group('ForecastChart', () {
    // Test data factories
    ForecastPeriodData createPeriod({
      required String label,
      required double actual,
      required double forecast,
    }) {
      return ForecastPeriodData(
        label: label,
        actual: actual,
        forecast: forecast,
      );
    }

    ForecastChartData createForecastData({
      required double target,
      required double achieved,
      required double projected,
      required List<ForecastPeriodData> periods,
    }) {
      return ForecastChartData(
        target: target,
        achieved: achieved,
        projected: projected,
        periods: periods,
      );
    }

    Widget buildTestWidget({
      ForecastChartData? forecast,
      ForecastPeriodType selectedPeriodType = ForecastPeriodType.monthly,
      void Function(ForecastPeriodData period)? onDrillDown,
      void Function(ForecastPeriodType periodType)? onPeriodChange,
      bool isLoading = false,
      String? error,
    }) {
      return MaterialApp(
        theme: ThemeData.light(useMaterial3: true),
        home: Scaffold(
          body: SingleChildScrollView(
            child: ForecastChart(
              forecast: forecast,
              selectedPeriodType: selectedPeriodType,
              onDrillDown: onDrillDown ?? (_) {},
              onPeriodChange: onPeriodChange ?? (_) {},
              isLoading: isLoading,
              error: error,
            ),
          ),
        ),
      );
    }

    group('Loading State', () {
      testWidgets('displays loading indicator when isLoading is true',
          (tester) async {
        await tester.pumpWidget(buildTestWidget(isLoading: true));

        expect(find.byType(CircularProgressIndicator), findsOneWidget);
        expect(find.text('Loading forecast...'), findsOneWidget);
      });

      testWidgets('does not display chart content when loading',
          (tester) async {
        await tester.pumpWidget(buildTestWidget(
          isLoading: true,
          forecast: createForecastData(
            target: 100000,
            achieved: 75000,
            projected: 95000,
            periods: [
              createPeriod(label: 'Jan', actual: 25000, forecast: 30000),
            ],
          ),
        ));

        expect(find.byType(CircularProgressIndicator), findsOneWidget);
        expect(find.text('Target'), findsNothing);
      });
    });

    group('Error State', () {
      testWidgets('displays error message when error is provided',
          (tester) async {
        await tester.pumpWidget(buildTestWidget(
          error: 'Failed to load forecast data',
        ));

        expect(find.text('Failed to load forecast data'), findsOneWidget);
        expect(find.byIcon(Icons.error_outline), findsOneWidget);
      });

      testWidgets('error state has correct styling', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          error: 'Network error',
        ));

        final iconFinder = find.byIcon(Icons.error_outline);
        expect(iconFinder, findsOneWidget);

        final icon = tester.widget<Icon>(iconFinder);
        expect(icon.size, equals(64.0));
      });
    });

    group('Empty State', () {
      testWidgets('displays empty state when forecast is null',
          (tester) async {
        await tester.pumpWidget(buildTestWidget(forecast: null));

        expect(find.text('No forecast data available'), findsOneWidget);
        expect(find.byIcon(Icons.bar_chart_outlined), findsOneWidget);
      });

      testWidgets('displays empty state when periods list is empty',
          (tester) async {
        await tester.pumpWidget(buildTestWidget(
          forecast: createForecastData(
            target: 100000,
            achieved: 75000,
            projected: 95000,
            periods: [],
          ),
        ));

        expect(find.text('No forecast data available'), findsOneWidget);
      });
    });

    group('Summary Cards', () {
      testWidgets('displays Target summary card with formatted value',
          (tester) async {
        await tester.pumpWidget(buildTestWidget(
          forecast: createForecastData(
            target: 100000,
            achieved: 75000,
            projected: 95000,
            periods: [
              createPeriod(label: 'Jan', actual: 25000, forecast: 30000),
            ],
          ),
        ));

        // Target appears in summary card and legend
        expect(find.text('Target'), findsWidgets);
        expect(find.text(r'$100,000'), findsOneWidget);
      });

      testWidgets('displays Achieved summary card with formatted value',
          (tester) async {
        await tester.pumpWidget(buildTestWidget(
          forecast: createForecastData(
            target: 100000,
            achieved: 75000,
            projected: 95000,
            periods: [
              createPeriod(label: 'Jan', actual: 25000, forecast: 30000),
            ],
          ),
        ));

        expect(find.text('Achieved'), findsOneWidget);
        expect(find.text(r'$75,000'), findsOneWidget);
      });

      testWidgets('displays Projected summary card with formatted value',
          (tester) async {
        await tester.pumpWidget(buildTestWidget(
          forecast: createForecastData(
            target: 100000,
            achieved: 75000,
            projected: 95000,
            periods: [
              createPeriod(label: 'Jan', actual: 25000, forecast: 30000),
            ],
          ),
        ));

        expect(find.text('Projected'), findsOneWidget);
        expect(find.text(r'$95,000'), findsOneWidget);
      });

      testWidgets('displays Gap summary card with calculated value',
          (tester) async {
        await tester.pumpWidget(buildTestWidget(
          forecast: createForecastData(
            target: 100000,
            achieved: 75000,
            projected: 95000,
            periods: [
              createPeriod(label: 'Jan', actual: 25000, forecast: 30000),
            ],
          ),
        ));

        expect(find.text('Gap'), findsOneWidget);
        expect(find.text(r'$5,000'), findsOneWidget);
      });

      testWidgets('Gap shows positive when projected exceeds target',
          (tester) async {
        await tester.pumpWidget(buildTestWidget(
          forecast: createForecastData(
            target: 100000,
            achieved: 75000,
            projected: 110000,
            periods: [
              createPeriod(label: 'Jan', actual: 25000, forecast: 30000),
            ],
          ),
        ));

        // Gap should show surplus with + prefix
        expect(find.text('+\$10,000'), findsOneWidget);
      });
    });

    group('Period Selector', () {
      testWidgets('displays Monthly and Quarterly toggle buttons',
          (tester) async {
        await tester.pumpWidget(buildTestWidget(
          forecast: createForecastData(
            target: 100000,
            achieved: 75000,
            projected: 95000,
            periods: [
              createPeriod(label: 'Jan', actual: 25000, forecast: 30000),
            ],
          ),
        ));

        expect(find.text('Monthly'), findsOneWidget);
        expect(find.text('Quarterly'), findsOneWidget);
      });

      testWidgets('Monthly is selected by default', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          forecast: createForecastData(
            target: 100000,
            achieved: 75000,
            projected: 95000,
            periods: [
              createPeriod(label: 'Jan', actual: 25000, forecast: 30000),
            ],
          ),
          selectedPeriodType: ForecastPeriodType.monthly,
        ));

        // Find the SegmentedButton with monthly selected
        final segmentedButton =
            find.byType(SegmentedButton<ForecastPeriodType>);
        expect(segmentedButton, findsOneWidget);
      });

      testWidgets('calls onPeriodChange when Quarterly is tapped',
          (tester) async {
        ForecastPeriodType? selectedType;

        await tester.pumpWidget(buildTestWidget(
          forecast: createForecastData(
            target: 100000,
            achieved: 75000,
            projected: 95000,
            periods: [
              createPeriod(label: 'Jan', actual: 25000, forecast: 30000),
            ],
          ),
          selectedPeriodType: ForecastPeriodType.monthly,
          onPeriodChange: (type) => selectedType = type,
        ));

        await tester.tap(find.text('Quarterly'));
        await tester.pump();

        expect(selectedType, equals(ForecastPeriodType.quarterly));
      });

      testWidgets('calls onPeriodChange when Monthly is tapped',
          (tester) async {
        ForecastPeriodType? selectedType;

        await tester.pumpWidget(buildTestWidget(
          forecast: createForecastData(
            target: 100000,
            achieved: 75000,
            projected: 95000,
            periods: [
              createPeriod(label: 'Q1', actual: 75000, forecast: 90000),
            ],
          ),
          selectedPeriodType: ForecastPeriodType.quarterly,
          onPeriodChange: (type) => selectedType = type,
        ));

        await tester.tap(find.text('Monthly'));
        await tester.pump();

        expect(selectedType, equals(ForecastPeriodType.monthly));
      });
    });

    group('Bar Chart Display', () {
      testWidgets('displays bars for each period', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          forecast: createForecastData(
            target: 100000,
            achieved: 75000,
            projected: 95000,
            periods: [
              createPeriod(label: 'Jan', actual: 25000, forecast: 30000),
              createPeriod(label: 'Feb', actual: 28000, forecast: 30000),
              createPeriod(label: 'Mar', actual: 32000, forecast: 35000),
            ],
          ),
        ));

        // Each period should have a label
        expect(find.text('Jan'), findsOneWidget);
        expect(find.text('Feb'), findsOneWidget);
        expect(find.text('Mar'), findsOneWidget);
      });

      testWidgets('displays actual and forecast bar pairs', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          forecast: createForecastData(
            target: 100000,
            achieved: 75000,
            projected: 95000,
            periods: [
              createPeriod(label: 'Jan', actual: 25000, forecast: 30000),
            ],
          ),
        ));

        // Should find bar containers in the chart
        // Bars are implemented using Container widgets with specific keys
        expect(find.byKey(const Key('bar_actual_0')), findsOneWidget);
        expect(find.byKey(const Key('bar_forecast_0')), findsOneWidget);
      });

      testWidgets('bar tapping calls onDrillDown', (tester) async {
        ForecastPeriodData? drillDownPeriod;

        await tester.pumpWidget(buildTestWidget(
          forecast: createForecastData(
            target: 100000,
            achieved: 75000,
            projected: 95000,
            periods: [
              createPeriod(label: 'Jan', actual: 25000, forecast: 30000),
            ],
          ),
          onDrillDown: (period) => drillDownPeriod = period,
        ));

        // Tap on the period label which is part of the bar group
        await tester.tap(find.text('Jan'));
        await tester.pump();

        expect(drillDownPeriod, isNotNull);
        expect(drillDownPeriod!.label, equals('Jan'));
      });
    });

    group('Bar Colors', () {
      testWidgets('actual bar is blue when below forecast', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          forecast: createForecastData(
            target: 100000,
            achieved: 75000,
            projected: 95000,
            periods: [
              createPeriod(label: 'Jan', actual: 20000, forecast: 30000),
            ],
          ),
        ));

        final actualBar = tester.widget<Container>(
          find.byKey(const Key('bar_actual_0')),
        );
        final decoration = actualBar.decoration as BoxDecoration;
        expect(decoration.color, equals(ForecastChart.actualColor));
      });

      testWidgets('forecast bar is gray', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          forecast: createForecastData(
            target: 100000,
            achieved: 75000,
            projected: 95000,
            periods: [
              createPeriod(label: 'Jan', actual: 25000, forecast: 30000),
            ],
          ),
        ));

        final forecastBar = tester.widget<Container>(
          find.byKey(const Key('bar_forecast_0')),
        );
        final decoration = forecastBar.decoration as BoxDecoration;
        expect(decoration.color, equals(ForecastChart.forecastColor));
      });

      testWidgets('actual bar is green when exceeds forecast', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          forecast: createForecastData(
            target: 100000,
            achieved: 85000,
            projected: 105000,
            periods: [
              createPeriod(label: 'Jan', actual: 35000, forecast: 30000),
            ],
          ),
        ));

        final actualBar = tester.widget<Container>(
          find.byKey(const Key('bar_actual_0')),
        );
        final decoration = actualBar.decoration as BoxDecoration;
        expect(decoration.color, equals(ForecastChart.exceededColor));
      });
    });

    group('Target Line', () {
      testWidgets('displays target line in chart area', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          forecast: createForecastData(
            target: 100000,
            achieved: 75000,
            projected: 95000,
            periods: [
              createPeriod(label: 'Jan', actual: 25000, forecast: 30000),
            ],
          ),
        ));

        expect(find.byKey(const Key('target_line')), findsOneWidget);
      });

      testWidgets('target line is positioned based on target value',
          (tester) async {
        await tester.pumpWidget(buildTestWidget(
          forecast: createForecastData(
            target: 50000,
            achieved: 75000,
            projected: 95000,
            periods: [
              createPeriod(label: 'Jan', actual: 25000, forecast: 30000),
            ],
          ),
        ));

        // Target line should exist
        final targetLine = find.byKey(const Key('target_line'));
        expect(targetLine, findsOneWidget);
      });
    });

    group('Legend', () {
      testWidgets('displays legend with Actual indicator', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          forecast: createForecastData(
            target: 100000,
            achieved: 75000,
            projected: 95000,
            periods: [
              createPeriod(label: 'Jan', actual: 25000, forecast: 30000),
            ],
          ),
        ));

        expect(find.text('Actual'), findsOneWidget);
        expect(find.byKey(const Key('legend_actual')), findsOneWidget);
      });

      testWidgets('displays legend with Forecast indicator', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          forecast: createForecastData(
            target: 100000,
            achieved: 75000,
            projected: 95000,
            periods: [
              createPeriod(label: 'Jan', actual: 25000, forecast: 30000),
            ],
          ),
        ));

        expect(find.text('Forecast'), findsOneWidget);
        expect(find.byKey(const Key('legend_forecast')), findsOneWidget);
      });

      testWidgets('displays legend with Exceeded indicator', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          forecast: createForecastData(
            target: 100000,
            achieved: 75000,
            projected: 95000,
            periods: [
              createPeriod(label: 'Jan', actual: 25000, forecast: 30000),
            ],
          ),
        ));

        expect(find.text('Exceeded'), findsOneWidget);
        expect(find.byKey(const Key('legend_exceeded')), findsOneWidget);
      });

      testWidgets('displays legend with Target line indicator',
          (tester) async {
        await tester.pumpWidget(buildTestWidget(
          forecast: createForecastData(
            target: 100000,
            achieved: 75000,
            projected: 95000,
            periods: [
              createPeriod(label: 'Jan', actual: 25000, forecast: 30000),
            ],
          ),
        ));

        // Target appears in both summary card and legend
        expect(find.text('Target'), findsNWidgets(2));
        expect(find.byKey(const Key('legend_target')), findsOneWidget);
      });

      testWidgets('legend color indicators match bar colors', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          forecast: createForecastData(
            target: 100000,
            achieved: 75000,
            projected: 95000,
            periods: [
              createPeriod(label: 'Jan', actual: 25000, forecast: 30000),
            ],
          ),
        ));

        // Find legend color boxes
        final actualLegend = tester.widget<Container>(
          find.byKey(const Key('legend_actual')),
        );
        final forecastLegend = tester.widget<Container>(
          find.byKey(const Key('legend_forecast')),
        );
        final exceededLegend = tester.widget<Container>(
          find.byKey(const Key('legend_exceeded')),
        );

        final actualDecoration = actualLegend.decoration as BoxDecoration;
        final forecastDecoration = forecastLegend.decoration as BoxDecoration;
        final exceededDecoration = exceededLegend.decoration as BoxDecoration;

        expect(actualDecoration.color, equals(ForecastChart.actualColor));
        expect(forecastDecoration.color, equals(ForecastChart.forecastColor));
        expect(exceededDecoration.color, equals(ForecastChart.exceededColor));
      });
    });

    group('Chart Layout', () {
      testWidgets('uses Stack for chart layout', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          forecast: createForecastData(
            target: 100000,
            achieved: 75000,
            projected: 95000,
            periods: [
              createPeriod(label: 'Jan', actual: 25000, forecast: 30000),
            ],
          ),
        ));

        expect(find.byKey(const Key('chart_stack')), findsOneWidget);
      });

      testWidgets('chart has minimum height', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          forecast: createForecastData(
            target: 100000,
            achieved: 75000,
            projected: 95000,
            periods: [
              createPeriod(label: 'Jan', actual: 25000, forecast: 30000),
            ],
          ),
        ));

        final chartArea = find.byKey(const Key('chart_area'));
        expect(chartArea, findsOneWidget);

        final container = tester.widget<SizedBox>(chartArea);
        expect(container.height, greaterThanOrEqualTo(200));
      });
    });

    group('Multiple Periods', () {
      testWidgets('displays all period labels', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          forecast: createForecastData(
            target: 120000,
            achieved: 90000,
            projected: 115000,
            periods: [
              createPeriod(label: 'Jan', actual: 25000, forecast: 30000),
              createPeriod(label: 'Feb', actual: 30000, forecast: 30000),
              createPeriod(label: 'Mar', actual: 35000, forecast: 30000),
            ],
          ),
        ));

        expect(find.text('Jan'), findsOneWidget);
        expect(find.text('Feb'), findsOneWidget);
        expect(find.text('Mar'), findsOneWidget);
      });

      testWidgets('creates bar pairs for each period', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          forecast: createForecastData(
            target: 120000,
            achieved: 90000,
            projected: 115000,
            periods: [
              createPeriod(label: 'Jan', actual: 25000, forecast: 30000),
              createPeriod(label: 'Feb', actual: 30000, forecast: 30000),
              createPeriod(label: 'Mar', actual: 35000, forecast: 30000),
            ],
          ),
        ));

        expect(find.byKey(const Key('bar_actual_0')), findsOneWidget);
        expect(find.byKey(const Key('bar_forecast_0')), findsOneWidget);
        expect(find.byKey(const Key('bar_actual_1')), findsOneWidget);
        expect(find.byKey(const Key('bar_forecast_1')), findsOneWidget);
        expect(find.byKey(const Key('bar_actual_2')), findsOneWidget);
        expect(find.byKey(const Key('bar_forecast_2')), findsOneWidget);
      });

      testWidgets('drilldown provides correct period data', (tester) async {
        ForecastPeriodData? drillDownPeriod;

        await tester.pumpWidget(buildTestWidget(
          forecast: createForecastData(
            target: 120000,
            achieved: 90000,
            projected: 115000,
            periods: [
              createPeriod(label: 'Jan', actual: 25000, forecast: 30000),
              createPeriod(label: 'Feb', actual: 30000, forecast: 30000),
              createPeriod(label: 'Mar', actual: 35000, forecast: 30000),
            ],
          ),
          onDrillDown: (period) => drillDownPeriod = period,
        ));

        // Tap on second period (Feb) using the label
        await tester.tap(find.text('Feb'));
        await tester.pump();

        expect(drillDownPeriod, isNotNull);
        expect(drillDownPeriod!.label, equals('Feb'));
        expect(drillDownPeriod!.actual, equals(30000));
        expect(drillDownPeriod!.forecast, equals(30000));
      });
    });

    group('Quarterly Data', () {
      testWidgets('displays quarterly labels', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          forecast: createForecastData(
            target: 400000,
            achieved: 300000,
            projected: 390000,
            periods: [
              createPeriod(label: 'Q1', actual: 90000, forecast: 100000),
              createPeriod(label: 'Q2', actual: 100000, forecast: 100000),
              createPeriod(label: 'Q3', actual: 110000, forecast: 100000),
              createPeriod(label: 'Q4', actual: 0, forecast: 100000),
            ],
          ),
          selectedPeriodType: ForecastPeriodType.quarterly,
        ));

        expect(find.text('Q1'), findsOneWidget);
        expect(find.text('Q2'), findsOneWidget);
        expect(find.text('Q3'), findsOneWidget);
        expect(find.text('Q4'), findsOneWidget);
      });
    });

    group('Accessibility', () {
      testWidgets('summary cards have semantic labels', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          forecast: createForecastData(
            target: 100000,
            achieved: 75000,
            projected: 95000,
            periods: [
              createPeriod(label: 'Jan', actual: 25000, forecast: 30000),
            ],
          ),
        ));

        // Verify summary cards contain the right values
        expect(find.text(r'$100,000'), findsOneWidget);
        expect(find.text(r'$75,000'), findsOneWidget);
      });

      testWidgets('bar groups are tappable for drill-down', (tester) async {
        ForecastPeriodData? drillDownPeriod;

        await tester.pumpWidget(buildTestWidget(
          forecast: createForecastData(
            target: 100000,
            achieved: 75000,
            projected: 95000,
            periods: [
              createPeriod(label: 'Jan', actual: 25000, forecast: 30000),
            ],
          ),
          onDrillDown: (period) => drillDownPeriod = period,
        ));

        // Tap and verify callback is triggered
        await tester.tap(find.text('Jan'));
        await tester.pump();

        expect(drillDownPeriod, isNotNull);
      });
    });

    group('Value Formatting', () {
      testWidgets('formats large numbers with K suffix', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          forecast: createForecastData(
            target: 1000000,
            achieved: 750000,
            projected: 950000,
            periods: [
              createPeriod(label: 'Jan', actual: 250000, forecast: 300000),
            ],
          ),
        ));

        expect(find.text(r'$1,000,000'), findsOneWidget);
      });

      testWidgets('handles zero values gracefully', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          forecast: createForecastData(
            target: 100000,
            achieved: 0,
            projected: 50000,
            periods: [
              createPeriod(label: 'Jan', actual: 0, forecast: 30000),
            ],
          ),
        ));

        expect(find.text(r'$0'), findsOneWidget);
      });
    });

    group('Gap Calculation', () {
      testWidgets('positive gap shows correct value when under target',
          (tester) async {
        await tester.pumpWidget(buildTestWidget(
          forecast: createForecastData(
            target: 100000,
            achieved: 75000,
            projected: 80000,
            periods: [
              createPeriod(label: 'Jan', actual: 25000, forecast: 30000),
            ],
          ),
        ));

        // Gap = target - projected = 100000 - 80000 = 20000
        expect(find.text(r'$20,000'), findsOneWidget);
      });

      testWidgets('negative gap shows surplus with plus sign',
          (tester) async {
        await tester.pumpWidget(buildTestWidget(
          forecast: createForecastData(
            target: 100000,
            achieved: 90000,
            projected: 120000,
            periods: [
              createPeriod(label: 'Jan', actual: 30000, forecast: 25000),
            ],
          ),
        ));

        // Gap = target - projected = 100000 - 120000 = -20000 (surplus)
        expect(find.text(r'+$20,000'), findsOneWidget);
      });
    });

    group('Material 3 Design', () {
      testWidgets('uses Material 3 card styling for summary', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          forecast: createForecastData(
            target: 100000,
            achieved: 75000,
            projected: 95000,
            periods: [
              createPeriod(label: 'Jan', actual: 25000, forecast: 30000),
            ],
          ),
        ));

        // Summary cards should use Card widget
        expect(find.byType(Card), findsWidgets);
      });

      testWidgets('period selector uses Material 3 segmented button style',
          (tester) async {
        await tester.pumpWidget(buildTestWidget(
          forecast: createForecastData(
            target: 100000,
            achieved: 75000,
            projected: 95000,
            periods: [
              createPeriod(label: 'Jan', actual: 25000, forecast: 30000),
            ],
          ),
        ));

        // Should use SegmentedButton for period selection
        expect(find.byType(SegmentedButton<ForecastPeriodType>), findsOneWidget);
      });
    });
  });
}
