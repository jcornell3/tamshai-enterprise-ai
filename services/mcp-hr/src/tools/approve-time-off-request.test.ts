/**
 * Unit tests for approve-time-off-request tool
 *
 * Tests time-off request approval/rejection with human-in-the-loop confirmation
 */

import {
  approveTimeOffRequest,
  executeApproveTimeOffRequest,
  ApproveTimeOffRequestInput,
} from './approve-time-off-request';
import { UserContext } from '../database/connection';
import * as dbConnection from '../database/connection';
import * as redisUtils from '../utils/redis';

// Mock database module
jest.mock('../database/connection', () => ({
  queryWithRLS: jest.fn(),
}));

// Mock Redis utils
jest.mock('../utils/redis', () => ({
  storePendingConfirmation: jest.fn(),
}));


describe('approve-time-off-request tool', () => {
  const mockManagerContext: UserContext = {
    userId: 'manager-123',
    username: 'jane.manager',
    email: 'jane.manager@test.com',
    roles: ['manager'],
  };

  const mockHrWriteContext: UserContext = {
    userId: 'hr-123',
    username: 'alice.hr',
    email: 'alice.hr@test.com',
    roles: ['hr-write'],
  };

  const mockExecutiveContext: UserContext = {
    userId: 'exec-123',
    username: 'ceo',
    email: 'ceo@test.com',
    roles: ['executive'],
  };

  const mockRegularUser: UserContext = {
    userId: 'user-123',
    username: 'john.doe',
    email: 'john.doe@test.com',
    roles: ['user'],
  };

  const mockRequest = {
    id: '123e4567-e89b-12d3-a456-426614174001',
    employee_id: '223e4567-e89b-12d3-a456-426614174000',
    employee_name: 'John Doe',
    manager_id: 'manager-emp-123',
    type_code: 'VACATION',
    type_name: 'Vacation',
    start_date: '2026-03-01',
    end_date: '2026-03-05',
    total_days: 5,
    status: 'pending',
    notes: 'Spring break trip',
  };

  const mockManagerRecord = {
    id: 'manager-emp-123',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (redisUtils.storePendingConfirmation as jest.Mock).mockResolvedValue(undefined);
  });

  describe('Permission checks', () => {
    it('allows manager role', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS
        .mockResolvedValueOnce({ rows: [mockRequest], rowCount: 1, command: '', oid: 0, fields: [] })
        .mockResolvedValueOnce({ rows: [mockManagerRecord], rowCount: 1, command: '', oid: 0, fields: [] });

      const input: ApproveTimeOffRequestInput = {
        requestId: mockRequest.id,
        approved: true,
      };
      const result = await approveTimeOffRequest(input, mockManagerContext);

      expect(result.status).toBe('pending_confirmation');
    });

    it('allows hr-write role', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS
        .mockResolvedValueOnce({ rows: [mockRequest], rowCount: 1, command: '', oid: 0, fields: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'hr-emp-123' }], rowCount: 1, command: '', oid: 0, fields: [] });

      const input: ApproveTimeOffRequestInput = {
        requestId: mockRequest.id,
        approved: true,
      };
      const result = await approveTimeOffRequest(input, mockHrWriteContext);

      expect(result.status).toBe('pending_confirmation');
    });

    it('allows executive role', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      // For executive, the request's manager_id won't match, but hr-write override should work
      // However, executive doesn't have hr-write, so we need to ensure the request is from a direct report
      // OR we should test with a request where the executive IS the manager
      const requestWithExecAsManager = {
        ...mockRequest,
        manager_id: 'exec-emp-123', // Executive is the manager
      };

      mockQueryWithRLS
        .mockResolvedValueOnce({ rows: [requestWithExecAsManager], rowCount: 1, command: '', oid: 0, fields: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'exec-emp-123' }], rowCount: 1, command: '', oid: 0, fields: [] });

      const input: ApproveTimeOffRequestInput = {
        requestId: mockRequest.id,
        approved: true,
      };
      const result = await approveTimeOffRequest(input, mockExecutiveContext);

      expect(result.status).toBe('pending_confirmation');
    });

    it('denies regular user role', async () => {
      const input: ApproveTimeOffRequestInput = {
        requestId: mockRequest.id,
        approved: true,
      };
      const result = await approveTimeOffRequest(input, mockRegularUser);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.code).toBe('INSUFFICIENT_PERMISSIONS');
        expect(result.message).toContain('manager access');
      }
    });
  });

  describe('Input validation', () => {
    it('rejects invalid UUID for requestId', async () => {
      const input = {
        requestId: 'not-a-uuid',
        approved: true,
      } as ApproveTimeOffRequestInput;
      const result = await approveTimeOffRequest(input, mockManagerContext);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.code).toBe('INVALID_INPUT');
      }
    });

    it('accepts valid UUID for requestId', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS
        .mockResolvedValueOnce({ rows: [mockRequest], rowCount: 1, command: '', oid: 0, fields: [] })
        .mockResolvedValueOnce({ rows: [mockManagerRecord], rowCount: 1, command: '', oid: 0, fields: [] });

      const input: ApproveTimeOffRequestInput = {
        requestId: '123e4567-e89b-12d3-a456-426614174001',
        approved: true,
      };
      const result = await approveTimeOffRequest(input, mockManagerContext);

      expect(result.status).toBe('pending_confirmation');
    });

    it('accepts approverNotes up to 500 characters', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS
        .mockResolvedValueOnce({ rows: [mockRequest], rowCount: 1, command: '', oid: 0, fields: [] })
        .mockResolvedValueOnce({ rows: [mockManagerRecord], rowCount: 1, command: '', oid: 0, fields: [] });

      const input: ApproveTimeOffRequestInput = {
        requestId: mockRequest.id,
        approved: true,
        approverNotes: 'Approved - enjoy your vacation!',
      };
      const result = await approveTimeOffRequest(input, mockManagerContext);

      expect(result.status).toBe('pending_confirmation');
    });

    it('rejects approverNotes exceeding 500 characters', async () => {
      const input: ApproveTimeOffRequestInput = {
        requestId: mockRequest.id,
        approved: true,
        approverNotes: 'x'.repeat(501),
      };
      const result = await approveTimeOffRequest(input, mockManagerContext);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.code).toBe('INVALID_INPUT');
      }
    });
  });

  describe('Request lookup', () => {
    it('returns error when request not found', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
        command: '',
        oid: 0,
        fields: [],
      });

      const input: ApproveTimeOffRequestInput = {
        requestId: '999e4567-e89b-12d3-a456-426614174001',
        approved: true,
      };
      const result = await approveTimeOffRequest(input, mockManagerContext);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.code).toBe('REQUEST_NOT_FOUND');
      }
    });

    it('returns error when request already processed', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS.mockResolvedValueOnce({
        rows: [{ ...mockRequest, status: 'approved' }],
        rowCount: 1,
        command: '',
        oid: 0,
        fields: [],
      });

      const input: ApproveTimeOffRequestInput = {
        requestId: mockRequest.id,
        approved: true,
      };
      const result = await approveTimeOffRequest(input, mockManagerContext);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.code).toBe('REQUEST_ALREADY_PROCESSED');
        expect(result.message).toContain('approved');
      }
    });

    it('returns error for rejected request', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS.mockResolvedValueOnce({
        rows: [{ ...mockRequest, status: 'rejected' }],
        rowCount: 1,
        command: '',
        oid: 0,
        fields: [],
      });

      const input: ApproveTimeOffRequestInput = {
        requestId: mockRequest.id,
        approved: false,
      };
      const result = await approveTimeOffRequest(input, mockManagerContext);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.code).toBe('REQUEST_ALREADY_PROCESSED');
      }
    });
  });

  describe('Manager/HR verification', () => {
    it('returns error when manager record not found', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS
        .mockResolvedValueOnce({ rows: [mockRequest], rowCount: 1, command: '', oid: 0, fields: [] })
        .mockResolvedValueOnce({ rows: [], rowCount: 0, command: '', oid: 0, fields: [] });

      const input: ApproveTimeOffRequestInput = {
        requestId: mockRequest.id,
        approved: true,
      };
      const result = await approveTimeOffRequest(input, mockManagerContext);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.code).toBe('MANAGER_NOT_FOUND');
      }
    });

    it('returns error when request is not from direct report', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      // Request is from employee whose manager_id is different
      const requestWithDifferentManager = {
        ...mockRequest,
        manager_id: 'other-manager-123',
      };

      mockQueryWithRLS
        .mockResolvedValueOnce({ rows: [requestWithDifferentManager], rowCount: 1, command: '', oid: 0, fields: [] })
        .mockResolvedValueOnce({ rows: [mockManagerRecord], rowCount: 1, command: '', oid: 0, fields: [] });

      const input: ApproveTimeOffRequestInput = {
        requestId: mockRequest.id,
        approved: true,
      };
      const result = await approveTimeOffRequest(input, mockManagerContext);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.code).toBe('NOT_YOUR_REPORT');
        expect(result.message).toContain('direct reports');
      }
    });

    it('allows HR to approve requests from any employee', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      // Request is from employee with different manager
      const requestWithDifferentManager = {
        ...mockRequest,
        manager_id: 'other-manager-123',
      };

      mockQueryWithRLS
        .mockResolvedValueOnce({ rows: [requestWithDifferentManager], rowCount: 1, command: '', oid: 0, fields: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'hr-emp-123' }], rowCount: 1, command: '', oid: 0, fields: [] });

      const input: ApproveTimeOffRequestInput = {
        requestId: mockRequest.id,
        approved: true,
      };
      const result = await approveTimeOffRequest(input, mockHrWriteContext);

      // HR can approve any request
      expect(result.status).toBe('pending_confirmation');
    });
  });

  describe('Pending confirmation flow', () => {
    it('returns pending_confirmation for approval', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS
        .mockResolvedValueOnce({ rows: [mockRequest], rowCount: 1, command: '', oid: 0, fields: [] })
        .mockResolvedValueOnce({ rows: [mockManagerRecord], rowCount: 1, command: '', oid: 0, fields: [] });

      const input: ApproveTimeOffRequestInput = {
        requestId: mockRequest.id,
        approved: true,
      };
      const result = await approveTimeOffRequest(input, mockManagerContext);

      expect(result.status).toBe('pending_confirmation');
      if (result.status === 'pending_confirmation') {
        expect(result.confirmationId).toBeDefined();
        expect(typeof result.confirmationId).toBe('string');
        expect(result.message).toContain('APPROVE');
      }
    });

    it('returns pending_confirmation for rejection', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS
        .mockResolvedValueOnce({ rows: [mockRequest], rowCount: 1, command: '', oid: 0, fields: [] })
        .mockResolvedValueOnce({ rows: [mockManagerRecord], rowCount: 1, command: '', oid: 0, fields: [] });

      const input: ApproveTimeOffRequestInput = {
        requestId: mockRequest.id,
        approved: false,
      };
      const result = await approveTimeOffRequest(input, mockManagerContext);

      expect(result.status).toBe('pending_confirmation');
      if (result.status === 'pending_confirmation') {
        expect(result.message).toContain('REJECT');
      }
    });

    it('stores confirmation data in Redis', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS
        .mockResolvedValueOnce({ rows: [mockRequest], rowCount: 1, command: '', oid: 0, fields: [] })
        .mockResolvedValueOnce({ rows: [mockManagerRecord], rowCount: 1, command: '', oid: 0, fields: [] });

      const input: ApproveTimeOffRequestInput = {
        requestId: mockRequest.id,
        approved: true,
        approverNotes: 'Enjoy your time off!',
      };
      await approveTimeOffRequest(input, mockManagerContext);

      expect(redisUtils.storePendingConfirmation).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          action: 'approve_time_off_request',
          mcpServer: 'hr',
          requestId: mockRequest.id,
          approved: true,
          approverNotes: 'Enjoy your time off!',
        })
      );
    });
  });

  describe('Confirmation message content', () => {
    it('includes employee name in message', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS
        .mockResolvedValueOnce({ rows: [mockRequest], rowCount: 1, command: '', oid: 0, fields: [] })
        .mockResolvedValueOnce({ rows: [mockManagerRecord], rowCount: 1, command: '', oid: 0, fields: [] });

      const input: ApproveTimeOffRequestInput = {
        requestId: mockRequest.id,
        approved: true,
      };
      const result = await approveTimeOffRequest(input, mockManagerContext);

      if (result.status === 'pending_confirmation') {
        expect(result.message).toContain('John Doe');
      }
    });

    it('includes type name in message', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS
        .mockResolvedValueOnce({ rows: [mockRequest], rowCount: 1, command: '', oid: 0, fields: [] })
        .mockResolvedValueOnce({ rows: [mockManagerRecord], rowCount: 1, command: '', oid: 0, fields: [] });

      const input: ApproveTimeOffRequestInput = {
        requestId: mockRequest.id,
        approved: true,
      };
      const result = await approveTimeOffRequest(input, mockManagerContext);

      if (result.status === 'pending_confirmation') {
        expect(result.message).toContain('Vacation');
      }
    });

    it('includes dates in message', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS
        .mockResolvedValueOnce({ rows: [mockRequest], rowCount: 1, command: '', oid: 0, fields: [] })
        .mockResolvedValueOnce({ rows: [mockManagerRecord], rowCount: 1, command: '', oid: 0, fields: [] });

      const input: ApproveTimeOffRequestInput = {
        requestId: mockRequest.id,
        approved: true,
      };
      const result = await approveTimeOffRequest(input, mockManagerContext);

      if (result.status === 'pending_confirmation') {
        expect(result.message).toContain('2026-03-01');
        expect(result.message).toContain('2026-03-05');
      }
    });

    it('includes total days in message', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS
        .mockResolvedValueOnce({ rows: [mockRequest], rowCount: 1, command: '', oid: 0, fields: [] })
        .mockResolvedValueOnce({ rows: [mockManagerRecord], rowCount: 1, command: '', oid: 0, fields: [] });

      const input: ApproveTimeOffRequestInput = {
        requestId: mockRequest.id,
        approved: true,
      };
      const result = await approveTimeOffRequest(input, mockManagerContext);

      if (result.status === 'pending_confirmation') {
        expect(result.message).toContain('5');
      }
    });
  });

  describe('Error handling', () => {
    it('handles database errors gracefully', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS.mockRejectedValue(new Error('Connection failed'));

      const input: ApproveTimeOffRequestInput = {
        requestId: mockRequest.id,
        approved: true,
      };
      const result = await approveTimeOffRequest(input, mockManagerContext);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.code).toBe('DATABASE_ERROR');
      }
    });
  });
});

describe('executeApproveTimeOffRequest', () => {
  const mockManagerContext: UserContext = {
    userId: 'manager-123',
    username: 'jane.manager',
    email: 'jane.manager@test.com',
    roles: ['manager'],
  };

  const mockApproverRecord = {
    id: 'approver-emp-123',
  };

  const mockExecutionData = {
    requestId: '123e4567-e89b-12d3-a456-426614174001',
    employeeId: '223e4567-e89b-12d3-a456-426614174000',
    approved: true,
    approverNotes: 'Enjoy your time off!',
    totalDays: 5,
    typeCode: 'VACATION',
    startDate: '2026-03-01',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Approval execution', () => {
    it('looks up approver employee ID', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS
        .mockResolvedValueOnce({ rows: [mockApproverRecord], rowCount: 1, command: '', oid: 0, fields: [] })
        .mockResolvedValueOnce({ rows: [], rowCount: 1, command: '', oid: 0, fields: [] })
        .mockResolvedValueOnce({ rows: [], rowCount: 1, command: '', oid: 0, fields: [] });

      await executeApproveTimeOffRequest(mockExecutionData, mockManagerContext);

      expect(mockQueryWithRLS).toHaveBeenNthCalledWith(
        1,
        mockManagerContext,
        expect.stringContaining('work_email = $1'),
        ['jane.manager@test.com']
      );
    });

    it('returns error when approver not found', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
        command: '',
        oid: 0,
        fields: [],
      });

      const result = await executeApproveTimeOffRequest(mockExecutionData, mockManagerContext);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.code).toBe('APPROVER_NOT_FOUND');
      }
    });

    it('updates request status to approved', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS
        .mockResolvedValueOnce({ rows: [mockApproverRecord], rowCount: 1, command: '', oid: 0, fields: [] })
        .mockResolvedValueOnce({ rows: [], rowCount: 1, command: '', oid: 0, fields: [] })
        .mockResolvedValueOnce({ rows: [], rowCount: 1, command: '', oid: 0, fields: [] });

      await executeApproveTimeOffRequest(mockExecutionData, mockManagerContext);

      expect(mockQueryWithRLS).toHaveBeenNthCalledWith(
        2,
        mockManagerContext,
        expect.stringContaining('UPDATE hr.time_off_requests'),
        expect.arrayContaining(['approved', mockApproverRecord.id, mockExecutionData.approverNotes, mockExecutionData.requestId])
      );
    });

    it('moves days from pending to used on approval', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS
        .mockResolvedValueOnce({ rows: [mockApproverRecord], rowCount: 1, command: '', oid: 0, fields: [] })
        .mockResolvedValueOnce({ rows: [], rowCount: 1, command: '', oid: 0, fields: [] })
        .mockResolvedValueOnce({ rows: [], rowCount: 1, command: '', oid: 0, fields: [] });

      await executeApproveTimeOffRequest(mockExecutionData, mockManagerContext);

      expect(mockQueryWithRLS).toHaveBeenNthCalledWith(
        3,
        mockManagerContext,
        expect.stringContaining('pending = pending - $1, used = used + $1'),
        expect.arrayContaining([mockExecutionData.totalDays, mockExecutionData.employeeId, mockExecutionData.typeCode, 2026])
      );
    });

    it('returns success with approved status', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS
        .mockResolvedValueOnce({ rows: [mockApproverRecord], rowCount: 1, command: '', oid: 0, fields: [] })
        .mockResolvedValueOnce({ rows: [], rowCount: 1, command: '', oid: 0, fields: [] })
        .mockResolvedValueOnce({ rows: [], rowCount: 1, command: '', oid: 0, fields: [] });

      const result = await executeApproveTimeOffRequest(mockExecutionData, mockManagerContext);

      expect(result.status).toBe('success');
      if (result.status === 'success') {
        const data = result.data as { requestId: string; status: string; message: string };
        expect(data.status).toBe('approved');
        expect(data.message).toContain('approved successfully');
      }
    });
  });

  describe('Rejection execution', () => {
    const rejectionData = {
      ...mockExecutionData,
      approved: false,
      approverNotes: 'Sorry, we need coverage during this period.',
    };

    it('updates request status to rejected', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS
        .mockResolvedValueOnce({ rows: [mockApproverRecord], rowCount: 1, command: '', oid: 0, fields: [] })
        .mockResolvedValueOnce({ rows: [], rowCount: 1, command: '', oid: 0, fields: [] })
        .mockResolvedValueOnce({ rows: [], rowCount: 1, command: '', oid: 0, fields: [] });

      await executeApproveTimeOffRequest(rejectionData, mockManagerContext);

      expect(mockQueryWithRLS).toHaveBeenNthCalledWith(
        2,
        mockManagerContext,
        expect.stringContaining('UPDATE hr.time_off_requests'),
        expect.arrayContaining(['rejected', mockApproverRecord.id, rejectionData.approverNotes, rejectionData.requestId])
      );
    });

    it('removes days from pending only on rejection', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS
        .mockResolvedValueOnce({ rows: [mockApproverRecord], rowCount: 1, command: '', oid: 0, fields: [] })
        .mockResolvedValueOnce({ rows: [], rowCount: 1, command: '', oid: 0, fields: [] })
        .mockResolvedValueOnce({ rows: [], rowCount: 1, command: '', oid: 0, fields: [] });

      await executeApproveTimeOffRequest(rejectionData, mockManagerContext);

      // Should only update pending, not used
      expect(mockQueryWithRLS).toHaveBeenNthCalledWith(
        3,
        mockManagerContext,
        expect.stringMatching(/pending = pending - \$1(?!.*used = used)/),
        expect.arrayContaining([rejectionData.totalDays, rejectionData.employeeId, rejectionData.typeCode, 2026])
      );
    });

    it('returns success with rejected status', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS
        .mockResolvedValueOnce({ rows: [mockApproverRecord], rowCount: 1, command: '', oid: 0, fields: [] })
        .mockResolvedValueOnce({ rows: [], rowCount: 1, command: '', oid: 0, fields: [] })
        .mockResolvedValueOnce({ rows: [], rowCount: 1, command: '', oid: 0, fields: [] });

      const result = await executeApproveTimeOffRequest(rejectionData, mockManagerContext);

      expect(result.status).toBe('success');
      if (result.status === 'success') {
        const data = result.data as { requestId: string; status: string; message: string };
        expect(data.status).toBe('rejected');
        expect(data.message).toContain('rejected successfully');
      }
    });
  });

  describe('Error handling', () => {
    it('handles database errors gracefully', async () => {
      const mockQueryWithRLS = jest.spyOn(dbConnection, 'queryWithRLS');

      mockQueryWithRLS.mockRejectedValue(new Error('Connection failed'));

      const result = await executeApproveTimeOffRequest(mockExecutionData, mockManagerContext);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.code).toBe('DATABASE_ERROR');
      }
    });
  });
});
