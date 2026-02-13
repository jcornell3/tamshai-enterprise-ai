// Unit tests for DisplayService
//
// Tests the service that fetches generative UI components from the MCP UI API.
// Uses Mocktail for Dio mocking following TDD methodology.

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:logger/logger.dart';
import 'package:mocktail/mocktail.dart';
import 'package:unified_flutter/features/generative/models/component_response.dart';
import 'package:unified_flutter/features/generative/services/display_service.dart';

// Mocks
class MockDio extends Mock implements Dio {}

class MockLogger extends Mock implements Logger {}

// Fake classes for mocktail
class FakeRequestOptions extends Fake implements RequestOptions {}

void main() {
  late DisplayService displayService;
  late MockDio mockDio;
  late MockLogger mockLogger;

  setUpAll(() {
    registerFallbackValue(FakeRequestOptions());
  });

  setUp(() {
    mockDio = MockDio();
    mockLogger = MockLogger();

    // Stub logger methods to do nothing
    when(() => mockLogger.i(any())).thenReturn(null);
    when(() => mockLogger.d(any())).thenReturn(null);
    when(() => mockLogger.w(any())).thenReturn(null);
    when(() => mockLogger.e(any(), error: any(named: 'error'), stackTrace: any(named: 'stackTrace')))
        .thenReturn(null);

    displayService = DisplayService(
      dio: mockDio,
      logger: mockLogger,
    );
  });

  group('DisplayService', () {
    group('constructor', () {
      test('creates instance with required dio parameter', () {
        final service = DisplayService(dio: mockDio);
        expect(service, isNotNull);
      });

      test('creates instance with optional logger parameter', () {
        final service = DisplayService(
          dio: mockDio,
          logger: mockLogger,
        );
        expect(service, isNotNull);
      });
    });

    group('fetchComponent', () {
      const testDirective = 'show my org chart';
      final testUserContext = UserContext(
        userId: 'user-123',
        roles: ['hr-read', 'hr-write'],
      );

      final validResponseData = {
        'type': 'OrgChartComponent',
        'props': {
          'self': {'id': 'user-123', 'name': 'John Doe', 'title': 'Developer'},
        },
        'actions': [],
      };

      test('sends POST request to /api/display endpoint', () async {
        when(() => mockDio.post<Map<String, dynamic>>(
              any(),
              data: any(named: 'data'),
              options: any(named: 'options'),
            )).thenAnswer((_) async => Response(
              data: validResponseData,
              statusCode: 200,
              requestOptions: RequestOptions(path: '/api/display'),
            ));

        await displayService.fetchComponent(testDirective, testUserContext);

        verify(() => mockDio.post<Map<String, dynamic>>(
              '/api/display',
              data: any(named: 'data'),
              options: any(named: 'options'),
            )).called(1);
      });

      test('sends directive in request body', () async {
        Map<String, dynamic>? capturedData;

        when(() => mockDio.post<Map<String, dynamic>>(
              any(),
              data: any(named: 'data'),
              options: any(named: 'options'),
            )).thenAnswer((invocation) async {
          capturedData = invocation.namedArguments[#data] as Map<String, dynamic>?;
          return Response(
            data: validResponseData,
            statusCode: 200,
            requestOptions: RequestOptions(path: '/api/display'),
          );
        });

        await displayService.fetchComponent(testDirective, testUserContext);

        expect(capturedData, isNotNull);
        expect(capturedData!['directive'], equals(testDirective));
      });

      test('includes X-User-ID header', () async {
        Options? capturedOptions;

        when(() => mockDio.post<Map<String, dynamic>>(
              any(),
              data: any(named: 'data'),
              options: any(named: 'options'),
            )).thenAnswer((invocation) async {
          capturedOptions = invocation.namedArguments[#options] as Options?;
          return Response(
            data: validResponseData,
            statusCode: 200,
            requestOptions: RequestOptions(path: '/api/display'),
          );
        });

        await displayService.fetchComponent(testDirective, testUserContext);

        expect(capturedOptions, isNotNull);
        expect(capturedOptions!.headers, isNotNull);
        expect(capturedOptions!.headers!['X-User-ID'], equals('user-123'));
      });

      test('includes X-User-Roles header as comma-separated string', () async {
        Options? capturedOptions;

        when(() => mockDio.post<Map<String, dynamic>>(
              any(),
              data: any(named: 'data'),
              options: any(named: 'options'),
            )).thenAnswer((invocation) async {
          capturedOptions = invocation.namedArguments[#options] as Options?;
          return Response(
            data: validResponseData,
            statusCode: 200,
            requestOptions: RequestOptions(path: '/api/display'),
          );
        });

        await displayService.fetchComponent(testDirective, testUserContext);

        expect(capturedOptions, isNotNull);
        expect(capturedOptions!.headers!['X-User-Roles'], equals('hr-read,hr-write'));
      });

      test('sets 30 second receive timeout by default', () async {
        Options? capturedOptions;

        when(() => mockDio.post<Map<String, dynamic>>(
              any(),
              data: any(named: 'data'),
              options: any(named: 'options'),
            )).thenAnswer((invocation) async {
          capturedOptions = invocation.namedArguments[#options] as Options?;
          return Response(
            data: validResponseData,
            statusCode: 200,
            requestOptions: RequestOptions(path: '/api/display'),
          );
        });

        await displayService.fetchComponent(testDirective, testUserContext);

        expect(capturedOptions, isNotNull);
        expect(capturedOptions!.receiveTimeout, equals(const Duration(seconds: 30)));
      });

      test('returns ComponentResponse on successful response', () async {
        when(() => mockDio.post<Map<String, dynamic>>(
              any(),
              data: any(named: 'data'),
              options: any(named: 'options'),
            )).thenAnswer((_) async => Response(
              data: validResponseData,
              statusCode: 200,
              requestOptions: RequestOptions(path: '/api/display'),
            ));

        final result = await displayService.fetchComponent(testDirective, testUserContext);

        expect(result, isA<ComponentResponse>());
        expect(result.type, equals('OrgChartComponent'));
        expect(result.props['self'], isNotNull);
      });

      test('parses ComponentResponse with actions', () async {
        final responseWithActions = {
          'type': 'ApprovalsQueue',
          'props': {'items': []},
          'actions': [
            {'id': 'approve', 'label': 'Approve', 'variant': 'primary'},
            {'id': 'reject', 'label': 'Reject', 'variant': 'danger'},
          ],
        };

        when(() => mockDio.post<Map<String, dynamic>>(
              any(),
              data: any(named: 'data'),
              options: any(named: 'options'),
            )).thenAnswer((_) async => Response(
              data: responseWithActions,
              statusCode: 200,
              requestOptions: RequestOptions(path: '/api/display'),
            ));

        final result = await displayService.fetchComponent(testDirective, testUserContext);

        expect(result.actions, hasLength(2));
        expect(result.actions[0].id, equals('approve'));
        expect(result.actions[1].id, equals('reject'));
      });

      test('parses ComponentResponse with narration', () async {
        final responseWithNarration = {
          'type': 'BudgetSummaryCard',
          'props': {'department': 'Engineering'},
          'actions': [],
          'narration': {
            'text': 'Here is your budget summary.',
            'ssml': '<speak>Here is your budget summary.</speak>',
          },
        };

        when(() => mockDio.post<Map<String, dynamic>>(
              any(),
              data: any(named: 'data'),
              options: any(named: 'options'),
            )).thenAnswer((_) async => Response(
              data: responseWithNarration,
              statusCode: 200,
              requestOptions: RequestOptions(path: '/api/display'),
            ));

        final result = await displayService.fetchComponent(testDirective, testUserContext);

        expect(result.narration, isNotNull);
        expect(result.narration!.text, equals('Here is your budget summary.'));
        expect(result.narration!.ssml, isNotNull);
      });

      test('parses ComponentResponse with metadata', () async {
        final responseWithMetadata = {
          'type': 'LeadsDataTable',
          'props': {'leads': []},
          'actions': [],
          'metadata': {
            'truncated': true,
            'totalCount': '50+',
            'warning': 'Only showing first 50 results.',
          },
        };

        when(() => mockDio.post<Map<String, dynamic>>(
              any(),
              data: any(named: 'data'),
              options: any(named: 'options'),
            )).thenAnswer((_) async => Response(
              data: responseWithMetadata,
              statusCode: 200,
              requestOptions: RequestOptions(path: '/api/display'),
            ));

        final result = await displayService.fetchComponent(testDirective, testUserContext);

        expect(result.metadata, isNotNull);
        expect(result.metadata!.truncated, isTrue);
        expect(result.metadata!.totalCount, equals('50+'));
        expect(result.metadata!.warning, isNotNull);
      });

      test('logs request on call', () async {
        when(() => mockDio.post<Map<String, dynamic>>(
              any(),
              data: any(named: 'data'),
              options: any(named: 'options'),
            )).thenAnswer((_) async => Response(
              data: validResponseData,
              statusCode: 200,
              requestOptions: RequestOptions(path: '/api/display'),
            ));

        await displayService.fetchComponent(testDirective, testUserContext);

        verify(() => mockLogger.i(any(that: contains('Fetching component')))).called(1);
      });
    });

    group('error handling', () {
      const testDirective = 'show dashboard';
      final testUserContext = UserContext(
        userId: 'user-456',
        roles: ['finance-read'],
      );

      test('throws DisplayException on connection timeout', () async {
        when(() => mockDio.post<Map<String, dynamic>>(
              any(),
              data: any(named: 'data'),
              options: any(named: 'options'),
            )).thenThrow(DioException(
          type: DioExceptionType.connectionTimeout,
          requestOptions: RequestOptions(path: '/api/display'),
        ));

        expect(
          () => displayService.fetchComponent(testDirective, testUserContext),
          throwsA(isA<DisplayException>()),
        );
      });

      test('throws DisplayException with timeout message on receive timeout', () async {
        when(() => mockDio.post<Map<String, dynamic>>(
              any(),
              data: any(named: 'data'),
              options: any(named: 'options'),
            )).thenThrow(DioException(
          type: DioExceptionType.receiveTimeout,
          requestOptions: RequestOptions(path: '/api/display'),
        ));

        try {
          await displayService.fetchComponent(testDirective, testUserContext);
          fail('Expected DisplayException');
        } on DisplayException catch (e) {
          expect(e.message, contains('timeout'));
          expect(e.code, equals('TIMEOUT'));
        }
      });

      test('throws DisplayException on 401 unauthorized', () async {
        when(() => mockDio.post<Map<String, dynamic>>(
              any(),
              data: any(named: 'data'),
              options: any(named: 'options'),
            )).thenThrow(DioException(
          type: DioExceptionType.badResponse,
          response: Response(
            statusCode: 401,
            requestOptions: RequestOptions(path: '/api/display'),
          ),
          requestOptions: RequestOptions(path: '/api/display'),
        ));

        try {
          await displayService.fetchComponent(testDirective, testUserContext);
          fail('Expected DisplayException');
        } on DisplayException catch (e) {
          expect(e.code, equals('UNAUTHORIZED'));
        }
      });

      test('throws DisplayException on 403 forbidden', () async {
        when(() => mockDio.post<Map<String, dynamic>>(
              any(),
              data: any(named: 'data'),
              options: any(named: 'options'),
            )).thenThrow(DioException(
          type: DioExceptionType.badResponse,
          response: Response(
            statusCode: 403,
            requestOptions: RequestOptions(path: '/api/display'),
          ),
          requestOptions: RequestOptions(path: '/api/display'),
        ));

        try {
          await displayService.fetchComponent(testDirective, testUserContext);
          fail('Expected DisplayException');
        } on DisplayException catch (e) {
          expect(e.code, equals('FORBIDDEN'));
        }
      });

      test('throws DisplayException on 404 not found', () async {
        when(() => mockDio.post<Map<String, dynamic>>(
              any(),
              data: any(named: 'data'),
              options: any(named: 'options'),
            )).thenThrow(DioException(
          type: DioExceptionType.badResponse,
          response: Response(
            statusCode: 404,
            data: {'error': 'No component found for directive'},
            requestOptions: RequestOptions(path: '/api/display'),
          ),
          requestOptions: RequestOptions(path: '/api/display'),
        ));

        try {
          await displayService.fetchComponent(testDirective, testUserContext);
          fail('Expected DisplayException');
        } on DisplayException catch (e) {
          expect(e.code, equals('NOT_FOUND'));
        }
      });

      test('throws DisplayException on 500 server error', () async {
        when(() => mockDio.post<Map<String, dynamic>>(
              any(),
              data: any(named: 'data'),
              options: any(named: 'options'),
            )).thenThrow(DioException(
          type: DioExceptionType.badResponse,
          response: Response(
            statusCode: 500,
            data: {'error': 'Internal server error'},
            requestOptions: RequestOptions(path: '/api/display'),
          ),
          requestOptions: RequestOptions(path: '/api/display'),
        ));

        try {
          await displayService.fetchComponent(testDirective, testUserContext);
          fail('Expected DisplayException');
        } on DisplayException catch (e) {
          expect(e.code, equals('SERVER_ERROR'));
        }
      });

      test('throws DisplayException on connection error', () async {
        when(() => mockDio.post<Map<String, dynamic>>(
              any(),
              data: any(named: 'data'),
              options: any(named: 'options'),
            )).thenThrow(DioException(
          type: DioExceptionType.connectionError,
          requestOptions: RequestOptions(path: '/api/display'),
        ));

        try {
          await displayService.fetchComponent(testDirective, testUserContext);
          fail('Expected DisplayException');
        } on DisplayException catch (e) {
          expect(e.code, equals('CONNECTION_ERROR'));
        }
      });

      test('throws DisplayException on null response data', () async {
        when(() => mockDio.post<Map<String, dynamic>>(
              any(),
              data: any(named: 'data'),
              options: any(named: 'options'),
            )).thenAnswer((_) async => Response<Map<String, dynamic>>(
              data: null,
              statusCode: 200,
              requestOptions: RequestOptions(path: '/api/display'),
            ));

        try {
          await displayService.fetchComponent(testDirective, testUserContext);
          fail('Expected DisplayException');
        } on DisplayException catch (e) {
          expect(e.code, equals('INVALID_RESPONSE'));
        }
      });

      test('logs error on exception', () async {
        when(() => mockDio.post<Map<String, dynamic>>(
              any(),
              data: any(named: 'data'),
              options: any(named: 'options'),
            )).thenThrow(DioException(
          type: DioExceptionType.connectionError,
          requestOptions: RequestOptions(path: '/api/display'),
        ));

        try {
          await displayService.fetchComponent(testDirective, testUserContext);
        } catch (_) {
          // Expected
        }

        verify(() => mockLogger.e(
              any(),
              error: any(named: 'error'),
              stackTrace: any(named: 'stackTrace'),
            )).called(1);
      });

      test('preserves original error in DisplayException', () async {
        final originalError = DioException(
          type: DioExceptionType.connectionError,
          requestOptions: RequestOptions(path: '/api/display'),
          message: 'Network unreachable',
        );

        when(() => mockDio.post<Map<String, dynamic>>(
              any(),
              data: any(named: 'data'),
              options: any(named: 'options'),
            )).thenThrow(originalError);

        try {
          await displayService.fetchComponent(testDirective, testUserContext);
          fail('Expected DisplayException');
        } on DisplayException catch (e) {
          expect(e.originalError, isNotNull);
        }
      });
    });

    group('UserContext', () {
      test('creates with required userId', () {
        final context = UserContext(userId: 'user-001', roles: []);
        expect(context.userId, equals('user-001'));
      });

      test('creates with roles list', () {
        final context = UserContext(
          userId: 'user-001',
          roles: ['admin', 'hr-read'],
        );
        expect(context.roles, containsAll(['admin', 'hr-read']));
      });

      test('creates with empty roles list', () {
        final context = UserContext(userId: 'user-001', roles: []);
        expect(context.roles, isEmpty);
      });

      test('rolesAsString returns comma-separated roles', () {
        final context = UserContext(
          userId: 'user-001',
          roles: ['hr-read', 'hr-write', 'finance-read'],
        );
        expect(context.rolesAsString, equals('hr-read,hr-write,finance-read'));
      });

      test('rolesAsString returns empty string for empty roles', () {
        final context = UserContext(userId: 'user-001', roles: []);
        expect(context.rolesAsString, isEmpty);
      });
    });

    group('DisplayException', () {
      test('creates with message and code', () {
        final exception = DisplayException(
          message: 'Test error',
          code: 'TEST_ERROR',
        );
        expect(exception.message, equals('Test error'));
        expect(exception.code, equals('TEST_ERROR'));
      });

      test('creates with originalError', () {
        final originalError = Exception('Original');
        final exception = DisplayException(
          message: 'Wrapped error',
          code: 'WRAPPED',
          originalError: originalError,
        );
        expect(exception.originalError, equals(originalError));
      });

      test('toString includes message and code', () {
        final exception = DisplayException(
          message: 'Something went wrong',
          code: 'ERROR_CODE',
        );
        final str = exception.toString();
        expect(str, contains('Something went wrong'));
        expect(str, contains('ERROR_CODE'));
      });
    });

    group('custom timeout', () {
      test('accepts custom timeout parameter', () async {
        Options? capturedOptions;

        final responseData = <String, dynamic>{
          'type': 'Test',
          'props': <String, dynamic>{},
          'actions': <Map<String, dynamic>>[],
        };

        when(() => mockDio.post<Map<String, dynamic>>(
              any(),
              data: any(named: 'data'),
              options: any(named: 'options'),
            )).thenAnswer((invocation) async {
          capturedOptions = invocation.namedArguments[#options] as Options?;
          return Response(
            data: responseData,
            statusCode: 200,
            requestOptions: RequestOptions(path: '/api/display'),
          );
        });

        final userContext = UserContext(userId: 'user-1', roles: []);
        await displayService.fetchComponent(
          'test directive',
          userContext,
          timeout: const Duration(seconds: 60),
        );

        expect(capturedOptions!.receiveTimeout, equals(const Duration(seconds: 60)));
      });
    });
  });
}
