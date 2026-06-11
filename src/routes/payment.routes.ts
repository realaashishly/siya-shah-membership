import express from "express";
import 'dotenv/config';
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
  const { igAccountId, igUsername, bookingDate, startBookingTime } = req.body;

  if (!igAccountId || !bookingDate || !startBookingTime || !igUsername) {
    logger.error("Missing required fields: igAccountId, startTime, endTime")
    return res.status(400).json({
      error: "Missing required fields: igAccountId, startTime, endTime",
    });
  }

  const endBookingTime = new Date(startBookingTime.getTime() + 60 * 60 * 1000);

  try {
    const user = await prisma.user.update({
      where: { igAccountId },
      data: {
        bookedDate: bookingDate,
        bookedStartTime: startBookingTime,
        bookedEndTime: endBookingTime,
      },
    });

    const randId = uuidv4();

    const response = await axios.post(
      "https://sandbox.cashfree.com/pg/orders",
      {
        order_id: `order_${randId}`,
        order_amount: 9.0,
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
    res.json({
      payment_session_id: response.data.payment_session_id,
      bookingId: igAccountId,
    });
  } catch (error) {
    res.status(500).json({
      error: "Booking initiation failed",
      details: error,
    });
  }
});

export default router;
