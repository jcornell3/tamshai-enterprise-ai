/**
 * UnknownComponentFallback Component Tests
 *
 * Tests for the fallback component displayed when an unknown component type is received.
 */
import { render, screen } from '@testing-library/react';
import { UnknownComponentFallback } from '../UnknownComponentFallback';

describe('UnknownComponentFallback', () => {
  describe('Basic Rendering', () => {
    it('renders the fallback container with correct test id', () => {
      render(<UnknownComponentFallback componentType="CustomWidget" />);

      expect(screen.getByTestId('unknown-component-fallback')).toBeInTheDocument();
    });

    it('displays the component type name', () => {
      render(<UnknownComponentFallback componentType="CustomWidget" />);

      expect(screen.getByText(/CustomWidget/)).toBeInTheDocument();
    });

    it('displays "Unknown component type:" prefix', () => {
      render(<UnknownComponentFallback componentType="SomeComponent" />);

      expect(screen.getByText(/Unknown component type:/)).toBeInTheDocument();
    });

    it('renders full message with component type', () => {
      render(<UnknownComponentFallback componentType="MyUnknownType" />);

      expect(screen.getByText('Unknown component type: MyUnknownType')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('has alert role for screen readers', () => {
      render(<UnknownComponentFallback componentType="TestType" />);

      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('alert contains the component type information', () => {
      render(<UnknownComponentFallback componentType="AccessibleType" />);

      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent('Unknown component type: AccessibleType');
    });
  });

  describe('Different Component Types', () => {
    it('handles empty string component type', () => {
      render(<UnknownComponentFallback componentType="" />);

      expect(screen.getByText('Unknown component type:')).toBeInTheDocument();
    });

    it('handles component type with special characters', () => {
      render(<UnknownComponentFallback componentType="My-Component_v2.0" />);

      expect(screen.getByText('Unknown component type: My-Component_v2.0')).toBeInTheDocument();
    });

    it('handles component type with spaces', () => {
      render(<UnknownComponentFallback componentType="Some Component Name" />);

      expect(screen.getByText('Unknown component type: Some Component Name')).toBeInTheDocument();
    });

    it('handles very long component type names', () => {
      const longName = 'VeryLongComponentNameThatMightCauseLayoutIssues'.repeat(3);
      render(<UnknownComponentFallback componentType={longName} />);

      expect(screen.getByText(`Unknown component type: ${longName}`)).toBeInTheDocument();
    });

    it('handles numeric-like component type', () => {
      render(<UnknownComponentFallback componentType="Component123" />);

      expect(screen.getByText('Unknown component type: Component123')).toBeInTheDocument();
    });
  });

  describe('Default Export', () => {
    it('works with default export', async () => {
      const { default: DefaultUnknownComponentFallback } = await import('../UnknownComponentFallback');

      render(<DefaultUnknownComponentFallback componentType="DefaultExportTest" />);

      expect(screen.getByText('Unknown component type: DefaultExportTest')).toBeInTheDocument();
    });
  });
});
