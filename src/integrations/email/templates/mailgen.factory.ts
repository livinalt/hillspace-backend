import Mailgen = require('mailgen');
import { getPublicFrontendBaseUrl } from './email-urls';

/** Public HillSpace logo used when EMAIL_LOGO_URL is not set (e.g. on Render). */
const DEFAULT_EMAIL_LOGO_URL =
  'https://res.cloudinary.com/ar0uptfy/image/upload/f_png,w_240,c_fit,q_auto/hillspace/email-logo.png';

function resolveLogoUrl(): string {
  const raw = process.env.EMAIL_LOGO_URL?.trim() || DEFAULT_EMAIL_LOGO_URL;
  // Force https for email clients
  return raw.replace(/^http:\/\//i, 'https://');
}

/**
 * Returns a fresh Mailgen instance each time so FRONTEND_URL and EMAIL_LOGO_URL
 * are always read from the current process env (set at boot by NestJS ConfigModule).
 */
export function getMailgen(): Mailgen {
  const logoUrl = resolveLogoUrl();
  return new Mailgen({
    theme: 'default',
    product: {
      name: 'HillSpace',
      link: getPublicFrontendBaseUrl(),
      logo: logoUrl,
      // Keep email header compact — large logos get clipped in Gmail
      logoHeight: '48px',
      copyright: 'HillSpace - Real Estate Marketplace',
    },
  });
}

/** Generate HTML/text and harden the logo <img> for Gmail/Outlook. */
export function renderMail(email: Mailgen.Content): {
  html: string;
  text: string;
} {
  const mailgen = getMailgen();
  const logoUrl = resolveLogoUrl();
  let html = mailgen.generate(email) as string;

  const logoImg =
    `<img src="${logoUrl}" alt="HillSpace" width="120" height="48" ` +
    `style="display:block;width:120px;max-width:120px;height:48px;border:0;outline:none;text-decoration:none;" />`;

  // Mailgen emits a broken/empty alt attribute; replace the product logo img.
  html = html.replace(/<img\b[^>]*src="[^"]*email-logo[^"]*"[^>]*>/i, logoImg);
  html = html.replace(
    /<img\b[^>]*src="[^"]*ar0uptfy[^"]*"[^>]*>/i,
    logoImg,
  );
  // Fallback: first logo-sized img from Mailgen product header
  if (!html.includes(`src="${logoUrl}"`)) {
    html = html.replace(
      /<img\b[^>]*style="[^"]*height:\s*48px[^"]*"[^>]*>/i,
      logoImg,
    );
  }

  return {
    html,
    text: mailgen.generatePlaintext(email) as string,
  };
}
