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

const app = express();
const PORT = process.env.PORT || 8000;

app.use(cors());
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

  app.listen(PORT, () => {
    console.log(`[server]: Server is running at http://localhost:${PORT}`);
  });
};

startServer();
