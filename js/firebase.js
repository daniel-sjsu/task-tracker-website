
// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-analytics.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import {getAuth,GoogleAuthProvider,signInWithPopup,signOut,onAuthStateChanged} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";

// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
    apiKey: "AIzaSyBRNw1GXeX5OE_6KXj2jEV7ZPRc7OHT6aw",
    authDomain: "task-tracker-website.firebaseapp.com",
    projectId: "task-tracker-website",
    storageBucket: "task-tracker-website.firebasestorage.app",
    messagingSenderId: "1094330842077",
    appId: "1:1094330842077:web:654ac7a9375449e14a9434",
    measurementId: "G-H1579QWE4J",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
const db = getFirestore(app);


export { auth, db, googleProvider, signInWithPopup, signOut, onAuthStateChanged};
