/**
 * MCP UI Service Entry Point
 *
 * Starts the Express server and registers signal handlers for graceful shutdown.
 */
import { app } from './app';
import { logger } from './utils/logger';

const PORT = parseInt(process.env.PORT || '3108', 10);

const server = app.listen(PORT, () => {
  logger.info(`MCP UI server started on port ${PORT}`);
});

// Graceful shutdown handler
const shutdown = (signal: string) => {
  logger.info(`Received ${signal}, shutting down gracefully...`);
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });

  // Force exit after 10 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

// Register signal handlers
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export { app, server };
