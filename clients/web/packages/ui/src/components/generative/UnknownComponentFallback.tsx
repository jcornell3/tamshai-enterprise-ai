/**
 * UnknownComponentFallback - Fallback for Unknown Component Types
 *
 * Displays a user-friendly message when an unknown component type is received.
 * Used by ComponentRenderer when it encounters a type not in the component map.
 */

import type { UnknownComponentFallbackProps } from './types';

/**
 * UnknownComponentFallback - Unknown Component Type Display
 *
 * Renders an alert indicating the component type is not recognized.
 * Includes the component type name for debugging purposes.
 */
export function UnknownComponentFallback({ componentType }: UnknownComponentFallbackProps): JSX.Element {
  return (
    <div data-testid="unknown-component-fallback" role="alert">
      Unknown component type: {componentType}
    </div>
  );
}

export default UnknownComponentFallback;
