import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

/**
 * Gmail SMTP mailer. Configure with:
 *   GMAIL_USER          — the Gmail address to send from
 *   GMAIL_APP_PASSWORD  — an app password (Google Account → Security → App passwords)
 * When unconfigured, sends become no-ops (logged once at startup).
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: nodemailer.Transporter | null;

  constructor() {
    const user = process.env.GMAIL_USER;
    const pass = process.env.GMAIL_APP_PASSWORD;
    if (user && pass) {
      this.transporter = nodemailer.createTransport({ service: 'gmail', auth: { user, pass } });
    } else {
      this.transporter = null;
      this.logger.warn('GMAIL_USER / GMAIL_APP_PASSWORD not set — email notifications disabled');
    }
  }

  get enabled(): boolean {
    return this.transporter !== null;
  }

  /** Fire-and-forget; failures are logged, never thrown. */
  async send(to: string[], subject: string, text: string): Promise<boolean> {
    if (!this.transporter || to.length === 0) return false;
    try {
      await this.transporter.sendMail({
        from: process.env.GMAIL_USER,
        bcc: to.join(','),
        subject,
        text,
      });
      return true;
    } catch (e) {
      this.logger.error(`sendMail failed: ${(e as Error).message}`);
      return false;
    }
  }
}
