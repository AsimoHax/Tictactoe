import React, { useEffect, useState } from "react";
import { collection, onSnapshot, addDoc, serverTimestamp, doc, getDoc, updateDoc, arrayRemove } from "firebase/firestore";
import { db } from "../../firebase";
import { useNavigate, Link } from "react-router-dom";
import { auth } from "../../firebase";

interface Room {
  id: string;
  name: string;
  status: string;
  players: string[];
  spectators: number;
  password?: string;
}

const Lobby: React.FC = () => {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [userSignedIn, setUserSignedIn] = useState<boolean>(!!auth.currentUser);
  const [friendsOpen, setFriendsOpen] = useState<boolean>(false);
  const [friendsTab, setFriendsTab] = useState<"friends" | "requests">("friends");
  const [friends, setFriends] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [openFriendMenu, setOpenFriendMenu] = useState<string | null>(null);
  const [requestUsername, setRequestUsername] = useState("");
  const [requestError, setRequestError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const col = collection(db, "rooms");
    const unsub = onSnapshot(col, (snap) => {
      const arr: Room[] = [];
      snap.forEach((doc) => {
        const data = doc.data() as any;
        arr.push({
          id: doc.id,
          name: data.name || "Unnamed",
          status: data.status || "open",
          players: data.players || [],
          spectators: data.spectators || 0,
          password: data.password || undefined,
        });
      });
      setRooms(arr);
    }, (err) => console.error(err));

    return () => unsub();
  }, []);

  // keep track of whether a user is signed in
  useEffect(() => {
    const unsub = auth.onAuthStateChanged?.((u: any) => {
      setUserSignedIn(!!u);
    });
    return () => unsub && unsub();
  }, []);

  // subscribe to current user's friends list and load friend profiles + requests
  useEffect(() => {
    let unsubUser: any;
    if (!auth.currentUser) {
      setFriends([]);
      setRequests([]);
      return;
    }
    const userDocRef = doc(db, "users", auth.currentUser.uid);
    unsubUser = onSnapshot(userDocRef, async (snap) => {
      const data = snap.data() as any;
      const friendIds: string[] = data?.friends || [];
      const requestIds: string[] = data?.friendRequests || [];
      
      // Load friends
      if (!friendIds.length) {
        setFriends([]);
      } else {
        try {
          const docs = await Promise.all(friendIds.map((id) => getDoc(doc(db, "users", id))));
          const list = docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
          setFriends(list);
        } catch (err) {
          console.error("Failed to load friends:", err);
          setFriends([]);
        }
      }
      
      // Load pending requests
      if (!requestIds.length) {
        setRequests([]);
      } else {
        try {
          const docs = await Promise.all(requestIds.map((id) => getDoc(doc(db, "users", id))));
          const list = docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
          setRequests(list);
        } catch (err) {
          console.error("Failed to load requests:", err);
          setRequests([]);
        }
      }
    }, (err) => console.error(err));

    return () => unsubUser && unsubUser();
  }, []);

  const handleCreate = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError(null);
    if (!newName) {
      setError("Please provide a room name.");
      return;
    }
    if (!auth.currentUser) {
      setError("You must be signed in to create a room.");
      navigate("/login");
      return;
    }
    try {
      const docRef = await addDoc(collection(db, "rooms"), {
        name: newName,
        status: "open",
        players: [],
        spectators: 0,
        password: newPassword || null,
        createdAt: serverTimestamp(),
        host: auth.currentUser?.uid || null,
      });

      setNewName("");
      setNewPassword("");
      setCreating(false);
      // navigate to the game with room id as query param
      navigate(`/game?room=${docRef.id}`);
    } catch (err) {
      console.error(err);
      // Friendly message for permission errors
      const code = (err as any)?.code || (err as any)?.message || "";
      if (String(code).includes("permission-denied") || String(code).includes("Missing or insufficient")) {
        setError("Permission denied: you are not allowed to create rooms. Ensure you are signed in and have write access.");
      } else {
        setError("Failed to create room.");
      }
    }
  };

  const enterRoom = (room: Room) => {
    if (!auth.currentUser) {
      alert("You must be signed in to join a room.");
      navigate('/login');
      return;
    }
    // If the room has a password, prompt for it.
    if (room.password) {
      const p = window.prompt("Room is password protected. Enter password:");
      if (p !== room.password) {
        alert("Incorrect password.");
        return;
      }
    }
    navigate(`/game?room=${room.id}`);
  };

  const handleUnfriend = async (friendId: string) => {
    if (!auth.currentUser) return;
    const ok = window.confirm("Unfriend this user?");
    if (!ok) return;
    try {
      const meRef = doc(db, "users", auth.currentUser.uid);
      await updateDoc(meRef, { friends: arrayRemove(friendId) });
      setOpenFriendMenu(null);
    } catch (err) {
      console.error(err);
      alert("Failed to unfriend user.");
    }
  };

  const handleAcceptRequest = async (requesterId: string) => {
    if (!auth.currentUser) return;
    try {
      const meRef = doc(db, "users", auth.currentUser.uid);
      // Add requester to my friends, remove from requests
      await updateDoc(meRef, {
        friends: arrayRemove(requesterId).length > 0 ? undefined : undefined, // first remove from requests
        friendRequests: arrayRemove(requesterId),
      });
      // Actually add them to friends
      await updateDoc(meRef, {
        friends: [...friends.map(f => f.id), requesterId],
      });
      // Also add me to their friends
      const requesterRef = doc(db, "users", requesterId);
      await updateDoc(requesterRef, {
        friends: [...(requests.find(r => r.id === requesterId)?.friends || []), auth.currentUser.uid],
      });
    } catch (err) {
      console.error(err);
      alert("Failed to accept friend request.");
    }
  };

  const handleDeclineRequest = async (requesterId: string) => {
    if (!auth.currentUser) return;
    try {
      const meRef = doc(db, "users", auth.currentUser.uid);
      await updateDoc(meRef, { friendRequests: arrayRemove(requesterId) });
    } catch (err) {
      console.error(err);
      alert("Failed to decline request.");
    }
  };

  const handleSendRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setRequestError(null);
    if (!auth.currentUser) {
      setRequestError("You must be signed in.");
      return;
    }
    if (!requestUsername.trim()) {
      setRequestError("Please enter an email.");
      return;
    }
    try {
      const usersRef = collection(db, "users");
      let targetId: string | null = null;
      const snap = await new Promise<any>((resolve) => {
        const unsub = onSnapshot(usersRef, (s) => {
          unsub();
          const found = s.docs.find((d) => d.data().email === requestUsername.trim());
          resolve(found?.id || null);
        });
      });
      targetId = snap;

      if (!targetId) {
        setRequestError("User not found.");
        return;
      }

      if (targetId === auth.currentUser.uid) {
        setRequestError("You can't send a request to yourself.");
        return;
      }

      if (friends.map((f) => f.id).includes(targetId)) {
        setRequestError("Already friends with this user.");
        return;
      }

      const targetRef = doc(db, "users", targetId);
      const targetSnap = await getDoc(targetRef);
      const targetFriendRequests = targetSnap.data()?.friendRequests || [];
      if (targetFriendRequests.includes(auth.currentUser.uid)) {
        setRequestError("You've already sent a request to this user.");
        return;
      }
      targetFriendRequests.push(auth.currentUser.uid);
      await updateDoc(targetRef, { friendRequests: targetFriendRequests });

      setRequestUsername("");
      alert("Friend request sent!");
    } catch (err) {
      console.error(err);
      setRequestError("Failed to send request.");
    }
  };

  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: "16px auto" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>TicTacToe — Lobby</h1>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <Link to="/profile" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <img
              src={auth.currentUser?.photoURL || "https://www.gravatar.com/avatar?d=mp&s=40"}
              alt="avatar"
              style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover" }}
            />
            <span>{auth.currentUser?.displayName || auth.currentUser?.email || "Profile"}</span>
          </Link>
          {!userSignedIn && (
            <Link to="/login">Sign in</Link>
          )}
          <button onClick={() => setCreating((s) => !s)}>Create Room</button>
          <button onClick={() => setFriendsOpen((s) => !s)}>Friends</button>
        </div>
      </header>

      <div style={{ display: "flex", gap: 16, marginTop: 12 }}>

        <div style={{ flex: 1 }}>
          {creating && (
        <form onSubmit={handleCreate} style={{ marginTop: 12, marginBottom: 12, display: "grid", gap: 8 }}>
          <input
            placeholder="Room name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            style={{ padding: 8 }}
          />
          <input
            placeholder="Password (optional)"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            style={{ padding: 8 }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit">Create</button>
            <button type="button" onClick={() => setCreating(false)}>Cancel</button>
          </div>
          {error && <div style={{ color: "#b00020" }}>{error}</div>}
        </form>
          )}

          <main style={{ marginTop: 16 }}>
            <h2>Public Rooms</h2>
            <div style={{ display: "grid", gap: 12 }}>
              {rooms.length === 0 && <div>No public rooms yet — create one!</div>}
              {rooms.map((r) => (
                <div key={r.id} style={{ border: "1px solid #ddd", padding: 12, borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{r.name}</div>
                    <div style={{ fontSize: 13, color: "#666" }}>Status: {r.status}</div>
                    <div style={{ fontSize: 13, color: "#666" }}>Players: {r.players.length}/2</div>
                    <div style={{ fontSize: 13, color: "#666" }}>Spectators: {r.spectators}</div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => enterRoom(r)}>Enter Room</button>
                    <button onClick={() => alert("Friend invite not implemented yet")}>Friend</button>
                  </div>
                </div>
              ))}
            </div>
          </main>
        </div>

        {/* Friends panel on the right */}
        <aside style={{ width: 300 }}>
          {friendsOpen && (
            <div style={{ border: "1px solid #eee", padding: 12, borderRadius: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3 style={{ margin: 0 }}>Friends</h3>
                <button onClick={() => setFriendsOpen(false)}>Close</button>
              </div>

              {/* Tab buttons */}
              <div style={{ display: "flex", gap: 8, marginTop: 12, borderBottom: "1px solid #eee", paddingBottom: 8 }}>
                <button
                  onClick={() => setFriendsTab("friends")}
                  style={{
                    padding: "6px 12px",
                    background: friendsTab === "friends" ? "#007bff" : "transparent",
                    color: friendsTab === "friends" ? "white" : "#333",
                    border: "1px solid #ddd",
                    borderRadius: 4,
                    cursor: "pointer",
                  }}
                >
                  Friends ({friends.length})
                </button>
                <button
                  onClick={() => setFriendsTab("requests")}
                  style={{
                    padding: "6px 12px",
                    background: friendsTab === "requests" ? "#007bff" : "transparent",
                    color: friendsTab === "requests" ? "white" : "#333",
                    border: "1px solid #ddd",
                    borderRadius: 4,
                    cursor: "pointer",
                  }}
                >
                  Requests ({requests.length})
                </button>
              </div>

              {/* Friends Tab */}
              {friendsTab === "friends" && (
                <div style={{ marginTop: 12 }}>
                  {friends.length === 0 && <div>No friends added yet.</div>}
                  <div style={{ display: "grid", gap: 8 }}>
                    {friends.map((f) => (
                      <div key={f.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 8, border: "1px solid #f0f0f0", borderRadius: 6 }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flex: 1 }}>
                          <img src={f.photoURL || "https://www.gravatar.com/avatar?d=mp&s=40"} alt="avatar" style={{ width: 40, height: 40, borderRadius: "50%" }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600 }}>{f.displayName || f.email || "Unnamed"}</div>
                            <div style={{ fontSize: 12, color: "#666" }}>{f.currentRoom ? `In room ${f.currentRoom}` : "Not in a room"}</div>
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          {f.currentRoom && <button onClick={() => navigate(`/game?room=${f.currentRoom}`)}>Join</button>}
                          <div style={{ position: "relative" }}>
                            <button onClick={() => setOpenFriendMenu(openFriendMenu === f.id ? null : f.id)}>⋯</button>
                            {openFriendMenu === f.id && (
                              <div style={{ position: "absolute", right: 0, top: 28, background: "white", border: "1px solid #ddd", borderRadius: 6, padding: 8, zIndex: 10 }}>
                                <button onClick={() => handleUnfriend(f.id)} style={{ display: "block" }}>Unfriend</button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Requests Tab */}
              {friendsTab === "requests" && (
                <div style={{ marginTop: 12 }}>
                  {requests.length === 0 && <div>No pending requests.</div>}
                  <div style={{ display: "grid", gap: 8 }}>
                    {requests.map((r) => (
                      <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 8, border: "1px solid #f0f0f0", borderRadius: 6 }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flex: 1 }}>
                          <img src={r.photoURL || "https://www.gravatar.com/avatar?d=mp&s=40"} alt="avatar" style={{ width: 40, height: 40, borderRadius: "50%" }} />
                          <div>
                            <div style={{ fontWeight: 600 }}>{r.displayName || r.email || "Unnamed"}</div>
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button onClick={() => handleAcceptRequest(r.id)}>Accept</button>
                          <button onClick={() => handleDeclineRequest(r.id)}>Decline</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Send Friend Request Section */}
              <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid #eee" }}>
                <h4 style={{ margin: "0 0 8px 0" }}>Send Friend Request</h4>
                <form onSubmit={handleSendRequest} style={{ display: "grid", gap: 8 }}>
                  <input
                    type="text"
                    placeholder="Enter email"
                    value={requestUsername}
                    onChange={(e) => setRequestUsername(e.target.value)}
                    style={{ padding: 8, borderRadius: 4, border: "1px solid #ddd" }}
                  />
                  <button type="submit" style={{ padding: 8 }}>Send Request</button>
                  {requestError && <div style={{ color: "#b00020", fontSize: 12 }}>{requestError}</div>}
                </form>
              </div>
            </div>
          )}
        </aside>

      </div>
    </div>
  );
};

export default Lobby;
