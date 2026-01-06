import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { auth } from "../../firebase";

// Use ui-avatars as a deterministic fallback avatar service when user does not provide photoURL.

const Signup: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email || !password || !username) {
      setError("Please enter email, username and password.");
      return;
    }

    try {
      setLoading(true);
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      console.log("Created user:", userCredential.user);
      // set displayName (username) and gravatar photoURL
      try {
        // use ui-avatars to create a simple avatar from username (avoids needing MD5/gravatar)
        const avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=random&size=200`;
        await updateProfile(userCredential.user, { displayName: username, photoURL: avatar });
        // store locally as fallback
        try { localStorage.setItem('displayName', username); } catch(e) {}
      } catch (e) {
        console.warn('Failed to set profile displayName/photoURL', e);
      }
      navigate("/lobby");
    } catch (err: any) {
      console.error(err);
      const message = err?.code || err?.message || "Failed to create account.";
      if (message.includes("auth/email-already-in-use")) setError("This email is already in use.");
      else if (message.includes("auth/weak-password")) setError("Password is too weak (min 6 characters).");
      else if (message.includes("auth/invalid-email")) setError("Invalid email address.");
      else setError("Failed to create account. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 420, margin: "48px auto", padding: 24 }}>
      <h2 style={{ textAlign: "center", marginBottom: 12 }}>Create account</h2>
      <form onSubmit={handleSubmit}>
        <label style={{ display: "block", marginBottom: 8 }}>Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ width: "100%", padding: 8, marginBottom: 12 }}
          placeholder="you@example.com"
          required
        />

        <label style={{ display: "block", marginBottom: 8 }}>Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ width: "100%", padding: 8, marginBottom: 12 }}
          placeholder="Choose a password"
          required
        />

        <label style={{ display: "block", marginBottom: 8 }}>Username</label>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          style={{ width: "100%", padding: 8, marginBottom: 12 }}
          placeholder="Display name"
          required
        />

        {error && (
          <div style={{ color: "#b00020", marginBottom: 12 }}>{error}</div>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{ width: "100%", padding: 10, cursor: loading ? "default" : "pointer" }}
        >
          {loading ? "Creating account..." : "Sign Up"}
        </button>
      </form>

      <div style={{ textAlign: "center", marginTop: 12 }}>
        <span>Already have an account? </span>
        <Link to="/login">Sign in</Link>
      </div>
    </div>
  );
};

export default Signup;
