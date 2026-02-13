import 'package:flutter/material.dart';
import '../models/employee.dart';

/// Org chart component for displaying organizational hierarchy
///
/// Displays employees in three rows:
/// - Top row: Manager (if provided)
/// - Middle row: Self + Peers
/// - Bottom row: Direct Reports
///
/// Part of the Generative UI specification for AI-driven components.
class OrgChartComponent extends StatelessWidget {
  /// The manager of the current employee (displayed in top row)
  final Employee? manager;

  /// The current employee (highlighted in middle row)
  final Employee self;

  /// Peer employees (same level as self, displayed in middle row)
  final List<Employee> peers;

  /// Direct reports of the current employee (displayed in bottom row)
  final List<Employee> directReports;

  /// Callback when an employee card is clicked
  final void Function(Employee)? onEmployeeClick;

  /// Whether the component is in loading state
  final bool isLoading;

  /// Error message to display (if any)
  final String? errorMessage;

  const OrgChartComponent({
    super.key,
    this.manager,
    required this.self,
    this.peers = const [],
    this.directReports = const [],
    this.onEmployeeClick,
    this.isLoading = false,
    this.errorMessage,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    // Loading state
    if (isLoading) {
      return _buildLoadingState(theme);
    }

    // Error state
    if (errorMessage != null) {
      return _buildErrorState(theme);
    }

    // Normal state - display org chart
    return Container(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Manager row (top)
          if (manager != null) ...[
            _buildRowLabel(theme, 'Manager'),
            const SizedBox(height: 8),
            Center(
              child: EmployeeCard(
                employee: manager!,
                isSelf: false,
                onTap: onEmployeeClick != null
                    ? () => onEmployeeClick!(manager!)
                    : null,
              ),
            ),
            const SizedBox(height: 16),
          ],

          // Connection lines
          OrgChartConnectors(
            hasManager: manager != null,
            hasReports: directReports.isNotEmpty,
          ),

          // Self + Peers row (middle)
          _buildRowLabel(theme, 'Team'),
          const SizedBox(height: 8),
          _buildTeamRow(context),

          // Direct Reports row (bottom)
          if (directReports.isNotEmpty) ...[
            const SizedBox(height: 16),
            _buildRowLabel(theme, 'Direct Reports'),
            const SizedBox(height: 8),
            _buildDirectReportsRow(context),
          ],
        ],
      ),
    );
  }

  Widget _buildLoadingState(ThemeData theme) {
    return Container(
      padding: const EdgeInsets.all(32),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          CircularProgressIndicator(
            color: theme.colorScheme.primary,
          ),
          const SizedBox(height: 16),
          Text(
            'Loading organization chart...',
            style: theme.textTheme.bodyMedium?.copyWith(
              color: theme.colorScheme.onSurface.withOpacity(0.7),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildErrorState(ThemeData theme) {
    return Container(
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
            errorMessage!,
            style: theme.textTheme.bodyMedium?.copyWith(
              color: theme.colorScheme.error,
            ),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }

  Widget _buildRowLabel(ThemeData theme, String label) {
    return Text(
      label,
      style: theme.textTheme.labelMedium?.copyWith(
        color: theme.colorScheme.onSurface.withOpacity(0.6),
        fontWeight: FontWeight.w600,
      ),
    );
  }

  Widget _buildTeamRow(BuildContext context) {
    // Combine self with peers, self first
    final teamMembers = [self, ...peers];

    return Wrap(
      spacing: 12,
      runSpacing: 12,
      alignment: WrapAlignment.center,
      children: teamMembers.map((employee) {
        final isSelf = employee.id == self.id;
        return EmployeeCard(
          employee: employee,
          isSelf: isSelf,
          onTap: onEmployeeClick != null
              ? () => onEmployeeClick!(employee)
              : null,
        );
      }).toList(),
    );
  }

  Widget _buildDirectReportsRow(BuildContext context) {
    return Wrap(
      spacing: 12,
      runSpacing: 12,
      alignment: WrapAlignment.center,
      children: directReports.map((employee) {
        return EmployeeCard(
          employee: employee,
          isSelf: false,
          onTap: onEmployeeClick != null
              ? () => onEmployeeClick!(employee)
              : null,
        );
      }).toList(),
    );
  }
}

/// Employee card widget displaying individual employee information
class EmployeeCard extends StatelessWidget {
  /// The employee to display
  final Employee employee;

  /// Whether this card represents the current user (highlighted)
  final bool isSelf;

  /// Callback when card is tapped
  final VoidCallback? onTap;

  const EmployeeCard({
    super.key,
    required this.employee,
    this.isSelf = false,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Card(
      elevation: isSelf ? 4 : 1,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: isSelf
            ? BorderSide(
                color: theme.colorScheme.primary,
                width: 2,
              )
            : BorderSide.none,
      ),
      color: isSelf
          ? theme.colorScheme.primaryContainer
          : theme.colorScheme.surface,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              _buildAvatar(theme),
              const SizedBox(width: 12),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    employee.name,
                    style: theme.textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.w600,
                      color: isSelf
                          ? theme.colorScheme.onPrimaryContainer
                          : theme.colorScheme.onSurface,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    employee.title,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: isSelf
                          ? theme.colorScheme.onPrimaryContainer.withOpacity(0.8)
                          : theme.colorScheme.onSurface.withOpacity(0.7),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildAvatar(ThemeData theme) {
    // If avatar URL is provided, use network image
    if (employee.avatarUrl != null && employee.avatarUrl!.isNotEmpty) {
      return CircleAvatar(
        radius: 20,
        backgroundImage: NetworkImage(employee.avatarUrl!),
        onBackgroundImageError: (_, __) {},
        child: Text(
          employee.initials,
          style: TextStyle(
            color: theme.colorScheme.onSecondary,
            fontWeight: FontWeight.w600,
            fontSize: 14,
          ),
        ),
      );
    }

    // Fallback to initials
    return CircleAvatar(
      radius: 20,
      backgroundColor: isSelf
          ? theme.colorScheme.primary
          : theme.colorScheme.secondary,
      child: Text(
        employee.initials,
        style: TextStyle(
          color: isSelf
              ? theme.colorScheme.onPrimary
              : theme.colorScheme.onSecondary,
          fontWeight: FontWeight.w600,
          fontSize: 14,
        ),
      ),
    );
  }
}

/// Widget for drawing connection lines between org chart rows
class OrgChartConnectors extends StatelessWidget {
  /// Whether there is a manager row above
  final bool hasManager;

  /// Whether there are direct reports below
  final bool hasReports;

  const OrgChartConnectors({
    super.key,
    this.hasManager = false,
    this.hasReports = false,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    // Only show if there are connections to draw
    if (!hasManager && !hasReports) {
      return const SizedBox.shrink();
    }

    return CustomPaint(
      size: const Size(double.infinity, 24),
      painter: _OrgChartLinePainter(
        color: theme.colorScheme.outline.withOpacity(0.5),
        hasManager: hasManager,
        hasReports: hasReports,
      ),
    );
  }
}

/// Custom painter for org chart connection lines
class _OrgChartLinePainter extends CustomPainter {
  final Color color;
  final bool hasManager;
  final bool hasReports;

  _OrgChartLinePainter({
    required this.color,
    required this.hasManager,
    required this.hasReports,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..strokeWidth = 2
      ..style = PaintingStyle.stroke;

    final centerX = size.width / 2;
    final topY = 0.0;
    final bottomY = size.height;
    final midY = size.height / 2;

    // Draw vertical line from manager to team
    if (hasManager) {
      canvas.drawLine(
        Offset(centerX, topY),
        Offset(centerX, midY),
        paint,
      );
    }

    // Draw vertical line from team to reports
    if (hasReports) {
      canvas.drawLine(
        Offset(centerX, midY),
        Offset(centerX, bottomY),
        paint,
      );
    }
  }

  @override
  bool shouldRepaint(covariant _OrgChartLinePainter oldDelegate) {
    return oldDelegate.color != color ||
        oldDelegate.hasManager != hasManager ||
        oldDelegate.hasReports != hasReports;
  }
}
