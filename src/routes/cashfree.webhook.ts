import "dotenv/config";
import express from "express";
import crypto from "crypto";
import prisma from "../config/prisma.js";
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
      return res.status(400).send("Missing raw body");
    }

    const signatureString = timestamp + req.rawBody.toString();
    const expectedSignature = crypto
      .createHmac("sha256", CASHFREE_SECRET!)
      .update(signatureString)
      .digest("base64");

    if (expectedSignature !== signature) {
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
    const amount = Number(payload.data.payment.payment_amount);

    let purchasedPlan = "Basic";

    if (amount === 9) {
      purchasedPlan = "Basic";
    } else if (amount === 99) {
      purchasedPlan = "Premium";
    }

    if (!amount) {
      return res
        .status(200)
        .json({ success: true, message: "Ignored: Missing amount" });
    }

    const paymentMethod = payload?.data?.payment?.payment_group || "UNKNOWN";

    if (!igAccountId) {
      return res
        .status(200)
        .json({ success: true, message: "Ignored: Missing igAccountId" });
    }

    const existingUser = await prisma.user.findUnique({
      where: { igAccountId: igAccountId },
      select: { id: true },
    });

    if (!existingUser) {
      return res
        .status(200)
        .json({ success: true, message: "Ignored: User not found" });
    }

    const tier = await prisma.pricingTier.findFirst({
      where: { name: purchasedPlan },
    });

    if (!tier) {
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

    res
      .status(200)
      .json({ success: true, message: "Payment processed successfully" });

    await sleep(3000);

    try {
      const userInfo = await prisma.user.findUnique({
        where: { igAccountId: igAccountId },
        select: { id: true, credits: true, purchasedPassName: true },
      });

      if (userInfo?.purchasedPassName === "Basic") {
        await sendInstagramMessage(igAccountId as string, "hii");
      }
      if (userInfo?.purchasedPassName === "Premium") {
        // await sendInstagramMessage(igAccountId as string, "hiii");
      }
    } catch (error) {
      if (!res.headersSent) {
        res.status(500).send("Internal server error");
      }
    }
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).send("Internal server error");
    }
  }
});

export default router;
