export { getMailgen, renderMail } from './mailgen.factory';
export {
  buildVerificationEmail,
  type VerificationVariant,
} from './verification.template';
export { buildPasswordResetEmail } from './password-reset.template';
export { buildPasswordResetOtpEmail } from './password-reset-otp.template';
export { buildPasswordChangedEmail } from './password-changed.template';
export {
  buildLoginNotificationEmail,
  type LoginNotificationParams,
} from './login-notification.template';
