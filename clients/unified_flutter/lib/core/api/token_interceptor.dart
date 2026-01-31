import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:logger/logger.dart';
import '../storage/secure_storage_service.dart';
import '../auth/providers/auth_provider.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'certificate_pinner.dart';
import '../config/environment_config.dart';

/// Dio interceptor for automatic token injection and refresh
///
/// Features:
/// - Automatically adds Bearer token to requests
/// - Detects 401 responses and triggers token refresh
/// - Retries failed requests after refresh
class AuthTokenInterceptor extends Interceptor {
  final SecureStorageService _storage;
  final Ref _ref;
  final Logger _logger;

  /// Reference to the parent Dio instance for retrying requests.
  /// This ensures retried requests use the same configuration (cert pinning, etc.)
  late final Dio _dio;

  bool _isRefreshing = false;
  final List<RequestOptions> _requestsQueue = [];

  AuthTokenInterceptor({
    required SecureStorageService storage,
    required Ref ref,
    Logger? logger,
  })  : _storage = storage,
        _ref = ref,
        _logger = logger ?? Logger();

  /// Set the parent Dio instance. Must be called after adding to Dio.
  void setDio(Dio dio) => _dio = dio;

  @override
  Future<void> onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    try {
      // Check if token is expired
      final isExpired = await _storage.isTokenExpired();
      
      if (isExpired) {
        _logger.i('Token expired, refreshing before request');
        
        // Trigger refresh
        await _ref.read(authNotifierProvider.notifier).refreshToken();
      }

      // Get current access token
      final accessToken = await _storage.getAccessToken();

      if (accessToken != null) {
        // Add authorization header
        options.headers['Authorization'] = 'Bearer $accessToken';
        _logger.d('Added auth token to request: ${options.path}');

        // Debug: Log JWT audience claim to verify mapper is working
        try {
          final parts = accessToken.split('.');
          if (parts.length == 3) {
            final payload = utf8.decode(base64Url.decode(base64Url.normalize(parts[1])));
            final claims = jsonDecode(payload) as Map<String, dynamic>;
            _logger.i('JWT audience: ${claims['aud']}');
            _logger.i('JWT azp (authorized party): ${claims['azp']}');
          }
        } catch (e) {
          _logger.w('Could not parse JWT for debugging: $e');
        }
      } else {
        _logger.w('No access token available for request: ${options.path}');
      }

      handler.next(options);
    } catch (e, stackTrace) {
      _logger.e('Error in request interceptor', error: e, stackTrace: stackTrace);
      handler.next(options);
    }
  }

  /// Key used to mark requests as retries to avoid infinite loops
  static const String _retryKey = 'isRetry';

  @override
  Future<void> onError(
    DioException err,
    ErrorInterceptorHandler handler,
  ) async {
    // Skip if this is already a retry request (avoid infinite loop)
    final isRetry = err.requestOptions.extra[_retryKey] == true;
    if (err.response?.statusCode == 401 && !isRetry) {
      _logger.w('Received 401 response, attempting token refresh');

      try {
        if (_isRefreshing) {
          // Already refreshing, queue this request
          _logger.d('Token refresh in progress, queueing request');
          _requestsQueue.add(err.requestOptions);
          return;
        }

        _isRefreshing = true;

        // Attempt to refresh token
        await _ref.read(authNotifierProvider.notifier).refreshToken();

        _logger.i('Token refreshed successfully, retrying request');

        // Get new token
        final newToken = await _storage.getAccessToken();

        if (newToken == null) {
          _logger.e('No token after refresh');
          handler.next(err);
          return;
        }

        // Retry the original request with new token
        final requestOptions = err.requestOptions;
        requestOptions.headers['Authorization'] = 'Bearer $newToken';
        // Mark as retry to prevent infinite loop
        requestOptions.extra[_retryKey] = true;

        // Use the configured Dio instance (with cert pinning, interceptors, etc.)
        final response = await _dio.fetch(requestOptions);

        // Process queued requests
        await _processQueue(newToken);

        handler.resolve(response);
      } catch (e, stackTrace) {
        _logger.e('Token refresh failed', error: e, stackTrace: stackTrace);

        // Clear queue on refresh failure
        _requestsQueue.clear();

        // User will be logged out by auth provider
        handler.next(err);
      } finally {
        _isRefreshing = false;
      }
    } else {
      handler.next(err);
    }
  }

  /// Process queued requests with new token
  Future<void> _processQueue(String newToken) async {
    _logger.i('Processing ${_requestsQueue.length} queued requests');

    for (final options in _requestsQueue) {
      try {
        options.headers['Authorization'] = 'Bearer $newToken';
        // Mark as retry to prevent infinite loop
        options.extra[_retryKey] = true;
        // Use the configured Dio instance (with cert pinning, interceptors, etc.)
        await _dio.fetch(options);
      } catch (e) {
        _logger.e('Failed to process queued request', error: e);
      }
    }

    _requestsQueue.clear();
  }
}

/// Dio client provider with auth interceptor and certificate pinning
final dioProvider = Provider<Dio>((ref) {
  // Get API base URL from environment configuration
  // Set via: flutter build --dart-define=ENV=stage
  final baseUrl = EnvironmentConfig.current.apiBaseUrl;

  final dio = Dio(
    BaseOptions(
      baseUrl: baseUrl,
      connectTimeout: const Duration(seconds: 30),
      receiveTimeout: const Duration(seconds: 60), // Longer for AI queries
      headers: {
        'Content-Type': 'application/json',
      },
    ),
  );

  // Configure certificate pinning for production security
  // Note: Pinning is disabled when no certificates are configured (dev mode)
  CertificatePinner.configure(dio);

  // Create auth interceptor and set parent Dio reference
  final authInterceptor = AuthTokenInterceptor(
    storage: ref.watch(secureStorageProvider),
    ref: ref,
    logger: ref.watch(loggerProvider),
  );
  authInterceptor.setDio(dio);
  dio.interceptors.add(authInterceptor);

  // Add logging interceptor (development only)
  dio.interceptors.add(
    LogInterceptor(
      requestBody: true,
      responseBody: true,
      error: true,
      logPrint: (obj) => ref.read(loggerProvider).d(obj),
    ),
  );

  return dio;
});
