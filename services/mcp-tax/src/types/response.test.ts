/**
 * Response Type Tests
 *
 * Tests for response builders and cursor encoding/decoding.
 */
import {
  createSuccessResponse,
  createErrorResponse,
  createPendingConfirmationResponse,
  encodeCursor,
  decodeCursor,
  PaginationCursor,
  PaginationMetadata,
} from './response';

describe('createSuccessResponse', () => {
  it('creates success response with data only', () => {
    const data = { id: '123', name: 'Test' };
    const result = createSuccessResponse(data);

    expect(result.status).toBe('success');
    expect(result.data).toEqual(data);
    expect(result.metadata).toBeUndefined();
  });

  it('creates success response with metadata', () => {
    const data = [{ id: '1' }, { id: '2' }];
    const metadata: PaginationMetadata = {
      hasMore: true,
      nextCursor: 'abc123',
      returnedCount: 2,
      totalEstimate: '100+',
    };
    const result = createSuccessResponse(data, metadata);

    expect(result.status).toBe('success');
    expect(result.data).toEqual(data);
    expect(result.metadata).toEqual(metadata);
  });

  it('creates success response with empty array', () => {
    const result = createSuccessResponse([]);

    expect(result.status).toBe('success');
    expect(result.data).toEqual([]);
  });

  it('creates success response with null data', () => {
    const result = createSuccessResponse(null);

    expect(result.status).toBe('success');
    expect(result.data).toBeNull();
  });
});

describe('createErrorResponse', () => {
  it('creates error response with required fields', () => {
    const result = createErrorResponse(
      'TAX_RATE_NOT_FOUND',
      'Tax rate not found',
      'Use list_sales_tax_rates to find valid rates'
    );

    expect(result.status).toBe('error');
    expect(result.code).toBe('TAX_RATE_NOT_FOUND');
    expect(result.message).toBe('Tax rate not found');
    expect(result.suggestedAction).toBe('Use list_sales_tax_rates to find valid rates');
    expect(result.details).toBeUndefined();
  });

  it('creates error response with details', () => {
    const details = { field: 'stateCode', value: 'XX' };
    const result = createErrorResponse(
      'INVALID_STATE_CODE',
      'Invalid state code',
      'Use a valid 2-letter state code',
      details
    );

    expect(result.status).toBe('error');
    expect(result.code).toBe('INVALID_STATE_CODE');
    expect(result.details).toEqual(details);
  });

  it('creates error response without details when undefined', () => {
    const result = createErrorResponse(
      'DATABASE_ERROR',
      'Database error',
      'Try again later',
      undefined
    );

    expect(result.status).toBe('error');
    expect(result.details).toBeUndefined();
  });
});

describe('createPendingConfirmationResponse', () => {
  it('creates pending confirmation response', () => {
    const confirmationData = {
      action: 'update_tax_rate',
      mcpServer: 'mcp-tax',
      userId: 'user-123',
      timestamp: Date.now(),
      rateId: 'rate-001',
    };
    const result = createPendingConfirmationResponse(
      'conf-abc123',
      'Are you sure you want to update this tax rate?',
      confirmationData
    );

    expect(result.status).toBe('pending_confirmation');
    expect(result.confirmationId).toBe('conf-abc123');
    expect(result.message).toBe('Are you sure you want to update this tax rate?');
    expect(result.confirmationData).toEqual(confirmationData);
  });

  it('includes all confirmation data fields', () => {
    const confirmationData = {
      action: 'delete_filing',
      mcpServer: 'mcp-tax',
      userId: 'user-456',
      timestamp: 1234567890,
      filingId: 'filing-001',
      filingYear: 2025,
    };
    const result = createPendingConfirmationResponse(
      'conf-xyz789',
      'Confirm deletion?',
      confirmationData
    );

    expect(result.confirmationData.action).toBe('delete_filing');
    expect(result.confirmationData.mcpServer).toBe('mcp-tax');
    expect(result.confirmationData.userId).toBe('user-456');
    expect(result.confirmationData.filingId).toBe('filing-001');
    expect(result.confirmationData.filingYear).toBe(2025);
  });
});

describe('encodeCursor', () => {
  it('encodes cursor to base64', () => {
    const cursor: PaginationCursor = {
      sortKey: '2026-01-15',
      id: 'rate-001',
    };
    const encoded = encodeCursor(cursor);

    expect(typeof encoded).toBe('string');
    expect(encoded.length).toBeGreaterThan(0);
    // Verify it's valid base64 by decoding
    const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
    expect(JSON.parse(decoded)).toEqual(cursor);
  });

  it('encodes cursor with numeric sortKey', () => {
    const cursor: PaginationCursor = {
      sortKey: 12345,
      id: 'record-abc',
    };
    const encoded = encodeCursor(cursor);
    const decoded = JSON.parse(Buffer.from(encoded, 'base64').toString('utf-8'));

    expect(decoded.sortKey).toBe(12345);
    expect(decoded.id).toBe('record-abc');
  });

  it('produces consistent encoding', () => {
    const cursor: PaginationCursor = {
      sortKey: 'test-key',
      id: 'test-id',
    };
    const encoded1 = encodeCursor(cursor);
    const encoded2 = encodeCursor(cursor);

    expect(encoded1).toBe(encoded2);
  });
});

describe('decodeCursor', () => {
  it('decodes valid base64 cursor', () => {
    const original: PaginationCursor = {
      sortKey: '2026-02-01',
      id: 'filing-123',
    };
    const encoded = encodeCursor(original);
    const decoded = decodeCursor(encoded);

    expect(decoded).toEqual(original);
  });

  it('returns null for invalid base64', () => {
    const result = decodeCursor('not-valid-base64!!!');

    expect(result).toBeNull();
  });

  it('returns null for valid base64 but invalid JSON', () => {
    const invalidJson = Buffer.from('not json').toString('base64');
    const result = decodeCursor(invalidJson);

    expect(result).toBeNull();
  });

  it('returns null for empty string', () => {
    const result = decodeCursor('');

    expect(result).toBeNull();
  });

  it('decodes cursor with special characters in id', () => {
    const original: PaginationCursor = {
      sortKey: 'key-with-dash',
      id: 'id_with_underscore/slash',
    };
    const encoded = encodeCursor(original);
    const decoded = decodeCursor(encoded);

    expect(decoded).toEqual(original);
  });

  it('handles round-trip encoding/decoding', () => {
    const cursors: PaginationCursor[] = [
      { sortKey: 'a', id: '1' },
      { sortKey: 99999, id: 'large-id-string-with-many-characters' },
      { sortKey: '2026-12-31T23:59:59Z', id: 'uuid-like-12345678-abcd-efgh' },
    ];

    cursors.forEach((cursor) => {
      const encoded = encodeCursor(cursor);
      const decoded = decodeCursor(encoded);
      expect(decoded).toEqual(cursor);
    });
  });
});
