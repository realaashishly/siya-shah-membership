export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function safeParseJSON(text: string) {
  try {
    const cleanText = text.replace(/```json/gi, '').replace(/```/g, '').trim();
    return JSON.parse(cleanText);
  } catch (error) {
    return {
      analysis: {
        contextual_meaning: "Raw string fallthrough detected",
        strategy: "Auto-recovering data payload"
      },
      siya_response: text.trim()
    };
  }
}