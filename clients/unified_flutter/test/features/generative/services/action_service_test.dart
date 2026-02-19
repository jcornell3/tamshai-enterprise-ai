import 'package:flutter_test/flutter_test.dart';
import 'package:dio/dio.dart';
import 'package:mocktail/mocktail.dart';
import 'package:unified_flutter/features/generative/models/component_response.dart';
import 'package:unified_flutter/features/generative/services/action_service.dart';

class MockDio extends Mock implements Dio {}

void main() {
  late ActionService actionService;
  late MockDio mockDio;

  setUp(() {
    mockDio = MockDio();
    actionService = ActionService(dio: mockDio);
  });

  setUpAll(() {
    registerFallbackValue(Options());
  });

  group('ActionService', () {
    group('handleAction', () {
      test('handles time-off approval with correct endpoint path', () async {
        // Arrange
        final action = ActionEvent(
          actionId: 'approve-123',
          actionType: 'approve',
          targetId: 'request-123',
          payload: {'itemId': 'request-123', 'itemType': 'timeOff'},
        );

        when(() => mockDio.post<Map<String, dynamic>>(
              '/api/mcp/hr/tools/approve_time_off_request',
              data: {'requestId': 'request-123', 'approved': true},
            )).thenAnswer((_) async => Response(
              data: {'status': 'success'},
              statusCode: 200,
              requestOptions: RequestOptions(),
            ));

        // Act
        final result = await actionService.handleAction(action);

        // Assert
        expect(result['status'], 'success');
        verify(() => mockDio.post<Map<String, dynamic>>(
              '/api/mcp/hr/tools/approve_time_off_request',
              data: {'requestId': 'request-123', 'approved': true},
            )).called(1);
      });

      test('handles time-off rejection with correct endpoint path', () async {
        // Arrange
        final action = ActionEvent(
          actionId: 'reject-123',
          actionType: 'reject',
          targetId: 'request-123',
          payload: {'itemId': 'request-123', 'itemType': 'timeOff'},
        );

        when(() => mockDio.post<Map<String, dynamic>>(
              '/api/mcp/hr/tools/approve_time_off_request',
              data: {'requestId': 'request-123', 'approved': false},
            )).thenAnswer((_) async => Response(
              data: {'status': 'success'},
              statusCode: 200,
              requestOptions: RequestOptions(),
            ));

        // Act
        final result = await actionService.handleAction(action);

        // Assert
        expect(result['status'], 'success');
        verify(() => mockDio.post<Map<String, dynamic>>(
              '/api/mcp/hr/tools/approve_time_off_request',
              data: {'requestId': 'request-123', 'approved': false},
            )).called(1);
      });

      test('handles expense approval with correct endpoint path', () async {
        // Arrange
        final action = ActionEvent(
          actionId: 'approve-456',
          actionType: 'approve',
          targetId: 'report-456',
          payload: {'itemId': 'report-456', 'itemType': 'expense'},
        );

        when(() => mockDio.post<Map<String, dynamic>>(
              '/api/mcp/finance/tools/approve_expense_report',
              data: {'reportId': 'report-456'},
            )).thenAnswer((_) async => Response(
              data: {'status': 'success'},
              statusCode: 200,
              requestOptions: RequestOptions(),
            ));

        // Act
        final result = await actionService.handleAction(action);

        // Assert
        expect(result['status'], 'success');
        verify(() => mockDio.post<Map<String, dynamic>>(
              '/api/mcp/finance/tools/approve_expense_report',
              data: {'reportId': 'report-456'},
            )).called(1);
      });

      test('handles expense rejection with correct endpoint path', () async {
        // Arrange
        final action = ActionEvent(
          actionId: 'reject-456',
          actionType: 'reject',
          targetId: 'report-456',
          payload: {'itemId': 'report-456', 'itemType': 'expense'},
        );

        when(() => mockDio.post<Map<String, dynamic>>(
              '/api/mcp/finance/tools/reject_expense_report',
              data: {
                'reportId': 'report-456',
                'rejectionReason': 'Rejected via mobile app'
              },
            )).thenAnswer((_) async => Response(
              data: {'status': 'success'},
              statusCode: 200,
              requestOptions: RequestOptions(),
            ));

        // Act
        final result = await actionService.handleAction(action);

        // Assert
        expect(result['status'], 'success');
        verify(() => mockDio.post<Map<String, dynamic>>(
              '/api/mcp/finance/tools/reject_expense_report',
              data: {
                'reportId': 'report-456',
                'rejectionReason': 'Rejected via mobile app'
              },
            )).called(1);
      });

      test('handles budget approval with correct endpoint path', () async {
        // Arrange
        final action = ActionEvent(
          actionId: 'approve-789',
          actionType: 'approve',
          targetId: 'budget-789',
          payload: {'itemId': 'budget-789', 'itemType': 'budget'},
        );

        when(() => mockDio.post<Map<String, dynamic>>(
              '/api/mcp/finance/tools/approve_budget',
              data: {'budgetId': 'budget-789'},
            )).thenAnswer((_) async => Response(
              data: {'status': 'success'},
              statusCode: 200,
              requestOptions: RequestOptions(),
            ));

        // Act
        final result = await actionService.handleAction(action);

        // Assert
        expect(result['status'], 'success');
        verify(() => mockDio.post<Map<String, dynamic>>(
              '/api/mcp/finance/tools/approve_budget',
              data: {'budgetId': 'budget-789'},
            )).called(1);
      });

      test('handles budget rejection with correct endpoint path', () async {
        // Arrange
        final action = ActionEvent(
          actionId: 'reject-789',
          actionType: 'reject',
          targetId: 'budget-789',
          payload: {'itemId': 'budget-789', 'itemType': 'budget'},
        );

        when(() => mockDio.post<Map<String, dynamic>>(
              '/api/mcp/finance/tools/reject_budget',
              data: {
                'budgetId': 'budget-789',
                'rejectionReason': 'Rejected via mobile app'
              },
            )).thenAnswer((_) async => Response(
              data: {'status': 'success'},
              statusCode: 200,
              requestOptions: RequestOptions(),
            ));

        // Act
        final result = await actionService.handleAction(action);

        // Assert
        expect(result['status'], 'success');
        verify(() => mockDio.post<Map<String, dynamic>>(
              '/api/mcp/finance/tools/reject_budget',
              data: {
                'budgetId': 'budget-789',
                'rejectionReason': 'Rejected via mobile app'
              },
            )).called(1);
      });

      test('auto-confirms pending_confirmation responses', () async {
        // Arrange
        final action = ActionEvent(
          actionId: 'approve-123',
          actionType: 'approve',
          targetId: 'request-123',
          payload: {'itemId': 'request-123', 'itemType': 'timeOff'},
        );

        when(() => mockDio.post<Map<String, dynamic>>(
              '/api/mcp/hr/tools/approve_time_off_request',
              data: {'requestId': 'request-123', 'approved': true},
            )).thenAnswer((_) async => Response(
              data: {
                'status': 'pending_confirmation',
                'confirmationId': 'conf-abc',
                'message': 'Confirm approval?',
              },
              statusCode: 200,
              requestOptions: RequestOptions(),
            ));

        when(() => mockDio.post<Map<String, dynamic>>(
              '/api/confirm/conf-abc',
              data: {'approved': true},
            )).thenAnswer((_) async => Response(
              data: {'status': 'confirmed'},
              statusCode: 200,
              requestOptions: RequestOptions(),
            ));

        // Act
        final result = await actionService.handleAction(action);

        // Assert
        expect(result['status'], 'confirmed');
        verify(() => mockDio.post<Map<String, dynamic>>(
              '/api/confirm/conf-abc',
              data: {'approved': true},
            )).called(1);
      });

      test('handles navigate action without API call', () async {
        // Arrange
        final action = ActionEvent(
          actionId: 'view-123',
          actionType: 'navigate',
          targetId: 'employee-123',
        );

        // Act
        final result = await actionService.handleAction(action);

        // Assert
        expect(result['status'], 'handled_by_ui');
        expect(result['action'], 'navigate');
        verifyNever(() => mockDio.post<Map<String, dynamic>>(any(), data: any(named: 'data')));
      });

      test('throws ActionException for missing itemId', () async {
        // Arrange
        final action = ActionEvent(
          actionId: 'approve-123',
          actionType: 'approve',
          payload: {'itemType': 'timeOff'},
        );

        // Act & Assert
        expect(
          () => actionService.handleAction(action),
          throwsA(isA<ActionException>().having(
            (e) => e.code,
            'code',
            'INVALID_ACTION',
          )),
        );
      });

      test('throws ActionException for unknown item type', () async {
        // Arrange
        final action = ActionEvent(
          actionId: 'approve-123',
          actionType: 'approve',
          targetId: 'item-123',
          payload: {'itemId': 'item-123', 'itemType': 'unknown'},
        );

        // Act & Assert
        expect(
          () => actionService.handleAction(action),
          throwsA(isA<ActionException>().having(
            (e) => e.code,
            'code',
            'UNKNOWN_ITEM_TYPE',
          )),
        );
      });
    });

    group('error handling', () {
      test('maps 401 to UNAUTHORIZED', () async {
        // Arrange
        final action = ActionEvent(
          actionId: 'approve-123',
          actionType: 'approve',
          targetId: 'request-123',
          payload: {'itemId': 'request-123', 'itemType': 'timeOff'},
        );

        when(() => mockDio.post<Map<String, dynamic>>(
              any(),
              data: any(named: 'data'),
            )).thenThrow(DioException(
          type: DioExceptionType.badResponse,
          response: Response(
            statusCode: 401,
            requestOptions: RequestOptions(),
          ),
          requestOptions: RequestOptions(),
        ));

        // Act & Assert
        expect(
          () => actionService.handleAction(action),
          throwsA(isA<ActionException>().having(
            (e) => e.code,
            'code',
            'UNAUTHORIZED',
          )),
        );
      });

      test('maps 403 to FORBIDDEN', () async {
        // Arrange
        final action = ActionEvent(
          actionId: 'approve-123',
          actionType: 'approve',
          targetId: 'request-123',
          payload: {'itemId': 'request-123', 'itemType': 'timeOff'},
        );

        when(() => mockDio.post<Map<String, dynamic>>(
              any(),
              data: any(named: 'data'),
            )).thenThrow(DioException(
          type: DioExceptionType.badResponse,
          response: Response(
            statusCode: 403,
            requestOptions: RequestOptions(),
          ),
          requestOptions: RequestOptions(),
        ));

        // Act & Assert
        expect(
          () => actionService.handleAction(action),
          throwsA(isA<ActionException>().having(
            (e) => e.code,
            'code',
            'FORBIDDEN',
          )),
        );
      });

      test('maps timeout to TIMEOUT', () async {
        // Arrange
        final action = ActionEvent(
          actionId: 'approve-123',
          actionType: 'approve',
          targetId: 'request-123',
          payload: {'itemId': 'request-123', 'itemType': 'timeOff'},
        );

        when(() => mockDio.post<Map<String, dynamic>>(
              any(),
              data: any(named: 'data'),
            )).thenThrow(DioException(
          type: DioExceptionType.connectionTimeout,
          requestOptions: RequestOptions(),
        ));

        // Act & Assert
        expect(
          () => actionService.handleAction(action),
          throwsA(isA<ActionException>().having(
            (e) => e.code,
            'code',
            'TIMEOUT',
          )),
        );
      });
    });

    group('endpoint paths include /tools/ segment', () {
      // These tests specifically verify the bug fix - endpoints must include /tools/
      test('time-off endpoint has /tools/ segment', () async {
        final action = ActionEvent(
          actionId: 'approve-123',
          actionType: 'approve',
          targetId: 'request-123',
          payload: {'itemId': 'request-123', 'itemType': 'timeOff'},
        );

        when(() => mockDio.post<Map<String, dynamic>>(
              any(),
              data: any(named: 'data'),
            )).thenAnswer((_) async => Response(
              data: {'status': 'success'},
              statusCode: 200,
              requestOptions: RequestOptions(),
            ));

        await actionService.handleAction(action);

        // Verify the endpoint path contains /tools/
        final captured = verify(() => mockDio.post<Map<String, dynamic>>(
              captureAny(),
              data: any(named: 'data'),
            )).captured.single as String;
        expect(captured, contains('/tools/'));
        expect(captured, '/api/mcp/hr/tools/approve_time_off_request');
      });

      test('expense endpoints have /tools/ segment', () async {
        final action = ActionEvent(
          actionId: 'approve-456',
          actionType: 'approve',
          targetId: 'report-456',
          payload: {'itemId': 'report-456', 'itemType': 'expense'},
        );

        when(() => mockDio.post<Map<String, dynamic>>(
              any(),
              data: any(named: 'data'),
            )).thenAnswer((_) async => Response(
              data: {'status': 'success'},
              statusCode: 200,
              requestOptions: RequestOptions(),
            ));

        await actionService.handleAction(action);

        final captured = verify(() => mockDio.post<Map<String, dynamic>>(
              captureAny(),
              data: any(named: 'data'),
            )).captured.single as String;
        expect(captured, contains('/tools/'));
        expect(captured, '/api/mcp/finance/tools/approve_expense_report');
      });

      test('budget endpoints have /tools/ segment', () async {
        final action = ActionEvent(
          actionId: 'approve-789',
          actionType: 'approve',
          targetId: 'budget-789',
          payload: {'itemId': 'budget-789', 'itemType': 'budget'},
        );

        when(() => mockDio.post<Map<String, dynamic>>(
              any(),
              data: any(named: 'data'),
            )).thenAnswer((_) async => Response(
              data: {'status': 'success'},
              statusCode: 200,
              requestOptions: RequestOptions(),
            ));

        await actionService.handleAction(action);

        final captured = verify(() => mockDio.post<Map<String, dynamic>>(
              captureAny(),
              data: any(named: 'data'),
            )).captured.single as String;
        expect(captured, contains('/tools/'));
        expect(captured, '/api/mcp/finance/tools/approve_budget');
      });
    });
  });
}
