import express from "express";
const router = express.Router();

import 'dotenv/config';


import { logger } from "../utils/logger.js";
import {
  getInstagramUserProfile,
  sendInstagramMessage,
} from "../services/instagram.js";
import { sleep } from "../utils/index.js";
import { chatQueue } from "../queues/chatQueue.js";


import prisma from "../config/prisma.js";

router.get("/meta/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token) {
    if (mode === "subscribe" && token === process.env.META_VERIFY_TOKEN) {
      logger.success("Meta Webhook verified successfully!");
      return res.status(200).type("text/plain").send(challenge);
    } else {
      logger.error("Meta Webhook verification failed: Token mismatch.");
      return res.sendStatus(403);
    }
  }

  return res.sendStatus(400);
});

router.post("/meta/webhook", async (req, res) => {
  const body = req.body;

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


              logger.info(
                `Received DM from IG User ${igAccountId}: "${messageContent}"`,
              );

              let user = await prisma.user.findUnique({
                where: { igAccountId },
              });

              if (!user) {
                logger.warn("User not found creating user");
                
                const profileInfo = await getInstagramUserProfile(igAccountId);

                logger.info("profile info: ", profileInfo)

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

                user = await prisma.user.create({
                  data: {
                    igAccountId: igAccountId,
                    username: profileInfo.username,
                    name: profileInfo.name,
                    igProfileUrl: profileInfo.profile_picture_url,
                    hasReceivedPitchRequest: true,
                  },
                });

                return res.status(200).send("EVENT_RECEIVED");
              }

              if (user && user.totalPassesPurchased > 0) {
                const isExpired =
                  user.passValidity && user.passValidity < new Date();
                const isOutOfCredits = user.credits === 0;

                if (
                  !user.hasReceivedRenewalPassRequest &&
                  (isOutOfCredits || isExpired)
                ) {
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

                  return res.status(200).send("EVENT_RECEIVED");
                }
              }

              await chatQueue.add(`msg-${igAccountId}-${Date.now()}`, {
                igAccountId,
                messageContent,
              });
            }
          }
        }
      }
      return res.status(200).send("EVENT_RECEIVED");
    } catch (error) {
      logger.error("Error processing webhook payload:", error);
      return res.sendStatus(500);
    }
  }

  return res.sendStatus(404);
});


export default router;
