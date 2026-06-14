import { Worker } from "bullmq";
import { redisConnection } from "../config/redis.js";
import { ChatHistory } from "../models/ChatHistory.js";
import {
  sendInstagramAction,
  sendInstagramMessage,
} from "../services/instagram.js";
import prisma from "../config/prisma.js";
import { generateOllamaResponse } from "../ai/provider/ollama.js";
import { generateNvidiaFallback } from "../ai/provider/nvidia.js";

export const chatWorker = new Worker(
  "instagram-chat-queue",
  async (job) => {
    const { igAccountId } = job.data;
    const redisBufferKey = `chat_buffer:${igAccountId}`;

    await sendInstagramAction(igAccountId);

    try {
      const bufferedMessages = await redisConnection.lrange(
        redisBufferKey,
        0,
        -1,
      );

      const messageCount = bufferedMessages.length;

      if (!bufferedMessages || bufferedMessages.length === 0) {
        return;
      }

      await redisConnection.ltrim(redisBufferKey, messageCount, -1);

      const combinedMessageText = bufferedMessages.join("\n");

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
    } catch (error) {
      throw error;
    }
  },
  {
    connection: redisConnection as any,
    concurrency: 1,
    // limiter: {
    //   max: 3,
    //   duration: 60000
    // }
  },
);
