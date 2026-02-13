import 'package:flutter/material.dart';
import '../../../core/theme/color_extensions.dart';
import '../models/component_response.dart';

/// Widget that renders the appropriate component based on ComponentResponse type.
///
/// This widget maps component type strings to widget constructors and falls back
/// to [UnknownComponentFallback] for unrecognized types. It supports voice-enabled
/// components and passes action callbacks to child widgets.
///
/// Example usage:
/// ```dart
/// ComponentRenderer(
///   component: ComponentResponse(
///     type: 'OrgChartComponent',
///     props: {'self': {'id': 'user-123', 'name': 'Marcus Johnson'}},
///   ),
///   onAction: (action) => handleAction(action),
///   voiceEnabled: true,
/// )
/// ```
class ComponentRenderer extends StatelessWidget {
  /// The component response from MCP UI Service
  final ComponentResponse component;

  /// Callback when user performs an action on the component
  final void Function(ActionEvent) onAction;

  /// Whether voice/TTS is enabled for narration
  final bool voiceEnabled;

  const ComponentRenderer({
    super.key,
    required this.component,
    required this.onAction,
    this.voiceEnabled = false,
  });

  /// Map of component type strings to widget builders
  static final Map<String, Widget Function(ComponentRendererContext)>
      _componentMap = {
    'OrgChartComponent': (ctx) => ComponentPlaceholder(
          componentType: 'OrgChartComponent',
          props: ctx.props,
          onAction: ctx.onAction,
        ),
    'CustomerDetailCard': (ctx) => ComponentPlaceholder(
          componentType: 'CustomerDetailCard',
          props: ctx.props,
          onAction: ctx.onAction,
        ),
    'LeadsDataTable': (ctx) => ComponentPlaceholder(
          componentType: 'LeadsDataTable',
          props: ctx.props,
          onAction: ctx.onAction,
        ),
    'ForecastChart': (ctx) => ComponentPlaceholder(
          componentType: 'ForecastChart',
          props: ctx.props,
          onAction: ctx.onAction,
        ),
    'BudgetSummaryCard': (ctx) => ComponentPlaceholder(
          componentType: 'BudgetSummaryCard',
          props: ctx.props,
          onAction: ctx.onAction,
        ),
    'ApprovalsQueue': (ctx) => ComponentPlaceholder(
          componentType: 'ApprovalsQueue',
          props: ctx.props,
          onAction: ctx.onAction,
        ),
    'QuarterlyReportDashboard': (ctx) => ComponentPlaceholder(
          componentType: 'QuarterlyReportDashboard',
          props: ctx.props,
          onAction: ctx.onAction,
        ),
  };

  @override
  Widget build(BuildContext context) {
    final builder = _componentMap[component.type];

    if (builder == null) {
      return UnknownComponentFallback(componentType: component.type);
    }

    final ctx = ComponentRendererContext(
      props: component.props,
      actions: component.actions,
      narration: component.narration,
      metadata: component.metadata,
      onAction: onAction,
      voiceEnabled: voiceEnabled,
    );

    return builder(ctx);
  }
}

/// Context passed to component builders
class ComponentRendererContext {
  final Map<String, dynamic> props;
  final List<ComponentAction> actions;
  final Narration? narration;
  final ComponentMetadata? metadata;
  final void Function(ActionEvent) onAction;
  final bool voiceEnabled;

  const ComponentRendererContext({
    required this.props,
    required this.actions,
    required this.narration,
    required this.metadata,
    required this.onAction,
    required this.voiceEnabled,
  });
}

/// Fallback widget displayed when component type is unknown.
///
/// This widget provides visual feedback that a component type was received
/// but is not recognized by the current client version.
class UnknownComponentFallback extends StatelessWidget {
  /// The unrecognized component type
  final String componentType;

  const UnknownComponentFallback({
    super.key,
    required this.componentType,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Card(
      margin: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
      color: theme.colorScheme.warningContainer,
      elevation: 1,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
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
                        'Unknown Component',
                        style: theme.textTheme.titleMedium?.copyWith(
                          color: theme.colorScheme.onWarningContainer,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'Component type "$componentType" is not supported in this version.',
                        style: theme.textTheme.bodySmall?.copyWith(
                          color:
                              theme.colorScheme.onWarningContainer.withOpacity(0.8),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Text(
              'Please update your app to view this component.',
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onWarningContainer.withOpacity(0.7),
                fontStyle: FontStyle.italic,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Placeholder widget for components that are not yet implemented.
///
/// This is a temporary widget used during development to indicate where
/// real components will be rendered. It shows the component type and props.
class ComponentPlaceholder extends StatelessWidget {
  /// The component type name
  final String componentType;

  /// Component props
  final Map<String, dynamic> props;

  /// Action callback
  final void Function(ActionEvent) onAction;

  const ComponentPlaceholder({
    super.key,
    required this.componentType,
    required this.props,
    required this.onAction,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Card(
      margin: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
      color: theme.colorScheme.surfaceContainerHighest,
      elevation: 1,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            // Header
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: theme.colorScheme.primary.withOpacity(0.1),
                    shape: BoxShape.circle,
                  ),
                  child: Icon(
                    Icons.widgets_outlined,
                    color: theme.colorScheme.primary,
                    size: 24,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        componentType,
                        style: theme.textTheme.titleMedium?.copyWith(
                          color: theme.colorScheme.onSurface,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        '${props.length} props provided',
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: theme.colorScheme.onSurface.withOpacity(0.7),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),

            const SizedBox(height: 16),

            // Placeholder content
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: theme.colorScheme.surface,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(
                  color: theme.colorScheme.outlineVariant,
                  style: BorderStyle.solid,
                ),
              ),
              child: Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      _getIconForType(componentType),
                      size: 48,
                      color: theme.colorScheme.onSurface.withOpacity(0.3),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Component placeholder',
                      style: theme.textTheme.bodyMedium?.copyWith(
                        color: theme.colorScheme.onSurface.withOpacity(0.5),
                      ),
                    ),
                    Text(
                      'Full implementation coming soon',
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.colorScheme.onSurface.withOpacity(0.4),
                        fontStyle: FontStyle.italic,
                      ),
                    ),
                  ],
                ),
              ),
            ),

            const SizedBox(height: 16),

            // Action button for testing
            Align(
              alignment: Alignment.centerRight,
              child: FilledButton.tonal(
                key: const Key('trigger-action'),
                onPressed: () => onAction(
                  ActionEvent(
                    actionId: 'placeholder-action-${componentType.toLowerCase()}',
                    actionType: 'placeholder_action',
                    payload: {'componentType': componentType},
                  ),
                ),
                child: const Text('Test Action'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  IconData _getIconForType(String type) {
    switch (type) {
      case 'OrgChartComponent':
        return Icons.account_tree_outlined;
      case 'CustomerDetailCard':
        return Icons.business_outlined;
      case 'LeadsDataTable':
        return Icons.table_chart_outlined;
      case 'ForecastChart':
        return Icons.trending_up_outlined;
      case 'BudgetSummaryCard':
        return Icons.account_balance_wallet_outlined;
      case 'ApprovalsQueue':
        return Icons.pending_actions_outlined;
      case 'QuarterlyReportDashboard':
        return Icons.dashboard_outlined;
      default:
        return Icons.widgets_outlined;
    }
  }
}
