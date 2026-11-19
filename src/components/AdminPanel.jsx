// File Name: src/components/AdminPanel.jsx
import React, { useState, useEffect, useRef } from 'react'; 
import { useNavigate } from 'react-router-dom';
import { db } from '../firebase'; 
import { collection, doc, updateDoc, deleteDoc, onSnapshot, getDocs, query, where, getDoc } from 'firebase/firestore'; 

// ✅ createdAt যেকোনো format handle করে
const toMillis = (createdAt) => {
  if (!createdAt) return 0;
  if (typeof createdAt === 'number') return createdAt;
  if (typeof createdAt === 'string') return new Date(createdAt).getTime() || 0;
  if (typeof createdAt.toMillis === 'function') return createdAt.toMillis();
  if (createdAt.seconds) return createdAt.seconds * 1000;
  return 0;
};

// ✅ Time Ago
const timeAgo = (createdAt) => {
  const ms = toMillis(createdAt);
  if (!ms) return '';
  const seconds = Math.floor((Date.now() - ms) / 1000);
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds} seconds ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days > 1 ? 's' : ''} ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months > 1 ? 's' : ''} ago`;
  const years = Math.floor(days / 365);
  return `${years} year${years > 1 ? 's' : ''} ago`;
};

// ✅ Audio booster — element থেকে create
const createBoostedAudioFromElement = (audioElement, boostLevel = 10) => {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const audioCtx = new AudioContextClass();
    const source = audioCtx.createMediaElementSource(audioElement);
    const gainNode = audioCtx.createGain();
    gainNode.gain.value = boostLevel;
    source.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    return audioCtx;
  } catch (err) {
    console.error('Admin voice boost error:', err);
    return null;
  }
};

function AdminAudioPlayer({ src }) {
  const audioRef = useRef(null);
  const audioCtxRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => { setIsPlaying(false); setCurrentTime(0); };
    const onLoaded = () => setDuration(audio.duration || 0);
    const onTimeUpdate = () => setCurrentTime(audio.currentTime || 0);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('timeupdate', onTimeUpdate);
    return () => {
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      // ✅ cleanup booster
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
    };
  }, []);

  // ✅ Play button — booster + play একসাথে
  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;

    // ✅ booster create (একবারই)
    if (!audioCtxRef.current) {
      const audioCtx = createBoostedAudioFromElement(audio, 10);
      if (audioCtx) audioCtxRef.current = audioCtx;
    }

    // ✅ suspended হলে resume
    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }

    if (isPlaying) audio.pause();
    else audio.play();
  };

  const formatTime = (secs) => {
    if (!isFinite(secs) || secs < 0) return '0:00';
    return `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, '0')}`;
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '150px' }}>
      <audio ref={audioRef} src={src} preload="metadata" style={{ display: 'none' }} />
      <button type="button" onClick={toggle} style={{ width: '26px', height: '26px', borderRadius: '50%', border: 'none', cursor: 'pointer', background: 'rgba(0,86,179,0.15)', color: '#0056b3', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '11px' }}>
        {isPlaying ? '⏸️' : '▶️'}
      </button>
      <span style={{ fontSize: '11px', opacity: 0.8 }}>{formatTime(isPlaying || currentTime > 0 ? currentTime : duration)}</span>
    </div>
  );
}

export default function AdminPanel() { 
  const navigate = useNavigate();
  const [pendingUsers, setPendingUsers] = useState([]); 
  const [allUsers, setAllUsers] = useState([]); 
  const [rawDbUsers, setRawDbUsers] = useState([]); 
  const [allPrivateChats, setAllPrivateChats] = useState([]); 
  const [selectedChatMessages, setSelectedChatMessages] = useState([]); 
  const [activeChatInfo, setActiveChatInfo] = useState(null);
  const [showChatViewer, setShowChatViewer] = useState(false);
  const [dataLoading, setDataLoading] = useState(true); 
  const activeChatListenerRef = useRef(null);
  const [expandedPhoto, setExpandedPhoto] = useState(null);

  // ✅ প্রতি মিনিটে re-render — time ago update
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(interval);
  }, []);

  const [hiddenRooms, setHiddenRooms] = useState(() => { 
    const saved = localStorage.getItem('admin_hidden_rooms'); 
    return saved ? JSON.parse(saved) : []; 
  }); 

  useEffect(() => { 
    const usersRef = collection(db, "users"); 
    const unsubscribeUsers = onSnapshot(usersRef, (snapshot) => { 
      const allData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })); 
      setRawDbUsers(allData); 

      const pending = allData.filter(user => { 
        const isApprovedTrue = user.approved === true || String(user.approved).toLowerCase().trim() === "true"; 
        const isAdminUser = user.role === "admin" || String(user.role).toLowerCase().trim() === "admin"; 
        const isPending = user.approved === false || String(user.approved).toLowerCase().trim() === "false" || user.approved === "re-applied" || user.approved === "re-submit" || user.approved === undefined || !user.hasOwnProperty('approved') || user.approved === null; 
        return !isAdminUser && !isApprovedTrue && isPending && user.name !== "Removed User"; 
      }); 
      setPendingUsers(pending); 

      const active = allData.filter(user => { 
        const isApprovedTrue = user.approved === true || String(user.approved).toLowerCase().trim() === "true"; 
        const isAdminUser = user.role === "admin" || String(user.role).toLowerCase().trim() === "admin"; 
        const isDeleted = user.approved === "deleted" || String(user.approved).toLowerCase().trim() === "deleted"; 
        return (isApprovedTrue || isAdminUser) && (user.name !== "Removed User" && !isDeleted); 
      }); 
      setAllUsers(active); 
      setDataLoading(false); 
    }, (error) => { 
      console.error("User Fetching Error:", error); 
      setDataLoading(false); 
    });

    const fetchRoomsDirectly = async () => { 
      try { 
        const querySnapshot = await getDocs(collection(db, "personal-rooms")); 
        const roomsList = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })); 
        roomsList.sort((a, b) => (b.lastActive || 0) - (a.lastActive || 0)); 
        setAllPrivateChats(roomsList); 
      } catch (err) { 
        console.error("Rooms Fetch Error:", err); 
      } 
    }; 

    fetchRoomsDirectly(); 
    const interval = setInterval(fetchRoomsDirectly, 5000); 

    return () => {
      clearInterval(interval);
      unsubscribeUsers();
      if (activeChatListenerRef.current) {
        activeChatListenerRef.current();
        activeChatListenerRef.current = null;
      }
    }; 
  }, []);

  const handleAccept = async (targetId) => { 
    if (!targetId) return; 
    try { 
      await updateDoc(doc(db, "users", targetId), { approved: true }); 
      alert("✅ ID activated successfully!"); 
    } catch (err) { 
      console.error("Error accepting ID:", err); 
    } 
  }; 

  const wipeAllChatDataForUser = async (uid) => {
    try {
      const roomsSnap = await getDocs(collection(db, "personal-rooms"));
      const relatedRooms = roomsSnap.docs.filter(roomDoc => roomDoc.id.split("_").includes(uid));
      for (const roomDoc of relatedRooms) {
        const messagesSnap = await getDocs(collection(db, "personal-rooms", roomDoc.id, "messages"));
        await Promise.all(messagesSnap.docs.map(msgDoc => deleteDoc(doc(db, "personal-rooms", roomDoc.id, "messages", msgDoc.id))));
        await deleteDoc(doc(db, "personal-rooms", roomDoc.id));
      }

      const globalMsgsSnap = await getDocs(query(collection(db, "global-room-messages"), where("senderUid", "==", uid)));
      await Promise.all(globalMsgsSnap.docs.map(m => deleteDoc(doc(db, "global-room-messages", m.id))));

      const personalCallsSnap = await getDocs(query(collection(db, "personal-calls"), where("participants", "array-contains", uid)));
      await Promise.all(personalCallsSnap.docs.map(c => deleteDoc(doc(db, "personal-calls", c.id))));

      const globalCallRef = doc(db, "global-calls", "campus_global_conference_room");
      const globalCallSnap = await getDoc(globalCallRef);
      if (globalCallSnap.exists()) {
        const callData = globalCallSnap.data();
        if (callData.hostId === uid) {
          await deleteDoc(globalCallRef);
        } else if ((callData.participants || []).includes(uid)) {
          const updatedParts = (callData.participants || []).filter(id => id !== uid);
          if (updatedParts.length === 0) {
            await deleteDoc(globalCallRef);
          } else {
            await updateDoc(globalCallRef, { participants: updatedParts });
          }
        }
      }

      const connectionsSnap = await getDocs(collection(db, "global-calls", "campus_global_conference_room", "connections"));
      const relatedConnections = connectionsSnap.docs.filter(c => c.id.split("_").includes(uid));
      for (const connDoc of relatedConnections) {
        const [candidatesA, candidatesB] = await Promise.all([
          getDocs(collection(db, "global-calls", "campus_global_conference_room", "connections", connDoc.id, "candidatesA")),
          getDocs(collection(db, "global-calls", "campus_global_conference_room", "connections", connDoc.id, "candidatesB"))
        ]);
        await Promise.all([...candidatesA.docs, ...candidatesB.docs].map(d => deleteDoc(d.ref)));
        await deleteDoc(connDoc.ref);
      }
    } catch (err) {
      console.error("Error wiping chat data for user:", err);
      throw err;
    }
  };

  const handleDelete = async (targetId) => { 
    if (!targetId) return; 
    if(window.confirm("Are you sure you want to permanently delete this ID and all associated chat/message data from the database? This action cannot be undone.")) { 
      try { 
        await wipeAllChatDataForUser(targetId);
        await deleteDoc(doc(db, "users", targetId)); 

        if (activeChatListenerRef.current) {
          activeChatListenerRef.current();
          activeChatListenerRef.current = null;
        }
        setSelectedChatMessages([]);
        setActiveChatInfo(null);

        alert("🗑️ ID and all associated chat data have been permanently deleted! It will no longer store any information/messages."); 
      } catch (err) { 
        console.error("Error deleting ID permanently:", err); 
        alert("❌ Error deleting user. Check Firestore permissions.");
      } 
    } 
  };

  const handleAdminDeleteRoom = (e, roomId, lastActiveTime) => { 
    e.stopPropagation(); 
    if(window.confirm("Are you sure you want to temporarily remove this chat from list?")) { 
      const updatedHidden = [...hiddenRooms, { id: roomId, deleteAtTimestamp: lastActiveTime || new Date().getTime() }]; 
      setHiddenRooms(updatedHidden); 
      localStorage.setItem('admin_hidden_rooms', JSON.stringify(updatedHidden)); 
      setSelectedChatMessages([]); 
      setActiveChatInfo(null); 
    } 
  };

  const fallbackAvatar = (name) => `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name || 'Student')}`;

  const viewPrivateConversation = (roomId) => { 
    if (!roomId || !rawDbUsers || rawDbUsers.length === 0) return; 
    if (activeChatListenerRef.current) {
      activeChatListenerRef.current();
      activeChatListenerRef.current = null;
    }

    const uids = roomId.split("_"); 
    const firstUid = uids[0] || ""; 
    const secondUid = uids[1] || ""; 

    const foundUser1 = rawDbUsers.find(u => String(u.id) === firstUid || String(u.uid) === firstUid); 
    const foundUser2 = rawDbUsers.find(u => String(u.id) === secondUid || String(u.uid) === secondUid); 

    setActiveChatInfo({
      roomId,
      user1: { uid: firstUid, name: foundUser1 ? foundUser1.name : `Student (${firstUid.substring(0, 4)})`, photo: foundUser1?.photo || '' },
      user2: { uid: secondUid, name: foundUser2 ? foundUser2.name : `Student (${secondUid.substring(0, 4)})`, photo: foundUser2?.photo || '' },
    });
    setShowChatViewer(true);

    const qMsg = collection(db, "personal-rooms", roomId, "messages"); 
    activeChatListenerRef.current = onSnapshot(qMsg, (snapshot) => { 
      const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })); 
      msgs.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)); 
      setSelectedChatMessages(msgs); 
    }, (error) => { 
      console.error("Messages Loading Error:", error); 
    }); 
  };

  if (dataLoading) { 
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontFamily: 'Arial', fontSize: '16px', color: '#fff' }}>⚙️ Accessing Control Room Data...</div>; 
  } 

  return ( 
    <div className="admin-panel-wrapper" style={{ padding: '16px', maxWidth: '850px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px', minHeight: '100vh' }}> 
      <style>{` 
        .admin-panel-wrapper { background-color: var(--fb-bg, #f0f2f5); color: var(--fb-text, #1c1e21); } 
        .admin-section-box { background: var(--fb-card, #ffffff); border: 1px solid var(--fb-border, #ccd0d5); border-radius: 8px; box-shadow: 0 1px 2px rgba(0,0,0,0.06); } 
        .admin-section-box h3 { color: var(--fb-text, #1c1e21); margin-top: 0; font-size: 15px; font-weight: 700; } 
        .admin-list-row { background: var(--fb-bg, #f0f2f5); border: 1px solid var(--fb-border, #ccd0d5); color: var(--fb-text, #1c1e21); } 
        .admin-list-row-active { background: var(--fb-card, #ffffff); border: 1px solid var(--fb-border, #ccd0d5); color: var(--fb-text, #1c1e21); } 
        .admin-chat-room-btn { background: var(--fb-bg, #f0f2f5); border: 1px solid var(--fb-border, #ccd0d5); color: var(--fb-text, #1c1e21); transition: background 0.15s; } 
        .admin-chat-room-btn:hover { background: #e4e6eb; }
        :root[data-theme='dark'] .admin-chat-room-btn:hover { background: #3a3b3c; }
        .admin-chat-box-viewer { border: 1px solid var(--fb-border, #ccd0d5); background: var(--fb-bg, #f0f2f5); } 
        .admin-avatar-clickable { cursor: pointer; transition: transform 0.15s; }
        .admin-avatar-clickable:hover { transform: scale(1.08); }
        .admin-msg-bubble { max-width: 78%; padding: 8px 12px; border-radius: 16px; font-size: 13px; word-break: break-word; line-height: 1.4; }
        .admin-msg-bubble.left { background: var(--fb-chat-them, #e4e6eb); color: var(--fb-text, #1c1e21); border-bottom-left-radius: 4px; }
        .admin-msg-bubble.right { background: var(--fb-chat-me, #0084ff); color: #fff; border-bottom-right-radius: 4px; }

        @media (max-width: 640px) {
          .admin-panel-wrapper { padding: 8px; gap: 12px; }
          .admin-section-box { padding: 12px !important; border-radius: 6px; }
          .admin-two-col { flex-direction: column !important; }
          .admin-two-col > div { min-width: 0 !important; width: 100% !important; }
          .admin-msg-bubble { max-width: 88%; }
        }
      `}</style>

      <div style={{ background: 'var(--fb-header, #1877f2)', color: '#fff', padding: '12px 16px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 1px 3px rgba(0,0,0,0.12)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '20px' }}>🛡️</span>
          <div>
            <h2 style={{ margin: 0, fontSize: '17px', fontWeight: 'bold', color: '#fff' }}>Campus Admin Shield</h2>
            <small style={{ opacity: 0.9, fontSize: '11px' }}>ID Verification & Realtime Moderation</small>
          </div>
        </div>
        <button 
          onClick={() => navigate('/')} 
          style={{ background: 'rgba(255,255,255,0.2)', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
        >
          ✕ Close
        </button>
      </div>

      {/* New ID Requests Section */}
      <div className="admin-section-box" style={{ padding: '16px' }}> 
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', borderBottom: '1px solid var(--fb-border, #ccd0d5)', paddingBottom: '8px' }}>
          <h3 style={{ margin: 0 }}>Pending Campus ID Approvals ({pendingUsers.length})</h3> 
          <span style={{ background: pendingUsers.length > 0 ? '#fa3e3e' : '#42b72a', color: '#fff', fontSize: '11px', fontWeight: 'bold', padding: '2px 8px', borderRadius: '10px' }}>
            {pendingUsers.length > 0 ? 'Action Required' : 'All Clear'}
          </span>
        </div>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}> 
          {pendingUsers.map(user => { 
            const currentDocId = user.id || user.uid; 
            const dicebearBackup = fallbackAvatar(user.name); 
            const userPhoto = (user.photo && user.photo.trim() !== '') ? user.photo : dicebearBackup;
            return ( 
              <li key={currentDocId} className="admin-list-row" style={{ marginBottom: '10px', display: 'flex', alignItems: 'center', padding: '12px', borderRadius: '6px' }}> 
                <div 
                  onClick={() => setExpandedPhoto(userPhoto)}
                  style={{ position: 'relative', width: '44px', height: '44px', borderRadius: '50%', overflow: 'hidden', border: '2px solid var(--fb-primary, #1877f2)', marginRight: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: 'zoom-in' }}
                  title="Click to enlarge student photo"
                > 
                  <img src={userPhoto} alt="Student" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onError={(e) => { e.target.onerror = null; e.target.src = dicebearBackup; }} /> 
                </div> 
                <div style={{ flex: 1, minWidth: 0 }}> 
                  <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--fb-text, #1c1e21)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {user.name || 'Anonymous User'}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--fb-subtext, #65676b)', marginTop: '2px' }}>
                    ID: <strong style={{ color: 'var(--fb-primary, #1877f2)' }}>{user.idNo || 'No ID'}</strong> · Dept: {user.dept || 'N/A'}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--fb-subtext, #65676b)' }}>
                    Email: {user.email}
                  </div> 
                </div> 
                <div style={{ display: 'flex', gap: '8px', flexShrink: 0, marginLeft: '8px' }}> 
                  <button onClick={() => handleAccept(currentDocId)} style={{ background: '#42b72a', color: 'white', border: 'none', padding: '8px 14px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}>Approve</button> 
                  <button onClick={() => handleDelete(currentDocId)} style={{ background: '#fa3e3e', color: 'white', border: 'none', padding: '8px 14px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>Reject</button> 
                </div> 
              </li> 
            ); 
          })} 
          {pendingUsers.length === 0 && <p style={{ color: 'var(--fb-subtext, #65676b)', textAlign: 'center', margin: '14px 0', fontSize: '13px' }}>✅ No pending ID requests. All students are approved.</p>} 
        </ul> 
      </div> 

      {/* All Active Members Section */}
      <div className="admin-section-box" style={{ padding: '16px' }}> 
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', borderBottom: '1px solid var(--fb-border, #ccd0d5)', paddingBottom: '8px' }}>
          <h3 style={{ margin: 0 }}>Enrolled Campus Members ({allUsers.length})</h3> 
          <span style={{ fontSize: '12px', color: 'var(--fb-subtext, #65676b)' }}>Verified Active IDs</span>
        </div>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, maxHeight: '350px', overflowY: 'auto' }}> 
          {allUsers.map(user => { 
            const activeDocId = user.id || user.uid; 
            const dicebearBackupActive = fallbackAvatar(user.name); 
            return ( 
              <li key={activeDocId} className="admin-list-row-active" style={{ marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderRadius: '6px' }}> 
                <span style={{ fontSize: '14px', display: 'flex', alignItems: 'center', gap: '10px', position: 'relative', minWidth: 0, flex: 1 }}> 
                  <div
                    className="admin-avatar-clickable"
                    onClick={() => navigate(`/profile/${activeDocId}`)}
                    title={`View ${user.name || 'Student'}'s profile`}
                    style={{ position: 'relative', width: '36px', height: '36px', flexShrink: 0 }}
                  >
                    <div style={{ width: '36px', height: '36px', borderRadius: '50%', overflow: 'hidden', border: user.role === "admin" ? '2px solid #ffb300' : '2px solid var(--fb-primary, #1877f2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}> 
                      <img src={(user.photo && user.photo.trim() !== "") ? user.photo : dicebearBackupActive} alt="Member" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onError={(e) => { e.target.onerror = null; e.target.src = dicebearBackupActive; }} /> 
                    </div> 
                    {user.role === "admin" && <span style={{ position: 'absolute', bottom: '-2px', right: '-2px', fontSize: '10px', zIndex: 10 }} title="Campus Administrator">👑</span>} 
                  </div> 
                  <div style={{ minWidth: 0 }}> 
                    <strong style={{ color: 'var(--fb-text, #1c1e21)', fontSize: '13px', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {user.name || 'No Name'}
                    </strong> 
                    <span style={{ color: 'var(--fb-subtext, #65676b)', fontSize: '11px' }}>
                      {user.role === "admin" ? "Campus Admin" : `ID: ${user.idNo || 'N/A'} · Dept: ${user.dept || 'N/A'}`}
                    </span> 
                  </div> 
                </span> 
                {user.role !== "admin" && ( 
                  <button onClick={() => handleDelete(activeDocId)} style={{ background: '#fa3e3e', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold', flexShrink: 0, marginLeft: '8px' }}>
                    Revoke ID
                  </button> 
                )} 
              </li> 
            ); 
          })} 
          {allUsers.length === 0 && <p style={{ color: 'var(--fb-subtext, #65676b)', textAlign: 'center', margin: '10px 0', fontSize: '13px' }}>No active members found.</p>} 
        </ul> 
      </div>

      <div className="admin-two-col" style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}> 
        {/* Conversations List */}
        <div className="admin-section-box" style={{ padding: '16px', flex: '1', minWidth: '280px' }}> 
          <h3 style={{ marginBottom: '4px' }}>Active Student Chats 🔐</h3> 
          <p style={{ fontSize: '11px', color: 'var(--fb-subtext, #65676b)', marginBottom: '12px' }}>Tap a room to inspect live conversations and ensure community safety.</p> 
          <div style={{ maxHeight: '280px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}> 
            {allPrivateChats && allPrivateChats.map(chat => { 
              if (!chat.id || !chat.id.includes('_')) return null; 
              const uids = chat.id.split("_"); 
              const firstUid = uids[0] || ""; 
              const secondUid = uids[1] || ""; 
              const isHidden = hiddenRooms.some(h => h.id === chat.id && (chat.lastActive || 0) <= h.deleteAtTimestamp); 
              if (isHidden) return null; 
              const foundUser1 = rawDbUsers.find(u => String(u.id) === firstUid || String(u.uid) === firstUid); 
              const foundUser2 = rawDbUsers.find(u => String(u.id) === secondUid || String(u.uid) === secondUid); 
              const s1 = foundUser1 ? foundUser1.name : `Student (${firstUid.substring(0, 4)})`; 
              const s2 = foundUser2 ? foundUser2.name : `Student (${secondUid.substring(0, 4)})`; 
              const p1 = (foundUser1?.photo && foundUser1.photo.trim() !== '') ? foundUser1.photo : fallbackAvatar(s1);
              const p2 = (foundUser2?.photo && foundUser2.photo.trim() !== '') ? foundUser2.photo : fallbackAvatar(s2);
              return ( 
                <div key={chat.id} className="admin-chat-room-btn" onClick={() => viewPrivateConversation(chat.id)} style={{ padding: '10px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}> 
                  <span style={{ flex: 1, textAlign: 'left', color: 'inherit', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <img
                      src={p1} alt="" className="admin-avatar-clickable"
                      onClick={(e) => { e.stopPropagation(); navigate(`/profile/${firstUid}`); }}
                      title={`View ${s1}'s profile`}
                      style={{ width: '22px', height: '22px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                    />
                    <span>{s1} ⇆ {s2}</span>
                    <img
                      src={p2} alt="" className="admin-avatar-clickable"
                      onClick={(e) => { e.stopPropagation(); navigate(`/profile/${secondUid}`); }}
                      title={`View ${s2}'s profile`}
                      style={{ width: '22px', height: '22px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                    />
                  </span> 
                  <button onClick={(e) => handleAdminDeleteRoom(e, chat.id, chat.lastActive)} style={{ background: '#fa3e3e', color: 'white', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold', flexShrink: 0 }}>Hide</button> 
                </div> 
              ); 
            })} 
            {allPrivateChats.length === 0 && <p style={{ color: 'var(--fb-subtext, #65676b)', textAlign: 'center', marginTop: '20px', fontSize: '12px' }}>No private chats started yet.</p>} 
          </div> 
        </div> 

        {/* Live Chat Viewer Box */}
        <div className="admin-section-box" style={{ padding: '16px', flex: '1.4', minWidth: '300px' }}> 
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 style={{ margin: 0 }}>Live Chat Monitor</h3>
            <button
              onClick={() => setShowChatViewer(v => !v)}
              style={{ background: 'var(--fb-primary, #1877f2)', color: 'white', border: 'none', padding: '6px 14px', borderRadius: '14px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}
            >
              {showChatViewer ? 'Hide Viewer ▲' : 'Open Viewer ▼'}
            </button>
          </div>

          {showChatViewer && (
            <>
              {activeChatInfo && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '10px', flexWrap: 'wrap', background: 'var(--fb-bg, #f0f2f5)', padding: '6px 10px', borderRadius: '6px' }}>
                  <img src={(activeChatInfo.user1.photo && activeChatInfo.user1.photo.trim() !== '') ? activeChatInfo.user1.photo : fallbackAvatar(activeChatInfo.user1.name)} alt="" style={{ width: '24px', height: '24px', borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--fb-primary, #1877f2)' }} />
                  <span style={{ fontSize: '12px', fontWeight: 'bold' }}>{activeChatInfo.user1.name}</span>
                  <span style={{ color: 'var(--fb-subtext, #65676b)', fontSize: '12px' }}>⇆</span>
                  <span style={{ fontSize: '12px', fontWeight: 'bold' }}>{activeChatInfo.user2.name}</span>
                  <img src={(activeChatInfo.user2.photo && activeChatInfo.user2.photo.trim() !== '') ? activeChatInfo.user2.photo : fallbackAvatar(activeChatInfo.user2.name)} alt="" style={{ width: '24px', height: '24px', borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--fb-primary, #1877f2)' }} />
                </div>
              )}

              <div className="admin-chat-box-viewer" style={{ height: '320px', overflowY: 'auto', padding: '12px', borderRadius: '6px', display: 'flex', flexDirection: 'column', gap: '8px' }}> 
                {activeChatInfo && selectedChatMessages && selectedChatMessages.map((msg, idx) => {
                  const isUser1 = msg.senderId === activeChatInfo.user1.uid;
                  const senderInfo = isUser1 ? activeChatInfo.user1 : activeChatInfo.user2;
                  return (
                    <div key={msg.id || idx} style={{ display: 'flex', flexDirection: isUser1 ? 'row' : 'row-reverse', alignItems: 'flex-end', gap: '8px' }}>
                      <img src={(senderInfo.photo && senderInfo.photo.trim() !== '') ? senderInfo.photo : fallbackAvatar(senderInfo.name)} alt="" style={{ width: '24px', height: '24px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: isUser1 ? 'flex-start' : 'flex-end', maxWidth: '80%' }}>
                        <small style={{ color: 'var(--fb-subtext, #65676b)', fontSize: '10px', marginBottom: '2px' }}>
                          {senderInfo.name} · {timeAgo(msg.createdAt)}
                        </small>
                        <div className={`admin-msg-bubble ${isUser1 ? 'left' : 'right'}`}>
                          {msg.isDeleted && <span style={{ fontSize: '10px', fontStyle: 'italic', opacity: 0.8, display: 'block', marginBottom: '3px' }}>🚫 deleted by user</span>}
                          {msg.fileUrl && msg.fileType === 'image' && (
                            <img src={msg.fileUrl} alt="" style={{ maxWidth: '180px', borderRadius: '6px', display: 'block', marginBottom: msg.text ? '4px' : 0 }} />
                          )}
                          {msg.fileUrl && msg.fileType === 'video' && (
                            <video src={msg.fileUrl} controls style={{ maxWidth: '180px', borderRadius: '6px', display: 'block', marginBottom: msg.text ? '4px' : 0 }} />
                          )}
                          {msg.fileUrl && msg.fileType === 'audio' && (
                            <AdminAudioPlayer src={msg.fileUrl} />
                          )}
                          {msg.text && <span>{msg.text}</span>}
                          {msg.isEdited && <span style={{ fontSize: '10px', opacity: 0.7, marginLeft: '5px', fontStyle: 'italic' }}>(edited)</span>}
                        </div>
                      </div>
                    </div>
                  );
                })} 
                {(!activeChatInfo || selectedChatMessages.length === 0) && <p style={{ color: 'var(--fb-subtext, #65676b)', textAlign: 'center', marginTop: '90px', fontSize: '12px' }}>Select a chat from the left to view messages.</p>} 
              </div> 
            </>
          )}
        </div> 
      </div>

      {/* Enlarged photo modal */}
      {expandedPhoto && (
        <div
          onClick={() => setExpandedPhoto(null)}
          style={{
            position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
            backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 3000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'zoom-out'
          }}
        >
          <img
            src={expandedPhoto}
            alt="Enlarged"
            style={{ maxWidth: '90%', maxHeight: '90%', objectFit: 'contain', borderRadius: '8px' }}
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={() => setExpandedPhoto(null)}
            style={{
              position: 'absolute', top: '20px', right: '20px',
              background: 'rgba(255,255,255,0.15)', border: 'none',
              color: '#fff', fontSize: '20px', width: '40px', height: '40px',
              borderRadius: '50%', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}
          >
            ✕
          </button>
        </div>
      )}
    </div> 
  ); 
}
