import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../models/component_response.dart';

/// Bulk action types for lead management
enum LeadBulkAction {
  assign,
  updateStatus,
  export,
  delete,
}

/// Sort fields for leads table
enum LeadSortField {
  name,
  company,
  status,
  score,
  source,
  lastActivity,
}

/// LeadsDataTable widget for displaying CRM leads in a data table format
///
/// Displays:
/// - Filter row with status and source dropdowns
/// - Sortable column headers
/// - Lead data with score badges and status chips
/// - Checkbox selection for bulk actions
/// - Bulk action bar when items are selected
///
/// Supports loading, error, and empty states.
class LeadsDataTable extends StatefulWidget {
  /// List of leads to display
  final List<Lead> leads;

  /// Current filter values
  final LeadFilters filters;

  /// Available lead sources for filter dropdown
  final List<String> availableSources;

  /// Callback when a lead row is clicked
  final void Function(String leadId) onLeadClick;

  /// Callback when filter values change
  final void Function(LeadFilters filters) onFilterChange;

  /// Callback when bulk action is triggered
  final void Function(LeadBulkAction action, List<String> leadIds) onBulkAction;

  /// Callback when column header is clicked for sorting
  final void Function(LeadSortField field, bool ascending) onSort;

  /// Whether data is loading
  final bool isLoading;

  /// Error message to display
  final String? error;

  const LeadsDataTable({
    super.key,
    required this.leads,
    required this.filters,
    required this.availableSources,
    required this.onLeadClick,
    required this.onFilterChange,
    required this.onBulkAction,
    required this.onSort,
    this.isLoading = false,
    this.error,
  });

  @override
  State<LeadsDataTable> createState() => _LeadsDataTableState();
}

class _LeadsDataTableState extends State<LeadsDataTable> {
  final Set<String> _selectedLeadIds = {};
  LeadSortField? _currentSortField;
  bool _sortAscending = true;

  final _dateFormat = DateFormat('MMM d, yyyy');

  @override
  Widget build(BuildContext context) {
    if (widget.isLoading) {
      return _buildLoadingState(context);
    }

    if (widget.error != null) {
      return _buildErrorState(context);
    }

    if (widget.leads.isEmpty) {
      return _buildEmptyState(context);
    }

    return Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _buildFilterRow(context),
          if (_selectedLeadIds.isNotEmpty) _buildBulkActionBar(context),
          Expanded(
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: SingleChildScrollView(
                child: _buildDataTable(context),
              ),
            ),
          ),
        ],
      ),
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
              'Loading leads...',
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
              Icons.person_search,
              size: 64,
              color: theme.colorScheme.primary,
            ),
            const SizedBox(height: 16),
            Text(
              'No leads found',
              style: theme.textTheme.titleMedium?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildFilterRow(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Row(
        children: [
          // Status filter dropdown
          Expanded(
            child: _buildStatusDropdown(context),
          ),
          const SizedBox(width: 16),
          // Source filter dropdown
          Expanded(
            child: _buildSourceDropdown(context),
          ),
        ],
      ),
    );
  }

  Widget _buildStatusDropdown(BuildContext context) {
    return DropdownButtonFormField<LeadStatus?>(
      value: widget.filters.status,
      decoration: const InputDecoration(
        labelText: 'Status',
        border: OutlineInputBorder(),
        contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      ),
      hint: const Text('All Statuses'),
      items: [
        const DropdownMenuItem<LeadStatus?>(
          value: null,
          child: Text('All Statuses'),
        ),
        ...LeadStatus.values.map((status) => DropdownMenuItem<LeadStatus?>(
              value: status,
              child: Text(_getStatusLabel(status)),
            )),
      ],
      onChanged: (value) {
        widget.onFilterChange(LeadFilters(
          status: value,
          source: widget.filters.source,
          minScore: widget.filters.minScore,
          ownerId: widget.filters.ownerId,
          search: widget.filters.search,
        ));
      },
    );
  }

  Widget _buildSourceDropdown(BuildContext context) {
    return DropdownButtonFormField<String?>(
      value: widget.filters.source,
      decoration: const InputDecoration(
        labelText: 'Source',
        border: OutlineInputBorder(),
        contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      ),
      hint: const Text('All Sources'),
      items: [
        const DropdownMenuItem<String?>(
          value: null,
          child: Text('All Sources'),
        ),
        ...widget.availableSources.map((source) => DropdownMenuItem<String?>(
              value: source,
              child: Text(source),
            )),
      ],
      onChanged: (value) {
        widget.onFilterChange(LeadFilters(
          status: widget.filters.status,
          source: value,
          minScore: widget.filters.minScore,
          ownerId: widget.filters.ownerId,
          search: widget.filters.search,
        ));
      },
    );
  }

  Widget _buildBulkActionBar(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      decoration: BoxDecoration(
        color: theme.colorScheme.primaryContainer,
        border: Border(
          bottom: BorderSide(color: theme.colorScheme.outlineVariant),
        ),
      ),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            IconButton(
              icon: const Icon(Icons.close),
              onPressed: _clearSelection,
              tooltip: 'Clear selection',
            ),
            const SizedBox(width: 8),
            Text(
              '${_selectedLeadIds.length} selected',
              style: theme.textTheme.bodyMedium?.copyWith(
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(width: 16),
            _buildBulkActionButton(
              context,
              icon: Icons.person_add,
              label: 'Assign',
              action: LeadBulkAction.assign,
            ),
            const SizedBox(width: 8),
            _buildBulkActionButton(
              context,
              icon: Icons.edit,
              label: 'Update Status',
              action: LeadBulkAction.updateStatus,
            ),
            const SizedBox(width: 8),
            _buildBulkActionButton(
              context,
              icon: Icons.download,
              label: 'Export',
              action: LeadBulkAction.export,
            ),
            const SizedBox(width: 8),
            _buildBulkActionButton(
              context,
              icon: Icons.delete,
              label: 'Delete',
              action: LeadBulkAction.delete,
              isDestructive: true,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildBulkActionButton(
    BuildContext context, {
    required IconData icon,
    required String label,
    required LeadBulkAction action,
    bool isDestructive = false,
  }) {
    final theme = Theme.of(context);

    return TextButton.icon(
      onPressed: () => widget.onBulkAction(action, _selectedLeadIds.toList()),
      icon: Icon(
        icon,
        color: isDestructive ? theme.colorScheme.error : null,
      ),
      label: Text(
        label,
        style: TextStyle(
          color: isDestructive ? theme.colorScheme.error : null,
        ),
      ),
    );
  }

  Widget _buildDataTable(BuildContext context) {
    return DataTable(
      showCheckboxColumn: true,
      columns: [
        DataColumn(
          label: const Text('Name'),
          onSort: (_, __) => _handleSort(LeadSortField.name),
        ),
        DataColumn(
          label: const Text('Company'),
          onSort: (_, __) => _handleSort(LeadSortField.company),
        ),
        DataColumn(
          label: const Text('Status'),
          onSort: (_, __) => _handleSort(LeadSortField.status),
        ),
        DataColumn(
          label: const Text('Score'),
          onSort: (_, __) => _handleSort(LeadSortField.score),
          numeric: true,
        ),
        DataColumn(
          label: const Text('Source'),
          onSort: (_, __) => _handleSort(LeadSortField.source),
        ),
        DataColumn(
          label: const Text('Last Activity'),
          onSort: (_, __) => _handleSort(LeadSortField.lastActivity),
        ),
      ],
      rows: widget.leads.map((lead) => _buildDataRow(context, lead)).toList(),
    );
  }

  DataRow _buildDataRow(BuildContext context, Lead lead) {
    final isSelected = _selectedLeadIds.contains(lead.id);

    return DataRow(
      selected: isSelected,
      onSelectChanged: (selected) {
        setState(() {
          if (selected == true) {
            _selectedLeadIds.add(lead.id);
          } else {
            _selectedLeadIds.remove(lead.id);
          }
        });
      },
      cells: [
        DataCell(
          InkWell(
            onTap: () => widget.onLeadClick(lead.id),
            child: Text(lead.name),
          ),
        ),
        DataCell(Text(lead.company ?? '-')),
        DataCell(_buildStatusChip(context, lead.status)),
        DataCell(_buildScoreBadge(context, lead.score)),
        DataCell(Text(lead.source ?? '-')),
        DataCell(
          Text(
            lead.createdAt != null ? _dateFormat.format(lead.createdAt!) : '-',
          ),
        ),
      ],
    );
  }

  Widget _buildStatusChip(BuildContext context, LeadStatus status) {
    final color = _getStatusColor(status);
    final label = _getStatusLabel(status);

    return Chip(
      label: Text(
        label,
        style: TextStyle(
          color: color,
          fontSize: 12,
        ),
      ),
      backgroundColor: color.withValues(alpha: 0.1),
      side: BorderSide(color: color.withValues(alpha: 0.3)),
      padding: EdgeInsets.zero,
      materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
    );
  }

  Widget _buildScoreBadge(BuildContext context, int? score) {
    if (score == null) {
      return const Text('-');
    }

    final color = _getScoreColor(score);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Text(
        score.toString(),
        style: TextStyle(
          color: color,
          fontWeight: FontWeight.bold,
          fontSize: 12,
        ),
      ),
    );
  }

  Color _getScoreColor(int score) {
    if (score >= 80) {
      return Colors.red; // Hot
    } else if (score >= 50) {
      return Colors.amber.shade700; // Warm
    } else {
      return Colors.blue; // Cold
    }
  }

  Color _getStatusColor(LeadStatus status) {
    switch (status) {
      case LeadStatus.newLead:
        return Colors.blue;
      case LeadStatus.contacted:
        return Colors.purple;
      case LeadStatus.qualified:
        return Colors.green;
      case LeadStatus.unqualified:
        return Colors.grey;
      case LeadStatus.converted:
        return Colors.teal;
    }
  }

  String _getStatusLabel(LeadStatus status) {
    switch (status) {
      case LeadStatus.newLead:
        return 'New';
      case LeadStatus.contacted:
        return 'Contacted';
      case LeadStatus.qualified:
        return 'Qualified';
      case LeadStatus.unqualified:
        return 'Unqualified';
      case LeadStatus.converted:
        return 'Converted';
    }
  }

  void _handleSort(LeadSortField field) {
    setState(() {
      if (_currentSortField == field) {
        _sortAscending = !_sortAscending;
      } else {
        _currentSortField = field;
        _sortAscending = true;
      }
    });
    widget.onSort(field, _sortAscending);
  }

  void _clearSelection() {
    setState(() {
      _selectedLeadIds.clear();
    });
  }
}
