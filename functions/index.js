/**
 * Election Companion AI — Firebase Cloud Functions Backend
 * 
 * Architecture:
 *   - Uses Firebase Functions v2 (onRequest) with CORS enabled
 *   - PRIMARY: Gemini API (via API key) for fast, efficient responses
 *   - FALLBACK: Vertex AI (via service account) for resilient failover
 *   - Firestore for FAQ caching and conversation logging
 *   - Google Cloud Secret Manager for secure API key storage
 * 
 * AI Strategy:
 *   1. Check Firestore FAQ cache first (zero-cost, instant)
 *   2. Try Gemini API via API key (fast, low-latency)
 *   3. If Gemini fails → fallback to Vertex AI via service account (resilient)
 *   4. If both fail → return graceful fallback message
 * 
 * Security:
 *   - API key stored in Secret Manager (never in frontend code)
 *   - Vertex AI uses default service account credentials (no key needed)
 *   - Input sanitization (HTML stripping, length limiting)
 *   - Rate limiting via in-memory token bucket
 *   - POST-only endpoint enforcement
 */

const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const { GoogleGenAI } = require('@google/genai');
const { VertexAI } = require('@google-cloud/vertexai');

admin.initializeApp();
const db = admin.firestore();

// ─── Secret Management ─────────────────────────────────────────────────────
// Gemini API key is injected securely at runtime via Google Cloud Secret Manager.
// Set it once via: firebase functions:secrets:set GEMINI_API_KEY
const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');

// ─── Rate Limiter (in-memory token bucket) ──────────────────────────────────
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute window
const MAX_REQUESTS_PER_WINDOW = 15;  // max requests per IP per window

/**
 * Checks whether a given IP has exceeded the rate limit.
 * @param {string} ip - The client IP address
 * @returns {boolean} true if the request should be blocked
 */
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

// ─── System Instruction (Civic Guardrails) ──────────────────────────────────
const SYSTEM_INSTRUCTION = `
You are the "Election Companion AI" — an intelligent, neutral, and context-aware civic assistant.
Your goal is to guide users through the election processes, voter eligibility, timelines,
and registration procedures securely and efficiently.

RULES:
1. Always remain strictly non-partisan and apolitical. Never endorse or criticize any party or candidate.
2. Provide factual guidance based on verified electoral processes.
3. If a user asks about eligibility, suggest they use the "Eligibility Checker" wizard in the sidebar.
4. If a user asks about registration steps, suggest they look at the "Election Wizard" in the sidebar.
5. Keep your responses concise, highly structured, and use Markdown formatting for readability.
6. Provide logical next-step suggestions based on user context (e.g., "Would you like to know the polling dates next?").
7. If the user asks anything unrelated to elections or civic processes, politely redirect them.
8. Never generate any content that could be perceived as political persuasion.
`;

// ─── Firestore FAQ Cache Layer ──────────────────────────────────────────────
/**
 * Checks Firestore 'faqs' collection for a cached response.
 * Returns the cached answer string, or null if no cache hit.
 * @param {string} query - The lowercased user message
 * @returns {Promise<string|null>}
 */
async function checkFaqCache(query) {
    try {
        const snapshot = await db.collection('faqs')
            .where('keywords', 'array-contains', query.split(' ')[0])
            .limit(1)
            .get();

        if (!snapshot.empty) {
            return snapshot.docs[0].data().answer;
        }
    } catch (err) {
        console.warn('FAQ cache lookup failed, falling back to Gemini:', err.message);
    }
    return null;
}

/**
 * Logs a conversation turn to Firestore for analytics.
 * @param {string} userMessage - The user's sanitized input
 * @param {string} botReply   - The AI-generated reply
 */
async function logConversation(userMessage, botReply) {
    try {
        await db.collection('conversations').add({
            userMessage,
            botReply,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });
    } catch (err) {
        console.warn('Conversation logging failed:', err.message);
    }
}

// ─── Input Sanitizer ────────────────────────────────────────────────────────
const MAX_INPUT_LENGTH = 2000;

/**
 * Strips HTML tags, trims whitespace, and enforces max length.
 * @param {string} raw - The raw user input
 * @returns {string} Sanitized input safe for Gemini
 */
function sanitizeInput(raw) {
    return raw.replace(/<[^>]*>/g, '').trim().slice(0, MAX_INPUT_LENGTH);
}

// ─── Main Cloud Function ────────────────────────────────────────────────────
exports.processChat = onRequest(
    {
        secrets: [GEMINI_API_KEY],
        cors: true,
        maxInstances: 10,
        timeoutSeconds: 60,
        memory: '256MiB',
    },
    async (req, res) => {
        // Enforce POST-only
        if (req.method !== 'POST') {
            res.status(405).json({ error: 'Method not allowed. Use POST.' });
            return;
        }

        // Rate limiting
        const clientIp = req.ip || req.headers['x-forwarded-for'] || 'unknown';
        if (isRateLimited(clientIp)) {
            res.status(429).json({
                reply: '⚠️ You are sending too many requests. Please wait a moment before trying again.',
                status: 'rate_limited',
            });
            return;
        }

        try {
            // ── Extract & validate message ──────────────────────────────
            const body = req.body;
            const rawMessage = body?.data?.message || body?.message;

            if (!rawMessage || typeof rawMessage !== 'string' || rawMessage.trim() === '') {
                res.status(400).json({ error: 'A non-empty message is required.' });
                return;
            }

            const message = sanitizeInput(rawMessage);

            // ── Check Firestore FAQ cache first (efficiency) ────────────
            const cachedReply = await checkFaqCache(message.toLowerCase());
            if (cachedReply) {
                res.status(200).json({ reply: cachedReply, status: 'success', source: 'cache' });
                return;
            }

            // ── Strategy: Try Gemini API first, fallback to Vertex AI ───
            let reply;
            let source;

            try {
                // PRIMARY PATH: Gemini API via API key (fast, low-latency)
                const geminiAI = new GoogleGenAI({ apiKey: GEMINI_API_KEY.value() });

                const geminiChat = geminiAI.chats.create({
                    model: 'gemini-2.5-flash',
                    config: {
                        systemInstruction: SYSTEM_INSTRUCTION,
                        temperature: 0.2,
                    },
                });

                const geminiResponse = await geminiChat.sendMessage({ message });
                reply = geminiResponse.text;
                source = 'gemini-api';

            } catch (geminiError) {
                console.warn('Gemini API failed, falling back to Vertex AI:', geminiError.message);

                // FALLBACK PATH: Vertex AI via official SDK
                // Uses the Cloud Function's default service account auth automatically.
                const vertex = new VertexAI({
                    project: process.env.GCLOUD_PROJECT || 'voting-assistant-c1265',
                    location: 'us-central1'
                });
                
                const generativeModel = vertex.getGenerativeModel({
                    model: 'gemini-1.5-flash', // Using 1.5 Flash on Vertex for high reliability
                    systemInstruction: SYSTEM_INSTRUCTION,
                    generationConfig: {
                        temperature: 0.2,
                    }
                });

                const vertexResult = await generativeModel.generateContent(message);
                reply = vertexResult.response.candidates[0].content.parts[0].text;
                source = 'vertex-ai';
            }

            // ── Log conversation to Firestore (async, non-blocking) ─────
            logConversation(message, reply);

            res.status(200).json({ reply, status: 'success', source });

        } catch (error) {
            console.error('processChat error (both Gemini & Vertex AI failed):', error);

            // Graceful fallback — never expose raw error details to client
            res.status(200).json({
                reply: '⚠️ I am currently experiencing a connection issue. Please use the Election Wizard or Timeline Explorer in the sidebar for immediate guidance.',
                status: 'error',
            });
        }
    }
);
