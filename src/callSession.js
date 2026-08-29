// GlobalChat.jsx - শুধু এই দুটি অংশ পরিবর্তন করুন

// ১. connectToPeer ফাংশনের শুরুতে log যোগ করুন
const connectToPeer = async (peerUid) => {
  console.log('🚀🚀🚀 connectToPeer CALLED for:', peerUid);
  console.log('🚀 My UID:', currentUid);
  console.log('🚀 peerUid === currentUid?', peerUid === currentUid);
  
  const s = ensureSession();
  
  // ⚠️ এই check টা বাদ দিন - কারণ knownPeers সমস্যা করছে
  // if (!peerUid || peerUid === currentUid || s.peerConnections[peerUid]) return;
  
  if (!peerUid || peerUid === currentUid) {
    console.log('❌ Invalid peerUid');
    return;
  }
  
  if (s.peerConnections[peerUid]) {
    console.log('⚠️ Already connected to:', peerUid);
    return;
  }
  
  console.log('✅ Proceeding with connection to:', peerUid);
  
  // বাকি code আগের মতোই...
};

// ২. participants sync useEffect পরিবর্তন করুন
useEffect(() => {
  if (!inCall) {
    console.log('❌ Not in call, skipping');
    return;
  }
  
  console.log('✅ In call, starting sync');
  const s = ensureSession();
  const callRef = doc(db, "global-calls", globalRoomId);
  
  const unsubscribe = onSnapshot(callRef, (snap) => {
    if (!snap.exists()) {
      console.log('❌ No call document');
      return;
    }
    
    const data = snap.data();
    const participants = data.participants || [];
    console.log('📋 Call data:', JSON.stringify(data));
    console.log('👥 ALL participants:', participants);
    console.log('👤 My UID:', currentUid);
    
    const otherParticipants = participants.filter(uid => uid !== currentUid);
    console.log('👥 Other participants:', otherParticipants);
    
    // ✅ প্রতিটা other participant-এর জন্য connectToPeer call করুন
    // knownPeers check বাদ দিন - সবসময় connect করার চেষ্টা করুন
    otherParticipants.forEach(uid => {
      if (!s.peerConnections[uid]) {
        console.log('🔗 Connecting to:', uid);
        connectToPeer(uid);
      } else {
        console.log('✅ Already connected to:', uid);
      }
    });
    
    // Cleanup - চলে যাওয়া peer-দের disconnect করুন
    Object.keys(s.peerConnections).forEach(uid => {
      if (!otherParticipants.includes(uid)) {
        console.log('🔌 Disconnecting:', uid);
        disconnectFromPeer(uid);
      }
    });
  });
  
  return () => unsubscribe();
}, [inCall, currentUid]);

