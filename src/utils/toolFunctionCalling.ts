export function getCurrentTimeInIndia() {
  return new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
}


export const tools = [
      {
        type: "function",
        function: {
          name: "get_current_time_in_india",
          description: "Get the exact current time and date in India. Call this tool if the user asks for the time, or to make contextual greetings (like Good Morning/Good Night).",
          parameters: {
            type: "object",
            properties: {},
            required: []
          }
        }
      }
    ];