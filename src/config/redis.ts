import { Redis } from 'ioredis';

// IMPORTANT: maxRetriesPerRequest must be null for BullMQ workers
export const redisConnection = new Redis(process.env.RENDER_REDIS_URL!, {
  maxRetriesPerRequest: null,
});

console.log('[queue]: Redis connection initialized');