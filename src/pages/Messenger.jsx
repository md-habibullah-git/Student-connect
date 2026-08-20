// File Name: src/pages/Messenger.jsx

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, auth } from '../firebase';
import { collection, query, where, onSnapshot, doc, orderBy, limit, getCountFromServer, Timestamp } from 'firebase/firestore';

export default function Messenger() {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);

  // tracks which user ids are currently online (backed by the
  // users/{uid}.online field that GlobalAlerts.jsx keeps up to date app-wide)
  const [onlineMap, setOnlineMap] = useState({});

  // 🔧 NEW: unread message counts — per-student for personal chats, and one
  // combined count for the Campus Global Room card.
  const [unreadCounts, setUnreadCounts] = useState({});
  const [globalUnreadCount, setGlobalUnreadCount] = useState(0);

  const currentUid = auth.currentUser?.uid;

  useEffect(() => {
    // Query to fetch active and approved students
    const usersRef = collection(db, "users");
    const q = query(usersRef, where("approved", "==", true));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const usersList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Filter out the currently logged-in user from the list
      const filtered = usersList.filter(user => user.uid !== auth.currentUser?.uid);
      setUsers(filtered);

      // build a quick lookup of who's online from the same snapshot
      const online = {};
      usersList.forEach(user => {
        const uidKey = user.uid || user.id;
        if (uidKey) online[uidKey] = user.online === true;
      });
      setOnlineMap(online);
    }, (error) => {
      console.error("Error fetching messenger users: ", error);
    });

    return () => unsubscribe();
  }, []);

  // 🔧 NEW: per-student unread count. For each visible student, watch their
  // shared room doc — whenever it changes (a new message arrived), re-run a
  // lightweight count query for messages sent after this device's last-read
  // marker for that room.
  useEffect(() => {
    if (!currentUid || users.length === 0) return;

    const unsubscribers = users
      .filter((user) => user.uid)
      .map((user) => {
        const chatRoomId = currentUid < user.uid ? `${currentUid}_${user.uid}` : `${user.uid}_${currentUid}`;
        const roomRef = doc(db, "personal-rooms", chatRoomId);

        return onSnapshot(roomRef, async (snap) => {
          if (!snap.exists()) {
            setUnreadCounts((prev) => ({ ...prev, [user.uid]: 0 }));
            return;
          }
          try {
            const lastReadTimestamp = Number(localStorage.getItem(`lastRead_personal_${chatRoomId}`)) || 0;
            const messagesRef = collection(db, "personal-rooms", chatRoomId, "messages");
            const countQuery = query(messagesRef, where("createdAt", ">", lastReadTimestamp));
            const countSnap = await getCountFromServer(countQuery);
            setUnreadCounts((prev) => ({ ...prev, [user.uid]: countSnap.data().count }));
          } catch (err) {
            // getCountFromServer unavailable on this SDK version — badge just won't show
          }
        });
      });

    return () => unsubscribers.forEach((unsub) => unsub && unsub());
  }, [users, currentUid]);

  // 🔧 NEW: unread count for the Campus Global Room card
  useEffect(() => {
    if (!currentUid) return;
    const q = query(collection(db, "global-room-messages"), orderBy("createdAt", "desc"), limit(1));
    const unsubscribe = onSnapshot(q, async () => {
      try {
        const lastReadTimestamp = Number(localStorage.getItem('lastRead_global')) || 0;
        const messagesRef = collection(db, "global-room-messages");
        const countQuery = query(messagesRef, where("createdAt", ">", Timestamp.fromMillis(lastReadTimestamp)));
        const countSnap = await getCountFromServer(countQuery);
        setGlobalUnreadCount(countSnap.data().count);
      } catch (err) {
        // fail silently — badge just won't show
      }
    });
    return () => unsubscribe();
  }, [currentUid]);

  const startChat = (user) => {
    if (user && user.uid) {
      // Dynamic route path link for personal chatroom redirection
      navigate(`/chat/${user.uid}/${encodeURIComponent(user.name || 'Student')}`);
    }
  };

  return (
    <div style={{ maxWidth: '600px', margin: '20px auto', fontFamily: 'Arial', padding: '0 15px' }}>
      <h2 style={{ borderBottom: '2px solid #0056b3', paddingBottom: '10px', color: '#0056b3', textAlign: 'center', marginBottom: '20px' }}>
        Student Messenger 💬
      </h2>
      
      {/* Campus Global Chat & Conference Room Card Button */}
      <div 
        onClick={() => navigate('/chat/global/Global-Chatroom')}
        style={{ 
          display: 'flex', 
          alignItems: 'center', 
          background: 'linear-gradient(135deg, #0056b3, #007bff)', 
          padding: '15px', 
          borderRadius: '12px', 
          cursor: 'pointer',
          boxShadow: '0 4px 15px rgba(0,86,179,0.2)',
          transition: 'transform 0.2s, box-shadow 0.2s',
          marginBottom: '20px' // The bottom margin of the global box has been reduced from 25 to 20
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.boxShadow = '0 6px 20 rgba(0,86,179,0.35)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = '0 4px 15px rgba(0,86,179,0.2)';
        }}
      >
        <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.2)', display: 'flex', justifyContent: 'center', alignItems: 'center', marginRight: '15px', fontSize: '22px', flexShrink: 0 }}>
          🔊
        </div>
        <div style={{ flex: 1, color: '#fff' }}>
          <strong style={{ fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px', letterSpacing: '0.3px' }}>
            Campus Global Room 👥
            {/* 🔧 NEW: unread badge next to the Global Room name */}
            {globalUnreadCount > 0 && (
              <span style={{ background: '#ff3b30', color: '#fff', fontSize: '11px', fontWeight: 'bold', minWidth: '20px', height: '20px', borderRadius: '10px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px' }}>
                {globalUnreadCount > 99 ? '99+' : globalUnreadCount}
              </span>
            )}
          </strong>
          <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.85)', marginTop: '3px', display: 'block' }}>👉 Click to join public group chat & conference calls</span>
        </div>
        <div style={{ fontSize: '18px', color: '#fff', paddingRight: '5px' }}>⚡</div>
      </div>

      {/* Grid container for formatting students profile display windows */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '15px' }}>
        {users.map(user => (
          <div 
            key={user.id} 
            onClick={() => startChat(user)}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              background: 'linear-gradient(135deg, #0056b3, #007bff)', 
              padding: '15px', // ⚡ Fixed: Equal 15-pixel padding has been applied to the global box
              borderRadius: '12px', 
              border: '1px solid rgba(255,255,255,0.15)', 
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(0,86,179,0.15)',
              transition: 'transform 0.2s, box-shadow 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 6px 15px rgba(0,86,179,0.3)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,86,179,0.15)';
            }}
          >
            {/* Small circular profile attachment graphic */}
            <div style={{ position: 'relative', flexShrink: 0, marginRight: '15px' }}>
              <img 
                src={(user.photo && user.photo.trim() !== "") ? user.photo : `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(user.name || 'Student')}`} 
                alt={user.name} 
                style={{ width: '48px', height: '50px', borderRadius: '50%', objectFit: 'cover', border: '2px solid #fff', display: 'block' }} // ⚡ Fixed: Equal 48-pixel width and responsive height are locked for the global circle
              />
              {/* online status dot on the corner of the avatar */}
              {onlineMap[user.uid] && (
                <span title="Online" style={{ position: 'absolute', bottom: '2px', right: '2px', width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#2ecc71', border: '2px solid #0056b3' }} />
              )}
            </div>

            {/* Student metadata texts block */}
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContext: 'center' }}>
              <strong style={{ fontSize: '16px', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}> {/* ⚡ Fixed: Font size has been set to 16 pixels, just like the text of the global box */}
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.name}</span>
                {/* 🔧 NEW: unread badge next to the student's name */}
                {unreadCounts[user.uid] > 0 && (
                  <span style={{ background: '#ff3b30', color: '#fff', fontSize: '10px', fontWeight: 'bold', minWidth: '18px', height: '18px', borderRadius: '9px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px', flexShrink: 0 }}>
                    {unreadCounts[user.uid] > 99 ? '99+' : unreadCounts[user.uid]}
                  </span>
                )}
              </strong>
              
              {/* ⚡ Fixed: ID and Department are placed side-by-side on a single line instead of vertically, reducing the height */}
              <div style={{ display: 'flex', gap: '10px', fontSize: '11px', color: 'rgba(255,255,255,0.85)', marginTop: '4px' }}>
                <span>ID: {user.idNo || 'N/A'}</span>
                <span>•</span>
                <span>Dept: {user.dept || 'N/A'}</span>
              </div>
            </div>
            
            <span style={{ fontSize: '18px', color: '#ffeb3b', marginLeft: '5px' }}>⚡</span> {/* ⚡ Fixed: ID and Department are placed side-by-side on a single line instead of vertically, reducing the height */}
          </div>
        ))}
      </div>

      {users.length === 0 && (
        <div style={{ background: 'var(--card-bg, #fff)', padding: '30px', borderRadius: '10px', border: '1px solid #ccc', textAlign: 'center', marginTop: '20px' }}>
          <p style={{ color: '#777', margin: 0, fontSize: '14px' }}>No other active students available to chat.</p>
          <small style={{ color: '#999', display: 'block', marginTop: '5px' }}>(Make sure other student IDs are approved by Admin)</small>
        </div>
      )}
    </div>
  );
}
