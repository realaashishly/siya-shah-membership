import "dotenv/config";
import express from "express";
import crypto from "crypto";
import prisma from "../config/prisma.js";
import { logger } from "../utils/logger.js";
import { sendInstagramMessage } from "../services/instagram.js";

declare module "express-serve-static-core" {
  interface Request {
    rawBody?: string | Buffer;
  }
}

const CASHFREE_SECRET = process.env.CASHFREE_CLIENT_SECRET;

const router = express.Router();

router.post("/cashfree/webhook", async (req, res) => {
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

    if (payload?.data?.payment?.payment_status !== "SUCCESS") {
      return res
        .status(200)
        .json({ success: true, message: "Ignored non-success event" });
    }

    const igAccountId = payload?.data?.customer_details?.customer_id;
    const orderId = payload?.data?.order?.order_id;
    const cfPaymentId =
      payload?.data?.payment?.cf_payment_id ||
      payload?.data?.payment?.payment_id ||
      "UNKNOWN_ID";
    const amount = payload?.data?.payment?.payment_amount
      ? Number(payload.data.payment.payment_amount)
      : 9;
    const paymentMethod = payload?.data?.payment?.payment_group || "UNKNOWN";

    logger.info("User igAccount: ", igAccountId);

    if (!igAccountId) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Missing igAccountId from webhook payload",
        });
    }

    const existingUser = await prisma.user.findUnique({
      where: { igAccountId: igAccountId },
      select: { id: true },
    });

    if (!existingUser) {
      logger.error(
        `Webhook Error: User with igAccountId ${igAccountId} not found in DB.`,
      );
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    await prisma.$transaction([
      prisma.transaction.upsert({
        where: { orderId: orderId },
        update: {
          cfPaymentId: cfPaymentId,
          status: "SUCCESS",
          amount: amount,
          paymentMethod: paymentMethod,
          userId: existingUser.id,
        },
        create: {
          orderId: orderId,
          cfPaymentId: cfPaymentId,
          status: "SUCCESS",
          amount: amount,
          paymentMethod: paymentMethod,
          userId: existingUser.id,
        },
      }),

      prisma.user.update({
        where: { id: existingUser.id },
        data: {
          credits: { increment: 100 },
          hasReceivedRenewalPassRequest: false,
          paymentCustomerId: orderId,
          passValidity: new Date(Date.now() + 24 * 60 * 60 * 1000),
          totalPassesPurchased: { increment: 1 },
        },
      }),
    ]);

    try {
      await sendInstagramMessage(igAccountId as string, "hii");
      logger.info(`Successfully sent reply to ${igAccountId}`);
    } catch (error) {
      logger.error(
        "Payment succeeded, but failed to send Instagram DM:",
        error,
      );
    }

    return res
      .status(200)
      .json({ success: true, message: "Payment processed successfully" });
  } catch (error) {
    res.status(500).send("Internal server error");
  }
});

export default router;
