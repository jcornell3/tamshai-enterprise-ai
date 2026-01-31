import 'dart:async';
import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:logger/logger.dart';
import '../models/chat_state.dart';

/// Chat service for interacting with MCP Gateway
///
/// Implements:
/// - SSE streaming for AI responses (v1.4 requirement)
/// - Truncation warning detection (v1.4 requirement)
/// - Pending confirmation handling (v1.4 requirement)
class ChatService {
  final Dio _dio;
  final Logger _logger;

  ChatService({
    required Dio dio,
    Logger? logger,
  })  : _dio = dio,
        _logger = logger ?? Logger();

  /// Send a query to the MCP Gateway and stream the response
  ///
  /// Returns a stream of SSE chunks that can be used to build
  /// the response incrementally in the UI.
  Stream<SSEChunk> sendQuery(String query) async* {
    try {
      _logger.i('Sending query to MCP Gateway: ${query.substring(0, query.length.clamp(0, 50))}...');

      final response = await _dio.post<ResponseBody>(
        '/api/query',
        data: {'query': query},
        options: Options(
          responseType: ResponseType.stream,
          headers: {
            'Accept': 'text/event-stream',
            'Cache-Control': 'no-cache',
          },
        ),
      );

      final stream = response.data?.stream;
      if (stream == null) {
        yield const SSEChunk(
          type: SSEEventType.error,
          error: 'No response stream received',
        );
        return;
      }

      String buffer = '';

      await for (final chunk in stream) {
        buffer += utf8.decode(chunk);

        // Process complete SSE messages (ending with \n\n)
        while (buffer.contains('\n\n')) {
          final eventEnd = buffer.indexOf('\n\n');
          final eventData = buffer.substring(0, eventEnd);
          buffer = buffer.substring(eventEnd + 2);

          final sseChunk = _parseSSEEvent(eventData);
          if (sseChunk != null) {
            yield sseChunk;

            // Check for done signal
            if (sseChunk.type == SSEEventType.done) {
              return;
            }
          }
        }
      }
    } on DioException catch (e, stackTrace) {
      _logger.e('DioException in sendQuery', error: e, stackTrace: stackTrace);
      yield SSEChunk(
        type: SSEEventType.error,
        error: _formatDioError(e),
      );
    } catch (e, stackTrace) {
      _logger.e('Unexpected error in sendQuery', error: e, stackTrace: stackTrace);
      yield SSEChunk(
        type: SSEEventType.error,
        error: 'Unexpected error: $e',
      );
    }
  }

  /// Parse SSE event data into SSEChunk
  SSEChunk? _parseSSEEvent(String eventData) {
    try {
      String? data;
      String? eventType;

      for (final line in eventData.split('\n')) {
        if (line.startsWith('data: ')) {
          data = line.substring(6);
        } else if (line.startsWith('event: ')) {
          eventType = line.substring(7);
        }
      }

      if (data == null) return null;

      // Check for [DONE] signal
      if (data == '[DONE]') {
        return const SSEChunk(type: SSEEventType.done);
      }

      final json = jsonDecode(data) as Map<String, dynamic>;

      // Parse based on Anthropic SSE format
      final type = json['type'] as String?;

      switch (type) {
        case 'message_start':
          return SSEChunk(
            type: SSEEventType.messageStart,
            metadata: json['message'] as Map<String, dynamic>?,
          );

        case 'content_block_start':
          return SSEChunk(
            type: SSEEventType.contentBlockStart,
            metadata: json['content_block'] as Map<String, dynamic>?,
          );

        case 'content_block_delta':
          final delta = json['delta'] as Map<String, dynamic>?;
          return SSEChunk(
            type: SSEEventType.contentBlockDelta,
            text: delta?['text'] as String?,
          );

        case 'content_block_stop':
          return const SSEChunk(type: SSEEventType.contentBlockStop);

        case 'message_stop':
          return const SSEChunk(type: SSEEventType.messageStop);

        case 'message_delta':
          // Check for stop reason
          final delta = json['delta'] as Map<String, dynamic>?;
          return SSEChunk(
            type: SSEEventType.messageStop,
            metadata: delta,
          );

        case 'error':
          return SSEChunk(
            type: SSEEventType.error,
            error: json['error']?['message'] as String? ?? 'Unknown error',
          );

        // MCP Gateway simplified text events
        case 'text':
          return SSEChunk(
            type: SSEEventType.contentBlockDelta,
            text: json['text'] as String?,
          );

        // v1.4: Pagination metadata (Section 5.3)
        case 'pagination':
          return SSEChunk(
            type: SSEEventType.pagination,
            metadata: json,
          );

        default:
          // Handle custom MCP Gateway events based on 'status' field
          final status = json['status'] as String?;

          // v1.4: Handle pending_confirmation from MCP servers (Section 5.6)
          if (status == 'pending_confirmation') {
            return SSEChunk(
              type: SSEEventType.pendingConfirmation,
              metadata: {
                'confirmationId': json['confirmationId'],
                'message': json['message'],
                'action': json['action'] ?? 'unknown',
                'confirmationData': json['confirmationData'],
              },
            );
          }

          // Handle truncation warnings in response data
          if (json.containsKey('truncated') && json['truncated'] == true) {
            return SSEChunk(
              type: SSEEventType.contentBlockDelta,
              text: json['warning'] as String?,
              metadata: {'truncated': true},
            );
          }

          // Legacy: Handle nested pending_confirmation for backwards compatibility
          if (json.containsKey('pending_confirmation')) {
            return SSEChunk(
              type: SSEEventType.pendingConfirmation,
              metadata: json['pending_confirmation'] as Map<String, dynamic>?,
            );
          }

          _logger.w('Unknown SSE event type: $type, status: $status');
          return null;
      }
    } catch (e, stackTrace) {
      _logger.e('Failed to parse SSE event', error: e, stackTrace: stackTrace);
      return SSEChunk(
        type: SSEEventType.error,
        error: 'Failed to parse response: $e',
      );
    }
  }

  /// Confirm or reject a pending action
  Future<Map<String, dynamic>> confirmAction(
    String confirmationId, {
    required bool approved,
  }) async {
    try {
      _logger.i('Confirming action $confirmationId: approved=$approved');

      final response = await _dio.post<Map<String, dynamic>>(
        '/api/confirm/$confirmationId',
        data: {'approved': approved},
      );

      return response.data ?? {'status': 'unknown'};
    } on DioException catch (e, stackTrace) {
      _logger.e('Failed to confirm action', error: e, stackTrace: stackTrace);
      throw Exception(_formatDioError(e));
    }
  }

  /// Format DioException for user display
  String _formatDioError(DioException e) {
    switch (e.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
        return 'Connection timeout. Please check your network.';
      case DioExceptionType.connectionError:
        return 'Cannot connect to server. Is the MCP Gateway running?';
      case DioExceptionType.badResponse:
        final statusCode = e.response?.statusCode;
        // Handle both Map responses (JSON) and ResponseBody (SSE stream)
        final data = e.response?.data;
        final message = (data is Map<String, dynamic> ? data['error'] : null) ?? e.message;
        if (statusCode == 401) {
          return 'Session expired. Please log in again.';
        } else if (statusCode == 403) {
          return 'Access denied. You don\'t have permission for this action.';
        } else if (statusCode == 404) {
          return 'Confirmation expired or not found.';
        }
        return 'Server error ($statusCode): $message';
      default:
        return 'Network error: ${e.message}';
    }
  }
}
