import { renderMail } from './mailgen.factory';
import { getPublicFrontendBaseUrl } from './email-urls';

/**
 * Forgot password - link includes user id + opaque `reset` (stored as `resetUrlToken` on the user).
 * Legacy `?token=` still works via API if old emails are in the wild.
 */
export function buildPasswordResetEmail(
  name: string,
  userId: string,
  resetUrlToken: string,
) {
  const baseUrl = getPublicFrontendBaseUrl();
  const q = new URLSearchParams({
    uid: userId,
    reset: resetUrlToken,
  });
  const resetLink = `${baseUrl}/reset-password?${q.toString()}`;

  const email = {
    body: {
      name,
      intro: [
        'We received a request to reset the password for your HillSpace account.',
        'This link is valid for 1 hour and is unique to your account.',
      ],
      action: {
        instructions: 'Click the button below to choose a new password.',
        button: {
          color: '#2563eb',
          text: 'Reset password',
          link: resetLink,
        },
      },
      outro: `If the button does not work, copy and paste this link into your browser:\n${resetLink}`,
    },
  };

  return {
    subject: 'HillSpace - Reset your password',
    ...renderMail(email),
  };
}
