// File Name: src/utils/unreadAlertHelper.js

import { db } from '../firebase';
import { collection, query, where, onSnapshot, getDocs, orderBy, limit } from 'firebase/firestore';

// Sound function for unread alerts
export const playUnreadAlertSound = () => {
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

// Check unread personal messages on app load
export const checkUnreadPersonalMessages = async (currentUid, callback) => {
  try {
    const personalRoomsRef = collection(db, "personal-rooms");
    const q = query(personalRoomsRef, where("participants", "array-contains", currentUid));
    const snap = await getDocs(q);
    
    const unreadBubbles = [];
    
    snap.docs.forEach((docSnap) => {
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
      callback(unreadBubbles);
      playUnreadAlertSound();
    }
  } catch (err) {
    console.error("Error checking unread personal messages:", err);
  }
};

// Check unread global messages on app load
export const checkUnreadGlobalMessages = async (currentUid, callback) => {
  try {
    const globalMsgRef = collection(db, "global-room-messages");
    const lastReadKey = 'lastRead_global';
    const lastRead = Number(localStorage.getItem(lastReadKey)) || 0;
    
    const q = query(globalMsgRef, orderBy("createdAt", "desc"), limit(1));
    const snap = await getDocs(q);
    
    if (!snap.empty) {
      const data = snap.docs[0].data();
      const msgTime = data.createdAt?.seconds ? data.createdAt.seconds * 1000 : data.createdAt;
      
      if (msgTime > lastRead && data.senderUid !== currentUid) {
        const unreadBubble = {
          roomId: 'global',
          isGlobal: true,
          count: 1,
          senderName: data.senderName || 'Unknown',
          senderPhoto: data.senderPhoto || '',
        };
        
        callback([unreadBubble]);
        playUnreadAlertSound();
      }
    }
  } catch (err) {
    console.error("Error checking unread global messages:", err);
  }
};

// Check missed calls on app load
export const checkMissedCalls = async (currentUid, callback) => {
  try {
    const missedCallsRef = collection(db, "personal-calls");
    const q = query(missedCallsRef, where("participants", "array-contains", currentUid));
    const snap = await getDocs(q);
    
    const missedBubbles = [];
    
    snap.docs.forEach((docSnap) => {
      const data = docSnap.data();
      const callId = docSnap.id;
      const seenKey = `seen_call_${callId}`;
      const hasSeen = localStorage.getItem(seenKey);
      
      if (
        !hasSeen && 
        data.status === "ended" && 
        data.hostId !== currentUid && 
        !data.answer
      ) {
        missedBubbles.push({
          roomId: `missed_${callId}`,
          otherUid: data.hostId,
          isGlobal: false,
          count: 1,
          senderName: data.hostName || 'Unknown',
          senderPhoto: data.hostPhoto || '',
          isMissedCall: true,
          callTypeIcon: data.callType === 'audio' ? '🎙️' : '📹'
        });
      }
    });
    
    if (missedBubbles.length > 0) {
      callback(missedBubbles);
      playUnreadAlertSound();
    }
  } catch (err) {
    console.error("Error checking missed calls:", err);
  }
};
