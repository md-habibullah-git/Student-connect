// File Name: src/pages/Messenger.jsx

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, auth } from '../firebase';
import { collection, query, where, onSnapshot, doc, orderBy, limit, getCountFromServer, Timestamp } from 'firebase/firestore';
import { isUserOnline } from '../presence';

export default function Messenger() {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [onlineMap, setOnlineMap] = useState({});
  const [unreadCounts, setUnreadCounts] = useState({});
  const [globalUnreadCount, setGlobalUnreadCount] = useState(0);
  const [roomActivity, setRoomActivity] = useState({});

  const currentUid = auth.currentUser?.uid;

  useEffect(() => {
    const usersRef = collection(db, "users");
    const q = query(usersRef, where("approved", "==", true));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const usersList = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data()
      }));

      const filtered = usersList.filter(user => user.uid !== auth.currentUser?.uid);
      setUsers(filtered);

      const online = {};
      usersList.forEach(user => {
        const uidKey = user.uid || user.id;
        if (uidKey) online[uidKey] = isUserOnline(user);
      });
      setOnlineMap(online);
    }, (error) => {
      console.error("Error fetching messenger users: ", error);
    });

    return () => unsubscribe();
  }, []);

  // Per-student unread count & last activity
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
            setRoomActivity((prev) => ({ ...prev, [user.uid]: 0 }));
            return;
          }

          const data = snap.data();
          setRoomActivity((prev) => ({ ...prev, [user.uid]: data.lastActive || 0 }));

          try {
            const lastReadTimestamp = Number(localStorage.getItem(`lastRead_personal_${chatRoomId}`)) || 0;
            const messagesRef = collection(db, "personal-rooms", chatRoomId, "messages");
            const countQuery = query(messagesRef, where("createdAt", ">", lastReadTimestamp));
            const countSnap = await getCountFromServer(countQuery);
            setUnreadCounts((prev) => ({ ...prev, [user.uid]: countSnap.data().count }));
          } catch {
            // SDK count fallback
          }
        });
      });

    return () => unsubscribers.forEach((unsub) => unsub && unsub());
  }, [users, currentUid]);

  // Global room unread count
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
      } catch {
        // fail silently
      }
    });
    return () => unsubscribe();
  }, [currentUid]);

  const startChat = (user) => {
    if (user && user.uid) {
      navigate(`/chat/${user.uid}/${encodeURIComponent(user.name || 'Student')}`);
    }
  };

  const sortedUsers = [...users].sort((a, b) => {
    const aTime = roomActivity[a.uid] || 0;
    const bTime = roomActivity[b.uid] || 0;
    return bTime - aTime;
  });

  const filteredUsers = sortedUsers.filter(u => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      (u.name || '').toLowerCase().includes(term) ||
      (u.idNo || '').toLowerCase().includes(term) ||
      (u.dept || '').toLowerCase().includes(term)
    );
  });

  const activeOnlineUsers = users.filter(u => onlineMap[u.uid]);

  const fallbackAvatar = (name) => `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name || 'Student')}`;

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '0 0 30px 0' }}>
      
      {/* ── Search Bar ── */}
      <div style={{ padding: '10px 14px', backgroundColor: 'var(--fb-card)', borderBottom: '1px solid var(--fb-divider)' }}>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <span style={{ position: 'absolute', left: '10px', fontSize: '13px', color: 'var(--fb-text-muted)' }}>🔍</span>
          <input
            type="text"
            placeholder="Search students, ID or dept..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px 8px 32px',
              backgroundColor: 'var(--fb-input-bg)',
              color: 'var(--fb-text)',
              border: '1px solid var(--fb-card-border-subtle)',
              borderRadius: '20px',
              fontSize: '13px',
              outline: 'none'
            }}
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              style={{
                position: 'absolute',
                right: '10px',
                background: 'none',
                border: 'none',
                color: 'var(--fb-text-muted)',
                cursor: 'pointer',
                fontSize: '13px'
              }}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* ── Active Online Students Row (FB Lite Active Contacts) ── */}
      {activeOnlineUsers.length > 0 && !searchTerm && (
        <div style={{
          backgroundColor: 'var(--fb-card)',
          padding: '10px 14px',
          borderBottom: '1px solid var(--fb-divider)',
          display: 'flex',
          gap: '12px',
          overflowX: 'auto',
          scrollbarWidth: 'none'
        }}>
          {activeOnlineUsers.map(user => (
            <div
              key={user.id}
              onClick={() => startChat(user)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                cursor: 'pointer',
                minWidth: '54px'
              }}
            >
              <div style={{ position: 'relative' }}>
                <img
                  src={user.photo && user.photo.trim() !== '' ? user.photo : fallbackAvatar(user.name)}
                  alt=""
                  className="fb-avatar"
                  style={{ width: '44px', height: '44px' }}
                />
                <span className="online-dot" />
              </div>
              <span style={{
                fontSize: '11px',
                color: 'var(--fb-text)',
                marginTop: '4px',
                textAlign: 'center',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: '56px'
              }}>
                {user.name.split(' ')[0]}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── Campus Global Room Pinned Row ── */}
      <div
        onClick={() => navigate('/chat/global/Global-Chatroom')}
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '12px 14px',
          backgroundColor: 'var(--fb-card)',
          borderBottom: '1px solid var(--fb-divider)',
          cursor: 'pointer',
          transition: 'background-color 0.15s ease'
        }}
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--fb-hover)'}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--fb-card)'}
      >
        <div style={{
          width: '46px',
          height: '46px',
          borderRadius: '50%',
          backgroundColor: 'var(--fb-blue-light)',
          color: 'var(--fb-blue)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '22px',
          marginRight: '12px',
          flexShrink: 0
        }}>
          🌐
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <strong style={{ fontSize: '15px', color: 'var(--fb-text)', fontWeight: '700' }}>
              Campus Global Room
            </strong>
            {globalUnreadCount > 0 && (
              <span className="fb-badge">
                {globalUnreadCount > 99 ? '99+' : globalUnreadCount}
              </span>
            )}
          </div>
          <p style={{
            margin: '2px 0 0 0',
            fontSize: '12px',
            color: 'var(--fb-blue)',
            fontWeight: '600',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}>
            🎙️ Open Public Chat & Voice/Video Conference
          </p>
        </div>
      </div>

      {/* ── Student Direct Messages List ── */}
      <div style={{ backgroundColor: 'var(--fb-card)' }}>
        {filteredUsers.map(user => {
          const isOnline = onlineMap[user.uid];
          const unread = unreadCounts[user.uid] || 0;

          return (
            <div
              key={user.id}
              onClick={() => startChat(user)}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '10px 14px',
                borderBottom: '1px solid var(--fb-card-border-subtle)',
                cursor: 'pointer',
                transition: 'background-color 0.15s ease'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--fb-hover)'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--fb-card)'}
            >
              {/* Avatar with Online Dot */}
              <div style={{ position: 'relative', marginRight: '12px', flexShrink: 0 }}>
                <img
                  src={user.photo && user.photo.trim() !== '' ? user.photo : fallbackAvatar(user.name)}
                  alt=""
                  className="fb-avatar"
                  style={{ width: '46px', height: '46px' }}
                />
                {isOnline && <span className="online-dot" />}
              </div>

              {/* Info text */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <strong style={{
                    fontSize: '14px',
                    color: 'var(--fb-text)',
                    fontWeight: unread > 0 ? '700' : '600',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {user.name}
                  </strong>
                  
                  {unread > 0 && (
                    <span className="fb-badge" style={{ marginLeft: '6px' }}>
                      {unread > 99 ? '99+' : unread}
                    </span>
                  )}
                </div>

                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '12px',
                  color: unread > 0 ? 'var(--fb-text)' : 'var(--fb-text-secondary)',
                  fontWeight: unread > 0 ? '600' : 'normal',
                  marginTop: '2px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}>
                  <span>ID: {user.idNo || 'N/A'}</span>
                  <span>•</span>
                  <span>{user.dept || 'Campus'}</span>
                  {isOnline && (
                    <>
                      <span>•</span>
                      <span style={{ color: 'var(--fb-green)', fontWeight: 'bold' }}>Active now</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filteredUsers.length === 0 && (
        <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--fb-text-secondary)' }}>
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>💬</div>
          <strong>No students found</strong>
          <p style={{ fontSize: '13px', marginTop: '4px' }}>Try searching with a different name or ID.</p>
        </div>
      )}

    </div>
  );
}
