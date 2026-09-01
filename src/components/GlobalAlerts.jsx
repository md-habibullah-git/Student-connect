// File Name: src/components/GlobalAlerts.jsx

// Personal call listener-এ missed call detection part-এ পরিবর্তন:

// Personal call listener with missed call bubble + sound
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
    
    // Missed call detection
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'removed') {
        const oldData = change.doc.data();
        if (oldData && oldData.hostId !== currentUid && !oldData.answer) {
          // 🔧 FIXED: Missed call localStorage-এ save করুন
          const missedCallsStorage = JSON.parse(localStorage.getItem(`missedCalls_${currentUid}`) || '[]');
          const callId = change.doc.id;
          
          // Check if already saved
          const alreadySaved = missedCallsStorage.some(call => call.callId === callId);
          
          if (!alreadySaved) {
            missedCallsStorage.push({
              callId: callId,
              hostId: oldData.hostId,
              hostName: oldData.hostName || 'Unknown',
              hostPhoto: oldData.hostPhoto || '',
              callType: oldData.callType || 'video',
              missedAt: Date.now()
            });
            localStorage.setItem(`missedCalls_${currentUid}`, JSON.stringify(missedCallsStorage));
          }
          
          // Live missed call bubble + sound
          playMessageSound();
          
          const missedBubble = {
            roomId: `missed_${change.doc.id}`,
            otherUid: oldData.hostId,
            isGlobal: false,
            count: 1,
            senderName: oldData.hostName || 'Unknown',
            senderPhoto: oldData.hostPhoto || '',
            isMissedCall: true,
            callTypeIcon: oldData.callType === 'audio' ? '🎙️' : '📹'
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
  });
  return () => unsubscribe();
}, [currentUid]);

// 🔧 FIXED: Home page load-এ localStorage থেকে missed calls check করুন
useEffect(() => {
  if (!currentUid || hasCheckedUnreadRef.current) return;
  if (location.pathname !== '/') return;
  
  hasCheckedUnreadRef.current = true;
  
  // Check missed calls from localStorage
  const missedCallsStorage = JSON.parse(localStorage.getItem(`missedCalls_${currentUid}`) || '[]');
  const seenCallsStorage = JSON.parse(localStorage.getItem(`seenCalls_${currentUid}`) || '[]');
  
  const unseenMissedCalls = missedCallsStorage.filter(call => !seenCallsStorage.includes(call.callId));
  
  if (unseenMissedCalls.length > 0) {
    const missedBubbles = unseenMissedCalls.map(call => ({
      roomId: `missed_${call.callId}`,
      otherUid: call.hostId,
      isGlobal: false,
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
  
  // Unread personal messages check (আগের মতোই)
  checkUnreadPersonalMessages(currentUid, (unreadBubbles) => {
    setMessageBubbles(prev => {
      const merged = [...prev];
      unreadBubbles.forEach(bubble => {
        const existing = merged.find(b => b.roomId === bubble.roomId);
        if (!existing) merged.push(bubble);
      });
      return merged.slice(-5);
    });
  });
  
  // Unread global messages check (আগের মতোই)
  checkUnreadGlobalMessages(currentUid, (unreadBubbles) => {
    setMessageBubbles(prev => {
      const merged = [...prev];
      unreadBubbles.forEach(bubble => {
        const existing = merged.find(b => b.roomId === bubble.roomId);
        if (!existing) merged.push(bubble);
      });
      return merged.slice(-5);
    });
  });
}, [currentUid, location.pathname]);

// 🔧 FIXED: Bubble click-এ missed call "seen" mark করুন
const handleBubbleClick = (bubble) => {
  if (dragMovedRef.current) { dragMovedRef.current = false; return; }
  
  if (bubble.isMissedCall) {
    const callId = bubble.roomId.replace('missed_', '');
    const seenCallsStorage = JSON.parse(localStorage.getItem(`seenCalls_${currentUid}`) || '[]');
    if (!seenCallsStorage.includes(callId)) {
      seenCallsStorage.push(callId);
      localStorage.setItem(`seenCalls_${currentUid}`, JSON.stringify(seenCallsStorage));
    }
  }
  
  if (!bubble.isMissedCall && !bubble.isGlobal) {
    localStorage.setItem(`lastRead_personal_${bubble.roomId}`, String(Date.now()));
  }
  if (bubble.isGlobal) {
    localStorage.setItem('lastRead_global', String(Date.now()));
  }
  
  if (bubble.isGlobal) navigate('/chat/global/Global-Chatroom');
  else navigate(`/chat/${bubble.otherUid}/${encodeURIComponent(bubble.senderName || 'Student')}`);
  setMessageBubbles((prev) => prev.filter((b) => b !== bubble));
};
