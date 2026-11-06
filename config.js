require('dotenv').config();

module.exports = {
  // Bot Identity & Branding
  BOT_NAME: process.env.BOT_NAME || "Talha-MD",
  BOT_VERSION: "1.0.0",
  OWNER_NAME: process.env.OWNER_NAME || "Talha Sheikh",
  OWNER_NUMBER: process.env.OWNER_NUMBER || "923426767199",
  PACK_NAME: process.env.PACK_NAME || "Created By Talha",
  AUTHOR: process.env.AUTHOR || "Talha",
  PREFIX: process.env.PREFIX || ".",

  // Theme Posters & Avatars (Obsidian Hero Edition)
  MENU_IMAGE_URL: process.env.MENU_IMAGE_URL || "https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=800&auto=format&fit=crop&q=80",
  ALIVE_IMAGE_URL: process.env.ALIVE_IMAGE_URL || "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=800&auto=format&fit=crop&q=80",
  THUMB_URL: "https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=300&auto=format&fit=crop&q=80",
  SUPPORT_CHANNEL: process.env.SUPPORT_CHANNEL || "https://whatsapp.com/channel/0029Vaexample",

  // Default Operational Settings
  MODE: process.env.MODE || "public", // 'public' | 'private'
  AUTO_STATUS_SEEN: process.env.AUTO_STATUS_SEEN !== "false", // true
  AUTO_STATUS_REACT: process.env.AUTO_STATUS_REACT !== "false", // true
  AUTO_STATUS_EMOJI: process.env.AUTO_STATUS_EMOJI || "❤️",
  ANTI_DELETE: process.env.ANTI_DELETE !== "false", // true
  ANTI_VIEW_ONCE: process.env.ANTI_VIEW_ONCE !== "false", // true
  ANTI_CALL: process.env.ANTI_CALL === "true", // false by default
  REJECT_CALL_MSG: "*_Talha Sheikh bhai busy hain, please call mat karein!_* 📵",
  ALWAYS_ONLINE: process.env.ALWAYS_ONLINE === "true", // false by default
  AUTO_TYPING: process.env.AUTO_TYPING === "true", // false by default

  // Server
  PORT: process.env.PORT || 3005
};
