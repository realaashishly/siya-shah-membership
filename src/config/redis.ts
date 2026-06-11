import { Redis } from 'ioredis';
import dotenv from 'dotenv';

dotenv.config()

// IMPORTANT: maxRetriesPerRequest must be null for BullMQ workers
export const redisConnection = new Redis(process.env.RENDER_REDIS_URL!, {
  maxRetriesPerRequest: null,
});

console.log('[queue]: Redis connection initialized');