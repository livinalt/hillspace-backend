import { renderMail } from './mailgen.factory';

/** Sent after successful password reset (security notice). */
export function buildPasswordChangedEmail(name: string) {
  const email = {
    body: {
      name,
      intro: [
        'Your HillSpace password was changed successfully.',
        'If you made this change, no further action is needed.',
        'If you did not change your password, contact support immediately and secure your account.',
      ],
      outro: 'Stay safe - never share your password with anyone.',
    },
  };

  return {
    subject: 'HillSpace - Your password was changed',
    ...renderMail(email),
  };
}
