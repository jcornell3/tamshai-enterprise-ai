/**
 * OIDC Callback Page - Portal App
 *
 * Thin wrapper around shared CallbackPage with error dialog enabled.
 */
import { CallbackPage } from '@tamshai/ui';

export default function PortalCallbackPage() {
  return (
    <CallbackPage
      showErrorDialog
      retryPath="/app"
    />
  );
}
