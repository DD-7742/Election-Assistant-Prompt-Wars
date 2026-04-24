/**
 * Election Companion AI — Main Frontend Application Logic
 * 
 * Modules:
 *   - Navigation controller (sidebar + views)
 *   - Election Process Wizard (4-step tabbed guide)
 *   - AI Chat interface (Gemini via Firebase Functions)
 *   - Eligibility Checker (decision-tree questionnaire)
 *   - Smart follow-up suggestions
 *   - Timeline interaction animations
 * 
 * Dependencies:
 *   - firebase-config.js (Firebase SDK initialization)
 *   - decision-engine.js  (local intent routing & FAQ cache)
 *   - marked.js           (markdown rendering for bot messages)
 */

document.addEventListener('DOMContentLoaded', () => {

    // ═══════════════════════════════════════════════════════════════════════
    // SECTION 1: Navigation Logic
    // ═══════════════════════════════════════════════════════════════════════
    const navButtons = document.querySelectorAll('.nav-btn');
    const views = document.querySelectorAll('.view');

    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-target');
            switchView(targetId);
        });
    });

    /**
     * Switches the active view and updates sidebar navigation state.
     * @param {string} viewId - The target view element ID
     * @param {string|null} tabId - Optional tab to activate within wizard
     */
    window.switchView = function(viewId, tabId = null) {
        // Update nav button states
        navButtons.forEach(b => {
            b.classList.remove('active');
            b.removeAttribute('aria-current');
        });
        const activeNav = document.querySelector(`.nav-btn[data-target="${viewId}"]`);
        if (activeNav) {
            activeNav.classList.add('active');
            activeNav.setAttribute('aria-current', 'page');
        }

        // Update view visibility
        views.forEach(v => {
            if (v.id === viewId) {
                v.classList.remove('hidden');
                v.classList.add('active');
            } else {
                v.classList.add('hidden');
                v.classList.remove('active');
            }
        });

        // Activate a specific wizard tab if requested
        if (viewId === 'wizard-view' && tabId) {
            const tab = document.getElementById(tabId);
            if (tab) tab.click();
        }
    };


    // ═══════════════════════════════════════════════════════════════════════
    // SECTION 2: Election Process Wizard (Tabs)
    // ═══════════════════════════════════════════════════════════════════════
    const tabBtns = document.querySelectorAll('.tab-btn');
    
    /** Wizard content for each tab — structured data for clean rendering */
    const wizardContent = {
        'tab-1': {
            title: 'Voter Eligibility Basics',
            body: `<p>Before registering, you must meet these criteria:</p>
                <ul>
                    <li><strong>Citizenship:</strong> You must be a citizen of India.</li>
                    <li><strong>Age:</strong> You must be 18 years or older on the qualifying date.</li>
                    <li><strong>Residence:</strong> You must be an ordinary resident of the constituency.</li>
                    <li><strong>Sound Mind:</strong> You must not be disqualified under any law.</li>
                </ul>
                <button class="primary-btn mt-4" onclick="switchView('eligibility-view')" aria-label="Take the eligibility check quiz">Take Eligibility Check →</button>`,
        },
        'tab-2': {
            title: 'Registration Process',
            body: `<p>Follow these steps to register as a voter:</p>
                <ol>
                    <li><strong>Obtain Form 6</strong> — Download from the ECI website or collect from your local ERO office.</li>
                    <li><strong>Gather Documents</strong> — Age proof (birth certificate, marksheet) + Address proof (Aadhaar, utility bill).</li>
                    <li><strong>Submit Online or Offline</strong> — File via <a href="https://voters.eci.gov.in" target="_blank" rel="noopener">voters.eci.gov.in</a> or at the Electoral Registration Office.</li>
                    <li><strong>Track Application</strong> — Use the reference number to check your application status.</li>
                    <li><strong>Receive EPIC</strong> — Once approved, collect your Voter ID (EPIC) card.</li>
                </ol>`,
        },
        'tab-3': {
            title: 'Voting Day Process',
            body: `<p>Here's what to expect on polling day:</p>
                <ol>
                    <li><strong>Locate Your Booth</strong> — Find your assigned polling station using your EPIC number or via the Voter Helpline app.</li>
                    <li><strong>Carry Valid ID</strong> — Bring your EPIC card or any Election Commission-approved photo ID.</li>
                    <li><strong>Verification</strong> — The presiding officer checks your name against the electoral roll and marks your finger with indelible ink.</li>
                    <li><strong>Cast Your Vote</strong> — Enter the booth, press the button next to your chosen candidate on the EVM.</li>
                    <li><strong>Verify via VVPAT</strong> — Check the printed slip to confirm your vote was recorded correctly.</li>
                </ol>`,
        },
        'tab-4': {
            title: 'Vote Counting & Results',
            body: `<p>After polling concludes:</p>
                <ol>
                    <li><strong>Sealed EVMs</strong> — All EVMs are sealed and transported to a central counting center under security.</li>
                    <li><strong>Counting Day</strong> — Votes are counted round by round under the supervision of the Returning Officer.</li>
                    <li><strong>VVPAT Audit</strong> — A random sample of VVPAT slips is verified against EVM totals.</li>
                    <li><strong>Results Declared</strong> — The candidate with the most votes is declared the winner for each constituency.</li>
                    <li><strong>Certificate of Election</strong> — The winning candidate receives an official certificate from the Returning Officer.</li>
                </ol>`,
        },
    };

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Update tab states
            tabBtns.forEach(b => {
                b.classList.remove('active');
                b.setAttribute('aria-selected', 'false');
            });
            btn.classList.add('active');
            btn.setAttribute('aria-selected', 'true');

            // Render corresponding content
            const panel = document.getElementById('panel-1');
            const content = wizardContent[btn.id];
            if (content) {
                panel.innerHTML = `<h3>${content.title}</h3>${content.body}`;
            }
        });
    });


    // ═══════════════════════════════════════════════════════════════════════
    // SECTION 3: AI Chat Interface
    // ═══════════════════════════════════════════════════════════════════════
    const chatForm = document.getElementById('chat-form');
    const userInput = document.getElementById('user-input');
    const chatHistory = document.getElementById('chat-history');
    const sendBtn = document.getElementById('send-btn');

    /** Cloud Function endpoint URL */
    const FUNCTION_URL = 'https://us-central1-voting-assistant-c1265.cloudfunctions.net/processChat';

    /** Handle quick-action chip clicks */
    window.handleChipClick = function(text) {
        userInput.value = text;
        chatForm.dispatchEvent(new Event('submit'));
    };

    chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const message = userInput.value.trim();

        // ── Empty input validation ──────────────────────────────────────
        if (!message) {
            userInput.setAttribute('aria-invalid', 'true');
            userInput.focus();
            return;
        }
        userInput.removeAttribute('aria-invalid');
        userInput.value = '';
        sendBtn.disabled = true;

        // ── Render user message ─────────────────────────────────────────
        appendMessage(message, 'user');

        // ── Check local Decision Engine first (efficiency) ──────────────
        const quickAction = window.decisionEngine.quickAnalyze(message);
        
        if (quickAction) {
            appendTypingIndicator();
            setTimeout(() => {
                removeTypingIndicator();
                appendMessage(quickAction.text, 'bot');
                renderFollowUpSuggestions();
                if (quickAction.action === 'navigate') {
                    setTimeout(() => switchView(quickAction.target, quickAction.tab), 1500);
                }
                sendBtn.disabled = false;
            }, 600);
            return;
        }

        // ── Call Gemini via Firebase Cloud Function ──────────────────────
        appendTypingIndicator();
        try {
            const response = await fetch(FUNCTION_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ data: { message: message } }),
            });

            if (!response.ok) {
                throw new Error(`Server responded with HTTP ${response.status}`);
            }

            const json = await response.json();
            const reply = json.reply || 'No response received.';

            removeTypingIndicator();
            appendMessage(reply, 'bot');
            renderFollowUpSuggestions();

            // Log conversation to Firestore (non-blocking)
            if (window.db) {
                window.db.collection('conversations').add({
                    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                    userMessage: message,
                    botReply: reply,
                }).catch(err => console.warn('Firestore log failed:', err.message));
            }

        } catch (error) {
            removeTypingIndicator();
            appendMessage('⚠️ I encountered an error connecting to the servers. Please try again later.', 'bot');
            console.error('Cloud Function Error:', error);
        } finally {
            sendBtn.disabled = false;
        }
    });


    // ─── Chat UI Helpers ────────────────────────────────────────────────────

    /**
     * Appends a message bubble to the chat history.
     * Bot messages are rendered as Markdown; user messages are plain text.
     * @param {string} text   - The message content
     * @param {string} sender - Either 'user' or 'bot'
     */
    function appendMessage(text, sender) {
        const div = document.createElement('div');
        div.className = `message ${sender}`;
        div.setAttribute('role', 'article');
        div.setAttribute('aria-label', `${sender === 'user' ? 'Your' : 'Assistant'} message`);

        const avatar = document.createElement('div');
        avatar.className = 'avatar';
        avatar.textContent = sender === 'user' ? 'U' : '🤖';
        avatar.setAttribute('aria-hidden', 'true');

        const content = document.createElement('div');
        content.className = 'message-content';
        // Sanitize user text to prevent XSS; parse bot markdown
        content.innerHTML = sender === 'bot'
            ? marked.parse(text)
            : `<p>${escapeHtml(text)}</p>`;

        div.appendChild(avatar);
        div.appendChild(content);
        chatHistory.appendChild(div);
        chatHistory.scrollTop = chatHistory.scrollHeight;
    }

    /**
     * Escapes HTML entities to prevent XSS in user-submitted text.
     * @param {string} str - Raw string
     * @returns {string} Escaped string
     */
    function escapeHtml(str) {
        const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
        return str.replace(/[&<>"']/g, c => map[c]);
    }

    /** Shows the animated typing indicator */
    function appendTypingIndicator() {
        const div = document.createElement('div');
        div.className = 'message bot typing-message';
        div.id = 'typing';
        div.setAttribute('role', 'status');
        div.setAttribute('aria-label', 'Assistant is typing');
        div.innerHTML = `
            <div class="avatar" aria-hidden="true">🤖</div>
            <div class="message-content">
                <div class="typing-indicator">
                    <div class="dot"></div><div class="dot"></div><div class="dot"></div>
                </div>
            </div>
        `;
        chatHistory.appendChild(div);
        chatHistory.scrollTop = chatHistory.scrollHeight;
    }

    /** Removes the typing indicator from the chat */
    function removeTypingIndicator() {
        const el = document.getElementById('typing');
        if (el) el.remove();
    }

    /**
     * Renders smart follow-up suggestion chips below the latest bot message.
     * Uses the Decision Engine's context-aware suggestion system.
     */
    function renderFollowUpSuggestions() {
        const suggestions = window.decisionEngine.getFollowUpSuggestions();
        if (suggestions.length === 0) return;

        const container = document.createElement('div');
        container.className = 'message bot';
        container.setAttribute('role', 'navigation');
        container.setAttribute('aria-label', 'Suggested next steps');

        const avatar = document.createElement('div');
        avatar.className = 'avatar';
        avatar.textContent = '💡';
        avatar.setAttribute('aria-hidden', 'true');

        const content = document.createElement('div');
        content.className = 'message-content suggestion-block';
        content.innerHTML = `<p class="suggestion-label">Based on your questions, you may want to explore:</p>`;

        const chipContainer = document.createElement('div');
        chipContainer.className = 'suggested-actions';
        suggestions.forEach(text => {
            const chip = document.createElement('button');
            chip.className = 'action-chip';
            chip.textContent = text;
            chip.addEventListener('click', () => handleChipClick(text));
            chipContainer.appendChild(chip);
        });
        content.appendChild(chipContainer);

        container.appendChild(avatar);
        container.appendChild(content);
        chatHistory.appendChild(container);
        chatHistory.scrollTop = chatHistory.scrollHeight;
    }


    // ═══════════════════════════════════════════════════════════════════════
    // SECTION 4: Eligibility Checker
    // ═══════════════════════════════════════════════════════════════════════
    const flow = window.decisionEngine.getEligibilityFlow();
    const checkerContainer = document.getElementById('checker-form-container');

    /**
     * Handles an eligibility question answer and progresses the flow.
     * @param {string} questionId - Current question node ID
     * @param {boolean} isYes - Whether the user answered "Yes"
     */
    window.handleEligibilityAnswer = function(questionId, isYes) {
        const currentQ = flow.find(q => q.id === questionId);
        if (!currentQ) return;

        const nextStepId = isYes ? currentQ.yes : currentQ.no;

        // Hide the current question card
        const currentEl = document.getElementById(questionId);
        if (currentEl) currentEl.classList.remove('active');

        if (nextStepId.startsWith('fail_') || nextStepId === 'pass') {
            showEligibilityResult(nextStepId);
        } else {
            // Render next question
            const nextQ = flow.find(q => q.id === nextStepId);
            if (!nextQ) return;

            checkerContainer.innerHTML = `
                <div class="question-card active" id="${nextQ.id}" role="form" aria-label="Eligibility question">
                    <h3>${nextQ.text}</h3>
                    <div class="options">
                        <button class="option-btn" onclick="handleEligibilityAnswer('${nextQ.id}', true)" aria-label="Yes">Yes</button>
                        <button class="option-btn" onclick="handleEligibilityAnswer('${nextQ.id}', false)" aria-label="No">No</button>
                    </div>
                </div>
            `;
        }
    };

    /**
     * Renders the eligibility result card with contextual messaging.
     * @param {string} resultCode - One of 'pass', 'fail_citizen', 'fail_age', 'fail_residence', 'fail_disqualified'
     */
    function showEligibilityResult(resultCode) {
        const results = {
            pass: {
                title: '✅ You appear to be eligible!',
                message: 'Your next step is to ensure you are registered on the electoral roll. Use the Election Wizard to learn the registration process.',
                color: 'var(--success)',
                action: `<button class="primary-btn mt-4" onclick="switchView('wizard-view', 'tab-2')" aria-label="Go to registration wizard">Go to Registration Wizard →</button>`,
            },
            fail_citizen: {
                title: '❌ You may not be eligible',
                message: 'Only citizens of the country are eligible to vote in national and state elections.',
                color: 'var(--error)',
                action: '',
            },
            fail_age: {
                title: '❌ You may not be eligible',
                message: 'You must be 18 years of age or older on the qualifying date to be eligible to vote.',
                color: 'var(--error)',
                action: '',
            },
            fail_residence: {
                title: '❌ You may not be eligible',
                message: 'A valid proof of ordinary residence in your constituency is required for voter registration.',
                color: 'var(--error)',
                action: '',
            },
            fail_disqualified: {
                title: '❌ You may not be eligible',
                message: 'Persons disqualified under certain legal provisions (e.g., unsound mind, specific court orders) are not eligible.',
                color: 'var(--error)',
                action: '',
            },
        };

        const result = results[resultCode] || results.fail_citizen;

        checkerContainer.innerHTML = `
            <div class="question-card active result-card" style="border-top: 4px solid ${result.color}" role="alert">
                <h3 style="color: ${result.color}">${result.title}</h3>
                <p>${result.message}</p>
                ${result.action}
                <button class="secondary-btn mt-4" onclick="resetEligibilityChecker()" aria-label="Restart eligibility check">Start Over</button>
            </div>
        `;
    }

    /** Resets the eligibility checker to question 1 */
    window.resetEligibilityChecker = function() {
        const firstQ = flow[0];
        checkerContainer.innerHTML = `
            <div class="question-card active" id="${firstQ.id}" role="form" aria-label="Eligibility question">
                <h3>${firstQ.text}</h3>
                <div class="options">
                    <button class="option-btn" onclick="handleEligibilityAnswer('${firstQ.id}', true)" aria-label="Yes">Yes</button>
                    <button class="option-btn" onclick="handleEligibilityAnswer('${firstQ.id}', false)" aria-label="No">No</button>
                </div>
            </div>
        `;
    };


    // ═══════════════════════════════════════════════════════════════════════
    // SECTION 5: Timeline Interaction Animations
    // ═══════════════════════════════════════════════════════════════════════
    const timelineItems = document.querySelectorAll('.timeline-item');
    timelineItems.forEach(item => {
        item.addEventListener('click', () => {
            // Toggle expanded state
            timelineItems.forEach(i => i.classList.remove('expanded'));
            item.classList.toggle('expanded');
        });

        // Keyboard support for timeline items
        item.setAttribute('tabindex', '0');
        item.setAttribute('role', 'button');
        item.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                item.click();
            }
        });
    });


    // ═══════════════════════════════════════════════════════════════════════
    // SECTION 6: Mobile Navigation Toggle
    // ═══════════════════════════════════════════════════════════════════════
    const mobileToggle = document.getElementById('mobile-nav-toggle');
    const sidebar = document.querySelector('.sidebar');

    if (mobileToggle && sidebar) {
        mobileToggle.addEventListener('click', () => {
            sidebar.classList.toggle('sidebar-open');
            const isOpen = sidebar.classList.contains('sidebar-open');
            mobileToggle.setAttribute('aria-expanded', isOpen);
        });
    }
});
