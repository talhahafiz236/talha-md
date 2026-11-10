'use strict';

const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');
if (require('fs').existsSync('.env')) require('dotenv').config({ override: false });
if (require('fs').existsSync('config.env')) require('dotenv').config({ path: './config.env', override: false });

const SYSTEM_INSTRUCTION =
    "You are TALHA-MD, the ultimate WhatsApp AI hero bot engineered for Talha Sheikh. " +
    "You are sharp, witty, energetic, smart, and friendly. Keep replies concise, punchy, and WhatsApp-friendly.";

const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];

async function callChAt(prompt) {
    const res = await axios.get('https://ch.at/', {
        params: { q: String(prompt).slice(0, 4000) },
        headers: {
            Accept: 'text/plain',
            'User-Agent': 'TALHAMD-Bot/2.0',
        },
        timeout: 15000,
    });
    const raw = typeof res.data === 'string' ? res.data : '';
    if (!raw || /<!DOCTYPE|<html/i.test(raw)) {
        throw new Error('ch.at returned HTML instead of text');
    }
    const answer = raw.match(/(?:^|\n)A:\s*([\s\S]*)$/i)?.[1]?.trim() || raw.trim();
    const cleaned = answer.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
    if (!cleaned || cleaned.length < 2) throw new Error('ch.at returned empty response');
    return cleaned;
}

async function callPollinations(prompt) {
    const res = await axios.get(
        `https://text.pollinations.ai/${encodeURIComponent(String(prompt).slice(0, 1500))}`,
        {
            params: { model: 'openai', seed: Date.now() % 99999 },
            headers: { Accept: 'text/plain', 'User-Agent': 'TALHAMD-Bot/2.0' },
            timeout: 18000,
        }
    );
    const text = typeof res.data === 'string' ? res.data.trim() : '';
    if (!text || /<!DOCTYPE|<html/i.test(text)) {
        throw new Error('Pollinations returned invalid text');
    }
    return text;
}

class GeminiService {
    constructor() {
        this.apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_KEY || '';
        this.genAI = this.apiKey ? new GoogleGenerativeAI(this.apiKey) : null;
    }

    getGenAI() {
        const currentKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_KEY || this.apiKey || '';
        if (!currentKey) return null;
        if (!this.genAI || currentKey !== this.apiKey) {
            this.apiKey = currentKey;
            this.genAI = new GoogleGenerativeAI(currentKey);
        }
        return this.genAI;
    }

    async ask(prompt, systemInstruction = SYSTEM_INSTRUCTION) {
        const cleanPrompt = String(prompt || '').trim();
        if (!cleanPrompt) throw new Error('Prompt is empty');

        const genAI = this.getGenAI();
        if (genAI) {
            for (const modelName of GEMINI_MODELS) {
                try {
                    const model = genAI.getGenerativeModel({
                        model: modelName,
                        systemInstruction,
                    });
                    const result = await model.generateContent(cleanPrompt);
                    const text = (await result.response).text().trim();
                    if (text) return text;
                } catch (err) {
                    console.warn(`[Gemini:${modelName}] failed: ${err.message}`);
                }
            }
        }

        // Keyless fallback 1: ch.at GET text/plain
        try {
            const ctxPrompt = `${systemInstruction}\n\nUser: ${cleanPrompt}\nAssistant:`;
            return await callChAt(ctxPrompt);
        } catch (err) {
            console.warn(`[Gemini fallback ch.at] failed: ${err.message}`);
        }

        // Keyless fallback 2: text.pollinations.ai GET
        try {
            return await callPollinations(`${systemInstruction}\n\n${cleanPrompt}`);
        } catch (err) {
            console.warn(`[Gemini fallback pollinations] failed: ${err.message}`);
        }

        throw new Error('All AI providers are temporarily busy. Please try again in a moment.');
    }

    async analyzeImage(imgBuffer, prompt = 'Describe this image in detail.', mimeType = 'image/jpeg') {
        const genAI = this.getGenAI();
        if (!genAI) return null;
        const base64 = imgBuffer.toString('base64');
        for (const modelName of GEMINI_MODELS) {
            try {
                const model = genAI.getGenerativeModel({ model: modelName });
                const result = await model.generateContent([
                    prompt,
                    { inlineData: { data: base64, mimeType } },
                ]);
                const text = (await result.response).text().trim();
                if (text) return text;
            } catch (err) {
                console.warn(`[Gemini Vision:${modelName}] failed: ${err.message}`);
            }
        }
        return null;
    }

    async roast(targetText) {
        const prompt = `A user said: "${targetText}". Give them a clever, funny, sarcastic comeback in witty Roman Urdu like superhero banter! Max 2-3 lines. Include fun emojis. Clean and humorous.`;
        return this.ask(prompt);
    }

    async detectLie(targetText) {
        const prompt = `Analyze this message for honesty / lie detection: "${targetText}". Give a funny lie-detector percentage (e.g. 85% Jhoot, 15% Sach) and a clever, humorous commentary in Roman Urdu. Max 3-4 lines.`;
        return this.ask(prompt);
    }

    async summarize(messages) {
        const prompt = `Summarize these WhatsApp chat messages into crisp bullet points:\n\n${messages}`;
        return this.ask(prompt);
    }
}

const instance = new GeminiService();
instance.callChAt = callChAt;
instance.callPollinations = callPollinations;
module.exports = instance;
