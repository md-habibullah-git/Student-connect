import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Your actual Firebase configuration keys
const firebaseConfig = {
  apiKey: "AIzaSyB_kkFWUwfTzjBZsc6V9ui2dE4qHrMp9nY",
  authDomain: "://firebaseapp.com",
  projectId: "student-connect-ffa4a",
  storageBucket: "student-connect-ffa4a.firebasestorage.app",
  messagingSenderId: "952632040307",
  appId: "1:952632040307:web:3a5ef238ff5ab81e920306",
  measurementId: "G-N0EKF3LZD9"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app); // Only Authentication and Firestore Database will remain
