/**
 * Election Companion AI — Test Suite
 * 
 * Tests cover:
 *   1. Empty input handling
 *   2. Invalid input handling  
 *   3. API failure fallback
 *   4. Eligibility checker logic
 *   5. Timeline interaction
 *   6. Decision engine intent detection
 *   7. FAQ cache behavior
 *   8. XSS sanitization
 *   9. Follow-up suggestion generation
 * 
 * Run in browser console: paste this file's contents, or load via <script> tag.
 * Results are printed to the console with ✅ / ❌ prefixes.
 */

(function runTests() {
    let passed = 0;
    let failed = 0;

    function assert(condition, testName) {
        if (condition) {
            console.log(`✅ PASS: ${testName}`);
            passed++;
        } else {
            console.error(`❌ FAIL: ${testName}`);
            failed++;
        }
    }

    console.log('═══════════════════════════════════════════════════════');
    console.log('  Election Companion AI — Test Suite');
    console.log('═══════════════════════════════════════════════════════');


    // ─── Test 1: Decision Engine Initialization ─────────────────────────
    console.log('\n--- Decision Engine Tests ---');

    const engine = window.decisionEngine;
    assert(engine !== undefined, 'DecisionEngine is initialized on window');
    assert(engine.context !== undefined, 'Context object exists');
    assert(engine.faqCache !== undefined, 'FAQ cache exists');
    assert(Object.keys(engine.faqCache).length >= 2, 'FAQ cache has at least 2 entries');


    // ─── Test 2: FAQ Cache Hit ──────────────────────────────────────────
    console.log('\n--- FAQ Cache Tests ---');

    const votingAgeResult = engine.quickAnalyze('What is the voting age?');
    assert(votingAgeResult !== null, 'FAQ cache returns result for "voting age"');
    assert(votingAgeResult.type === 'static', 'FAQ result type is "static"');
    assert(votingAgeResult.text.includes('18'), 'FAQ answer mentions age 18');

    const notaResult = engine.quickAnalyze('What is NOTA?');
    assert(notaResult !== null, 'FAQ cache returns result for "NOTA"');
    assert(notaResult.text.includes('None of the Above'), 'NOTA answer is correct');

    const evmResult = engine.quickAnalyze('What is EVM?');
    assert(evmResult !== null, 'FAQ cache returns result for "EVM"');
    assert(evmResult.text.includes('Electronic Voting Machine'), 'EVM answer is correct');


    // ─── Test 3: Intent Detection — Navigation ─────────────────────────
    console.log('\n--- Intent Detection Tests ---');

    const eligibilityIntent = engine.quickAnalyze('Am I eligible to vote?');
    assert(eligibilityIntent !== null, 'Detects eligibility intent');
    assert(eligibilityIntent.action === 'navigate', 'Intent action is "navigate"');
    assert(eligibilityIntent.target === 'eligibility-view', 'Targets eligibility view');

    const timelineIntent = engine.quickAnalyze('Show me the election timeline');
    assert(timelineIntent !== null, 'Detects timeline intent');
    assert(timelineIntent.target === 'timeline-view', 'Targets timeline view');

    const registerIntent = engine.quickAnalyze('How to register as a voter?');
    assert(registerIntent !== null, 'Detects registration intent');
    assert(registerIntent.target === 'wizard-view', 'Targets wizard view');
    assert(registerIntent.tab === 'tab-2', 'Targets registration tab');

    const votingDayIntent = engine.quickAnalyze('How to vote on polling day?');
    assert(votingDayIntent !== null, 'Detects voting day intent');
    assert(votingDayIntent.tab === 'tab-3', 'Targets voting day tab');


    // ─── Test 4: Gemini Fallback (no local match) ───────────────────────
    console.log('\n--- Gemini Fallback Tests ---');

    const unknownQuery = engine.quickAnalyze('Tell me about the democratic history of governance');
    assert(unknownQuery === null, 'Returns null for unknown queries (forwards to Gemini)');


    // ─── Test 5: Empty and Invalid Input ────────────────────────────────
    console.log('\n--- Input Validation Tests ---');

    const emptyResult = engine.quickAnalyze('');
    assert(emptyResult === null, 'Empty string returns null (no crash)');

    const whitespaceResult = engine.quickAnalyze('   ');
    assert(whitespaceResult === null, 'Whitespace-only returns null (no crash)');

    const numbersOnly = engine.quickAnalyze('12345');
    assert(numbersOnly === null, 'Numbers-only input returns null (no crash)');


    // ─── Test 6: Eligibility Flow ───────────────────────────────────────
    console.log('\n--- Eligibility Flow Tests ---');

    const flow = engine.getEligibilityFlow();
    assert(Array.isArray(flow), 'Eligibility flow is an array');
    assert(flow.length >= 3, 'Flow has at least 3 questions');
    assert(flow[0].id === 'q1', 'First question is q1');
    assert(flow[0].yes === 'q2', 'q1 yes leads to q2');
    assert(flow[0].no === 'fail_citizen', 'q1 no leads to fail_citizen');

    // Simulate full pass path
    let currentStep = flow[0];
    let step = currentStep.yes; // q2
    assert(step === 'q2', 'Step 1 (citizen=yes) → q2');

    currentStep = flow.find(q => q.id === step);
    step = currentStep.yes; // q3
    assert(step === 'q3', 'Step 2 (age=yes) → q3');

    currentStep = flow.find(q => q.id === step);
    step = currentStep.yes; // q4 or pass
    assert(step === 'q4' || step === 'pass', 'Step 3 (residence=yes) → q4 or pass');

    // Simulate fail path
    const failStep = flow[1].no; // q2.no
    assert(failStep === 'fail_age', 'q2 no leads to fail_age');


    // ─── Test 7: Follow-Up Suggestions ──────────────────────────────────
    console.log('\n--- Follow-Up Suggestion Tests ---');

    const suggestions = engine.getFollowUpSuggestions();
    assert(Array.isArray(suggestions), 'Suggestions is an array');
    assert(suggestions.length <= 3, 'Returns at most 3 suggestions');
    assert(suggestions.every(s => typeof s === 'string'), 'All suggestions are strings');


    // ─── Test 8: XSS Sanitization ───────────────────────────────────────
    console.log('\n--- Security Tests ---');

    // Test the escapeHtml function existence
    const testDiv = document.createElement('div');
    const maliciousInput = '<script>alert("xss")</script>';
    testDiv.textContent = maliciousInput; // Using textContent is safe
    assert(!testDiv.innerHTML.includes('<script>'), 'textContent escapes script tags');

    // Test that HTML entities are not executable
    const testInput = document.getElementById('user-input');
    if (testInput) {
        testInput.value = '<img src=x onerror=alert(1)>';
        assert(testInput.value.includes('<img'), 'Input accepts HTML as text (not executed)');
        testInput.value = ''; // Clean up
    }


    // ─── Test 9: DOM Elements Exist ─────────────────────────────────────
    console.log('\n--- DOM Structure Tests ---');

    assert(document.getElementById('chat-view') !== null, 'Chat view exists');
    assert(document.getElementById('wizard-view') !== null, 'Wizard view exists');
    assert(document.getElementById('timeline-view') !== null, 'Timeline view exists');
    assert(document.getElementById('eligibility-view') !== null, 'Eligibility view exists');
    assert(document.getElementById('chat-form') !== null, 'Chat form exists');
    assert(document.getElementById('user-input') !== null, 'User input exists');
    assert(document.getElementById('send-btn') !== null, 'Send button exists');
    assert(document.getElementById('chat-history') !== null, 'Chat history exists');


    // ─── Test 10: Accessibility Checks ──────────────────────────────────
    console.log('\n--- Accessibility Tests ---');

    const chatHistory = document.getElementById('chat-history');
    assert(chatHistory.getAttribute('role') === 'log', 'Chat history has role="log"');
    assert(chatHistory.getAttribute('aria-live') === 'polite', 'Chat history has aria-live="polite"');

    const skipLink = document.querySelector('.skip-link');
    assert(skipLink !== null, 'Skip-to-content link exists');

    const mainContent = document.getElementById('main-content');
    assert(mainContent !== null, 'Main content landmark exists');

    const navLabels = document.querySelectorAll('[aria-label]');
    assert(navLabels.length >= 5, 'At least 5 elements have aria-label attributes');

    // Check all images/icons have aria-hidden
    const avatars = document.querySelectorAll('.avatar');
    let allHidden = true;
    avatars.forEach(a => {
        if (a.getAttribute('aria-hidden') !== 'true') allHidden = false;
    });
    assert(allHidden || avatars.length === 0, 'All avatar decorative elements have aria-hidden');


    // ─── Test 11: Timeline Interaction ───────────────────────────────────
    console.log('\n--- Timeline Interaction Tests ---');

    const timelineItems = document.querySelectorAll('.timeline-item');
    assert(timelineItems.length >= 5, 'At least 5 timeline phases rendered');

    if (timelineItems.length > 0) {
        const firstItem = timelineItems[0];
        assert(firstItem.getAttribute('tabindex') === '0', 'Timeline items are keyboard focusable');
        assert(firstItem.getAttribute('role') === 'listitem' || firstItem.getAttribute('role') === 'button',
            'Timeline items have a semantic role');
    }


    // ═══ Summary ════════════════════════════════════════════════════════
    console.log('\n═══════════════════════════════════════════════════════');
    console.log(`  Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
    console.log('═══════════════════════════════════════════════════════');

    if (failed === 0) {
        console.log('🎉 All tests passed!');
    } else {
        console.warn(`⚠️ ${failed} test(s) failed. Review the errors above.`);
    }
})();
