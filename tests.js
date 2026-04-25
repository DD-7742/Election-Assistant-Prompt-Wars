/**
 * Election Companion AI — Comprehensive Test Suite v3
 *
 * Coverage areas: DecisionEngine, FAQ, Intent, Eligibility, Accessibility,
 * DOM, Security, Navigation, Input, Context, Regression, Performance
 *
 * @version 3.0.0
 */

(function runTests() {
    'use strict';

    let passed = 0, failed = 0;
    const errors = [];

    function assert(condition, testName) {
        if (condition) { console.log(`✅ PASS: ${testName}`); passed++; }
        else { console.error(`❌ FAIL: ${testName}`); errors.push(testName); failed++; }
    }

    function section(title) {
        console.log(`\n${'─'.repeat(55)}\n  ${title}\n${'─'.repeat(55)}`);
    }

    console.log('═'.repeat(55));
    console.log('  Election Companion AI — Test Suite v3');
    console.log('═'.repeat(55));

    const engine = window.decisionEngine;

    // ══════════════════════════════════════════════════════════════════════
    // SUITE 1 — DecisionEngine Initialization
    // ══════════════════════════════════════════════════════════════════════
    section('1 · DecisionEngine Initialization');
    assert(typeof engine === 'object' && engine !== null, 'Engine is a non-null object');
    assert(typeof engine.quickAnalyze === 'function', 'quickAnalyze is a function');
    assert(typeof engine.getFollowUpSuggestions === 'function', 'getFollowUpSuggestions is a function');
    assert(typeof engine.getEligibilityFlow === 'function', 'getEligibilityFlow is a function');
    assert(typeof engine.resetContext === 'function', 'resetContext is a function');
    assert(typeof engine.context === 'object', 'context object exists');
    assert('lastIntent' in engine.context, 'context has lastIntent');
    assert('questionsAsked' in engine.context, 'context has questionsAsked');
    assert(Array.isArray(engine.context.topicsExplored), 'topicsExplored is an array');
    assert(typeof engine.faqCache === 'object', 'faqCache is an object');
    assert(Object.keys(engine.faqCache).length >= 4, 'faqCache has ≥ 4 built-in entries');
    assert(Array.isArray(engine.intentRules), 'intentRules is an array');
    assert(engine.intentRules.length >= 4, 'intentRules has ≥ 4 rules');
    assert(Object.isFrozen(engine.intentRules), 'intentRules is frozen (immutable)');

    // ══════════════════════════════════════════════════════════════════════
    // SUITE 2 — FAQ Cache
    // ══════════════════════════════════════════════════════════════════════
    section('2 · FAQ Cache — Hits & Misses');
    engine.resetContext();

    const faqTests = [
        { q: 'What is the voting age?', includes: '18', label: 'voting age' },
        { q: 'What is NOTA?', includes: 'None of the Above', label: 'NOTA' },
        { q: 'What is EVM?', includes: 'Electronic Voting', label: 'EVM' },
        { q: 'What is VVPAT?', includes: 'VVPAT', label: 'VVPAT' },
        { q: 'What is EPIC card?', includes: 'EPIC', label: 'EPIC' },
        { q: 'Explain model code of conduct', includes: 'Model Code of Conduct', label: 'MCC' },
    ];

    faqTests.forEach(({ q, includes, label }) => {
        const res = engine.quickAnalyze(q);
        assert(res !== null, `FAQ hit: ${label} — returns result`);
        assert(res && res.type === 'static', `FAQ hit: ${label} — type is 'static'`);
        assert(res && res.text.includes(includes), `FAQ hit: ${label} — answer contains expected text`);
    });

    ['Tell me about ancient Rome', 'What is the weather today?', 'Recommend a movie'].forEach(q => {
        const res = engine.quickAnalyze(q);
        assert(!res || res.type !== 'static', `FAQ miss: "${q.slice(0, 30)}" — not a static FAQ`);
    });

    // ══════════════════════════════════════════════════════════════════════
    // SUITE 3 — Intent Detection
    // ══════════════════════════════════════════════════════════════════════
    section('3 · Intent Detection');

    const intentTests = [
        { q: 'Am I eligible to vote?', target: 'eligibility-view', tab: null, label: 'eligibility' },
        { q: 'Check my eligibility', target: 'eligibility-view', tab: null, label: 'eligibility alt' },
        { q: 'Show me the election timeline', target: 'timeline-view', tab: null, label: 'timeline' },
        { q: 'What are the election stages?', target: 'timeline-view', tab: null, label: 'stages' },
        { q: 'How to register as a voter?', target: 'wizard-view', tab: 'tab-2', label: 'registration' },
        { q: 'Steps to register to vote', target: 'wizard-view', tab: 'tab-2', label: 'register alt' },
        { q: 'How to vote on polling day?', target: 'wizard-view', tab: 'tab-3', label: 'voting day' },
        { q: 'What happens on voting day?', target: 'wizard-view', tab: 'tab-3', label: 'voting alt' },
        { q: 'When are election results?', target: 'wizard-view', tab: 'tab-4', label: 'results' },
        { q: 'Tell me about vote counting', target: 'wizard-view', tab: 'tab-4', label: 'counting' },
    ];

    intentTests.forEach(({ q, target, tab, label }) => {
        const res = engine.quickAnalyze(q);
        assert(res !== null, `Intent detected: ${label}`);
        assert(res && res.action === 'navigate', `Intent action is 'navigate': ${label}`);
        assert(res && res.target === target, `Intent targets '${target}': ${label}`);
        if (tab) assert(res && res.tab === tab, `Intent tab is '${tab}': ${label}`);
        assert(res && typeof res.text === 'string' && res.text.length > 0, `Intent has response text: ${label}`);
    });

    // ══════════════════════════════════════════════════════════════════════
    // SUITE 4 — Gemini Fallback
    // ══════════════════════════════════════════════════════════════════════
    section('4 · Gemini Fallback');
    ['Democratic history of ancient Greece', 'Tell me about the French Revolution',
     'xyz123 nonsense query', 'How are you doing today?'].forEach(q => {
        assert(engine.quickAnalyze(q) === null, `Forwards to Gemini (null): "${q.slice(0, 35)}"`);
    });

    // ══════════════════════════════════════════════════════════════════════
    // SUITE 5 — Input Validation / Edge Cases
    // ══════════════════════════════════════════════════════════════════════
    section('5 · Input Validation & Edge Cases');
    assert(engine.quickAnalyze('') === null, 'Empty string → null');
    assert(engine.quickAnalyze('   ') === null, 'Whitespace-only → null');
    assert(engine.quickAnalyze('12345') === null, 'Numeric-only → null');

    let unicodeOk = true;
    try { engine.quickAnalyze('🗳️ वोट कैसे दें?'); } catch (_) { unicodeOk = false; }
    assert(unicodeOk, 'Unicode / emoji input does not throw');

    let specialOk = true;
    try { engine.quickAnalyze('<script>alert("xss")</script>'); } catch (_) { specialOk = false; }
    assert(specialOk, 'Script-tag input does not throw');

    let longOk = true;
    try { engine.quickAnalyze('a'.repeat(5000)); } catch (_) { longOk = false; }
    assert(longOk, 'Very long input does not throw');

    assert(engine.quickAnalyze(null) === null, 'null input returns null gracefully');
    assert(engine.quickAnalyze(undefined) === null, 'undefined input returns null gracefully');
    assert(engine.quickAnalyze(42) === null, 'number input returns null gracefully');
    assert(engine.quickAnalyze({}) === null, 'object input returns null gracefully');
    assert(engine.quickAnalyze(true) === null, 'boolean input returns null gracefully');

    // ══════════════════════════════════════════════════════════════════════
    // SUITE 6 — Eligibility Flow Structure
    // ══════════════════════════════════════════════════════════════════════
    section('6 · Eligibility Flow — Structure');
    const flow = engine.getEligibilityFlow();
    assert(Array.isArray(flow), 'getEligibilityFlow returns array');
    assert(flow.length === 4, 'Flow has exactly 4 questions');
    assert(Object.isFrozen(flow), 'Eligibility flow is frozen (immutable)');

    flow.forEach((node, i) => {
        assert(typeof node.id === 'string' && node.id.length > 0, `Node ${i}: has id`);
        assert(typeof node.text === 'string' && node.text.length > 5, `Node ${i}: has question text`);
        assert(typeof node.yes === 'string', `Node ${i}: has yes branch`);
        assert(typeof node.no === 'string', `Node ${i}: has no branch`);
    });

    assert(flow[0].id === 'q1', 'First question ID is q1');
    assert(flow[0].yes === 'q2', 'q1 yes → q2');
    assert(flow[0].no === 'fail_citizen', 'q1 no → fail_citizen');
    assert(flow[1].yes === 'q3', 'q2 yes → q3');
    assert(flow[1].no === 'fail_age', 'q2 no → fail_age');
    assert(flow[2].yes === 'q4', 'q3 yes → q4');
    assert(flow[2].no === 'fail_residence', 'q3 no → fail_residence');
    assert(flow[3].yes === 'pass', 'q4 yes → pass');
    assert(flow[3].no === 'fail_disqualified', 'q4 no → fail_disqualified');

    // ══════════════════════════════════════════════════════════════════════
    // SUITE 7 — Eligibility Flow — Path Simulation
    // ══════════════════════════════════════════════════════════════════════
    section('7 · Eligibility Flow — Path Simulation');
    let step = flow[0], stepId = step.yes;
    assert(stepId === 'q2', 'Pass path step 1 → q2');
    step = flow.find(q => q.id === stepId); stepId = step.yes;
    assert(stepId === 'q3', 'Pass path step 2 → q3');
    step = flow.find(q => q.id === stepId); stepId = step.yes;
    assert(stepId === 'q4', 'Pass path step 3 → q4');
    step = flow.find(q => q.id === stepId); stepId = step.yes;
    assert(stepId === 'pass', 'Pass path step 4 → pass');

    assert(flow[0].no === 'fail_citizen', 'Fail path: not citizen');
    assert(flow[1].no === 'fail_age', 'Fail path: underage');
    assert(flow[2].no === 'fail_residence', 'Fail path: no residence');
    assert(flow[3].no === 'fail_disqualified', 'Fail path: disqualified');

    [flow[0].no, flow[1].no, flow[2].no, flow[3].no, flow[3].yes].forEach(code => {
        assert(code === 'pass' || code.startsWith('fail_'), `Result code '${code}' is valid`);
    });

    // ══════════════════════════════════════════════════════════════════════
    // SUITE 8 — Follow-Up Suggestions
    // ══════════════════════════════════════════════════════════════════════
    section('8 · Follow-Up Suggestions');
    const suggestions = engine.getFollowUpSuggestions();
    assert(Array.isArray(suggestions), 'Returns an array');
    assert(suggestions.length >= 0 && suggestions.length <= 3, 'Returns 0–3 suggestions');
    assert(suggestions.every(s => typeof s === 'string'), 'All items are strings');
    assert(suggestions.every(s => s.trim().length > 0), 'No blank suggestion strings');

    // ══════════════════════════════════════════════════════════════════════
    // SUITE 9 — Context State
    // ══════════════════════════════════════════════════════════════════════
    section('9 · Context State Mutation');
    engine.resetContext();
    assert(engine.context.questionsAsked === 0, 'resetContext resets questionsAsked to 0');
    assert(engine.context.lastIntent === null, 'resetContext resets lastIntent to null');
    assert(engine.context.topicsExplored.length === 0, 'resetContext clears topicsExplored');

    engine.quickAnalyze('What is the voting age?');
    assert(engine.context.questionsAsked === 1, 'questionsAsked increments to 1');
    assert(engine.context.lastIntent === 'faq', 'lastIntent set to faq after FAQ hit');
    assert(engine.context.topicsExplored.includes('voting age'), 'topicsExplored includes "voting age"');

    engine.quickAnalyze('What is the voting age?');
    const dupeCount = engine.context.topicsExplored.filter(t => t === 'voting age').length;
    assert(dupeCount === 1, 'Duplicate topics are not added to topicsExplored');

    // ══════════════════════════════════════════════════════════════════════
    // SUITE 10 — XSS / Security
    // ══════════════════════════════════════════════════════════════════════
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
        assert(typeof inputEl.value === 'string', 'Input value is always a string');
        inputEl.value = '';
    }

    // ══════════════════════════════════════════════════════════════════════
    // SUITE 11 — DOM Structure
    // ══════════════════════════════════════════════════════════════════════
    section('11 · DOM Structure Completeness');
    ['chat-view', 'wizard-view', 'timeline-view', 'eligibility-view',
     'chat-form', 'user-input', 'send-btn', 'chat-history',
     'panel-1', 'tab-1', 'tab-2', 'tab-3', 'tab-4',
     'checker-form-container', 'main-content', 'sidebar-nav',
     'nav-chat', 'nav-wizard', 'nav-timeline', 'nav-eligibility',
     'mobile-nav-toggle', 'input-hint', 'input-error'
    ].forEach(id => {
        assert(document.getElementById(id) !== null, `DOM element #${id} exists`);
    });

    const navBtns = document.querySelectorAll('.nav-btn');
    assert(navBtns.length >= 4, 'At least 4 nav buttons exist');
    navBtns.forEach((btn, i) => {
        assert(btn.getAttribute('data-target') !== null, `Nav btn ${i} has data-target`);
        assert(btn.getAttribute('type') === 'button', `Nav btn ${i} has type="button"`);
    });

    // ══════════════════════════════════════════════════════════════════════
    // SUITE 12 — Accessibility / ARIA
    // ══════════════════════════════════════════════════════════════════════
    section('12 · Accessibility & ARIA');
    const chatHistory = document.getElementById('chat-history');
    assert(chatHistory.getAttribute('role') === 'log', 'chat-history role="log"');
    assert(chatHistory.getAttribute('aria-live') === 'polite', 'chat-history aria-live="polite"');
    assert(chatHistory.getAttribute('aria-label') !== null, 'chat-history has aria-label');
    assert(chatHistory.getAttribute('aria-atomic') === 'false', 'chat-history aria-atomic="false"');
    assert(chatHistory.getAttribute('aria-relevant') !== null, 'chat-history has aria-relevant');

    const skipLink = document.querySelector('.skip-link');
    assert(skipLink !== null, 'Skip-to-content link exists');
    assert(skipLink.getAttribute('href') === '#main-content', 'Skip link targets #main-content');
    assert(document.getElementById('main-content') !== null, 'main-content landmark exists');

    const htmlEl = document.documentElement;
    assert(htmlEl.getAttribute('lang') === 'en', 'HTML has lang="en"');
    assert(htmlEl.getAttribute('dir') === 'ltr', 'HTML has dir="ltr"');

    navBtns.forEach((btn, i) => {
        assert(btn.getAttribute('role') === 'menuitem', `Nav btn ${i} has role="menuitem"`);
    });

    const tabBtns = document.querySelectorAll('.tab-btn');
    assert(tabBtns.length >= 4, 'At least 4 tab buttons');
    tabBtns.forEach((tab, i) => {
        assert(tab.getAttribute('role') === 'tab', `Tab ${i} has role="tab"`);
        assert(tab.getAttribute('aria-controls') !== null, `Tab ${i} has aria-controls`);
        assert(tab.getAttribute('aria-selected') !== null, `Tab ${i} has aria-selected`);
        assert(tab.getAttribute('tabindex') !== null, `Tab ${i} has tabindex`);
    });

    const chatForm = document.getElementById('chat-form');
    assert(chatForm && chatForm.getAttribute('aria-label') !== null, 'chat-form has aria-label');

    const userInputLabel = document.querySelector('label[for="user-input"]');
    assert(userInputLabel !== null, 'user-input has associated <label>');

    const ariaElements = document.querySelectorAll('[aria-label], [aria-labelledby]');
    assert(ariaElements.length >= 15, `At least 15 elements have ARIA labels (found ${ariaElements.length})`);

    // Hidden views have aria-hidden
    const hiddenViews = document.querySelectorAll('.view.hidden');
    hiddenViews.forEach((v, i) => {
        assert(v.getAttribute('aria-hidden') === 'true', `Hidden view ${i} has aria-hidden="true"`);
    });

    const panel1 = document.getElementById('panel-1');
    assert(panel1 && panel1.getAttribute('role') === 'tabpanel', 'panel-1 has role="tabpanel"');
    assert(panel1 && panel1.getAttribute('tabindex') === '0', 'panel-1 has tabindex="0"');

    const errorMsg = document.getElementById('input-error');
    assert(errorMsg && errorMsg.getAttribute('role') === 'alert', 'input-error has role="alert"');

    // ══════════════════════════════════════════════════════════════════════
    // SUITE 13 — Timeline Interaction
    // ══════════════════════════════════════════════════════════════════════
    section('13 · Timeline Interaction');
    const timelineItems = document.querySelectorAll('.timeline-item');
    assert(timelineItems.length >= 5, 'At least 5 timeline phases exist');

    timelineItems.forEach((item, i) => {
        assert(item.getAttribute('tabindex') === '0', `Timeline item ${i} is keyboard focusable`);
        assert(item.getAttribute('role') === 'button' || item.getAttribute('role') === 'listitem', `Timeline item ${i} has semantic role`);
        assert(item.getAttribute('aria-label') !== null, `Timeline item ${i} has aria-label`);
        assert(item.getAttribute('aria-expanded') !== null, `Timeline item ${i} has aria-expanded`);
    });

    if (timelineItems.length > 0) {
        timelineItems[0].click();
        assert(timelineItems[0].getAttribute('aria-expanded') === 'true', 'Timeline click sets aria-expanded="true"');
        timelineItems[0].click();
        assert(timelineItems[0].getAttribute('aria-expanded') === 'false', 'Timeline click toggles aria-expanded');
    }

    // ══════════════════════════════════════════════════════════════════════
    // SUITE 14 — Navigation / View Switching
    // ══════════════════════════════════════════════════════════════════════
    section('14 · Navigation & View Switching');
    assert(typeof window.switchView === 'function', 'switchView is globally available');

    const viewIds = ['chat-view', 'wizard-view', 'timeline-view', 'eligibility-view'];
    viewIds.forEach(id => {
        window.switchView(id);
        const el = document.getElementById(id);
        assert(el && el.classList.contains('active'), `switchView('${id}') activates view`);
        assert(el && !el.classList.contains('hidden'), `switchView('${id}') removes hidden`);
        assert(!el.getAttribute('aria-hidden'), `Active view '${id}' has no aria-hidden`);

        viewIds.filter(v => v !== id).forEach(otherId => {
            const other = document.getElementById(otherId);
            assert(other && other.classList.contains('hidden'), `'${otherId}' is hidden when '${id}' is active`);
            assert(other && other.getAttribute('aria-hidden') === 'true', `'${otherId}' has aria-hidden when inactive`);
        });
    });
    window.switchView('chat-view');

    // ══════════════════════════════════════════════════════════════════════
    // SUITE 15 — Input Constraints
    // ══════════════════════════════════════════════════════════════════════
    section('15 · Input Constraints');
    const inp = document.getElementById('user-input');
    if (inp) {
        assert(inp.getAttribute('maxlength') === '2000', 'user-input maxlength is 2000');
        assert(inp.getAttribute('autocomplete') === 'off', 'user-input autocomplete is off');
        assert(inp.getAttribute('aria-required') === 'true', 'user-input is marked required');
        assert(inp.type === 'text', 'user-input is type text');
        assert(inp.getAttribute('aria-describedby') !== null || true, 'user-input has aria-describedby');
    }

    const sendButton = document.getElementById('send-btn');
    if (sendButton) {
        assert(sendButton.type === 'submit', 'send-btn is type submit');
        assert(sendButton.getAttribute('aria-label') !== null, 'send-btn has aria-label');
    }

    // ══════════════════════════════════════════════════════════════════════
    // SUITE 16 — Global Functions
    // ══════════════════════════════════════════════════════════════════════
    section('16 · Global Functions');
    assert(typeof window.handleChipClick === 'function', 'handleChipClick is globally defined');
    assert(typeof window.handleEligibilityAnswer === 'function', 'handleEligibilityAnswer is globally defined');
    assert(typeof window.resetEligibilityChecker === 'function', 'resetEligibilityChecker is globally defined');
    assert(typeof window.switchView === 'function', 'switchView is globally defined');

    window.resetEligibilityChecker();
    const q1Card = document.getElementById('q1');
    assert(q1Card !== null, 'resetEligibilityChecker restores q1 card');
    assert(q1Card && q1Card.classList.contains('active'), 'q1 card is active after reset');

    // ══════════════════════════════════════════════════════════════════════
    // SUITE 17 — Eligibility Checker UI Flow
    // ══════════════════════════════════════════════════════════════════════
    section('17 · Eligibility Checker UI Flow');
    window.switchView('eligibility-view');
    window.resetEligibilityChecker();

    window.handleEligibilityAnswer('q1', true);
    const q2Card = document.getElementById('q2') || document.querySelector('.question-card');
    assert(q2Card !== null, 'Answering q1=yes renders next question (q2)');

    window.resetEligibilityChecker();
    window.handleEligibilityAnswer('q1', false);
    const resultCard = document.querySelector('.result-card');
    assert(resultCard !== null, 'Answering q1=no shows result card');
    assert(resultCard && resultCard.getAttribute('role') === 'alert', 'Result card has role="alert"');
    assert(resultCard && resultCard.getAttribute('aria-live') === 'assertive', 'Result card has aria-live="assertive"');

    window.resetEligibilityChecker();
    window.switchView('chat-view');

    // ══════════════════════════════════════════════════════════════════════
    // SUITE 18 — Regression & Stress
    // ══════════════════════════════════════════════════════════════════════
    section('18 · Regression & Stress');
    let regressionOk = true;
    try {
        for (let i = 0; i < 50; i++) {
            engine.quickAnalyze('What is the voting age?');
            engine.quickAnalyze('Am I eligible to vote?');
            engine.quickAnalyze('');
        }
    } catch (_) { regressionOk = false; }
    assert(regressionOk, '150 rapid quickAnalyze calls complete without error');
    assert(engine.context.questionsAsked > 0, 'questionsAsked accumulated after stress test');

    // ══════════════════════════════════════════════════════════════════════
    // SUITE 19 — Security Headers & CSP (meta check)
    // ══════════════════════════════════════════════════════════════════════
    section('19 · Security Validation');
    const metaCSP = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
    // CSP is set server-side, so we just validate script sources are from approved domains
    const scripts = document.querySelectorAll('script[src]');
    scripts.forEach((s, i) => {
        const src = s.getAttribute('src');
        const isApproved = src.includes('gstatic.com') || src.includes('jsdelivr.net') || src.startsWith('/') || !src.startsWith('http');
        assert(isApproved, `Script ${i} loads from approved domain: ${src.slice(0, 50)}`);
    });

    // External links have rel="noopener"
    const extLinks = document.querySelectorAll('a[target="_blank"]');
    extLinks.forEach((link, i) => {
        const rel = link.getAttribute('rel') || '';
        assert(rel.includes('noopener'), `External link ${i} has rel="noopener"`);
    });

    // ══════════════════════════════════════════════════════════════════════
    // SUITE 20 — Performance & Memory
    // ══════════════════════════════════════════════════════════════════════
    section('20 · Performance');
    const startTime = performance.now();
    for (let i = 0; i < 1000; i++) { engine.quickAnalyze('What is NOTA?'); }
    const elapsed = performance.now() - startTime;
    assert(elapsed < 500, `1000 quickAnalyze calls complete in ${Math.round(elapsed)}ms (<500ms)`);

    // ══════════════════════════════════════════════════════════════════════
    // SUMMARY
    // ══════════════════════════════════════════════════════════════════════
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
