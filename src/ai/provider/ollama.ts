import { Ollama } from "ollama";
import { safeParseJSON } from "../../utils/index.js";

import dotenv from "dotenv";
import { SYSTEM_INSTRUCTION } from "../prompt/prompt.js";
import { logger } from "../../utils/logger.js";
import { tools } from "../../utils/toolFunctionCalling.js";
dotenv.config();


// Use the base host URL; the SDK automatically appends /api/chat
const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://127.0.0.1:11434";
const DEFAULT_MODEL = "gemma4:31b-cloud";

// Initialize the SDK Client
const ollamaOptions: { host: string; headers?: Record<string, string> } = { host: OLLAMA_HOST };
if (process.env.OLLAMA_API_KEY) {
  ollamaOptions.headers = {
    Authorization: "Bearer " + process.env.OLLAMA_API_KEY,
  };
}

const ollama = new Ollama(ollamaOptions);


export async function generateOllamaResponse(chatHistory: string, currentMessage: string) {
  try {
    logger.info(`Sending inference request to Ollama (${DEFAULT_MODEL})...`);

    // The SDK automatically handles the HTTP request and parsing
    const response = await ollama.chat({
      model: DEFAULT_MODEL,
      messages: [
        { role: "system", content: SYSTEM_INSTRUCTION },
        {
          role: "user",
          content: `Chat History:\n${chatHistory}\n\nCurrent Message: ${currentMessage}`,
        },
      ],
      think: false,
      stream: false,
      // tools: tools,
      format: "json",
      options: {
        temperature: 0.55,
      },
    });

    // The SDK returns the parsed object directly, no need for .json()
    const content = response.message?.content;
    
    if (!content) {
      throw new Error("Received empty or malformed response from Ollama.");
    }

    // Parse your structured JSON output
    const result = safeParseJSON(content);

    return result?.siya_response || "";
    
  } catch (error: any) {
    logger.error("Ollama Bridge Error:", error.message);
    throw error;
  }
}