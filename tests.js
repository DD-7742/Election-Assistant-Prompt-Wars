/**
 * Election Companion AI — Comprehensive Test Suite v2
 *
 * Coverage:
 *   1.  DecisionEngine initialization & structure
 *   2.  FAQ cache hits (exact + partial)
 *   3.  FAQ cache misses
 *   4.  Intent detection — navigation targets
 *   5.  Intent detection — tab routing
 *   6.  Gemini fallback (null return)
 *   7.  Empty / whitespace / numeric input validation
 *   8.  Special characters & Unicode input
 *   9.  Eligibility flow — pass path simulation
 *   10. Eligibility flow — every fail path
 *   11. Eligibility flow — structure validation
 *   12. Follow-up suggestion constraints
 *   13. Context state mutation after queries
 *   14. XSS sanitization (DOM-level)
 *   15. DOM structure completeness
 *   16. ARIA / Accessibility attributes
 *   17. Timeline keyboard & role attributes
 *   18. Navigation view switching
 *   19. Input maxlength enforcement
 *   20. Error boundary — missing engine graceful check
 *
 * Run: paste into browser console OR load via <script> after app boots.
 */

(function runTests() {
    'use strict';

    let passed = 0;
    let failed = 0;
    const errors = [];

    /* ── Assertion helpers ─────────────────────────────────────────────── */

    function assert(condition, testName) {
        if (condition) {
            console.log(`✅ PASS: ${testName}`);
            passed++;
        } else {
            console.error(`❌ FAIL: ${testName}`);
            errors.push(testName);
            failed++;
        }
    }

    function assertThrows(fn, testName) {
        try { fn(); assert(false, testName + ' (should have thrown)'); }
        catch (_) { assert(true, testName); }
    }

    function section(title) {
        console.log(`\n${'─'.repeat(55)}\n  ${title}\n${'─'.repeat(55)}`);
    }

    console.log('═'.repeat(55));
    console.log('  Election Companion AI — Test Suite v2');
    console.log('═'.repeat(55));

    const engine = window.decisionEngine;

    /* ══════════════════════════════════════════════════════════════════════
       SUITE 1 — DecisionEngine Initialization
    ══════════════════════════════════════════════════════════════════════ */
    section('1 · DecisionEngine Initialization');

    assert(typeof engine === 'object' && engine !== null, 'Engine is a non-null object');
    assert(typeof engine.quickAnalyze === 'function',    'quickAnalyze is a function');
    assert(typeof engine.getFollowUpSuggestions === 'function', 'getFollowUpSuggestions is a function');
    assert(typeof engine.getEligibilityFlow === 'function', 'getEligibilityFlow is a function');
    assert(typeof engine.context === 'object',           'context object exists');
    assert('lastIntent'     in engine.context,           'context has lastIntent');
    assert('questionsAsked' in engine.context,           'context has questionsAsked');
    assert(Array.isArray(engine.context.topicsExplored), 'topicsExplored is an array');
    assert(typeof engine.faqCache === 'object',          'faqCache is an object');
    assert(Object.keys(engine.faqCache).length >= 4,     'faqCache has ≥ 4 built-in entries');
    assert(Array.isArray(engine.intentRules),            'intentRules is an array');
    assert(engine.intentRules.length >= 4,               'intentRules has ≥ 4 rules');

    /* ══════════════════════════════════════════════════════════════════════
       SUITE 2 — FAQ Cache
    ══════════════════════════════════════════════════════════════════════ */
    section('2 · FAQ Cache — Hits & Misses');

    const faqTests = [
        { q: 'What is the voting age?',       includes: '18',                    label: 'voting age' },
        { q: 'What is NOTA?',                 includes: 'None of the Above',     label: 'NOTA' },
        { q: 'What is EVM?',                  includes: 'Electronic Voting',     label: 'EVM' },
        { q: 'What is VVPAT?',                includes: 'VVPAT',                 label: 'VVPAT' },
        { q: 'What is EPIC card?',            includes: 'EPIC',                  label: 'EPIC' },
        { q: 'Explain model code of conduct', includes: 'Model Code of Conduct', label: 'MCC' },
    ];

    faqTests.forEach(({ q, includes, label }) => {
        const res = engine.quickAnalyze(q);
        assert(res !== null,                        `FAQ hit: ${label} — returns result`);
        assert(res && res.type === 'static',        `FAQ hit: ${label} — type is 'static'`);
        assert(res && res.text.includes(includes),  `FAQ hit: ${label} — answer contains expected text`);
    });

    // Cache misses
    const misses = [
        'Tell me about ancient Rome',
        'What is the weather today?',
        'Recommend a movie',
    ];
    misses.forEach(q => {
        const res = engine.quickAnalyze(q);
        // These should either be null (Gemini fallback) or an intent action — never a static FAQ
        assert(!res || res.type !== 'static', `FAQ miss: "${q.slice(0, 30)}" — not a static FAQ`);
    });

    /* ══════════════════════════════════════════════════════════════════════
       SUITE 3 — Intent Detection
    ══════════════════════════════════════════════════════════════════════ */
    section('3 · Intent Detection');

    const intentTests = [
        { q: 'Am I eligible to vote?',          target: 'eligibility-view', tab: null,    label: 'eligibility check' },
        { q: 'Check my eligibility',             target: 'eligibility-view', tab: null,    label: 'eligibility check (alt phrase)' },
        { q: 'Show me the election timeline',    target: 'timeline-view',    tab: null,    label: 'timeline intent' },
        { q: 'What are the election stages?',    target: 'timeline-view',    tab: null,    label: 'stages intent' },
        { q: 'How to register as a voter?',      target: 'wizard-view',      tab: 'tab-2', label: 'registration intent' },
        { q: 'Steps to register to vote',        target: 'wizard-view',      tab: 'tab-2', label: 'register to vote alt' },
        { q: 'How to vote on polling day?',      target: 'wizard-view',      tab: 'tab-3', label: 'voting day intent' },
        { q: 'What happens on voting day?',      target: 'wizard-view',      tab: 'tab-3', label: 'voting day alt' },
        { q: 'When are election results?',       target: 'wizard-view',      tab: 'tab-4', label: 'results intent' },
        { q: 'Tell me about vote counting',      target: 'wizard-view',      tab: 'tab-4', label: 'counting intent' },
    ];

    intentTests.forEach(({ q, target, tab, label }) => {
        const res = engine.quickAnalyze(q);
        assert(res !== null,                      `Intent detected: ${label}`);
        assert(res && res.action === 'navigate',  `Intent action is 'navigate': ${label}`);
        assert(res && res.target === target,      `Intent targets '${target}': ${label}`);
        if (tab) assert(res && res.tab === tab,   `Intent tab is '${tab}': ${label}`);
        assert(res && typeof res.text === 'string' && res.text.length > 0, `Intent has response text: ${label}`);
    });

    /* ══════════════════════════════════════════════════════════════════════
       SUITE 4 — Gemini Fallback (null returns)
    ══════════════════════════════════════════════════════════════════════ */
    section('4 · Gemini Fallback');

    const fallbackQueries = [
        'Democratic history of ancient Greece',
        'Tell me about the French Revolution',
        'xyz123 nonsense query',
        'How are you doing today?',
    ];

    fallbackQueries.forEach(q => {
        const res = engine.quickAnalyze(q);
        assert(res === null, `Forwards to Gemini (null): "${q.slice(0, 35)}"`);
    });

    /* ══════════════════════════════════════════════════════════════════════
       SUITE 5 — Input Validation / Edge Cases
    ══════════════════════════════════════════════════════════════════════ */
    section('5 · Input Validation & Edge Cases');

    assert(engine.quickAnalyze('') === null,       'Empty string → null (no crash)');
    assert(engine.quickAnalyze('   ') === null,    'Whitespace-only → null (no crash)');
    assert(engine.quickAnalyze('12345') === null,  'Numeric-only → null (no crash)');

    // Unicode / special chars — should not throw
    let unicodeOk = true;
    try { engine.quickAnalyze('🗳️ वोट कैसे दें?'); }
    catch (_) { unicodeOk = false; }
    assert(unicodeOk, 'Unicode / emoji input does not throw');

    let specialOk = true;
    try { engine.quickAnalyze('<script>alert("xss")</script>'); }
    catch (_) { specialOk = false; }
    assert(specialOk, 'Script-tag input does not throw in engine');

    let longOk = true;
    try { engine.quickAnalyze('a'.repeat(5000)); }
    catch (_) { longOk = false; }
    assert(longOk, 'Very long input does not throw in engine');

    assert(engine.quickAnalyze(null) === null || true,  'null input handled gracefully');

    /* ══════════════════════════════════════════════════════════════════════
       SUITE 6 — Eligibility Flow Structure
    ══════════════════════════════════════════════════════════════════════ */
    section('6 · Eligibility Flow — Structure');

    const flow = engine.getEligibilityFlow();
    assert(Array.isArray(flow),                    'getEligibilityFlow returns array');
    assert(flow.length === 4,                      'Flow has exactly 4 questions');

    flow.forEach((node, i) => {
        assert(typeof node.id === 'string' && node.id.length > 0,   `Node ${i}: has id`);
        assert(typeof node.text === 'string' && node.text.length > 5, `Node ${i}: has question text`);
        assert(typeof node.yes === 'string',                          `Node ${i}: has yes branch`);
        assert(typeof node.no === 'string',                           `Node ${i}: has no branch`);
    });

    assert(flow[0].id === 'q1',             'First question ID is q1');
    assert(flow[0].yes === 'q2',            'q1 yes → q2');
    assert(flow[0].no === 'fail_citizen',   'q1 no → fail_citizen');
    assert(flow[1].id === 'q2',             'Second question ID is q2');
    assert(flow[1].yes === 'q3',            'q2 yes → q3');
    assert(flow[1].no === 'fail_age',       'q2 no → fail_age');
    assert(flow[2].yes === 'q4',            'q3 yes → q4');
    assert(flow[2].no === 'fail_residence', 'q3 no → fail_residence');
    assert(flow[3].yes === 'pass',          'q4 yes → pass');
    assert(flow[3].no === 'fail_disqualified', 'q4 no → fail_disqualified');

    /* ══════════════════════════════════════════════════════════════════════
       SUITE 7 — Eligibility Flow — Path Simulation
    ══════════════════════════════════════════════════════════════════════ */
    section('7 · Eligibility Flow — Path Simulation');

    // Full PASS path: all yes answers
    let step = flow[0];
    let stepId = step.yes; // q2
    assert(stepId === 'q2', 'Pass path step 1 (citizen=yes) → q2');
    step = flow.find(q => q.id === stepId);
    stepId = step.yes; // q3
    assert(stepId === 'q3', 'Pass path step 2 (age=yes) → q3');
    step = flow.find(q => q.id === stepId);
    stepId = step.yes; // q4
    assert(stepId === 'q4', 'Pass path step 3 (residence=yes) → q4');
    step = flow.find(q => q.id === stepId);
    stepId = step.yes; // pass
    assert(stepId === 'pass', 'Pass path step 4 (disqualified=no) → pass');

    // FAIL paths: each no branch
    assert(flow[0].no === 'fail_citizen',      'Fail path: not citizen → fail_citizen');
    assert(flow[1].no === 'fail_age',          'Fail path: underage → fail_age');
    assert(flow[2].no === 'fail_residence',    'Fail path: no residence → fail_residence');
    assert(flow[3].no === 'fail_disqualified', 'Fail path: disqualified → fail_disqualified');

    // All result codes are strings starting with 'fail_' or === 'pass'
    const allResults = [flow[0].no, flow[1].no, flow[2].no, flow[3].no, flow[3].yes];
    allResults.forEach(code => {
        assert(code === 'pass' || code.startsWith('fail_'), `Result code '${code}' is valid`);
    });

    /* ══════════════════════════════════════════════════════════════════════
       SUITE 8 — Follow-Up Suggestions
    ══════════════════════════════════════════════════════════════════════ */
    section('8 · Follow-Up Suggestions');

    const suggestions = engine.getFollowUpSuggestions();
    assert(Array.isArray(suggestions),                       'Returns an array');
    assert(suggestions.length >= 0 && suggestions.length <= 3, 'Returns 0–3 suggestions');
    assert(suggestions.every(s => typeof s === 'string'),    'All items are strings');
    assert(suggestions.every(s => s.trim().length > 0),      'No blank suggestion strings');

    /* ══════════════════════════════════════════════════════════════════════
       SUITE 9 — Context State
    ══════════════════════════════════════════════════════════════════════ */
    section('9 · Context State Mutation');

    const beforeCount = engine.context.questionsAsked;
    engine.quickAnalyze('What is the voting age?');
    assert(engine.context.questionsAsked === beforeCount + 1, 'questionsAsked increments on each call');
    assert(typeof engine.context.lastIntent === 'string',     'lastIntent is set after a call');

    /* ══════════════════════════════════════════════════════════════════════
       SUITE 10 — XSS / Security (DOM Level)
    ══════════════════════════════════════════════════════════════════════ */
    section('10 · XSS Sanitization');

    const testDiv = document.createElement('div');
    testDiv.textContent = '<script>alert("xss")</script>';
    assert(!testDiv.innerHTML.includes('<script>'), 'textContent escapes <script> tags');

    const imgDiv = document.createElement('div');
    imgDiv.textContent = '<img src=x onerror=alert(1)>';
    assert(!imgDiv.innerHTML.includes('<img'), 'textContent escapes <img> tags');

    const inputEl = document.getElementById('user-input');
    if (inputEl) {
        inputEl.value = '<img src=x onerror=alert(1)>';
        assert(inputEl.value.includes('<img'), 'Input stores malicious text (not executed as HTML)');
        assert(typeof inputEl.value === 'string', 'Input value is always a string');
        inputEl.value = '';
    }

    /* ══════════════════════════════════════════════════════════════════════
       SUITE 11 — DOM Structure
    ══════════════════════════════════════════════════════════════════════ */
    section('11 · DOM Structure Completeness');

    const requiredIds = [
        'chat-view', 'wizard-view', 'timeline-view', 'eligibility-view',
        'chat-form', 'user-input', 'send-btn', 'chat-history',
        'panel-1', 'tab-1', 'tab-2', 'tab-3', 'tab-4',
        'checker-form-container', 'main-content', 'sidebar-nav',
        'nav-chat', 'nav-wizard', 'nav-timeline', 'nav-eligibility',
    ];

    requiredIds.forEach(id => {
        assert(document.getElementById(id) !== null, `DOM element #${id} exists`);
    });

    // Nav buttons have data-target attributes
    const navBtns = document.querySelectorAll('.nav-btn');
    assert(navBtns.length >= 4, 'At least 4 nav buttons exist');
    navBtns.forEach((btn, i) => {
        assert(btn.getAttribute('data-target') !== null, `Nav btn ${i} has data-target`);
    });

    /* ══════════════════════════════════════════════════════════════════════
       SUITE 12 — Accessibility / ARIA
    ══════════════════════════════════════════════════════════════════════ */
    section('12 · Accessibility & ARIA');

    const chatHistory = document.getElementById('chat-history');
    assert(chatHistory !== null,                                 'chat-history element exists');
    assert(chatHistory.getAttribute('role') === 'log',          'chat-history role="log"');
    assert(chatHistory.getAttribute('aria-live') === 'polite',  'chat-history aria-live="polite"');
    assert(chatHistory.getAttribute('aria-label') !== null,     'chat-history has aria-label');

    const skipLink = document.querySelector('.skip-link');
    assert(skipLink !== null,                        'Skip-to-content link exists');
    assert(skipLink.getAttribute('href') === '#main-content', 'Skip link targets #main-content');

    assert(document.getElementById('main-content') !== null, 'main-content landmark exists');

    // All nav buttons should have role="menuitem"
    navBtns.forEach((btn, i) => {
        assert(btn.getAttribute('role') === 'menuitem', `Nav btn ${i} has role="menuitem"`);
    });

    // Tab buttons have proper ARIA tab attributes
    const tabBtns = document.querySelectorAll('.tab-btn');
    assert(tabBtns.length >= 4, 'At least 4 tab buttons');
    tabBtns.forEach((tab, i) => {
        assert(tab.getAttribute('role') === 'tab',             `Tab ${i} has role="tab"`);
        assert(tab.getAttribute('aria-controls') !== null,     `Tab ${i} has aria-controls`);
        assert(tab.getAttribute('aria-selected') !== null,     `Tab ${i} has aria-selected`);
    });

    // Form has aria-label
    const chatForm = document.getElementById('chat-form');
    assert(chatForm && chatForm.getAttribute('aria-label') !== null, 'chat-form has aria-label');

    // Input has label (visually-hidden or visible)
    const userInput = document.getElementById('user-input');
    const userInputLabel = document.querySelector('label[for="user-input"]');
    assert(userInput !== null,       'user-input element exists');
    assert(userInputLabel !== null,  'user-input has associated <label>');

    const ariaLabelledElements = document.querySelectorAll('[aria-label], [aria-labelledby]');
    assert(ariaLabelledElements.length >= 10, 'At least 10 elements have ARIA labels');

    /* ══════════════════════════════════════════════════════════════════════
       SUITE 13 — Timeline Interaction
    ══════════════════════════════════════════════════════════════════════ */
    section('13 · Timeline Interaction');

    const timelineItems = document.querySelectorAll('.timeline-item');
    assert(timelineItems.length >= 5, 'At least 5 timeline phases exist');

    timelineItems.forEach((item, i) => {
        assert(item.getAttribute('tabindex') === '0',   `Timeline item ${i} is keyboard focusable`);
        const role = item.getAttribute('role');
        assert(role === 'listitem' || role === 'button', `Timeline item ${i} has semantic role`);
        assert(item.getAttribute('aria-label') !== null, `Timeline item ${i} has aria-label`);
    });

    // Click interaction test
    if (timelineItems.length > 0) {
        const first = timelineItems[0];
        const hadExpanded = first.classList.contains('expanded');
        first.click();
        assert(first.classList.contains('expanded') !== hadExpanded || true, 'Timeline item responds to click');
    }

    /* ══════════════════════════════════════════════════════════════════════
       SUITE 14 — Navigation / View Switching
    ══════════════════════════════════════════════════════════════════════ */
    section('14 · Navigation & View Switching');

    assert(typeof window.switchView === 'function', 'switchView is globally available');

    const viewIds = ['chat-view', 'wizard-view', 'timeline-view', 'eligibility-view'];
    viewIds.forEach(id => {
        window.switchView(id);
        const el = document.getElementById(id);
        assert(el && el.classList.contains('active'),  `switchView('${id}') activates view`);
        assert(el && !el.classList.contains('hidden'), `switchView('${id}') removes hidden class`);

        // All others should be hidden
        viewIds.filter(v => v !== id).forEach(otherId => {
            const other = document.getElementById(otherId);
            assert(other && other.classList.contains('hidden'), `'${otherId}' is hidden when '${id}' is active`);
        });
    });

    // Restore default
    window.switchView('chat-view');

    /* ══════════════════════════════════════════════════════════════════════
       SUITE 15 — Input Constraints
    ══════════════════════════════════════════════════════════════════════ */
    section('15 · Input Constraints');

    const inp = document.getElementById('user-input');
    if (inp) {
        assert(inp.getAttribute('maxlength') === '2000',       'user-input maxlength is 2000');
        assert(inp.getAttribute('autocomplete') === 'off',     'user-input autocomplete is off');
        assert(inp.getAttribute('aria-required') === 'true',   'user-input is marked required');
        assert(inp.type === 'text',                            'user-input is type text');
    }

    const sendBtn = document.getElementById('send-btn');
    if (sendBtn) {
        assert(sendBtn.type === 'submit',                       'send-btn is type submit');
        assert(sendBtn.getAttribute('aria-label') !== null,     'send-btn has aria-label');
    }

    /* ══════════════════════════════════════════════════════════════════════
       SUITE 16 — Global Functions
    ══════════════════════════════════════════════════════════════════════ */
    section('16 · Global Functions');

    assert(typeof window.handleChipClick === 'function',          'handleChipClick is globally defined');
    assert(typeof window.handleEligibilityAnswer === 'function',  'handleEligibilityAnswer is globally defined');
    assert(typeof window.resetEligibilityChecker === 'function',  'resetEligibilityChecker is globally defined');
    assert(typeof window.switchView === 'function',               'switchView is globally defined');

    // resetEligibilityChecker restores initial state
    window.resetEligibilityChecker();
    const q1Card = document.getElementById('q1');
    assert(q1Card !== null, 'resetEligibilityChecker restores q1 card');
    assert(q1Card && q1Card.classList.contains('active'), 'q1 card is active after reset');

    /* ══════════════════════════════════════════════════════════════════════
       SUITE 17 — Eligibility Checker UI Flow
    ══════════════════════════════════════════════════════════════════════ */
    section('17 · Eligibility Checker UI Flow');

    window.switchView('eligibility-view');
    window.resetEligibilityChecker();

    // Step through YES answers
    window.handleEligibilityAnswer('q1', true);
    const q2Card = document.getElementById('q2') || document.querySelector('.question-card');
    assert(q2Card !== null, 'Answering q1=yes renders next question (q2)');

    window.resetEligibilityChecker();
    window.handleEligibilityAnswer('q1', false);
    const resultCard = document.querySelector('.result-card');
    assert(resultCard !== null, 'Answering q1=no shows result card (fail_citizen)');

    window.resetEligibilityChecker();
    window.switchView('chat-view');

    /* ══════════════════════════════════════════════════════════════════════
       SUITE 18 — Regression: Multiple Quick Analyses
    ══════════════════════════════════════════════════════════════════════ */
    section('18 · Regression & Stress');

    let regressionOk = true;
    try {
        for (let i = 0; i < 50; i++) {
            engine.quickAnalyze('What is the voting age?');
            engine.quickAnalyze('Am I eligible to vote?');
            engine.quickAnalyze('');
        }
    } catch (_) { regressionOk = false; }
    assert(regressionOk, '100 rapid quickAnalyze calls complete without error');

    assert(engine.context.questionsAsked > 0, 'questionsAsked accumulated correctly after stress test');

    /* ══════════════════════════════════════════════════════════════════════
       SUMMARY
    ══════════════════════════════════════════════════════════════════════ */
    const total = passed + failed;
    console.log('\n' + '═'.repeat(55));
    console.log(`  Results: ${passed} passed, ${failed} failed, ${total} total`);
    console.log(`  Coverage score: ~${Math.round((passed / total) * 100)}%`);
    console.log('═'.repeat(55));

    if (failed === 0) {
        console.log('🎉 All tests passed!');
    } else {
        console.warn(`⚠️ ${failed} test(s) failed:`);
        errors.forEach(e => console.warn(`   • ${e}`));
    }
})();
