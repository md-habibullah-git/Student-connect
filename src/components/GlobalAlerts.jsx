// File Name: src/components/GlobalAlerts.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { db, auth } from '../firebase';
import {
  collection, doc, onSnapshot, query, where, orderBy, limit,
  updateDoc, setDoc
} from 'firebase/firestore';

const GLOBAL_ROOM_ID = "campus_global_conference_room";

export default function GlobalAlerts() {
  const location = useLocation();
  const navigate = useNavigate();
  const currentUid = auth.currentUser?.uid || null;

  // 🔧 NEW: floating bottom-right bubbles — one per sender/room with unseen messages
  const [messageBubbles, setMessageBubbles] = useState([]);
  // 🔧 NEW: floating top call bar state
  const [incomingPersonalCall, setIncomingPersonalCall] = useState(null);
  const [incomingGlobalCall, setIncomingGlobalCall] = useState(null);

  const locationRef = useRef(location);
  useEffect(() => { locationRef.current = location; }, [location]);

  const lastKnownRoomStateRef = useRef({});
  const isFirstRoomsLoadRef = useRef(true);
  const lastKnownGlobalMessageAtRef = useRef(0);
  const isFirstGlobalLoadRef = useRef(true);

  // ── Presence: online anywhere in the app, not just inside a specific chat ──
  useEffect(() => {
    if (!currentUid) return;
    const selfRef = doc(db, "users", currentUid);
    setDoc(selfRef, { online: true, lastSeen: new Date().getTime() }, { merge: true }).catch(() => {});

    const handleBeforeUnload = () => {
      updateDoc(selfRef, { online: false }).catch(() => {});
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      updateDoc(selfRef, { online: false }).catch(() => {});
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [currentUid]);

  // ── Floating message bubbles: new personal messages from any room I'm in ──
  useEffect(() => {
    if (!currentUid) return;
    const q = query(collection(db, "personal-rooms"), where("participants", "array-contains", currentUid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const isFirst = isFirstRoomsLoadRef.current;

      snapshot.docChanges().forEach((change) => {
        const data = change.doc.data();
        const roomId = change.doc.id;
        const prevLastMessageAt = lastKnownRoomStateRef.current[roomId] || 0;

        if (
          !isFirst &&
          data.lastMessageAt && data.lastMessageAt > prevLastMessageAt &&
          data.lastMessageSenderId && data.lastMessageSenderId !== currentUid
        ) {
          const otherUid = (data.participants || []).find((id) => id !== currentUid);
          const onThisChatPage = otherUid && locationRef.current.pathname.startsWith(`/chat/${otherUid}/`);

          if (!onThisChatPage) {
            setMessageBubbles((prev) => {
              const existing = prev.find((b) => b.roomId === roomId);
              if (existing) {
                return prev.map((b) => b.roomId === roomId
                  ? { ...b, count: b.count + 1, senderName: data.lastMessageSenderName, senderPhoto: data.lastMessageSenderPhoto }
                  : b);
              }
              const next = [...prev, {
                roomId, otherUid, isGlobal: false, count: 1,
                senderName: data.lastMessageSenderName, senderPhoto: data.lastMessageSenderPhoto
              }];
              return next.slice(-3); // keep at most 3 stacked bubbles
            });
          }
        }
        lastKnownRoomStateRef.current[roomId] = data.lastMessageAt || prevLastMessageAt;
      });

      isFirstRoomsLoadRef.current = false;
    });
    return () => unsubscribe();
  }, [currentUid]);

  // ── Floating message bubble: new global room messages ──
  useEffect(() => {
    if (!currentUid) return;
    const q = query(collection(db, "global-room-messages"), orderBy("createdAt", "desc"), limit(1));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const isFirst = isFirstGlobalLoadRef.current;
      if (!snapshot.empty) {
        const data = snapshot.docs[0].data();
        const msgTime = data.createdAt?.seconds ? data.createdAt.seconds * 1000 : 0;

        if (!isFirst && msgTime > lastKnownGlobalMessageAtRef.current && data.senderUid && data.senderUid !== currentUid) {
          const onGlobalPage = locationRef.current.pathname === '/chat/global/Global-Chatroom';
          if (!onGlobalPage) {
            setMessageBubbles((prev) => {
              const existing = prev.find((b) => b.isGlobal);
              if (existing) {
                return prev.map((b) => b.isGlobal
                  ? { ...b, count: b.count + 1, senderName: data.senderName, senderPhoto: data.senderPhoto }
                  : b);
              }
              const next = [...prev, { roomId: 'global', isGlobal: true, count: 1, senderName: data.senderName, senderPhoto: data.senderPhoto }];
              return next.slice(-3);
            });
          }
        }
        lastKnownGlobalMessageAtRef.current = msgTime;
      }
      isFirstGlobalLoadRef.current = false;
    });
    return () => unsubscribe();
  }, [currentUid]);

  // ── Floating call bar: incoming personal calls from any room I'm in ──
  useEffect(() => {
    if (!currentUid) return;
    const q = query(collection(db, "personal-calls"), where("participants", "array-contains", currentUid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      let found = null;
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.status === "ringing" && data.hostId !== currentUid) {
          found = { roomId: docSnap.id, hostId: data.hostId, hostName: data.hostName, hostPhoto: data.hostPhoto };
        }
      });
      setIncomingPersonalCall(found);
    });
    return () => unsubscribe();
  }, [currentUid]);

  // ── Floating call bar: incoming global conference calls ──
  useEffect(() => {
    if (!currentUid) return;
    const unsubscribe = onSnapshot(doc(db, "global-calls", GLOBAL_ROOM_ID), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.status === "ringing" && data.hostId !== currentUid) {
          setIncomingGlobalCall({ hostName: data.hostName });
          return;
        }
      }
      setIncomingGlobalCall(null);
    });
    return () => unsubscribe();
  }, [currentUid]);

  // ── Clear bubbles for a room the moment the user actually opens that room ──
  useEffect(() => {
    setMessageBubbles((prev) => prev.filter((b) => {
      if (b.isGlobal) return location.pathname !== '/chat/global/Global-Chatroom';
      return !(b.otherUid && location.pathname.startsWith(`/chat/${b.otherUid}/`));
    }));
  }, [location.pathname]);

  const personalCallVisible = incomingPersonalCall && !location.pathname.startsWith(`/chat/${incomingPersonalCall.hostId}/`);
  const globalCallVisible = incomingGlobalCall && location.pathname !== '/chat/global/Global-Chatroom';
  const activeCall = personalCallVisible
    ? { type: 'personal', ...incomingPersonalCall }
    : (globalCallVisible ? { type: 'global', ...incomingGlobalCall } : null);

  const handleReceive = () => {
    if (!activeCall) return;
    if (activeCall.type === 'personal') {
      navigate(`/chat/${activeCall.hostId}/${encodeURIComponent(activeCall.hostName || 'Student')}`, { state: { autoJoinCall: true } });
    } else {
      navigate('/chat/global/Global-Chatroom', { state: { autoJoinCall: true } });
    }
  };

  const handleDecline = async () => {
    if (!activeCall) return;
    if (activeCall.type === 'personal') {
      try { await updateDoc(doc(db, "personal-calls", activeCall.roomId), { status: "ended" }); } catch (err) { /* best effort */ }
      setIncomingPersonalCall(null);
    } else {
      // matches the existing "Ignore" behavior inside GlobalChat.jsx — dismiss locally only
      setIncomingGlobalCall(null);
    }
  };

  const handleBubbleClick = (bubble) => {
    if (bubble.isGlobal) navigate('/chat/global/Global-Chatroom');
    else navigate(`/chat/${bubble.otherUid}/${encodeURIComponent(bubble.senderName || 'Student')}`);
    setMessageBubbles((prev) => prev.filter((b) => b !== bubble));
  };

  const fallbackAvatar = (name) => `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name || 'Student')}`;

  if (!currentUid) return null;

  return (
    <>
      {/* 🔧 NEW: thin floating call bar — appears at the very top, above everything,
          from anywhere in the app, whenever someone is calling and I'm not already
          looking at that exact chat/room. */}
      {activeCall && (
        <div style={{
          position: 'fixed', top: '8px', left: '50%', transform: 'translateX(-50%)',
          zIndex: 2000, background: '#0056b3', color: '#fff', borderRadius: '30px',
          padding: '6px 14px', boxShadow: '0 6px 18px rgba(0,0,0,0.25)',
          display: 'flex', alignItems: 'center', gap: '10px', maxWidth: '92vw'
        }}>
          <button
            onClick={handleDecline}
            title="Decline"
            style={{ background: '#dc3545', border: 'none', color: '#fff', width: '28px', height: '28px', borderRadius: '50%', cursor: 'pointer', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          >
            ✕
          </button>

          <img
            src={(activeCall.hostPhoto && activeCall.hostPhoto.trim() !== "") ? activeCall.hostPhoto : fallbackAvatar(activeCall.hostName)}
            alt=""
            style={{ width: '30px', height: '30px', borderRadius: '50%', objectFit: 'cover', border: '2px solid #fff', flexShrink: 0 }}
          />
          <span style={{ fontSize: '12px', fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            📞 {activeCall.hostName} {activeCall.type === 'global' ? 'started a conference' : 'is calling'}
          </span>

          <button
            onClick={handleReceive}
            title="Receive"
            style={{ background: '#28a745', border: 'none', color: '#fff', width: '28px', height: '28px', borderRadius: '50%', cursor: 'pointer', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          >
            ✓
          </button>
        </div>
      )}

      {/* 🔧 NEW: floating bottom-right message bubbles — one small round avatar per
          sender/room with unseen messages, stacked, with an unread-count badge. */}
      {messageBubbles.length > 0 && (
        <div style={{
          position: 'fixed', bottom: '20px', right: '16px', zIndex: 1900,
          display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'flex-end'
        }}>
          {messageBubbles.map((bubble, idx) => (
            <button
              key={bubble.isGlobal ? 'global' : bubble.roomId}
              onClick={() => handleBubbleClick(bubble)}
              title={`${bubble.senderName || 'Student'} — ${bubble.count} new message${bubble.count > 1 ? 's' : ''}`}
              style={{
                position: 'relative', width: '52px', height: '52px', borderRadius: '50%',
                border: 'none', padding: 0, cursor: 'pointer', boxShadow: '0 4px 14px rgba(0,0,0,0.3)'
              }}
            >
              <img
                src={(bubble.senderPhoto && bubble.senderPhoto.trim() !== "") ? bubble.senderPhoto : fallbackAvatar(bubble.senderName)}
                alt=""
                style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover', border: '2px solid #0056b3', background: '#e4e6eb', display: 'block' }}
              />
              <span style={{
                position: 'absolute', top: '-4px', right: '-4px', background: '#dc3545', color: '#fff',
                fontSize: '11px', fontWeight: 'bold', minWidth: '20px', height: '20px', borderRadius: '10px',
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px', border: '2px solid #fff'
              }}>
                {bubble.count > 9 ? '9+' : bubble.count}
              </span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
