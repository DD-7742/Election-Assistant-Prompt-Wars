/**
 * Decision Engine for the Election Companion AI
 * 
 * Responsibilities:
 *   - Context-aware intent detection and routing
 *   - FAQ cache management (local + Firestore)
 *   - Eligibility checker flow logic
 *   - Smart follow-up suggestion generation
 * 
 * Design: Acts as a lightweight client-side "router" to avoid unnecessary
 * Gemini API calls for common queries. This improves response time and
 * reduces cost.
 */

class DecisionEngine {
    constructor() {
        /** @type {{ lastIntent: string|null, questionsAsked: number, topicsExplored: string[] }} */
        this.context = {
            lastIntent: null,
            questionsAsked: 0,
            topicsExplored: [],
        };

        /**
         * Local FAQ cache — common questions answered instantly without API call.
         * Keys are lowercase trigger phrases; values are markdown-formatted answers.
         * @type {Object.<string, string>}
         */
        this.faqCache = {
            'voting age': 'The minimum voting age in India is **18 years**. You must be 18 on or before the qualifying date set by the Election Commission.',
            'what is nota': '**NOTA** stands for "None of the Above". It allows voters to register a vote of rejection for all candidates without abstaining entirely.',
            'what is evm': 'An **EVM (Electronic Voting Machine)** is a portable device used to record votes electronically. It has a ballot unit showing candidate names and symbols, and a control unit operated by the presiding officer.',
            'what is vvpat': '**VVPAT** (Voter Verifiable Paper Audit Trail) is a machine attached to EVMs that prints a slip showing the symbol and name of the candidate you voted for, allowing you to verify your vote.',
            'what is epic': '**EPIC** stands for "Electors Photo Identity Card", commonly called a Voter ID card. It serves as proof of identity at the polling booth.',
            'model code of conduct': 'The **Model Code of Conduct (MCC)** is a set of guidelines issued by the Election Commission that political parties and candidates must follow during elections to ensure free and fair polls.',
        };

        /**
         * Intent detection rules — maps keyword patterns to navigation actions or responses.
         * @type {Array<{patterns: string[], response: object}>}
         */
        this.intentRules = [
            {
                patterns: ['am i eligible', 'eligibility check', 'can i vote', 'check eligibility'],
                response: {
                    type: 'action',
                    action: 'navigate',
                    target: 'eligibility-view',
                    text: "Great question! Let's check your eligibility. I'll take you to the Eligibility Checker now.",
                },
            },
            {
                patterns: ['timeline', 'stages', 'election phases', 'election schedule'],
                response: {
                    type: 'action',
                    action: 'navigate',
                    target: 'timeline-view',
                    text: "Here's the interactive election timeline. You can explore each phase in detail.",
                },
            },
            {
                patterns: ['how to register', 'steps to register', 'registration process', 'register to vote'],
                response: {
                    type: 'action',
                    action: 'navigate',
                    target: 'wizard-view',
                    tab: 'tab-2',
                    text: "I'll open the Registration guide for you — follow the step-by-step wizard!",
                },
            },
            {
                patterns: ['voting day', 'polling day', 'how to vote', 'voting process'],
                response: {
                    type: 'action',
                    action: 'navigate',
                    target: 'wizard-view',
                    tab: 'tab-3',
                    text: "Let me show you the Voting Day process — here's the step-by-step guide.",
                },
            },
            {
                patterns: ['counting', 'results', 'vote counting', 'when are results'],
                response: {
                    type: 'action',
                    action: 'navigate',
                    target: 'wizard-view',
                    tab: 'tab-4',
                    text: "I'll take you to the Vote Counting & Results section.",
                },
            },
        ];

        // Load additional FAQs from Firestore (async, non-blocking)
        this._loadFirestoreFaqs();
    }

    // ─── Firestore FAQ Loader ───────────────────────────────────────────────
    /**
     * Asynchronously loads FAQ entries from the Firestore 'faqs' collection.
     * Merges them into the local cache. Fails silently if Firestore is unavailable.
     * @private
     */
    async _loadFirestoreFaqs() {
        if (!window.db) return;
        try {
            const snapshot = await window.db.collection('faqs').get();
            snapshot.forEach(doc => {
                const data = doc.data();
                if (data.question && data.answer) {
                    this.faqCache[data.question.toLowerCase()] = data.answer;
                }
            });
            console.log(`[DecisionEngine] Loaded ${snapshot.size} FAQs from Firestore`);
        } catch (err) {
            console.warn('[DecisionEngine] Firestore FAQ load failed, using local cache:', err.message);
        }
    }

    // ─── Quick Analyze ──────────────────────────────────────────────────────
    /**
     * Analyzes a user message locally. Returns an instant response if possible,
     * or null to indicate the message should be forwarded to Gemini.
     * 
     * Priority order:
     *   1. FAQ cache (instant factual answer)
     *   2. Intent rules (navigation action)
     *   3. null → forward to Gemini API
     * 
     * @param {string} message - The raw user message
     * @returns {object|null} Response object or null
     */
    quickAnalyze(message) {
        const lowerMsg = message.toLowerCase();

        // Update context
        this.context.questionsAsked += 1;

        // 1. Check FAQ cache
        for (const [key, value] of Object.entries(this.faqCache)) {
            if (lowerMsg.includes(key)) {
                this.context.lastIntent = 'faq';
                this.context.topicsExplored.push(key);
                return { type: 'static', text: value };
            }
        }

        // 2. Check intent rules
        for (const rule of this.intentRules) {
            if (rule.patterns.some(pattern => lowerMsg.includes(pattern))) {
                this.context.lastIntent = rule.response.target;
                return { ...rule.response };
            }
        }

        // 3. No local match → forward to Gemini
        this.context.lastIntent = 'gemini';
        return null;
    }

    // ─── Smart Follow-up Suggestions ────────────────────────────────────────
    /**
     * Generates contextual follow-up suggestions based on conversation history.
     * Called after each bot response to offer logical next steps.
     * 
     * @returns {string[]} Array of suggestion strings
     */
    getFollowUpSuggestions() {
        const explored = this.context.topicsExplored;
        const suggestions = [];

        if (!explored.includes('eligibility') && this.context.questionsAsked >= 1) {
            suggestions.push('Check my voter eligibility');
        }
        if (!explored.includes('registration') && this.context.lastIntent !== 'wizard-view') {
            suggestions.push('How do I register to vote?');
        }
        if (!explored.includes('timeline') && this.context.lastIntent !== 'timeline-view') {
            suggestions.push('Show election timeline');
        }
        if (this.context.questionsAsked >= 3 && !explored.includes('voting day')) {
            suggestions.push('What happens on voting day?');
        }

        return suggestions.slice(0, 3); // Return at most 3 suggestions
    }

    // ─── Eligibility Checker Flow ───────────────────────────────────────────
    /**
     * Returns the eligibility decision tree as an array of question nodes.
     * Each node has: id, text, yes (next node or result), no (next node or result).
     * 
     * @returns {Array<{id: string, text: string, yes: string, no: string}>}
     */
    getEligibilityFlow() {
        return [
            { id: 'q1', text: 'Are you a citizen of the country?', yes: 'q2', no: 'fail_citizen' },
            { id: 'q2', text: 'Are you 18 years of age or older?', yes: 'q3', no: 'fail_age' },
            { id: 'q3', text: 'Do you have a valid proof of residence (e.g., Aadhaar, utility bill)?', yes: 'q4', no: 'fail_residence' },
            { id: 'q4', text: 'Are you of sound mind and not disqualified under any law?', yes: 'pass', no: 'fail_disqualified' },
        ];
    }
}

// Export singleton instance
window.decisionEngine = new DecisionEngine();
