import "dotenv/config";

const PAGE_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const url = `https://graph.instagram.com/v25.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`;

export async function sendInstagramMessage(
  recipientId: string,
  messageText: string,
) {
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
      return false;
    }

    return true;
  } catch (error) {
    return false;
  }
}

export async function sendInstagramAction(
  recipientId: string,
  action = "typing_on",
) {
  const payload = {
    recipient: { id: recipientId },
    sender_action: action,
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (data.error) {
      return false;
    }

    return true;
  } catch (error) {
    return false;
  }
}

export async function getInstagramUserProfile(igAccountId: string) {
  const url = `https://graph.instagram.com/v25.0/${igAccountId}?fields=name,username,profile_pic&access_token=${PAGE_ACCESS_TOKEN}`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (data.error) {
      return {
        username: "Unknown User",
        name: "Unknown User",
        profile_picture_url: "",
      };
    }

    return {
      username: data.username || null,
      name: data.name || null,
      profile_picture_url: data.profile_pic || null,
    };
  } catch (error) {
    return {
      username: "Unknown User",
      name: "Unknown User",
      profile_picture_url: "",
    };
  }
}
