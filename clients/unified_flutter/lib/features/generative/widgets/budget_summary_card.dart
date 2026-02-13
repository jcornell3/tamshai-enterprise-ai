import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../models/component_response.dart';

/// Direction of budget trend compared to previous period
enum TrendDirection {
  up,
  down,
  neutral,
}

/// Budget trend data comparing to previous period
class BudgetTrend {
  /// Direction of the trend (up, down, or neutral)
  final TrendDirection direction;

  /// Percentage change from previous period
  final double percentChange;

  /// Label describing the comparison period (e.g., "vs Q3 2025")
  final String label;

  const BudgetTrend({
    required this.direction,
    required this.percentChange,
    required this.label,
  });
}

/// BudgetSummaryCard widget for displaying department budget summary
///
/// Displays:
/// - Department name and fiscal year
/// - Total budget, spent, and remaining amounts with currency formatting
/// - Progress bar with color coding (green <80%, yellow/orange 80-95%, red >95%)
/// - Warning indicator when >90% spent
/// - Category breakdown table with individual progress bars
/// - "Request Amendment" button when remaining <10%
/// - Trend indicator comparing to previous period
///
/// Part of the Generative UI specification for AI-driven components.
class BudgetSummaryCard extends StatelessWidget {
  /// Budget data from component_response.dart
  final BudgetData budget;

  /// Optional trend data comparing to previous period
  final BudgetTrend? trend;

  /// Callback when View Details button is tapped
  final VoidCallback? onViewDetails;

  /// Callback when Request Amendment button is tapped
  final VoidCallback? onRequestAmendment;

  /// Whether the component is in loading state
  final bool isLoading;

  /// Error message to display (if any)
  final String? error;

  const BudgetSummaryCard({
    super.key,
    required this.budget,
    this.trend,
    this.onViewDetails,
    this.onRequestAmendment,
    this.isLoading = false,
    this.error,
  });

  static final _currencyFormat = NumberFormat.currency(symbol: r'$', decimalDigits: 0);
  static final _percentFormat = NumberFormat('0.0');

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    // Loading state
    if (isLoading) {
      return _buildLoadingState(theme);
    }

    // Error state
    if (error != null) {
      return _buildErrorState(theme);
    }

    // Normal state - display budget summary
    return Card(
      elevation: 2,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _buildHeader(theme),
            const SizedBox(height: 16),
            _buildSummarySection(theme),
            const SizedBox(height: 16),
            _buildProgressSection(theme),
            if (_showWarning) ...[
              const SizedBox(height: 12),
              _buildWarningSection(theme),
            ],
            if (budget.warnings.isNotEmpty) ...[
              const SizedBox(height: 8),
              _buildCustomWarnings(theme),
            ],
            if (trend != null) ...[
              const SizedBox(height: 16),
              _buildTrendSection(theme),
            ],
            if (budget.categories.isNotEmpty) ...[
              const SizedBox(height: 16),
              _buildCategoryBreakdown(theme),
            ],
            const SizedBox(height: 16),
            _buildActionButtons(theme),
          ],
        ),
      ),
    );
  }

  Widget _buildLoadingState(ThemeData theme) {
    return Card(
      child: Container(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            CircularProgressIndicator(
              color: theme.colorScheme.primary,
            ),
            const SizedBox(height: 16),
            Text(
              'Loading budget summary...',
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.onSurface.withOpacity(0.7),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildErrorState(ThemeData theme) {
    return Card(
      child: Container(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.error_outline,
              size: 48,
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

  Widget _buildHeader(ThemeData theme) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '${budget.department} Budget',
                style: theme.textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.bold,
                ),
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 4),
              Text(
                'FY ${budget.year}',
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: theme.colorScheme.onSurface.withOpacity(0.7),
                ),
              ),
            ],
          ),
        ),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          decoration: BoxDecoration(
            color: _getStatusColor(theme),
            borderRadius: BorderRadius.circular(16),
          ),
          child: Text(
            budget.status,
            style: theme.textTheme.labelMedium?.copyWith(
              color: theme.colorScheme.onPrimary,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
      ],
    );
  }

  Color _getStatusColor(ThemeData theme) {
    switch (budget.status.toUpperCase()) {
      case 'APPROVED':
        return Colors.green;
      case 'PENDING':
        return Colors.orange;
      case 'REJECTED':
        return Colors.red;
      default:
        return theme.colorScheme.primary;
    }
  }

  Widget _buildSummarySection(ThemeData theme) {
    return Row(
      children: [
        Expanded(
          child: _buildSummaryItem(
            theme,
            label: 'Total Budget',
            value: _currencyFormat.format(budget.totalBudget),
            color: theme.colorScheme.primary,
          ),
        ),
        Expanded(
          child: _buildSummaryItem(
            theme,
            label: 'Spent',
            value: _currencyFormat.format(budget.spent),
            color: _getProgressColor(budget.percentUsed),
          ),
        ),
        Expanded(
          child: _buildSummaryItem(
            theme,
            label: 'Remaining',
            value: _currencyFormat.format(budget.remaining),
            color: budget.remaining < budget.totalBudget * 0.1
                ? Colors.red
                : Colors.green,
          ),
        ),
      ],
    );
  }

  Widget _buildSummaryItem(
    ThemeData theme, {
    required String label,
    required String value,
    required Color color,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Text(
          label,
          style: theme.textTheme.labelSmall?.copyWith(
            color: theme.colorScheme.onSurface.withOpacity(0.6),
          ),
        ),
        const SizedBox(height: 4),
        Text(
          value,
          style: theme.textTheme.titleMedium?.copyWith(
            fontWeight: FontWeight.bold,
            color: color,
          ),
        ),
      ],
    );
  }

  Widget _buildProgressSection(ThemeData theme) {
    final progressValue = (budget.percentUsed / 100).clamp(0.0, 1.0);
    final progressColor = _getProgressColor(budget.percentUsed);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              '${_percentFormat.format(budget.percentUsed)}% Used',
              style: theme.textTheme.bodyMedium?.copyWith(
                fontWeight: FontWeight.w600,
              ),
            ),
            if (_showWarning)
              Icon(
                Icons.warning_amber_rounded,
                color: Colors.orange,
                size: 20,
              ),
          ],
        ),
        const SizedBox(height: 8),
        Semantics(
          label: 'Budget usage ${_percentFormat.format(budget.percentUsed)} percent',
          child: LinearProgressIndicator(
            value: progressValue,
            color: progressColor,
            backgroundColor: progressColor.withOpacity(0.2),
            minHeight: 8,
            borderRadius: BorderRadius.circular(4),
          ),
        ),
      ],
    );
  }

  Color _getProgressColor(double percentUsed) {
    if (percentUsed >= 95) {
      return Colors.red;
    } else if (percentUsed >= 80) {
      return Colors.orange;
    }
    return Colors.green;
  }

  bool get _showWarning => budget.percentUsed >= 90;

  Widget _buildWarningSection(ThemeData theme) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.orange.withOpacity(0.1),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.orange.withOpacity(0.3)),
      ),
      child: Row(
        children: [
          Icon(
            Icons.warning_amber_rounded,
            color: Colors.orange,
            size: 20,
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              'Budget nearing limit',
              style: theme.textTheme.bodyMedium?.copyWith(
                color: Colors.orange.shade800,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCustomWarnings(ThemeData theme) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: budget.warnings.map((warning) {
        return Padding(
          padding: const EdgeInsets.only(bottom: 4),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(
                Icons.info_outline,
                color: theme.colorScheme.primary,
                size: 16,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  warning,
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.colorScheme.onSurface.withOpacity(0.8),
                  ),
                ),
              ),
            ],
          ),
        );
      }).toList(),
    );
  }

  Widget _buildTrendSection(ThemeData theme) {
    if (trend == null) return const SizedBox.shrink();

    final trendIcon = _getTrendIcon();
    final trendColor = _getTrendColor();
    final changePrefix = trend!.percentChange >= 0 ? '+' : '';

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerHighest.withOpacity(0.5),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        children: [
          Icon(
            trendIcon,
            color: trendColor,
            size: 24,
          ),
          const SizedBox(width: 8),
          Text(
            '$changePrefix${_percentFormat.format(trend!.percentChange)}%',
            style: theme.textTheme.titleMedium?.copyWith(
              color: trendColor,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(width: 8),
          Text(
            trend!.label,
            style: theme.textTheme.bodyMedium?.copyWith(
              color: theme.colorScheme.onSurface.withOpacity(0.7),
            ),
          ),
        ],
      ),
    );
  }

  IconData _getTrendIcon() {
    switch (trend?.direction) {
      case TrendDirection.up:
        return Icons.trending_up;
      case TrendDirection.down:
        return Icons.trending_down;
      case TrendDirection.neutral:
      case null:
        return Icons.trending_flat;
    }
  }

  Color _getTrendColor() {
    switch (trend?.direction) {
      case TrendDirection.up:
        return Colors.green;
      case TrendDirection.down:
        return Colors.red;
      case TrendDirection.neutral:
      case null:
        return Colors.grey;
    }
  }

  Widget _buildCategoryBreakdown(ThemeData theme) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'Category Breakdown',
          style: theme.textTheme.titleMedium?.copyWith(
            fontWeight: FontWeight.bold,
          ),
        ),
        const SizedBox(height: 12),
        ...budget.categories.map((category) {
          return _buildCategoryRow(theme, category);
        }),
      ],
    );
  }

  Widget _buildCategoryRow(ThemeData theme, CategorySpend category) {
    final progressValue = (category.percentUsed / 100).clamp(0.0, 1.0);
    final progressColor = _getProgressColor(category.percentUsed);

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: Text(
                  category.category,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    fontWeight: FontWeight.w500,
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              Text(
                '${_currencyFormat.format(category.spent)} / ${_currencyFormat.format(category.allocated)}',
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.onSurface.withOpacity(0.7),
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          LinearProgressIndicator(
            value: progressValue,
            color: progressColor,
            backgroundColor: progressColor.withOpacity(0.2),
            minHeight: 6,
            borderRadius: BorderRadius.circular(3),
          ),
        ],
      ),
    );
  }

  bool get _showAmendmentButton {
    final remainingPercent = (budget.remaining / budget.totalBudget) * 100;
    return remainingPercent < 10;
  }

  Widget _buildActionButtons(ThemeData theme) {
    return Row(
      children: [
        Expanded(
          child: OutlinedButton.icon(
            onPressed: onViewDetails,
            icon: const Icon(Icons.visibility_outlined),
            label: const Text('View Details'),
          ),
        ),
        if (_showAmendmentButton) ...[
          const SizedBox(width: 12),
          Expanded(
            child: ElevatedButton.icon(
              onPressed: onRequestAmendment,
              icon: const Icon(Icons.edit_document),
              label: const Text('Request Amendment'),
              style: ElevatedButton.styleFrom(
                backgroundColor: theme.colorScheme.primary,
                foregroundColor: theme.colorScheme.onPrimary,
              ),
            ),
          ),
        ],
      ],
    );
  }
}
