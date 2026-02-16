/**
 * OIDC Callback Page - Support App
 *
 * Thin wrapper around shared CallbackPage (simple mode).
 */
import { CallbackPage } from '@tamshai/ui';

export default function SupportCallbackPage() {
  return (
    <CallbackPage
      replaceNavigation
      loadingMessage="Completing authentication..."
    />
  );
}
