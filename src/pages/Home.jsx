// File Name: src/components/AdminPanel.jsx
import React, { useState, useEffect, useRef } from 'react'; 
import { useNavigate } from 'react-router-dom';
import { db } from '../firebase'; 
import { collection, doc, updateDoc, deleteDoc, onSnapshot, getDocs, query, where, getDoc } from 'firebase/firestore'; 

function AdminAudioPlayer({ src }) {
  const audioRef = useRef(null);
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
    };
  }, []);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) audio.pause(); else audio.play();
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
    <div className="admin-panel-wrapper" style={{ padding: '20px', fontFamily: 'Arial', maxWidth: '800px', margin: 'auto', display: 'flex', flexDirection: 'column', gap: '25px', minHeight: '100vh' }}> 
      <style>{` 
        .admin-panel-wrapper { background-color: transparent; color: #333333; } 
        :root[data-theme='dark'] .admin-panel-wrapper { background-color: #0b0c10 !important; color: #ffffff; } 
        .admin-section-box { background: #ffffff; border: 1px solid #eee; box-shadow: 0 4px 15px rgba(0,0,0,0.1); } 
        :root[data-theme='dark'] .admin-section-box { background: #15161e; border: 1px solid #222531; box-shadow: 0 4px 15px rgba(0,0,0,0.4); } 
        .admin-section-box h3 { color: #333333; } 
        :root[data-theme='dark'] .admin-section-box h3 { color: #ffffff; } 
        .admin-list-row { background: #f9f9f9; border: 1px solid #eee; color: #333333; } 
        :root[data-theme='dark'] .admin-list-row { background: #1b1d28; border: 1px solid #2d3142; color: #ffffff; } 
        .admin-list-row-active { background: #fcfcfc; border: 1px solid #eee; color: #333333; } 
        :root[data-theme='dark'] .admin-list-row-active { background: #1b1d28; border: 1px solid #2d3142; color: #ffffff; } 
        .admin-chat-room-btn { background: #f0f2f5; border: 1px solid #e4e6eb; color: #333333; } 
        :root[data-theme='dark'] .admin-chat-room-btn { background: #1b1d28; border: 1px solid #2d3142; color: #ffffff; } 
        .admin-chat-box-viewer { border: 1px solid #ddd; background: #fafafa; } 
        :root[data-theme='dark'] .admin-chat-box-viewer { border: 1px solid #2d3142; background: #1b1d28; } 
        .admin-avatar-clickable { cursor: pointer; transition: transform 0.15s; }
        .admin-avatar-clickable:hover { transform: scale(1.08); }
        .admin-msg-bubble { max-width: 78%; padding: 8px 12px; border-radius: 14px; font-size: 13px; word-break: break-word; }
        .admin-msg-bubble.left { background: #f0f2f5; color: #1a1a1a; border-bottom-left-radius: 3px; }
        :root[data-theme='dark'] .admin-msg-bubble.left { background: #22242f; color: #fff; }
        .admin-msg-bubble.right { background: #0056b3; color: #fff; border-bottom-right-radius: 3px; }

        @media (max-width: 640px) {
          .admin-panel-wrapper { padding: 10px; gap: 16px; }
          .admin-section-box { padding: 14px !important; }
          .admin-two-col { flex-direction: column !important; }
          .admin-two-col > div { min-width: 0 !important; width: 100% !important; }
          .admin-msg-bubble { max-width: 88%; }
        }
      `}</style>

      <h2 style={{ color: '#0056b3', margin: 0, textAlign: 'center', borderBottom: '2px solid #0056b3', paddingBottom: '10px' }}>Admin Control Room 🛠️</h2>

      {/* New ID Requests Section */}
      <div className="admin-section-box" style={{ padding: '25px', borderRadius: '12px' }}> 
        <h3 style={{ textAlign: 'center', marginBottom: '20px' }}>New ID Requests ({pendingUsers.length})</h3> 
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}> 
          {pendingUsers.map(user => { 
            const currentDocId = user.id || user.uid; 
            const dicebearBackup = fallbackAvatar(user.name); 
            const userPhoto = (user.photo && user.photo.trim() !== '') ? user.photo : dicebearBackup;
            return ( 
              <li key={currentDocId} className="admin-list-row" style={{ marginBottom: '15px', display: 'flex', alignItems: 'center', padding: '15px', borderRadius: '8px' }}> 
                <div 
                  onClick={() => setExpandedPhoto(userPhoto)}
                  style={{ position: 'relative', width: '42px', height: '42px', borderRadius: '50%', overflow: 'hidden', border: '2px solid #0056b3', marginRight: '15px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: 'zoom-in' }}
                  title="Click to enlarge photo"
                > 
                  <img src={userPhoto} alt="Student" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onError={(e) => { e.target.onerror = null; e.target.src = dicebearBackup; }} /> 
                </div> 
                <div style={{ flex: 1 }}> 
                  <strong style={{ fontSize: '16px', color: 'inherit' }}>{user.name || 'Anonymous User'}</strong> 
                  <span style={{ opacity: 0.8 }}> [{user.idNo || 'No ID'}]</span> 
                  <br/><small style={{ opacity: 0.9, fontSize: '13px' }}>Dept: {user.dept || 'N/A'}</small> 
                  <br/><small style={{ opacity: 0.7, fontSize: '12px' }}>Email: {user.email}</small> 
                </div> 
                <div style={{ display: 'flex', gap: '10px' }}> 
                  <button onClick={() => handleAccept(currentDocId)} style={{ background: '#28a745', color: 'white', border: 'none', padding: '10px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>Accept</button> 
                  <button onClick={() => handleDelete(currentDocId)} style={{ background: '#dc3545', color: 'white', border: 'none', padding: '10px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}>Reject</button> 
                </div> 
              </li> 
            ); 
          })} 
          {pendingUsers.length === 0 && <p style={{ opacity: 0.7, textAlign: 'center', margin: '10px 0', fontSize: '14px' }}>No pending requests.</p>} 
        </ul> 
      </div> 

      {/* All Active Members Section */}
      <div className="admin-section-box" style={{ padding: '25px', borderRadius: '12px' }}> 
        <h3 style={{ textAlign: 'center', marginBottom: '20px' }}>All Active Members ({allUsers.length})</h3> 
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}> 
          {allUsers.map(user => { 
            const activeDocId = user.id || user.uid; 
            const dicebearBackupActive = fallbackAvatar(user.name); 
            return ( 
              <li key={activeDocId} className="admin-list-row-active" style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px', borderRadius: '8px' }}> 
                <span style={{ fontSize: '15px', display: 'flex', alignItems: 'center', gap: '12px', position: 'relative' }}> 
                  <div
                    className="admin-avatar-clickable"
                    onClick={() => navigate(`/profile/${activeDocId}`)}
                    title={`${user.name || 'Student'}-এর প্রোফাইলে যান`}
                    style={{ position: 'relative', width: '38px', height: '38px' }}
                  >
                    <div style={{ width: '38px', height: '38px', borderRadius: '50%', overflow: 'hidden', border: user.role === "admin" ? '2px solid #ffb300' : '2px solid #0056b3', display: 'flex', alignItems: 'center', justifyContent: 'center' }}> 
                      <img src={(user.photo && user.photo.trim() !== "") ? user.photo : dicebearBackupActive} alt="Member" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onError={(e) => { e.target.onerror = null; e.target.src = dicebearBackupActive; }} /> 
                    </div> 
                    {user.role === "admin" && <span style={{ position: 'absolute', bottom: '-2px', right: '-2px', fontSize: '11px', zIndex: 10 }} title="Admin">👑</span>} 
                  </div> 
                  <div> 
                    <strong style={{ color: 'inherit' }}>{user.name || 'No Name'}</strong> 
                    <span style={{ opacity: 0.8, fontSize: '13px', marginLeft: '5px' }}>[{user.role === "admin" ? "Admin ID" : (user.idNo || 'N/A')}]</span> 
                  </div> 
                </span> 
                {user.role !== "admin" && ( 
                  <button onClick={() => handleDelete(activeDocId)} style={{ background: '#dc3545', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}>Remove ID</button> 
                )} 
              </li> 
            ); 
          })} 
          {allUsers.length === 0 && <p style={{ opacity: 0.7, textAlign: 'center', margin: '10px 0', fontSize: '14px' }}>No active members found.</p>} 
        </ul> 
      </div>

      <div className="admin-two-col" style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}> 
        {/* Conversations List */}
        <div className="admin-section-box" style={{ padding: '20px', borderRadius: '12px', flex: '1', minWidth: '280px' }}> 
          <h3 style={{ marginBottom: '5px' }}>All Private Conversations 🔐</h3> 
          <p style={{ fontSize: '11px', opacity: 0.7, marginBottom: '15px' }}>* Click a room to view the private chat history live between students.</p> 
          <div style={{ maxHeight: '250px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}> 
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
                <div key={chat.id} className="admin-chat-room-btn" onClick={() => viewPrivateConversation(chat.id)} style={{ padding: '12px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}> 
                  <span style={{ flex: 1, textAlign: 'left', color: 'inherit', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <img
                      src={p1} alt="" className="admin-avatar-clickable"
                      onClick={(e) => { e.stopPropagation(); navigate(`/profile/${firstUid}`); }}
                      title={`${s1}-এর প্রোফাইলে যান`}
                      style={{ width: '22px', height: '22px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                    />
                    {s1} ⇆ {s2}
                    <img
                      src={p2} alt="" className="admin-avatar-clickable"
                      onClick={(e) => { e.stopPropagation(); navigate(`/profile/${secondUid}`); }}
                      title={`${s2}-এর প্রোফাইলে যান`}
                      style={{ width: '22px', height: '22px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                    />
                  </span> 
                  <button onClick={(e) => handleAdminDeleteRoom(e, chat.id, chat.lastActive)} style={{ background: '#dc3545', color: 'white', border: 'none', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold', flexShrink: 0 }}>Delete</button> 
                </div> 
              ); 
            })} 
            {allPrivateChats.length === 0 && <p style={{ opacity: 0.6, textAlign: 'center', marginTop: '20px' }}>No private chats started yet.</p>} 
          </div> 
        </div> 

        {/* Live Chat Viewer Box */}
        <div className="admin-section-box" style={{ padding: '20px', borderRadius: '12px', flex: '1.5', minWidth: '320px' }}> 
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: showChatViewer ? '12px' : '0' }}>
            <button
              onClick={() => setShowChatViewer(v => !v)}
              style={{ background: '#0056b3', color: 'white', border: 'none', padding: '9px 22px', borderRadius: '20px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}
            >
              Live Chat Viewer {showChatViewer ? '▲' : '▼'}
            </button>
          </div>

          {showChatViewer && (
            <>
              {activeChatInfo && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
                  <img src={(activeChatInfo.user1.photo && activeChatInfo.user1.photo.trim() !== '') ? activeChatInfo.user1.photo : fallbackAvatar(activeChatInfo.user1.name)} alt="" style={{ width: '26px', height: '26px', borderRadius: '50%', objectFit: 'cover', border: '1px solid #0056b3' }} />
                  <span style={{ fontSize: '12px', fontWeight: 'bold' }}>{activeChatInfo.user1.name}</span>
                  <span style={{ opacity: 0.6, fontSize: '12px' }}>⇆</span>
                  <span style={{ fontSize: '12px', fontWeight: 'bold' }}>{activeChatInfo.user2.name}</span>
                  <img src={(activeChatInfo.user2.photo && activeChatInfo.user2.photo.trim() !== '') ? activeChatInfo.user2.photo : fallbackAvatar(activeChatInfo.user2.name)} alt="" style={{ width: '26px', height: '26px', borderRadius: '50%', objectFit: 'cover', border: '1px solid #0056b3' }} />
                </div>
              )}

              <div className="admin-chat-box-viewer" style={{ height: '320px', overflowY: 'auto', padding: '12px', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}> 
                {activeChatInfo && selectedChatMessages && selectedChatMessages.map((msg, idx) => {
                  const isUser1 = msg.senderId === activeChatInfo.user1.uid;
                  const senderInfo = isUser1 ? activeChatInfo.user1 : activeChatInfo.user2;
                  return (
                    <div key={msg.id || idx} style={{ display: 'flex', flexDirection: isUser1 ? 'row' : 'row-reverse', alignItems: 'flex-end', gap: '8px' }}>
                      <img src={(senderInfo.photo && senderInfo.photo.trim() !== '') ? senderInfo.photo : fallbackAvatar(senderInfo.name)} alt="" style={{ width: '26px', height: '26px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: isUser1 ? 'flex-start' : 'flex-end', maxWidth: '80%' }}>
                        <small style={{ opacity: 0.6, fontSize: '10px', marginBottom: '2px' }}>{msg.senderName || senderInfo.name} · {msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString() : 'Live'}</small>
                        <div className={`admin-msg-bubble ${isUser1 ? 'left' : 'right'}`}>
                          {msg.isDeleted && <span style={{ fontSize: '10px', fontStyle: 'italic', opacity: 0.8, display: 'block', marginBottom: '3px' }}>🚫 deleted by user</span>}
                          {msg.fileUrl && msg.fileType === 'image' && (
                            <img src={msg.fileUrl} alt="" style={{ maxWidth: '180px', borderRadius: '8px', display: 'block', marginBottom: msg.text ? '4px' : 0 }} />
                          )}
                          {msg.fileUrl && msg.fileType === 'video' && (
                            <video src={msg.fileUrl} controls style={{ maxWidth: '180px', borderRadius: '8px', display: 'block', marginBottom: msg.text ? '4px' : 0 }} />
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
                {(!activeChatInfo || selectedChatMessages.length === 0) && <p style={{ opacity: 0.6, textAlign: 'center', marginTop: '90px', fontSize: '13px' }}>Select a chat from the left to view messages.</p>} 
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
