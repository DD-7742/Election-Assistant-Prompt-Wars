/**
 * Firebase Configuration and Initialization
 *
 * This module initializes Firebase services for the Election Companion AI frontend.
 * Configuration values are restricted in the Google Cloud Console for production use.
 *
 * @module firebase-config
 * @version 2.0.0
 */

'use strict';

/**
 * Firebase project configuration.
 * These keys are restricted by HTTP referrer in the Google Cloud Console.
 * They are safe to expose in client-side code as long as Firestore Security
 * Rules are properly configured (see firestore.rules).
 *
 * @constant {Object}
 */
const firebaseConfig = Object.freeze({
    apiKey: "AIzaSyCQx8mgUIyKiEi3VkGJpR5bs6H4iPTvF8Q",
    authDomain: "voting-assistant-c1265.firebaseapp.com",
    projectId: "voting-assistant-c1265",
    storageBucket: "voting-assistant-c1265.firebasestorage.app",
    messagingSenderId: "239353858986",
    appId: "1:239353858986:web:2585352156d63fdc1679d3",
    measurementId: "G-3Y2GB2B19T"
});

/**
 * @type {firebase.app.App|undefined}
 * @type {firebase.firestore.Firestore|undefined}
 * @type {firebase.functions.Functions|undefined}
 */
let app, db, functions;

try {
    app = firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();

    // Connect to local emulators if running locally (optional, for development)
    if (window.location.hostname === 'localhost') {
        // Uncomment these lines to test against local emulators
        // db.useEmulator('localhost', 8080);
        // firebase.functions().useEmulator('localhost', 5001);
    }

    functions = firebase.functions();
    console.log('[Firebase] Initialized successfully');
} catch (error) {
    console.error('[Firebase] Initialization error:', error.message);
}

// Expose to global scope for use by other modules
window.db = db;
window.functions = functions;
