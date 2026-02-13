/**
 * TruncationWarning Tests
 *
 * Tests for the truncation warning component that displays
 * when AI query results are truncated due to 50-record limit.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { TruncationWarning } from '../TruncationWarning';

describe('TruncationWarning', () => {
  const defaultProps = {
    message: 'Only showing 50 of 100+ employees. Please refine your search.',
    returnedCount: 50,
    totalEstimate: '100+',
  };

  describe('rendering', () => {
    it('renders the warning container', () => {
      render(<TruncationWarning {...defaultProps} />);

      const container = document.querySelector('.truncation-warning');
      expect(container).toBeInTheDocument();
    });

    it('displays "Results Truncated" header', () => {
      render(<TruncationWarning {...defaultProps} />);

      expect(screen.getByText('Results Truncated')).toBeInTheDocument();
    });

    it('displays the warning message', () => {
      render(<TruncationWarning {...defaultProps} />);

      expect(
        screen.getByText(
          'Only showing 50 of 100+ employees. Please refine your search.'
        )
      ).toBeInTheDocument();
    });

    it('displays the returned count', () => {
      render(<TruncationWarning {...defaultProps} />);

      expect(screen.getByText('Shown:')).toBeInTheDocument();
      expect(screen.getByText('50 records')).toBeInTheDocument();
    });

    it('displays the total estimate when provided', () => {
      render(<TruncationWarning {...defaultProps} />);

      expect(screen.getByText('Total:')).toBeInTheDocument();
      expect(screen.getByText('100+ records')).toBeInTheDocument();
    });

    it('renders warning icon SVG', () => {
      render(<TruncationWarning {...defaultProps} />);

      const svg = document.querySelector('svg');
      expect(svg).toBeInTheDocument();
      expect(svg).toHaveClass('text-warning-600');
    });

    it('displays action suggestion text', () => {
      render(<TruncationWarning {...defaultProps} />);

      expect(
        screen.getByText(/Try narrowing your search with filters/i)
      ).toBeInTheDocument();
    });
  });

  describe('optional props', () => {
    it('does not display total when totalEstimate is not provided', () => {
      render(
        <TruncationWarning
          message="Results are truncated"
          returnedCount={50}
        />
      );

      expect(screen.queryByText('Total:')).not.toBeInTheDocument();
    });

    it('handles different returned counts', () => {
      render(
        <TruncationWarning
          message="Limited results"
          returnedCount={25}
          totalEstimate="50+"
        />
      );

      expect(screen.getByText('25 records')).toBeInTheDocument();
      expect(screen.getByText('50+ records')).toBeInTheDocument();
    });
  });

  describe('different message formats', () => {
    it('handles short messages', () => {
      render(
        <TruncationWarning
          message="Truncated"
          returnedCount={10}
        />
      );

      expect(screen.getByText('Truncated')).toBeInTheDocument();
    });

    it('handles long messages', () => {
      const longMessage =
        'This is a very long warning message that describes exactly what happened with the truncation and provides detailed information about why the results were limited and what the user can do about it.';

      render(
        <TruncationWarning
          message={longMessage}
          returnedCount={50}
          totalEstimate="500+"
        />
      );

      expect(screen.getByText(longMessage)).toBeInTheDocument();
    });

    it('handles zero returned count', () => {
      render(
        <TruncationWarning
          message="No results"
          returnedCount={0}
        />
      );

      expect(screen.getByText('0 records')).toBeInTheDocument();
    });
  });

  describe('styling', () => {
    it('has proper warning styling classes on container', () => {
      render(<TruncationWarning {...defaultProps} />);

      const container = document.querySelector('.truncation-warning');
      expect(container).toBeInTheDocument();
    });

    it('header has warning text color', () => {
      render(<TruncationWarning {...defaultProps} />);

      const header = screen.getByText('Results Truncated');
      expect(header).toHaveClass('text-warning-900');
    });

    it('message has warning text color', () => {
      render(<TruncationWarning {...defaultProps} />);

      const message = screen.getByText(defaultProps.message);
      expect(message).toHaveClass('text-warning-800');
    });
  });
});
