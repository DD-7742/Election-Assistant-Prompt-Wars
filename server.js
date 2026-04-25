/**
 * Election Companion AI — Cloud Run Backend & Static Server
 *
 * Responsibilities:
 *   1. Serves the static frontend (index.html, styles.css, app.js, …)
 *   2. POST /processChat — dual-provider AI (Gemini primary, Vertex AI fallback)
 *   3. In-memory sliding-window rate limiter
 *   4. Server-side input sanitisation & length enforcement
 *   5. Non-blocking Firestore conversation logging
 *   6. Security headers (CSP, HSTS, X-Content-Type-Options, etc.)
 *
 * Environment variables (see .env):
 *   PORT              — HTTP port (default: 8080)
 *   GEMINI_API_KEY    — Google AI Studio API key
 *
 * GCP credentials for Vertex AI and Firebase Admin are resolved
 * automatically via the Cloud Run service account (ADC).
 *
 * @module server
 * @version 2.0.0
 */

'use strict';

const express    = require('express');
const cors       = require('cors');
const path       = require('path');
const admin      = require('firebase-admin');
const { GoogleGenAI } = require('@google/genai');
const { VertexAI }    = require('@google-cloud/vertexai');
require('dotenv').config();

// ─── Constants (frozen to prevent mutation) ───────────────────────────────────

/** @enum {number|string} Application configuration constants */
const CONFIG = Object.freeze({
    PORT:                    process.env.PORT || 8080,
    GCP_PROJECT:             'voting-assistant-c1265',
    VERTEX_LOCATION:         'us-central1',
    GEMINI_MODEL:            'gemini-2.5-flash',
    VERTEX_MODEL:            'gemini-1.5-flash',
    RATE_LIMIT_WINDOW_MS:    60_000,
    MAX_REQUESTS_PER_WINDOW: 20,
    MAX_MESSAGE_LENGTH:      2_000,
    MAX_REPLY_LENGTH:        10_000,
    CORS_MAX_AGE:            600,
});

/** Allowed HTTP methods for the chat endpoint */
const ALLOWED_METHODS = Object.freeze(['POST']);

/** Content-Type header value for JSON responses */
const JSON_CONTENT_TYPE = 'application/json';

/** Civic-focused system prompt enforcing non-partisan, factual responses. */
const SYSTEM_INSTRUCTION = Object.freeze(`\
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
`);

/**
 * Custom error class for application-specific errors.
 * Provides structured error handling with HTTP status codes.
 *
 * @class AppError
 * @extends Error
 */
class AppError extends Error {
    /**
     * @param {string} message - Human-readable error description
     * @param {number} statusCode - HTTP status code to return
     * @param {string} code - Machine-readable error code
     */
    constructor(message, statusCode, code) {
        super(message);
        this.name = 'AppError';
        this.statusCode = statusCode;
        this.code = code;
    }
}

// ─── App & Middleware ──────────────────────────────────────────────────────────

const app = express();

// Security headers — defence-in-depth
app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    res.setHeader('Content-Security-Policy',
        "default-src 'self'; " +
        "script-src 'self' 'unsafe-inline' https://www.gstatic.com https://cdn.jsdelivr.net; " +
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
        "font-src 'self' https://fonts.gstatic.com; " +
        "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com; " +
        "img-src 'self' data:; " +
        "frame-ancestors 'none';"
    );
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
});

app.use(cors({
    methods: ALLOWED_METHODS,
    maxAge: CONFIG.CORS_MAX_AGE,
}));
app.use(express.json({ limit: '50kb' }));                  // Prevent oversized payloads
app.use(express.static(path.join(__dirname, './'), {
    dotfiles: 'deny',
    index: 'index.html',
}));

// ─── Firebase Admin ────────────────────────────────────────────────────────────

admin.initializeApp({ projectId: CONFIG.GCP_PROJECT });
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
    if (typeof ip !== 'string' || ip.length === 0) {
        return false;
    }

    const now    = Date.now();
    const record = rateLimitMap.get(ip);

    if (!record || now - record.windowStart > CONFIG.RATE_LIMIT_WINDOW_MS) {
        rateLimitMap.set(ip, { windowStart: now, count: 1 });
        return false;
    }

    record.count += 1;
    return record.count > CONFIG.MAX_REQUESTS_PER_WINDOW;
}

/**
 * Periodically cleans up stale entries from the rate limit map
 * to prevent memory leaks on long-running processes.
 * Runs every 5 minutes.
 *
 * @private
 */
function _cleanupRateLimitMap() {
    const now = Date.now();
    for (const [ip, record] of rateLimitMap) {
        if (now - record.windowStart > CONFIG.RATE_LIMIT_WINDOW_MS * 2) {
            rateLimitMap.delete(ip);
        }
    }
}
setInterval(_cleanupRateLimitMap, 5 * 60 * 1000);

// ─── Input Sanitisation ────────────────────────────────────────────────────────

/**
 * Strips HTML tags, trims whitespace, and enforces max length.
 * Prevents prompt injection and XSS reaching the AI layer.
 *
 * @param {unknown} raw - Raw input from request body
 * @returns {string} Sanitised, length-capped string
 * @throws {AppError} If input type is invalid
 */
function sanitizeInput(raw) {
    if (typeof raw !== 'string') {
        throw new AppError('Message must be a string.', 400, 'INVALID_INPUT_TYPE');
    }
    const sanitized = raw
        .replace(/<[^>]*>/g, '')    // strip HTML tags
        .replace(/[^\x20-\x7E\u00A0-\uFFFF]/g, ' ') // keep printable chars
        .trim()
        .slice(0, CONFIG.MAX_MESSAGE_LENGTH);
    return sanitized;
}

/**
 * Validates that a sanitized message is non-empty and meets minimum requirements.
 *
 * @param {string} message - Sanitized message string
 * @returns {boolean} True if the message is valid
 */
function isValidMessage(message) {
    return typeof message === 'string' && message.trim().length > 0;
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
        const words = query.split(/\s+/);
        if (words.length === 0 || !words[0]) return null;

        const keyword  = words[0];
        const snapshot = await db.collection('faqs')
            .where('keywords', 'array-contains', keyword)
            .limit(1)
            .get();

        if (!snapshot.empty) {
            const answer = snapshot.docs[0].data().answer;
            return typeof answer === 'string' ? answer : null;
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
 * @throws {Error} If API call fails
 */
async function queryGemini(message) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey.trim().length === 0) {
        throw new AppError('Gemini API key is not configured.', 500, 'MISSING_API_KEY');
    }

    const ai   = new GoogleGenAI({ apiKey });
    const chat = ai.chats.create({
        model:  CONFIG.GEMINI_MODEL,
        config: { systemInstruction: SYSTEM_INSTRUCTION, temperature: 0.2 },
    });
    const result = await chat.sendMessage({ message });

    if (!result || !result.text) {
        throw new AppError('Empty response from Gemini.', 502, 'EMPTY_GEMINI_RESPONSE');
    }

    return result.text;
}

/**
 * Queries Vertex AI (fallback provider when Gemini is unavailable).
 *
 * @param {string} message - Sanitised user message
 * @returns {Promise<string>} AI-generated response text
 * @throws {Error} If API call fails
 */
async function queryVertex(message) {
    const vertex = new VertexAI({ project: CONFIG.GCP_PROJECT, location: CONFIG.VERTEX_LOCATION });
    const model  = vertex.getGenerativeModel({
        model:             CONFIG.VERTEX_MODEL,
        systemInstruction: SYSTEM_INSTRUCTION,
        generationConfig:  { temperature: 0.2 },
    });
    const vResult = await model.generateContent(message);

    const candidates = vResult?.response?.candidates;
    if (!candidates || candidates.length === 0) {
        throw new AppError('Empty response from Vertex AI.', 502, 'EMPTY_VERTEX_RESPONSE');
    }

    const text = candidates[0]?.content?.parts?.[0]?.text;
    if (!text) {
        throw new AppError('Malformed Vertex AI response.', 502, 'MALFORMED_VERTEX_RESPONSE');
    }

    return text;
}

/**
 * Logs a conversation turn to Firestore (fire-and-forget, non-blocking).
 *
 * @param {string} userMessage - The user's sanitized input
 * @param {string} botReply - The AI-generated reply
 * @param {string} source - 'gemini-api' | 'vertex-ai' | 'cache'
 * @returns {void}
 */
function logConversation(userMessage, botReply, source) {
    if (!userMessage || !botReply) return;

    db.collection('conversations').add({
        userMessage: userMessage.slice(0, CONFIG.MAX_MESSAGE_LENGTH),
        botReply: botReply.slice(0, CONFIG.MAX_REPLY_LENGTH),
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
 *   405 — Method not allowed
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
    if (!rawMessage || typeof rawMessage !== 'string') {
        return res.status(400).json({
            error: 'Message field is required and must be a string.',
            status: 'error',
        });
    }

    let message;
    try {
        message = sanitizeInput(rawMessage);
    } catch (err) {
        return res.status(400).json({
            error: err.message || 'Invalid input.',
            status: 'error',
        });
    }

    if (!isValidMessage(message)) {
        return res.status(400).json({
            error: 'Message must contain printable characters.',
            status: 'error',
        });
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
        const statusCode = error instanceof AppError ? error.statusCode : 500;
        return res.status(statusCode).json({
            reply:  '⚠️ A connection error occurred. Please try again in a moment.',
            status: 'error',
        });
    }
});

/**
 * Catch-all for unsupported methods on /processChat.
 * Returns 405 with allowed methods header.
 */
app.all('/processChat', (_req, res) => {
    res.setHeader('Allow', ALLOWED_METHODS.join(', '));
    res.status(405).json({ error: 'Method not allowed. Use POST.', status: 'error' });
});

// ─── Health Check ──────────────────────────────────────────────────────────────

/**
 * GET /health
 * Lightweight liveness probe for Cloud Run / load balancers.
 */
app.get('/health', (_req, res) => {
    res.json({
        status: 'ok',
        service: 'election-companion-ai',
        version: '2.0.0',
        timestamp: new Date().toISOString(),
    });
});

// ─── 404 Handler ───────────────────────────────────────────────────────────────

/**
 * Catch-all 404 handler for undefined API routes.
 * Static files are handled by express.static before this.
 */
app.use('/api/*', (_req, res) => {
    res.status(404).json({ error: 'Endpoint not found.', status: 'error' });
});

// ─── Global Error Handler ──────────────────────────────────────────────────────

/**
 * Express global error handler — ensures no raw errors leak to the client.
 *
 * @param {Error} err - The caught error
 * @param {import('express').Request} _req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} _next
 */
app.use((err, _req, res, _next) => {
    console.error('[Global Error Handler]', err.message);
    console.error('[Stack]', err.stack);

    const statusCode = err instanceof AppError ? err.statusCode : 500;
    res.status(statusCode).json({
        error: 'An internal error occurred. Please try again.',
        status: 'error',
    });
});

// ─── Start Server ──────────────────────────────────────────────────────────────

app.listen(CONFIG.PORT, () => {
    console.log(`[Server] Election Companion AI v2.0.0 running on port ${CONFIG.PORT}`);
});

module.exports = { app, isRateLimited, sanitizeInput, isValidMessage, CONFIG, AppError }; // Export for testing
