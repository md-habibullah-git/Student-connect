import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { db, auth } from '../firebase';
import { 
  collection, addDoc, onSnapshot, query, orderBy, limit, 
  serverTimestamp, doc, setDoc, deleteDoc, updateDoc, getDoc, getDocs, where 
} from 'firebase/firestore';
import { ZegoUIKitPrebuilt } from '@zegocloud/zego-uikit-prebuilt';

const MAX_VOICE_BASE64_LENGTH = 1100000;
const MAX_RECORDING_SECONDS = 30;

// identical voice message player used in PersonalChat.jsx — circular
// play/pause button + a canvas that draws the audio's REAL frequency data
// (Web Audio API) while it plays, themed per-bubble.
function VoiceMessageBubble({ src, isMe }) {
  const audioRef = useRef(null);
  const canvasRef = useRef(null);
  const analyserRef = useRef(null);
  const audioCtxRef = useRef(null);
  const rafRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  const activeBarColor = isMe ? 'rgba(255,255,255,0.95)' : '#0056b3';
  const idleBarColor = isMe ? 'rgba(255,255,255,0.35)' : 'rgba(0,86,179,0.3)';

  const drawIdleBars = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const barCount = 24;
    const barWidth = w / barCount - 2;
    ctx.fillStyle = idleBarColor;
    for (let i = 0; i < barCount; i++) {
      const barHeight = 3 + Math.abs(Math.sin(i * 1.3)) * 5;
      ctx.fillRect(i * (barWidth + 2), (h - barHeight) / 2, barWidth, barHeight);
    }
  };

  const drawLiveBars = () => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(dataArray);

    ctx.clearRect(0, 0, w, h);
    const barCount = 24;
    const step = Math.max(1, Math.floor(bufferLength / barCount));
    const barWidth = w / barCount - 2;
    ctx.fillStyle = activeBarColor;
    for (let i = 0; i < barCount; i++) {
      const value = dataArray[i * step] || 0;
      const barHeight = Math.max(2, (value / 255) * h);
      ctx.fillRect(i * (barWidth + 2), (h - barHeight) / 2, barWidth, barHeight);
    }
    rafRef.current = requestAnimationFrame(drawLiveBars);
  };

  useEffect(() => {
    drawIdleBars();
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setupAnalyser = () => {
    if (audioCtxRef.current) return;
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioContextClass();
      const source = audioCtx.createMediaElementSource(audioRef.current);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);
      analyser.connect(audioCtx.destination);
      audioCtxRef.current = audioCtx;
      analyserRef.current = analyser;
    } catch (err) {
      // Web Audio API unavailable/blocked — playback still works, just without live bars.
    }
  };

  const togglePlay = () => {
    const audioEl = audioRef.current;
    if (!audioEl) return;
    setupAnalyser();
    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    if (isPlaying) audioEl.pause();
    else audioEl.play();
  };

  useEffect(() => {
    const audioEl = audioRef.current;
    if (!audioEl) return;
    const onPlay = () => { setIsPlaying(true); drawLiveBars(); };
    const onPause = () => { setIsPlaying(false); cancelAnimationFrame(rafRef.current); drawIdleBars(); };
    const onEnded = () => { setIsPlaying(false); cancelAnimationFrame(rafRef.current); drawIdleBars(); setCurrentTime(0); };
    const onLoaded = () => setDuration(audioEl.duration || 0);
    const onTimeUpdate = () => setCurrentTime(audioEl.currentTime || 0);
    audioEl.addEventListener('play', onPlay);
    audioEl.addEventListener('pause', onPause);
    audioEl.addEventListener('ended', onEnded);
    audioEl.addEventListener('loadedmetadata', onLoaded);
    audioEl.addEventListener('timeupdate', onTimeUpdate);
    return () => {
      audioEl.removeEventListener('play', onPlay);
      audioEl.removeEventListener('pause', onPause);
      audioEl.removeEventListener('ended', onEnded);
      audioEl.removeEventListener('loadedmetadata', onLoaded);
      audioEl.removeEventListener('timeupdate', onTimeUpdate);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const formatTime = (secs) => {
    if (!isFinite(secs) || secs < 0) return '0:00';
    return `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, '0')}`;
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 8px', minWidth: '210px' }}>
      <audio ref={audioRef} src={src} preload="metadata" style={{ display: 'none' }} />
      <button
        type="button"
        onClick={togglePlay}
        style={{
          width: '30px', height: '30px', borderRadius: '50%', border: 'none', cursor: 'pointer',
          background: isMe ? 'rgba(255,255,255,0.25)' : 'rgba(0,86,179,0.12)',
          color: isMe ? '#fff' : '#0056b3', display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, fontSize: '13px'
        }}
      >
        {isPlaying ? '⏸️' : '▶️'}
      </button>
      <canvas ref={canvasRef} width={120} height={28} style={{ flex: 1 }} />
      <span style={{ fontSize: '10px', opacity: 0.8, flexShrink: 0, minWidth: '30px', textAlign: 'right' }}>
        {formatTime(isPlaying || currentTime > 0 ? currentTime : duration)}
      </span>
    </div>
  );
}

export default function GlobalChat() {
  const navigate = useNavigate();
  const location = useLocation();
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [usersCache, setUsersCache] = useState({}); 
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [inCall, setInCall] = useState(false);
  const [incomingCall, setIncomingCall] = useState(null);
  const [showRejoinBtn, setShowRejoinBtn] = useState(false);
  const [activeMenuId, setActiveMenuId] = useState(null);
  const [replyToMessage, setReplyToMessage] = useState(null);

  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const discardRecordingRef = useRef(false);
  const capturedReplyRef = useRef(null);
  const maxDurationTimeoutRef = useRef(null);

  const recordingCanvasRef = useRef(null);
  const recordingAnalyserRef = useRef(null);
  const recordingAudioCtxRef = useRef(null);
  const recordingRafRef = useRef(null);

  const [localDeletedIds, setLocalDeletedIds] = useState(() => {
    const saved = localStorage.getItem(`global_deleted_msgs_${auth.currentUser?.uid || 'guest'}`);
    return saved ? JSON.parse(saved) : [];
  });

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null); 

  // keeps the latest inCall value available inside cleanup handlers
  // (unmount / tab-close), where React state closures would otherwise be stale.
  const inCallRef = useRef(false);
  
  const currentUid = auth.currentUser?.uid || "unknown_user";
  const currentUserName = auth.currentUser?.displayName || "Campus Student";
  const globalRoomId = "campus_global_conference_room";
  useEffect(() => {
    const autoCleanOldGlobalMessages = async () => {
      try {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7); 
        const oldMessagesQuery = query(collection(db, "global-room-messages"), where("createdAt", "<", sevenDaysAgo));
        const snapshot = await getDocs(oldMessagesQuery);
        snapshot.forEach(async (docSnapshot) => {
          await deleteDoc(doc(db, "global-room-messages", docSnapshot.id));
        });
      } catch (error) { console.error("Global Chat Storage Auto Cleanup Error:", error); }
    };
    autoCleanOldGlobalMessages();
  }, []);

  // 🔧 REMOVED: this component no longer writes its own online/offline presence.
  // GlobalAlerts.jsx (mounted once in App.jsx) now owns presence for the whole
  // app session — this used to make you appear "offline" the moment you left
  // this page, even while still using the app elsewhere.

  // 🔧 KEPT (split out from the old presence effect): if I'm still in the
  // conference call when I close the tab or leave this page, remove myself
  // from participants so the call never gets stuck "ringing" for no one.
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (inCallRef.current) {
        leaveGlobalCallBeacon();
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      if (inCallRef.current) {
        leaveGlobalCall();
      }
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [currentUid]);

  useEffect(() => {
    inCallRef.current = inCall;
  }, [inCall]);

  // elapsed-time counter shown while recording a voice message
  useEffect(() => {
    let interval;
    if (isRecording) {
      setRecordingSeconds(0);
      interval = setInterval(() => setRecordingSeconds((s) => s + 1), 1000);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  // 🔧 NEW: if GlobalAlerts sent us here to auto-join an already-ringing
  // conference call (its floating "Receive" button), join immediately instead
  // of waiting for the local "Rejoin Call" button to be clicked.
  useEffect(() => {
    if (location.state?.autoJoinCall && showRejoinBtn && !inCall) {
      handleRejoinCall();
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, showRejoinBtn]);

  useEffect(() => {
    const q = query(collection(db, "global-room-messages"), orderBy("createdAt", "asc"), limit(100));
    const unsubscribeMessages = onSnapshot(q, (snapshot) => {
      setMessages(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      // 🔧 NEW: mark the global room "read as of now" for Messenger.jsx's unread count
      localStorage.setItem('lastRead_global', String(Date.now()));
    }, (error) => console.error("Global Chat Stream Error:", error));

    const unsubscribeUsers = onSnapshot(collection(db, "users"), (snapshot) => {
      const cache = {};
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        const uidKey = data.uid || doc.id;
        cache[uidKey] = { photo: data.photo || "", online: data.online === true };
      });
      setUsersCache(cache);
    });

    const unsubscribeCall = onSnapshot(doc(db, "global-calls", globalRoomId), (snapshot) => {
      if (snapshot.exists()) {
        const callData = snapshot.data();
        if (callData.status === "ringing") {
          const participants = callData.participants || [];
          if (participants.length === 0) {
            deleteDoc(doc(db, "global-calls", globalRoomId)).catch(() => {});
            setShowRejoinBtn(false);
            setIncomingCall(null);
            setInCall(false);
            return;
          }
          setShowRejoinBtn(true);
          if (callData.hostId !== currentUid && !inCall) setIncomingCall(callData);
        }
      } else {
        setShowRejoinBtn(false);
        setIncomingCall(null);
        setInCall(false);
      }
    });

    const handleOutsideClick = () => setActiveMenuId(null);
    window.addEventListener('click', handleOutsideClick);
    return () => {
      unsubscribeMessages(); unsubscribeUsers(); unsubscribeCall();
      window.removeEventListener('click', handleOutsideClick);
    };
  }, [currentUid, inCall]);

  const scrollToBottom = () => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); };
  useEffect(() => { scrollToBottom(); }, [messages]);
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() && selectedFiles.length === 0) return;

    const replyData = replyToMessage ? {
      text: replyToMessage.fileUrl ? "" : (replyToMessage.text || ""), 
      fileUrl: replyToMessage.fileUrl || "", 
      fileType: replyToMessage.fileType || "",
      senderName: replyToMessage.senderName,
      msgId: replyToMessage.id
    } : null;

    if (newMessage.trim()) {
      try {
        await addDoc(collection(db, "global-room-messages"), {
          text: newMessage, senderUid: currentUid, senderName: currentUserName,
          senderPhoto: usersCache[currentUid]?.photo || auth.currentUser?.photoURL || "",
          createdAt: serverTimestamp(), isEdited: false, isDeleted: false, replyTo: replyData
        });
        setNewMessage("");
      } catch (error) { console.error("Error sending text message:", error); }
    }

    selectedFiles.forEach(async (fileData) => {
      try {
        await addDoc(collection(db, "global-room-messages"), {
          text: "", fileUrl: fileData.url, fileType: fileData.type, fileName: fileData.name,
          senderUid: currentUid, senderName: currentUserName,
          senderPhoto: usersCache[currentUid]?.photo || auth.currentUser?.photoURL || "",
          createdAt: serverTimestamp(), isEdited: false, isDeleted: false, replyTo: replyData
        });
      } catch (error) { console.error("Error sending file to firestore:", error); }
    });
    setSelectedFiles([]); setReplyToMessage(null); 
  };

  const handleEditMessage = async (msgId, currentText) => {
    setActiveMenuId(null); 
    const newText = prompt("Edit your public campus message:", currentText);
    if (newText !== null && newText.trim() !== "") {
      try { await updateDoc(doc(db, "global-room-messages", msgId), { text: newText, isEdited: true }); } 
      catch (error) { console.error("Error editing message:", error); }
    }
  };

  const handleDeleteMessage = async (msgId, isSenderMe) => {
    setActiveMenuId(null); 
    if (window.confirm("Are you sure you want to delete this message?")) {
      if (isSenderMe) {
        try { await updateDoc(doc(db, "global-room-messages", msgId), { text: "", fileUrl: "", fileType: "", isDeleted: true }); } 
        catch (error) { console.error("Error deleting message globally:", error); }
      } else {
        const updatedDeletedIds = [...localDeletedIds, msgId];
        setLocalDeletedIds(updatedDeletedIds);
        localStorage.setItem(`global_deleted_msgs_${currentUid}`, JSON.stringify(updatedDeletedIds));
      }
    }
  };
  const handleFileChange = (e) => {
    if (!e.target.files || e.target.files.length === 0) return;
    Array.from(e.target.files).forEach((file) => {
      const fileName = file.name;
      const fileType = file.type.startsWith('image/') ? 'image' : (file.type.startsWith('video/') ? 'video' : 'file');
      if (fileType === 'image') {
        const reader = new FileReader();
        reader.onload = (event) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const max_width = 800; 
            canvas.width = max_width; canvas.height = img.height * (max_width / img.width);
            canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
            setSelectedFiles((prev) => [...prev, { id: Date.now() + Math.random(), name: fileName, url: canvas.toDataURL('image/jpeg', 0.7), type: 'image' }]);
          };
          img.src = event.target.result;
        };
        reader.readAsDataURL(file);
      } else if (fileType === 'video' && file.size <= 10000000) {
        const reader = new FileReader();
        reader.onload = (event) => {
          if (event.target.result.length <= 1100000) {
            setSelectedFiles((prev) => [...prev, { id: Date.now() + Math.random(), name: fileName, url: event.target.result, type: 'video' }]);
          } else { alert(`⚠️ "${fileName}" exceeds database transaction frame capacity!`); }
        };
        reader.readAsDataURL(file);
      } else if (file.size > 10000000) { alert(`⚠️ "${fileName}" video file size exceeds the strict optimization limit!`); }
    });
    e.target.value = null; 
  };

  const removeSelectedFile = (id) => { setSelectedFiles((prev) => prev.filter(file => file.id !== id)); };

  const sendVoiceMessage = async (audioUrl) => {
    try {
      const reply = capturedReplyRef.current;
      const replyData = reply ? {
        text: reply.fileUrl ? "" : (reply.text || ""),
        fileUrl: reply.fileUrl || "",
        fileType: reply.fileType || "",
        senderName: reply.senderName,
        msgId: reply.id
      } : null;

      await addDoc(collection(db, "global-room-messages"), {
        text: "", fileUrl: audioUrl, fileType: 'audio', fileName: 'voice-message.webm',
        senderUid: currentUid, senderName: currentUserName,
        senderPhoto: usersCache[currentUid]?.photo || auth.currentUser?.photoURL || "",
        createdAt: serverTimestamp(), isEdited: false, isDeleted: false, replyTo: replyData
      });

      setReplyToMessage(null);
      capturedReplyRef.current = null;
    } catch (error) {
      console.error("Error sending voice message:", error);
    }
  };

  const drawRecordingBars = () => {
    const canvas = recordingCanvasRef.current;
    const analyser = recordingAnalyserRef.current;
    if (!canvas || !analyser) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(dataArray);

    ctx.clearRect(0, 0, w, h);
    const barCount = 28;
    const step = Math.max(1, Math.floor(bufferLength / barCount));
    const barWidth = w / barCount - 2;
    ctx.fillStyle = '#dc3545';
    for (let i = 0; i < barCount; i++) {
      const value = dataArray[i * step] || 0;
      const barHeight = Math.max(2, (value / 255) * h);
      ctx.fillRect(i * (barWidth + 2), (h - barHeight) / 2, barWidth, barHeight);
    }
    recordingRafRef.current = requestAnimationFrame(drawRecordingBars);
  };

  const stopRecordingVisualizer = () => {
    cancelAnimationFrame(recordingRafRef.current);
    if (recordingAudioCtxRef.current) {
      recordingAudioCtxRef.current.close().catch(() => {});
      recordingAudioCtxRef.current = null;
    }
    recordingAnalyserRef.current = null;
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        const audioCtx = new AudioContextClass();
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64;
        source.connect(analyser);
        recordingAudioCtxRef.current = audioCtx;
        recordingAnalyserRef.current = analyser;
        drawRecordingBars();
      } catch (visualizerErr) {
        // visualization is best-effort; recording still works without it
      }

      let recorderOptions = { audioBitsPerSecond: 32000 };
      if (window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        recorderOptions.mimeType = 'audio/webm;codecs=opus';
      }
      const recorder = new MediaRecorder(stream, recorderOptions);
      audioChunksRef.current = [];
      discardRecordingRef.current = false;
      capturedReplyRef.current = replyToMessage;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach(track => track.stop());
        stopRecordingVisualizer();
        clearTimeout(maxDurationTimeoutRef.current);

        if (discardRecordingRef.current) {
          audioChunksRef.current = [];
          return;
        }
        const audioBlob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        const reader = new FileReader();
        reader.onload = (event) => {
          const audioUrl = event.target.result;
          if (audioUrl.length > MAX_VOICE_BASE64_LENGTH) {
            alert("This voice message is too large to send, even after compression. Please record a shorter message.");
            return;
          }
          sendVoiceMessage(audioUrl);
        };
        reader.readAsDataURL(audioBlob);
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);

      maxDurationTimeoutRef.current = setTimeout(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          discardRecordingRef.current = true;
          mediaRecorderRef.current.stop();
          setIsRecording(false);
          alert("Voice messages can be up to 30 seconds long. Recording has been stopped and discarded — please try again.");
        }
      }, MAX_RECORDING_SECONDS * 1000);
    } catch (error) {
      console.error("Microphone access error:", error);
      alert("🎤 Microphone access was denied or is unavailable.");
    }
  };

  const stopAndSendRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      clearTimeout(maxDurationTimeoutRef.current);
      discardRecordingRef.current = false;
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      clearTimeout(maxDurationTimeoutRef.current);
      discardRecordingRef.current = true;
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const initiateGlobalCall = async () => {
    try { await setDoc(doc(db, "global-calls", globalRoomId), { status: "ringing", hostName: currentUserName, hostId: currentUid, roomId: globalRoomId, participants: [currentUid] }); setInCall(true); } 
    catch (err) { console.error("Error initiating global call:", err); }
  };

  const handleRejoinCall = async () => {
    try {
      const callDocRef = doc(db, "global-calls", globalRoomId);
      const snapshot = await getDoc(callDocRef);
      if (snapshot.exists()) {
        const updatedParts = snapshot.data().participants || [];
        if (!updatedParts.includes(currentUid)) updatedParts.push(currentUid);
        await updateDoc(callDocRef, { participants: updatedParts });
        setIncomingCall(null); setInCall(true);
      }
    } catch (err) { console.error("Error rejoining call:", err); }
  };

  const leaveGlobalCallBeacon = () => {
    try {
      const callDocRef = doc(db, "global-calls", globalRoomId);
      getDoc(callDocRef).then((snapshot) => {
        if (snapshot.exists()) {
          const updatedParts = (snapshot.data().participants || []).filter(id => id !== currentUid);
          if (updatedParts.length === 0) deleteDoc(callDocRef).catch(() => {});
          else updateDoc(callDocRef, { participants: updatedParts }).catch(() => {});
        }
      }).catch(() => {});
    } catch (err) { /* best effort only */ }
  };

  const leaveGlobalCall = async () => {
    try {
      const callDocRef = doc(db, "global-calls", globalRoomId);
      const snapshot = await getDoc(callDocRef);
      if (snapshot.exists()) {
        const updatedParts = (snapshot.data().participants || []).filter(id => id !== currentUid);
        if (updatedParts.length === 0) await deleteDoc(callDocRef);
        else await updateDoc(callDocRef, { participants: updatedParts });
      }
      setInCall(false);
    } catch (err) { console.error("Error leaving global call:", err); setInCall(false); }
  };

  const startGlobalVideoCall = async (element) => {
    if (!element) return;
    const zp = ZegoUIKitPrebuilt.create(ZegoUIKitPrebuilt.generateKitTokenForTest(32790448, "50737a7cc9627401b05b40c83eff3c2e", globalRoomId, currentUid, currentUserName));
    zp.joinRoom({
      container: element, scenario: { mode: ZegoUIKitPrebuilt.GroupCall, config: { showPlayingInMobile: true, showControlBarInMobile: true, showLayoutButton: true, showScreenSharingButton: true, showUserList: true } }, 
      showScreenSharingButton: true, turnOnCameraWhenJoining: true, turnOnMicrophoneWhenJoining: true, useFrontCamera: true, onLeaveRoom: () => { leaveGlobalCall(); }
    });
  };

  const toggleMenu = (e, msgId) => { e.stopPropagation(); setActiveMenuId(activeMenuId === msgId ? null : msgId); };

  const MicIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
      <line x1="12" y1="19" x2="12" y2="23"></line>
      <line x1="8" y1="23" x2="16" y2="23"></line>
    </svg>
  );

  const formatRecordingTime = (secs) => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;

  return (
    <div style={{ maxWidth: '700px', margin: '15px auto', fontFamily: 'Arial', height: '85vh', display: 'flex', flexDirection: 'column', background: 'var(--card-bg, #f4f7fc)', border: '1px solid rgba(0, 86, 179, 0.2)', borderRadius: '15px', boxShadow: '0 8px 24px rgba(0, 86, 179, 0.08)', overflow: 'hidden', position: 'relative' }}>
      <style>{`
        @keyframes pulse { 0% { opacity: 0.5; } 50% { opacity: 1; } 100% { opacity: 0.5; } }
        .dynamic-chat-input { color: #000000 !important; }
        .dynamic-chat-input::placeholder { color: #666666 !important; opacity: 0.6; }
        :root[data-theme='dark'] .dynamic-chat-input { color: #ffffff !important; }
        :root[data-theme='dark'] .dynamic-chat-input::placeholder { color: #cccccc !important; }
        .rejoin-pulse-btn { background: #28a745; color: white; border: none; padding: 8px 15px; borderRadius: 20px; cursor: pointer; fontWeight: bold; fontSize: 13px; display: flex; align-items: center; gap: 5px; animation: pulse 2s infinite; box-shadow: 0 4px 10px rgba(40,167,69,0.3); }
        .threedot-dropdown-menu { position: absolute; bottom: 100%; right: 0; background: #fff; border: 1px solid #ddd; borderRadius: 8px; boxShadow: 0 4px 12px rgba(0,0,0,0.15); padding: 5px 0; zIndex: 10; minWidth: 90px; textAlign: left; display: flex; flexDirection: column; }
        :root[data-theme='dark'] .threedot-dropdown-menu { background: #222; border-color: #444; boxShadow: 0 4px 12px rgba(0,0,0,0.4); }
        .threedot-menu-item { background: none; border: none; padding: 6px 12px; fontSize: 12px; cursor: pointer; text-align: left; width: 100%; font-weight: bold; }
        .threedot-menu-item.reply-btn { color: #28a745; } .threedot-menu-item.edit-btn { color: #0088ff; } .threedot-menu-item.delete-btn { color: #dc3545; } .threedot-menu-item:hover { background: rgba(0,0,0,0.05); }
        
        .threedot-action-btn { background: none; border: none; cursor: pointer; fontSize: 18px; color: #444444; padding: 4px 8px; opacity: 0.8; transition: all 0.2s; borderRadius: 50%; }
        .threedot-action-btn:hover { background: rgba(0, 0, 0, 0.08); opacity: 1; }
        :root[data-theme='dark'] .threedot-action-btn { color: #ffffff !important; opacity: 1 !important; text-shadow: 0 0 2px rgba(255,255,255,0.5); }
        :root[data-theme='dark'] .threedot-action-btn:hover { background: rgba(255, 255, 255, 0.15); }

        @keyframes recordPulse { 0% { opacity: 1; } 50% { opacity: 0.35; } 100% { opacity: 1; } }
        .recording-dot { width: 10px; height: 10px; border-radius: 50%; background: #dc3545; animation: recordPulse 1.2s infinite; display: inline-block; flex-shrink: 0; }
        .recording-label { color: #dc3545 !important; font-weight: bold; font-size: 13px; }
      `}</style>
      
      {inCall && <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 999, backgroundColor: '#000' }}><div ref={(el) => el && startGlobalVideoCall(el)} style={{ width: '100%', height: '100%' }} /></div>}
      
      {incomingCall && !inCall && (
        <div style={{ position: 'absolute', top: '70px', left: '15px', right: '15px', background: '#fff', border: '2px solid #28a745', borderRadius: '8px', padding: '15px', zIndex: 999, textAlign: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
          <p style={{ margin: '0 0 12px 0', fontWeight: 'bold', color: '#333' }}>📢 {incomingCall.hostName} started a global conference call!</p>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}><button onClick={handleRejoinCall} style={{ background: '#28a745', color: 'white', border: 'none', padding: '8px 20px', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>Join Now</button><button onClick={() => setIncomingCall(null)} style={{ background: '#dc3545', color: 'white', border: 'none', padding: '8px 20px', borderRadius: '5px', cursor: 'pointer' }}>Ignore</button></div>
        </div>
      )}

      <div style={{ padding: '15px 20px', background: '#0056b3', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 2px 10px rgba(0,0,0,0.1)' }}>
        <button onClick={() => navigate(-1)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', padding: '6px 14px', borderRadius: '20px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>⬅️ Back</button>
        <h3 style={{ margin: 0, fontSize: '18px', letterSpacing: '0.3px', textAlign: 'center', flex: 1 }}>Campus Global Room 👥</h3>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>{!inCall && !showRejoinBtn && <button onClick={initiateGlobalCall} style={{ background: '#28a745', color: 'white', border: 'none', padding: '8px 18px', borderRadius: '20px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>📞 Conference 📹</button>}{!inCall && showRejoinBtn && <button onClick={handleRejoinCall} className="rejoin-pulse-btn">🟢 Rejoin Call 📹</button>}</div>
      </div>
      {!inCall && (
        <>
          <div style={{ flex: 1, padding: '20px', overflowY: 'auto', background: 'var(--bg, #edf2f9)', backgroundColor: 'color-mix(in srgb, var(--bg, #fff) 93%, #0056b3 7%)', display: 'flex', flexDirection: 'column', gap: '15px' }}>
            {messages.map((getMsg) => {
              if (localDeletedIds.includes(getMsg.id)) return null;
              const isMe = getMsg.senderUid === currentUid;
              const firestoreProfilePhoto = usersCache[getMsg.senderUid]?.photo || getMsg.senderPhoto;
              const defaultFallbackAvatar = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(getMsg.senderName || 'Student')}`;
              const senderOnline = usersCache[getMsg.senderUid]?.online === true;

              return (
                <div key={getMsg.id} style={{ display: 'flex', flexDirection: isMe ? 'row-reverse' : 'row', alignItems: 'flex-end', gap: '10px' }}>
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <img src={firestoreProfilePhoto && firestoreProfilePhoto.trim() !== "" ? firestoreProfilePhoto : defaultFallbackAvatar} alt="" onError={(e) => { e.target.onerror = null; e.target.src = defaultFallbackAvatar; }} style={{ width: '34px', height: '34px', borderRadius: '50%', objectFit: 'cover', border: '1px solid #0056b3', background: '#e4e6eb', display: 'block' }} />
                    {senderOnline && (
                      <span title="Online" style={{ position: 'absolute', bottom: '-1px', right: '-1px', width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#2ecc71', border: '2px solid var(--bg, #fff)' }} />
                    )}
                  </div>
                  <div style={{ maxWidth: '75%', display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start', position: 'relative' }}>
                    <small style={{ color: 'var(--text-color, #666)', opacity: 0.8, fontSize: '11px', marginBottom: '2px' }}>{getMsg.senderName}</small>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexDirection: isMe ? 'row-reverse' : 'row' }}>
                      <div style={{ background: getMsg.isDeleted ? '#ebebeb' : (isMe ? '#0056b3' : 'var(--card-bg, #fff)'), color: getMsg.isDeleted ? '#888' : (isMe ? 'white' : 'var(--text-color, #333)'), padding: (getMsg.fileUrl || getMsg.fileType === 'audio') ? '4px' : '10px 14px', borderRadius: isMe ? '14px 14px 2px 14px' : '14px 14px 14px 2px', fontSize: '14px', boxShadow: '0 2px 5px rgba(0,0,0,0.04)', border: isMe ? 'none' : '1px solid rgba(0, 86, 179, 0.15)', wordBreak: 'break-word', display: 'flex', flexDirection: 'column', gap: '5px', overflow: 'hidden' }}>
                        {getMsg.isDeleted ? <p style={{ margin: 0, fontStyle: 'italic', fontSize: '13px', padding: '10px 14px' }}>🚫 This message was deleted</p> : (
                          <>
                            {getMsg.replyTo && (
                              <div style={{ background: isMe ? 'rgba(255,255,255,0.18)' : 'rgba(0,86,179,0.07)', padding: '6px 10px', borderRadius: '8px', borderLeft: '3px solid #0056b3', fontSize: '11px', color: isMe ? '#ffeb3b' : '#444', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: '8px', maxWidth: '240px' }}>
                                {getMsg.replyTo.fileUrl && getMsg.replyTo.fileType !== 'audio' && <img src={getMsg.replyTo.fileUrl} alt="" style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '5px', flexShrink: 0 }} />}
                                <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}><strong style={{ color: isMe ? '#fff' : '#0056b3', display: 'block', fontSize: '10px', fontStyle: 'normal' }}>↩️ {getMsg.replyTo.senderName}:</strong>{getMsg.replyTo.text || (getMsg.replyTo.fileType === 'audio' ? "🎤 Voice message" : (getMsg.replyTo.fileUrl ? "📷 Photo" : ""))}</div>
                              </div>
                            )}
                            {getMsg.fileUrl && getMsg.fileType === 'image' && <img src={getMsg.fileUrl} alt="" style={{ maxWidth: '100%', width: '320px', borderRadius: '10px', maxHeight: '350px', objectFit: 'cover', display: 'block' }} />}
                            {getMsg.fileUrl && getMsg.fileType === 'video' && <video src={getMsg.fileUrl} controls style={{ maxWidth: '100%', width: '320px', borderRadius: '10px', maxHeight: '320px', display: 'block' }} />}
                            {getMsg.fileUrl && getMsg.fileType === 'audio' && <VoiceMessageBubble src={getMsg.fileUrl} isMe={isMe} />}
                            {getMsg.text && <p style={{ margin: 0, whiteSpace: 'pre-wrap', lineHeight: '1.4' }}>{getMsg.text}{getMsg.isEdited && <span style={{ fontSize: '10px', opacity: 0.6, marginLeft: '5px', fontStyle: 'italic' }}>(edited)</span>}</p>}
                            <div style={{ display: 'flex', justifyContent: 'flex-end', opacity: 0.7, fontSize: '10px' }}>{getMsg.createdAt ? new Date(getMsg.createdAt.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ""}</div>
                          </>
                        )}
                      </div>
                      {!getMsg.isDeleted && (
                        <div style={{ position: 'relative' }}>
                          <button onClick={(e) => toggleMenu(e, getMsg.id)} className="threedot-action-btn">⋮</button>
                          {activeMenuId === getMsg.id && (
                            <div className="threedot-dropdown-menu">
                              <button onClick={() => setReplyToMessage(getMsg)} className="threedot-menu-item reply-btn">Reply ↩️</button>
                              {isMe && !getMsg.fileUrl && <button onClick={() => handleEditMessage(getMsg.id, getMsg.text)} className="threedot-menu-item edit-btn">Edit ✏️</button>}
                              <button onClick={() => handleDeleteMessage(getMsg.id, isMe)} className="threedot-menu-item delete-btn">Delete 🗑️</button>
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
          <form onSubmit={handleSendMessage} style={{ padding: '15px', background: 'var(--card-bg, #fff)', borderTop: '1px solid rgba(0, 86, 179, 0.1)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {replyToMessage && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 12px', background: 'rgba(40,167,69,0.06)', borderLeft: '4px solid #28a745', borderRadius: '6px', fontSize: '12px' }}>
                <div style={{ maxWidth: '85%', display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {replyToMessage.fileUrl && replyToMessage.fileType !== 'audio' && <img src={replyToMessage.fileUrl} alt="" style={{ width: '28px', height: '24px', objectFit: 'cover', borderRadius: '3px' }} />}
                  <div>
                    <span style={{ fontWeight: 'bold', color: '#0056b3' }}>↩️ Reply to {replyToMessage.senderName}: </span>
                    <span style={{ color: 'var(--text-color, #555)', fontStyle: 'italic' }}>{replyToMessage.text || (replyToMessage.fileType === 'audio' ? "🎤 Voice message" : (replyToMessage.fileUrl ? "📸 Photo" : ""))}</span>
                  </div>
                </div>
                <button type="button" onClick={() => setReplyToMessage(null)} style={{ background: 'none', border: 'none', color: '#dc3545', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>✕</button>
              </div>
            )}
            
            {selectedFiles.length > 0 && (
              <div style={{ display: 'flex', gap: '10px', padding: '8px 10px', background: 'rgba(0, 86, 179, 0.05)', borderRadius: '10px', overflowX: 'auto', alignItems: 'center' }}>
                {selectedFiles.map((file) => (
                  <div key={file.id} style={{ position: 'relative', width: '55px', height: '55px', flexShrink: 0, borderRadius: '6px', overflow: 'hidden', border: '1px solid #0056b3' }}>
                    <img src={file.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <button type="button" onClick={() => removeSelectedFile(file.id)} style={{ position: 'absolute', top: '2px', right: '2px', background: 'rgba(0,0,0,0.7)', color: '#fff', border: 'none', width: '16px', height: '16px', borderRadius: '50%', fontSize: '9px', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', fontWeight: 'bold' }}>✕</button>
                  </div>
                ))}
              </div>
            )}

            <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*,video/*" multiple style={{ display: 'none' }} />

            {isRecording ? (
              <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg, #e1ecf7)', backgroundColor: 'color-mix(in srgb, var(--bg, #fff) 85%, #dc3545 10%)', borderRadius: '25px', padding: '2px 6px', border: '1px solid rgba(220, 53, 69, 0.4)' }}>
                <button
                  type="button"
                  onClick={cancelRecording}
                  title="Cancel recording"
                  style={{ background: 'rgba(220, 53, 69, 0.12)', color: '#dc3545', border: 'none', width: '34px', height: '34px', borderRadius: '50%', cursor: 'pointer', fontSize: '15px', display: 'flex', justifyContent: 'center', alignItems: 'center', marginRight: '8px', flexShrink: 0 }}
                >
                  🗑️
                </button>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0' }}>
                  <span className="recording-dot" />
                  <canvas ref={recordingCanvasRef} width={120} height={26} style={{ flex: 1 }} />
                  <span className="recording-label">{formatRecordingTime(recordingSeconds)}</span>
                </div>
                <button
                  type="button"
                  onClick={stopAndSendRecording}
                  title="Send voice message"
                  style={{ background: '#0056b3', color: '#fff', border: 'none', width: '38px', height: '38px', borderRadius: '50%', cursor: 'pointer', fontSize: '15px', fontWeight: 'bold', display: 'flex', justifyContent: 'center', alignItems: 'center', boxShadow: '0 2px 8px rgba(0,86,179,0.2)', flexShrink: 0 }}
                >
                  ➤
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg, #e1ecf7)', backgroundColor: 'color-mix(in srgb, var(--bg, #fff) 85%, #0056b3 15%)', borderRadius: '25px', padding: '2px 6px', border: '1px solid rgba(0, 86, 179, 0.3)' }}>
                <button type="button" onClick={() => fileInputRef.current?.click()} style={{ background: 'rgba(0, 86, 179, 0.1)', color: '#0056b3', border: 'none', width: '34px', height: '34px', borderRadius: '50%', cursor: 'pointer', fontSize: '16px', fontWeight: 'bold', display: 'flex', justifyContent: 'center', alignItems: 'center', marginRight: '8px', flexShrink: 0 }}>➕</button>

                <button
                  type="button"
                  onClick={startRecording}
                  title="Record a voice message"
                  style={{ background: 'rgba(0, 86, 179, 0.1)', color: '#0056b3', border: 'none', width: '34px', height: '34px', borderRadius: '50%', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', marginRight: '8px', flexShrink: 0 }}
                >
                  <MicIcon />
                </button>

                <input type="text" className="dynamic-chat-input" placeholder="✍️ Type public campus message..." value={newMessage} onChange={(e) => setNewMessage(e.target.value)} style={{ flex: 1, padding: '10px 0', border: 'none', outline: 'none', fontSize: '14px', background: 'transparent' }} />
                <button type="submit" style={{ background: '#0056b3', color: '#fff', border: 'none', width: '38px', height: '38px', borderRadius: '50%', cursor: 'pointer', fontSize: '15px', fontWeight: 'bold', display: 'flex', justifyContent: 'center', alignItems: 'center', boxShadow: '0 2px 8px rgba(0,86,179,0.2)', flexShrink: 0 }}>➤</button>
              </div>
            )}
          </form>
        </>
      )}
    </div>
  );
}
