'use strict';
const axios = require('axios');
const { fmt } = require('../lib/theme');

const LOCAL_JOKES = {
    programming: [
        'Why do programmers prefer dark mode?\nBecause light attracts bugs! 🐛',
        'A SQL query walks into a bar, walks up to two tables and asks:\n"Can I join you?" 🍺',
        'There are only 10 kinds of people in this world:\nThose who understand binary and those who don\'t. 💻',
        'Why do Java developers wear glasses?\nBecause they don\'t C#! 👓',
        'How many programmers does it take to change a light bulb?\nNone — that\'s a hardware problem! 💡',
        'What\'s a programmer\'s favorite hangout place?\nFoo Bar! 🍻',
        '"Knock, knock."\n"Who\'s there?"\n*very long pause…*\n"Java." ☕',
        'Why was the JavaScript developer sad?\nBecause he didn\'t Node how to Express himself! 😢',
    ],
    pun: [
        'I\'m reading a book on anti-gravity.\nIt\'s impossible to put down! 📚',
        'Parallel lines have so much in common.\nIt\'s a shame they\'ll never meet. 📐',
        'I used to play piano by ear, now I use my hands. 🎹',
        'What do you call a fake noodle?\nAn impasta! 🍝',
        'Why don\'t skeletons fight each other?\nThey don\'t have the guts! 💀',
        'I told my wife she was drawing her eyebrows too high.\nShe looked surprised! 😲',
    ],
    dark: [
        'My grief counselor died.\nHe was so good, I don\'t even care. 🖤',
        'Give a man a match, and he\'ll be warm for a few hours.\nSet a man on fire, and he will be warm for the rest of his life. 🔥',
        'I have a joke about trickle-down economics.\nBut 99% of you will never get it. 💸',
    ],
    misc: [
        'Why don\'t scientists trust atoms?\nBecause they make up everything! ⚛️',
        'What did the ocean say to the beach?\nNothing, it just waved! 🌊',
        'Why did the scarecrow win an award?\nBecause he was outstanding in his field! 🌾',
        'What do you call a bear with no teeth?\nA gummy bear! 🐻',
        'Why did the bicycle fall over?\nBecause it was two-tired! 🚲',
        'What do you call cheese that isn\'t yours?\nNacho cheese! 🧀',
    ],
};

function pickLocalJoke(cat) {
    const key = String(cat || 'any').toLowerCase();
    const pool = LOCAL_JOKES[key] || Object.values(LOCAL_JOKES).flat();
    return { category: key === 'any' ? 'General' : key, text: pool[Math.floor(Math.random() * pool.length)] };
}

module.exports = {
    commands:    ['joke', 'jokes'],
    description: 'Get a random joke',
    usage:       '.joke [category]  — any, programming, misc, dark, pun',
    permission:  'public',
    group:       true,
    private:     true,

    run: async (sock, message, args, ctx) => {
        const { contextInfo } = ctx;
        const jid = ctx.jid || message.key.remoteJid;
        const valid = ['any', 'programming', 'misc', 'dark', 'pun', 'spooky', 'christmas'];
        const cat = args[0] && valid.includes(args[0].toLowerCase()) ? args[0].toLowerCase() : 'Any';

        // 1. Try JokeAPI
        try {
            const res  = await axios.get(`https://v2.jokeapi.dev/joke/${cat}`, {
                params: { blacklistFlags: 'racist,sexist' },
                timeout: 7000,
                headers: { 'User-Agent': 'TALHA-MD-Bot/2.0' }
            });
            const data = res.data;
            if (!data.error) {
                const jokeText = data.type === 'twopart'
                    ? `😂 *Joke* _(${data.category})_\n\n❓ ${data.setup}\n\n💬 ${data.delivery}`
                    : `😂 *Joke* _(${data.category})_\n\n${data.joke}`;
                return await sock.sendMessage(jid, { text: fmt(jokeText), contextInfo }, { quoted: message });
            }
        } catch {}

        // 2. Try icanhazdadjoke (if general/any/pun)
        if (cat === 'Any' || cat === 'pun' || cat === 'misc') {
            try {
                const res = await axios.get('https://icanhazdadjoke.com/', {
                    headers: { Accept: 'application/json', 'User-Agent': 'TALHA-MD-Bot/2.0 (https://github.com/talhahafiz236/talha-md)' },
                    timeout: 6000
                });
                if (res.data?.joke) {
                    return await sock.sendMessage(jid, {
                        text: fmt(`😂 *Joke*\n\n${res.data.joke}`),
                        contextInfo
                    }, { quoted: message });
                }
            } catch {}
        }

        // 3. Guaranteed local joke fallback
        const local = pickLocalJoke(cat);
        await sock.sendMessage(jid, {
            text: fmt(`😂 *Joke* _(${local.category})_\n\n${local.text}`),
            contextInfo
        }, { quoted: message });
    }
};
