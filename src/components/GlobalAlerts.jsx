// File Name: src/components/GlobalAlerts.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { db, auth } from '../firebase';
import {
  collection, doc, onSnapshot, query, where, orderBy, limit,
  updateDoc, setDoc, getDocs
} from 'firebase/firestore';
import { getActiveCallSession, clearActiveCallSession, subscribeActiveCallSession, getActiveGlobalCallSession, clearActiveGlobalCallSession, subscribeActiveGlobalCallSession } from '../callSession';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';

const GLOBAL_ROOM_ID = "campus_global_conference_room";

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

// Sound functions with AudioContext
let ringtoneAudioCtx = null;
let ringtoneOscillator = null;
let ringtoneGainNode = null;
let ringtoneIntervalRef = null;

const startRingtone = () => {
  try {
    if (ringtoneAudioCtx) return;
    
    ringtoneAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    ringtoneGainNode = ringtoneAudioCtx.createGain();
    ringtoneGainNode.connect(ringtoneAudioCtx.destination);
    ringtoneGainNode.gain.value = 2.0;
    
    const playBeep = () => {
      try {
        if (ringtoneOscillator) {
          ringtoneOscillator.stop();
        }
        ringtoneOscillator = ringtoneAudioCtx.createOscillator();
        ringtoneOscillator.connect(ringtoneGainNode);
        ringtoneOscillator.frequency.value = 880;
        ringtoneOscillator.type = 'square';
        ringtoneOscillator.start(ringtoneAudioCtx.currentTime);
        ringtoneOscillator.stop(ringtoneAudioCtx.currentTime + 0.5);
      } catch (err) {}
    };
    
    playBeep();
    ringtoneIntervalRef = setInterval(playBeep, 1000);
  } catch (err) {}
};

const stopRingtone = () => {
  if (ringtoneIntervalRef) {
    clearInterval(ringtoneIntervalRef);
    ringtoneIntervalRef = null;
  }
  if (ringtoneOscillator) {
    try { ringtoneOscillator.stop(); } catch (err) {}
    ringtoneOscillator = null;
  }
  if (ringtoneAudioCtx) {
    ringtoneAudioCtx.close().catch(() => {});
    ringtoneAudioCtx = null;
  }
  ringtoneGainNode = null;
};

const playMessageSound = () => {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    oscillator.frequency.value = 1200;
    oscillator.type = 'sine';
    gainNode.gain.setValueAtTime(12.8, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);
    oscillator.start(audioCtx.currentTime);
    oscillator.stop(audioCtx.currentTime + 0.4);
    oscillator.onended = () => {
      audioCtx.close().catch(() => {});
    };
  } catch (err) {}
};

export default function GlobalAlerts() {
  const location = useLocation();
  const navigate = useNavigate();
  const currentUid = auth.currentUser?.uid || null;

  const [messageBubbles, setMessageBubbles] = useState([]);
  const [incomingPersonalCall, setIncomingPersonalCall] = useState(null);
  const [incomingGlobalCall, setIncomingGlobalCall] = useState(null);
  const [dismissedGlobalCalls, setDismissedGlobalCalls] = useState(() => {
    try {
      const saved = localStorage.getItem(`dismissedGlobalCalls_${auth.currentUser?.uid || 'guest'}`);
      return saved ? JSON.parse(saved) : [];
    } catch (err) {
      return [];
    }
  });

  const [activeSession, setActiveSession] = useState(() => getActiveCallSession());
  useEffect(() => {
    const unsubscribe = subscribeActiveCallSession(setActiveSession);
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (incomingPersonalCall || incomingGlobalCall) {
      startRingtone();
    } else {
      stopRingtone();
    }
    
    return () => {
      stopRingtone();
    };
  }, [incomingPersonalCall, incomingGlobalCall]);

  useEffect(() => {
    if (!activeSession || activeSession.type !== 'personal') return;
    const unsubscribe = onSnapshot(doc(db, "personal-calls", activeSession.chatRoomId), (snap) => {
      const data = snap.data();
      if (!snap.exists() || data?.status === 'ended') {
        const current = getActiveCallSession();
        if (current && current.chatRoomId === activeSession.chatRoomId) {
          if (current.peerConnection) current.peerConnection.close();
          if (current.localStream) current.localStream.getTracks().forEach(t => t.stop());
          if (current.remoteStream) current.remoteStream.getTracks().forEach(t => t.stop());
          clearActiveCallSession();
        }
      }
    });
    return unsubscribe;
  }, [activeSession?.chatRoomId]);

  const [bubblePos, setBubblePos] = useState(() => {
    try {
      const saved = localStorage.getItem('floatingBubblePos');
      return saved ? JSON.parse(saved) : null;
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

  const [activeGlobalSession, setActiveGlobalSession] = useState(() => getActiveGlobalCallSession());
  useEffect(() => {
    const unsubscribe = subscribeActiveGlobalCallSession(setActiveGlobalSession);
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!activeGlobalSession || !currentUid) return;
    const unsubscribe = onSnapshot(doc(db, "global-calls", GLOBAL_ROOM_ID), (snap) => {
      const data = snap.data();
      const stillIn = snap.exists() && (data.participants || []).includes(currentUid);
      if (!stillIn) {
        const current = getActiveGlobalCallSession();
        if (current) {
          Object.values(current.peerConnections || {}).forEach(pc => pc.close());
          Object.values(current.peerUnsubscribers || {}).forEach(fns => fns.forEach(f => f && f()));
          if (current.localStream) current.localStream.getTracks().forEach(t => t.stop());
          Object.values(current.remoteStreams || {}).forEach(s => s.getTracks().forEach(t => t.stop()));
          clearActiveGlobalCallSession();
        }
      }
    });
    return unsubscribe;
  }, [!!activeGlobalSession, currentUid]);


  useEffect(() => {
    if (!currentUid) return;
    const selfRef = doc(db, "users", currentUid);
    const OFFLINE_GRACE_MS = 5 * 60 * 1000;
    const HEARTBEAT_MS = 60 * 1000;
    let offlineTimer = null;
    let heartbeatInterval = null;

    const goOnline = () => {
      if (offlineTimer) { clearTimeout(offlineTimer); offlineTimer = null; }
      setDoc(selfRef, { online: true, lastSeen: new Date().getTime() }, { merge: true }).catch(() => {});
      if (!heartbeatInterval) {
        heartbeatInterval = setInterval(() => {
          updateDoc(selfRef, { lastSeen: new Date().getTime() }).catch(() => {});
        }, HEARTBEAT_MS);
      }
    };

    const stopHeartbeat = () => {
      if (heartbeatInterval) { clearInterval(heartbeatInterval); heartbeatInterval = null; }
    };

    const scheduleGoOffline = () => {
      stopHeartbeat();
      if (offlineTimer) clearTimeout(offlineTimer);
      offlineTimer = setTimeout(() => {
        updateDoc(selfRef, { online: false }).catch(() => {});
        offlineTimer = null;
      }, OFFLINE_GRACE_MS);
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        scheduleGoOffline();
      } else {
        goOnline();
      }
    };

    goOnline();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const handleBeforeUnload = () => {
      updateDoc(selfRef, { online: false }).catch(() => {});
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    let appStateListenerHandle = null;
    if (Capacitor.isNativePlatform()) {
      CapacitorApp.addListener('appStateChange', ({ isActive }) => {
        if (isActive) goOnline();
        else scheduleGoOffline();
      }).then((handle) => { appStateListenerHandle = handle; }).catch((err) => {
        console.error("Capacitor App lifecycle listener error:", err);
      });
    }

    return () => {
      stopHeartbeat();
      if (offlineTimer) clearTimeout(offlineTimer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (appStateListenerHandle) appStateListenerHandle.remove();
      updateDoc(selfRef, { online: false }).catch(() => {});
    };
  }, [currentUid]);

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
            playMessageSound();
            
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
            playMessageSound();
            
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

  // Personal call listener — missed call localStorage-এ save + live bubble + sound
  useEffect(() => {
    if (!currentUid) return;
    const q = query(collection(db, "personal-calls"), where("participants", "array-contains", currentUid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      let found = null;
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const callId = docSnap.id;
        
        // Incoming ringing call
        if (data.status === "ringing" && data.hostId !== currentUid) {
          found = { roomId: callId, hostId: data.hostId, hostName: data.hostName, hostPhoto: data.hostPhoto };
        }
        
        // Missed call: status is "ended" or "missed" but no answer
        if ((data.status === "ended" || data.status === "missed") && data.hostId !== currentUid && !data.answer) {
          const missedCallsStorage = JSON.parse(localStorage.getItem(`missedCalls_${currentUid}`) || '[]');
          const alreadySaved = missedCallsStorage.some(call => call.callId === callId);
          
          if (!alreadySaved) {
            missedCallsStorage.push({
              callId: callId,
              hostId: data.hostId,
              hostName: data.hostName || 'Unknown',
              hostPhoto: data.hostPhoto || '',
              callType: data.callType || 'video',
              missedAt: Date.now(),
              isGlobal: false
            });
            localStorage.setItem(`missedCalls_${currentUid}`, JSON.stringify(missedCallsStorage));
            
            playMessageSound();
            
            const missedBubble = {
              roomId: `missed_${callId}`,
              otherUid: data.hostId,
              isGlobal: false,
              count: 1,
              senderName: data.hostName || 'Unknown',
              senderPhoto: data.hostPhoto || '',
              isMissedCall: true,
              callTypeIcon: data.callType === 'audio' ? '🎙️' : '📹'
            };
            
            setMessageBubbles((prev) => {
              const existing = prev.find((b) => b.roomId === missedBubble.roomId);
              if (!existing) {
                return [...prev, missedBubble].slice(-3);
              }
              return prev;
            });
          }
        }
      });
      setIncomingPersonalCall(found);
    });
    return () => unsubscribe();
  }, [currentUid]);

  // Global call listener — missed call localStorage-এ save + live bar
  useEffect(() => {
    if (!currentUid) return;
    const unsubscribe = onSnapshot(doc(db, "global-calls", GLOBAL_ROOM_ID), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const callId = String(data.callStartedAt || '0');
        
        if (data.status === "ringing" && data.hostId !== currentUid) {
          const alreadyDismissed = dismissedGlobalCalls.includes(callId);
          if (!alreadyDismissed) {
            setIncomingGlobalCall({ hostName: data.hostName, callId });
            return;
          }
        }
        
        // Global missed call detection
        if (data.status !== "ringing" && data.callStartedAt && data.hostId !== currentUid) {
          const memberCount = Object.keys(data.callHistory || {}).filter(k => k !== 'totalDuration').length;
          if (memberCount <= 1) {
            const missedCallsStorage = JSON.parse(localStorage.getItem(`missedCalls_${currentUid}`) || '[]');
            const globalCallId = `global_${callId}`;
            const alreadySaved = missedCallsStorage.some(call => call.callId === globalCallId);
            
            if (!alreadySaved) {
              missedCallsStorage.push({
                callId: globalCallId,
                hostId: data.hostId,
                hostName: data.hostName || 'Unknown',
                hostPhoto: '',
                callType: data.callType || 'video',
                missedAt: Date.now(),
                isGlobal: true
              });
              localStorage.setItem(`missedCalls_${currentUid}`, JSON.stringify(missedCallsStorage));
            }
          }
        }
      }
      setIncomingGlobalCall(null);
    });
    return () => unsubscribe();
  }, [currentUid, dismissedGlobalCalls]);

  // 🔧 FIXED: Home page-এ ঢুকলে সব missed calls + unread messages check + bubble + sound
  useEffect(() => {
    if (!currentUid) return;
    if (location.pathname !== '/') return;
    
    const checkAllAlerts = () => {
      // Check missed calls from localStorage
      const missedCallsStorage = JSON.parse(localStorage.getItem(`missedCalls_${currentUid}`) || '[]');
      const seenCallsStorage = JSON.parse(localStorage.getItem(`seenCalls_${currentUid}`) || '[]');
      
      const unseenMissedCalls = missedCallsStorage.filter(call => !seenCallsStorage.includes(call.callId));
      
      if (unseenMissedCalls.length > 0) {
        const missedBubbles = unseenMissedCalls.map(call => ({
          roomId: call.isGlobal ? `missed_global_${call.callId.replace('global_', '')}` : `missed_${call.callId}`,
          otherUid: call.hostId,
          isGlobal: call.isGlobal || false,
          count: 1,
          senderName: call.hostName || 'Unknown',
          senderPhoto: call.hostPhoto || '',
          isMissedCall: true,
          callTypeIcon: call.callType === 'audio' ? '🎙️' : '📹'
        }));
        
        setMessageBubbles(prev => {
          const merged = [...prev];
          missedBubbles.forEach(bubble => {
            const existing = merged.find(b => b.roomId === bubble.roomId);
            if (!existing) merged.push(bubble);
          });
          return merged.slice(-5);
        });
        
        playMessageSound();
      }
      
      // Check unread personal messages from Firestore
      const personalRoomsRef = collection(db, "personal-rooms");
      const personalQ = query(personalRoomsRef, where("participants", "array-contains", currentUid));
      
      getDocs(personalQ).then(snapshot => {
        const unreadBubbles = [];
        
        snapshot.docs.forEach((docSnap) => {
          const data = docSnap.data();
          const roomId = docSnap.id;
          const lastReadKey = `lastRead_personal_${roomId}`;
          const lastRead = Number(localStorage.getItem(lastReadKey)) || 0;
          
          if (data.lastMessageAt && data.lastMessageAt > lastRead && data.lastMessageSenderId !== currentUid) {
            const otherUid = (data.participants || []).find((id) => id !== currentUid);
            unreadBubbles.push({
              roomId,
              otherUid,
              isGlobal: false,
              count: 1,
              senderName: data.lastMessageSenderName || 'Unknown',
              senderPhoto: data.lastMessageSenderPhoto || '',
            });
          }
        });
        
        if (unreadBubbles.length > 0) {
          setMessageBubbles(prev => {
            const merged = [...prev];
            unreadBubbles.forEach(bubble => {
              const existing = merged.find(b => b.roomId === bubble.roomId);
              if (!existing) merged.push(bubble);
            });
            return merged.slice(-5);
          });
          
          playMessageSound();
        }
      }).catch(err => console.error("Error checking personal unread:", err));
      
      // Check unread global messages from Firestore
      const lastReadGlobal = Number(localStorage.getItem('lastRead_global')) || 0;
      const globalMsgRef = collection(db, "global-room-messages");
      const globalQ = query(globalMsgRef, orderBy("createdAt", "desc"), limit(1));
      
      getDocs(globalQ).then(snapshot => {
        if (!snapshot.empty) {
          const globalData = snapshot.docs[0].data();
          const msgTime = globalData.createdAt?.seconds ? globalData.createdAt.seconds * 1000 : globalData.createdAt;
          
          if (msgTime > lastReadGlobal && globalData.senderUid !== currentUid) {
            const unreadBubble = {
              roomId: 'global',
              isGlobal: true,
              count: 1,
              senderName: globalData.senderName || 'Unknown',
              senderPhoto: globalData.senderPhoto || '',
            };
            
            setMessageBubbles(prev => {
              const existing = prev.find(b => b.roomId === 'global' && !b.isMissedCall);
              if (!existing) {
                return [...prev, unreadBubble].slice(-5);
              }
              return prev;
            });
            
            playMessageSound();
          }
        }
      }).catch(err => console.error("Error checking global unread:", err));
    };
    
    checkAllAlerts();
  }, [currentUid, location.pathname]);

  useEffect(() => {
    setMessageBubbles((prev) => prev.filter((b) => {
      if (b.isGlobal) return location.pathname !== '/chat/global/Global-Chatroom';
      return !(b.otherUid && location.pathname.startsWith(`/chat/${b.otherUid}/`));
    }));
  }, [location.pathname]);

  const activeCall = incomingPersonalCall
    ? { type: 'personal', ...incomingPersonalCall }
    : (incomingGlobalCall ? { type: 'global', ...incomingGlobalCall } : null);

  const showMinimizedCallBubble = activeSession
    && activeSession.type === 'personal'
    && !location.pathname.startsWith(`/chat/${activeSession.otherUid}/`);

  const handleReceive = () => {
    if (!activeCall) return;
    stopRingtone();
    if (activeCall.type === 'personal') {
      navigate(`/chat/${activeCall.hostId}/${encodeURIComponent(activeCall.hostName || 'Student')}`, { state: { autoJoinCall: true } });
    } else {
      if (activeCall.callId) {
        const updatedList = [...dismissedGlobalCalls, activeCall.callId];
        setDismissedGlobalCalls(updatedList);
        localStorage.setItem(`dismissedGlobalCalls_${currentUid}`, JSON.stringify(updatedList));
      }
      setIncomingGlobalCall(null);
      navigate('/chat/global/Global-Chatroom', { state: { autoJoinCall: true } });
    }
  };

  const handleDecline = async () => {
    if (!activeCall) return;
    stopRingtone();
    if (activeCall.type === 'personal') {
      try { 
        await updateDoc(doc(db, "personal-calls", activeCall.roomId), { status: "ended" }); 
      } catch (err) { 
        console.error("Error declining personal call:", err);
      }
      setIncomingPersonalCall(null);
    } else {
      if (activeCall.callId) {
        const updatedList = [...dismissedGlobalCalls, activeCall.callId];
        setDismissedGlobalCalls(updatedList);
        localStorage.setItem(`dismissedGlobalCalls_${currentUid}`, JSON.stringify(updatedList));
      }
      setIncomingGlobalCall(null);
    }
  };

  const handleMinimizedCallClick = () => {
    if (!activeSession) return;
    navigate(`/chat/${activeSession.otherUid}/${encodeURIComponent(activeSession.otherName || 'Student')}`);
  };

  const handleBubbleClick = (bubble) => {
    if (dragMovedRef.current) { dragMovedRef.current = false; return; }
    
    if (bubble.isMissedCall) {
      const callId = bubble.roomId.replace('missed_global_', 'global_').replace('missed_', '');
      const seenCallsStorage = JSON.parse(localStorage.getItem(`seenCalls_${currentUid}`) || '[]');
      if (!seenCallsStorage.includes(callId)) {
        seenCallsStorage.push(callId);
        localStorage.setItem(`seenCalls_${currentUid}`, JSON.stringify(seenCallsStorage));
      }
    }
    
    if (!bubble.isMissedCall && !bubble.isGlobal) {
      localStorage.setItem(`lastRead_personal_${bubble.roomId}`, String(Date.now()));
    }
    if (bubble.isGlobal && !bubble.isMissedCall) {
      localStorage.setItem('lastRead_global', String(Date.now()));
    }
    
    if (bubble.isGlobal) navigate('/chat/global/Global-Chatroom');
    else navigate(`/chat/${bubble.otherUid}/${encodeURIComponent(bubble.senderName || 'Student')}`);
    setMessageBubbles((prev) => prev.filter((b) => b !== bubble));
  };

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
    setTimeout(() => {
      dragMovedRef.current = false;
    }, 150);
  };

  const fallbackAvatar = (name) => `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name || 'Student')}`;

  if (!currentUid) return null;

  const bubbleContainerStyle = bubblePos
    ? { position: 'fixed', left: `${bubblePos.x}px`, top: `${bubblePos.y}px`, zIndex: 1900, display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'flex-end', touchAction: 'none' }
    : { position: 'fixed', bottom: '20px', right: '16px', zIndex: 1900, display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'flex-end', touchAction: 'none' };

  return (
    <>
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

          <button
            onClick={handleReceive}
            title="Receive"
            style={{ background: '#28a745', border: 'none', color: '#fff', width: '30px', height: '30px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          >
            <PhoneAcceptIcon />
          </button>
        </div>
      )}

      {showMinimizedCallBubble && (
        <button
          onClick={handleMinimizedCallClick}
          title={`Return to call with ${activeSession.otherName || 'Student'}`}
          style={{
            position: 'fixed', top: '8px', left: '16px', zIndex: 1950,
            background: '#28a745', border: 'none', borderRadius: '30px', padding: '5px 14px 5px 5px',
            display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer',
            boxShadow: '0 6px 18px rgba(0,0,0,0.3)'
          }}
        >
          <img
            src={(activeSession.otherPhoto && activeSession.otherPhoto.trim() !== "") ? activeSession.otherPhoto : fallbackAvatar(activeSession.otherName)}
            alt=""
            style={{ width: '30px', height: '30px', borderRadius: '50%', objectFit: 'cover', border: '2px solid #fff', flexShrink: 0 }}
          />
          <span style={{ color: '#fff', fontSize: '12px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
            {activeSession.callType === 'audio' ? '🎙️' : '📹'} {activeSession.otherName || 'Student'}
          </span>
        </button>
      )}

      {activeGlobalSession && location.pathname !== '/chat/global/Global-Chatroom' && (
        <button
          onClick={() => navigate('/chat/global/Global-Chatroom')}
          title="Return to the Global Room call"
          style={{
            position: 'fixed', top: '8px', right: '16px', zIndex: 1950,
            background: '#0056b3', border: 'none', borderRadius: '30px', padding: '5px 14px 5px 5px',
            display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer',
            boxShadow: '0 6px 18px rgba(0,0,0,0.3)'
          }}
        >
          <span style={{ width: '30px', height: '30px', borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px', flexShrink: 0 }}>
            🌐
          </span>
          <span style={{ color: '#fff', fontSize: '12px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
            {activeGlobalSession.callType === 'audio' ? '🎙️' : '📹'} Global Room
          </span>
        </button>
      )}

      {messageBubbles.length > 0 && (
        <div style={bubbleContainerStyle}>
          {messageBubbles.map((bubble) => (
            <button
              key={bubble.roomId}
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
