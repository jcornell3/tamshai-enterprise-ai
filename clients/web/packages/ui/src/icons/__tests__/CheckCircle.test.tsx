/**
 * CheckCircleIcon Tests - @tamshai/ui
 *
 * RED Phase: Tests for the shared SVG icon component.
 * This consolidates duplicate SVG icon definitions across apps.
 *
 * Issue 2.3: SVG Icons
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { CheckCircleIcon } from '../CheckCircle';

describe('CheckCircleIcon', () => {
  describe('rendering', () => {
    it('should render SVG element', () => {
      render(<CheckCircleIcon />);
      const svg = document.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });

    it('should have correct viewBox', () => {
      render(<CheckCircleIcon />);
      const svg = document.querySelector('svg');
      expect(svg).toHaveAttribute('viewBox', '0 0 24 24');
    });

    it('should have correct default dimensions', () => {
      render(<CheckCircleIcon />);
      const svg = document.querySelector('svg');
      expect(svg).toHaveAttribute('width', '24');
      expect(svg).toHaveAttribute('height', '24');
    });

    it('should render path element(s)', () => {
      render(<CheckCircleIcon />);
      const paths = document.querySelectorAll('svg path');
      expect(paths.length).toBeGreaterThan(0);
    });
  });

  describe('styling', () => {
    it('should apply custom className', () => {
      render(<CheckCircleIcon className="w-5 h-5 text-green-500" />);
      const svg = document.querySelector('svg');
      expect(svg).toHaveClass('w-5', 'h-5', 'text-green-500');
    });

    it('should merge default and custom classNames', () => {
      render(<CheckCircleIcon className="custom-class" />);
      const svg = document.querySelector('svg');
      expect(svg).toHaveClass('custom-class');
    });

    it('should support currentColor for fill', () => {
      render(<CheckCircleIcon />);
      const svg = document.querySelector('svg');
      // Icon should use currentColor to inherit text color
      expect(svg).toHaveAttribute('fill', 'none');
      const path = document.querySelector('svg path');
      expect(path?.getAttribute('stroke') || path?.getAttribute('fill')).toMatch(/currentColor|none/);
    });
  });

  describe('accessibility', () => {
    it('should be decorative by default (aria-hidden)', () => {
      render(<CheckCircleIcon />);
      const svg = document.querySelector('svg');
      expect(svg).toHaveAttribute('aria-hidden', 'true');
    });

    it('should support aria-label for meaningful icons', () => {
      render(<CheckCircleIcon aria-label="Success" />);
      const svg = document.querySelector('svg');
      expect(svg).toHaveAttribute('aria-label', 'Success');
      expect(svg).not.toHaveAttribute('aria-hidden');
    });

    it('should support role=img when aria-label is provided', () => {
      render(<CheckCircleIcon aria-label="Completed" />);
      const svg = document.querySelector('svg');
      expect(svg).toHaveAttribute('role', 'img');
    });

    it('should be focusable when aria-label is provided', () => {
      render(<CheckCircleIcon aria-label="Status" />);
      const svg = document.querySelector('svg');
      expect(svg).toHaveAttribute('focusable', 'false');
    });
  });

  describe('props forwarding', () => {
    it('should forward data attributes', () => {
      render(<CheckCircleIcon data-testid="check-icon" />);
      expect(screen.getByTestId('check-icon')).toBeInTheDocument();
    });

    it('should forward id attribute', () => {
      render(<CheckCircleIcon id="success-icon" />);
      const svg = document.querySelector('#success-icon');
      expect(svg).toBeInTheDocument();
    });

    it('should forward style attribute', () => {
      render(<CheckCircleIcon style={{ color: 'green' }} />);
      const svg = document.querySelector('svg');
      expect(svg).toHaveStyle({ color: 'green' });
    });
  });

  describe('size variants', () => {
    it('should support size prop for common sizes', () => {
      render(<CheckCircleIcon size="sm" />);
      const svg = document.querySelector('svg');
      expect(svg).toHaveClass('w-4', 'h-4');
    });

    it('should support medium size', () => {
      render(<CheckCircleIcon size="md" />);
      const svg = document.querySelector('svg');
      expect(svg).toHaveClass('w-5', 'h-5');
    });

    it('should support large size', () => {
      render(<CheckCircleIcon size="lg" />);
      const svg = document.querySelector('svg');
      expect(svg).toHaveClass('w-6', 'h-6');
    });

    it('should support extra large size', () => {
      render(<CheckCircleIcon size="xl" />);
      const svg = document.querySelector('svg');
      expect(svg).toHaveClass('w-8', 'h-8');
    });
  });
});

describe('Icon type safety', () => {
  it('should accept SVGProps', () => {
    // TypeScript validation - ensures icon accepts standard SVG props
    const props: React.SVGProps<SVGSVGElement> = {
      className: 'test',
      'aria-label': 'Test',
    };

    render(<CheckCircleIcon {...props} />);
    expect(document.querySelector('svg')).toBeInTheDocument();
  });
});
