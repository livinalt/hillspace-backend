import { renderMail } from './mailgen.factory';

/** Forgot password - 4-digit OTP (Figma reset flow). */
export function buildPasswordResetOtpEmail(name: string, otp: string) {
  const email = {
    body: {
      name,
      intro: [
        'We received a request to reset the password for your HillSpace account.',
        `Your verification code is: ${otp}`,
        'This code expires in 15 minutes.',
      ],
      outro:
        'If you did not request a password reset, you can safely ignore this email.',
    },
  };

  return {
    subject: 'HillSpace - Password reset code',
    ...renderMail(email),
  };
}
