const fs = require('fs');
// Load .env first (standard dotenv), then config.env for local defaults (never overwrite cloud env vars)
if (fs.existsSync('.env')) require('dotenv').config({ path: './.env', override: false });
if (fs.existsSync('config.env')) require('dotenv').config({ path: './config.env', override: false });

function toBool(val, defaultOn = true) {
    if (val === undefined || val === null || val === '') return defaultOn;
    return val.toLowerCase() !== 'false';
}

module.exports = {
    SESSION_ID:            process.env.SESSION_ID || "",
    PREFIX:                process.env.PREFIX || ".",
    BOT_NAME:              process.env.BOT_NAME || "TALHA MD",
    OWNER_NUMBER:          process.env.OWNER_NUMBER || "923426767199",
    OWNER_NAME:            process.env.OWNER_NAME || "Talha Sheikh",
    CHANNEL_URL:           process.env.CHANNEL_URL || "https://whatsapp.com/channel/0029Vb8l5Yd2f3EBHMz87B2S",
    NEWSLETTER_JID:        process.env.NEWSLETTER_JID || "120363431246808172@newsletter",
    NEWSLETTER_NAME:       process.env.NEWSLETTER_NAME || "⚡ TALHA-MD OFFICIAL ⚡",
    DESCRIPTION:           process.env.DESCRIPTION || "TALHA MD — Ultimate Multi-Device Assistant",
    ALIVE_IMG:             process.env.ALIVE_IMG || "https://files.catbox.moe/cpm6od.jpg",
    LIVE_MSG:              process.env.LIVE_MSG || "⚡ TALHA MD is Online & Ready!",
    MODE:                  process.env.MODE || "both", // 'both' allows anyone (public) to use in group and DM
    AUTO_STATUS_SEEN:      toBool(process.env.AUTO_STATUS_SEEN,      false),
    AUTO_STATUS_REACT:     toBool(process.env.AUTO_STATUS_REACT,     false),
    AUTO_STATUS_REPLY:     toBool(process.env.AUTO_STATUS_REPLY,     false),
    AUTO_STATUS_MSG:       process.env.AUTO_STATUS_MSG || "Seen by TALHA MD",
    CUSTOM_REACT_EMOJIS:   process.env.CUSTOM_REACT_EMOJIS || "❤️,🔥,💯,😍,👏,💙,🙌",
    Status_Saver:          process.env.Status_Saver  || process.env.STATUS_SAVER  || 'false',
    STATUS_REPLY:          process.env.STATUS_REPLY  || 'false',
    STATUS_MSG:            process.env.STATUS_MSG    || 'TALHA MD ⚡ VIEWED YOUR STATUS',
    READ_MESSAGE:          toBool(process.env.READ_MESSAGE,          false),
    AUTO_REACT_NEWSLETTER: toBool(process.env.AUTO_REACT_NEWSLETTER, true),
    ANTI_BAD:              toBool(process.env.ANTI_BAD,              false),
    ALWAYS_ONLINE:         toBool(process.env.ALWAYS_ONLINE,         true),
    AUTO_TYPING:           toBool(process.env.AUTO_TYPING,           false),
    AUTO_RECORDING:        toBool(process.env.AUTO_RECORDING,        false),
    AUTO_BIO:              toBool(process.env.AUTO_BIO,              true),
    AUTO_REACT_MESSAGES:   toBool(process.env.AUTO_REACT_MESSAGES,   false),
    DELETE_LINKS:          toBool(process.env.DELETE_LINKS,          false),
    ANTIDELETE_GROUP:      toBool(process.env.ANTIDELETE_GROUP,      true),
    ANTIDELETE_PRIVATE:    toBool(process.env.ANTIDELETE_PRIVATE,    true),
    ANTILINK:              toBool(process.env.ANTILINK,               false),
    ANTICALL:              toBool(process.env.ANTICALL,               false),
    ANTIVV:                toBool(process.env.ANTIVV,                 true),
    DEBUG:                 toBool(process.env.DEBUG,                 false),
    THEME:                 (process.env.THEME || 'talha').toLowerCase().trim(),
    GREETING:              process.env.GREETING || '',
    APP_URL:               process.env.APP_URL || '',
    INSTAGRAM_SESSION:     process.env.INSTAGRAM_SESSION || '',
    AGENT_API_KEY:         process.env.AGENT_API_KEY || process.env.OPENAI_API_KEY || '',
    AGENT_API_URL:         process.env.AGENT_API_URL || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    AGENT_MODEL:           process.env.AGENT_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini',
    AGENT_MAX_STEPS:       parseInt(process.env.AGENT_MAX_STEPS || '5', 10),
    GEMINI_API_KEY:        process.env.GEMINI_API_KEY || '',
    DATABASE_URL:          process.env.DATABASE_URL || '',
};
