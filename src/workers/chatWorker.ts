import { Worker } from 'bullmq';
import { redisConnection } from '../config/redis.js';
import { logger } from '../utils/logger.js';
import { ChatHistory } from '../models/ChatHistory.js';
import { sendInstagramMessage } from '../services/instagram.js';
import prisma from '../config/prisma.js';
import { generateOllamaResponse } from '../ai/provider/ollama.js';
import { generateNvidiaFallback } from '../ai/provider/nvidia.js';

export const chatWorker = new Worker(
  'instagram-chat-queue',
  async (job) => {
    const { igAccountId, messageText } = job.data;
    logger.info(`Processing message for: ${igAccountId}`);

    try {
      let chat = await ChatHistory.findOne({ igAccountId });
      if (!chat) {
        chat = new ChatHistory({
          igAccountId,
          messages: [
            {
              role: 'system',
              content: "hii"
            }
          ]
        });
      }

      chat.messages.push({
        role: 'user', content: messageText,
        timestamp: new Date()
      });

      const recentMessages = chat.messages.slice(-15);

      const historyWithoutCurrent = recentMessages.slice(0, -1);
      const formattedHistory = historyWithoutCurrent
        .map((msg) => `${msg.role.toUpperCase()}: ${msg.content}`)
        .join("\n");
     
      let aiResponseText: string;
      try {
        aiResponseText = await generateOllamaResponse(formattedHistory, messageText);
      } catch (ollamaError) {
        logger.warn(`Ollama failed for ${igAccountId}, falling back to NVIDIA...`);
        const fullHistoryString = recentMessages
          .map((msg) => `${msg.role.toUpperCase()}: ${msg.content}`)
          .join("\n");

        aiResponseText = await generateNvidiaFallback(fullHistoryString);
      }

      // --- POST-INFERENCE DATABASE UPDATES ---
      // We only do this once, regardless of which AI provided the response
      chat.messages.push({
        role: 'assistant', content: aiResponseText,
        timestamp: new Date()
      });
      await chat.save();

      await prisma.user.update({
        where: { igAccountId },
        data: { 
          credits: { decrement: 1 },
          lastInteractedAt: new Date() 
        }
      });

      // --- SEND MESSAGE ---
      await sendInstagramMessage(igAccountId, aiResponseText);
      logger.success(`Response sent to ${igAccountId}. 1 credit deducted.`);
      
    } catch (error) {
      // This catch block now only triggers if the DB fails, Instagram fails, or BOTH AIs fail.
      logger.error(`Worker entirely failed for job ${job.id}:`, error);
      throw error; // Let BullMQ handle the retry
    }
  },
  { 
    connection: redisConnection as any,
    concurrency: 3 
  }
);

chatWorker.on('completed', (job) => logger.info(`Job ${job.id} finished`));
chatWorker.on('failed', (job, err) => logger.error(`Job ${job?.id} failed:`, err));