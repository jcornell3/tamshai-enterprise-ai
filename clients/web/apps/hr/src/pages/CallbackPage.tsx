/**
 * OIDC Callback Page - HR App
 *
 * Thin wrapper around shared CallbackPage with error dialog enabled.
 */
import { CallbackPage } from '@tamshai/ui';

export default function HRCallbackPage() {
  return (
    <CallbackPage
      showErrorDialog
      retryPath="/hr"
    />
  );
}
