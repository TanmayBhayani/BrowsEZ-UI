// Callback page logic moved here to comply with MV3 CSP
import { TypedMessenger } from '@shared/utils/messaging';

function notifyExtension(success: boolean, error?: string | null) {
  // Use TypedMessenger for structured messaging to background
  try {
    TypedMessenger.send('AUTH_COMPLETE', { success, error: error ?? undefined }, 'settings', 'background');
  } catch {}
}

document.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const hasCode = urlParams.has('code');
  const hasError = urlParams.has('error');

  const icon = document.querySelector('.success-icon') as HTMLElement | null;
  const title = document.querySelector('h1') as HTMLElement | null;
  const messageP = document.querySelector('p') as HTMLElement | null;

  if (!icon || !title || !messageP) return;

  if (hasError) {
    icon.textContent = '❌';
    title.textContent = 'Authentication Failed';
    const errText = urlParams.get('error_description') || urlParams.get('error') || 'Unknown error';
    messageP.innerHTML = `There was an error during authentication:<br/><span style="color: #d73a49; font-weight: 600;">${errText}</span><br/>Please try logging in again.`;
    notifyExtension(false, errText);
  } else if (hasCode) {
    icon.textContent = '✅';
    title.textContent = 'Authentication Successful!';
    messageP.innerHTML = `You have successfully logged in to BrowsEZ.<br/>You can now use the extension in your browser tabs.<br/>You can close this tab now.`;
    notifyExtension(true);
  } else {
    icon.textContent = '⚠️';
    title.textContent = 'Unexpected Response';
    messageP.innerHTML = `The authentication response was unexpected.<br/>Please try logging in again.<br/>You can close this tab now.`;
  }

  window.addEventListener('beforeunload', () => {
    notifyExtension(hasCode && !hasError, hasError ? (urlParams.get('error_description') || urlParams.get('error')) : null);
  });
});



