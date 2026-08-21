// File Name: src/components/GlobalAlerts.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { db, auth } from '../firebase';
import {
  collection, doc, onSnapshot, query, where, orderBy, limit,
  updateDoc, setDoc
} from 'firebase/firestore';

const GLOBAL_ROOM_ID = "campus_global_conference_room";

// 🔧 NEW: proper phone icons instead of plain ✓ / ✕ characters
const PhoneAcceptIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.01-.24c1.12.37 2.33.57 3.58.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1C10.4 21 3 13.6 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.46.57 3.58a1 1 0 0 1-.24 1.01l-2.21 2.2z" />
  </svg>
);
const PhoneDeclineIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1a1 1 0 0 1-1 1c-1.24 0-2.45-.2-3.57-.57a1 1 0 0 1-.68-.95v-3.5a1 1 0 0 1 .74-.97A17.9 17.9 0 0 1 12 7c1.99 0 3.91.31 5.71.88a1 1 0 0 1 .74.97v3.5a1 1 0 0 1-.68.95 11.9 11.9 0 0 1-3.57.57 1 1 0 0 1-1-1v-3.1A17.9 17.9 0 0 0 12 9z" />
  </svg>
);

export default function GlobalAlerts() {
  const location = useLocation();
  const navigate = useNavigate();
  const currentUid = auth.currentUser?.uid || null;

  const [messageBubbles, setMessageBubbles] = useState([]);
  const [incomingPersonalCall, setIncomingPersonalCall] = useState(null);
  const [incomingGlobalCall, setIncomingGlobalCall] = useState(null);

  // 🔧 NEW: the floating message bubble stack can be dragged anywhere on
  // screen; its position is remembered across visits.
  const [bubblePos, setBubblePos] = useState(() => {
    try {
      const saved = localStorage.getItem('floatingBubblePos');
      return saved ? JSON.parse(saved) : null; // null = use the default bottom-right corner
    } catch (err) {
      return null;
    }
  });
  const draggingRef = useRef(false);
  const dragMovedRef = useRef(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });

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
              return next.slice(-3);
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

  // 🔧 NEW: declining a personal call reloads the page — after "hangup after
  // talking" (handled inside PersonalChat.jsx's endCall) or "decline before
  // ever answering" (here), the app always resumes from a clean state.
  const handleDecline = async () => {
    if (!activeCall) return;
    if (activeCall.type === 'personal') {
      try { await updateDoc(doc(db, "personal-calls", activeCall.roomId), { status: "ended" }); } catch (err) { /* best effort */ }
      window.location.reload();
    } else {
      // matches the existing "Ignore" behavior inside GlobalChat.jsx — the
      // conference keeps running for everyone else, so only dismiss locally.
      setIncomingGlobalCall(null);
    }
  };

  const handleBubbleClick = (bubble) => {
    if (dragMovedRef.current) { dragMovedRef.current = false; return; } // ignore click right after a drag
    if (bubble.isGlobal) navigate('/chat/global/Global-Chatroom');
    else navigate(`/chat/${bubble.otherUid}/${encodeURIComponent(bubble.senderName || 'Student')}`);
    setMessageBubbles((prev) => prev.filter((b) => b !== bubble));
  };

  // 🔧 NEW: drag-to-reposition for the bubble stack (pointer events cover
  // mouse + touch in one handler set).
  const handleDragStart = (e) => {
    draggingRef.current = true;
    dragMovedRef.current = false;
    const rect = e.currentTarget.getBoundingClientRect();
    dragOffsetRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleDragMove = (e) => {
    if (!draggingRef.current) return;
    dragMovedRef.current = true;
    const stackWidth = 56;
    const stackHeight = 56 * (messageBubbles.length || 1) + 10 * (messageBubbles.length - 1);
    let newX = e.clientX - dragOffsetRef.current.x;
    let newY = e.clientY - dragOffsetRef.current.y;
    newX = Math.max(4, Math.min(window.innerWidth - stackWidth - 4, newX));
    newY = Math.max(4, Math.min(window.innerHeight - stackHeight - 4, newY));
    setBubblePos({ x: newX, y: newY });
  };

  const handleDragEnd = () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setBubblePos((pos) => {
      if (pos) localStorage.setItem('floatingBubblePos', JSON.stringify(pos));
      return pos;
    });
  };

  const fallbackAvatar = (name) => `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name || 'Student')}`;

  if (!currentUid) return null;

  const bubbleContainerStyle = bubblePos
    ? { position: 'fixed', left: `${bubblePos.x}px`, top: `${bubblePos.y}px`, zIndex: 1900, display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'flex-end', touchAction: 'none' }
    : { position: 'fixed', bottom: '20px', right: '16px', zIndex: 1900, display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'flex-end', touchAction: 'none' };

  return (
    <>
      {/* thin floating call bar — appears at the very top, above everything,
          from anywhere in the app, whenever someone is calling and I'm not already
          looking at that exact chat/room. */}
      {activeCall && (
        <div style={{
          position: 'fixed', top: '8px', left: '50%', transform: 'translateX(-50%)',
          zIndex: 2000, background: '#0056b3', color: '#fff', borderRadius: '30px',
          padding: '6px 14px', boxShadow: '0 6px 18px rgba(0,0,0,0.25)',
          display: 'flex', alignItems: 'center', gap: '10px', maxWidth: '92vw'
        }}>
          {/* 🔧 UPDATED: smarter hangup-style decline icon */}
          <button
            onClick={handleDecline}
            title="Decline"
            style={{ background: '#dc3545', border: 'none', color: '#fff', width: '30px', height: '30px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          >
            <PhoneDeclineIcon />
          </button>

          <img
            src={(activeCall.hostPhoto && activeCall.hostPhoto.trim() !== "") ? activeCall.hostPhoto : fallbackAvatar(activeCall.hostName)}
            alt=""
            style={{ width: '30px', height: '30px', borderRadius: '50%', objectFit: 'cover', border: '2px solid #fff', flexShrink: 0 }}
          />
          <span style={{ fontSize: '12px', fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            📞 {activeCall.hostName} {activeCall.type === 'global' ? 'started a conference' : 'is calling'}
          </span>

          {/* 🔧 UPDATED: smarter phone-accept icon */}
          <button
            onClick={handleReceive}
            title="Receive"
            style={{ background: '#28a745', border: 'none', color: '#fff', width: '30px', height: '30px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          >
            <PhoneAcceptIcon />
          </button>
        </div>
      )}

      {/* 🔧 UPDATED: floating message bubble stack is now draggable anywhere
          on screen — press and drag the stack, its new spot is remembered. */}
      {messageBubbles.length > 0 && (
        <div style={bubbleContainerStyle}>
          {messageBubbles.map((bubble) => (
            <button
              key={bubble.isGlobal ? 'global' : bubble.roomId}
              onPointerDown={handleDragStart}
              onPointerMove={handleDragMove}
              onPointerUp={handleDragEnd}
              onClick={() => handleBubbleClick(bubble)}
              title={`${bubble.senderName || 'Student'} — ${bubble.count} new message${bubble.count > 1 ? 's' : ''} (drag to move)`}
              style={{
                position: 'relative', width: '52px', height: '52px', borderRadius: '50%',
                border: 'none', padding: 0, cursor: 'grab', boxShadow: '0 4px 14px rgba(0,0,0,0.3)', touchAction: 'none'
              }}
            >
              <img
                src={(bubble.senderPhoto && bubble.senderPhoto.trim() !== "") ? bubble.senderPhoto : fallbackAvatar(bubble.senderName)}
                alt=""
                style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover', border: '2px solid #0056b3', background: '#e4e6eb', display: 'block', pointerEvents: 'none' }}
              />
              <span style={{
                position: 'absolute', top: '-4px', right: '-4px', background: '#dc3545', color: '#fff',
                fontSize: '11px', fontWeight: 'bold', minWidth: '20px', height: '20px', borderRadius: '10px',
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px', border: '2px solid #fff',
                pointerEvents: 'none'
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
