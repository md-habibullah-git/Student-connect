import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db, auth } from '../firebase';
import { 
  collection, addDoc, query, orderBy, onSnapshot, doc, 
  setDoc, updateDoc, getDocs, where, deleteDoc 
} from 'firebase/firestore';
import { ZegoUIKitPrebuilt } from '@zegocloud/zego-uikit-prebuilt';

export default function PersonalChat() {
  const { receiverId, receiverName } = useParams(); 
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [usersCache, setUsersCache] = useState({}); 
  
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [inCall, setInCall] = useState(false);
  const [incomingCall, setIncomingCall] = useState(null);
  const [activeMenuId, setActiveMenuId] = useState(null);
  const [replyToMessage, setReplyToMessage] = useState(null);

  // লোকাল স্টোরেজ থেকে ডিলিট হওয়া মেসেজের আইডি লোড করার জন্য নিরাপদ স্টেট চয়েস
  const [localDeletedIds, setLocalDeletedIds] = useState(() => {
    const saved = localStorage.getItem(`deleted_msgs_${auth.currentUser?.uid || 'guest'}`);
    return saved ? JSON.parse(saved) : [];
  });
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null); 

  const currentUid = auth.currentUser?.uid || "unknown_user";
  const currentUserName = auth.currentUser?.displayName || "Student";
  const targetUid = receiverId || "unknown_receiver";

  // চ্যাট রুমের ইউনিক আইডি তৈরি
  const chatRoomId = currentUid < targetUid 
    ? `${currentUid}_${targetUid}` 
    : `${targetUid}_${currentUid}`;

  // ৭ দিনের পুরনো মেসেজ অটো-ক্লিনআপ (ফায়ারস্টোর অপ্টিমাইজড ব্যাচ ডিলিট)
  useEffect(() => {
    const autoCleanOldMessages = async () => {
      try {
        const sevenDaysAgoTimestamp = Date.now() - (7 * 24 * 60 * 60 * 1000); 
        const msgCollectionRef = collection(db, "personal-rooms", chatRoomId, "messages");
        
        const oldMessagesQuery = query(msgCollectionRef, where("createdAt", "<", sevenDaysAgoTimestamp));
        const snapshot = await getDocs(oldMessagesQuery);
        
        if (!snapshot.empty) {
          const { writeBatch } = await import('firebase/firestore');
          const batch = writeBatch(db);
          snapshot.docs.forEach((docSnapshot) => {
            batch.delete(docSnapshot.ref);
          });
          await batch.commit();
        }
      } catch (error) {
        console.error("Firebase Auto Cleanup Error:", error);
      }
    };

    if (chatRoomId && auth.currentUser?.uid) {
      autoCleanOldMessages();
    }
  }, [chatRoomId]);

  // ইউজার প্রোফাইল পিকচার ক্যাশিং
  useEffect(() => {
    const unsubscribeUsers = onSnapshot(collection(db, "users"), (snapshot) => {
      const cache = {};
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        const uidKey = data.uid || doc.id;
        if (uidKey) {
          cache[uidKey] = data.photo || ""; 
        }
      });
      setUsersCache(cache);
    });

    return () => unsubscribeUsers();
  }, []);

  // মেসেজ এবং কল রিয়েল-টাইম লিসেনার
  useEffect(() => {
    if (!receiverId || !chatRoomId) return;

    const q = query(collection(db, "personal-rooms", chatRoomId, "messages"), orderBy("createdAt", "asc"));
    const unsubscribeMsg = onSnapshot(q, (snapshot) => {
      setMessages(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      if (typeof scrollToBottom === "function") scrollToBottom();
    });

    const unsubscribeCall = onSnapshot(doc(db, "personal-calls", chatRoomId), (snapshot) => {
      if (snapshot.exists()) {
        const callData = snapshot.data();
        if (callData.status === "ringing" && callData.hostId !== currentUid) {
          setIncomingCall(callData);
        } else if (callData.status === "ended") {
          setIncomingCall(null);
          setInCall(false);
        }
      }
    });

    const handleOutsideClick = () => setActiveMenuId(null);
    window.addEventListener('click', handleOutsideClick);

    return () => { 
      unsubscribeMsg(); 
      unsubscribeCall(); 
      window.removeEventListener('click', handleOutsideClick);
    };
  }, [chatRoomId, receiverId, currentUid]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);
  // মেসেজ পাঠানোর ফাংশন
  const sendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() && selectedFiles.length === 0) return;

    try {
      const roomRef = doc(db, "personal-rooms", chatRoomId);
      await setDoc(roomRef, {
        roomId: chatRoomId,
        lastActive: Date.now()
      }, { merge: true });

      const replyData = replyToMessage ? {
        text: replyToMessage.fileUrl ? "" : (replyToMessage.text || ""), 
        fileUrl: replyToMessage.fileUrl || "", 
        fileType: replyToMessage.fileType || "",
        senderName: replyToMessage.senderName,
        msgId: replyToMessage.id
      } : null;

      if (input.trim()) {
        await addDoc(collection(db, "personal-rooms", chatRoomId, "messages"), {
          text: input,
          senderId: currentUid,
          senderName: currentUserName,
          senderPhoto: usersCache[currentUid] || auth.currentUser?.photoURL || "",
          createdAt: Date.now(),
          isEdited: false,
          isDeleted: false,
          replyTo: replyData
        });
        setInput('');
      }

      if (selectedFiles.length > 0) {
        for (const fileData of selectedFiles) {
          await addDoc(collection(db, "personal-rooms", chatRoomId, "messages"), {
            text: "", 
            fileUrl: fileData.url,
            fileType: fileData.type,
            senderId: currentUid,
            senderName: currentUserName,
            senderPhoto: usersCache[currentUid] || auth.currentUser?.photoURL || "",
            createdAt: Date.now(),
            isEdited: false,
            isDeleted: false,
            replyTo: replyData
          });
        }
      }

      setSelectedFiles([]); 
      setReplyToMessage(null); 
    } catch (error) {
      console.error("Error sending message:", error);
    }
  };

  // মেসেজ এডিট এবং ডিলিট লজিক
  const handleEditMessage = async (msgId, currentText) => {
    setActiveMenuId(null); 
    const newText = prompt("Edit your private message:", currentText);
    if (newText !== null && newText.trim() !== "") {
      try {
        const msgDocRef = doc(db, "personal-rooms", chatRoomId, "messages", msgId);
        await updateDoc(msgDocRef, { text: newText, isEdited: true });
      } catch (error) {
        console.error("Error editing message:", error);
      }
    }
  };

  const handleDeleteMessage = async (msgId, isSenderMe) => {
    setActiveMenuId(null); 
    if (window.confirm("Are you sure you want to delete this message?")) {
      if (isSenderMe) {
        try {
          const msgDocRef = doc(db, "personal-rooms", chatRoomId, "messages", msgId);
          await updateDoc(msgDocRef, { text: "This message was deleted", fileUrl: "", fileType: "", isDeleted: true });
        } catch (error) {
          console.error("Error deleting message globally:", error);
        }
      } else {
        const updatedDeletedIds = [...localDeletedIds, msgId];
        setLocalDeletedIds(updatedDeletedIds);
        localStorage.setItem(`deleted_msgs_${currentUid}`, JSON.stringify(updatedDeletedIds));
      }
    }
  };

  // ক্যানভাস ভিত্তিক ইমেজ ও ভিডিও ফাইল কম্প্রেশন
  const handleFileChange = (e) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const filesArray = Array.from(e.target.files);

    filesArray.forEach((file) => {
      const fileName = file.name;
      let fileType = 'file';
      if (file.type.startsWith('image/')) fileType = 'image';
      else if (file.type.startsWith('video/')) fileType = 'video';

      if (fileType === 'image') {
        const reader = new FileReader();
        reader.onload = (event) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const max_width = 600; 
            const scaleResolution = max_width / img.width;
            canvas.width = max_width;
            canvas.height = img.height * scaleResolution;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            const compressedBase64 = canvas.toDataURL('image/jpeg', 0.6);
            setSelectedFiles((prev) => [...prev, { id: `${Date.now()}_${Math.random()}`, name: fileName, url: compressedBase64, type: 'image' }]);
          };
          img.src = event.target.result;
        };
        reader.readAsDataURL(file);
      } else if (fileType === 'video') {
        if (file.size > 700000) {
          alert(`⚠️ "${fileName}" video is too large! Keep it under 700KB.`);
          return;
        }
        const reader = new FileReader();
        reader.onload = (event) => {
          setSelectedFiles((prev) => [...prev, { id: `${Date.now()}_${Math.random()}`, name: fileName, url: event.target.result, type: 'video' }]);
        };
        reader.readAsDataURL(file);
      } else {
        if (file.size > 700000) {
          alert(`⚠️ "${fileName}" is too large! Keep it under 700KB.`);
          return;
        }
        const reader = new FileReader();
        reader.onload = (event) => {
          setSelectedFiles((prev) => [...prev, { id: `${Date.now()}_${Math.random()}`, name: fileName, url: event.target.result, type: 'file' }]);
        };
        reader.readAsDataURL(file);
      }
    });
    e.target.value = null;
  };

  const removeSelectedFile = (id) => {
    setSelectedFiles((prev) => prev.filter(file => file.id !== id));
  };

  // কল শুরু এবং শেষ করার ফাংশনস
  const initiateCall = async () => {
    await setDoc(doc(db, "personal-calls", chatRoomId), {
      status: "ringing",
      hostName: currentUserName,
      hostId: currentUid,
      roomId: chatRoomId
    });
    setInCall(true);
  };

  const endCall = async () => {
    await updateDoc(doc(db, "personal-calls", chatRoomId), { status: "ended" });
    setIncomingCall(null);
    setInCall(false);
  };

  // আপডেট করা মোবাইল-রেডি জেগোক্লাউড ভিডিও কল ফাংশন
  const startVideoCall = async (element) => {
    if (!element) return;

    // মোবাইলে ব্রাউজারের ক্যামেরা ও মাইক পারমিশন প্রম্পট ফোর্স ট্রিগার করা হলো
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      } catch (mobileError) {
        console.warn("Mobile Permission Pending or Denied:", mobileError);
      }
    }

    const appID = 32790448;
    const serverSecret = "50737a7cc9627401b05b40c83eff3c2e";
    
    const kitToken = ZegoUIKitPrebuilt.generateKitTokenForTest(
      appID, serverSecret, chatRoomId, currentUid, currentUserName
    );

    const zp = ZegoUIKitPrebuilt.create(kitToken);
    zp.joinRoom({
      container: element,
      turnOnCameraWhenJoining: true,     // মোবাইল জয়েনিং ট্র্যাকিং
      turnOnMicrophoneWhenJoining: true, // মোবাইল মাইক ওয়েকআপ ট্র্যাকিং
      useFrontCamera: true,              // মোবাইলের সামনের ক্যামেরা ডিফল্ট সেট করা হলো
      scenario: { 
        mode: ZegoUIKitPrebuilt.OneONoneCall,
        config: {
          showPlayingInMobile: true,
          showControlBarInMobile: true,
          showLayoutButton: false,
          showScreenSharingButton: false, // মোবাইলে ক্র্যাশ রোধে এটি বন্ধ রাখা হলো
          showUserList: false
        }
      },
      showScreenSharingButton: false,
      onLeaveRoom: () => { endCall(); }
    });
  };
  const toggleMenu = (e, msgId) => {
    e.stopPropagation();
    setActiveMenuId(activeMenuId === msgId ? null : msgId);
  };

  return (
    <div style={{ 
      maxWidth: '700px', margin: '15px auto', fontFamily: 'Arial', height: '85vh', 
      display: 'flex', flexDirection: 'column', background: 'var(--card-bg, #f4f7fc)', 
      border: '1px solid rgba(0, 86, 179, 0.2)', borderRadius: '15px', 
      boxShadow: '0 8px 24px rgba(0, 86, 179, 0.08)', overflow: 'hidden', position: 'relative'
    }}>
      
      <style>{`
        .dynamic-chat-input { color: #000000 !important; }
        .dynamic-chat-input::placeholder { color: #666666 !important; opacity: 0.6; }
        :root[data-theme='dark'] .dynamic-chat-input { color: #ffffff !important; }
        :root[data-theme='dark'] .dynamic-chat-input::placeholder { color: #cccccc !important; }
        
        .threedot-dropdown-menu {
          position: absolute; bottom: 100%; right: 0; background: #fff; 
          border: 1px solid #ddd; borderRadius: 8px; boxShadow: 0 4px 12px rgba(0,0,0,0.15);
          padding: 5px 0; zIndex: 10; minWidth: 90px; textAlign: left; display: flex; flexDirection: column;
        }
        :root[data-theme='dark'] .threedot-dropdown-menu {
          background: #222; border-color: #444; boxShadow: 0 4px 12px rgba(0,0,0,0.4);
        }
        .threedot-menu-item {
          background: none; border: none; padding: 6px 12px; fontSize: 12px;
          cursor: pointer; text-align: left; width: 100%; font-weight: bold;
        }
        .threedot-menu-item.reply-btn { color: #28a745; }
        .threedot-menu-item.edit-btn { color: #0088ff; }
        .threedot-menu-item.delete-btn { color: #dc3545; }
        .threedot-menu-item:hover { background: rgba(0,0,0,0.05); }
      `}</style>

      {/* চ্যাট হেডার */}
      <div style={{ padding: '15px 20px', background: '#0056b3', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 2px 10px rgba(0,0,0,0.1)' }}>
        <button onClick={() => navigate(-1)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', padding: '6px 14px', borderRadius: '20px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>⬅️ Back</button>
        <h3 style={{ margin: 0, fontSize: '18px', letterSpacing: '0.3px' }}>{receiverName}</h3>
        {!inCall && (
          <button onClick={initiateCall} style={{ background: '#28a745', color: 'white', border: 'none', padding: '8px 18px', borderRadius: '20px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            📞 Start Call 📹
          </button>
        )}
      </div>
      {/* ইনকামিং কল নোটিফিকেশন বার */}
      {incomingCall && !inCall && (
        <div style={{ position: 'absolute', top: '70px', left: '15px', right: '15px', background: '#fff', border: '2px solid #28a745', borderRadius: '8px', padding: '15px', zIndex: 999, textAlign: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
          <p style={{ margin: '0 0 12px 0', fontWeight: 'bold', color: '#333' }}>📞 {receiverName} is calling you...</p>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
            <button onClick={() => { setIncomingCall(null); setInCall(true); }} style={{ background: '#28a745', color: 'white', border: 'none', padding: '8px 20px', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>Receive</button>
            <button onClick={endCall} style={{ background: '#dc3545', color: 'white', border: 'none', padding: '8px 20px', borderRadius: '5px', cursor: 'pointer' }}>Decline</button>
          </div>
        </div>
      )}

      {/* মেইন ভিউ উইন্ডো */}
      {inCall ? (
        <div style={{ width: '100%', height: 'calc(100% - 5px)', background: '#111', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div ref={startVideoCall} style={{ width: '100%', flex: 1, height: '100%' }} />
        </div>
      ) : (
        <>
          {/* চ্যাট মেসেজ হিস্ট্রি স্ক্রিন */}
          <div style={{ 
            flex: 1, padding: '20px', overflowY: 'auto', background: 'var(--bg, #edf2f9)', 
            backgroundColor: 'color-mix(in srgb, var(--bg, #fff) 93%, #0056b3 7%)', 
            display: 'flex', flexDirection: 'column', gap: '15px' 
          }}>
            {messages.map((getMsg) => {
              if (localDeletedIds.includes(getMsg.id)) return null;

              const isMe = getMsg.senderId === currentUid;
              const firestoreProfilePhoto = usersCache[getMsg.senderId] || getMsg.senderPhoto;
              const defaultFallbackAvatar = `https://dicebear.com{encodeURIComponent(getMsg.senderName || 'Student')}&backgroundColor=0056b3`;

              return (
                <div key={getMsg.id} style={{ display: 'flex', flexDirection: isMe ? 'row-reverse' : 'row', alignItems: 'flex-end', gap: '10px' }}>
                  
                  <img 
                    src={firestoreProfilePhoto && firestoreProfilePhoto.trim() !== "" ? firestoreProfilePhoto : defaultFallbackAvatar} 
                    alt="Profile" 
                    onError={(e) => { e.target.onerror = null; e.target.src = defaultFallbackAvatar; }}
                    style={{ width: '34px', height: '34px', borderRadius: '50%', objectFit: 'cover', border: '1px solid #0056b3', background: '#e4e6eb', flexShrink: 0 }} 
                  />
                  <div style={{ maxWidth: '75%', display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start', position: 'relative' }}>
                    <small style={{ color: 'var(--text-color, #666)', opacity: 0.8, fontSize: '11px', marginBottom: '2px', paddingLeft: isMe ? '0' : '4px', paddingRight: isMe ? '4px' : '0' }}>{getMsg.senderName}</small>
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexDirection: isMe ? 'row-reverse' : 'row' }}>
                      
                      <div style={{ 
                        background: getMsg.isDeleted ? '#ebebeb' : (isMe ? '#0056b3' : 'var(--card-bg, #fff)'), 
                        color: getMsg.isDeleted ? '#888' : (isMe ? 'white' : 'var(--text-color, #333)'), 
                        padding: (getMsg.fileUrl && !getMsg.isDeleted) ? '4px' : '10px 14px', 
                        borderRadius: isMe ? '14px 14px 2px 14px' : '14px 14px 14px 2px', 
                        fontSize: '14px', boxShadow: '0 2px 5px rgba(0,0,0,0.04)', border: isMe ? 'none' : '1px solid rgba(0, 86, 179, 0.15)', wordBreak: 'break-word',
                        display: 'flex', flexDirection: 'column', gap: '5px', overflow: 'hidden'
                      }}>
                        
                        {getMsg.isDeleted ? (
                          <p style={{ margin: 0, fontStyle: 'italic', fontSize: '13px' }}>🚫 This message was deleted</p>
                        ) : (
                          <>
                            {/* মেসেজ রিপ্লাই ব্লক */}
                            {getMsg.replyTo && (
                              <div style={{ background: isMe ? 'rgba(255,255,255,0.18)' : 'rgba(0,86,179,0.07)', padding: '6px 10px', borderRadius: '8px', borderLeft: '3px solid #0056b3', fontSize: '11px', margin: getMsg.fileUrl ? '4px 4px 0 4px' : '0 0 3px 0', color: isMe ? '#ffeb3b' : '#444', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: '8px', maxWidth: '240px' }}>
                                {getMsg.replyTo.fileUrl && <img src={getMsg.replyTo.fileUrl} alt="Reply preview" style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '5px', flexShrink: 0 }} />}
                                <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  <strong style={{ color: isMe ? '#fff' : '#0056b3', display: 'block', fontSize: '10px', fontStyle: 'normal' }}>↩️ {getMsg.replyTo.senderName}:</strong>
                                  {getMsg.replyTo.text || (getMsg.replyTo.fileUrl ? "📷 Photo" : "")}
                                </div>
                              </div>
                            )}

                            {/* মাল্টিমিডিয়া ফাইল মেসেজ রেন্ডারিং */}
                            {getMsg.fileUrl && (
                              getMsg.fileType === 'image' ? (
                                <img src={getMsg.fileUrl} alt="Shared" style={{ maxWidth: '250px', maxHeight: '200px', objectFit: 'cover', borderRadius: '10px' }} />
                              ) : getMsg.fileType === 'video' ? (
                                <video src={getMsg.fileUrl} controls style={{ maxWidth: '250px', borderRadius: '10px' }} />
                              ) : (
                                <a href={getMsg.fileUrl} download style={{ color: isMe ? '#fff' : '#0056b3', textDecoration: 'underline', padding: '6px 10px', display: 'block' }}>📁 Download Document</a>
                              )
                            )}

                            {/* টেক্সট মেসেজ ও এডিটেড চেক */}
                            {getMsg.text && (
                              <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                                {getMsg.text}
                                {getMsg.isEdited && <small style={{ fontSize: '9px', opacity: 0.6, marginLeft: '6px', fontStyle: 'italic' }}>(edited)</small>}
                              </p>
                            )}
                          </>
                        )}
                      </div>

                      {/* থ্রি-ডট অ্যাকশন ড্রপডাউন মেনু এলিমেন্টস */}
                      {!getMsg.isDeleted && (
                        <div style={{ position: 'relative' }}>
                          <button 
                            onClick={(e) => toggleMenu(e, getMsg.id)} 
                            style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '16px', padding: '0 4px' }}
                          >
                            ⋮
                          </button>
                          
                          {activeMenuId === getMsg.id && (
                            <div className="threedot-dropdown-menu">
                              <button className="threedot-menu-item reply-btn" onClick={() => { setReplyToMessage(getMsg); setActiveMenuId(null); }}>Reply</button>
                              {isMe && getMsg.text && <button className="threedot-menu-item edit-btn" onClick={() => handleEditMessage(getMsg.id, getMsg.text)}>Edit</button>}
                              <button className="threedot-menu-item delete-btn" onClick={() => handleDeleteMessage(getMsg.id, isMe)}>Delete</button>
                            </div>
                          )}
                        </div>
                      )}

                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
          {/* নিচে মেসেজ ইনপুট ফর্ম সেকশন */}
          <form onSubmit={sendMessage} style={{ padding: '15px', background: 'var(--card-bg, #fff)', borderTop: '1px solid rgba(0, 86, 179, 0.1)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            
            {/* একটিভ রিপ্লাই ইন্ডিকেটর বার */}
            {replyToMessage && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 12px', background: 'rgba(40,167,69,0.06)', borderLeft: '4px solid #28a745', borderRadius: '6px', fontSize: '12px' }}>
                <div style={{ maxWidth: '85%', display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {replyToMessage.fileUrl && <img src={replyToMessage.fileUrl} alt="Reply preview" style={{ width: '28px', height: '24px', objectFit: 'cover', borderRadius: '3px' }} />}
                  <div>
                    <span style={{ fontWeight: 'bold', color: '#0056b3' }}>↩️ Reply to {replyToMessage.senderName}: </span>
                    <span style={{ color: 'var(--text-color, #555)', fontStyle: 'italic' }}>{replyToMessage.text || (replyToMessage.fileUrl ? "📷 Photo" : "")}</span>
                  </div>
                </div>
                <button type="button" onClick={() => setReplyToMessage(null)} style={{ background: 'none', border: 'none', color: '#dc3545', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>✕</button>
              </div>
            )}

            {/* সিলেক্টেড ফাইল প্রিভিউ গ্রিড (ভিডিও থাম্বনেইল ফিক্স সহ) */}
            {selectedFiles.length > 0 && (
              <div style={{ display: 'flex', gap: '10px', padding: '8px 10px', background: 'rgba(0, 86, 179, 0.05)', borderRadius: '10px', overflowX: 'auto', alignItems: 'center' }}>
                {selectedFiles.map((file) => (
                  <div key={file.id} style={{ position: 'relative', width: '55px', height: '55px', flexShrink: 0, borderRadius: '6px', overflow: 'hidden', border: '1px solid #0056b3', background: '#ccc' }}>
                    {file.type === 'video' ? (
                      <div style={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '20px', background: '#000' }}>📹</div>
                    ) : file.type === 'file' ? (
                      <div style={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '18px', background: '#fff', fontWeight: 'bold' }}>📄</div>
                    ) : (
                      <img src={file.url} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    )}
                    <button type="button" onClick={() => removeSelectedFile(file.id)} style={{ position: 'absolute', top: '2px', right: '2px', background: 'rgba(0,0,0,0.7)', color: '#fff', border: 'none', width: '16px', height: '16px', borderRadius: '50%', fontSize: '9px', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', fontWeight: 'bold', zIndex: 5 }}>✕</button>
                  </div>
                ))}
              </div>
            )}

            <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*,video/*,.pdf,.doc,.docx" multiple style={{ display: 'none' }} />

            {/* টেক্সট ইনপুট এরিয়া ও সেন্ড অ্যাকশন */}
            <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg, #e1ecf7)', backgroundColor: 'color-mix(in srgb, var(--bg, #fff) 85%, #0056b3 15%)', borderRadius: '25px', padding: '2px 6px', border: '1px solid rgba(0, 86, 179, 0.3)' }}>
              <button type="button" onClick={() => fileInputRef.current.click()} style={{ background: 'rgba(0, 86, 179, 0.1)', color: '#0056b3', border: 'none', width: '34px', height: '34px', borderRadius: '50%', cursor: 'pointer', fontSize: '16px', fontWeight: 'bold', display: 'flex', justifyContent: 'center', alignItems: 'center', marginRight: '8px', flexShrink: 0 }}>➕</button>
              <input type="text" className="dynamic-chat-input" placeholder="✍️ Type a private message..." value={input} onChange={(e) => setInput(e.target.value)} style={{ flex: 1, padding: '10px 0', border: 'none', outline: 'none', fontSize: '14px', background: 'transparent' }} />
              <button type="submit" style={{ background: '#0056b3', color: '#fff', border: 'none', width: '38px', height: '38px', borderRadius: '50%', cursor: 'pointer', fontSize: '15px', fontWeight: 'bold', display: 'flex', justifyContent: 'center', alignItems: 'center', boxShadow: '0 2px 8px rgba(0,86,179,0.2)', flexShrink: 0 }}>➤</button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
