/**
 * Display Routes - GREEN Phase Implementation
 *
 * Implements the display endpoints for the Generative UI service.
 *
 * Endpoints:
 * - POST /api/display - Process a display directive and return component
 * - GET /api/display/components - List all registered components
 */
import { Router, Request, Response, NextFunction } from 'express';
import { parseDirective } from '../parser/directive-parser';
import { getComponentDefinition, listComponents } from '../registry/component-registry';
import { callMCPTool } from '../mcp/mcp-client';
import { logger } from '../utils/logger';

const router = Router();

interface AuthenticatedRequest extends Request {
  userContext?: {
    userId: string;
    roles: string[];
    username?: string;
    email?: string;
  };
  userToken?: string; // Original JWT token from the user
}

interface DisplayRequest {
  directive: string;
  userContext?: {
    userId: string;
    roles: string[];
    username?: string;
    email?: string;
  };
}

/**
 * JWT validation middleware
 * Extracts user context from JWT Authorization header
 */
function validateJWT(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      status: 'error',
      code: 'UNAUTHORIZED',
      message: 'Missing or invalid Authorization header',
      suggestedAction: 'Include valid JWT token in Authorization: Bearer <token> header',
    });
  }

  try {
    const token = authHeader.substring(7);
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid JWT format');
    }

    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());

    // Extract roles from resource_access (client roles) or realm_access (realm roles)
    // Service accounts typically have realm roles, regular users have client roles
    const clientRoles = payload.resource_access?.['mcp-gateway']?.roles || [];
    const realmRoles = payload.realm_access?.roles || [];
    const roles = clientRoles.length > 0 ? clientRoles : realmRoles;

    req.userContext = {
      userId: payload.sub || 'unknown',
      username: payload.preferred_username || payload.name || 'unknown',
      email: payload.email || undefined,
      roles,
    };

    // Store the original user token for forwarding to MCP Gateway
    req.userToken = token;

    next();
  } catch (error) {
    logger.error('JWT validation error', { error: error instanceof Error ? error.message : 'Unknown' });
    return res.status(401).json({
      status: 'error',
      code: 'INVALID_TOKEN',
      message: 'Failed to validate JWT token',
      suggestedAction: 'Provide a valid JWT token from Keycloak',
    });
  }
}

/**
 * POST /api/display
 * Parse directive, fetch data from MCP servers, return component + narration
 */
router.post('/', validateJWT, async (req: AuthenticatedRequest, res: Response) => {
  const { directive } = req.body as DisplayRequest;
  const userContext = req.userContext!; // Set by validateJWT middleware
  const userToken = req.userToken; // Original user JWT from browser

  // Validate required fields
  if (!directive) {
    return res.status(400).json({
      status: 'error',
      code: 'MISSING_FIELD',
      message: 'Missing required field: directive',
      suggestedAction: 'Include directive in the request body',
    });
  }

  // Parse directive
  const parsed = parseDirective(directive);
  if (!parsed) {
    return res.status(400).json({
      status: 'error',
      code: 'INVALID_DIRECTIVE',
      message: `Invalid display directive format: ${directive}`,
      suggestedAction:
        'Use format: display:<domain>:<component>:<params>. Example: display:hr:org_chart:userId=me,depth=1',
    });
  }

  // Look up component definition
  const componentDef = getComponentDefinition(parsed.domain, parsed.component);
  if (!componentDef) {
    return res.status(404).json({
      status: 'error',
      code: 'UNKNOWN_COMPONENT',
      message: `Unknown component: ${parsed.domain}:${parsed.component}`,
      suggestedAction: 'Use GET /api/display/components to see available components',
    });
  }

  try {
    // Call MCP servers for data, passing user's original token
    const mcpResults = await Promise.all(
      componentDef.mcpCalls.map((call) =>
        callMCPTool(call, parsed.params, userContext, {
          userToken, // Forward the user's JWT instead of using service account token
        })
      )
    );

    // Merge all MCP response data
    let mergedData: unknown;
    if (componentDef.mcpCalls.length === 1 && mcpResults[0].status === 'success') {
      // Single MCP call - use data directly (could be array or object)
      mergedData = mcpResults[0].data;
    } else {
      // Multiple MCP calls - merge into object
      const merged: Record<string, unknown> = {};
      for (let i = 0; i < mcpResults.length; i++) {
        const result = mcpResults[i];
        const call = componentDef.mcpCalls[i];

        logger.info(`[MCP CALL ${i}] ${call.server}/${call.tool}`, {
          status: result.status,
          dataField: call.dataField,
          hasData: result.status === 'success' ? !!result.data : false,
          dataType: result.status === 'success' && result.data ? (Array.isArray(result.data) ? 'array' : typeof result.data) : 'N/A',
          dataLength: result.status === 'success' && result.data && Array.isArray(result.data) ? result.data.length : 'N/A',
        });

        if (result.status === 'success' && result.data) {
          // If dataField is specified, use it as the key (handles arrays properly)
          if (call.dataField) {
            merged[call.dataField] = result.data;
            logger.info(`[MERGE] Added ${call.dataField} to merged data`);
          } else {
            // Otherwise, use Object.assign for backward compatibility
            Object.assign(merged, result.data);
            logger.info(`[MERGE] Object.assign for ${call.server}/${call.tool}`);
          }
        } else {
          logger.warn(`[MERGE] Skipped ${call.server}/${call.tool}`, {
            status: result.status,
            errorCode: result.status === 'error' ? result.code : 'N/A',
          });
        }
      }
      mergedData = merged;
      logger.info('[MERGE COMPLETE] Final merged keys:', { keys: Object.keys(merged) });
    }

    // Transform data for component props
    logger.info('Transform input data', { mergedData: JSON.stringify(mergedData).substring(0, 500) });
    const props = componentDef.transform(mergedData);
    logger.info('Transform output props', { props: JSON.stringify(props).substring(0, 500) });

    // Generate narration
    logger.info('[NARRATION] About to generate narration');
    const narration = componentDef.generateNarration(mergedData, parsed.params);
    logger.info('[NARRATION] Generated successfully', { narration: JSON.stringify(narration).substring(0, 200) });

    // Check for truncation in any MCP response
    logger.info('[TRUNCATION] Checking for truncated responses');
    const truncated = mcpResults.some(
      (r) => r.status === 'success' && r.metadata?.truncated
    );
    logger.info('[TRUNCATION] Check complete', { truncated });

    logger.info('[RESPONSE] Sending JSON response');
    return res.json({
      status: 'success',
      component: {
        type: componentDef.type,
        props,
        actions: [], // Actions to be added later
      },
      narration,
      metadata: {
        dataFreshness: new Date().toISOString(),
        truncated,
      },
    });
  } catch (error) {
    logger.error('Error fetching MCP data', { error, directive });
    return res.status(500).json({
      status: 'error',
      code: 'MCP_ERROR',
      message: 'Failed to fetch data from MCP servers',
      suggestedAction: 'Check MCP server availability and try again',
    });
  }
});

/**
 * GET /api/display/components
 * List all available components with directive patterns
 */
router.get('/components', (req: Request, res: Response) => {
  const components = listComponents().map((def) => ({
    type: def.type,
    directivePattern: `display:${def.domain}:${def.component}:<params>`,
    description: def.description || '',
  }));

  return res.json({ components });
});

export { router as displayRouter };
