import express from "express";

import dotenv from "dotenv";
dotenv.config();

import cors from "cors";
import { connectMongoDB } from "./config/mongodb.js";
import prisma from "./config/prisma.js";
import instagramWebhookRouter from "./routes/meta.webhook.js";
import cashfreeWebhookRouter from "./routes/cashfree.webhook.js";
import paymentRouter from "./routes/payment.routes.js";
import bookingSlotRouter from "./routes/available.slot.js";
import './workers/chatWorker.js'
import { chatQueue } from "./queues/chatQueue.js";
import { logger } from "./utils/logger.js";
import { redisConnection } from "./config/redis.js";

const app = express();
const PORT = process.env.PORT || 8000;

app.use(
  cors({
    origin: ["https://book-with-siya.vercel.app"],
    credentials: true,
  }),
);
app.use(
  express.json({
    verify: (req: any, res, buf) => {
      req.rawBody = buf;
    },
  }),
);

const startServer = async () => {
  await connectMongoDB();

  await prisma.$connect();
  console.log("[database]: NeonDB (Prisma) is online");

  app.get("/health", (req, res) => {
    res.json({ status: "ok", message: "Server is running smoothly" });
  });

  app.use("/api", instagramWebhookRouter);
  app.use("/api", bookingSlotRouter);
  app.use("/api/payments", cashfreeWebhookRouter);
  app.use("/api/payments", paymentRouter);


  app.get("/api/clear-queue", async (req, res) => {
  try {
    // This tells BullMQ to completely wipe everything in Redis for this queue
    await chatQueue.obliterate({ force: true });
    res.send("<h1>Queue successfully wiped! Stuck jobs deleted.</h1>");
  } catch (error: any) {
    res.send(`<h1>Error wiping queue: ${error.message}</h1>`);
  }
  });


  app.listen(PORT, () => {
    console.log(`[server]: Server is running at http://localhost:${PORT}`);
  });
};

startServer();
