import express from "express";
import "dotenv/config";
import prisma from "../config/prisma.js";
import axios from "axios";
import { v4 as uuidv4 } from "uuid";
import { logger } from "../utils/logger.js";

declare module "express-serve-static-core" {
  interface Request {
    rawBody?: string | Buffer;
  }
}

const router = express.Router();

router.post("/create/order", async (req, res) => {
  const { igAccountId, planName } = req.body;

  logger.info(
    `Processing payment request: igAccountId=${igAccountId}, planName=${planName}`,
  );

  // 1. Validate Input
  if (!igAccountId || !planName) {
    logger.error("Missing required fields: igAccountId or planName");
    return res.status(400).json({
      success: false,
      error: "Missing required fields: igAccountId and planName are required.",
    });
  }

  // 2. Validate Pricing Tier
  const prices: Record<string, number> = {
    Basic: 9.0,
    Premium: 99.0,
  };

  const amount = prices[planName as keyof typeof prices];

  if (!amount) {
    logger.error(`Invalid plan name received: ${planName}`);
    return res.status(400).json({
      success: false,
      error: `Invalid plan name: ${planName}. Available plans are: ${Object.keys(prices).join(", ")}`,
    });
  }

  // 3. Initiate Payment with Cashfree
  try {
    const orderId = `order_${uuidv4()}`;

    const response = await axios.post(
      "https://sandbox.cashfree.com/pg/orders",
      {
        order_id: orderId,
        order_amount: amount, 
        order_currency: "INR",
        customer_details: {
          customer_id: igAccountId,
          customer_email: "test@example.com", 
          customer_phone: "9999999999",
        },
      },
      {
        headers: {
          "x-client-id": process.env.CASHFREE_CLIENT_ID,
          "x-client-secret": process.env.CASHFREE_CLIENT_SECRET,
          "x-api-version": "2023-08-01",
          "Content-Type": "application/json",
        },
      },
    );

    // 4. Send Success Response
    return res.status(200).json({
      success: true,
      payment_session_id: response.data.payment_session_id,
      bookingId: igAccountId,
      orderId: orderId,
    });
  } catch (error: any) {
    // Safely extract the error message from Axios without crashing JSON stringify
    const apiError =
      error.response?.data?.message ||
      error.message ||
      "Unknown Cashfree API Error";

    logger.error(
      `Cashfree booking initiation failed for ${igAccountId}: ${apiError}`,
    );

    return res.status(500).json({
      success: false,
      error: "Payment gateway initiation failed",
      details: process.env.NODE_ENV === "development" ? apiError : undefined,
    });
  }
});

export default router;
