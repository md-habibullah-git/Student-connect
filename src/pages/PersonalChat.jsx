// File Name: src/pages/PersonalChat.jsx

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { db, auth } from '../firebase';
import { isUserOnline } from '../presence';
import { 
  collection, addDoc, query, orderBy, onSnapshot, doc, 
  setDoc, updateDoc, getDoc, getDocs, where, deleteDoc, serverTimestamp 
} from 'firebase/firestore';
import { getActiveCallSession, setActiveCallSession, clearActiveCallSession, subscribeActiveCallSession } from '../callSession';

const rtcConfiguration = {
  iceServers: [
    { urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] },
    { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
  ],
  iceCandidatePoolSize: 10,
};

const MAX_VOICE_BASE64_LENGTH = 1100000;
const MAX_VIDEO_BASE64_LENGTH = 1100000;
const MAX_VIDEO_RAW_BYTES = 750000;
const MAX_RECORDING_SECONDS = 30;

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
    return () => {
      cancelAnimationFrame(rafRef.current);
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
    };
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
    } catch (err) {}
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
  }, []);

  const formatTime = (secs) => {
    if (!isFinite(secs) || secs < 0) return '0:00';
    return `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, '0')}`;
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 8px', minWidth: '210px' }}>
      <audio ref={audioRef} src={src} preload="metadata" style={{ display: 'none' }} />
      <button type="button" onClick={togglePlay} style={{ width: '30px', height: '30px', borderRadius: '50%', border: 'none', cursor: 'pointer', background: isMe ? 'rgba(255,255,255,0.25)' : 'rgba(0,86,179,0.12)', color: isMe ? '#fff' : '#0056b3', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '13px' }}>
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
  const [activeCallType, setActiveCallType] = useState('video');
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

  const [receiverOnline, setReceiverOnline] = useState(false);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const unsubscribeCallSignalRef = useRef(null);
  const unsubscribeCandidatesRef = useRef(null);
  const callStartTimeRef = useRef(null);
  const missedCallTimeoutRef = useRef(null);

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

  const formatDuration = (ms) => {
    if (!ms) return '0:00';
    const totalSeconds = Math.floor(ms / 1000);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  const formatTimeDisplay = (timestamp) => {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  useEffect(() => {
    const autoCleanOldMessages = async () => {
      try {
        const sevenDaysAgoTimestamp = new Date().getTime() - (7 * 24 * 60 * 60 * 1000); 
        const msgCollectionRef = collection(db, "personal-rooms", chatRoomId, "messages");
        const oldMessagesQuery = query(msgCollectionRef, where("createdAt", "<", sevenDaysAgoTimestamp));
        const snapshot = await getDocs(oldMessagesQuery);
        await Promise.all(
          snapshot.docs.map((docSnapshot) => deleteDoc(doc(db, "personal-rooms", chatRoomId, "messages", docSnapshot.id)))
        );
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

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (!targetUid) return;
    const unsubscribePresence = onSnapshot(doc(db, "users", targetUid), (snap) => {
      setReceiverOnline(snap.exists() && isUserOnline(snap.data()));
    });
    return () => unsubscribePresence();
  }, [targetUid]);

  useEffect(() => {
    let interval;
    if (isRecording) {
      setRecordingSeconds(0);
      interval = setInterval(() => setRecordingSeconds((s) => s + 1), 1000);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  useEffect(() => {
    if (location.state?.autoJoinCall) {
      answerIncomingCall();
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state]);

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

    const handleOutsideClick = () => setActiveMenuId(null);
    window.addEventListener('click', handleOutsideClick);

    return () => { 
      unsubscribeMsg(); 
      window.removeEventListener('click', handleOutsideClick);
    };
  }, [chatRoomId, receiverId, currentUid]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const saveCallHistory = async (callType, startedAt, endedAt, wasMissed = false) => {
    try {
      const callTypeIcon = callType === 'audio' ? '🎙️' : '📹';
      const callTypeLabel = callType === 'audio' ? 'Audio call' : 'Video call';
      let callSummaryText;
      
      if (wasMissed) {
        callSummaryText = `❌ You missed a ${callTypeLabel.toLowerCase()} • ${formatTimeDisplay(startedAt)}`;
      } else {
        const duration = endedAt - startedAt;
        callSummaryText = `${callTypeIcon} ${callTypeLabel} • ${formatTimeDisplay(startedAt)} - ${formatTimeDisplay(endedAt)}\n📞 Call • ${formatDuration(duration)} min`;
      }
      
      await addDoc(collection(db, "personal-rooms", chatRoomId, "messages"), {
        text: callSummaryText,
        senderId: 'system',
        senderName: 'System',
        senderPhoto: '',
        createdAt: endedAt || startedAt,
        isEdited: false,
        isDeleted: false,
        replyTo: null,
        isCallSummary: true
      });
    } catch (err) {
      console.error("Error saving call history:", err);
    }
  };

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

      await Promise.all(selectedFiles.map((fileData) =>
        addDoc(collection(db, "personal-rooms", chatRoomId, "messages"), {
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
        })
      ));

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
          await updateDoc(msgDocRef, { isDeleted: true });
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
        if (file.size > MAX_VIDEO_RAW_BYTES) {
          alert(`⚠️ "${fileName}" is too large to send as a video message (max ~750KB). Please choose a shorter/smaller clip.`);
          return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
          const base64Result = event.target.result;
          if (base64Result.length > MAX_VIDEO_BASE64_LENGTH) {
            alert(`⚠️ "${fileName}" is too large to send even after encoding. Please choose a shorter/smaller clip.`);
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
      } catch (visualizerErr) {}

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

  const registerPeerConnectionListeners = (pc) => {
    pc.addEventListener('icegatheringstatechange', () => {
      console.log(`ICE gathering state changed: ${pc.iceGatheringState}`);
    });
    pc.addEventListener('connectionstatechange', () => {
      console.log(`Connection state change: ${pc.connectionState}`);
    });
    pc.addEventListener('signalingstatechange', () => {
      console.log(`Signaling state change: ${pc.signalingState}`);
    });
    pc.addEventListener('iceconnectionstatechange', () => {
      console.log(`ICE connection state change: ${pc.iceConnectionState}`);
    });
  };

  const cleanupCallLocally = () => {
    if (missedCallTimeoutRef.current) {
      clearTimeout(missedCallTimeoutRef.current);
      missedCallTimeoutRef.current = null;
    }
    if (unsubscribeCallSignalRef.current) { unsubscribeCallSignalRef.current(); unsubscribeCallSignalRef.current = null; }
    if (unsubscribeCandidatesRef.current) { unsubscribeCandidatesRef.current(); unsubscribeCandidatesRef.current = null; }
    if (peerConnectionRef.current) { peerConnectionRef.current.close(); peerConnectionRef.current = null; }
    if (localStreamRef.current) { localStreamRef.current.getTracks().forEach(track => track.stop()); localStreamRef.current = null; }
    if (remoteStreamRef.current) { remoteStreamRef.current.getTracks().forEach(track => track.stop()); remoteStreamRef.current = null; }
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    clearActiveCallSession();
  };

  useEffect(() => {
    const existing = getActiveCallSession();
    if (existing && existing.type === 'personal' && existing.chatRoomId === chatRoomId) {
      peerConnectionRef.current = existing.peerConnection;
      localStreamRef.current = existing.localStream;
      remoteStreamRef.current = existing.remoteStream;
      setActiveCallType(existing.callType);
      setInCall(true);
    }
  }, [chatRoomId]);

  useEffect(() => {
    const unsubscribe = subscribeActiveCallSession((session) => {
      if (!session || session.chatRoomId !== chatRoomId) {
        peerConnectionRef.current = null;
        localStreamRef.current = null;
        remoteStreamRef.current = null;
        if (localVideoRef.current) localVideoRef.current.srcObject = null;
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
        setInCall(false);
        setActiveCallType('video');
      }
    });
    return unsubscribe;
  }, [chatRoomId]);

  useEffect(() => {
    if (inCall) {
      if (localVideoRef.current && localStreamRef.current) localVideoRef.current.srcObject = localStreamRef.current;
      if (remoteVideoRef.current && remoteStreamRef.current) remoteVideoRef.current.srcObject = remoteStreamRef.current;
    }
  }, [inCall]);

  const initiateCall = async (callType = 'video') => {
    try {
      cleanupCallLocally();
      const pc = new RTCPeerConnection(rtcConfiguration);
      peerConnectionRef.current = pc;
      registerPeerConnectionListeners(pc);

      const stream = await navigator.mediaDevices.getUserMedia({ video: callType === 'video', audio: true });
      localStreamRef.current = stream;
      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      remoteStreamRef.current = new MediaStream();
      pc.addEventListener('track', (event) => {
        event.streams[0].getTracks().forEach(track => remoteStreamRef.current.addTrack(track));
      });

      const callRef = doc(db, "personal-calls", chatRoomId);
      const callerCandidatesRef = collection(callRef, "callerCandidates");
      pc.addEventListener('icecandidate', (event) => {
        if (event.candidate) addDoc(callerCandidatesRef, event.candidate.toJSON());
      });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const startedAt = new Date().getTime();
      callStartTimeRef.current = startedAt;

      await setDoc(callRef, {
        status: "ringing",
        callType,
        hostName: currentUserName,
        hostId: currentUid,
        hostPhoto: usersCache[currentUid] || auth.currentUser?.photoURL || "",
        receiverId: targetUid,
        receiverName: receiverName,
        participants: [currentUid, targetUid],
        roomId: chatRoomId,
        callStartedAt: startedAt,
        offer: { type: offer.type, sdp: offer.sdp }
      });

      unsubscribeCallSignalRef.current = onSnapshot(callRef, async (snap) => {
        const data = snap.data();
        if (!data) {
          // Document deleted - call ended by other party
          const endedAt = new Date().getTime();
          await saveCallHistory(callType, startedAt, endedAt, false);
          cleanupCallLocally();
          setInCall(false);
          setActiveCallType('video');
          return;
        }
        if (data.answer && pc.signalingState !== 'closed' && !pc.currentRemoteDescription) {
          await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
        }
        if (data.status === 'ended' || data.status === 'missed') {
          const endedAt = new Date().getTime();
          const wasMissed = data.status === 'missed' || !data.answer;
          await saveCallHistory(callType, startedAt, endedAt, wasMissed);
          cleanupCallLocally();
          setInCall(false);
          setActiveCallType('video');
        }
      });

      const calleeCandidatesRef = collection(callRef, "calleeCandidates");
      unsubscribeCandidatesRef.current = onSnapshot(calleeCandidatesRef, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            pc.addIceCandidate(new RTCIceCandidate(change.doc.data())).catch(() => {});
          }
        });
      });

      // Auto-miss call after 30 seconds if no answer
      missedCallTimeoutRef.current = setTimeout(async () => {
        try {
          const currentCallSnap = await getDoc(callRef);
          if (currentCallSnap.exists() && currentCallSnap.data().status === 'ringing' && !currentCallSnap.data().answer) {
            await updateDoc(callRef, { status: 'missed' });
            await saveCallHistory(callType, startedAt, new Date().getTime(), true);
            cleanupCallLocally();
            setInCall(false);
            setActiveCallType('video');
          }
        } catch (err) {
          console.error("Error setting missed call status:", err);
        }
      }, 30000);

      setActiveCallType(callType);
      setInCall(true);
      setActiveCallSession({
        type: 'personal', chatRoomId, otherUid: targetUid, otherName: receiverName,
        otherPhoto: usersCache[targetUid] || '', callType,
        peerConnection: pc, localStream: stream, remoteStream: remoteStreamRef.current,
      });
    } catch (err) {
      console.error("Error starting call:", err);
      alert("🎤 Could not start the call. Camera/microphone permission may be needed.");
      cleanupCallLocally();
    }
  };

  const answerIncomingCall = async () => {
    try {
      cleanupCallLocally();
      const callRef = doc(db, "personal-calls", chatRoomId);
      const callSnap = await getDoc(callRef);
      if (!callSnap.exists() || !callSnap.data().offer) {
        return;
      }
      const callData = callSnap.data();
      const offer = callData.offer;
      const callType = callData.callType || 'video';
      const startedAt = callData.callStartedAt || new Date().getTime();
      callStartTimeRef.current = startedAt;

      const pc = new RTCPeerConnection(rtcConfiguration);
      peerConnectionRef.current = pc;
      registerPeerConnectionListeners(pc);

      const stream = await navigator.mediaDevices.getUserMedia({ video: callType === 'video', audio: true });
      localStreamRef.current = stream;
      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      remoteStreamRef.current = new MediaStream();
      pc.addEventListener('track', (event) => {
        event.streams[0].getTracks().forEach(track => remoteStreamRef.current.addTrack(track));
      });

      const calleeCandidatesRef = collection(callRef, "calleeCandidates");
      pc.addEventListener('icecandidate', (event) => {
        if (event.candidate) addDoc(calleeCandidatesRef, event.candidate.toJSON());
      });

      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      await updateDoc(callRef, {
        status: "accepted",
        answer: { type: answer.type, sdp: answer.sdp }
      });

      const callerCandidatesRef = collection(callRef, "callerCandidates");
      unsubscribeCandidatesRef.current = onSnapshot(callerCandidatesRef, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            pc.addIceCandidate(new RTCIceCandidate(change.doc.data())).catch(() => {});
          }
        });
      });

      unsubscribeCallSignalRef.current = onSnapshot(callRef, (snap) => {
        if (!snap.exists()) {
          // Document deleted - call ended by other party
          const endedAt = new Date().getTime();
          saveCallHistory(callType, startedAt, endedAt, false);
          cleanupCallLocally();
          setInCall(false);
          setActiveCallType('video');
          return;
        }
        if (snap.data()?.status === 'ended') {
          const endedAt = new Date().getTime();
          saveCallHistory(callType, startedAt, endedAt, false);
          cleanupCallLocally();
          setInCall(false);
          setActiveCallType('video');
        }
      });

      setActiveCallType(callType);
      setInCall(true);
      setActiveCallSession({
        type: 'personal', chatRoomId, otherUid: targetUid, otherName: receiverName,
        otherPhoto: usersCache[targetUid] || '', callType,
        peerConnection: pc, localStream: stream, remoteStream: remoteStreamRef.current,
      });
    } catch (err) {
      console.error("Error answering call:", err);
      alert("🎤 Could not join the call. Camera/microphone permission may be needed.");
      cleanupCallLocally();
    }
  };

  const endCall = async () => {
    const callRef = doc(db, "personal-calls", chatRoomId);
    const startedAt = callStartTimeRef.current || new Date().getTime();
    const endedAt = new Date().getTime();
    const callType = activeCallType;
    
    try {
      // Delete candidates first
      const [callerCandidates, calleeCandidates] = await Promise.all([
        getDocs(collection(callRef, "callerCandidates")),
        getDocs(collection(callRef, "calleeCandidates"))
      ]);
      await Promise.all([
        ...callerCandidates.docs.map(c => deleteDoc(c.ref)),
        ...calleeCandidates.docs.map(c => deleteDoc(c.ref))
      ]);
      // Delete the call document
      await deleteDoc(callRef).catch(() => {});
    } catch (err) {
      console.error("Error ending call:", err);
    }
    
    await saveCallHistory(callType, startedAt, endedAt, false);
    cleanupCallLocally();
    setInCall(false);
    setActiveCallType('video');
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

  const HangUpIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1a1 1 0 0 1-1 1c-1.24 0-2.45-.2-3.57-.57a1 1 0 0 1-.68-.95v-3.5a1 1 0 0 1 .74-.97A17.9 17.9 0 0 1 12 7c1.99 0 3.91.31 5.71.88a1 1 0 0 1 .74.97v3.5a1 1 0 0 1-.68.95 11.9 11.9 0 0 1-3.57.57 1 1 0 0 1-1-1v-3.1A17.9 17.9 0 0 0 12 9z" />
    </svg>
  );

  const VideoCallIcon = () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="23 7 16 12 23 17 23 7"></polygon>
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
    </svg>
  );

  const AudioCallIcon = () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"></path>
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
        .call-summary-msg { background: rgba(0,86,179,0.08) !important; border: 1px solid rgba(0,86,179,0.2) !important; text-align: center; }
      `}</style>

      <div style={{ padding: '15px 20px', background: '#0056b3', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 2px 10px rgba(0,0,0,0.1)' }}>
        <button onClick={() => navigate(-1)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', padding: '6px 14px', borderRadius: '20px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>⬅️ Back</button>
        <div
          onClick={() => navigate(`/profile/${targetUid}`)}
          title={`${receiverName}-এর প্রোফাইলে যান`}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
        >
          <img
            src={(usersCache[targetUid] && usersCache[targetUid].trim() !== '') ? usersCache[targetUid] : `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(receiverName || 'Student')}`}
            alt=""
            style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(255,255,255,0.6)' }}
          />
          <h3 style={{ margin: 0, fontSize: '18px', letterSpacing: '0.3px' }}>{receiverName}</h3>
        </div>
        {!inCall && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {receiverOnline && (
              <span title="Online" style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#2ecc71', border: '2px solid rgba(255,255,255,0.6)', display: 'inline-block' }} />
            )}
            <button onClick={() => initiateCall('video')} title="Video call" style={{ background: '#28a745', color: 'white', border: 'none', width: '38px', height: '38px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <VideoCallIcon />
            </button>
            <button onClick={() => initiateCall('audio')} title="Audio call" style={{ background: 'rgba(255,255,255,0.25)', color: 'white', border: 'none', width: '38px', height: '38px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <AudioCallIcon />
            </button>
          </div>
        )}
      </div>

      {inCall ? (
        <div style={{ width: '100%', height: 'calc(100% - 5px)', background: '#111', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
          <video ref={remoteVideoRef} autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', background: '#000' }} />
          {activeCallType === 'audio' && (
            <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '14px', color: '#fff', background: '#111' }}>
              <div style={{ width: '90px', height: '90px', borderRadius: '50%', background: 'rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '34px' }}>🎙️</div>
              <p style={{ margin: 0, fontSize: '16px', fontWeight: 'bold' }}>Audio call with {receiverName}</p>
            </div>
          )}
          <video ref={localVideoRef} autoPlay playsInline muted style={{ position: 'absolute', bottom: '16px', right: '16px', width: '110px', height: '150px', objectFit: 'cover', borderRadius: '10px', border: '2px solid #fff', boxShadow: '0 4px 14px rgba(0,0,0,0.45)', background: '#000', display: activeCallType === 'audio' ? 'none' : 'block' }} />
          <button
            onClick={endCall}
            title="Hang up"
            style={{ position: 'absolute', bottom: '20px', left: '50%', transform: 'translateX(-50%)', background: '#dc3545', color: '#fff', border: 'none', width: '56px', height: '56px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 14px rgba(0,0,0,0.45)' }}
          >
            <HangUpIcon />
          </button>
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
              const isSystem = getMsg.isCallSummary === true;
              const firestoreProfilePhoto = usersCache[getMsg.senderId] || getMsg.senderPhoto;
              const defaultFallbackAvatar = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(getMsg.senderName || 'Student')}&backgroundColor=0056b3`;

              if (isSystem) {
                return (
                  <div key={getMsg.id} style={{ display: 'flex', justifyContent: 'center' }}>
                    <div className="call-summary-msg" style={{ 
                      padding: '10px 16px', 
                      borderRadius: '12px', 
                      fontSize: '12px', 
                      whiteSpace: 'pre-line',
                      background: 'rgba(0,86,179,0.08)',
                      border: '1px solid rgba(0,86,179,0.2)',
                      textAlign: 'center',
                      maxWidth: '80%'
                    }}>
                      {getMsg.text}
                    </div>
                  </div>
                );
              }

              return (
                <div key={getMsg.id} style={{ display: 'flex', flexDirection: isMe ? 'row-reverse' : 'row', alignItems: 'flex-end', gap: '10px' }}>
                  
                  <img 
                    src={firestoreProfilePhoto && firestoreProfilePhoto.trim() !== "" ? firestoreProfilePhoto : defaultFallbackAvatar} 
                    alt="Profile" 
                    onClick={() => navigate(`/profile/${getMsg.senderId}`)}
                    onError={(e) => { e.target.onerror = null; e.target.src = defaultFallbackAvatar; }}
                    style={{ width: '34px', height: '34px', borderRadius: '50%', objectFit: 'cover', border: '1px solid #0056b3', background: '#e4e6eb', flexShrink: 0, cursor: 'pointer' }} 
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

                      {!getMsg.isDeleted && !isSystem && (
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
