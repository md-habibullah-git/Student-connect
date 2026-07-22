import React, { useState, useEffect, useRef } from 'react'; 
import { db } from '../firebase'; 
import { collection, doc, updateDoc, deleteDoc, onSnapshot, getDocs } from 'firebase/firestore'; 

export default function AdminPanel() { 
  const [pendingUsers, setPendingUsers] = useState([]); 
  const [allUsers, setAllUsers] = useState([]); 
  const [rawDbUsers, setRawDbUsers] = useState([]); 
  const [allPrivateChats, setAllPrivateChats] = useState([]); 
  const [selectedChatMessages, setSelectedChatMessages] = useState([]); 
  const [activeChatName, setActiveChatName] = useState(""); 
  const [refreshTrigger, setRefreshTrigger] = useState(0); 
  const [dataLoading, setDataLoading] = useState(true); 
  const activeChatListenerRef = useRef(null);

  const [hiddenRooms, setHiddenRooms] = useState(() => { 
    const saved = localStorage.getItem('admin_hidden_rooms'); 
    return saved ? JSON.parse(saved) : []; 
  }); 

  const bloodGroupList = ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"];
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
    }; 
  }, [refreshTrigger]);
  const handleAccept = async (targetId) => { 
    if (!targetId) return; 
    try { 
      await updateDoc(doc(db, "users", targetId), { approved: true }); 
      alert("✅ ID activated successfully!"); 
      setRefreshTrigger(prev => prev + 1); 
    } catch (err) { 
      console.error("Error accepting ID:", err); 
    } 
  }; 

  const handleDelete = async (targetId) => { 
    if (!targetId) return; 
    if(window.confirm("Are you sure you want to PERMANENTLY delete this ID from the database? This action cannot be undone.")) { 
      try { 
        await deleteDoc(doc(db, "users", targetId)); 
        alert("🗑️ ID permanently deleted from database! The space has been completely cleared."); 
        setRefreshTrigger(prev => prev + 1); 
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
      setActiveChatName(""); 
    } 
  };

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

    const user1 = foundUser1 ? foundUser1.name : `Student (${firstUid.substring(0, 4)})`; 
    const user2 = foundUser2 ? foundUser2.name : `Student (${secondUid.substring(0, 4)})`; 

    setActiveChatName(`${user1} 💬 ${user2}`); 

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
        .admin-msg-log { color: #333333; border-bottom: 1px dashed #eee; } 
        :root[data-theme='dark'] .admin-msg-log { color: #ffffff; border-bottom: 1px dashed #2d3142; } 
      `}</style>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #0056b3', paddingBottom: '10px' }}> 
        <h2 style={{ color: '#0056b3', margin: 0 }}>Admin Control Room 🛠️</h2> 
        <button onClick={() => setRefreshTrigger(prev => prev + 1)} style={{ background: '#0056b3', color: 'white', border: 'none', padding: '8px 15px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>🔄 Sync Data</button> 
      </div>
      {/* New ID Requests Section */}
      <div className="admin-section-box" style={{ padding: '25px', borderRadius: '12px' }}> 
        <h3 style={{ textAlign: 'center', marginBottom: '20px' }}>New ID Requests ({pendingUsers.length})</h3> 
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}> 
          {pendingUsers.map(user => { 
            const currentDocId = user.id || user.uid; 
            const dicebearBackup = `https://dicebear.com{encodeURIComponent(user.name || 'Student')}`; 
            return ( 
              <li key={currentDocId} className="admin-list-row" style={{ marginBottom: '15px', display: 'flex', alignItems: 'center', padding: '15px', borderRadius: '8px' }}> 
                <div style={{ position: 'relative', width: '42px', height: '42px', borderRadius: '50%', overflow: 'hidden', border: '2px solid #0056b3', marginRight: '15px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}> 
                  <img src={(user.photo && user.photo.trim() !== "") ? user.photo : dicebearBackup} alt="Student" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onError={(e) => { e.target.onerror = null; e.target.src = dicebearBackup; }} /> 
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
            const dicebearBackupActive = `https://dicebear.com{encodeURIComponent(user.name || 'Student')}`; 
            return ( 
              <li key={activeDocId} className="admin-list-row-active" style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px', borderRadius: '8px' }}> 
                <span style={{ fontSize: '15px', display: 'flex', alignItems: 'center', gap: '12px', position: 'relative' }}> 
                  <div style={{ position: 'relative', width: '38px', height: '38px' }}> 
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
      <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}> 
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
              return ( 
                <div key={chat.id} className="admin-chat-room-btn" onClick={() => viewPrivateConversation(chat.id)} style={{ padding: '12px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}> 
                  <span style={{ flex: 1, textAlign: 'left', color: 'inherit' }}>📁 {s1} ⇆ {s2}</span> 
                  <button onClick={(e) => handleAdminDeleteRoom(e, chat.id, chat.lastActive)} style={{ background: '#dc3545', color: 'white', border: 'none', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}>Delete</button> 
                </div> 
              ); 
            })} 
            {allPrivateChats.length === 0 && <p style={{ opacity: 0.6, textAlign: 'center', marginTop: '20px' }}>No private chats started yet.</p>} 
          </div> 
        </div> 

        {/* Live Chat Viewer Box */}
        <div className="admin-section-box" style={{ padding: '20px', borderRadius: '12px', flex: '1.5', minWidth: '320px' }}> 
          <h3 style={{ marginBottom: '10px' }}>Live Chat Viewer 👁️ {activeChatName && <span style={{ background: '#0056b3', color: 'white', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', marginLeft: '10px', display: 'inline-block' }}>{activeChatName}</span>}</h3> 
          <div className="admin-chat-box-viewer" style={{ height: '230px', overflowY: 'auto', padding: '12px', borderRadius: '8px' }}> 
            {selectedChatMessages && selectedChatMessages.map((msg, idx) => ( 
              <div key={msg.id || idx} className="admin-msg-log" style={{ margin: '8px 0', fontSize: '13px', paddingBottom: '5px' }}> 
                <span style={{ opacity: 0.6, fontSize: '11px' }}>[{msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString() : 'Live'}]</span> 
                <strong style={{ color: '#0056b3' }}> {msg.senderName || 'Student'}:</strong>{' '} 
                {msg.isDeleted ? <span style={{ fontStyle: 'italic', color: '#dc3545' }}>(Deleted Message)</span> : <><span style={{ color: 'inherit' }}>{msg.text}</span>{msg.isEdited && <span style={{ fontSize: '10px', opacity: 0.7, marginLeft: '5px', fontStyle: 'italic' }}>(Edited)</span>}</>} 
                {msg.media && !msg.isDeleted && <p style={{ margin: '4px 0 0 0', fontSize: '12px' }}><a href={msg.media} target="_blank" rel="noreferrer" style={{ color: '#0056b3', fontWeight: 'bold', textDecoration: 'underline' }}>🔗 Shared Media</a></p>} 
              </div> 
            ))} 
            {selectedChatMessages.length === 0 && <p style={{ opacity: 0.6, textAlign: 'center', marginTop: '90px', fontSize: '13px' }}>Select a chat from the left to view messages.</p>} 
          </div> 
        </div> 
      </div> 
    </div> 
  ); 
}
