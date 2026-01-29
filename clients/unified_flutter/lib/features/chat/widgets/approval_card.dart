import 'package:flutter/material.dart';
import '../../../core/chat/models/chat_state.dart';
import '../../../core/theme/color_extensions.dart';

/// Approval card widget for human-in-the-loop confirmations (v1.4 requirement)
///
/// Displays when the AI needs user approval for write operations like:
/// - Deleting records
/// - Updating data
/// - Executing sensitive actions
class ApprovalCard extends StatelessWidget {
  final PendingConfirmation confirmation;
  final VoidCallback onApprove;
  final VoidCallback onReject;

  const ApprovalCard({
    super.key,
    required this.confirmation,
    required this.onApprove,
    required this.onReject,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Card(
      margin: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
      color: theme.colorScheme.warningContainer,
      elevation: 2,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: theme.colorScheme.onWarningContainer.withOpacity(0.1),
                    shape: BoxShape.circle,
                  ),
                  child: Icon(
                    Icons.warning_amber_rounded,
                    color: theme.colorScheme.onWarningContainer,
                    size: 24,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Confirmation Required',
                        style: theme.textTheme.titleMedium?.copyWith(
                          color: theme.colorScheme.onWarningContainer,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      Text(
                        'Action: ${_formatAction(confirmation.action)}',
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: theme.colorScheme.onWarningContainer.withOpacity(0.8),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),

            const SizedBox(height: 16),

            // Message
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: theme.colorScheme.surface,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                confirmation.message,
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: theme.colorScheme.onSurface,
                ),
              ),
            ),

            // Confirmation data details (if available)
            if (confirmation.confirmationData != null &&
                confirmation.confirmationData!.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: _buildConfirmationDetails(theme),
              ),

            const SizedBox(height: 16),

            // Action buttons
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                OutlinedButton.icon(
                  onPressed: onReject,
                  icon: const Icon(Icons.close),
                  label: const Text('Cancel'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: theme.colorScheme.onWarningContainer,
                    side: BorderSide(
                      color: theme.colorScheme.onWarningContainer.withOpacity(0.5),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                FilledButton.icon(
                  onPressed: onApprove,
                  icon: const Icon(Icons.check),
                  label: const Text('Approve'),
                  style: FilledButton.styleFrom(
                    backgroundColor: theme.colorScheme.error,
                    foregroundColor: theme.colorScheme.onError,
                  ),
                ),
              ],
            ),

            // Expiry warning
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: Row(
                children: [
                  Icon(
                    Icons.timer_outlined,
                    size: 14,
                    color: theme.colorScheme.onWarningContainer.withOpacity(0.6),
                  ),
                  const SizedBox(width: 4),
                  Text(
                    'This confirmation expires in 5 minutes',
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.onWarningContainer.withOpacity(0.6),
                      fontStyle: FontStyle.italic,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildConfirmationDetails(ThemeData theme) {
    final data = confirmation.confirmationData!;

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface.withOpacity(0.5),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: theme.colorScheme.onWarningContainer.withOpacity(0.2),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Details',
            style: theme.textTheme.labelMedium?.copyWith(
              color: theme.colorScheme.onWarningContainer,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 8),
          ...data.entries.map((entry) => Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '${_formatKey(entry.key)}: ',
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.colorScheme.onWarningContainer.withOpacity(0.7),
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    Expanded(
                      child: Text(
                        entry.value.toString(),
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: theme.colorScheme.onWarningContainer,
                        ),
                      ),
                    ),
                  ],
                ),
              )),
        ],
      ),
    );
  }

  String _formatAction(String action) {
    // Convert snake_case to Title Case
    return action
        .replaceAll('_', ' ')
        .split(' ')
        .map((word) => word.isNotEmpty
            ? '${word[0].toUpperCase()}${word.substring(1)}'
            : '')
        .join(' ');
  }

  String _formatKey(String key) {
    // Convert camelCase or snake_case to Title Case
    return key
        .replaceAllMapped(
          RegExp(r'([A-Z])'),
          (match) => ' ${match.group(0)}',
        )
        .replaceAll('_', ' ')
        .trim()
        .split(' ')
        .map((word) => word.isNotEmpty
            ? '${word[0].toUpperCase()}${word.substring(1).toLowerCase()}'
            : '')
        .join(' ');
  }
}
