import React, { useEffect, useState } from "react";
import { auth } from "../../firebase";
import { updateProfile, sendPasswordResetEmail, signOut, onAuthStateChanged } from "firebase/auth";
import { useNavigate } from "react-router-dom";

const Profile: React.FC = () => {
  const [user, setUser] = useState<any>(auth.currentUser);
  const [photoURL, setPhotoURL] = useState(user?.photoURL || "");
  const [message, setMessage] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setPhotoURL(u?.photoURL || "");
    });
    return () => unsub();
  }, []);

  const handleUpdatePhoto = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setMessage(null);
    if (!user) return setMessage("No user signed in.");
    try {
      await updateProfile(user, { photoURL: photoURL || null });
      setMessage("Profile picture updated.");
    } catch (err) {
      console.error(err);
      setMessage("Failed to update profile picture.");
    }
  };

  const handlePasswordReset = async () => {
    setMessage(null);
    if (!user?.email) return setMessage("No email available.");
    try {
      await sendPasswordResetEmail(auth, user.email);
      setMessage("Password reset email sent.");
    } catch (err) {
      console.error(err);
      setMessage("Failed to send password reset email.");
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    navigate("/login");
  };

  if (!user) {
    return (
      <div style={{ padding: 20 }}>
        <p>No user signed in. <button onClick={() => navigate('/login')}>Sign In</button></p>
      </div>
    );
  }

  return (
    <div style={{ padding: 20, maxWidth: 640, margin: "24px auto" }}>
      <h2>Profile</h2>
      <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
        <img src={user.photoURL || "https://www.gravatar.com/avatar?d=mp&s=80"} alt="avatar" style={{ width: 80, height: 80, borderRadius: "50%" }} />
        <div>
          <div><strong>{user.displayName || user.email}</strong></div>
          <div style={{ color: "#666" }}>{user.email}</div>
        </div>
      </div>

      <section style={{ marginTop: 20 }}>
        <h3>Update profile picture</h3>
        <form onSubmit={handleUpdatePhoto} style={{ display: "grid", gap: 8 }}>
          <input placeholder="Photo URL" value={photoURL} onChange={(e) => setPhotoURL(e.target.value)} style={{ padding: 8 }} />
          <button type="submit">Update Photo</button>
        </form>
      </section>

      <section style={{ marginTop: 20 }}>
        <h3>Password</h3>
        <p>Click the button to receive a password reset email to your account.</p>
        <button onClick={handlePasswordReset}>Send Password Reset Email</button>
      </section>

      {message && <div style={{ marginTop: 12, color: "#333" }}>{message}</div>}

      <div style={{ marginTop: 24, display: "flex", gap: 12 }}>
        <button onClick={handleSignOut}>Sign out</button>
        <button onClick={() => navigate('/lobby')}>Back to Lobby</button>
      </div>
    </div>
  );
};

export default Profile;
