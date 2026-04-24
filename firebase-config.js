// Firebase configuration and initialization
// IMPORTANT: In a production app, restrict these keys in the Google Cloud Console
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
    apiKey: "AIzaSyCQx8mgUIyKiEi3VkGJpR5bs6H4iPTvF8Q",
    authDomain: "voting-assistant-c1265.firebaseapp.com",
    projectId: "voting-assistant-c1265",
    storageBucket: "voting-assistant-c1265.firebasestorage.app",
    messagingSenderId: "239353858986",
    appId: "1:239353858986:web:2585352156d63fdc1679d3",
    measurementId: "G-3Y2GB2B19T"
};

// Initialize Firebase
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
    console.log("Firebase initialized successfully");
} catch (error) {
    console.error("Firebase initialization error:", error);
}

window.db = db;
window.functions = functions;
