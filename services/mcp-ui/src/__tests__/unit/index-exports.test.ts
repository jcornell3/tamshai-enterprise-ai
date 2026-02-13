/**
 * Index Module Exports Tests
 *
 * Tests that verify all module index files correctly export their public API.
 * These tests ensure the barrel exports work correctly.
 */

describe('Module Exports', () => {
  describe('parser/index', () => {
    it('exports parseDirective function', () => {
      // Import from index to test the re-export
      const parserModule = require('../../parser');
      expect(parserModule.parseDirective).toBeDefined();
      expect(typeof parserModule.parseDirective).toBe('function');
    });

    it('parseDirective works when imported from index', () => {
      const { parseDirective } = require('../../parser');
      const result = parseDirective('display:hr:org_chart:userId=me');
      expect(result).toEqual({
        domain: 'hr',
        component: 'org_chart',
        params: { userId: 'me' },
      });
    });
  });

  describe('registry/index', () => {
    it('exports getComponentDefinition function', () => {
      const registryModule = require('../../registry');
      expect(registryModule.getComponentDefinition).toBeDefined();
      expect(typeof registryModule.getComponentDefinition).toBe('function');
    });

    it('exports listComponents function', () => {
      const registryModule = require('../../registry');
      expect(registryModule.listComponents).toBeDefined();
      expect(typeof registryModule.listComponents).toBe('function');
    });

    it('getComponentDefinition works when imported from index', () => {
      const { getComponentDefinition } = require('../../registry');
      const def = getComponentDefinition('hr', 'org_chart');
      expect(def).toBeDefined();
      expect(def.type).toBe('OrgChartComponent');
    });

    it('listComponents works when imported from index', () => {
      const { listComponents } = require('../../registry');
      const components = listComponents();
      expect(components.length).toBe(7);
    });
  });

  describe('mcp/index', () => {
    it('exports callMCPTool function', () => {
      const mcpModule = require('../../mcp');
      expect(mcpModule.callMCPTool).toBeDefined();
      expect(typeof mcpModule.callMCPTool).toBe('function');
    });
  });

  describe('routes/index', () => {
    it('exports displayRouter', () => {
      const routesModule = require('../../routes');
      expect(routesModule.displayRouter).toBeDefined();
    });
  });
});
