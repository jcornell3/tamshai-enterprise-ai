import 'package:dio/dio.dart';
import 'package:logger/logger.dart';
import '../models/component_response.dart';

/// User context containing user ID and roles for API requests
class UserContext {
  /// User's unique identifier
  final String userId;

  /// User's roles for RBAC
  final List<String> roles;

  const UserContext({
    required this.userId,
    required this.roles,
  });

  /// Returns roles as comma-separated string for HTTP header
  String get rolesAsString => roles.join(',');
}

/// Exception thrown by DisplayService on errors
class DisplayException implements Exception {
  /// Human-readable error message
  final String message;

  /// Error code for programmatic handling
  final String code;

  /// Original error that caused this exception
  final dynamic originalError;

  DisplayException({
    required this.message,
    required this.code,
    this.originalError,
  });

  @override
  String toString() => 'DisplayException: $message (code: $code)';
}

/// Service for fetching generative UI components from MCP UI API
///
/// Implements:
/// - HTTP POST to /api/display endpoint
/// - X-User-ID and X-User-Roles headers for RBAC
/// - 30-second default timeout for AI processing
/// - Comprehensive error handling with DisplayException
class DisplayService {
  final Dio _dio;
  final Logger _logger;

  /// Default timeout for API requests (AI processing can take time)
  static const Duration defaultTimeout = Duration(seconds: 30);

  DisplayService({
    required Dio dio,
    Logger? logger,
  })  : _dio = dio,
        _logger = logger ?? Logger();

  /// Fetch a UI component based on a display directive
  ///
  /// [directive] - The display instruction (e.g., "show my org chart")
  /// [userContext] - User context with ID and roles for RBAC
  /// [timeout] - Optional custom timeout (defaults to 30 seconds)
  ///
  /// Returns [ComponentResponse] containing component type, props, and actions.
  ///
  /// Throws [DisplayException] on:
  /// - Network/connection errors
  /// - Timeout errors
  /// - HTTP errors (401, 403, 404, 500)
  /// - Invalid response data
  Future<ComponentResponse> fetchComponent(
    String directive,
    UserContext userContext, {
    Duration? timeout,
  }) async {
    _logger.i('Fetching component for directive: ${directive.substring(0, directive.length.clamp(0, 50))}...');

    try {
      final response = await _dio.post<Map<String, dynamic>>(
        '/api/display',
        data: {'directive': directive},
        options: Options(
          headers: {
            'X-User-ID': userContext.userId,
            'X-User-Roles': userContext.rolesAsString,
          },
          receiveTimeout: timeout ?? defaultTimeout,
        ),
      );

      final data = response.data;
      if (data == null) {
        throw DisplayException(
          message: 'Server returned empty response',
          code: 'INVALID_RESPONSE',
        );
      }

      _logger.d('Received component response: ${data['type']}');
      return ComponentResponse.fromJson(data);
    } on DioException catch (e, stackTrace) {
      _logger.e('DioException in fetchComponent', error: e, stackTrace: stackTrace);
      throw _mapDioException(e);
    } catch (e, stackTrace) {
      if (e is DisplayException) rethrow;
      _logger.e('Unexpected error in fetchComponent', error: e, stackTrace: stackTrace);
      throw DisplayException(
        message: 'Unexpected error: $e',
        code: 'UNKNOWN_ERROR',
        originalError: e,
      );
    }
  }

  /// Map DioException to DisplayException with appropriate error codes
  DisplayException _mapDioException(DioException e) {
    switch (e.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
        return DisplayException(
          message: 'Request timeout. The server took too long to respond.',
          code: 'TIMEOUT',
          originalError: e,
        );

      case DioExceptionType.connectionError:
        return DisplayException(
          message: 'Cannot connect to server. Please check your network connection.',
          code: 'CONNECTION_ERROR',
          originalError: e,
        );

      case DioExceptionType.badResponse:
        return _mapHttpError(e);

      case DioExceptionType.cancel:
        return DisplayException(
          message: 'Request was cancelled',
          code: 'CANCELLED',
          originalError: e,
        );

      default:
        return DisplayException(
          message: 'Network error: ${e.message}',
          code: 'NETWORK_ERROR',
          originalError: e,
        );
    }
  }

  /// Map HTTP status codes to DisplayException
  DisplayException _mapHttpError(DioException e) {
    final statusCode = e.response?.statusCode;
    final data = e.response?.data;
    final serverMessage = (data is Map<String, dynamic>) ? data['error'] : null;

    switch (statusCode) {
      case 401:
        return DisplayException(
          message: 'Session expired. Please log in again.',
          code: 'UNAUTHORIZED',
          originalError: e,
        );

      case 403:
        return DisplayException(
          message: 'Access denied. You don\'t have permission for this action.',
          code: 'FORBIDDEN',
          originalError: e,
        );

      case 404:
        return DisplayException(
          message: serverMessage ?? 'No component found for this request.',
          code: 'NOT_FOUND',
          originalError: e,
        );

      case 500:
      case 502:
      case 503:
      case 504:
        return DisplayException(
          message: serverMessage ?? 'Server error. Please try again later.',
          code: 'SERVER_ERROR',
          originalError: e,
        );

      default:
        return DisplayException(
          message: 'HTTP error ($statusCode): ${serverMessage ?? e.message}',
          code: 'HTTP_ERROR',
          originalError: e,
        );
    }
  }
}
