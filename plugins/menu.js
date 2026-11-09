'use strict';

const fs      = require('fs');
const path    = require('path');
const config  = require('../config');
const { getStr } = require('../lib/theme');
const moment  = require('moment-timezone');

const WEBSITE = 'https://github.com/talhahafiz236/talha-md';
const TZ      = 'Asia/Karachi';

// ── Category definitions ──────────────────────────────────────────────────────
// Each has a numeric ID for `.menu 3` style read-more
const CATEGORIES = [
    { id: 1,  icon: '⬇️',  name: 'Downloaders',        cmds: ['yt','ytmp3','ytmp4','tiktok','instagram','facebook','spotify','soundcloud','capcut','apk','catbox','tourl','pinterest','reddit','twitter','threads','gdrive'] },
    { id: 2,  icon: '🎵',  name: 'Music & Audio',       cmds: ['play','shazam','lyrics','toaudio','bgm','addbgm','setbgm','clearbgm','transcribe','tts'] },
    { id: 3,  icon: '🤖',  name: 'AI & Intelligence',   cmds: ['ai','gpt4','gpt4o','gemini','bard','venice','openai','letmegpt','ask','talha','assistant','imagine','img','draw','art','translate','define','calc','shorten','gitclone','anime','manga','describe','caption','carbon'] },
    { id: 4,  icon: '🔍',  name: 'Search & Info',       cmds: ['wiki','imdb','country','ip','currency','time','weather','numberfact','stalk','whois','dns','speedtest','ipinfo','screenshot','fetch','githubstalk'] },
    { id: 5,  icon: '🖼️', name: 'Media & Stickers',    cmds: ['sticker','stickersearch','togif','tojpeg','emojimix','textsticker','textmaker','mp4reverse','slowmo','spectrum','mp3crusher','x2mp4','x4mp4','mp4image','qrcode','react','ocr','ascii','color','getpp','togstatus','statussave','captionimage','quotly','viewonce'] },
    { id: 6,  icon: '👥',  name: 'Group Management',    cmds: ['kick','promote','demote','ban','unban','banlist','tagall','hidetag','poll','multipoll','pollresult','lock','unlock','link','revoke','setname','setdesc','broadcast','purge','dmall','warn','mute','unmute','pin','unpin','edit','groupinfo','grouprules','groupstatus','setbio','approveall','approvejoin','rejectjoin','joinrequests','groupvcf','vcfgroup','vcfrows'] },
    { id: 7,  icon: '👋',  name: 'Welcome & Events',    cmds: ['welcome','goodbye','setwelcome','setgoodbye','welcomequiz','setquiz'] },
    { id: 8,  icon: '🛡️', name: 'Protection',          cmds: ['antidemote','antidelete','antilink','anticall','antivv','antiscam','antibadwords','antibot','antifake','antiflood','antigm','antispam','afk','auditlog','blocklist','block','unblock','warn','warnlist','clearwarn'] },
    { id: 9,  icon: '😄',  name: 'Fun & Entertainment', cmds: ['joke','fact','riddle','meme','quote','advice','compliment','flip','bible','pickup','roast','truth','dare','ship','pair','marry','divorce','slots','8ball'] },
    { id: 10, icon: '🔧',  name: 'Text & Dev Tools',    cmds: ['reverse','upper','lower','mock','binary','rot13','json','timestamp','regex','httpcode','password','hash','encode','decode','wordcount','urlencode','urldecode','morse','base64','carbon','cron','chmod','ascii'] },
    { id: 11, icon: '📊',  name: 'Leveling & Analytics',cmds: ['level','rank','xp','leaderboard','analytics','topusers','peakhours','presence'] },
    { id: 12, icon: '📰',  name: 'Channels',            cmds: ['newsletter','followchannel','unfollowchannel','channelinfo'] },
    { id: 13, icon: '🎮',  name: 'Games',               cmds: ['rps','hangman','ttt','trivia','slots','8ball','scramble','flagquiz','mathquiz','wordchain','emojiguess','numberguess','wordgame','capitalquiz','tictactoe','typerace','dailychallenge','challenge'] },
    { id: 14, icon: '💰',  name: 'Finance & Crypto',    cmds: ['crypto','loan','savings','tax','split','salary','discount','currency','budget','expense','balances','networth','inflation','invest','bitcoin'] },
    { id: 15, icon: '📚',  name: 'Education',           cmds: ['element','planet','zodiac','vocab','acronym','flag','nato','phrasebook','define','bible'] },
    { id: 16, icon: '📝',  name: 'Productivity',        cmds: ['remind','rremind','myreminders','bookmark','save','saved','notes','addnote','todo','autoreply','awaymsg','schedule','timer','expense'] },
    { id: 17, icon: '💪',  name: 'Health & Fitness',    cmds: ['workout','stretching','calories','water','sleep','meditation','steps','yoga','bmi'] },
    { id: 18, icon: '🤝',  name: 'Lend & Sub-bot',      cmds: ['lend','approvelend','rejectlend','revokelend','lendlist','lendstatus','subbot','subbots','mybotinfo','getcode','paircode','getpair','sessioncode','connectbot'] },
    { id: 19, icon: '🕵️', name: 'Stalk & Lookup',      cmds: ['stalk','devicecheck','whois','githubstalk','tiktokstalk','checkscam','virus','tempmail','dns','ipinfo'] },
    { id: 20, icon: 'ℹ️', name: 'Bot Info',            cmds: ['alive','ping','uptime','owner','getjid','repo','menu','help','support','call','botinfo'] },
    { id: 21, icon: '👑',  name: 'Owner & Sudo',        cmds: ['sudo','setsudo','delsudo','getsudo','resetsudo','block','unblock','setmode','setprefix','setbotname','join','cmd','restart','shutdown','backupgroup','restoregroup','broadcast','eval','dmall','autojoin','cleanup','lendlimit'] },
    { id: 22, icon: '✨',  name: 'Advanced Utilities',  cmds: ['find','searchcmd','health','uptime2','sysinfo','uuid','timestamp','calcx','jsonformat','textstats','choose'] },
    { id: 23, icon: '🌐',  name: 'Universal Downloader', cmds: ['download','dl','socialdl','universal','autodl'] },
    { id: 24, icon: '🧠',  name: 'Neural Agent',        cmds: ['talha','agent','assistant','ask','autopilot','agent2','copilot'] },
    { id: 25, icon: '👨‍💻', name: 'Developers',          cmds: ['developers','devs','devcontact'] },
    { id: 26, icon: '⚠️', name: 'Warning Management',   cmds: ['warn','unwarn','warnreset','resetwarn','warnlist','warnmenu','warnings','reset'] },
];

// ── Box drawing ───────────────────────────────────────────────────────────────
function hline(n = 38) { return '─'.repeat(n); }

function box(title, lines) {
    return `╭─「 ${title} 」\n${lines.map(l => `│  ${l}`).join('\n')}\n╰${hline()}`;
}

// ── Load all active plugins ───────────────────────────────────────────────────
function loadPlugins() {
    const dir = path.join(__dirname);
    const out = [];
    for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.js'))) {
        try {
            const p = require(path.join(dir, f));
            if (Array.isArray(p.commands) && p.commands.length) out.push(p);
        } catch { }
    }
    return out;
}

// Build the menu from the actual loaded registry rather than relying only on
// the hand-curated list above. Curated matches win first; unlisted commands are
// classified from their command name and plugin description, then placed in
// Advanced Utilities as a visible safe fallback. Each command is assigned once.
function buildCategoryMap(plugins) {
    const map = new Map(CATEGORIES.map(category => [category.id, new Set()]));
    const curated = new Map();
    for (const category of CATEGORIES) {
        for (const command of category.cmds) curated.set(command.toLowerCase(), category.id);
    }

    const rules = [
        [1, /download|ytmp|tiktok|instagram|facebook|twitter|xvideo|spotify|soundcloud|pinterest|reddit|gdrive|capcut|apk|catbox|tourl/],
        [2, /music|song|play|audio|lyrics|shazam|tts|transcrib|bgm|voice/],
        [3, /ai|gpt|gemini|bard|openai|ask|agent|silva|assistant|imagine|translate|define|caption|describe|vision|ocr/],
        [4, /search|wiki|imdb|weather|country|currency|time|whois|dns|ip|lookup|speed|screenshot|fetch|news|fact/],
        [5, /sticker|stik|gif|jpeg|image|photo|video|emoji|qr|ascii|color|meme|quote|react|reverse|slow|compress|media/],
        [6, /group|kick|promote|demote|admin|tag|poll|lock|unlock|link|revoke|broadcast|purge|warn|mute|pin|vcf|approve|join|reject/],
        [7, /welcome|goodbye|event|quiz|greet/],
        [8, /anti|block|ban|spam|scam|flood|audit|afk|badword|fake|delete|call|viewonce/],
        [9, /joke|riddle|compliment|pickup|roast|truth|dare|ship|marry|divorce|slot|8ball|fun/],
        [10, /text|json|regex|binary|rot|hash|encode|decode|word|url|morse|base64|timestamp|password|cron|chmod|mock/],
        [11, /level|rank|xp|leaderboard|analytic|topuser|peak|presence|stat/],
        [12, /channel|newsletter/],
        [13, /game|quiz|hangman|tictactoe|ttt|rps|scramble|trivia|wordchain|guess|typerace|challenge/],
        [14, /crypto|loan|saving|tax|salary|budget|expense|balance|networth|inflation|invest|bitcoin|discount/],
        [15, /education|element|planet|zodiac|vocab|acronym|flag|nato|phrase|bible|learn/],
        [16, /remind|bookmark|save|note|todo|reply|away|schedule|timer|calendar/],
        [17, /workout|stretch|calorie|water|sleep|meditat|step|yoga|bmi|health/],
        [18, /lend|subbot|pair|session|connectbot/],
        [19, /stalk|device|checkscam|virus|tempmail/],
        [20, /alive|ping|uptime|owner|repo|support|botinfo|menu|help|jid/],
        [21, /sudo|setmode|setprefix|setbot|restart|shutdown|backup|restore|eval|autojoin|cleanup|config|setting/],
        [23, /social|universal|autodl|^dl$/],
        [24, /agent|copilot|autopilot|^talha$/],
        [25, /developer|^dev/],
        [26, /warn|warning/],
    ];

    for (const plugin of plugins) {
        const description = String(plugin.description || '').toLowerCase();
        for (const rawCommand of plugin.commands || []) {
            const command = String(rawCommand).toLowerCase();
            let categoryId = curated.get(command);
            if (!categoryId) {
                const haystack = `${command} ${description}`;
                categoryId = rules.find(([, pattern]) => pattern.test(haystack))?.[0] || 22;
            }
            map.get(categoryId).add(command);
        }
    }
    return map;
}

// ── Compact overview (`.menu`) ────────────────────────────────────────────────
function buildCompactMenu(plugins, pfx, botName, mode, categoryMap = buildCategoryMap(plugins)) {
    const allCmds   = new Set(plugins.flatMap(p => p.commands || []));
    const modeEmoji = mode === 'PUBLIC' ? '🟢' : mode === 'PRIVATE' ? '🔒' : '🔵';
    const now       = moment().tz(TZ);
    const categorizedCount = [...categoryMap.values()].reduce((sum, commands) => sum + commands.size, 0);

    const header =
        `╭━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╮\n` +
        `┃    ⚡ *𝗧𝗔𝗟𝗛𝗔-𝗠𝗗 𝗩𝟮.𝟬* ⚡     ┃\n` +
        `┃  👑 _Smart, Fast & Powerful_ ┃\n` +
        `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯\n`;

    const statusBlock = box(`📊 𝗕𝗢𝗧 𝗦𝗧𝗔𝗧𝗨𝗦`, [
        `◆ *🤖 𝗕𝗼𝘁:*      TALHA-MD`,
        `◆ *👑 𝗢𝘄𝗻𝗲𝗿:*    Talha Sheikh`,
        `◆ *⌨️ 𝗣𝗿𝗲𝗳𝗶𝘅:*   \`${pfx}\``,
        `◆ *🌐 𝗠𝗼𝗱𝗲:*     ${modeEmoji} ${mode}`,
        `◆ *⚡ 𝗖𝗼𝗺𝗺𝗮𝗻𝗱𝘀:* ${allCmds.size}`,
        `◆ *📅 𝗗𝗮𝘁𝗲:*     ${now.format('ddd, DD MMM YYYY')}`,
        `◆ *⏱ 𝗧𝗶𝗺𝗲:*     ${now.format('hh:mm A')} PKT`,
    ]);

    // Numbered category list with command counts
    const catLines = [];
    for (const cat of CATEGORIES) {
        const found = [...(categoryMap.get(cat.id) || [])];
        if (!found.length) continue;
        const num = String(cat.id).padStart(2, ' ');
        catLines.push(`│  *${num}.* ${cat.icon}  *${cat.name.padEnd(20)}* _(${found.length})_`);
    }

    const catBlock =
        `\n╭─────────────────────────────\n` +
        `│  📋 *𝗖𝗢𝗠𝗠𝗔𝗡𝗗 𝗖𝗔𝗧𝗘𝗚𝗢𝗥𝗜𝗘𝗦*\n` +
        `│  _(Type \`${pfx}menu <number>\` to view)_\n` +
        `├─────────────────────────────\n` +
        catLines.join('\n') +
        `\n│  ✅ *Total Verified:* ${allCmds.size} Features` +
        `\n╰─────────────────────────────`;

    const footer =
        `\n╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄╮\n` +
        `│  📖 *𝗤𝘂𝗶𝗰𝗸 𝗡𝗮𝘃𝗶𝗴𝗮𝘁𝗶𝗼𝗻:*           │\n` +
        `│  \`${pfx}menu 1\`  → Downloaders (TikTok/FB/YT)│\n` +
        `│  \`${pfx}menu 3\`  → AI Intelligence (Gemini) │\n` +
        `│  \`${pfx}menu 6\`  → Group Management         │\n` +
        `│  \`${pfx}menu 8\`  → Security & Protection    │\n` +
        `│  \`${pfx}allmenu\` → Full Command Directory   │\n` +
        `│  \`${pfx}settings\` → Live Status & Toggles   │\n` +
        `╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄╯\n` +
        `\n> 👑 *Powered by Talha Sheikh*\n` +
        `> 📢 *Official Channel:* https://whatsapp.com/channel/0029Vb8l5Yd2f3EBHMz87B2S`;

    return `${header}${statusBlock}\n${catBlock}\n${footer}`;
}

// ── Category detail page (`.menu <id>`) ───────────────────────────────────────
function buildCategoryMenu(cat, plugins, pfx, categoryMap = buildCategoryMap(plugins)) {
    const allCmds = new Set(plugins.flatMap(p => p.commands || []));
    const descMap = new Map(
        plugins.flatMap(p => (p.commands || []).map(c => [c, { desc: p.description || '', usage: p.usage || '', perm: p.permission || 'public' }]))
    );
    const found = [...(categoryMap.get(cat.id) || [])].sort((a, b) => a.localeCompare(b));
    if (!found.length) return `❌ No commands found in *${cat.name}*.`;

    const PERM_ICON = { owner: '👑', admin: '⚙️', public: '🌍' };
    const lines = found.map(c => {
        const info    = descMap.get(c) || {};
        const pIcon   = PERM_ICON[(info.perm || 'public').toLowerCase()] || '🌍';
        const shortD  = (info.desc || '').slice(0, 45);
        return `│  ${pIcon} \`${pfx}${c}\`${shortD ? `\n│     _${shortD}_` : ''}`;
    });

    const header =
        `\n${cat.icon} *${cat.name.toUpperCase()}*\n` +
        `_${found.length} command${found.length !== 1 ? 's' : ''} available_\n`;

    const cmdBlock =
        `╭${hline()}\n` +
        lines.join('\n│\n') +
        `\n╰${hline()}`;

    const footer =
        `\n╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄╮\n` +
        `│ \`${pfx}help <cmd>\` for details │\n` +
        `│ \`${pfx}menu\` for overview      │\n` +
        `╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄╯\n` +
        `\n_🌍 Public  ⚙️ Admin  👑 Owner_`;

    return `${header}${cmdBlock}${footer}`;
}

// ── Individual command help (`.help <cmd>`) ────────────────────────────────────
function buildCommandHelp(cmdName, plugins, pfx) {
    const plugin = plugins.find(p => (p.commands || []).includes(cmdName));
    if (!plugin) {
        return `❌ Command \`${pfx}${cmdName}\` not found.\n\nUse \`${pfx}menu\` to browse all commands.`;
    }
    const aliases = (plugin.commands || []).filter(c => c !== cmdName);
    const perm    = (plugin.permission || 'public').toLowerCase();
    const permTag = perm === 'owner' ? '👑 Owner only' : perm === 'admin' ? '⚙️ Admin only' : '🌍 Public';

    return [
        ``,
        `📖 *Command Help*`,
        ``,
        box(`${pfx}${cmdName}`, [
            `◆ *Description:*`,
            `   ${plugin.description || 'No description available.'}`,
            ``,
            `◆ *Usage:*`,
            `   ${plugin.usage ? plugin.usage.replace(/\./g, pfx) : `\`${pfx}${cmdName}\``}`,
            ``,
            `◆ *Permission:*  ${permTag}`,
            `◆ *Group:*       ${plugin.group ? '✅ Yes' : '❌ No'}`,
            `◆ *Private:*     ${plugin.private !== false ? '✅ Yes' : '❌ No'}`,
            ...(aliases.length ? [`◆ *Aliases:*     ${aliases.map(a => `\`${pfx}${a}\``).join(' • ')}`] : []),
        ]),
        ``,
        `> _Use \`${pfx}menu\` to browse all commands_`
    ].join('\n');
}

function allCommandNames(plugins) {
    return [...new Set(plugins.flatMap(p => p.commands || []))]
        .map(command => String(command).toLowerCase())
        .sort((a, b) => a.localeCompare(b));
}

function buildAllCommandsMenu(plugins, pfx, requestedPage = 1) {
    const commands = allCommandNames(plugins);
    const pageSize = 80;
    const pageCount = Math.max(1, Math.ceil(commands.length / pageSize));
    const page = Math.min(Math.max(Number.parseInt(requestedPage, 10) || 1, 1), pageCount);
    const start = (page - 1) * pageSize;
    const rows = commands.slice(start, start + pageSize);
    const columns = 3;
    const lines = [];
    for (let i = 0; i < rows.length; i += columns) {
        lines.push(rows.slice(i, i + columns)
            .map(command => `\`${pfx}${command}\``.padEnd(24))
            .join(''));
    }
    const previous = page > 1 ? `\`${pfx}allmenu ${page - 1}\`` : '—';
    const next = page < pageCount ? `\`${pfx}allmenu ${page + 1}\`` : '—';
    return [
        `📚 *${config.BOT_NAME || 'TALHA MD'} — COMPLETE COMMAND DIRECTORY*`,
        `_${commands.length} commands • page ${page}/${pageCount}_`,
        '',
        lines.join('\n'),
        '',
        `◀️ Previous: ${previous}`,
        `▶️ Next: ${next}`,
        '',
        `_Use ${pfx}help <command> for detailed usage._`,
    ].join('\n');
}

// ── Plugin ────────────────────────────────────────────────────────────────────
module.exports = {
    commands:    ['menu', 'help', 'list', 'cmds', 'commands', 'allmenu', 'allcommands', 'commandlist', 'fullmenu'],
    description: 'Show categorized commands or the complete command directory',
    usage:       '.menu | .menu <1-26> | .allmenu [page] | .help <command>',
    permission:  'public',
    group:       true,
    private:     true,
    _buildCategoryMap: buildCategoryMap,

    run: async (sock, message, args, ctx) => {
        const { prefix, contextInfo, safeSend } = ctx;
        const plugins = loadPlugins();
        const categoryMap = buildCategoryMap(plugins);
        const botName = getStr('botName') || config.BOT_NAME || 'TALHA MD';
        const mode    = (config.MODE || 'public').toUpperCase();
        const pfx     = prefix || '.';
        const imgUrl  = getStr('pic1') || config.ALIVE_IMG || 'https://files.catbox.moe/cpm6od.jpg';

        const rawCmd = (
            message.message?.extendedTextMessage?.text ||
            message.message?.conversation || ''
        ).trim().split(/\s+/)[0].replace(/^[^\w]/, '').toLowerCase();

        if (['allmenu', 'allcommands', 'commandlist', 'fullmenu'].includes(rawCmd)) {
            const commands = allCommandNames(plugins);
            const pageCount = Math.max(1, Math.ceil(commands.length / 80));
            const page = Math.min(Math.max(Number.parseInt(args[0], 10) || 1, 1), pageCount);
            const text = buildAllCommandsMenu(plugins, pfx, page);
            return safeSend({ text, contextInfo }, { quoted: message });
        }

        // ── .help <command> ─────────────────────────────────────────────────
        if (rawCmd === 'help' && args.length) {
            const cmdName = args[0].replace(/^\./, '').toLowerCase();
            return safeSend({ text: buildCommandHelp(cmdName, plugins, pfx), contextInfo }, { quoted: message });
        }

        // ── .menu <id|name> — read-more for a specific category ─────────────
        if (args.length) {
            const query = args.join(' ').toLowerCase().trim();

            const byNum  = /^\d+$/.test(query) ? CATEGORIES.find(c => c.id === parseInt(query, 10)) : null;
            const byName = !byNum ? CATEGORIES.find(c => c.name.toLowerCase().includes(query)) : null;
            const cat    = byNum || byName;

            if (cat) {
                return safeSend({ text: buildCategoryMenu(cat, plugins, pfx, categoryMap), contextInfo }, { quoted: message });
            }

            const cmdName = query.replace(/^\./, '');
            const plugin  = plugins.find(p => (p.commands || []).includes(cmdName));
            if (plugin) {
                return safeSend({ text: buildCommandHelp(cmdName, plugins, pfx), contextInfo }, { quoted: message });
            }

            const examples = CATEGORIES.slice(0, 6).map(c => `  \`${pfx}menu ${c.id}\` — ${c.icon} ${c.name}`).join('\n');
            return safeSend({
                text: `❌ *"${query}"* didn't match any category or command.\n\n📋 *Try:*\n${examples}\n\nOr use \`${pfx}menu\` for the full overview.`,
                contextInfo
            }, { quoted: message });
        }

        // ── .menu — compact overview ─────────────────────────────────────────
        const menuText = buildCompactMenu(plugins, pfx, botName, mode, categoryMap);

        // Send the Robot branded image and text menu
        const localHero = path.join(__dirname, '../assets/talha_md_hero.jpg');
        const heroBuffer = fs.existsSync(localHero) ? fs.readFileSync(localHero) : null;
        try {
            const imgPayload = heroBuffer ? { image: heroBuffer } : { image: { url: imgUrl } };
            await safeSend({ ...imgPayload, caption: menuText, contextInfo }, { quoted: message });
            await safeSend({ text: `⚡ *Quick actions:* ${pfx}allmenu 1 • ${pfx}menu 3 • ${pfx}menu 6`, contextInfo }, { quoted: message });
        } catch {
            await safeSend({ text: menuText, contextInfo }, { quoted: message });
        }
    }
};
