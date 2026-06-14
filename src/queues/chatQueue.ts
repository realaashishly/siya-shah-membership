import { Queue } from 'bullmq';
import { redisConnection } from '../config/redis.js';

export const chatQueue = new Queue('instagram-chat-queue', {
  connection: redisConnection as any,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
        type: 'exponential',
        delay: 2000
    },
    removeOnComplete: true,
    removeOnFail: {
        count: 0 // Deletes the job immediately if it fails after 3 attempts
    }
  }
});