# Election Companion AI 🏛️

**Election Companion AI** is a sophisticated, non-partisan civic assistant designed to guide citizens through the complexities of the electoral process. Built with a focus on accessibility, security, and intelligence, it leverages Google's Gemini and Vertex AI to provide real-time, context-aware guidance.

## 🌟 Vertical: Civic Engagement & Elections
Empowering voters with accurate, instant information to demystify registration, polling day procedures, and election timelines.

## 🚀 Live Demo
**URL:** [https://election-companion-ai-239353858986.us-central1.run.app](https://election-companion-ai-239353858986.us-central1.run.app)

---

## 🧠 Approach & Logic

### 1. Containerized Dual-Path AI Strategy (Resilience)
The application is containerized using **Docker** and deployed to **Google Cloud Run**. It uses a tiered response strategy for maximum efficiency and reliability:
- **Tier 1: Local Decision Engine:** High-frequency questions (e.g., "What is NOTA?") and navigation intents are handled instantly on the client side.
- **Tier 2: Firestore FAQ Cache:** Common queries are checked against a Firestore cache.
- **Tier 3: Gemini API (Primary):** The latest Gemini 2.5 Flash model handles complex reasoning.
- **Tier 4: Vertex AI (Fallback):** Resilient failover via the Vertex AI SDK.

### 2. Context-Aware Navigation
The AI doesn't just talk; it **acts**. The `Decision Engine` detects user intent (like wanting to check eligibility or see a timeline) and automatically triggers UI transitions to the relevant tool, creating a seamless "conversational UI" experience.

### 3. Civic Guardrails
The system is governed by a strict **System Instruction** that enforces non-partisanship, prevents political persuasion, and redirects users to official sources for sensitive local data.

---

## 🛠️ How the Solution Works

### Frontend Architecture
- **Vanilla JS & CSS:** Optimized for speed and full control over design aesthetics (Glassmorphism + Material Design 3 influences).
- **Accessibility (A11y):** Implements full ARIA support, skip-links, focus management, and support for high-contrast/reduced-motion preferences.
- **Interactive Tools:**
    - **Eligibility Checker:** A deterministic decision-tree wizard.
    - **Election Wizard:** A multi-step guide for registration and polling day.
    - **Timeline Explorer:** An interactive visualization of the election cycle.

### Backend Infrastructure
- **Firebase Functions:** Serverless Node.js environment with CORS-enabled `onRequest` triggers.
- **Google Cloud Secret Manager:** Securely stores sensitive API credentials.
- **Rate Limiting:** Protects the AI endpoint from abuse using an in-memory token bucket.
- **Input Sanitization:** Every message is stripped of HTML and length-limited before processing to prevent injection attacks.

---

## 🔧 Technical Stack
- **AI/ML:** Google Gemini 2.5 Flash, Vertex AI SDK
- **Backend:** Firebase Cloud Functions, Firestore
- **Frontend:** HTML5, CSS3 (Vanilla), JavaScript (ES6+)
- **Security:** Google Cloud Secret Manager, Rate Limiting, Firestore Rules
- **Testing:** Custom Browser-based Test Suite (`tests.js`)

---

## 📝 Assumptions Made
1. **Model Access:** Assumes a Gemini API key is configured in Secret Manager as `GEMINI_API_KEY`.
2. **Connectivity:** Assumes standard internet access for model communication.
3. **Generalization:** While optimized for major electoral systems, specific local dates (constituency-level) are treated as general guidance, directing users to official portals for specific lookups.
4. **Auth:** The application assumes anonymous usage for maximum accessibility, with logging used only for non-identifiable analytics.

---

## 🧪 Testing the Solution
Open the live site, open the browser console, and run the contents of `tests.js` to trigger the automated validation suite. It covers:
- AI Intent Accuracy
- Eligibility Logic
- XSS Protection
- ARIA/Accessibility Compliance
- DOM Integrity

---

**Developed for PromptWars 2026**
