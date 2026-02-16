/**
 * OIDC Callback Page - Sales App
 *
 * Thin wrapper around shared CallbackPage (simple mode).
 */
import { CallbackPage } from '@tamshai/ui';

export default function SalesCallbackPage() {
  return (
    <CallbackPage
      replaceNavigation
      loadingMessage="Completing authentication..."
    />
  );
}
