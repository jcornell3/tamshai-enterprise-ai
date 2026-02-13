import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

/// Period type for forecast display
enum ForecastPeriodType {
  monthly,
  quarterly,
}

/// Data for a single forecast period (month or quarter)
class ForecastPeriodData {
  final String label;
  final double actual;
  final double forecast;

  const ForecastPeriodData({
    required this.label,
    required this.actual,
    required this.forecast,
  });
}

/// Forecast chart data containing all periods and summary values
class ForecastChartData {
  final double target;
  final double achieved;
  final double projected;
  final List<ForecastPeriodData> periods;

  const ForecastChartData({
    required this.target,
    required this.achieved,
    required this.projected,
    required this.periods,
  });

  /// Calculate the gap between target and projected
  double get gap => target - projected;

  /// True if projected exceeds target
  bool get isExceedingTarget => projected > target;
}

/// ForecastChart widget for displaying sales forecast with bar chart
///
/// Displays:
/// - Summary cards: Target, Achieved, Projected, Gap
/// - Period selector: Monthly/Quarterly toggle
/// - Bar chart: Actual vs Forecast per period
/// - Target line overlay
/// - Legend with color indicators
///
/// Supports loading, error, and empty states.
class ForecastChart extends StatelessWidget {
  /// Forecast data to display
  final ForecastChartData? forecast;

  /// Currently selected period type
  final ForecastPeriodType selectedPeriodType;

  /// Callback when user drills down into a period
  final void Function(ForecastPeriodData period) onDrillDown;

  /// Callback when user changes period type
  final void Function(ForecastPeriodType periodType) onPeriodChange;

  /// Whether data is loading
  final bool isLoading;

  /// Error message to display
  final String? error;

  /// Color for actual values (below forecast)
  static const Color actualColor = Color(0xFF2196F3); // Blue

  /// Color for forecast values
  static const Color forecastColor = Color(0xFF9E9E9E); // Gray

  /// Color for actual values that exceed forecast
  static const Color exceededColor = Color(0xFF4CAF50); // Green

  /// Color for target line
  static const Color targetLineColor = Color(0xFFFF5722); // Deep Orange

  const ForecastChart({
    super.key,
    required this.forecast,
    required this.selectedPeriodType,
    required this.onDrillDown,
    required this.onPeriodChange,
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

    if (forecast == null || forecast!.periods.isEmpty) {
      return _buildEmptyState(context);
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _buildSummaryCards(context),
        const SizedBox(height: 16),
        _buildPeriodSelector(context),
        const SizedBox(height: 16),
        _buildChart(context),
        const SizedBox(height: 16),
        _buildLegend(context),
      ],
    );
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
              'Loading forecast...',
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

  Widget _buildEmptyState(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.bar_chart_outlined,
              size: 64,
              color: theme.colorScheme.primary,
            ),
            const SizedBox(height: 16),
            Text(
              'No forecast data available',
              style: theme.textTheme.titleMedium?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSummaryCards(BuildContext context) {
    final data = forecast!;
    final currencyFormat = NumberFormat.currency(
      symbol: r'$',
      decimalDigits: 0,
    );

    final gap = data.gap;
    final gapText = gap < 0
        ? '+${currencyFormat.format(gap.abs())}'
        : currencyFormat.format(gap);

    return Row(
      children: [
        Expanded(
          child: _SummaryCard(
            label: 'Target',
            value: currencyFormat.format(data.target),
            semanticLabel: 'Target: ${currencyFormat.format(data.target)}',
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: _SummaryCard(
            label: 'Achieved',
            value: currencyFormat.format(data.achieved),
            semanticLabel: 'Achieved: ${currencyFormat.format(data.achieved)}',
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: _SummaryCard(
            label: 'Projected',
            value: currencyFormat.format(data.projected),
            semanticLabel:
                'Projected: ${currencyFormat.format(data.projected)}',
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: _SummaryCard(
            label: 'Gap',
            value: gapText,
            semanticLabel: 'Gap: $gapText',
            valueColor: gap < 0
                ? const Color(0xFF4CAF50)
                : gap > 0
                    ? const Color(0xFFFF5722)
                    : null,
          ),
        ),
      ],
    );
  }

  Widget _buildPeriodSelector(BuildContext context) {
    return Center(
      child: SegmentedButton<ForecastPeriodType>(
        segments: const [
          ButtonSegment(
            value: ForecastPeriodType.monthly,
            label: Text('Monthly'),
          ),
          ButtonSegment(
            value: ForecastPeriodType.quarterly,
            label: Text('Quarterly'),
          ),
        ],
        selected: {selectedPeriodType},
        onSelectionChanged: (selection) {
          if (selection.isNotEmpty) {
            onPeriodChange(selection.first);
          }
        },
      ),
    );
  }

  Widget _buildChart(BuildContext context) {
    final data = forecast!;
    final periods = data.periods;

    // Calculate max value for scaling
    double maxValue = data.target;
    for (final period in periods) {
      maxValue = [maxValue, period.actual, period.forecast].reduce(
        (a, b) => a > b ? a : b,
      );
    }
    // Add 10% padding to top
    maxValue *= 1.1;

    // Calculate target line position
    final targetRatio = data.target / maxValue;

    return SizedBox(
      key: const Key('chart_area'),
      height: 250,
      child: Stack(
        key: const Key('chart_stack'),
        children: [
          // Bar chart
          Positioned.fill(
            child: Padding(
              padding: const EdgeInsets.only(top: 20, bottom: 30),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: List.generate(periods.length, (index) {
                  return Expanded(
                    child: _buildBarGroup(
                      context,
                      period: periods[index],
                      index: index,
                      maxValue: maxValue,
                    ),
                  );
                }),
              ),
            ),
          ),
          // Target line
          Positioned(
            left: 0,
            right: 0,
            top: 20 + (1 - targetRatio) * (250 - 50),
            child: Container(
              key: const Key('target_line'),
              height: 2,
              decoration: BoxDecoration(
                color: targetLineColor,
                boxShadow: [
                  BoxShadow(
                    color: targetLineColor.withValues(alpha: 0.3),
                    blurRadius: 4,
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBarGroup(
    BuildContext context, {
    required ForecastPeriodData period,
    required int index,
    required double maxValue,
  }) {
    final theme = Theme.of(context);
    final actualRatio = period.actual / maxValue;
    final forecastRatio = period.forecast / maxValue;

    final isExceeded = period.actual > period.forecast;
    final actualBarColor = isExceeded ? exceededColor : actualColor;

    final currencyFormat = NumberFormat.currency(
      symbol: r'$',
      decimalDigits: 0,
    );

    return GestureDetector(
      key: Key('bar_group_$index'),
      onTap: () => onDrillDown(period),
      child: Semantics(
        label:
            '${period.label}: Actual ${currencyFormat.format(period.actual)}, Forecast ${currencyFormat.format(period.forecast)}. Tap to drill down',
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              // Bars row
              Expanded(
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    // Actual bar
                    _buildBar(
                      key: Key('bar_actual_$index'),
                      ratio: actualRatio,
                      color: actualBarColor,
                    ),
                    const SizedBox(width: 4),
                    // Forecast bar
                    _buildBar(
                      key: Key('bar_forecast_$index'),
                      ratio: forecastRatio,
                      color: forecastColor,
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 8),
              // Period label
              Text(
                period.label,
                style: theme.textTheme.labelSmall?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildBar({
    required Key key,
    required double ratio,
    required Color color,
  }) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final height = constraints.maxHeight * ratio;
        return Container(
          key: key,
          width: 16,
          height: height.clamp(0, constraints.maxHeight),
          decoration: BoxDecoration(
            color: color,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(4)),
          ),
        );
      },
    );
  }

  Widget _buildLegend(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        _LegendItem(
          colorKey: const Key('legend_actual'),
          color: actualColor,
          label: 'Actual',
        ),
        const SizedBox(width: 24),
        _LegendItem(
          colorKey: const Key('legend_forecast'),
          color: forecastColor,
          label: 'Forecast',
        ),
        const SizedBox(width: 24),
        _LegendItem(
          colorKey: const Key('legend_exceeded'),
          color: exceededColor,
          label: 'Exceeded',
        ),
        const SizedBox(width: 24),
        _LegendItem(
          colorKey: const Key('legend_target'),
          color: targetLineColor,
          label: 'Target',
          isLine: true,
        ),
      ],
    );
  }
}

/// Summary card displaying a metric with label and value
class _SummaryCard extends StatelessWidget {
  final String label;
  final String value;
  final String semanticLabel;
  final Color? valueColor;

  const _SummaryCard({
    required this.label,
    required this.value,
    required this.semanticLabel,
    this.valueColor,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Semantics(
      label: semanticLabel,
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                style: theme.textTheme.labelSmall?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                value,
                style: theme.textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.bold,
                  color: valueColor,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Legend item with color indicator and label
class _LegendItem extends StatelessWidget {
  final Key? colorKey;
  final Color color;
  final String label;
  final bool isLine;

  const _LegendItem({
    super.key,
    this.colorKey,
    required this.color,
    required this.label,
    this.isLine = false,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          key: colorKey,
          width: 16,
          height: isLine ? 2 : 12,
          decoration: BoxDecoration(
            color: color,
            borderRadius: isLine ? null : BorderRadius.circular(2),
          ),
        ),
        const SizedBox(width: 4),
        Text(
          label,
          style: theme.textTheme.labelSmall?.copyWith(
            color: theme.colorScheme.onSurfaceVariant,
          ),
        ),
      ],
    );
  }
}
