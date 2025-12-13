/**
 * Confirmation Service
 *
 * Handles human-in-the-loop confirmations for write operations
 * Architecture v1.4 - Section 5.6
 */

export interface ConfirmationResult {
  success: boolean;
  message?: string;
  error?: string;
}

/**
 * Approve a pending confirmation
 *
 * @param confirmationId - UUID of pending confirmation
 * @param token - JWT access token
 * @returns Result of approval
 */
export async function approveConfirmation(
  confirmationId: string,
  token: string
): Promise<ConfirmationResult> {
  const gatewayUrl = process.env.MCP_GATEWAY_URL || 'http://localhost:3100';

  try {
    const response = await fetch(`${gatewayUrl}/api/confirm/${confirmationId}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ approved: true }),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || data.message || 'Failed to approve confirmation',
      };
    }

    if (data.status === 'success') {
      return {
        success: true,
        message: data.message || '✅ Action completed successfully',
      };
    } else {
      return {
        success: false,
        error: data.error || 'Unknown error occurred',
      };
    }
  } catch (error) {
    console.error('[Confirmation] Approve error:', error);
    return {
      success: false,
      error: `Network error: ${(error as Error).message}`,
    };
  }
}

/**
 * Reject a pending confirmation
 *
 * @param confirmationId - UUID of pending confirmation
 * @param token - JWT access token
 * @returns Result of rejection
 */
export async function rejectConfirmation(
  confirmationId: string,
  token: string
): Promise<ConfirmationResult> {
  const gatewayUrl = process.env.MCP_GATEWAY_URL || 'http://localhost:3100';

  try {
    const response = await fetch(`${gatewayUrl}/api/confirm/${confirmationId}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ approved: false }),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || data.message || 'Failed to reject confirmation',
      };
    }

    if (data.status === 'cancelled') {
      return {
        success: true,
        message: '❌ Action cancelled',
      };
    } else {
      return {
        success: false,
        error: data.error || 'Unknown error occurred',
      };
    }
  } catch (error) {
    console.error('[Confirmation] Reject error:', error);
    return {
      success: false,
      error: `Network error: ${(error as Error).message}`,
    };
  }
}
