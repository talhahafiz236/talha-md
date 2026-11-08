'use strict';

const config = require('../config');
const { getStr } = require('../lib/theme');
const path = require('path');
const fs = require('fs');

function badge(val) {
    return val ? '`[🟢 ON ]`' : '`[🔴 OFF]`';
}

function modeLabel(m) {
    const map = {
        public:  '🌍 Public (Everyone)',
        private: '🔒 Private (Owner Only)',
        group:   '👥 Groups Only',
        inbox:   '📥 DMs / Inbox Only',
        both:    '🌍 Public (All Chats)',
    };
    return map[(m || '').toLowerCase()] || m;
}

module.exports = {
    commands:    ['settings', 'config', 'botsettings', 'allsettings', 'statusconfig'],
    description: 'Comprehensive control panel to view and toggle all bot settings',
    permission:  'public',
    group:       true,
    private:     true,

    async run(sock, message, args, ctx) {
        const { reply, isOwner, isAdmin, isGroup, jid, sender } = ctx;

        const botName  = getStr('botName') || config.BOT_NAME  || 'TALHA MD';
        const ownerNum = (config.OWNER_NUMBER || process.env.OWNER_NUMBER || '923426767199').replace(/\D/g, '');
        const prefix   = config.PREFIX || '.';
        const mode     = config.MODE   || 'both';

        // ── 1. GATHER ALL CURRENT SETTING VALUES ──
        if (!global.autoStatusFlags) global.autoStatusFlags = { seen: null, react: null };
        const autoSeen = global.autoStatusFlags.seen !== null ? Boolean(global.autoStatusFlags.seen) : Boolean(config.AUTO_STATUS_SEEN);
        const autoReact = global.autoStatusFlags.react !== null ? Boolean(global.autoStatusFlags.react) : Boolean(config.AUTO_STATUS_REACT);
        const autoStatusReply = Boolean(config.AUTO_STATUS_REPLY);

        // Security & Privacy
        const antiDelGroup = Boolean(config.ANTIDELETE_GROUP);
        const antiDelPriv = Boolean(config.ANTIDELETE_PRIVATE);
        const antiVV = typeof global.antivvEnabled !== 'undefined' ? Boolean(global.antivvEnabled) : Boolean(config.ANTIVV);
        let antiCall = Boolean(config.ANTICALL);
        try {
            const acPath = path.join(__dirname, '../data/anti-call-settings.json');
            if (fs.existsSync(acPath)) {
                const ac = JSON.parse(fs.readFileSync(acPath, 'utf8'));
                if (typeof ac.rejectCalls === 'boolean') antiCall = ac.rejectCalls;
            }
        } catch { /* ignore */ }
        const autoRead = typeof global.autoReadPM !== 'undefined' ? Boolean(global.autoReadPM) : Boolean(config.READ_MESSAGE);

        // Group Protection Settings
        if (!global.antilinkGroups) global.antilinkGroups = new Set();
        const antiLinkGroup = isGroup ? global.antilinkGroups.has(jid) : Boolean(config.ANTILINK);
        const antiBadWords = Boolean(config.ANTI_BAD);

        if (!global.antibotGroups) global.antibotGroups = new Set();
        const antiBotGroup = isGroup ? global.antibotGroups.has(jid) : false;

        let antiFakeGroup = false;
        try {
            const afPath = path.join(__dirname, '../data/antifake.json');
            if (fs.existsSync(afPath)) {
                const af = JSON.parse(fs.readFileSync(afPath, 'utf8'));
                antiFakeGroup = isGroup ? Boolean(af[jid]?.enabled) : false;
            }
        } catch { /* ignore */ }

        if (!global.antiDemoteGroups) global.antiDemoteGroups = new Set();
        const antiDemoteGroup = isGroup ? global.antiDemoteGroups.has(jid) : false;

        if (!global.antispamGroups) global.antispamGroups = new Set();
        const antiSpamGroup = isGroup ? global.antispamGroups.has(jid) : false;

        let antiFloodGroup = false;
        if (global.antifloodSettings && isGroup) {
            antiFloodGroup = Boolean(global.antifloodSettings.get(jid)?.enabled);
        }

        // Welcome / Goodbye
        let welcomeGroup = false;
        let goodbyeGroup = false;
        if (global.welcomeSettings && isGroup) {
            const ws = global.welcomeSettings.get(jid);
            welcomeGroup = Boolean(ws?.welcome);
            goodbyeGroup = Boolean(ws?.goodbye);
        }

        // Presence & Effects
        const alwaysOnline = Boolean(config.ALWAYS_ONLINE);
        const autoTyping = Boolean(config.AUTO_TYPING);
        const autoRecording = Boolean(config.AUTO_RECORDING);
        const autoBio = Boolean(config.AUTO_BIO);
        const autoReactMsg = Boolean(config.AUTO_REACT_MESSAGES);

        // ── 2. HANDLE DIRECT TOGGLE VIA ARGS ──
        // e.g.: .settings antilink on, .settings autoview off, etc.
        const target = (args[0] || '').toLowerCase().trim();
        const stateArg = (args[1] || '').toLowerCase().trim();

        if (target) {
            // Require admin for group settings, owner for global settings
            const isGroupSetting = ['antilink', 'antibot', 'antifake', 'antidemote', 'antispam', 'antiflood', 'welcome', 'goodbye', 'antibad'].includes(target);

            if (isGroupSetting) {
                if (!isGroup) return reply('⚠️ Yeh setting sirf WhatsApp Group ke andar switch ki ja sakti hai.');
                if (!isAdmin && !isOwner) return reply('⛔ Is group setting ko change karne ke liye Admin hona zaroori hai.');
            } else {
                if (!isOwner) return reply('⛔ Is global setting ko change karne ke liye Bot Owner hona zaroori hai.');
            }

            const turnOn = ['on', 'enable', 'true', '1', 'yes'].includes(stateArg);
            const turnOff = ['off', 'disable', 'false', '0', 'no'].includes(stateArg);

            if (!turnOn && !turnOff && !['public', 'private', 'both'].includes(stateArg)) {
                return reply(
                    `❓ *Usage:* \`${prefix}settings ${target} on\` ya \`${prefix}settings ${target} off\``
                );
            }

            const newState = turnOn;

            switch (target) {
                // Status
                case 'autoview':
                case 'autostatus':
                    global.autoStatusFlags.seen = newState;
                    config.AUTO_STATUS_SEEN = newState;
                    return reply(`👁️ *Auto View Status:* ${newState ? '`[🟢 ON ]`' : '`[🔴 OFF]`'}`);

                case 'autolike':
                case 'autoreactstatus':
                    global.autoStatusFlags.react = newState;
                    config.AUTO_STATUS_REACT = newState;
                    return reply(`❤️ *Auto Like Status:* ${newState ? '`[🟢 ON ]`' : '`[🔴 OFF]`'}`);

                case 'autostatusreply':
                    config.AUTO_STATUS_REPLY = newState;
                    return reply(`💬 *Auto Status Reply:* ${newState ? '`[🟢 ON ]`' : '`[🔴 OFF]`'}`);

                // Privacy
                case 'antidelete':
                case 'antidel':
                    config.ANTIDELETE_GROUP = newState;
                    config.ANTIDELETE_PRIVATE = newState;
                    return reply(`🛡️ *Anti-Delete:* ${newState ? '`[🟢 ON ]`' : '`[🔴 OFF]`'}`);

                case 'antivv':
                case 'antiviewonce':
                    global.antivvEnabled = newState;
                    config.ANTIVV = newState;
                    return reply(`👁️ *Anti-ViewOnce:* ${newState ? '`[🟢 ON ]`' : '`[🔴 OFF]`'}`);

                case 'anticall':
                    config.ANTICALL = newState;
                    try {
                        const acPath = path.join(__dirname, '../data/anti-call-settings.json');
                        let ac = {};
                        if (fs.existsSync(acPath)) ac = JSON.parse(fs.readFileSync(acPath, 'utf8'));
                        ac.rejectCalls = newState;
                        fs.writeFileSync(acPath, JSON.stringify(ac, null, 2));
                    } catch { /* ignore */ }
                    return reply(`📞 *Anti-Call:* ${newState ? '`[🟢 ON ]`' : '`[🔴 OFF]`'}`);

                case 'autoread':
                    global.autoReadPM = newState;
                    config.READ_MESSAGE = newState;
                    return reply(`📖 *Auto Read (Blue Ticks):* ${newState ? '`[🟢 ON ]`' : '`[🔴 OFF]`'}`);

                // Group
                case 'antilink':
                    if (newState) global.antilinkGroups.add(jid);
                    else global.antilinkGroups.delete(jid);
                    config.ANTILINK = newState;
                    return reply(`🔗 *Anti-Link (${isGroup ? 'This Group' : 'Global'}):* ${newState ? '`[🟢 ON ]`' : '`[🔴 OFF]`'}`);

                case 'antibad':
                case 'antibadwords':
                    config.ANTI_BAD = newState;
                    return reply(`🤬 *Anti-Badwords:* ${newState ? '`[🟢 ON ]`' : '`[🔴 OFF]`'}`);

                case 'antibot':
                    if (newState) global.antibotGroups.add(jid);
                    else global.antibotGroups.delete(jid);
                    return reply(`🤖 *Anti-Bot:* ${newState ? '`[🟢 ON ]`' : '`[🔴 OFF]`'}`);

                case 'antifake':
                    try {
                        const afPath = path.join(__dirname, '../data/antifake.json');
                        let af = {};
                        if (fs.existsSync(afPath)) af = JSON.parse(fs.readFileSync(afPath, 'utf8'));
                        af[jid] = { enabled: newState, action: 'kick' };
                        fs.writeFileSync(afPath, JSON.stringify(af, null, 2));
                    } catch { /* ignore */ }
                    return reply(`🌍 *Anti-Fake Numbers:* ${newState ? '`[🟢 ON ]`' : '`[🔴 OFF]`'}`);

                case 'antidemote':
                    if (newState) global.antiDemoteGroups.add(jid);
                    else global.antiDemoteGroups.delete(jid);
                    return reply(`🛡️ *Anti-Demote:* ${newState ? '`[🟢 ON ]`' : '`[🔴 OFF]`'}`);

                case 'antispam':
                    if (newState) global.antispamGroups.add(jid);
                    else global.antispamGroups.delete(jid);
                    return reply(`⚡ *Anti-Spam:* ${newState ? '`[🟢 ON ]`' : '`[🔴 OFF]`'}`);

                case 'antiflood':
                    if (!global.antifloodSettings) global.antifloodSettings = new Map();
                    global.antifloodSettings.set(jid, { enabled: newState, limit: 7, window: 10 });
                    return reply(`🌊 *Anti-Flood:* ${newState ? '`[🟢 ON ]`' : '`[🔴 OFF]`'}`);

                case 'welcome':
                    if (!global.welcomeSettings) global.welcomeSettings = new Map();
                    const wsW = global.welcomeSettings.get(jid) || {};
                    wsW.welcome = newState;
                    global.welcomeSettings.set(jid, wsW);
                    return reply(`👋 *Welcome Messages:* ${newState ? '`[🟢 ON ]`' : '`[🔴 OFF]`'}`);

                case 'goodbye':
                    if (!global.welcomeSettings) global.welcomeSettings = new Map();
                    const wsG = global.welcomeSettings.get(jid) || {};
                    wsG.goodbye = newState;
                    global.welcomeSettings.set(jid, wsG);
                    return reply(`🚪 *Goodbye Messages:* ${newState ? '`[🟢 ON ]`' : '`[🔴 OFF]`'}`);

                // Presence
                case 'alwaysonline':
                    config.ALWAYS_ONLINE = newState;
                    return reply(`🟢 *Always Online:* ${newState ? '`[🟢 ON ]`' : '`[🔴 OFF]`'}`);

                case 'autotyping':
                    config.AUTO_TYPING = newState;
                    return reply(`✍️ *Auto Typing:* ${newState ? '`[🟢 ON ]`' : '`[🔴 OFF]`'}`);

                case 'autorecording':
                    config.AUTO_RECORDING = newState;
                    return reply(`🎙️ *Auto Recording:* ${newState ? '`[🟢 ON ]`' : '`[🔴 OFF]`'}`);

                case 'autobio':
                    config.AUTO_BIO = newState;
                    return reply(`📝 *Auto Bio:* ${newState ? '`[🟢 ON ]`' : '`[🔴 OFF]`'}`);

                case 'autoreact':
                    config.AUTO_REACT_MESSAGES = newState;
                    return reply(`✨ *Auto React to Messages:* ${newState ? '`[🟢 ON ]`' : '`[🔴 OFF]`'}`);

                case 'mode':
                    if (!['public', 'private', 'both'].includes(stateArg)) {
                        return reply(`❌ *Usage:* \`${prefix}settings mode public\` ya \`${prefix}settings mode private\``);
                    }
                    config.MODE = stateArg;
                    process.env.MODE = stateArg;
                    return reply(`🌐 *Bot Mode set to:* *${stateArg.toUpperCase()}*`);

                default:
                    return reply(`❓ Unknown setting: *${target}*.\nType \`${prefix}settings\` to see all available settings.`);
            }
        }

        // ── 3. SHOW MASTER DASHBOARD IF NO ARGS ──
        const lines = [
            `⚙️ *𝗧𝗔𝗟𝗛𝗔-𝗠𝗗 𝗠𝗔𝗦𝗧𝗘𝗥 𝗖𝗢𝗡𝗧𝗥𝗢𝗟 𝗣𝗔𝗡𝗘𝗟*`,
            `━━━━━━━━━━━━━━━━━━━━━━━━━`,
            `🤖 *Bot Name:*   ${botName}`,
            `👑 *Owner:*      +${ownerNum}`,
            `⌨️  *Prefix:*     \`${prefix}\``,
            `🌐 *Bot Mode:*   ${modeLabel(mode)}`,
            `━━━━━━━━━━━━━━━━━━━━━━━━━`,
            ``,
            `📡 *𝗦𝗧𝗔𝗧𝗨𝗦 & 𝗦𝗧𝗢𝗥𝗜𝗘𝗦*`,
            `  ${badge(autoSeen)}  Auto View Status  (\`${prefix}settings autoview on/off\`)`,
            `  ${badge(autoReact)}  Auto Like Status  (\`${prefix}settings autolike on/off\`)`,
            `  ${badge(autoStatusReply)}  Auto Status Reply (\`${prefix}settings autostatusreply on/off\`)`,
            ``,
            `🛡️ *𝗦𝗘𝗖𝗨𝗥𝗜𝗧𝗬 & 𝗣𝗥𝗜𝗩𝗔𝗖𝗬*`,
            `  ${badge(antiDelGroup)}  Anti-Delete Groups (\`${prefix}settings antidelete on/off\`)`,
            `  ${badge(antiDelPriv)}  Anti-Delete Private`,
            `  ${badge(antiVV)}  Anti-ViewOnce     (\`${prefix}settings antivv on/off\`)`,
            `  ${badge(antiCall)}  Anti-Call Blocker (\`${prefix}settings anticall on/off\`)`,
            `  ${badge(autoRead)}  Auto Read / Blue Ticks (\`${prefix}settings autoread on/off\`)`,
            ``,
            `👥 *𝗚𝗥𝗢𝗨𝗣 𝗣𝗥𝗢𝗧𝗘𝗖𝗧𝗜𝗢𝗡 ${isGroup ? '(This Group)' : '(Global Preview)'}*`,
            `  ${badge(antiLinkGroup)}  Anti-Link Protection (\`${prefix}settings antilink on/off\`)`,
            `  ${badge(antiBadWords)}  Anti-Bad Words Filter (\`${prefix}settings antibad on/off\`)`,
            `  ${badge(antiBotGroup)}  Anti-Bot Protection   (\`${prefix}settings antibot on/off\`)`,
            `  ${badge(antiFakeGroup)}  Anti-Fake (+1) Numbers(\`${prefix}settings antifake on/off\`)`,
            `  ${badge(antiDemoteGroup)}  Anti-Demote Protection(\`${prefix}settings antidemote on/off\`)`,
            `  ${badge(antiSpamGroup)}  Anti-Spam Flood Kick  (\`${prefix}settings antispam on/off\`)`,
            `  ${badge(antiFloodGroup)}  Anti-Flood Auto Kick  (\`${prefix}settings antiflood on/off\`)`,
            `  ${badge(welcomeGroup)}  Welcome Greetings     (\`${prefix}settings welcome on/off\`)`,
            `  ${badge(goodbyeGroup)}  Goodbye Farewell      (\`${prefix}settings goodbye on/off\`)`,
            ``,
            `💬 *𝗣𝗥𝗘𝗦𝗘𝗡𝗖𝗘 & 𝗖𝗛𝗔𝗧*`,
            `  ${badge(alwaysOnline)}  24/7 Always Online   (\`${prefix}settings alwaysonline on/off\`)`,
            `  ${badge(autoTyping)}  Auto Typing Show     (\`${prefix}settings autotyping on/off\`)`,
            `  ${badge(autoRecording)}  Auto Recording Show  (\`${prefix}settings autorecording on/off\`)`,
            `  ${badge(autoBio)}  Auto Bio Clock       (\`${prefix}settings autobio on/off\`)`,
            `  ${badge(autoReactMsg)}  Auto React Messages  (\`${prefix}settings autoreact on/off\`)`,
            ``,
            `━━━━━━━━━━━━━━━━━━━━━━━━━`,
            `💡 *How to Change Any Setting:*`,
            `1️⃣ Direct: \`${prefix}settings <setting_name> on\` ya \`off\``,
            `   *Example:* \`${prefix}settings antilink on\``,
            `   *Example:* \`${prefix}settings autoview off\``,
            `   *Example:* \`${prefix}settings mode private\``,
            `2️⃣ Standalone commands bhi kaam karti hain:`,
            `   \`${prefix}antilink on\`, \`${prefix}autoview on\`, \`${prefix}setmode public\`, etc.`,
            `━━━━━━━━━━━━━━━━━━━━━━━━━`
        ];

        return reply(lines.join('\n'));
    }
};
