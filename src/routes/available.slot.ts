import express, { type Request, type Response } from "express";
import prisma from "../config/prisma.js";
import { logger } from "../utils/logger.js";

const router = express.Router();

const SLOT_INTERVAL_MINUTES = 40;
const MAX_USERS_PER_SLOT = 3;
const DAYS_TO_GENERATE = 3;

const formatDate = (date: Date) => {
  return date.toISOString().split("T")[0]!;
};

const formatTime = (date: Date) => {
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata", // Forces IST timezone for consistency
  });
};

router.get("/bookings/available/slots", async (req: Request, res: Response) => {
  try {
    const { igId } = req.query;

    if (!igId) {
      return res
        .status(400)
        .json({ success: false, message: "igId is required" });
    }

    const now = new Date();

    const startDate = new Date(now);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + DAYS_TO_GENERATE);

    const existingBookings = await prisma.user.findMany({
      where: {
        bookedStartTime: {
          gte: startDate,
          lt: endDate,
        },
      },
      select: {
        bookedStartTime: true,
      },
    });

    const bookingCounts: Record<string, number> = {};
    existingBookings.forEach((user) => {
      if (user.bookedStartTime) {
        const timeKey = user.bookedStartTime.toISOString();
        bookingCounts[timeKey] = (bookingCounts[timeKey] || 0) + 1;
      }
    });

    const scheduleByDate: Record<string, any[]> = {};
    let earliestAvailable: any = null;

    for (let i = 0; i < DAYS_TO_GENERATE; i++) {
      const targetDate = new Date(startDate);
      targetDate.setDate(targetDate.getDate() + i);
      const dateString = formatDate(targetDate);

      scheduleByDate[dateString] = [];

      const TOTAL_SLOTS = Math.floor((24 * 60) / SLOT_INTERVAL_MINUTES);

      for (let j = 0; j < TOTAL_SLOTS; j++) {
        const slotStart = new Date(targetDate);
        slotStart.setMinutes(j * SLOT_INTERVAL_MINUTES);

        if (i === 0 && slotStart <= now) {
          continue;
        }

        const timeKey = slotStart.toISOString();
        const bookedCount = bookingCounts[timeKey] || 0;
        const availableSlotsLeft = Math.max(
          0,
          MAX_USERS_PER_SLOT - bookedCount,
        );
        const isAvailable = availableSlotsLeft > 0;

        const slotData = {
          time: formatTime(slotStart),
          availableSlotsLeft,
          isAvailable,
          rawStartTime: timeKey,
        };

        scheduleByDate[dateString].push(slotData);

        if (isAvailable && !earliestAvailable) {
          earliestAvailable = {
            id: `slot-${timeKey}`,
            date: dateString,
            time: slotData.time,
            isAvailable: true,
          };
        }
      }
    }

    return res.status(200).json({
      success: true,
      earliestAvailable,
      scheduleByDate,
    });
  } catch (error) {
    logger.error("Error fetching available slots:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error while fetching slots.",
    });
  }
});

export default router;
