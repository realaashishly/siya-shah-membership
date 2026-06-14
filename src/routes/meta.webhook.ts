import express from "express";
const router = express.Router();

import "dotenv/config";

import {
  getInstagramUserProfile,
  sendInstagramMessage,
} from "../services/instagram.js";
import { sleep } from "../utils/index.js";
import { chatQueue } from "../queues/chatQueue.js";

import prisma from "../config/prisma.js";
import { redisConnection } from "../config/redis.js";

router.get("/meta/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token) {
    if (mode === "subscribe" && token === process.env.META_VERIFY_TOKEN) {
      return res.status(200).type("text/plain").send(challenge);
    } else {
      return res.sendStatus(403);
    }
  }

  return res.sendStatus(400);
});

router.post("/meta/webhook", async (req, res) => {
  const body = req.body;

  res.status(200).send("EVENT_RECEIVED");

  if (body.object === "instagram") {
    try {
      for (const entry of body.entry) {
        if (entry.messaging) {
          for (const messagingEvent of entry.messaging) {
            if (messagingEvent.message && messagingEvent.message.text) {
              if (
                messagingEvent.message.is_echo ||
                messagingEvent.sender.id === "17841466457907514"
              ) {
                continue;
              }

              const igAccountId = messagingEvent.sender.id;
              const messageContent = messagingEvent.message.text;
              const checkoutUrl = process.env.NEXT_PUBLIC_API_URL;

              let user = await prisma.user.findUnique({
                where: { igAccountId },
              });

              if (!user) {
                const profileInfo = await getInstagramUserProfile(igAccountId);

                if (igAccountId == "1673888927163653") {
                  await sendInstagramMessage(igAccountId, "hii");
                  await sleep(800);

                  await sendInstagramMessage(
                    igAccountId,
                    "mujhse baat karni hai? 9rs ke pass kharido aur din bhar baat karo 👇👇",
                  );
                  await sleep(800);

                  await sendInstagramMessage(
                    igAccountId,
                    `${checkoutUrl}/?igId=${igAccountId}`,
                  );
                }

                user = await prisma.user.create({
                  data: {
                    igAccountId: igAccountId,
                    username: profileInfo.username,
                    name: profileInfo.name,
                    igProfileUrl: profileInfo.profile_picture_url,
                    hasReceivedPitchRequest: true,
                  },
                });

                continue;
              }

              if (user && user.totalPassesPurchased > 0) {
                const isExpired =
                  user.passValidity && user.passValidity < new Date();

                const isOutOfCredits = user.credits <= 0;

                if (isOutOfCredits || isExpired) {
                  // Send renewal pitch only once
                  if (!user.hasReceivedRenewalPassRequest) {
                    await sendInstagramMessage(
                      igAccountId,
                      "Time pura huya!! Tmse baat kar ke acha laga..",
                    );

                    await sleep(800);

                    await sendInstagramMessage(
                      igAccountId,
                      "Dubara baat karne ho toh link niche hai pass kharidlo",
                    );

                    await sleep(800);

                    await sendInstagramMessage(
                      igAccountId,
                      `${checkoutUrl}/?igId=${igAccountId}`,
                    );

                    await prisma.user.update({
                      where: { igAccountId },
                      data: {
                        hasReceivedRenewalPassRequest: true,
                      },
                    });
                  }

                  continue;
                }

                if (user.purchasedPassName === "Premium") {
                  continue;
                }
              }

              if (user && user.totalPassesPurchased <= 0) {
                // await sendInstagramMessage(
                //   igAccountId,
                //   "Pass kharidlo",
                // );

                // await sleep(800);

                // await sendInstagramMessage(
                //   igAccountId,
                //   `${checkoutUrl}/?igId=${igAccountId}`,
                // );

                continue;
              }

              const redisBufferKey = `chat_buffer:${igAccountId}`;
              await redisConnection.rpush(redisBufferKey, messageContent);
              await redisConnection.expire(redisBufferKey, 600);

              const baseJobId = `debounce-${igAccountId}`;
              let jobIdToUse = baseJobId;

              const existingJob = await chatQueue.getJob(baseJobId);

              if (existingJob) {
                const state = await existingJob.getState();

                if (state === "failed" || state === "completed") {
                  await existingJob.remove();
                } else if (state === "active") {
                  jobIdToUse = `debounce-${igAccountId}-${Date.now()}`;
                }
              }

              if (user.purchasedPassName === "Basic") {
                await chatQueue.add(
                  `instagram-chat-queue`,
                  {
                    igAccountId,
                  },
                  {
                    jobId: jobIdToUse,
                    delay: 3500,
                    removeOnComplete: true,
                  },
                );
              }
            }
          }
        }
      }
    } catch (error) {
      return res.status(500).send("Internal server error");
    }
  }
});

export default router;
