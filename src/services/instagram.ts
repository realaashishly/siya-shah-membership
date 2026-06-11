import { logger } from "../utils/logger.js";

const PAGE_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const url = `https://graph.instagram.com/v25.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`;

export async function sendInstagramMessage(recipientId: string, messageText: string) {

  const payload = {
    recipient: { id: recipientId },
    message: { text: messageText },
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (data.error) {
      logger.error("Error sending IG message:", data.error);
      return false;
    }

    logger.info(`Successfully sent reply to ${recipientId}`);
    return true;
  } catch (error) {
    logger.error("Network error sending IG message:", error);
    return false;
  }
}

export async function sendInstagramAction(recipientId: string, action = 'typing_on') {
  
  const payload = {
    recipient: { id: recipientId },
    sender_action: action
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    
    if (data.error) {
      logger.error('Error sending IG typing action');
      return false;
    }
    
    return true;
  } catch (error) {
    logger.error('Network error sending IG typing action:', error);
    return false;
  }
}

export async function getInstagramUserProfile(igAccountId: string) {
  const url = `https://graph.instagram.com/v25.0/${igAccountId}?fields=name,username,profile_picture_url&access_token=${PAGE_ACCESS_TOKEN}`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (data.error) {
      logger.error("API Error fetching profile:", data.error);
      return { username: "Unknown User", name: "Unknown User", profile_picture_url: "" };
    }

    return {
      username: data.username || "Unknown",
      name: data.name || "Unknown",
      profile_picture_url: data.profile_picture_url || ""
    };
  } catch (error) {
    logger.error("Network error fetching IG user profile:", error);
    return { username: "Unknown User", name: "Unknown User", profile_picture_url: "" };
  }
}
