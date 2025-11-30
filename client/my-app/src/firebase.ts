// TypeScript wrapper for the existing firebase.js
// Re-export the JS exports with TS-friendly module so `.tsx` files can import without errors.
import * as fb from "./firebase.js";

export const auth = (fb as any).auth;
export const db = (fb as any).db;
export const doc = (fb as any).doc;
export const getDoc = (fb as any).getDoc;
export const setDoc = (fb as any).setDoc;
export const updateDoc = (fb as any).updateDoc;

export default fb;