/**
 * Election Companion AI — Cloud Run Backend & Static Server
 *
 * Responsibilities:
 *   1. Serves the static frontend (index.html, styles.css, app.js, …)
 *   2. POST /processChat — dual-provider AI (Gemini primary, Vertex AI fallback)
 *   3. In-memory sliding-window rate limiter
 *   4. Server-side input sanitisation & length enforcement
 *   5. Non-blocking Firestore conversation logging
 *
 * Environment variables (see .env):
 *   PORT              — HTTP port (default: 8080)
 *   GEMINI_API_KEY    — Google AI Studio API key
 *
 * GCP credentials for Vertex AI and Firebase Admin are resolved
 * automatically via the Cloud Run service account (ADC).
 */

'use strict';

const express    = require('express');
const cors       = require('cors');
const path       = require('path');
const admin      = require('firebase-admin');
const { GoogleGenAI } = require('@google/genai');
const { VertexAI }    = require('@google-cloud/vertexai');
require('dotenv').config();

// ─── Constants ────────────────────────────────────────────────────────────────

const PORT                   = process.env.PORT || 8080;
const GCP_PROJECT            = 'voting-assistant-c1265';
const VERTEX_LOCATION        = 'us-central1';
const GEMINI_MODEL           = 'gemini-2.5-flash';
const VERTEX_MODEL           = 'gemini-1.5-flash';
const RATE_LIMIT_WINDOW_MS   = 60_000;          // 1 minute sliding window
const MAX_REQUESTS_PER_WINDOW = 20;              // max requests per window per IP
const MAX_MESSAGE_LENGTH     = 2_000;           // characters — matches frontend maxlength

/** Civic-focused system prompt enforcing non-partisan, factual responses. */
const SYSTEM_INSTRUCTION = `\
You are the "Election Companion AI" — an intelligent, neutral, and context-aware civic assistant.
Your goal is to guide users through election processes, voter eligibility, timelines, and registration
procedures securely and efficiently.

RULES:
1. Always remain strictly non-partisan and apolitical.
2. Provide factual guidance based on verified electoral processes.
3. If a user asks about eligibility, suggest they use the "Eligibility Checker" tool.
4. If a user asks about registration steps, suggest they use the "Election Wizard".
5. Keep responses concise, well-structured, and formatted with Markdown.
6. Always provide logical next-step suggestions.
7. Refuse to discuss unrelated political opinions or candidate endorsements.
`;

// ─── App & Middleware ──────────────────────────────────────────────────────────

const app = express();

app.use(cors());
app.use(express.json({ limit: '50kb' }));                  // Prevent oversized payloads
app.use(express.static(path.join(__dirname, './')));        // Serve frontend from root

// ─── Firebase Admin ────────────────────────────────────────────────────────────

admin.initializeApp({ projectId: GCP_PROJECT });
const db = admin.firestore();

// ─── Rate Limiter ──────────────────────────────────────────────────────────────

/** @type {Map<string, {windowStart: number, count: number}>} */
const rateLimitMap = new Map();

/**
 * Sliding-window in-memory rate limiter.
 * Returns true if the given IP has exceeded the request quota.
 *
 * @param {string} ip - Client IP address
 * @returns {boolean} Whether the request should be rejected
 */
function isRateLimited(ip) {
    const now    = Date.now();
    const record = rateLimitMap.get(ip);

    if (!record || now - record.windowStart > RATE_LIMIT_WINDOW_MS) {
        rateLimitMap.set(ip, { windowStart: now, count: 1 });
        return false;
    }

    record.count += 1;
    return record.count > MAX_REQUESTS_PER_WINDOW;
}

// ─── Input Sanitisation ────────────────────────────────────────────────────────

/**
 * Strips HTML tags, trims whitespace, and enforces max length.
 * Prevents prompt injection and XSS reaching the AI layer.
 *
 * @param {unknown} raw - Raw input from request body
 * @returns {string} Sanitised, length-capped string
 */
function sanitizeInput(raw) {
    if (typeof raw !== 'string') return '';
    return raw
        .replace(/<[^>]*>/g, '')   // strip HTML tags
        .replace(/[^\x20-\x7E\u00A0-\uFFFF]/g, ' ') // keep printable chars
        .trim()
        .slice(0, MAX_MESSAGE_LENGTH);
}

// ─── FAQ Cache Helper ──────────────────────────────────────────────────────────

/**
 * Attempts a fast Firestore FAQ lookup before hitting the AI.
 * Uses the first word of the query as the array-contains index key.
 *
 * @param {string} query - Lower-cased, sanitised user message
 * @returns {Promise<string|null>} Cached answer or null if not found
 */
async function checkFaqCache(query) {
    try {
        const keyword  = query.split(' ')[0];
        const snapshot = await db.collection('faqs')
            .where('keywords', 'array-contains', keyword)
            .limit(1)
            .get();

        if (!snapshot.empty) {
            return snapshot.docs[0].data().answer || null;
        }
    } catch (err) {
        console.warn('[FAQ Cache] Lookup failed:', err.message);
    }
    return null;
}

// ─── AI Providers ─────────────────────────────────────────────────────────────

/**
 * Queries the Gemini API (primary provider).
 *
 * @param {string} message - Sanitised user message
 * @returns {Promise<string>} AI-generated response text
 */
async function queryGemini(message) {
    const ai   = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const chat = ai.chats.create({
        model:  GEMINI_MODEL,
        config: { systemInstruction: SYSTEM_INSTRUCTION, temperature: 0.2 },
    });
    const result = await chat.sendMessage({ message });
    return result.text;
}

/**
 * Queries Vertex AI (fallback provider when Gemini is unavailable).
 *
 * @param {string} message - Sanitised user message
 * @returns {Promise<string>} AI-generated response text
 */
async function queryVertex(message) {
    const vertex = new VertexAI({ project: GCP_PROJECT, location: VERTEX_LOCATION });
    const model  = vertex.getGenerativeModel({
        model:             VERTEX_MODEL,
        systemInstruction: SYSTEM_INSTRUCTION,
        generationConfig:  { temperature: 0.2 },
    });
    const vResult = await model.generateContent(message);
    return vResult.response.candidates[0].content.parts[0].text;
}

/**
 * Logs a conversation turn to Firestore (fire-and-forget, non-blocking).
 *
 * @param {string} userMessage
 * @param {string} botReply
 * @param {string} source - 'gemini-api' | 'vertex-ai' | 'cache'
 */
function logConversation(userMessage, botReply, source) {
    db.collection('conversations').add({
        userMessage,
        botReply,
        source,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
    }).catch(err => console.error('[Firestore Log] Failed:', err.message));
}

// ─── API Endpoint ──────────────────────────────────────────────────────────────

/**
 * POST /processChat
 *
 * Request body:  { data: { message: string } }  OR  { message: string }
 * Response body: { reply: string, status: string, source: string }
 *
 * HTTP status codes:
 *   200 — Success
 *   400 — Missing or empty message
 *   429 — Rate limit exceeded
 *   500 — AI provider failure
 */
app.post('/processChat', async (req, res) => {
    // 1. Rate limiting
    const clientIp = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    if (isRateLimited(clientIp)) {
        return res.status(429).json({
            reply:  '⚠️ Too many requests. Please wait a moment before trying again.',
            status: 'rate_limited',
        });
    }

    // 2. Extract & validate message
    const rawMessage = req.body?.data?.message ?? req.body?.message;
    if (!rawMessage) {
        return res.status(400).json({ error: 'Message field is required.' });
    }

    const message = sanitizeInput(rawMessage);
    if (!message) {
        return res.status(400).json({ error: 'Message must contain printable characters.' });
    }

    try {
        // 3. Check Firestore FAQ cache (fastest path)
        const cachedReply = await checkFaqCache(message.toLowerCase());
        if (cachedReply) {
            logConversation(message, cachedReply, 'cache');
            return res.json({ reply: cachedReply, status: 'success', source: 'cache' });
        }

        // 4. Try Gemini (primary)
        let reply, source;
        try {
            reply  = await queryGemini(message);
            source = 'gemini-api';
        } catch (geminiErr) {
            console.warn('[AI] Gemini failed, falling back to Vertex AI:', geminiErr.message);

            // 5. Fallback to Vertex AI
            try {
                reply  = await queryVertex(message);
                source = 'vertex-ai';
            } catch (vertexErr) {
                console.error('[AI] Vertex AI also failed:', vertexErr.message);
                throw vertexErr;   // Bubble up to outer catch → 500
            }
        }

        // 6. Log & respond
        logConversation(message, reply, source);
        return res.json({ reply, status: 'success', source });

    } catch (error) {
        console.error('[/processChat] Fatal error — message:', error.message);
        console.error('[/processChat] Stack:', error.stack);
        return res.status(500).json({
            reply:  '⚠️ A connection error occurred. Please try again in a moment.',
            status: 'error',
        });
    }
});

// ─── Health Check ──────────────────────────────────────────────────────────────

/**
 * GET /health
 * Lightweight liveness probe for Cloud Run / load balancers.
 */
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'election-companion-ai', timestamp: new Date().toISOString() });
});

// ─── Start Server ──────────────────────────────────────────────────────────────

app.listen(PORT, () => {
    console.log(`[Server] Election Companion AI running on port ${PORT}`);
});

module.exports = app; // Allow import in integration tests
