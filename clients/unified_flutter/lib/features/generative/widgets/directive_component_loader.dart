import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:logger/logger.dart';

import '../../../core/auth/models/auth_state.dart';
import '../../../core/auth/providers/auth_provider.dart';
import '../../../core/config/environment_config.dart';
import '../../../core/utils/directive_parser.dart';
import '../models/component_response.dart';
import '../services/display_service.dart';
import 'component_renderer.dart';

/// Provider for the DisplayService
final displayServiceProvider = Provider<DisplayService>((ref) {
  final dio = Dio(BaseOptions(
    baseUrl: '${EnvironmentConfig.current.apiBaseUrl}/mcp-ui',
    connectTimeout: const Duration(seconds: 10),
    receiveTimeout: const Duration(seconds: 30),
  ));
  return DisplayService(dio: dio, logger: Logger());
});

/// Provider for fetching component data based on a directive
final componentDataProvider = FutureProvider.family<ComponentResponse, String>(
  (ref, directive) async {
    final displayService = ref.watch(displayServiceProvider);
    final authState = ref.watch(authNotifierProvider);

    // Get user context from auth state using pattern matching
    final user = switch (authState) {
      Authenticated(:final user) => user,
      _ => null,
    };

    if (user == null) {
      throw DisplayException(
        message: 'Not authenticated',
        code: 'UNAUTHORIZED',
      );
    }

    final userContext = UserContext(
      userId: user.id,
      roles: user.roles ?? [],
    );

    return displayService.fetchComponent(directive, userContext);
  },
);

/// Widget that loads and renders a component based on a display directive
class DirectiveComponentLoader extends ConsumerWidget {
  final ParsedDirective directive;

  const DirectiveComponentLoader({
    super.key,
    required this.directive,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final componentAsync = ref.watch(
      componentDataProvider(directive.toApiDirective()),
    );

    return componentAsync.when(
      data: (component) => ComponentRenderer(
        component: component,
        onAction: (action) {
          // Handle component actions
          debugPrint('Component action: ${action.actionType} - ${action.actionId}');
        },
      ),
      loading: () => _buildLoadingState(context),
      error: (error, stack) => _buildErrorState(context, error),
    );
  }

  Widget _buildLoadingState(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          SizedBox(
            width: 20,
            height: 20,
            child: CircularProgressIndicator(
              strokeWidth: 2,
              color: theme.colorScheme.primary,
            ),
          ),
          const SizedBox(width: 12),
          Text(
            'Loading ${_getComponentName()}...',
            style: theme.textTheme.bodyMedium?.copyWith(
              color: theme.colorScheme.onSurface.withOpacity(0.7),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildErrorState(BuildContext context, Object error) {
    final theme = Theme.of(context);
    final message = error is DisplayException
        ? error.message
        : 'Failed to load component';

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: theme.colorScheme.errorContainer,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            Icons.error_outline,
            color: theme.colorScheme.onErrorContainer,
            size: 20,
          ),
          const SizedBox(width: 12),
          Flexible(
            child: Text(
              message,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.onErrorContainer,
              ),
            ),
          ),
        ],
      ),
    );
  }

  String _getComponentName() {
    switch (directive.component) {
      case 'org_chart':
        return 'org chart';
      case 'customer':
        return 'customer details';
      case 'leads':
        return 'leads';
      case 'forecast':
        return 'forecast';
      case 'budget':
        return 'budget summary';
      case 'approvals':
        return 'approvals';
      case 'quarterly_report':
        return 'quarterly report';
      default:
        return 'component';
    }
  }
}
