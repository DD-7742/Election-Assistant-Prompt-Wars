/**
 * Election Companion AI — Cloud Run Backend & Static Server
 * 
 * This server handles:
 *   1. Serving the frontend (index.html, styles.css, app.js, etc.)
 *   2. The /processChat API endpoint with Dual AI (Gemini + Vertex AI)
 *   3. Rate limiting and security sanitization
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const admin = require('firebase-admin');
const { GoogleGenAI } = require('@google/genai');
const { VertexAI } = require('@google-cloud/vertexai');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 8080;

// Initialize Firebase Admin (uses Default Service Account credentials on Cloud Run)
admin.initializeApp({
    projectId: 'voting-assistant-c1265'
});
const db = admin.firestore();

// ─── Middleware ─────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, './'))); // Serve static files from root

// ─── Rate Limiter (in-memory token bucket) ──────────────────────────────────
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 20;

function isRateLimited(ip) {
    const now = Date.now();
    const record = rateLimitMap.get(ip);
    if (!record || now - record.windowStart > RATE_LIMIT_WINDOW_MS) {
        rateLimitMap.set(ip, { windowStart: now, count: 1 });
        return false;
    }
    record.count += 1;
    return record.count > MAX_REQUESTS_PER_WINDOW;
}

// ─── AI Config ──────────────────────────────────────────────────────────────
const SYSTEM_INSTRUCTION = `
You are the "Election Companion AI" — an intelligent, neutral, and context-aware civic assistant.
Your goal is to guide users through the election processes, voter eligibility, timelines,
and registration procedures securely and efficiently.

RULES:
1. Always remain strictly non-partisan and apolitical.
2. Provide factual guidance based on verified electoral processes.
3. If a user asks about eligibility, suggest they use the "Eligibility Checker" tool.
4. If a user asks about registration steps, suggest they look at the "Election Wizard".
5. Keep your responses concise, highly structured, and use Markdown.
6. Provide logical next-step suggestions.
`;

// ─── Sanitization ───────────────────────────────────────────────────────────
function sanitizeInput(raw) {
    return (raw || '').replace(/<[^>]*>/g, '').trim().slice(0, 2000);
}

// ─── FAQ Cache Helper ───────────────────────────────────────────────────────
async function checkFaqCache(query) {
    try {
        const snapshot = await db.collection('faqs')
            .where('keywords', 'array-contains', query.split(' ')[0])
            .limit(1)
            .get();
        if (!snapshot.empty) return snapshot.docs[0].data().answer;
    } catch (err) {
        console.warn('FAQ cache error:', err.message);
    }
    return null;
}

// ─── API Endpoint ───────────────────────────────────────────────────────────
app.post('/processChat', async (req, res) => {
    const clientIp = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    if (isRateLimited(clientIp)) {
        return res.status(429).json({ reply: '⚠️ Too many requests. Please wait.', status: 'rate_limited' });
    }

    try {
        const rawMessage = req.body?.data?.message || req.body?.message;
        if (!rawMessage) return res.status(400).json({ error: 'Message required' });

        const message = sanitizeInput(rawMessage);

        // 1. Check FAQ Cache
        const cachedReply = await checkFaqCache(message.toLowerCase());
        if (cachedReply) return res.json({ reply: cachedReply, status: 'success', source: 'cache' });

        // 2. Try Gemini API (Primary)
        let reply, source;
        try {
            const geminiAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
            const chat = geminiAI.chats.create({
                model: 'gemini-2.5-flash',
                config: { systemInstruction: SYSTEM_INSTRUCTION, temperature: 0.2 }
            });
            const result = await chat.sendMessage({ message });
            reply = result.text;
            source = 'gemini-api';
        } catch (err) {
            console.warn('Gemini API failed, falling back to Vertex AI:', err.message);
            
            // 3. Fallback to Vertex AI (Official SDK)
            const vertex = new VertexAI({ project: 'voting-assistant-c1265', location: 'us-central1' });
            const model = vertex.getGenerativeModel({
                model: 'gemini-1.5-flash',
                systemInstruction: SYSTEM_INSTRUCTION,
                generationConfig: { temperature: 0.2 }
            });
            const vResult = await model.generateContent(message);
            reply = vResult.response.candidates[0].content.parts[0].text;
            source = 'vertex-ai';
        }

        // Log to Firestore (non-blocking)
        db.collection('conversations').add({
            userMessage: message,
            botReply: reply,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            source
        }).catch(e => console.error('Logging failed:', e));

        res.json({ reply, status: 'success', source });

    } catch (error) {
        console.error('Final failure — message:', error.message);
        console.error('Final failure — stack:', error.stack);
        res.status(500).json({ reply: '⚠️ Connection error. Please try again later.', status: 'error' });
    }
});

// Start Server
app.listen(port, () => {
    console.log(`Election Companion AI running on port ${port}`);
});
