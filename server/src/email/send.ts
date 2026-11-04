import type { FastifyBaseLogger } from 'fastify';
import type { Config } from '../config.ts';

// Transactional email through Resend (core/email.py). Without RESEND_API_KEY
// the message goes to the log instead and counts as sent; DEV_EMAIL_LOG adds
// its text, so the local stack can sign in by email.

export const RESEND_API_URL = 'https://api.resend.com/emails';

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export type SendEmail = (message: EmailMessage) => Promise<boolean>;

export function resendSender(
  config: Pick<Config, 'resendApiKey' | 'emailFrom' | 'devEmailLog'>,
  log: FastifyBaseLogger,
  fetcher: typeof fetch = fetch,
): SendEmail {
  return async ({ to, subject, html, text }) => {
    const recipient = to.trim();
    if (!recipient) {
      log.warn('Attempted to send email to empty recipient');
      return false;
    }
    const sender = config.emailFrom || 'Buyerly <team@buyerly.app>';

    if (config.resendApiKey) {
      try {
        const payload: Record<string, unknown> = { from: sender, to: [recipient], subject, html };
        if (text) payload.text = text;
        // .env files sometimes keep the quotes around a pasted key.
        const key = config.resendApiKey.replace(/^["' \t\r\n]+|["' \t\r\n]+$/g, '');
        const response = await fetcher(RESEND_API_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
            'User-Agent': 'buyerly/1.0',
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(10_000),
        });
        const answer = await response.text();
        if (response.status === 200 || response.status === 201) {
          log.info({ recipient, answer }, 'Email sent via Resend');
          return true;
        }
        log.error({ recipient, status: response.status, answer }, 'Resend refused the email');
        return false;
      } catch (error) {
        log.error({ recipient, err: error }, 'Sending email via Resend failed');
        return false;
      }
    }

    log.info(`[DEV EMAIL] To: ${recipient} | Subject: ${subject} | (No RESEND_API_KEY configured)`);
    if (config.devEmailLog && text) log.info(`[DEV EMAIL] ${text}`);
    return true;
  };
}
