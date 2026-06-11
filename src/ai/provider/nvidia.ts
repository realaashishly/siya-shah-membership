import OpenAI from "openai";
import { safeParseJSON } from "../../utils/index.js"; 

import dotenv from "dotenv";
import { SYSTEM_INSTRUCTION } from "../prompt/prompt.js";
import { logger } from "../../utils/logger.js";
dotenv.config();


const openai = new OpenAI({
  apiKey: process.env.NVIDIA_API_KEY || "dummy_key",
  baseURL: "https://integrate.api.nvidia.com/v1",
});

export async function generateNvidiaFallback(messages: string) {
  try {
    if (!process.env.NVIDIA_API_KEY || process.env.NVIDIA_API_KEY === "dummy_key") {
      throw new Error("NVIDIA_API_KEY is missing from environment variables.");
    }

    logger.info("Triggering Nvidia API fallback generation via MiniMax M2.7...");

    openai.apiKey = process.env.NVIDIA_API_KEY;

    const finalMessages: any = [
      { role: "system", content: SYSTEM_INSTRUCTION },
      { role: "user", content: messages }
    ];

    const response = await openai.chat.completions.create({
      model: "minimaxai/minimax-m2.7",
      messages: finalMessages,
      temperature: 0.55,
      top_p: 0.95,
      max_tokens: 200,
      stream: false 
    });

    const content = response.choices[0]?.message?.content;

    if (content) {
      logger.info('Nvidia (MiniMax) Failover successfully handled the request!');
      
      const result = safeParseJSON(content);
      
      return result?.siya_response || "";
    }

    throw new Error('Nvidia API returned an unparseable response structure.');

  } catch (error: any) {
    const apiErrorDetail = error.response?.data || error.message || error;
    
    logger.error(
      "CRITICAL: Both Primary and Fallback AI models failed."
    );
    
    throw new Error('All AI synthesis options exhausted.');
  }
}