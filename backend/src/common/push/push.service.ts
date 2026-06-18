import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { App, cert, getApp, getApps, initializeApp, ServiceAccount } from 'firebase-admin/app';
import { getMessaging, MulticastMessage } from 'firebase-admin/messaging';

/**
 * Firebase Cloud Messaging sender. Disabled (no-op) unless
 * FIREBASE_SERVICE_ACCOUNT is set — so the API runs fine before push is
 * configured. The env var holds the service-account JSON, raw or base64.
 */
@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);
  private app?: App;

  onModuleInit() {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
    if (!raw) {
      this.logger.warn('FIREBASE_SERVICE_ACCOUNT not set — SOS push disabled.');
      return;
    }
    try {
      const json = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
      const sa = JSON.parse(json) as ServiceAccount;
      this.app = getApps().length ? getApp() : initializeApp({ credential: cert(sa) });
      this.logger.log('Firebase push initialized.');
    } catch (e) {
      this.logger.error(`Failed to init Firebase push: ${(e as Error).message}`);
    }
  }

  get enabled(): boolean {
    return !!this.app;
  }

  /**
   * High-priority, data-only SOS message (the app builds the full-screen alarm
   * notification from the data so it rings even when closed/locked). Returns
   * tokens that are no longer valid, so the caller can prune them.
   */
  async sendSos(
    tokens: string[],
    payload: { title: string; body: string; sosEventId: string },
  ): Promise<string[]> {
    if (!this.app || tokens.length === 0) return [];
    // Include a notification block (not just data) so Android's system tray
    // shows + rings it on the high-importance 'sos_alarm' channel even when the
    // app is killed; the data is kept for the foreground handler + tap routing.
    const message: MulticastMessage = {
      tokens,
      notification: { title: payload.title, body: payload.body },
      data: {
        type: 'SOS',
        title: payload.title,
        body: payload.body,
        sosEventId: payload.sosEventId,
      },
      android: {
        priority: 'high',
        notification: {
          channelId: 'sos_siren',
          sound: 'sos_siren',
          priority: 'max',
          defaultVibrateTimings: true,
          visibility: 'public',
        },
      },
    };
    const stale: string[] = [];
    try {
      const res = await getMessaging(this.app).sendEachForMulticast(message);
      res.responses.forEach((r, i) => {
        const code = r.error?.code ?? '';
        if (
          !r.success &&
          (code.includes('registration-token-not-registered') || code.includes('invalid-argument'))
        ) {
          stale.push(tokens[i]);
        }
      });
    } catch (e) {
      this.logger.error(`SOS push failed: ${(e as Error).message}`);
    }
    return stale;
  }
}
