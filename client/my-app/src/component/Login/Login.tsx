import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../../firebase";

const Login: React.FC = () => {
    const navigate = useNavigate();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        if (!email || !password) {
            setError("Please enter email and password.");
            return;
        }

        try {
            setLoading(true);
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            // Signed in
            console.log("Signed in:", userCredential.user);
            navigate("/");
        } catch (err: any) {
            console.error(err);
            const message = err?.code || err?.message || "Failed to sign in.";
            // map a couple common errors to friendlier text
            if (message.includes("auth/wrong-password")) setError("Incorrect password.");
            else if (message.includes("auth/user-not-found")) setError("No account found for this email.");
            else if (message.includes("auth/too-many-requests")) setError("Too many failed attempts. Try again later.");
            else setError("Authentication failed. Check credentials and try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ maxWidth: 420, margin: "48px auto", padding: 24 }}>
            <h2 style={{ textAlign: "center", marginBottom: 12 }}>Sign in</h2>
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
                    placeholder="Your password"
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
                    {loading ? "Signing in..." : "Sign In"}
                </button>
            </form>
        </div>
    );
};

export default Login;