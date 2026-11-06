const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

class GeminiService {
  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY;
    if (this.apiKey) {
      this.genAI = new GoogleGenerativeAI(this.apiKey);
      const systemInstruction = "You are TALHA-MD, the ultimate WhatsApp AI hero bot. You are sharp, witty, energetic, smart, and friendly with a cool superhero style humor. You speak in natural, engaging Roman Urdu / Urdu / Hindi with smart English slang. You are loyal, respectful, and helpful to your master 'Talha Sheikh', and witty, clever, and confident with everyone else. Keep replies concise, punchy, and WhatsApp-friendly. Zero gangster or thug vibes.";
      
      // Primary model: gemini-3.5-flash-lite (ultra fast, rock solid)
      this.primaryModel = this.genAI.getGenerativeModel({
        model: 'gemini-3.5-flash-lite',
        systemInstruction
      });

      // Secondary fallback models
      this.fallbackModel1 = this.genAI.getGenerativeModel({
        model: 'gemini-3.6-flash',
        systemInstruction
      });

      this.fallbackModel2 = this.genAI.getGenerativeModel({
        model: 'gemini-3.5-flash',
        systemInstruction
      });
    } else {
      console.warn('[Gemini] Warning: GEMINI_API_KEY is not set.');
    }
  }

  async ask(prompt) {
    if (!this.primaryModel) return "⚠️ AI API Key not configured in .env";
    
    // Attempt 1: gemini-3.5-flash-lite
    try {
      const result = await this.primaryModel.generateContent(prompt);
      return (await result.response).text().trim();
    } catch (e1) {
      console.warn('[AI] Primary (gemini-3.5-flash-lite) failed, trying fallback 1 (gemini-3.6-flash)...', e1.message);
    }

    // Attempt 2: gemini-3.6-flash
    try {
      const result = await this.fallbackModel1.generateContent(prompt);
      return (await result.response).text().trim();
    } catch (e2) {
      console.warn('[AI] Fallback 1 failed, trying fallback 2 (gemini-3.5-flash)...', e2.message);
    }

    // Attempt 3: gemini-3.5-flash
    try {
      const result = await this.fallbackModel2.generateContent(prompt);
      return (await result.response).text().trim();
    } catch (e3) {
      console.error('[AI] All models failed:', e3.message);
      return `❌ AI temporary issue: Please try again in a few seconds!`;
    }
  }

  async roast(targetText) {
    const prompt = `A user said: "${targetText}". Give them a clever, funny, sarcastic comeback in witty Roman Urdu like superhero banter! Max 2-3 lines. Include fun emojis. Clean and humorous, no gangster slang.`;
    return this.ask(prompt);
  }

  async detectLie(targetText) {
    const prompt = `Analyze this message for honesty / lie detection: "${targetText}". Give a funny lie-detector percentage (e.g. 85% Jhoot, 15% Sach) and a clever, humorous commentary in Roman Urdu with superhero wit. Max 3-4 lines.`;
    return this.ask(prompt);
  }

  async summarize(messages) {
    const prompt = `Summarize these WhatsApp chat messages into a funny, crisp bullet-point summary in Roman Urdu:\n\n${messages}`;
    return this.ask(prompt);
  }
}

module.exports = new GeminiService();
