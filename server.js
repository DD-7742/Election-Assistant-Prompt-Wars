const express = require('express');
const cors = require('cors');
const { GoogleGenAI } = require('@google/genai');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('./')); // Serve static files from root for the frontend

// Initialize Gemini Client
// We will use gemini-2.5-flash as it is the recommended model for general text tasks
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// System Prompt for VoteSaathi
const SYSTEM_INSTRUCTION = `
You are "VoteSaathi" — an authoritative, neutral, and real-time Indian Elections Assistant. 
You are deployed on Google Cloud infrastructure and powered by Gemini with Google Search Grounding enabled.

Your sole purpose is to help Indian citizens, journalists, researchers, and election observers get clear, accurate, verified, and up-to-date answers about elections held in India.

CORE CAPABILITIES:
1. Election Schedule & Dates (Phases, MCC timelines)
2. Candidates & Parties (Lists, affiliations, criminal/asset records)
3. Constituencies & Voting (Boundaries, registration, EVM/VVPAT, NOTA)
4. Election Commission of India (Announcements, rules)
5. Results & Statistics (Live results, vote share, historical data)
6. Legal & Constitutional (Disqualification, Article 324-329)
7. Voter Education (Eligibility, how to vote)

BEHAVIOR RULES:
- Accuracy First: Use Google Search Grounding for real-time data. 
- Neutrality: You are strictly non-partisan and apolitical. Do not make predictions.
- Format: Break complex answers into sections, use tables/bullet points.
- Scope: Only answer questions regarding Indian elections.
- Hallucination Prevention: If uncertain, state you cannot verify the fact. Never fabricate names, dates, or counts.

RESPONSE STRUCTURE:
[Direct Answer]
[Details]
📌 Source: <official URL>
🕒 Data as of: <date or "Real-time via Google Search">
[Follow-up Suggestion]
`;

// API Endpoint for chat
app.post('/api/chat', async (req, res) => {
    try {
        const { message, history } = req.body;

        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        // Format history for the Gemini API
        const formattedHistory = (history || []).map(msg => ({
            role: msg.role === 'user' ? 'user' : 'model',
            parts: [{ text: msg.content }]
        }));

        // Create a chat session with the system instruction and grounding tool
        const chat = ai.chats.create({
            model: 'gemini-1.5-flash',
            config: {
                systemInstruction: SYSTEM_INSTRUCTION,
                temperature: 0.1, // Low temperature for factual accuracy
                // Enable Google Search Grounding
                tools: [{ googleSearch: {} }],
            }
        });

        // Add history if any
        if (formattedHistory.length > 0) {
             // Currently the SDK handles history creation differently, 
             // for simplicity in this initial setup we will just send the latest message 
             // with context if needed, but a robust app would reconstruct the chat history.
        }

        console.log(`Processing query: "${message}"`);

        // Send the message
        const response = await chat.sendMessage({ message: message });
        
        let responseText = response.text;
        let sources = [];

        // Extract grounding metadata if available (the SDK might structure this slightly differently)
        // This is a basic extraction, actual implementation depends on exact response structure of @google/genai
        if (response.candidates && response.candidates[0] && response.candidates[0].groundingMetadata) {
             const metadata = response.candidates[0].groundingMetadata;
             if (metadata.groundingChunks) {
                 sources = metadata.groundingChunks.map(chunk => chunk.web?.uri).filter(Boolean);
             }
        }

        res.json({
            response: responseText,
            sources: sources
        });

    } catch (error) {
        console.error('Error in chat endpoint:', error);
        res.status(500).json({ 
            error: 'Failed to process chat request',
            details: error.message 
        });
    }
});

// Start the server
app.listen(port, () => {
    console.log(`VoteSaathi Backend running at http://localhost:${port}`);
    console.log(`Make sure to set your GEMINI_API_KEY in the .env file!`);
});
