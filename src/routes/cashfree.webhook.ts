import "dotenv/config";
import express from "express";
import crypto from "crypto";
import prisma from "../config/prisma.js";
import { logger } from "../utils/logger.js";
import { sendInstagramMessage } from "../services/instagram.js";
import { sleep } from "../utils/index.js";

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

    logger.info("cashfree webhook payload", payload);

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
    const amount = Number(payload.data.payment.payment_amount);

    let purchasedPlan = "Basic";

    if (amount === 9) {
      purchasedPlan = "Basic";
    } else if (amount === 99) {
      purchasedPlan = "Premium";
    }

    if (!amount) {
      logger.error("Missing amount from webhook payload");
      return res
        .status(400)
        .json({ success: false, message: "Missing amount from webhook payload" });
    }

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

    const tier = await prisma.pricingTier.findFirst({
      where: { name: purchasedPlan },
    });

    if (!tier) {
      logger.error(
        `Critical Error: Purchased tier '${purchasedPlan}' does not exist in the database!`,
      );
      return res.status(400).json({ error: "Invalid pricing tier" });
    }

    const expirationDate = new Date(
      Date.now() + tier.durationHours * 60 * 60 * 1000,
    );

    const now = new Date();
    const date = new Date(now.toISOString().split("T")[0] + "T00:00:00.000Z");
    const startTime = now;
    const endTime = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    await prisma.$transaction([
      prisma.transaction.upsert({
        where: { orderId: orderId },
        update: {
          cfPaymentId: cfPaymentId,
          status: "SUCCESS",
          amount: amount,
          paymentMethod: paymentMethod,
          userId: existingUser.id,
          pricingTierId: tier.id,
        },
        create: {
          orderId: orderId,
          cfPaymentId: cfPaymentId,
          status: "SUCCESS",
          amount: amount,
          paymentMethod: paymentMethod,
          userId: existingUser.id,
          pricingTierId: tier.id,
        },
      }),

      prisma.user.update({
        where: { id: existingUser.id },
        data: {
          credits: { increment: tier.creditsAwarded },
          hasReceivedRenewalPassRequest: false,
          paymentCustomerId: orderId,
          passValidity: expirationDate,
          totalPassesPurchased: { increment: 1 },
          purchasedPassName: tier.name,
          bookedDate: date,
          bookedStartTime: startTime,
          bookedEndTime: endTime,
        },
      }),
    ]);

    await sleep(3000);

    try {
      const userInfo = await prisma.user.findUnique({
        where: { igAccountId: igAccountId },
        select: { id: true, credits: true, purchasedPassName: true},
      });

      if(userInfo?.purchasedPassName === 'Basic'){
        await sendInstagramMessage(igAccountId as string, "hii");
      }
      if(userInfo?.purchasedPassName === 'Premium'){
        // await sendInstagramMessage(igAccountId as string, "hiii");
        
      }
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
