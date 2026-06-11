import 'dotenv/config';
import express from "express";
import crypto from "crypto";
import prisma from "../config/prisma.js";
import axios from "axios";
import { v4 as uuidv4 } from "uuid";
import { logger } from "../utils/logger.js";
import { sendInstagramAction } from "../services/instagram.js";

declare module "express-serve-static-core" {
  interface Request {
    rawBody?: string | Buffer;
  }
}

const CASHFREE_SECRET = process.env.CASHFREE_CLIENT_SECRET;

const router = express.Router();

router.post("/cashfree/webhook", async (req, res) => {
  res.status(200).send("OK");
  try {
    const timestamp = req.headers["x-webhook-timestamp"];
    const signature = req.headers["x-webhook-signature"];

    if (!req.rawBody) {
      logger.error("Raw body missing.");
      return res.status(400).send("Missing raw body");
    }

    const signatureString = timestamp + req.rawBody.toString();
    const expectedSignature = crypto
      .createHmac("sha256", CASHFREE_SECRET!)
      .update(signatureString)
      .digest("base64");

    if (expectedSignature !== signature) {
      logger.error("Webhook signature mismatch!");
      return res.status(401).send("Invalid signature");
    }

    const payload = req.body;

    logger.info("User payment log: ", payload)

    if (payload?.data?.payment?.payment_status === "SUCCESS") {
      const igAccountId = payload.data.customer_details.customer_id;
      const cfPaymentId =
        payload.data.payment?.cf_payment_id || payload.data.payment?.payment_id;

      const user = await prisma.user.update({
        where: { igAccountId },
        data: {
          credits: { increment: 60 },
          hasReceivedRenewalPassRequest: false,
          passValidity: new Date(Date.now() + 24 * 60 * 60 * 1000),
          totalPassesPurchased: { increment: 1 },
          transactions: {
            connect: { orderId: cfPaymentId },
          },
        },
      });

      await sendInstagramAction(
        igAccountId,
        "hii"
      )
    }

    res.status(200).send("EVENT_RECEIVED");
  } catch (error) {
    res.status(500).send("Internal server error");
  }
});

export default router;
