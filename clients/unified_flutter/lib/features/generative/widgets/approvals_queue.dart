import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

/// Type of approval item for callback identification
enum ApprovalItemType {
  timeOff,
  expense,
  budget,
}

/// Time Off Request data model
class TimeOffRequest {
  final String id;
  final String employeeName;
  final String type;
  final DateTime startDate;
  final DateTime endDate;
  final bool isUrgent;

  const TimeOffRequest({
    required this.id,
    required this.employeeName,
    required this.type,
    required this.startDate,
    required this.endDate,
    this.isUrgent = false,
  });
}

/// Expense Report data model
class ExpenseReport {
  final String id;
  final String employeeName;
  final double amount;
  final String description;
  final bool isUrgent;

  const ExpenseReport({
    required this.id,
    required this.employeeName,
    required this.amount,
    required this.description,
    this.isUrgent = false,
  });
}

/// Budget Amendment data model
class BudgetAmendment {
  final String id;
  final String department;
  final double amount;
  final String reason;
  final bool isUrgent;

  const BudgetAmendment({
    required this.id,
    required this.department,
    required this.amount,
    required this.reason,
    this.isUrgent = false,
  });
}

/// ApprovalsQueue widget for displaying pending approvals (Generative UI component)
///
/// Displays collapsible sections for:
/// - Time Off Requests
/// - Expense Reports
/// - Budget Amendments
///
/// Each item has approve/reject buttons and a view details action.
/// Supports loading, error, and empty states.
/// Urgent items are highlighted with visual indicators.
class ApprovalsQueue extends StatefulWidget {
  final List<TimeOffRequest> timeOffRequests;
  final List<ExpenseReport> expenseReports;
  final List<BudgetAmendment> budgetAmendments;
  final void Function(String id, ApprovalItemType type) onApprove;
  final void Function(String id, ApprovalItemType type) onReject;
  final void Function(String id, ApprovalItemType type) onViewDetails;
  final bool isLoading;
  final String? error;

  const ApprovalsQueue({
    super.key,
    required this.timeOffRequests,
    required this.expenseReports,
    required this.budgetAmendments,
    required this.onApprove,
    required this.onReject,
    required this.onViewDetails,
    this.isLoading = false,
    this.error,
  });

  @override
  State<ApprovalsQueue> createState() => _ApprovalsQueueState();
}

class _ApprovalsQueueState extends State<ApprovalsQueue> {
  final Map<ApprovalItemType, bool> _expandedSections = {
    ApprovalItemType.timeOff: true,
    ApprovalItemType.expense: true,
    ApprovalItemType.budget: true,
  };

  final _currencyFormat = NumberFormat.currency(symbol: r'$');
  final _dateFormat = DateFormat('MMM d');

  @override
  Widget build(BuildContext context) {
    if (widget.isLoading) {
      return _buildLoadingState(context);
    }

    if (widget.error != null) {
      return _buildErrorState(context);
    }

    final hasItems = widget.timeOffRequests.isNotEmpty ||
        widget.expenseReports.isNotEmpty ||
        widget.budgetAmendments.isNotEmpty;

    if (!hasItems) {
      return _buildEmptyState(context);
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (widget.timeOffRequests.isNotEmpty)
          _buildSection(
            context,
            title: 'Time Off Requests',
            count: widget.timeOffRequests.length,
            type: ApprovalItemType.timeOff,
            children: widget.timeOffRequests
                .map((req) => _buildTimeOffItem(context, req))
                .toList(),
          ),
        if (widget.expenseReports.isNotEmpty)
          _buildSection(
            context,
            title: 'Expense Reports',
            count: widget.expenseReports.length,
            type: ApprovalItemType.expense,
            children: widget.expenseReports
                .map((exp) => _buildExpenseItem(context, exp))
                .toList(),
          ),
        if (widget.budgetAmendments.isNotEmpty)
          _buildSection(
            context,
            title: 'Budget Amendments',
            count: widget.budgetAmendments.length,
            type: ApprovalItemType.budget,
            children: widget.budgetAmendments
                .map((bud) => _buildBudgetItem(context, bud))
                .toList(),
          ),
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
              'Loading approvals...',
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
              widget.error!,
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
              Icons.check_circle_outline,
              size: 64,
              color: theme.colorScheme.primary,
            ),
            const SizedBox(height: 16),
            Text(
              'No pending approvals',
              style: theme.textTheme.titleMedium?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSection(
    BuildContext context, {
    required String title,
    required int count,
    required ApprovalItemType type,
    required List<Widget> children,
  }) {
    final theme = Theme.of(context);
    final isExpanded = _expandedSections[type] ?? true;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        InkWell(
          onTap: () {
            setState(() {
              _expandedSections[type] = !isExpanded;
            });
          },
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            child: Row(
              children: [
                Icon(
                  isExpanded ? Icons.expand_less : Icons.expand_more,
                  color: theme.colorScheme.primary,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    '$title ($count)',
                    style: theme.textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.bold,
                      color: theme.colorScheme.primary,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
        if (isExpanded)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8),
            child: Column(children: children),
          ),
        if (isExpanded) const SizedBox(height: 8),
      ],
    );
  }

  Widget _buildApprovalCard(
    BuildContext context, {
    required String id,
    required ApprovalItemType type,
    required Widget content,
    required bool isUrgent,
  }) {
    final theme = Theme.of(context);

    return Card(
      margin: const EdgeInsets.symmetric(vertical: 4, horizontal: 8),
      color: isUrgent
          ? theme.colorScheme.errorContainer.withValues(alpha: 0.3)
          : null,
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (isUrgent)
              Padding(
                padding: const EdgeInsets.only(right: 8),
                child: Icon(
                  Icons.priority_high,
                  color: theme.colorScheme.error,
                  size: 20,
                ),
              ),
            Expanded(child: content),
            const SizedBox(width: 8),
            _buildActionButtons(context, id, type),
          ],
        ),
      ),
    );
  }

  Widget _buildActionButtons(
    BuildContext context,
    String id,
    ApprovalItemType type,
  ) {
    final theme = Theme.of(context);

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        IconButton(
          onPressed: () => widget.onViewDetails(id, type),
          icon: const Icon(Icons.visibility),
          tooltip: 'View Details',
          iconSize: 20,
          color: theme.colorScheme.primary,
        ),
        IconButton(
          onPressed: () => widget.onApprove(id, type),
          icon: const Icon(Icons.check),
          tooltip: 'Approve',
          iconSize: 20,
          color: theme.colorScheme.primary,
        ),
        IconButton(
          onPressed: () => widget.onReject(id, type),
          icon: const Icon(Icons.close),
          tooltip: 'Reject',
          iconSize: 20,
          color: theme.colorScheme.error,
        ),
      ],
    );
  }

  Widget _buildTimeOffItem(BuildContext context, TimeOffRequest request) {
    final theme = Theme.of(context);

    return _buildApprovalCard(
      context,
      id: request.id,
      type: ApprovalItemType.timeOff,
      isUrgent: request.isUrgent,
      content: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            request.employeeName,
            style: theme.textTheme.titleSmall?.copyWith(
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            request.type,
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            '${_dateFormat.format(request.startDate)} - ${_dateFormat.format(request.endDate)}',
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildExpenseItem(BuildContext context, ExpenseReport expense) {
    final theme = Theme.of(context);

    return _buildApprovalCard(
      context,
      id: expense.id,
      type: ApprovalItemType.expense,
      isUrgent: expense.isUrgent,
      content: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  expense.employeeName,
                  style: theme.textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
              Text(
                _currencyFormat.format(expense.amount),
                style: theme.textTheme.titleSmall?.copyWith(
                  fontWeight: FontWeight.bold,
                  color: theme.colorScheme.primary,
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            expense.description,
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBudgetItem(BuildContext context, BudgetAmendment amendment) {
    final theme = Theme.of(context);

    return _buildApprovalCard(
      context,
      id: amendment.id,
      type: ApprovalItemType.budget,
      isUrgent: amendment.isUrgent,
      content: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  amendment.department,
                  style: theme.textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
              Text(
                _currencyFormat.format(amendment.amount),
                style: theme.textTheme.titleSmall?.copyWith(
                  fontWeight: FontWeight.bold,
                  color: theme.colorScheme.primary,
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            amendment.reason,
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
        ],
      ),
    );
  }
}
