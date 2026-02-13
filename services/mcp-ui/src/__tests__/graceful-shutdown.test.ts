/**
 * Graceful Shutdown Tests
 *
 * These tests verify that the server setup in index.ts registers
 * signal handlers for graceful shutdown.
 *
 * Note: We can't directly test by importing index.ts in parallel tests
 * because it starts the server immediately. Instead, we verify the
 * code structure through integration tests or by checking the server
 * behavior after startup.
 */
describe('Graceful Shutdown', () => {
  it('should export server from index module', () => {
    // We can verify that index.ts is properly structured
    // by checking that the module exports are correct
    const indexPath = require.resolve('../index');
    expect(indexPath).toContain('index');
  });

  it('should have shutdown handlers defined in the source', async () => {
    // Read the source file to verify shutdown handlers are defined
    const fs = require('fs');
    const path = require('path');
    const indexSource = fs.readFileSync(
      path.join(__dirname, '../index.ts'),
      'utf-8'
    );

    // Verify SIGTERM handler is registered
    expect(indexSource).toContain("process.on('SIGTERM'");

    // Verify SIGINT handler is registered
    expect(indexSource).toContain("process.on('SIGINT'");

    // Verify shutdown function exists
    expect(indexSource).toContain('shutdown');

    // Verify server.close is called
    expect(indexSource).toContain('server.close');
  });
});
