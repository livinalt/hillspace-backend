import Mailgen = require('mailgen');

/**
 * Returns a fresh Mailgen instance each time so FRONTEND_URL and EMAIL_LOGO_URL
 * are always read from the current process env (set at boot by NestJS ConfigModule).
 * Set EMAIL_LOGO_URL in your env to show your logo at the top of every email.
 */
export function getMailgen(): Mailgen {
  const logoUrl = process.env.EMAIL_LOGO_URL?.trim();
  return new Mailgen({
    theme: 'default',
    product: {
      name: 'HillSpace',
      link: process.env.FRONTEND_URL || 'http://localhost:3000',
      ...(logoUrl ? { logo: logoUrl, logoHeight: '140px' } : {}),
      copyright: 'HillSpace - Real Estate Marketplace',
    },
  });
}
