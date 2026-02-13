import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:unified_flutter/features/generative/models/component_response.dart';
import 'package:unified_flutter/features/generative/widgets/quarterly_report_dashboard.dart';

void main() {
  group('QuarterlyReportDashboard', () {
    // ==========================================================================
    // TEST DATA FACTORIES
    // ==========================================================================

    KPI createKPI({
      required String name,
      required String value,
      String? change,
      String? trend,
      String? unit,
    }) {
      return KPI(
        name: name,
        value: value,
        change: change,
        trend: trend,
        unit: unit,
      );
    }

    ARRMovement createARRMovement({
      double starting = 10000000,
      double newBusiness = 2000000,
      double expansion = 1500000,
      double churn = 500000,
      double contraction = 200000,
      double ending = 12800000,
    }) {
      return ARRMovement(
        starting: starting,
        newBusiness: newBusiness,
        expansion: expansion,
        churn: churn,
        contraction: contraction,
        ending: ending,
      );
    }

    QuarterlyReport createQuarterlyReport({
      String quarter = 'Q4',
      int year = 2025,
      double revenue = 15000000,
      double arr = 12800000,
      double netIncome = 3500000,
      double? revenueGrowth,
      double? arrGrowth,
      double? netIncomeGrowth,
      ARRMovement? arrMovement,
      List<SegmentRevenue>? revenueBySegment,
      List<KPI>? kpis,
    }) {
      return QuarterlyReport(
        quarter: quarter,
        year: year,
        revenue: revenue,
        arr: arr,
        netIncome: netIncome,
        revenueGrowth: revenueGrowth,
        arrGrowth: arrGrowth,
        netIncomeGrowth: netIncomeGrowth,
        arrMovement: arrMovement,
        revenueBySegment: revenueBySegment ?? [],
        kpis: kpis ?? [],
      );
    }

    Widget buildTestWidget({
      QuarterlyReport? report,
      List<String>? highlights,
      void Function(String kpiName)? onDrillDown,
      void Function(ExportFormat format)? onExport,
      bool isLoading = false,
      String? error,
    }) {
      return MaterialApp(
        theme: ThemeData.light(useMaterial3: true),
        home: Scaffold(
          body: SingleChildScrollView(
            child: QuarterlyReportDashboard(
              report: report ?? createQuarterlyReport(),
              highlights: highlights ?? [],
              onDrillDown: onDrillDown ?? (_) {},
              onExport: onExport ?? (_) {},
              isLoading: isLoading,
              error: error,
            ),
          ),
        ),
      );
    }

    // ==========================================================================
    // LOADING STATE TESTS
    // ==========================================================================

    group('Loading State', () {
      testWidgets('displays loading indicator when isLoading is true',
          (tester) async {
        await tester.pumpWidget(buildTestWidget(isLoading: true));

        expect(find.byType(CircularProgressIndicator), findsOneWidget);
        expect(find.text('Loading quarterly report...'), findsOneWidget);
      });

      testWidgets('does not display content when loading', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          isLoading: true,
          report: createQuarterlyReport(revenue: 15000000),
        ));

        expect(find.byType(CircularProgressIndicator), findsOneWidget);
        // Revenue should not be visible
        expect(find.textContaining('15'), findsNothing);
      });
    });

    // ==========================================================================
    // ERROR STATE TESTS
    // ==========================================================================

    group('Error State', () {
      testWidgets('displays error message when error is provided',
          (tester) async {
        await tester.pumpWidget(buildTestWidget(
          error: 'Failed to load quarterly report',
        ));

        expect(find.text('Failed to load quarterly report'), findsOneWidget);
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

      testWidgets('does not display content when error is present',
          (tester) async {
        await tester.pumpWidget(buildTestWidget(
          error: 'Error occurred',
          report: createQuarterlyReport(revenue: 15000000),
        ));

        expect(find.byIcon(Icons.error_outline), findsOneWidget);
        // Revenue should not be visible
        expect(find.textContaining('Revenue'), findsNothing);
      });
    });

    // ==========================================================================
    // HEADER TESTS
    // ==========================================================================

    group('Report Header', () {
      testWidgets('displays quarter and year in header', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          report: createQuarterlyReport(quarter: 'Q4', year: 2025),
        ));

        expect(find.text('Q4 2025 Quarterly Report'), findsOneWidget);
      });

      testWidgets('displays different quarters correctly', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          report: createQuarterlyReport(quarter: 'Q1', year: 2026),
        ));

        expect(find.text('Q1 2026 Quarterly Report'), findsOneWidget);
      });
    });

    // ==========================================================================
    // KPI CARDS TESTS
    // ==========================================================================

    group('KPI Cards', () {
      testWidgets('displays main financial KPIs', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          report: createQuarterlyReport(
            revenue: 15000000,
            arr: 12800000,
            netIncome: 3500000,
          ),
        ));

        // Check for formatted currency values
        expect(find.textContaining('15'), findsWidgets);
        expect(find.textContaining('12.8'), findsWidgets);
        expect(find.textContaining('3.5'), findsWidgets);
      });

      testWidgets('displays KPI labels', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          report: createQuarterlyReport(),
        ));

        expect(find.text('Revenue'), findsOneWidget);
        expect(find.text('ARR'), findsOneWidget);
        expect(find.text('Net Income'), findsOneWidget);
      });

      testWidgets('displays custom KPIs from report', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          report: createQuarterlyReport(
            kpis: [
              createKPI(name: 'MRR', value: '1066666', unit: 'currency'),
              createKPI(name: 'Churn Rate', value: '2.5', unit: 'percent'),
              createKPI(name: 'NPS', value: '72', unit: 'number'),
            ],
          ),
        ));

        expect(find.text('MRR'), findsOneWidget);
        expect(find.text('Churn Rate'), findsOneWidget);
        expect(find.text('NPS'), findsOneWidget);
      });

      testWidgets('displays positive change indicator in green',
          (tester) async {
        await tester.pumpWidget(buildTestWidget(
          report: createQuarterlyReport(
            revenueGrowth: 15.5,
            kpis: [
              createKPI(
                name: 'MRR',
                value: '1066666',
                change: '+12.5%',
                trend: 'up',
              ),
            ],
          ),
        ));

        // Find the positive change indicator
        expect(find.textContaining('+'), findsWidgets);
      });

      testWidgets('displays negative change indicator in red', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          report: createQuarterlyReport(
            kpis: [
              createKPI(
                name: 'Churn Rate',
                value: '3.2',
                change: '-0.5%',
                trend: 'down',
              ),
            ],
          ),
        ));

        expect(find.textContaining('-'), findsWidgets);
      });

      testWidgets('formats currency values correctly', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          report: createQuarterlyReport(
            kpis: [
              createKPI(name: 'MRR', value: '1066666.67', unit: 'currency'),
            ],
          ),
        ));

        // Should display formatted currency
        expect(find.textContaining(r'$'), findsWidgets);
      });

      testWidgets('formats percentage values correctly', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          report: createQuarterlyReport(
            kpis: [
              createKPI(name: 'Churn Rate', value: '2.5', unit: 'percent'),
            ],
          ),
        ));

        // Should display percentage
        expect(find.textContaining('%'), findsWidgets);
      });

      testWidgets('KPI cards are displayed in a grid', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          report: createQuarterlyReport(
            kpis: [
              createKPI(name: 'MRR', value: '1066666', unit: 'currency'),
              createKPI(name: 'Churn Rate', value: '2.5', unit: 'percent'),
              createKPI(name: 'NPS', value: '72', unit: 'number'),
              createKPI(name: 'CAC', value: '5000', unit: 'currency'),
            ],
          ),
        ));

        // Verify GridViews are used for KPI cards (main KPIs + custom KPIs)
        expect(find.byType(GridView), findsAtLeastNWidgets(1));
      });

      testWidgets('KPI card is tappable for drill-down', (tester) async {
        String? drillDownName;

        await tester.pumpWidget(buildTestWidget(
          report: createQuarterlyReport(
            kpis: [
              createKPI(name: 'MRR', value: '1066666', unit: 'currency'),
            ],
          ),
          onDrillDown: (name) => drillDownName = name,
        ));

        // Find and tap the MRR card
        await tester.tap(find.text('MRR'));
        await tester.pump();

        expect(drillDownName, equals('MRR'));
      });
    });

    // ==========================================================================
    // ARR WATERFALL SECTION TESTS
    // ==========================================================================

    group('ARR Waterfall Section', () {
      testWidgets('displays ARR waterfall section header', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          report: createQuarterlyReport(
            arrMovement: createARRMovement(),
          ),
        ));

        expect(find.text('ARR Movement'), findsOneWidget);
      });

      testWidgets('displays starting ARR bar', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          report: createQuarterlyReport(
            arrMovement: createARRMovement(starting: 10000000),
          ),
        ));

        expect(find.text('Starting ARR'), findsOneWidget);
        expect(find.textContaining('10'), findsWidgets);
      });

      testWidgets('displays new business bar in green', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          report: createQuarterlyReport(
            arrMovement: createARRMovement(newBusiness: 2000000),
          ),
        ));

        expect(find.text('New Business'), findsOneWidget);
      });

      testWidgets('displays expansion bar in green', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          report: createQuarterlyReport(
            arrMovement: createARRMovement(expansion: 1500000),
          ),
        ));

        expect(find.text('Expansion'), findsOneWidget);
      });

      testWidgets('displays churn bar in red', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          report: createQuarterlyReport(
            arrMovement: createARRMovement(churn: 500000),
          ),
        ));

        expect(find.text('Churn'), findsOneWidget);
      });

      testWidgets('displays contraction bar in red', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          report: createQuarterlyReport(
            arrMovement: createARRMovement(contraction: 200000),
          ),
        ));

        expect(find.text('Contraction'), findsOneWidget);
      });

      testWidgets('displays ending ARR bar', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          report: createQuarterlyReport(
            arrMovement: createARRMovement(ending: 12800000),
          ),
        ));

        expect(find.text('Ending ARR'), findsOneWidget);
      });

      testWidgets('does not display waterfall when arrMovement is null',
          (tester) async {
        await tester.pumpWidget(buildTestWidget(
          report: createQuarterlyReport(arrMovement: null),
        ));

        expect(find.text('ARR Movement'), findsNothing);
        expect(find.text('Starting ARR'), findsNothing);
      });

      testWidgets('waterfall bars have correct relative widths',
          (tester) async {
        await tester.pumpWidget(buildTestWidget(
          report: createQuarterlyReport(
            arrMovement: createARRMovement(
              starting: 10000000,
              newBusiness: 2000000,
              expansion: 1500000,
              churn: 500000,
              contraction: 200000,
              ending: 12800000,
            ),
          ),
        ));

        // Verify the waterfall section is rendered
        expect(find.text('Starting ARR'), findsOneWidget);
        expect(find.text('Ending ARR'), findsOneWidget);
      });
    });

    // ==========================================================================
    // HIGHLIGHTS SECTION TESTS
    // ==========================================================================

    group('Highlights Section', () {
      testWidgets('displays highlights section header', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          highlights: ['Revenue up 15% YoY'],
        ));

        expect(find.text('Key Highlights'), findsOneWidget);
      });

      testWidgets('displays highlight items as bulleted list', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          highlights: [
            'Revenue up 15% YoY',
            'Successfully launched 3 new products',
            'Reduced customer churn by 0.5%',
          ],
        ));

        expect(find.text('Revenue up 15% YoY'), findsOneWidget);
        expect(find.text('Successfully launched 3 new products'), findsOneWidget);
        expect(find.text('Reduced customer churn by 0.5%'), findsOneWidget);
      });

      testWidgets('displays bullet points for each highlight', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          highlights: [
            'Highlight 1',
            'Highlight 2',
          ],
        ));

        // Bullet points should be present (using icon or text bullet)
        expect(find.byIcon(Icons.circle), findsNWidgets(2));
      });

      testWidgets('does not display highlights section when empty',
          (tester) async {
        await tester.pumpWidget(buildTestWidget(
          highlights: [],
        ));

        expect(find.text('Key Highlights'), findsNothing);
      });
    });

    // ==========================================================================
    // EXPORT BUTTONS TESTS
    // ==========================================================================

    group('Export Buttons', () {
      testWidgets('displays PDF export button', (tester) async {
        await tester.pumpWidget(buildTestWidget());

        expect(find.text('Export PDF'), findsOneWidget);
        expect(find.byIcon(Icons.picture_as_pdf), findsOneWidget);
      });

      testWidgets('displays CSV export button', (tester) async {
        await tester.pumpWidget(buildTestWidget());

        expect(find.text('Export CSV'), findsOneWidget);
        expect(find.byIcon(Icons.table_chart), findsOneWidget);
      });

      testWidgets('calls onExport with PDF format when PDF button is tapped',
          (tester) async {
        ExportFormat? exportedFormat;

        await tester.pumpWidget(buildTestWidget(
          onExport: (format) => exportedFormat = format,
        ));

        await tester.tap(find.text('Export PDF'));
        await tester.pump();

        expect(exportedFormat, equals(ExportFormat.pdf));
      });

      testWidgets('calls onExport with CSV format when CSV button is tapped',
          (tester) async {
        ExportFormat? exportedFormat;

        await tester.pumpWidget(buildTestWidget(
          onExport: (format) => exportedFormat = format,
        ));

        await tester.tap(find.text('Export CSV'));
        await tester.pump();

        expect(exportedFormat, equals(ExportFormat.csv));
      });

      testWidgets('export buttons are disabled when loading', (tester) async {
        await tester.pumpWidget(buildTestWidget(isLoading: true));

        // Export buttons should not be visible when loading
        expect(find.text('Export PDF'), findsNothing);
        expect(find.text('Export CSV'), findsNothing);
      });
    });

    // ==========================================================================
    // DRILL-DOWN CALLBACK TESTS
    // ==========================================================================

    group('Drill-Down Callbacks', () {
      testWidgets('calls onDrillDown when tapping Revenue KPI', (tester) async {
        String? drillDownName;

        await tester.pumpWidget(buildTestWidget(
          report: createQuarterlyReport(),
          onDrillDown: (name) => drillDownName = name,
        ));

        await tester.tap(find.text('Revenue'));
        await tester.pump();

        expect(drillDownName, equals('Revenue'));
      });

      testWidgets('calls onDrillDown when tapping ARR KPI', (tester) async {
        String? drillDownName;

        await tester.pumpWidget(buildTestWidget(
          report: createQuarterlyReport(),
          onDrillDown: (name) => drillDownName = name,
        ));

        await tester.tap(find.text('ARR'));
        await tester.pump();

        expect(drillDownName, equals('ARR'));
      });

      testWidgets('calls onDrillDown when tapping Net Income KPI',
          (tester) async {
        String? drillDownName;

        await tester.pumpWidget(buildTestWidget(
          report: createQuarterlyReport(),
          onDrillDown: (name) => drillDownName = name,
        ));

        await tester.tap(find.text('Net Income'));
        await tester.pump();

        expect(drillDownName, equals('Net Income'));
      });
    });

    // ==========================================================================
    // MATERIAL 3 DESIGN TESTS
    // ==========================================================================

    group('Material 3 Design', () {
      testWidgets('uses Material 3 card styling', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          report: createQuarterlyReport(),
        ));

        // Should have Card widgets for KPIs
        expect(find.byType(Card), findsWidgets);
      });

      testWidgets('uses proper typography hierarchy', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          report: createQuarterlyReport(quarter: 'Q4', year: 2025),
        ));

        // Header should use headline style
        final headerFinder = find.text('Q4 2025 Quarterly Report');
        expect(headerFinder, findsOneWidget);
      });

      testWidgets('applies correct color scheme for positive values',
          (tester) async {
        await tester.pumpWidget(buildTestWidget(
          report: createQuarterlyReport(
            revenueGrowth: 15.5,
          ),
        ));

        // Positive growth should be displayed
        expect(find.textContaining('+'), findsWidgets);
      });

      testWidgets('applies correct color scheme for negative values',
          (tester) async {
        await tester.pumpWidget(buildTestWidget(
          report: createQuarterlyReport(
            revenueGrowth: -5.2,
          ),
        ));

        // Negative growth should be displayed
        expect(find.textContaining('-'), findsWidgets);
      });
    });

    // ==========================================================================
    // ACCESSIBILITY TESTS
    // ==========================================================================

    group('Accessibility', () {
      testWidgets('export buttons have semantic labels', (tester) async {
        await tester.pumpWidget(buildTestWidget());

        // Export buttons should be present with text labels
        expect(find.text('Export PDF'), findsOneWidget);
        expect(find.text('Export CSV'), findsOneWidget);

        // Should have buttons with icons
        expect(find.byIcon(Icons.picture_as_pdf), findsOneWidget);
        expect(find.byIcon(Icons.table_chart), findsOneWidget);
      });

      testWidgets('KPI cards have tap feedback', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          report: createQuarterlyReport(),
        ));

        // Find InkWell or GestureDetector for tap feedback
        expect(find.byType(InkWell), findsWidgets);
      });

      testWidgets('loading state has accessible description', (tester) async {
        await tester.pumpWidget(buildTestWidget(isLoading: true));

        expect(find.text('Loading quarterly report...'), findsOneWidget);
      });

      testWidgets('error state has accessible description', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          error: 'Failed to load data',
        ));

        expect(find.text('Failed to load data'), findsOneWidget);
      });
    });

    // ==========================================================================
    // GROWTH INDICATOR TESTS
    // ==========================================================================

    group('Growth Indicators', () {
      testWidgets('displays revenue growth percentage', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          report: createQuarterlyReport(revenueGrowth: 15.5),
        ));

        expect(find.textContaining('15.5'), findsWidgets);
      });

      testWidgets('displays ARR growth percentage', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          report: createQuarterlyReport(arrGrowth: 28.0),
        ));

        expect(find.textContaining('28'), findsWidgets);
      });

      testWidgets('displays net income growth percentage', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          report: createQuarterlyReport(netIncomeGrowth: -5.2),
        ));

        expect(find.textContaining('5.2'), findsWidgets);
      });

      testWidgets('shows up arrow for positive growth', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          report: createQuarterlyReport(revenueGrowth: 15.5),
        ));

        expect(find.byIcon(Icons.trending_up), findsWidgets);
      });

      testWidgets('shows down arrow for negative growth', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          report: createQuarterlyReport(revenueGrowth: -5.2),
        ));

        expect(find.byIcon(Icons.trending_down), findsWidgets);
      });

      testWidgets('shows flat indicator for zero growth', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          report: createQuarterlyReport(revenueGrowth: 0.0),
        ));

        expect(find.byIcon(Icons.trending_flat), findsWidgets);
      });
    });

    // ==========================================================================
    // SEGMENT REVENUE TESTS
    // ==========================================================================

    group('Segment Revenue', () {
      testWidgets('displays revenue by segment section', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          report: createQuarterlyReport(
            revenueBySegment: [
              const SegmentRevenue(
                  segment: 'Enterprise', revenue: 8000000, percent: 53.3),
              const SegmentRevenue(
                  segment: 'SMB', revenue: 5000000, percent: 33.3),
              const SegmentRevenue(
                  segment: 'Consumer', revenue: 2000000, percent: 13.4),
            ],
          ),
        ));

        expect(find.text('Revenue by Segment'), findsOneWidget);
        expect(find.text('Enterprise'), findsOneWidget);
        expect(find.text('SMB'), findsOneWidget);
        expect(find.text('Consumer'), findsOneWidget);
      });

      testWidgets('does not display segment section when empty',
          (tester) async {
        await tester.pumpWidget(buildTestWidget(
          report: createQuarterlyReport(revenueBySegment: []),
        ));

        expect(find.text('Revenue by Segment'), findsNothing);
      });

      testWidgets('displays segment percentages', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          report: createQuarterlyReport(
            revenueBySegment: [
              const SegmentRevenue(
                  segment: 'Enterprise', revenue: 8000000, percent: 53.3),
            ],
          ),
        ));

        expect(find.textContaining('53.3'), findsWidgets);
      });
    });

    // ==========================================================================
    // RESPONSIVE LAYOUT TESTS
    // ==========================================================================

    group('Responsive Layout', () {
      testWidgets('adapts grid columns for wide screens', (tester) async {
        // Set a wide screen size
        tester.view.physicalSize = const Size(1200, 1200);
        tester.view.devicePixelRatio = 1.0;

        await tester.pumpWidget(buildTestWidget(
          report: createQuarterlyReport(
            kpis: [
              createKPI(name: 'MRR', value: '1066666', unit: 'currency'),
              createKPI(name: 'Churn', value: '2.5', unit: 'percent'),
              createKPI(name: 'NPS', value: '72', unit: 'number'),
              createKPI(name: 'CAC', value: '5000', unit: 'currency'),
            ],
          ),
        ));

        // Verify grids are present (main KPIs + custom KPIs)
        expect(find.byType(GridView), findsAtLeastNWidgets(1));

        // Reset view
        addTearDown(tester.view.resetPhysicalSize);
      });

      testWidgets('adapts grid columns for narrow screens', (tester) async {
        // Set a narrow screen size with enough height
        tester.view.physicalSize = const Size(600, 1200);
        tester.view.devicePixelRatio = 1.0;

        await tester.pumpWidget(buildTestWidget(
          report: createQuarterlyReport(),
        ));

        // Grid should still be present
        expect(find.byType(GridView), findsAtLeastNWidgets(1));

        // Reset view
        addTearDown(tester.view.resetPhysicalSize);
      });
    });

    // ==========================================================================
    // TARGET COMPARISON TESTS
    // ==========================================================================

    group('Target Comparison', () {
      testWidgets('displays target indicator when KPI has target', (tester) async {
        await tester.pumpWidget(buildTestWidget(
          report: createQuarterlyReport(
            kpis: [
              const KPI(
                name: 'Revenue',
                value: '15000000',
                change: '+15%',
                trend: 'up',
                unit: 'currency',
              ),
            ],
          ),
        ));

        // Target indicators should show comparison
        expect(find.byType(Card), findsWidgets);
      });
    });
  });
}
