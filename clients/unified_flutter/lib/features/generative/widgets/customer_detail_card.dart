import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../models/component_response.dart';

/// CustomerDetailCard widget for displaying CRM customer information
///
/// Displays:
/// - Customer header with name, industry badge, and status indicator
/// - Contacts section with primary contact highlighted
/// - Opportunities section with stage badges
/// - Quick action buttons (Call, Email, Schedule)
///
/// Supports loading and error states for async data fetching.
class CustomerDetailCard extends StatelessWidget {
  final Customer customer;
  final List<Contact> contacts;
  final List<Opportunity> opportunities;
  final void Function(Contact contact) onContactClick;
  final void Function(Opportunity opportunity) onOpportunityClick;
  final void Function(String action) onAction;
  final bool isLoading;
  final String? error;

  const CustomerDetailCard({
    super.key,
    required this.customer,
    required this.contacts,
    required this.opportunities,
    required this.onContactClick,
    required this.onOpportunityClick,
    required this.onAction,
    this.isLoading = false,
    this.error,
  });

  final _currencyFormat = const _CurrencyFormat();
  final _dateFormat = const _DateFormat();

  @override
  Widget build(BuildContext context) {
    if (isLoading) {
      return _buildLoadingState(context);
    }

    if (error != null) {
      return _buildErrorState(context);
    }

    return Card(
      margin: const EdgeInsets.all(8),
      elevation: 2,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _buildHeader(context),
          const Divider(height: 1),
          _buildQuickActions(context),
          const Divider(height: 1),
          _buildContactsSection(context),
          const Divider(height: 1),
          _buildOpportunitiesSection(context),
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
              'Loading customer details...',
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

  Widget _buildHeader(BuildContext context) {
    final theme = Theme.of(context);

    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Logo or placeholder
              CircleAvatar(
                radius: 28,
                backgroundColor: theme.colorScheme.primaryContainer,
                backgroundImage: customer.logoUrl != null
                    ? NetworkImage(customer.logoUrl!)
                    : null,
                child: customer.logoUrl == null
                    ? Icon(
                        Icons.business,
                        size: 28,
                        color: theme.colorScheme.onPrimaryContainer,
                      )
                    : null,
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Customer name
                    Text(
                      customer.name,
                      style: theme.textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 4),
                    // Industry and Status badges
                    Wrap(
                      spacing: 8,
                      runSpacing: 4,
                      children: [
                        if (customer.industry != null)
                          _buildIndustryBadge(context, customer.industry!),
                        _buildStatusBadge(context, customer.status),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          // Additional details
          _buildCustomerDetails(context),
        ],
      ),
    );
  }

  Widget _buildIndustryBadge(BuildContext context, String industry) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: theme.colorScheme.secondaryContainer,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        industry,
        style: theme.textTheme.labelSmall?.copyWith(
          color: theme.colorScheme.onSecondaryContainer,
        ),
      ),
    );
  }

  Widget _buildStatusBadge(BuildContext context, String status) {
    final theme = Theme.of(context);
    final (label, color, bgColor) = _getStatusColors(theme, status);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 8,
            height: 8,
            decoration: BoxDecoration(
              color: color,
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: 4),
          Text(
            label,
            style: theme.textTheme.labelSmall?.copyWith(
              color: color,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }

  (String, Color, Color) _getStatusColors(ThemeData theme, String status) {
    switch (status.toLowerCase()) {
      case 'active':
        return ('Active', Colors.green.shade700, Colors.green.shade50);
      case 'inactive':
        return ('Inactive', Colors.red.shade700, Colors.red.shade50);
      case 'prospect':
        return ('Prospect', Colors.orange.shade700, Colors.orange.shade50);
      default:
        return (status, theme.colorScheme.outline, theme.colorScheme.surface);
    }
  }

  Widget _buildCustomerDetails(BuildContext context) {
    final theme = Theme.of(context);
    final details = <Widget>[];

    if (customer.annualRevenue != null) {
      details.add(_buildDetailItem(
        context,
        Icons.attach_money,
        _currencyFormat.format(customer.annualRevenue!),
      ));
    }

    if (customer.employeeCount != null) {
      details.add(_buildDetailItem(
        context,
        Icons.people_outline,
        '${customer.employeeCount} employees',
      ));
    }

    if (customer.website != null) {
      details.add(_buildDetailItem(
        context,
        Icons.language,
        customer.website!,
      ));
    }

    if (details.isEmpty) return const SizedBox.shrink();

    return Wrap(
      spacing: 16,
      runSpacing: 8,
      children: details,
    );
  }

  Widget _buildDetailItem(BuildContext context, IconData icon, String text) {
    final theme = Theme.of(context);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(
          icon,
          size: 16,
          color: theme.colorScheme.onSurfaceVariant,
        ),
        const SizedBox(width: 4),
        Text(
          text,
          style: theme.textTheme.bodySmall?.copyWith(
            color: theme.colorScheme.onSurfaceVariant,
          ),
        ),
      ],
    );
  }

  Widget _buildQuickActions(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
        children: [
          _buildActionButton(
            context,
            icon: Icons.phone,
            label: 'Call',
            action: 'call',
          ),
          _buildActionButton(
            context,
            icon: Icons.email,
            label: 'Email',
            action: 'email',
          ),
          _buildActionButton(
            context,
            icon: Icons.calendar_today,
            label: 'Schedule',
            action: 'schedule',
          ),
        ],
      ),
    );
  }

  Widget _buildActionButton(
    BuildContext context, {
    required IconData icon,
    required String label,
    required String action,
  }) {
    return FilledButton(
      onPressed: () => onAction(action),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 18),
          const SizedBox(width: 4),
          Text(label),
        ],
      ),
    );
  }

  Widget _buildContactsSection(BuildContext context) {
    final theme = Theme.of(context);

    // Sort contacts with primary first
    final sortedContacts = List<Contact>.from(contacts)
      ..sort((a, b) {
        if (a.isPrimary && !b.isPrimary) return -1;
        if (!a.isPrimary && b.isPrimary) return 1;
        return 0;
      });

    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            contacts.isEmpty ? 'Contacts' : 'Contacts (${contacts.length})',
            style: theme.textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 8),
          if (contacts.isEmpty)
            _buildEmptyMessage(context, 'No contacts')
          else
            ...sortedContacts.map((contact) => _buildContactItem(context, contact)),
        ],
      ),
    );
  }

  Widget _buildContactItem(BuildContext context, Contact contact) {
    final theme = Theme.of(context);

    return InkWell(
      onTap: () => onContactClick(contact),
      borderRadius: BorderRadius.circular(8),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
        child: Row(
          children: [
            CircleAvatar(
              radius: 20,
              backgroundColor: theme.colorScheme.primaryContainer,
              child: Text(
                contact.name.isNotEmpty ? contact.name[0].toUpperCase() : '?',
                style: TextStyle(
                  color: theme.colorScheme.onPrimaryContainer,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Text(
                        contact.name,
                        style: theme.textTheme.bodyMedium?.copyWith(
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                      if (contact.isPrimary) ...[
                        const SizedBox(width: 8),
                        Icon(
                          Icons.star,
                          size: 16,
                          color: Colors.amber.shade700,
                        ),
                        const SizedBox(width: 4),
                        Text(
                          'Primary',
                          style: theme.textTheme.labelSmall?.copyWith(
                            color: Colors.amber.shade700,
                          ),
                        ),
                      ],
                    ],
                  ),
                  if (contact.title != null)
                    Text(
                      contact.title!,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                    ),
                  if (contact.email != null)
                    Text(
                      contact.email!,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.colorScheme.primary,
                      ),
                    ),
                  if (contact.phone != null)
                    Text(
                      contact.phone!,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                    ),
                ],
              ),
            ),
            Icon(
              Icons.chevron_right,
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildOpportunitiesSection(BuildContext context) {
    final theme = Theme.of(context);

    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            opportunities.isEmpty
                ? 'Opportunities'
                : 'Opportunities (${opportunities.length})',
            style: theme.textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 8),
          if (opportunities.isEmpty)
            _buildEmptyMessage(context, 'No opportunities')
          else
            ...opportunities.map((opp) => _buildOpportunityItem(context, opp)),
        ],
      ),
    );
  }

  Widget _buildOpportunityItem(BuildContext context, Opportunity opportunity) {
    final theme = Theme.of(context);

    return InkWell(
      onTap: () => onOpportunityClick(opportunity),
      borderRadius: BorderRadius.circular(8),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    opportunity.name,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      Text(
                        _currencyFormat.format(opportunity.amount),
                        style: theme.textTheme.bodyMedium?.copyWith(
                          color: theme.colorScheme.primary,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      if (opportunity.probability != null) ...[
                        const SizedBox(width: 8),
                        Text(
                          '${opportunity.probability!.toInt()}%',
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: theme.colorScheme.onSurfaceVariant,
                          ),
                        ),
                      ],
                    ],
                  ),
                  if (opportunity.closeDate != null)
                    Text(
                      'Close: ${_dateFormat.format(opportunity.closeDate!)}',
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                    ),
                ],
              ),
            ),
            _buildStageBadge(context, opportunity.stage),
            const SizedBox(width: 8),
            Icon(
              Icons.chevron_right,
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildStageBadge(BuildContext context, String stage) {
    final (color, bgColor) = _getStageColors(stage);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        stage,
        style: TextStyle(
          fontSize: 12,
          color: color,
          fontWeight: FontWeight.w500,
        ),
      ),
    );
  }

  (Color, Color) _getStageColors(String stage) {
    switch (stage.toLowerCase()) {
      case 'prospecting':
        return (Colors.grey.shade700, Colors.grey.shade100);
      case 'qualification':
        return (Colors.blue.shade700, Colors.blue.shade50);
      case 'proposal':
        return (Colors.purple.shade700, Colors.purple.shade50);
      case 'negotiation':
        return (Colors.orange.shade700, Colors.orange.shade50);
      case 'closed won':
        return (Colors.green.shade700, Colors.green.shade50);
      case 'closed lost':
        return (Colors.red.shade700, Colors.red.shade50);
      default:
        return (Colors.grey.shade700, Colors.grey.shade100);
    }
  }

  Widget _buildEmptyMessage(BuildContext context, String message) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 16),
      child: Center(
        child: Text(
          message,
          style: theme.textTheme.bodyMedium?.copyWith(
            color: theme.colorScheme.onSurfaceVariant,
          ),
        ),
      ),
    );
  }
}

/// Helper class for currency formatting
class _CurrencyFormat {
  const _CurrencyFormat();

  String format(double value) {
    final formatter = NumberFormat.currency(symbol: r'$', decimalDigits: 0);
    return formatter.format(value);
  }
}

/// Helper class for date formatting
class _DateFormat {
  const _DateFormat();

  String format(DateTime date) {
    final formatter = DateFormat('MMM d, yyyy');
    return formatter.format(date);
  }
}
