import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { db, auth } from '../firebase';
import { 
  collection, addDoc, query, orderBy, onSnapshot, doc, 
  setDoc, updateDoc, getDocs, where, deleteDoc 
} from 'firebase/firestore';
import { ZegoUIKitPrebuilt } from '@zegocloud/zego-uikit-prebuilt';

const MAX_VOICE_BASE64_LENGTH = 1100000;
const MAX_RECORDING_SECONDS = 30;

// Self-contained voice message player — circular play/pause button next to a
// small canvas that draws the audio's REAL frequency data (Web Audio API)
// while it plays, and a resting "idle" bar pattern otherwise.
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

export default function PersonalChat() {
  const { receiverId, receiverName } = useParams(); 
  const navigate = useNavigate();
  const location = useLocation();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [usersCache, setUsersCache] = useState({}); 
  
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [inCall, setInCall] = useState(false);
  const [incomingCall, setIncomingCall] = useState(null);
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

  // 🔧 NEW: stable container ref + a "have we already joined" guard, so the
  // Zego room is only ever joined ONCE per call — previously the container
  // used an inline arrow-function ref, which React re-invokes on every
  // re-render (e.g. every time a new chat message arrives), silently
  // triggering a second joinRoom() call for the same user and causing
  // "Failed to join the room" (error 1002099).
  const videoContainerRef = useRef(null);
  const zpInstanceRef = useRef(null);

  const [receiverOnline, setReceiverOnline] = useState(false);

  const initialMessagesLoadedRef = useRef(false);

  const [localDeletedIds, setLocalDeletedIds] = useState(() => {
    const saved = localStorage.getItem(`deleted_msgs_${auth.currentUser?.uid || 'guest'}`);
    return saved ? JSON.parse(saved) : [];
  });

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null); 

  const currentUid = auth.currentUser?.uid || "unknown_user";
  const currentUserName = auth.currentUser?.displayName || "Student";
  const targetUid = receiverId || "unknown_receiver";

  const chatRoomId = currentUid < targetUid 
    ? `${currentUid}_${targetUid}` 
    : `${targetUid}_${currentUid}`;
  useEffect(() => {
    const autoCleanOldMessages = async () => {
      try {
        const sevenDaysAgoTimestamp = new Date().getTime() - (7 * 24 * 60 * 60 * 1000); 
        const msgCollectionRef = collection(db, "personal-rooms", chatRoomId, "messages");
        
        const oldMessagesQuery = query(msgCollectionRef, where("createdAt", "<", sevenDaysAgoTimestamp));
        const snapshot = await getDocs(oldMessagesQuery);
        
        snapshot.forEach(async (docSnapshot) => {
          await deleteDoc(doc(db, "personal-rooms", chatRoomId, "messages", docSnapshot.id));
        });
      } catch (error) {
        console.error("Firebase Auto Cleanup Error:", error);
      }
    };

    if (chatRoomId) {
      autoCleanOldMessages();
    }
  }, [chatRoomId]);

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

  // request browser notification permission once, up front (presence itself
  // is now owned by GlobalAlerts.jsx, mounted once in App.jsx).
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  // watch the other person's online status for the green dot
  useEffect(() => {
    if (!targetUid) return;
    const unsubscribePresence = onSnapshot(doc(db, "users", targetUid), (snap) => {
      setReceiverOnline(snap.exists() && snap.data().online === true);
    });
    return () => unsubscribePresence();
  }, [targetUid]);

  // elapsed-time counter shown while recording a voice message
  useEffect(() => {
    let interval;
    if (isRecording) {
      setRecordingSeconds(0);
      interval = setInterval(() => setRecordingSeconds((s) => s + 1), 1000);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  // if GlobalAlerts sent us here to auto-join an already-ringing call
  // (its floating "Receive" button), skip the local incoming-call prompt and
  // jump straight into the call once we know it's actually still ringing.
  useEffect(() => {
    if (location.state?.autoJoinCall && incomingCall) {
      setIncomingCall(null);
      setInCall(true);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, incomingCall]);

  // 🔧 NEW: join the Zego room exactly once, the moment both "inCall" is true
  // AND the container div actually exists in the DOM — replaces the old
  // re-render-triggered inline ref callback.
  useEffect(() => {
    if (inCall && videoContainerRef.current && !zpInstanceRef.current) {
      startVideoCall(videoContainerRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inCall]);

  useEffect(() => {
    if (!receiverId) return;

    initialMessagesLoadedRef.current = false;

    const q = query(collection(db, "personal-rooms", chatRoomId, "messages"), orderBy("createdAt", "asc"));
    const unsubscribeMsg = onSnapshot(q, (snapshot) => {
      const newMessages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setMessages(newMessages);
      scrollToBottom();

      localStorage.setItem(`lastRead_personal_${chatRoomId}`, String(Date.now()));

      if (initialMessagesLoadedRef.current) {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const msgData = change.doc.data();
            if (msgData.senderId !== currentUid && document.hidden && 'Notification' in window && Notification.permission === 'granted') {
              new Notification(msgData.senderName || 'New message', {
                body: msgData.isDeleted ? '' : (msgData.text || (msgData.fileType === 'audio' ? '🎤 Voice message' : (msgData.fileUrl ? '📷 Photo' : ''))),
              });
            }
          }
        });
      } else {
        initialMessagesLoadedRef.current = true;
      }
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
  const sendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() && selectedFiles.length === 0) return;

    try {
      const roomRef = doc(db, "personal-rooms", chatRoomId);
      const latestPreviewText = input.trim() ? input.trim() : '📷 Photo';
      await setDoc(roomRef, {
        roomId: chatRoomId,
        participants: [currentUid, targetUid],
        lastActive: new Date().getTime(),
        lastMessageText: latestPreviewText,
        lastMessageSenderId: currentUid,
        lastMessageSenderName: currentUserName,
        lastMessageSenderPhoto: usersCache[currentUid] || auth.currentUser?.photoURL || "",
        lastMessageAt: new Date().getTime()
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
          createdAt: new Date().getTime(),
          isEdited: false,
          isDeleted: false,
          replyTo: replyData
        });
        setInput('');
      }

      selectedFiles.forEach(async (fileData) => {
        await addDoc(collection(db, "personal-rooms", chatRoomId, "messages"), {
          text: "", 
          fileUrl: fileData.url,
          fileType: fileData.type,
          senderId: currentUid,
          senderName: currentUserName,
          senderPhoto: usersCache[currentUid] || auth.currentUser?.photoURL || "",
          createdAt: new Date().getTime(),
          isEdited: false,
          isDeleted: false,
          replyTo: replyData
        });
      });

      setSelectedFiles([]); 
      setReplyToMessage(null); 
    } catch (error) {
      console.error("Error sending message:", error);
    }
  };
  const handleEditMessage = async (msgId, currentText) => {
    setActiveMenuId(null); 
    const newText = prompt("Edit your private message:", currentText);
    if (newText !== null && newText.trim() !== "") {
      try {
        const msgDocRef = doc(db, "personal-rooms", chatRoomId, "messages", msgId);
        await updateDoc(msgDocRef, {
          text: newText,
          isEdited: true
        });
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
          await updateDoc(msgDocRef, {
            text: "",
            fileUrl: "", 
            fileType: "",
            isDeleted: true
          });
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

  const handleFileChange = (e) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const filesArray = Array.from(e.target.files);

    filesArray.forEach((file) => {
      const fileName = file.name;
      const fileType = file.type.startsWith('image/') ? 'image' : (file.type.startsWith('video/') ? 'video' : 'file');

      if (fileType === 'image') {
        const reader = new FileReader();
        reader.onload = (event) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const max_width = 800; 
            const scaleResolution = max_width / img.width;
            canvas.width = max_width;
            canvas.height = img.height * scaleResolution;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7);
            setSelectedFiles((prev) => [...prev, { id: Date.now() + Math.random(), name: fileName, url: compressedBase64, type: 'image' }]);
          };
          img.src = event.target.result;
        };
        reader.readAsDataURL(file);
      } else if (fileType === 'video') {
        if (file.size > 10000000) {
          alert(`⚠️ "${fileName}" video file size exceeds the optimization threshold!`);
          return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
          const base64Result = event.target.result;
          if (base64Result.length > 1100000) {
            alert(`⚠️ "${fileName}" compressed size structural limits exceeded!`);
            return;
          }
          setSelectedFiles((prev) => [...prev, { id: Date.now() + Math.random(), name: fileName, url: base64Result, type: 'video' }]);
        };
        reader.readAsDataURL(file);
      }
    });

    e.target.value = null;
  };

  const removeSelectedFile = (id) => {
    setSelectedFiles((prev) => prev.filter(file => file.id !== id));
  };

  const sendVoiceMessage = async (audioUrl) => {
    try {
      const roomRef = doc(db, "personal-rooms", chatRoomId);
      const reply = capturedReplyRef.current;
      const replyData = reply ? {
        text: reply.fileUrl ? "" : (reply.text || ""),
        fileUrl: reply.fileUrl || "",
        fileType: reply.fileType || "",
        senderName: reply.senderName,
        msgId: reply.id
      } : null;

      await setDoc(roomRef, {
        roomId: chatRoomId,
        participants: [currentUid, targetUid],
        lastActive: new Date().getTime(),
        lastMessageText: '🎤 Voice message',
        lastMessageSenderId: currentUid,
        lastMessageSenderName: currentUserName,
        lastMessageSenderPhoto: usersCache[currentUid] || auth.currentUser?.photoURL || "",
        lastMessageAt: new Date().getTime()
      }, { merge: true });

      await addDoc(collection(db, "personal-rooms", chatRoomId, "messages"), {
        text: "",
        fileUrl: audioUrl,
        fileType: 'audio',
        senderId: currentUid,
        senderName: currentUserName,
        senderPhoto: usersCache[currentUid] || auth.currentUser?.photoURL || "",
        createdAt: new Date().getTime(),
        isEdited: false,
        isDeleted: false,
        replyTo: replyData
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

  const renderMessageText = (text) => {
    const urlPattern = /(https?:\/\/[^\s]+)/g;
    const parts = text.split(urlPattern);
    return parts.map((part, i) =>
      urlPattern.test(part) ? (
        <a key={i} href={part} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'underline', wordBreak: 'break-all' }}>
          {part}
        </a>
      ) : (
        <React.Fragment key={i}>{part}</React.Fragment>
      )
    );
  };

  const initiateCall = async () => {
    await setDoc(doc(db, "personal-calls", chatRoomId), {
      status: "ringing",
      hostName: currentUserName,
      hostId: currentUid,
      hostPhoto: usersCache[currentUid] || auth.currentUser?.photoURL || "",
      receiverId: targetUid,
      receiverName: receiverName,
      participants: [currentUid, targetUid],
      roomId: chatRoomId
    });
    setInCall(true);
  };

  // 🔧 NEW: page reloads whenever a call ends — whether it was hung up after
  // talking, or declined/ignored before ever joining — so the app is
  // guaranteed to start from a clean state instead of any leftover call UI.
  const endCall = async () => {
    await updateDoc(doc(db, "personal-calls", chatRoomId), { status: "ended" });
    window.location.reload();
  };

  // 🔧 FIX: guarded against double-invocation, and Zego's own pre-join
  // "enter your name" screen is skipped (showPreJoinView: false) — that
  // screen was the one showing mismatched light/dark styling on mobile.
  const startVideoCall = async (element) => {
    if (!element || zpInstanceRef.current) return;
    const appID = 32790448;
    const serverSecret = "50737a7cc9627401b05b40c83eff3c2e";
    
    const kitToken = ZegoUIKitPrebuilt.generateKitTokenForTest(
      appID, serverSecret, chatRoomId, currentUid, currentUserName
    );

    const zp = ZegoUIKitPrebuilt.create(kitToken);
    zpInstanceRef.current = zp;
    zp.joinRoom({
      container: element,
      scenario: { 
        mode: ZegoUIKitPrebuilt.OneONoneCall,
        config: {
          showPlayingInMobile: true,
          showControlBarInMobile: true,
          showLayoutButton: false,
          showScreenSharingButton: true,
          showUserList: false
        }
      },
      showPreJoinView: false,
      showScreenSharingButton: true,
      onLeaveRoom: () => { endCall(); }
    });
  };

  const toggleMenu = (e, msgId) => {
    e.stopPropagation();
    setActiveMenuId(activeMenuId === msgId ? null : msgId);
  };

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

        @keyframes recordPulse { 0% { opacity: 1; } 50% { opacity: 0.35; } 100% { opacity: 1; } }
        .recording-dot { width: 10px; height: 10px; border-radius: 50%; background: #dc3545; animation: recordPulse 1.2s infinite; display: inline-block; flex-shrink: 0; }
        .recording-label { color: #dc3545 !important; font-weight: bold; font-size: 13px; }
      `}</style>

      <div style={{ padding: '15px 20px', background: '#0056b3', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 2px 10px rgba(0,0,0,0.1)' }}>
        <button onClick={() => navigate(-1)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', padding: '6px 14px', borderRadius: '20px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>⬅️ Back</button>
        <h3 style={{ margin: 0, fontSize: '18px', letterSpacing: '0.3px' }}>{receiverName}</h3>
        {!inCall && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {receiverOnline && (
              <span title="Online" style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#2ecc71', border: '2px solid rgba(255,255,255,0.6)', display: 'inline-block' }} />
            )}
            <button onClick={initiateCall} style={{ background: '#28a745', color: 'white', border: 'none', padding: '8px 18px', borderRadius: '20px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              📞 Start Call 📹
            </button>
          </div>
        )}
      </div>

      {incomingCall && !inCall && (
        <div style={{ position: 'absolute', top: '70px', left: '15px', right: '15px', background: '#fff', border: '2px solid #28a745', borderRadius: '8px', padding: '15px', zIndex: 999, textAlign: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
          <p style={{ margin: '0 0 12px 0', fontWeight: 'bold', color: '#333' }}>📞 {receiverName} is calling you...</p>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
            <button onClick={() => { setIncomingCall(null); setInCall(true); }} style={{ background: '#28a745', color: 'white', border: 'none', padding: '8px 20px', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>Receive</button>
            <button onClick={endCall} style={{ background: '#dc3545', color: 'white', border: 'none', padding: '8px 20px', borderRadius: '5px', cursor: 'pointer' }}>Decline</button>
          </div>
        </div>
      )}

      {inCall ? (
        <div style={{ width: '100%', height: 'calc(100% - 5px)', background: '#111', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div ref={videoContainerRef} style={{ width: '100%', flex: 1, height: '100%' }} />
        </div>
      ) : (
        <>
          <div style={{ 
            flex: 1, padding: '20px', overflowY: 'auto', background: 'var(--bg, #edf2f9)', 
            backgroundColor: 'color-mix(in srgb, var(--bg, #fff) 93%, #0056b3 7%)', 
            display: 'flex', flexDirection: 'column', gap: '15px' 
          }}>
            {messages.map((getMsg) => {
              if (localDeletedIds.includes(getMsg.id)) return null;

              const isMe = getMsg.senderId === currentUid;
              const firestoreProfilePhoto = usersCache[getMsg.senderId] || getMsg.senderPhoto;
              const defaultFallbackAvatar = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(getMsg.senderName || 'Student')}&backgroundColor=0056b3`;

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
                        padding: (getMsg.fileUrl || getMsg.fileType === 'audio') ? '4px' : '10px 14px', 
                        borderRadius: isMe ? '14px 14px 2px 14px' : '14px 14px 14px 2px', 
                        fontSize: '14px', boxShadow: '0 2px 5px rgba(0,0,0,0.04)', border: isMe ? 'none' : '1px solid rgba(0, 86, 179, 0.15)', wordBreak: 'break-word',
                        display: 'flex', flexDirection: 'column', gap: '5px', overflow: 'hidden'
                      }}>
                        
                        {getMsg.isDeleted ? (
                          <p style={{ margin: 0, fontStyle: 'italic', fontSize: '13px', padding: '10px 14px' }}>🚫 This message was deleted</p>
                        ) : (
                          <>
                            {getMsg.replyTo && (
                              <div style={{ background: isMe ? 'rgba(255,255,255,0.18)' : 'rgba(0,86,179,0.07)', padding: '6px 10px', borderRadius: '8px', borderLeft: '3px solid #0056b3', fontSize: '11px', margin: getMsg.fileUrl ? '4px 4px 0 4px' : '0 0 3px 0', color: isMe ? '#ffeb3b' : '#444', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: '8px', maxWidth: '240px' }}>
                                {getMsg.replyTo.fileUrl && getMsg.replyTo.fileType !== 'audio' && <img src={getMsg.replyTo.fileUrl} alt="Reply preview" style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '5px', flexShrink: 0 }} />}
                                <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  <strong style={{ color: isMe ? '#fff' : '#0056b3', display: 'block', fontSize: '10px', fontStyle: 'normal' }}>↩️ {getMsg.replyTo.senderName}:</strong>
                                  {getMsg.replyTo.text || (getMsg.replyTo.fileType === 'audio' ? "🎤 Voice message" : (getMsg.replyTo.fileUrl ? "📷 Photo" : ""))}
                                </div>
                              </div>
                            )}

                            {getMsg.fileUrl && getMsg.fileType === 'image' && (
                              <img src={getMsg.fileUrl} alt="Shared Graphic" style={{ maxWidth: '100%', width: '320px', borderRadius: '10px', maxHeight: '350px', objectFit: 'cover', display: 'block' }} />
                            )}

                            {getMsg.fileUrl && getMsg.fileType === 'video' && (
                              <video src={getMsg.fileUrl} controls style={{ maxWidth: '100%', width: '320px', borderRadius: '10px', maxHeight: '320px', display: 'block' }} />
                            )}

                            {getMsg.fileUrl && getMsg.fileType === 'audio' && (
                              <VoiceMessageBubble src={getMsg.fileUrl} isMe={isMe} />
                            )}

                            {getMsg.text && (
                              <p style={{ margin: 0, fontSize: '14px', textAlign: 'left' }}>
                                {renderMessageText(getMsg.text)}
                                {getMsg.isEdited && <span style={{ fontSize: '10px', opacity: 0.6, marginLeft: '5px', fontStyle: 'italic' }}>(edited)</span>}
                              </p>
                            )}
                          </>
                        )}
                      </div>

                      {!getMsg.isDeleted && (
                        <div style={{ position: 'relative' }}>
                          <span 
                            onClick={(e) => toggleMenu(e, getMsg.id)}
                            style={{ fontSize: '18px', color: 'var(--text-color, #777)', cursor: 'pointer', padding: '0 5px', userSelect: 'none', fontWeight: 'bold' }}
                          >
                            ⋮
                          </span>
                          {activeMenuId === getMsg.id && (
                            <div className="threedot-dropdown-menu">
                              <button type="button" className="threedot-menu-item reply-btn" onClick={() => { setReplyToMessage(getMsg); setActiveMenuId(null); }}>↩️ Reply</button>
                              {isMe && !getMsg.fileUrl && <button type="button" className="threedot-menu-item edit-btn" onClick={() => handleEditMessage(getMsg.id, getMsg.text)}>✏️ Edit</button>}
                              <button type="button" className="threedot-menu-item delete-btn" onClick={() => handleDeleteMessage(getMsg.id, isMe)}>🗑️ Delete</button>
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

          <form onSubmit={sendMessage} style={{ padding: '15px', background: 'var(--card-bg, #fff)', borderTop: '1px solid rgba(0, 86, 179, 0.1)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {replyToMessage && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 12px', background: 'rgba(40,167,69,0.06)', borderLeft: '4px solid #28a745', borderRadius: '6px', fontSize: '12px' }}>
                <div style={{ maxWidth: '85%', display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {replyToMessage.fileUrl && replyToMessage.fileType !== 'audio' && <img src={replyToMessage.fileUrl} alt="Reply Input Preview" style={{ width: '28px', height: '24px', objectFit: 'cover', borderRadius: '3px' }} />}
                  <div>
                    <span style={{ fontWeight: 'bold', color: '#0056b3' }}>↩️ Reply to {replyToMessage.senderName}: </span>
                    <span style={{ color: 'var(--text-color, #555)', fontStyle: 'italic' }}>{replyToMessage.text || (replyToMessage.fileType === 'audio' ? "🎤 Voice message" : (replyToMessage.fileUrl ? "📷 Photo" : ""))}</span>
                  </div>
                </div>
                <button type="button" onClick={() => setReplyToMessage(null)} style={{ background: 'none', border: 'none', color: '#dc3545', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>✕</button>
              </div>
            )}

            {selectedFiles.length > 0 && (
              <div style={{ display: 'flex', gap: '10px', padding: '8px 10px', background: 'rgba(0, 86, 179, 0.05)', borderRadius: '10px', overflowX: 'auto', alignItems: 'center' }}>
                {selectedFiles.map((file) => (
                  <div key={file.id} style={{ position: 'relative', width: '55px', height: '55px', flexShrink: 0, borderRadius: '6px', overflow: 'hidden', border: '1px solid #0056b3' }}>
                    <img src={file.url} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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
                <button type="button" onClick={() => fileInputRef.current.click()} style={{ background: 'rgba(0, 86, 179, 0.1)', color: '#0056b3', border: 'none', width: '34px', height: '34px', borderRadius: '50%', cursor: 'pointer', fontSize: '16px', fontWeight: 'bold', display: 'flex', justifyContent: 'center', alignItems: 'center', marginRight: '8px', flexShrink: 0 }}>➕</button>

                <button
                  type="button"
                  onClick={startRecording}
                  title="Record a voice message"
                  style={{ background: 'rgba(0, 86, 179, 0.1)', color: '#0056b3', border: 'none', width: '34px', height: '34px', borderRadius: '50%', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', marginRight: '8px', flexShrink: 0 }}
                >
                  <MicIcon />
                </button>

                <input type="text" className="dynamic-chat-input" placeholder="✍️ Type a private message..." value={input} onChange={(e) => setInput(e.target.value)} style={{ flex: 1, padding: '10px 0', border: 'none', outline: 'none', fontSize: '14px', background: 'transparent' }} />
                <button type="submit" style={{ background: '#0056b3', color: '#fff', border: 'none', width: '38px', height: '38px', borderRadius: '50%', cursor: 'pointer', fontSize: '15px', fontWeight: 'bold', display: 'flex', justifyContent: 'center', alignItems: 'center', boxShadow: '0 2px 8px rgba(0,86,179,0.2)', flexShrink: 0 }}>➤</button>
              </div>
            )}
          </form>
        </>
      )}
    </div>
  );
}
