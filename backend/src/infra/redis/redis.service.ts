import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;

  constructor() {
    this.client = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
    });
  }

  /**
   * Acquire a short-lived distributed lock. Returns a release token if acquired,
   * or null if the lock is already held. Used to serialise session open/close.
   */
  async acquireLock(key: string, ttlMs = 5000): Promise<string | null> {
    const token = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ok = await this.client.set(key, token, 'PX', ttlMs, 'NX');
    return ok === 'OK' ? token : null;
  }

  async releaseLock(key: string, token: string): Promise<void> {
    // Release only if we still own the lock (atomic check-and-delete).
    const lua = `if redis.call('get', KEYS[1]) == ARGV[1] then
        return redis.call('del', KEYS[1]) else return 0 end`;
    await this.client.eval(lua, 1, key, token);
  }

  async onModuleDestroy() {
    await this.client.quit();
  }
}
