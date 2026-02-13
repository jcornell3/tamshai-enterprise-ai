import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../models/component_response.dart';

/// Export format for quarterly reports
enum ExportFormat {
  pdf,
  csv,
}

/// QuarterlyReportDashboard displays executive metrics for quarterly reports
///
/// Features:
/// - KPI cards in GridView with value formatting and change indicators
/// - ARR Waterfall section with horizontal bars
/// - Highlights section with bulleted list
/// - Export buttons (PDF, CSV)
/// - Loading and error states
/// - Material 3 design with proper typography
class QuarterlyReportDashboard extends StatelessWidget {
  /// The quarterly report data to display
  final QuarterlyReport report;

  /// Key highlights to display as a bulleted list
  final List<String> highlights;

  /// Callback when user taps a KPI for drill-down
  final void Function(String kpiName) onDrillDown;

  /// Callback when user requests an export
  final void Function(ExportFormat format) onExport;

  /// Whether the dashboard is in loading state
  final bool isLoading;

  /// Error message to display (if any)
  final String? error;

  const QuarterlyReportDashboard({
    super.key,
    required this.report,
    required this.highlights,
    required this.onDrillDown,
    required this.onExport,
    this.isLoading = false,
    this.error,
  });

  @override
  Widget build(BuildContext context) {
    if (isLoading) {
      return _buildLoadingState(context);
    }

    if (error != null) {
      return _buildErrorState(context);
    }

    return _buildContent(context);
  }

  Widget _buildLoadingState(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const CircularProgressIndicator(),
            const SizedBox(height: 16),
            Text(
              'Loading quarterly report...',
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildErrorState(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.error_outline,
              size: 64,
              color: theme.colorScheme.error,
            ),
            const SizedBox(height: 16),
            Text(
              error!,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.error,
              ),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildContent(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _buildHeader(context),
          const SizedBox(height: 24),
          _buildMainKPIs(context),
          const SizedBox(height: 24),
          if (report.kpis.isNotEmpty) ...[
            _buildKPIGrid(context),
            const SizedBox(height: 24),
          ],
          if (report.arrMovement != null) ...[
            _buildARRWaterfall(context),
            const SizedBox(height: 24),
          ],
          if (report.revenueBySegment.isNotEmpty) ...[
            _buildSegmentRevenue(context),
            const SizedBox(height: 24),
          ],
          if (highlights.isNotEmpty) ...[
            _buildHighlights(context),
            const SizedBox(height: 24),
          ],
          _buildExportButtons(context),
        ],
      ),
    );
  }

  Widget _buildHeader(BuildContext context) {
    final theme = Theme.of(context);
    return Text(
      '${report.quarter} ${report.year} Quarterly Report',
      style: theme.textTheme.headlineMedium?.copyWith(
        fontWeight: FontWeight.bold,
        color: theme.colorScheme.onSurface,
      ),
    );
  }

  Widget _buildMainKPIs(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final crossAxisCount = constraints.maxWidth > 600 ? 3 : 2;
        return GridView.count(
          crossAxisCount: crossAxisCount,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: 12,
          crossAxisSpacing: 12,
          childAspectRatio: 1.5,
          children: [
            _buildKPICard(
              context,
              name: 'Revenue',
              value: report.revenue,
              growth: report.revenueGrowth,
              unit: 'currency',
            ),
            _buildKPICard(
              context,
              name: 'ARR',
              value: report.arr,
              growth: report.arrGrowth,
              unit: 'currency',
            ),
            _buildKPICard(
              context,
              name: 'Net Income',
              value: report.netIncome,
              growth: report.netIncomeGrowth,
              unit: 'currency',
            ),
          ],
        );
      },
    );
  }

  Widget _buildKPIGrid(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final crossAxisCount = constraints.maxWidth > 800
            ? 4
            : constraints.maxWidth > 600
                ? 3
                : 2;
        return GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: crossAxisCount,
            mainAxisSpacing: 12,
            crossAxisSpacing: 12,
            childAspectRatio: 1.5,
          ),
          itemCount: report.kpis.length,
          itemBuilder: (context, index) {
            final kpi = report.kpis[index];
            return _buildCustomKPICard(context, kpi);
          },
        );
      },
    );
  }

  Widget _buildKPICard(
    BuildContext context, {
    required String name,
    required double value,
    double? growth,
    required String unit,
  }) {
    final theme = Theme.of(context);
    final formattedValue = _formatValue(value, unit);

    return InkWell(
      onTap: () => onDrillDown(name),
      borderRadius: BorderRadius.circular(12),
      child: Card(
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: BorderSide(
            color: theme.colorScheme.outlineVariant,
          ),
        ),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.center,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                name,
                style: theme.textTheme.labelMedium?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 4),
              FittedBox(
                fit: BoxFit.scaleDown,
                alignment: Alignment.centerLeft,
                child: Text(
                  formattedValue,
                  style: theme.textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.bold,
                    color: theme.colorScheme.onSurface,
                  ),
                ),
              ),
              if (growth != null) ...[
                const SizedBox(height: 2),
                _buildGrowthIndicator(context, growth),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildCustomKPICard(BuildContext context, KPI kpi) {
    final theme = Theme.of(context);
    final displayValue = _formatKPIValue(kpi);

    return InkWell(
      onTap: () => onDrillDown(kpi.name),
      borderRadius: BorderRadius.circular(12),
      child: Card(
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: BorderSide(
            color: theme.colorScheme.outlineVariant,
          ),
        ),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.center,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                kpi.name,
                style: theme.textTheme.labelMedium?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 4),
              FittedBox(
                fit: BoxFit.scaleDown,
                alignment: Alignment.centerLeft,
                child: Text(
                  displayValue,
                  style: theme.textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.bold,
                    color: theme.colorScheme.onSurface,
                  ),
                ),
              ),
              if (kpi.change != null) ...[
                const SizedBox(height: 2),
                _buildKPIChangeIndicator(context, kpi.change!, kpi.trend),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildGrowthIndicator(BuildContext context, double growth) {
    final theme = Theme.of(context);
    final isPositive = growth > 0;
    final isNegative = growth < 0;

    final color = isPositive
        ? Colors.green
        : isNegative
            ? theme.colorScheme.error
            : theme.colorScheme.onSurfaceVariant;

    final icon = isPositive
        ? Icons.trending_up
        : isNegative
            ? Icons.trending_down
            : Icons.trending_flat;

    final prefix = isPositive ? '+' : '';

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 16, color: color),
        const SizedBox(width: 4),
        Text(
          '$prefix${growth.toStringAsFixed(1)}%',
          style: theme.textTheme.bodySmall?.copyWith(
            color: color,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }

  Widget _buildKPIChangeIndicator(
      BuildContext context, String change, String? trend) {
    final theme = Theme.of(context);
    final isPositive = change.startsWith('+') || trend == 'up';
    final isNegative = change.startsWith('-') || trend == 'down';

    final color = isPositive
        ? Colors.green
        : isNegative
            ? theme.colorScheme.error
            : theme.colorScheme.onSurfaceVariant;

    final icon = isPositive
        ? Icons.trending_up
        : isNegative
            ? Icons.trending_down
            : Icons.trending_flat;

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 16, color: color),
        const SizedBox(width: 4),
        Text(
          change,
          style: theme.textTheme.bodySmall?.copyWith(
            color: color,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }

  Widget _buildARRWaterfall(BuildContext context) {
    final theme = Theme.of(context);
    final movement = report.arrMovement!;

    // Find max value for scaling
    final maxValue = [
      movement.starting,
      movement.ending,
      movement.newBusiness,
      movement.expansion,
      movement.churn,
      movement.contraction,
    ].reduce((a, b) => a > b ? a : b);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'ARR Movement',
          style: theme.textTheme.titleLarge?.copyWith(
            fontWeight: FontWeight.bold,
          ),
        ),
        const SizedBox(height: 16),
        _buildWaterfallBar(
          context,
          label: 'Starting ARR',
          value: movement.starting,
          maxValue: maxValue,
          color: theme.colorScheme.primary,
        ),
        _buildWaterfallBar(
          context,
          label: 'New Business',
          value: movement.newBusiness,
          maxValue: maxValue,
          color: Colors.green,
        ),
        _buildWaterfallBar(
          context,
          label: 'Expansion',
          value: movement.expansion,
          maxValue: maxValue,
          color: Colors.green.shade300,
        ),
        _buildWaterfallBar(
          context,
          label: 'Churn',
          value: movement.churn,
          maxValue: maxValue,
          color: theme.colorScheme.error,
          isNegative: true,
        ),
        _buildWaterfallBar(
          context,
          label: 'Contraction',
          value: movement.contraction,
          maxValue: maxValue,
          color: theme.colorScheme.error.withValues(alpha: 0.7),
          isNegative: true,
        ),
        _buildWaterfallBar(
          context,
          label: 'Ending ARR',
          value: movement.ending,
          maxValue: maxValue,
          color: theme.colorScheme.primary,
        ),
      ],
    );
  }

  Widget _buildWaterfallBar(
    BuildContext context, {
    required String label,
    required double value,
    required double maxValue,
    required Color color,
    bool isNegative = false,
  }) {
    final theme = Theme.of(context);
    final percentage = (value / maxValue).clamp(0.0, 1.0);
    final formattedValue = _formatValue(value, 'currency');

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          SizedBox(
            width: 120,
            child: Text(
              label,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
          ),
          Expanded(
            child: Stack(
              children: [
                Container(
                  height: 24,
                  decoration: BoxDecoration(
                    color: theme.colorScheme.surfaceContainerHighest,
                    borderRadius: BorderRadius.circular(4),
                  ),
                ),
                FractionallySizedBox(
                  widthFactor: percentage,
                  child: Container(
                    height: 24,
                    decoration: BoxDecoration(
                      color: color,
                      borderRadius: BorderRadius.circular(4),
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          SizedBox(
            width: 100,
            child: Text(
              isNegative ? '-$formattedValue' : formattedValue,
              style: theme.textTheme.bodyMedium?.copyWith(
                fontWeight: FontWeight.w600,
                color: isNegative ? theme.colorScheme.error : null,
              ),
              textAlign: TextAlign.right,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSegmentRevenue(BuildContext context) {
    final theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'Revenue by Segment',
          style: theme.textTheme.titleLarge?.copyWith(
            fontWeight: FontWeight.bold,
          ),
        ),
        const SizedBox(height: 16),
        ...report.revenueBySegment.map((segment) {
          return Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Row(
              children: [
                Expanded(
                  flex: 2,
                  child: Text(
                    segment.segment,
                    style: theme.textTheme.bodyMedium,
                  ),
                ),
                Expanded(
                  flex: 3,
                  child: Stack(
                    children: [
                      Container(
                        height: 20,
                        decoration: BoxDecoration(
                          color: theme.colorScheme.surfaceContainerHighest,
                          borderRadius: BorderRadius.circular(4),
                        ),
                      ),
                      FractionallySizedBox(
                        widthFactor: segment.percent / 100,
                        child: Container(
                          height: 20,
                          decoration: BoxDecoration(
                            color: theme.colorScheme.primary,
                            borderRadius: BorderRadius.circular(4),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 12),
                SizedBox(
                  width: 80,
                  child: Text(
                    '${segment.percent.toStringAsFixed(1)}%',
                    style: theme.textTheme.bodyMedium?.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
                    textAlign: TextAlign.right,
                  ),
                ),
              ],
            ),
          );
        }),
      ],
    );
  }

  Widget _buildHighlights(BuildContext context) {
    final theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'Key Highlights',
          style: theme.textTheme.titleLarge?.copyWith(
            fontWeight: FontWeight.bold,
          ),
        ),
        const SizedBox(height: 16),
        ...highlights.map((highlight) {
          return Padding(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(
                  Icons.circle,
                  size: 8,
                  color: theme.colorScheme.primary,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    highlight,
                    style: theme.textTheme.bodyMedium,
                  ),
                ),
              ],
            ),
          );
        }),
      ],
    );
  }

  Widget _buildExportButtons(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        // Use wrap for narrow screens to prevent overflow
        if (constraints.maxWidth < 350) {
          return Wrap(
            spacing: 12,
            runSpacing: 8,
            alignment: WrapAlignment.end,
            children: [
              OutlinedButton.icon(
                onPressed: () => onExport(ExportFormat.csv),
                icon: const Icon(Icons.table_chart),
                label: const Text('Export CSV'),
              ),
              ElevatedButton.icon(
                onPressed: () => onExport(ExportFormat.pdf),
                icon: const Icon(Icons.picture_as_pdf),
                label: const Text('Export PDF'),
              ),
            ],
          );
        }
        return Row(
          mainAxisAlignment: MainAxisAlignment.end,
          children: [
            OutlinedButton.icon(
              onPressed: () => onExport(ExportFormat.csv),
              icon: const Icon(Icons.table_chart),
              label: const Text('Export CSV'),
            ),
            const SizedBox(width: 12),
            ElevatedButton.icon(
              onPressed: () => onExport(ExportFormat.pdf),
              icon: const Icon(Icons.picture_as_pdf),
              label: const Text('Export PDF'),
            ),
          ],
        );
      },
    );
  }

  String _formatValue(double value, String unit) {
    final formatter = NumberFormat.compactCurrency(
      symbol: r'$',
      decimalDigits: 1,
    );
    return formatter.format(value);
  }

  String _formatKPIValue(KPI kpi) {
    final value = double.tryParse(kpi.value) ?? 0;
    final unit = kpi.unit ?? 'number';

    switch (unit) {
      case 'currency':
        return NumberFormat.compactCurrency(
          symbol: r'$',
          decimalDigits: 1,
        ).format(value);
      case 'percent':
        return '${value.toStringAsFixed(1)}%';
      default:
        return NumberFormat.compact().format(value);
    }
  }
}
