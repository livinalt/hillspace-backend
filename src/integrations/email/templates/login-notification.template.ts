import { renderMail } from './mailgen.factory';

export type LoginNotificationParams = {
  /** ISO 8601 instant when login succeeded (server time). */
  loggedInAtIso: string;
  ip?: string;
  userAgent?: string;
};

/** Sent after every successful login (security / awareness). */
export function buildLoginNotificationEmail(
  name: string,
  params: LoginNotificationParams,
) {
  const when = new Date(params.loggedInAtIso);
  const displayUtc = when.toLocaleString(undefined, {
    dateStyle: 'full',
    timeStyle: 'medium',
    timeZone: 'UTC',
  });
  const intro: string[] = [
    'You successfully signed in to your HillSpace account.',
    `Sign-in time (UTC): ${displayUtc}`,
    `Server timestamp: ${params.loggedInAtIso}`,
  ];
  if (params.ip) {
    intro.push(`Network (best-effort IP): ${params.ip}`);
  }
  if (params.userAgent) {
    intro.push(`Device / browser: ${params.userAgent.slice(0, 240)}`);
  }
  intro.push(
    'If this was not you, change your password immediately and contact support.',
  );

  const email = {
    body: {
      name,
      intro,
      outro: 'This is an automated security notification.',
    },
  };

  return {
    subject: 'HillSpace - New sign-in to your account',
    ...renderMail(email),
  };
}
