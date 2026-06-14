import { Worker } from "bullmq";
import { redisConnection } from "../config/redis.js";
import { logger } from "../utils/logger.js";
import { ChatHistory } from "../models/ChatHistory.js";
import {
  sendInstagramAction,
  sendInstagramMessage,
} from "../services/instagram.js";
import prisma from "../config/prisma.js";
import { generateOllamaResponse } from "../ai/provider/ollama.js";
import { generateNvidiaFallback } from "../ai/provider/nvidia.js";

logger.success("🚀 Chat Worker file loaded and listening for jobs!");

export const chatWorker = new Worker(
  "instagram-chat-queue",
  async (job) => {
    const { igAccountId } = job.data;
    const redisBufferKey = `chat_buffer:${igAccountId}`;

    logger.info(`[Checkpoint 1] Worker started for user: ${igAccountId}`);

    await sendInstagramAction(igAccountId);

      logger.info(`[Checkpoint 2] Typing action sent to IG`);

    try {
      const bufferedMessages = await redisConnection.lrange(
        redisBufferKey,
        0,
        -1,
      );
      await redisConnection.del(redisBufferKey);

      if (!bufferedMessages || bufferedMessages.length === 0) {
        logger.warn(`[Checkpoint 3] ⚠️ Redis buffer was empty! Exiting silently.`);
        return;
      }

      const combinedMessageText = bufferedMessages.join("\n");
      logger.info(`[Checkpoint 3] Buffer fetched successfully. Message: "${combinedMessageText}"`);

      logger.info(`[Checkpoint 4] Fetching MongoDB Chat History...`);

      let chat = await ChatHistory.findOne({ igAccountId });
      if (!chat) {
        chat = new ChatHistory({
          igAccountId,
          messages: [
            {
              role: "assistant",
              content: "hii",
            },
          ],
        });
      }

      chat.messages.push({
        role: "user",
        content: combinedMessageText,
        timestamp: new Date(),
      });

      if (chat.messages.length > 15) {
        chat.messages = chat.messages.slice(-15) as any;
      }

      const recentMessages = chat.messages;

      const historyWithoutCurrent = recentMessages.slice(0, -1);
      const formattedHistory = historyWithoutCurrent
        .map((msg) => `${msg.role.toUpperCase()}: ${msg.content}`)
        .join("\n");

      let aiResponseText: string;
      try {
        aiResponseText = await generateOllamaResponse(
          formattedHistory,
          combinedMessageText,
        );
      } catch (ollamaError) {
        logger.warn(
          `Ollama failed for ${igAccountId}, falling back to NVIDIA...`,
        );
        const fullHistoryString = recentMessages
          .map((msg) => `${msg.role.toUpperCase()}: ${msg.content}`)
          .join("\n");

        aiResponseText = await generateNvidiaFallback(fullHistoryString);
      }

      chat.messages.push({
        role: "assistant",
        content: aiResponseText,
        timestamp: new Date(),
      });
      await chat.save();

      await prisma.user.update({
        where: { igAccountId },
        data: {
          credits: { decrement: 1 },
          lastInteractedAt: new Date(),
        },
      });

      await sendInstagramMessage(igAccountId, aiResponseText);
      logger.info(`Response sent to ${igAccountId}. 1 credit deducted.`);
    } catch (error) {
      logger.error(`Worker entirely failed for job ${job.id}:`, error);
      throw error;
    }
  },
  {
    connection: redisConnection as any,
    concurrency: 1,
    limiter: {
      max: 3,        
      duration: 60000
    }
  },
);

chatWorker.on("completed", (job) => logger.info(`Job ${job.id} finished`));
chatWorker.on('failed', (job, err) => {
  if (job) {
    logger.error(`🚨 Job ${job.id} completely failed!`);
    logger.error(`User ID: ${job.data.igAccountId}`);
    logger.error(`Failure Reason: ${err.message}`);
    
    // Optional: Print the full stack trace to see exactly which line of code broke
    console.error(err.stack); 
  }
});
chatWorker.on("error", (err) => {
  logger.error(`CRITICAL WORKER ERROR: ${err.message}`);
});
