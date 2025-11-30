
import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBafAuXU38fy5oo_SEubSmThbWLmeNAb5w",
  authDomain: "tictactoe-20f2c.firebaseapp.com",
  projectId: "tictactoe-20f2c",
  storageBucket: "tictactoe-20f2c.firebasestorage.app",
  messagingSenderId: "607444918722",
  appId: "1:607444918722:web:abca987a157f1c00abb65b"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

export { db, doc, getDoc, setDoc, updateDoc, auth };
