/**
 * CheckCircleIcon - @tamshai/ui
 *
 * Shared SVG check circle icon component with size variants.
 * Consolidates duplicate SVG icon definitions across apps.
 *
 * Issue 2.3: SVG Icons
 */

import React from 'react';

/**
 * Size variants for the icon
 */
export type IconSize = 'sm' | 'md' | 'lg' | 'xl';

/**
 * Size variant to Tailwind class mapping
 */
const sizeClasses: Record<IconSize, string> = {
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-6 h-6',
  xl: 'w-8 h-8',
};

/**
 * Props for CheckCircleIcon component
 */
export interface CheckCircleIconProps extends React.SVGProps<SVGSVGElement> {
  /**
   * Predefined size variant
   */
  size?: IconSize;
}

/**
 * Check circle icon component
 *
 * A decorative check circle SVG icon that can be used across
 * all Tamshai web applications.
 *
 * @example
 * // Basic usage
 * <CheckCircleIcon />
 *
 * @example
 * // With size variant
 * <CheckCircleIcon size="lg" />
 *
 * @example
 * // With custom styling
 * <CheckCircleIcon className="text-green-500" />
 *
 * @example
 * // As accessible icon
 * <CheckCircleIcon aria-label="Success" />
 */
export const CheckCircleIcon: React.FC<CheckCircleIconProps> = ({
  size,
  className = '',
  'aria-label': ariaLabel,
  ...props
}) => {
  // Build class list
  const sizeClass = size ? sizeClasses[size] : '';
  const classes = [sizeClass, className].filter(Boolean).join(' ');

  // Accessibility attributes
  const accessibilityProps = ariaLabel
    ? {
        'aria-label': ariaLabel,
        role: 'img' as const,
        focusable: 'false' as const,
      }
    : {
        'aria-hidden': 'true' as const,
        focusable: 'false' as const,
      };

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      className={classes || undefined}
      {...accessibilityProps}
      {...props}
    >
      <path
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
};

export default CheckCircleIcon;
