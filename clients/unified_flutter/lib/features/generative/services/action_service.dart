import 'package:dio/dio.dart';
import 'package:logger/logger.dart';
import '../models/component_response.dart';
import '../widgets/approvals_queue.dart';

/// Exception thrown by ActionService on errors
class ActionException implements Exception {
  /// Human-readable error message
  final String message;

  /// Error code for programmatic handling
  final String code;

  /// Original error that caused this exception
  final dynamic originalError;

  ActionException({
    required this.message,
    required this.code,
    this.originalError,
  });

  @override
  String toString() => 'ActionException: $message (code: $code)';
}

/// Service for handling generative UI component actions
///
/// Handles approval/rejection of items from ApprovalsQueue component
/// and auto-confirms pending_confirmation responses (since user already
/// clicked approve/reject in the UI).
///
/// API Endpoints:
/// - Time Off: POST /api/mcp/hr/tools/approve_time_off_request
/// - Expense: POST /api/mcp/finance/tools/approve_expense_report
/// - Budget: POST /api/mcp/finance/tools/approve_budget
class ActionService {
  final Dio _dio;
  final Logger _logger;

  ActionService({
    required Dio dio,
    Logger? logger,
  })  : _dio = dio,
        _logger = logger ?? Logger();

  /// Handle an action from a generative UI component
  ///
  /// [action] - The action event from ComponentRenderer
  ///
  /// Returns the result of the action or throws [ActionException]
  Future<Map<String, dynamic>> handleAction(ActionEvent action) async {
    _logger.i('Handling action: ${action.actionType} for ${action.targetId}');

    switch (action.actionType) {
      case 'approve':
        return _handleApproval(action, approved: true);
      case 'reject':
        return _handleApproval(action, approved: false);
      case 'navigate':
      case 'drilldown':
      case 'viewDetails':
        // Navigation actions are handled by the UI layer
        return {'status': 'handled_by_ui', 'action': action.actionType};
      default:
        _logger.w('Unknown action type: ${action.actionType}');
        return {'status': 'unknown_action', 'action': action.actionType};
    }
  }

  /// Handle approval/rejection actions from ApprovalsQueue
  Future<Map<String, dynamic>> _handleApproval(
    ActionEvent action, {
    required bool approved,
  }) async {
    final itemType = action.payload?['itemType'] as String?;
    final itemId = action.targetId ?? action.payload?['itemId'] as String?;

    if (itemId == null || itemType == null) {
      throw ActionException(
        message: 'Missing itemId or itemType in approval action',
        code: 'INVALID_ACTION',
      );
    }

    try {
      // Map itemType to API endpoint
      final (endpoint, body) = _getApprovalEndpoint(itemType, itemId, approved);

      _logger.i('Calling approval endpoint: $endpoint');
      final response = await _dio.post<Map<String, dynamic>>(
        endpoint,
        data: body,
      );

      final result = response.data ?? {};

      // Auto-confirm if server returns pending_confirmation
      // (User already clicked approve/reject in UI, so auto-confirm)
      if (result['status'] == 'pending_confirmation' &&
          result['confirmationId'] != null) {
        _logger.i('Auto-confirming (user already approved via UI button)');
        return _confirmAction(result['confirmationId'] as String, approved: true);
      }

      return result;
    } on DioException catch (e, stackTrace) {
      _logger.e('DioException in approval', error: e, stackTrace: stackTrace);
      throw _mapDioException(e);
    }
  }

  /// Get the correct API endpoint and body for an approval action
  ///
  /// IMPORTANT: Endpoints include /tools/ segment to match backend routes
  (String endpoint, Map<String, dynamic> body) _getApprovalEndpoint(
    String itemType,
    String itemId,
    bool approved,
  ) {
    switch (itemType) {
      case 'timeOff':
        return (
          '/api/mcp/hr/tools/approve_time_off_request',
          {'requestId': itemId, 'approved': approved},
        );
      case 'expense':
        final endpoint = approved
            ? '/api/mcp/finance/tools/approve_expense_report'
            : '/api/mcp/finance/tools/reject_expense_report';
        return (
          endpoint,
          approved
              ? {'reportId': itemId}
              : {'reportId': itemId, 'rejectionReason': 'Rejected via mobile app'},
        );
      case 'budget':
        final endpoint = approved
            ? '/api/mcp/finance/tools/approve_budget'
            : '/api/mcp/finance/tools/reject_budget';
        return (
          endpoint,
          approved
              ? {'budgetId': itemId}
              : {'budgetId': itemId, 'rejectionReason': 'Rejected via mobile app'},
        );
      default:
        throw ActionException(
          message: 'Unknown approval item type: $itemType',
          code: 'UNKNOWN_ITEM_TYPE',
        );
    }
  }

  /// Confirm a pending action
  Future<Map<String, dynamic>> _confirmAction(
    String confirmationId, {
    required bool approved,
  }) async {
    try {
      final response = await _dio.post<Map<String, dynamic>>(
        '/api/confirm/$confirmationId',
        data: {'approved': approved},
      );
      return response.data ?? {'status': 'unknown'};
    } on DioException catch (e, stackTrace) {
      _logger.e('Failed to confirm action', error: e, stackTrace: stackTrace);
      throw _mapDioException(e);
    }
  }

  /// Map DioException to ActionException
  ActionException _mapDioException(DioException e) {
    switch (e.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
        return ActionException(
          message: 'Request timeout. Please try again.',
          code: 'TIMEOUT',
          originalError: e,
        );

      case DioExceptionType.connectionError:
        return ActionException(
          message: 'Cannot connect to server. Check your network.',
          code: 'CONNECTION_ERROR',
          originalError: e,
        );

      case DioExceptionType.badResponse:
        return _mapHttpError(e);

      default:
        return ActionException(
          message: 'Network error: ${e.message}',
          code: 'NETWORK_ERROR',
          originalError: e,
        );
    }
  }

  /// Map HTTP status codes to ActionException
  ActionException _mapHttpError(DioException e) {
    final statusCode = e.response?.statusCode;
    final data = e.response?.data;
    final serverMessage = (data is Map<String, dynamic>) ? data['error'] : null;

    switch (statusCode) {
      case 401:
        return ActionException(
          message: 'Session expired. Please log in again.',
          code: 'UNAUTHORIZED',
          originalError: e,
        );

      case 403:
        return ActionException(
          message: 'Access denied. You don\'t have permission.',
          code: 'FORBIDDEN',
          originalError: e,
        );

      case 404:
        return ActionException(
          message: serverMessage ?? 'Item not found or already processed.',
          code: 'NOT_FOUND',
          originalError: e,
        );

      default:
        return ActionException(
          message: 'Server error ($statusCode): ${serverMessage ?? e.message}',
          code: 'HTTP_ERROR',
          originalError: e,
        );
    }
  }
}
