import { handleAuthCallback } from '@netlify/identity';
// Default Identity emails land here. The SDK handles confirmation, recovery,
// email changes and OAuth; no token is written to a URL query or receipt.
try {
  const result = await handleAuthCallback();
  const workspace=result?.user?.roles?.includes('admin')?'/portal/admin/':'/portal/client/';
  if (result?.type === 'invite') location.replace('/portal/client/#invite_token=' + encodeURIComponent(result.token));
  else if (result?.type === 'recovery') location.replace(workspace+'?password-reset=1');
  else if (result) location.replace(workspace);
} catch {
  // Show callback errors on the dedicated portal page without exposing tokens.
  location.replace('/portal/client/?callback-error=1');
}
