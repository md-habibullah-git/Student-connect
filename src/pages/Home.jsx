// File Name: src/pages/Home.jsx

import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { db, auth } from '../firebase';
import { 
  collection, addDoc, query, onSnapshot, doc, updateDoc, 
  arrayUnion, arrayRemove, deleteDoc, getDocs,
  writeBatch
} from 'firebase/firestore';
import { FilePicker } from '@capawesome/capacitor-file-picker';

const CLOUDINARY_CLOUD_NAME = 'hvdnthrl';
const CLOUDINARY_UPLOAD_PRESET = 'student-connect';
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

const SEVEN_DAYS_MS = 420 * 60 * 60 * 1000;

const toMillis = (createdAt) => {
  if (!createdAt) return 0;
  if (typeof createdAt === 'number') return createdAt;
  if (typeof createdAt === 'string') return new Date(createdAt).getTime() || 0;
  if (typeof createdAt.toMillis === 'function') return createdAt.toMillis();
  if (createdAt.seconds) return createdAt.seconds * 1000;
  return 0;
};

// FB Lite Format Time Ago
const formatPostTime = (createdAt) => {
  const ms = toMillis(createdAt);
  if (!ms) return '';
  const seconds = Math.floor((Date.now() - ms) / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(ms).toLocaleDateString([], { month: 'short', day: 'numeric' });
};

function uploadMediaToCloudinary(fileOrBlob, resourceType, onProgress, fileName) {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('file', fileOrBlob);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    
    const timestamp = Date.now();
    const safeFileName = (fileName || 'upload').replace(/[^a-zA-Z0-9._-]/g, '_');
    const fullPublicId = `student-connect/${timestamp}-${safeFileName}`;
    
    formData.append('public_id', fullPublicId);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          resolve({ 
            url: data.secure_url, 
            publicId: data.public_id, 
            resourceType: data.resource_type 
          });
        } catch {
          reject(new Error('Could not parse Cloudinary response'));
        }
      } else {
        let message = `Upload failed (HTTP ${xhr.status})`;
        try { message = JSON.parse(xhr.responseText)?.error?.message || message; } catch { /* ignore */ }
        reject(new Error(message));
      }
    };
    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.send(formData);
  });
}

async function deleteMediaFromCloudinary(publicId, resourceType) {
  if (!publicId) return true;
  
  try {
    const res = await fetch('/api/delete-cloudinary-media', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ publicId, resourceType }),
    });
    
    const data = await res.json().catch(() => ({}));
    return Boolean(data.success);
  } catch (err) {
    console.error('Delete Cloudinary error:', err);
    return false;
  }
}

export default function Home({ isAdmin }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { postId: targetPostId } = useParams();

  const [posts, setPosts] = useState([]);
  const [text, setText] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [isPosting, setIsPosting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [commentInput, setCommentInput] = useState({});
  const [showPostModal, setShowPostModal] = useState(false);
  const [expandedImage, setExpandedImage] = useState(null);
  const [fileInputKey, setFileInputKey] = useState(Date.now());
  
  const lightboxHistoryPushed = useRef(false);
  const fileInputRef = useRef(null);
  const commentInputRefs = useRef({});

  const videoElementsRef = useRef({});
  const activeVideoIdRef = useRef(null);
  const globalMutedRef = useRef(true);
  const internalActionRef = useRef(false);

  const [editingComment, setEditingComment] = useState(null);
  const [usersCache, setUsersCache] = useState({});
  const [visibleComments, setVisibleComments] = useState({});
  const [activeReactionPopup, setActiveReactionPopup] = useState(null);

  const [highlightedPostId, setHighlightedPostId] = useState(null);
  const hasScrolledRef = useRef(false);

  const currentUid = auth.currentUser?.uid || 'guest';
  const currentUserPhoto = auth.currentUser?.photoURL || usersCache[currentUid]?.photo || '';
  const currentUserName = auth.currentUser?.displayName || usersCache[currentUid]?.name || 'Student';
  const SEEN_POSTS_KEY = `seenPosts_${currentUid}`;
  
  const [seenPosts] = useState(() => {
    try {
      const saved = localStorage.getItem(SEEN_POSTS_KEY);
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });

  const seenPostsRef = useRef(seenPosts);
  const justPostedIdRef = useRef(null);

  useEffect(() => {
    seenPostsRef.current = seenPosts;
  }, [seenPosts]);

  const sortPosts = (postsList, seenMap, justPostedId) => {
    return [...postsList].sort((a, b) => {
      if (justPostedId) {
        if (a.id === justPostedId) return -1;
        if (b.id === justPostedId) return 1;
      }
      
      const aSeenAt = seenMap[a.id];
      const bSeenAt = seenMap[b.id];
      
      if (!aSeenAt && bSeenAt) return -1;
      if (aSeenAt && !bSeenAt) return 1;
      
      if (!aSeenAt && !bSeenAt) {
        return toMillis(b.createdAt) - toMillis(a.createdAt);
      }
      
      return aSeenAt - bSeenAt;
    });
  };

  const markPostAsSeen = (postId) => {
    if (!postId || postId === justPostedIdRef.current) return;
    
    try {
      const saved = localStorage.getItem(SEEN_POSTS_KEY);
      const currentSeen = saved ? JSON.parse(saved) : {};
      
      const now = Date.now();
      const lastSeenAt = currentSeen[postId] || 0;
      
      if (now - lastSeenAt < 3000) return;
      
      currentSeen[postId] = now;
      localStorage.setItem(SEEN_POSTS_KEY, JSON.stringify(currentSeen));
      seenPostsRef.current = currentSeen;
    } catch (err) {
      console.error('markPostAsSeen error:', err);
    }
  };

  const resetFileInput = () => {
    setSelectedFile(null);
    setFileInputKey(Date.now());
  };

  const applyMuteToAll = (muted) => {
    Object.values(videoElementsRef.current).forEach(v => {
      if (v) v.muted = muted;
    });
  };

  const pauseAllExcept = (exceptId) => {
    Object.entries(videoElementsRef.current).forEach(([id, video]) => {
      if (id !== exceptId && video && !video.paused) {
        internalActionRef.current = true;
        video.pause();
        internalActionRef.current = false;
      }
    });
  };

  const playVideo = (postId) => {
    const video = videoElementsRef.current[postId];
    if (!video) return;

    if (activeVideoIdRef.current === postId) {
      if (video.paused) {
        internalActionRef.current = true;
        video.play().catch(() => {});
        internalActionRef.current = false;
      }
      return;
    }

    pauseAllExcept(postId);
    applyMuteToAll(globalMutedRef.current);
    activeVideoIdRef.current = postId;

    internalActionRef.current = true;
    video.play().catch(() => {});
    internalActionRef.current = false;
  };

  const pauseVideo = (postId) => {
    const video = videoElementsRef.current[postId];
    if (video && !video.paused) {
      internalActionRef.current = true;
      video.pause();
      internalActionRef.current = false;
    }
    if (activeVideoIdRef.current === postId) {
      activeVideoIdRef.current = null;
    }
  };

  useEffect(() => {
    if (expandedImage) {
      window.history.pushState({ lightboxOpen: true }, '');
      lightboxHistoryPushed.current = true;
      document.body.style.overflow = 'hidden';
      
      const handlePopState = () => {
        if (lightboxHistoryPushed.current) {
          setExpandedImage(null);
          lightboxHistoryPushed.current = false;
        }
      };
      
      window.addEventListener('popstate', handlePopState);
      
      return () => {
        window.removeEventListener('popstate', handlePopState);
        document.body.style.overflow = 'auto';
      };
    } else {
      lightboxHistoryPushed.current = false;
      document.body.style.overflow = 'auto';
    }
  }, [expandedImage]);

  const closeLightbox = () => {
    if (lightboxHistoryPushed.current) {
      window.history.back();
      lightboxHistoryPushed.current = false;
    }
    setExpandedImage(null);
  };

  useEffect(() => {
    if (location.state?.openPostModal) {
      resetFileInput();
      setText('');
      setMediaUrl('');
      setUploadProgress(0);
      setIsPosting(false);
      setShowPostModal(true);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, location.pathname, navigate]);

  useEffect(() => {
    hasScrolledRef.current = false;
  }, [targetPostId]);

  useEffect(() => {
    if (!targetPostId || hasScrolledRef.current || posts.length === 0) return;
    const el = document.getElementById(`post-${targetPostId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedPostId(targetPostId);
      hasScrolledRef.current = true;
      const timer = setTimeout(() => setHighlightedPostId(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [targetPostId, posts]);

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const target = entry.target;
        
        if (target.classList?.contains('dynamic-post-card')) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
            const id = target.id?.replace('post-', '');
            if (id) markPostAsSeen(id);
          }
          return;
        }
        
        const postId = target.dataset?.postId;
        if (postId) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            playVideo(postId);
          } else {
            if (activeVideoIdRef.current === postId) {
              pauseVideo(postId);
            }
          }
        }
      });
    }, { threshold: [0.5, 0.6] });

    const postElements = document.querySelectorAll('.dynamic-post-card');
    postElements.forEach(el => observer.observe(el));
    
    Object.values(videoElementsRef.current).forEach(v => {
      if (v) observer.observe(v);
    });

    return () => observer.disconnect();
  }, [posts.length]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const fsElement = document.fullscreenElement;
      if (fsElement && fsElement.tagName === 'VIDEO') {
        const postId = fsElement.dataset.postId;
        if (postId) {
          playVideo(postId);
          const video = videoElementsRef.current[postId];
          if (video && video.paused) {
            internalActionRef.current = true;
            video.play().catch(() => {});
            internalActionRef.current = false;
          }
        }
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // 7-day auto-cleanup
  useEffect(() => {
    const cleanupOldPosts = async () => {
      try {
        const now = Date.now();
        const cutoffTime = now - SEVEN_DAYS_MS;

        const qAll = query(collection(db, "posts"));
        const allPostsSnapshot = await getDocs(qAll);

        const oldPosts = allPostsSnapshot.docs.filter(d => {
          const ms = toMillis(d.data().createdAt);
          return ms > 0 && ms < cutoffTime;
        });

        if (oldPosts.length === 0) return;

        const postsToDelete = [];
        for (const postDoc of oldPosts) {
          const data = postDoc.data();
          if (data.mediaPublicId) {
            const ok = await deleteMediaFromCloudinary(data.mediaPublicId, data.mediaResourceType);
            if (ok) postsToDelete.push(postDoc);
          } else {
            postsToDelete.push(postDoc);
          }
        }

        if (postsToDelete.length > 0) {
          const batchSize = 500;
          let deleted = 0;
          for (let i = 0; i < postsToDelete.length; i += batchSize) {
            const batch = writeBatch(db);
            const chunk = postsToDelete.slice(i, i + batchSize);
            chunk.forEach(d => batch.delete(d.ref));
            await batch.commit();
            deleted += chunk.length;
          }
          console.log(`✅ Deleted ${deleted} old posts`);
        }
      } catch (error) {
        console.error("Cleanup Error:", error);
      }
    };

    const initialTimer = setTimeout(cleanupOldPosts, 5000);
    const hourlyInterval = setInterval(cleanupOldPosts, 60 * 60 * 1000);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(hourlyInterval);
    };
  }, []);

  useEffect(() => {
    const unsubscribeUsers = onSnapshot(collection(db, "users"), (snapshot) => {
      const cache = {};
      snapshot.docs.forEach(d => {
        const data = d.data();
        const uId = data.uid || data.id || d.id;
        const uName = data.name || data.displayName || "Student";
        const uPhoto = data.photo || "";

        if (uId) {
          const userObj = { name: uName, photo: uPhoto };
          cache[uId] = userObj;
          cache[String(uId).trim()] = userObj;
        }
        if (data.name) cache[data.name.trim()] = uPhoto;
        if (data.displayName) cache[data.displayName.trim()] = uPhoto;
      });
      setUsersCache(cache);
    });

    const handleOpenModalEvent = () => {
      resetFileInput();
      setText('');
      setMediaUrl('');
      setUploadProgress(0);
      setIsPosting(false);
      setShowPostModal(true);
    };
    window.addEventListener('openPostModal', handleOpenModalEvent);

    const q = query(collection(db, "posts"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allPosts = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      const sortedPosts = sortPosts(allPosts, seenPostsRef.current, justPostedIdRef.current);
      setPosts(sortedPosts);
    });

    const closePopup = () => setActiveReactionPopup(null);
    window.addEventListener('click', closePopup);

    return () => {
      unsubscribe();
      unsubscribeUsers();
      window.removeEventListener('openPostModal', handleOpenModalEvent);
      window.removeEventListener('click', closePopup);
    };
  }, []);

  const handleFileChange = async (e) => {
    if (window.Capacitor?.isNativePlatform?.()) {
      try {
        const result = await FilePicker.pickFiles({
          types: ['image/*', 'video/*'],
          readData: true,
        });
        
        if (result && result.files && result.files.length > 0) {
          const pickedFile = result.files[0];
          let blob = null;
          const fileType = pickedFile.mimeType || 'image/jpeg';
          const fileName = pickedFile.name || `file-${Date.now()}.jpg`;
          
          if (pickedFile.data) {
            const base64Data = pickedFile.data.replace(/^data:.*;base64,/, '');
            const byteCharacters = atob(base64Data);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
              byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            blob = new Blob([byteArray], { type: fileType });
          }
          
          if (!blob) return;
          const file = new File([blob], fileName, { type: fileType });
          
          if (fileType.startsWith('video/') && file.size > MAX_VIDEO_BYTES) {
            alert("Video must be under 100MB.");
            resetFileInput();
            return;
          }
          
          const previewUrl = URL.createObjectURL(file);
          setSelectedFile({
            kind: fileType.startsWith('video/') ? 'video' : 'image',
            file: file,
            previewUrl: previewUrl,
            fileName: fileName,
            fileSize: file.size,
            selectedAt: Date.now()
          });
        }
      } catch (err) {
        console.error("File picker error:", err);
      }
      return;
    }
    
    const file = e.target.files?.[0];
    if (!file) {
      setSelectedFile(null);
      return;
    }

    if (file.type.startsWith('video/') && file.size > MAX_VIDEO_BYTES) {
      alert("Video must be under 100MB.");
      resetFileInput();
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setSelectedFile({
      kind: file.type.startsWith('video/') ? 'video' : 'image',
      file: file,
      previewUrl: previewUrl,
      fileName: file.name,
      fileSize: file.size,
      selectedAt: Date.now()
    });
  };

  const handlePost = async (e) => {
    e.preventDefault();
    const fileToUpload = selectedFile;
    
    if (!text.trim() && !mediaUrl.trim() && !fileToUpload) {
      alert("Please add some text or photo/video to post!");
      return;
    }

    setIsPosting(true);
    setUploadProgress(0);
    
    try {
      let finalMediaUrl = mediaUrl;
      let mediaPublicId = null;
      let mediaResourceType = null;

      if (fileToUpload) {
        const resourceType = fileToUpload.kind === 'video' ? 'video' : 'image';
        const result = await uploadMediaToCloudinary(
          fileToUpload.file, 
          resourceType, 
          setUploadProgress,
          fileToUpload.fileName
        );
        finalMediaUrl = result.url;
        mediaPublicId = result.publicId;
        mediaResourceType = result.resourceType;
      }

      const newPostRef = await addDoc(collection(db, "posts"), {
        text: text,
        mediaUrl: finalMediaUrl,
        mediaPublicId: mediaPublicId,
        mediaResourceType: mediaResourceType,
        fileName: fileToUpload?.fileName || null,
        userName: currentUserName,
        userId: auth.currentUser?.uid,
        likes: [],
        loves: [],
        wows: [],
        comments: [],
        createdAt: Date.now()
      });

      justPostedIdRef.current = newPostRef.id;

      setText('');
      setMediaUrl('');
      resetFileInput();
      setUploadProgress(0);
      setShowPostModal(false);
      applyMuteToAll(false);

      setTimeout(() => {
        const el = document.getElementById(`post-${newPostRef.id}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          setHighlightedPostId(newPostRef.id);
          setTimeout(() => setHighlightedPostId(null), 3000);
        } else {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      }, 300);

      setTimeout(() => {
        if (justPostedIdRef.current === newPostRef.id) {
          justPostedIdRef.current = null;
        }
      }, 60000);

      if (fileToUpload?.previewUrl && fileToUpload.previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(fileToUpload.previewUrl);
      }
    } catch (error) {
      console.error("Posting Error:", error);
      alert("Posting failed: " + error.message);
    } finally {
      setIsPosting(false);
    }
  };

  const handleLike = async (postId, likes) => {
    const postRef = doc(db, "posts", postId);
    const userId = auth.currentUser?.uid;
    if ((likes || []).includes(userId)) {
      await updateDoc(postRef, { likes: arrayRemove(userId) });
    } else {
      await updateDoc(postRef, { likes: arrayUnion(userId) });
    }
  };

  const handleLove = async (postId, loves) => {
    const postRef = doc(db, "posts", postId);
    const userId = auth.currentUser?.uid;
    if ((loves || []).includes(userId)) {
      await updateDoc(postRef, { loves: arrayRemove(userId) });
    } else {
      await updateDoc(postRef, { loves: arrayUnion(userId) });
    }
  };

  const handleWow = async (postId, wows) => {
    const postRef = doc(db, "posts", postId);
    const userId = auth.currentUser?.uid;
    if ((wows || []).includes(userId)) {
      await updateDoc(postRef, { wows: arrayRemove(userId) });
    } else {
      await updateDoc(postRef, { wows: arrayUnion(userId) });
    }
  };

  const handleShare = (postId) => {
    const shareUrl = `${window.location.origin}/post/${postId}`;
    navigator.clipboard.writeText(shareUrl)
      .then(() => alert("Post link copied to clipboard!"))
      .catch((err) => console.error("Copy link error:", err));
  };

  const handleComment = async (e, postId) => {
    e.preventDefault();
    const commentText = commentInput[postId];
    if (!commentText || !commentText.trim()) return;

    const postRef = doc(db, "posts", postId);
    await updateDoc(postRef, {
      comments: arrayUnion({
        commentUserId: auth.currentUser?.uid || "unknown",
        userName: currentUserName,
        userNameRaw: currentUserName,
        text: commentText.trim(),
        createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      })
    });
    setCommentInput({ ...commentInput, [postId]: '' });
    setVisibleComments(prev => ({ ...prev, [postId]: true }));
  };

  const handleDeleteComment = async (postId, postComments, commentIndex) => {
    if (window.confirm("Delete this comment?")) {
      const postRef = doc(db, "posts", postId);
      const updatedComments = postComments.filter((_, idx) => idx !== commentIndex);
      await updateDoc(postRef, { comments: updatedComments });
    }
  };

  const handleUpdateComment = async (postId, postComments, commentIndex, newText) => {
    if (!newText.trim()) return;
    const postRef = doc(db, "posts", postId);
    const updatedComments = postComments.map((comment, idx) => 
      idx === commentIndex ? { ...comment, text: newText.trim() } : comment
    );
    await updateDoc(postRef, { comments: updatedComments });
    setEditingComment(null);
  };

  const handleDeletePost = async (postId, mediaPublicId, mediaResourceType) => {
    if (window.confirm("Are you sure you want to delete this post?")) {
      if (mediaPublicId) {
        await deleteMediaFromCloudinary(mediaPublicId, mediaResourceType);
      }
      try {
        await deleteDoc(doc(db, "posts", postId));
      } catch (error) {
        console.error('Delete error:', error);
      }
    }
  };

  const handleMediaError = async (e, post) => {
    const el = e.target;
    if (el.dataset?.retried) {
      try {
        if (post.mediaPublicId) {
          await deleteMediaFromCloudinary(post.mediaPublicId, post.mediaResourceType);
        }
        await deleteDoc(doc(db, "posts", post.id));
      } catch (err) {
        console.error("Media error cleanup failed:", err);
      }
    } else {
      if (el.dataset) el.dataset.retried = "1";
      setTimeout(() => {
        const sep = post.mediaUrl?.includes('?') ? '&' : '?';
        if (el.src) el.src = `${post.mediaUrl}${sep}retry=${Date.now()}`;
      }, 3000);
    }
  };

  const toggleCommentVisibility = (postId) => {
    setVisibleComments(prev => ({ ...prev, [postId]: !prev[postId] }));
  };

  const toggleReactionPopup = (e, postId, type) => {
    e.stopPropagation(); 
    if (activeReactionPopup?.postId === postId && activeReactionPopup?.type === type) {
      setActiveReactionPopup(null);
    } else {
      setActiveReactionPopup({ postId, type });
    }
  };

  const closePostModal = () => {
    if (selectedFile?.previewUrl && selectedFile.previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(selectedFile.previewUrl);
    }
    setShowPostModal(false);
    resetFileInput();
    setText('');
    setMediaUrl('');
    setUploadProgress(0);
    setIsPosting(false);
  };

  const fallbackUserAvatar = (name) => `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name || 'Student')}`;

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', paddingBottom: '30px' }}>
      
      {/* ── Top FB Lite "What's on your mind?" Create Post Box ── */}
      <div className="fb-lite-card" style={{ padding: '12px 14px', marginBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <img
            src={currentUserPhoto.trim() !== '' ? currentUserPhoto : fallbackUserAvatar(currentUserName)}
            alt=""
            className="fb-avatar"
            style={{ width: '40px', height: '40px' }}
            onClick={() => navigate('/profile')}
          />
          <button
            onClick={() => setShowPostModal(true)}
            style={{
              flex: 1,
              textAlign: 'left',
              padding: '10px 14px',
              backgroundColor: 'var(--fb-input-bg)',
              color: 'var(--fb-text-secondary)',
              border: '1px solid var(--fb-card-border-subtle)',
              borderRadius: '20px',
              cursor: 'pointer',
              fontSize: '13px',
              outline: 'none'
            }}
          >
            What's on your mind, {currentUserName.split(' ')[0]}?
          </button>
        </div>

        <div style={{
          display: 'flex',
          borderTop: '1px solid var(--fb-divider)',
          marginTop: '10px',
          paddingTop: '8px',
          justifyContent: 'space-around'
        }}>
          <button
            onClick={() => {
              setShowPostModal(true);
              setTimeout(() => {
                if (fileInputRef.current) fileInputRef.current.click();
              }, 100);
            }}
            style={{
              background: 'none',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '13px',
              fontWeight: '600',
              color: 'var(--fb-text-secondary)',
              cursor: 'pointer',
              padding: '4px 12px',
              borderRadius: '6px'
            }}
          >
            <span style={{ fontSize: '18px' }}>📷</span> Photo/Video
          </button>
          
          <button
            onClick={() => navigate('/chat/global/Global-Chatroom')}
            style={{
              background: 'none',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '13px',
              fontWeight: '600',
              color: 'var(--fb-text-secondary)',
              cursor: 'pointer',
              padding: '4px 12px',
              borderRadius: '6px'
            }}
          >
            <span style={{ fontSize: '18px' }}>🌐</span> Live Conference
          </button>
        </div>
      </div>

      {targetPostId && posts.length > 0 && !posts.some(p => p.id === targetPostId) && (
        <div style={{
          padding: '12px 15px',
          textAlign: 'center',
          color: '#fa383e',
          backgroundColor: 'var(--fb-card)',
          border: '1px solid #fa383e',
          borderRadius: '6px',
          marginBottom: '10px',
          fontSize: '13px'
        }}>
          Post not found or has been removed.
        </div>
      )}

      {/* ── Posts Stream (Natural FB Lite Flow) ── */}
      {posts.map(post => {
        const postAuthor = usersCache[post.userId] || { name: post.userName || 'Student', photo: '' };
        const postAvatar = postAuthor.photo && postAuthor.photo.trim() !== '' 
          ? postAuthor.photo 
          : fallbackUserAvatar(postAuthor.name);
        
        const myUid = auth.currentUser?.uid;
        const isLiked = (post.likes || []).includes(myUid);
        const isLoved = (post.loves || []).includes(myUid);
        const isWowed = (post.wows || []).includes(myUid);
        const totalReactions = (post.likes?.length || 0) + (post.loves?.length || 0) + (post.wows?.length || 0);

        return (
          <article
            key={post.id}
            id={`post-${post.id}`}
            data-post-id={post.id}
            className={`dynamic-post-card${highlightedPostId === post.id ? ' shared-highlight' : ''}`}
          >
            {/* Header: Avatar, Name, Time, Options */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              padding: '12px 14px 8px 14px',
              gap: '10px'
            }}>
              <img
                src={postAvatar}
                alt=""
                className="fb-avatar"
                style={{ width: '40px', height: '40px', cursor: 'pointer' }}
                onClick={() => { if (post.userId) navigate(`/profile/${post.userId}`); }}
                onError={(e) => { e.target.onerror = null; e.target.src = fallbackUserAvatar(postAuthor.name); }}
              />

              <div style={{ flex: 1, minWidth: 0 }}>
                <strong
                  onClick={() => { if (post.userId) navigate(`/profile/${post.userId}`); }}
                  style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: '700',
                    color: 'var(--fb-text)',
                    cursor: 'pointer',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {postAuthor.name}
                </strong>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--fb-text-secondary)', marginTop: '1px' }}>
                  <span>{formatPostTime(post.createdAt)}</span>
                  <span>•</span>
                  <span>🌐 Public</span>
                </div>
              </div>

              {(myUid === post.userId || isAdmin) && (
                <button
                  onClick={() => handleDeletePost(post.id, post.mediaPublicId, post.mediaResourceType)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--fb-text-muted)',
                    fontSize: '13px',
                    cursor: 'pointer',
                    padding: '4px 8px',
                    borderRadius: '4px'
                  }}
                  title="Delete post"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Post Content / Text */}
            {post.text && (
              <div style={{
                padding: '4px 14px 10px 14px',
                fontSize: '14px',
                color: 'var(--fb-text)',
                lineHeight: '1.5',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word'
              }}>
                {post.text}
              </div>
            )}

            {/* Post Media (Photo or Video) */}
            {post.mediaUrl && (
              <div style={{
                width: '100%',
                backgroundColor: '#000000',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                overflow: 'hidden',
                maxHeight: '520px'
              }}>
                {post.mediaResourceType === 'video' || post.mediaUrl.includes('/video/') || post.mediaUrl.endsWith('.mp4') ? (
                  <video
                    ref={(el) => {
                      if (el) {
                        videoElementsRef.current[post.id] = el;
                        el.muted = globalMutedRef.current;
                        el.dataset.postId = post.id;
                      } else {
                        delete videoElementsRef.current[post.id];
                      }
                    }}
                    src={post.mediaUrl}
                    controls
                    playsInline
                    onPlay={(e) => {
                      if (internalActionRef.current) return;
                      const pId = e.target.dataset.postId;
                      if (pId && activeVideoIdRef.current !== pId) playVideo(pId);
                    }}
                    onPause={(e) => {
                      if (internalActionRef.current) return;
                      const pId = e.target.dataset.postId;
                      if (pId && activeVideoIdRef.current === pId) activeVideoIdRef.current = null;
                    }}
                    onVolumeChange={(e) => {
                      globalMutedRef.current = e.target.muted;
                      applyMuteToAll(globalMutedRef.current);
                    }}
                    onError={(e) => handleMediaError(e, post)}
                    style={{ width: '100%', maxHeight: '520px', objectFit: 'contain', display: 'block' }}
                  />
                ) : (
                  <img
                    src={post.mediaUrl}
                    alt="Post"
                    onClick={() => setExpandedImage(post.mediaUrl)}
                    onError={(e) => handleMediaError(e, post)}
                    style={{
                      width: '100%',
                      maxHeight: '520px',
                      objectFit: 'contain',
                      cursor: 'zoom-in',
                      display: 'block'
                    }}
                  />
                )}
              </div>
            )}

            {/* Reaction Counters Summary Bar */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 14px',
              fontSize: '12px',
              color: 'var(--fb-text-secondary)',
              borderBottom: '1px solid var(--fb-divider)',
              position: 'relative'
            }}>
              {/* Reactions (Like, Love, Wow) */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {totalReactions > 0 ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {(post.likes?.length || 0) > 0 && (
                      <span
                        onClick={(e) => toggleReactionPopup(e, post.id, "Like")}
                        style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '2px', position: 'relative' }}
                      >
                        👍 {post.likes.length}
                        {activeReactionPopup?.postId === post.id && activeReactionPopup?.type === "Like" && (
                          <div className="inline-reaction-popup" onClick={(e) => e.stopPropagation()}>
                            <strong style={{ borderBottom: '1px solid var(--fb-divider)', display: 'block', paddingBottom: '4px', color: 'var(--fb-blue)' }}>👍 Likes:</strong>
                            <div style={{ marginTop: '5px', maxHeight: '120px', overflowY: 'auto' }}>
                              {post.likes.map(uid => (
                                <div key={uid} className="popup-user-row" onClick={() => navigate(`/profile/${uid}`)}>
                                  <img src={usersCache[uid]?.photo || fallbackUserAvatar(usersCache[uid]?.name)} alt="" className="popup-avatar" />
                                  <span>{usersCache[uid]?.name || "Student"}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </span>
                    )}

                    {(post.loves?.length || 0) > 0 && (
                      <span
                        onClick={(e) => toggleReactionPopup(e, post.id, "Love")}
                        style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '2px', position: 'relative' }}
                      >
                        ❤️ {post.loves.length}
                        {activeReactionPopup?.postId === post.id && activeReactionPopup?.type === "Love" && (
                          <div className="inline-reaction-popup" onClick={(e) => e.stopPropagation()}>
                            <strong style={{ borderBottom: '1px solid var(--fb-divider)', display: 'block', paddingBottom: '4px', color: '#f02849' }}>❤️ Loves:</strong>
                            <div style={{ marginTop: '5px', maxHeight: '120px', overflowY: 'auto' }}>
                              {post.loves.map(uid => (
                                <div key={uid} className="popup-user-row" onClick={() => navigate(`/profile/${uid}`)}>
                                  <img src={usersCache[uid]?.photo || fallbackUserAvatar(usersCache[uid]?.name)} alt="" className="popup-avatar" />
                                  <span>{usersCache[uid]?.name || "Student"}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </span>
                    )}

                    {(post.wows?.length || 0) > 0 && (
                      <span
                        onClick={(e) => toggleReactionPopup(e, post.id, "Wow")}
                        style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '2px', position: 'relative' }}
                      >
                        😍 {post.wows.length}
                        {activeReactionPopup?.postId === post.id && activeReactionPopup?.type === "Wow" && (
                          <div className="inline-reaction-popup" onClick={(e) => e.stopPropagation()}>
                            <strong style={{ borderBottom: '1px solid var(--fb-divider)', display: 'block', paddingBottom: '4px', color: '#f7b125' }}>😍 Wows:</strong>
                            <div style={{ marginTop: '5px', maxHeight: '120px', overflowY: 'auto' }}>
                              {post.wows.map(uid => (
                                <div key={uid} className="popup-user-row" onClick={() => navigate(`/profile/${uid}`)}>
                                  <img src={usersCache[uid]?.photo || fallbackUserAvatar(usersCache[uid]?.name)} alt="" className="popup-avatar" />
                                  <span>{usersCache[uid]?.name || "Student"}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </span>
                    )}
                  </div>
                ) : (
                  <span style={{ fontStyle: 'italic', opacity: 0.7 }}>Be the first to react</span>
                )}
              </div>

              {/* Comments counter */}
              <span
                onClick={() => toggleCommentVisibility(post.id)}
                style={{ cursor: 'pointer', userSelect: 'none' }}
              >
                {(post.comments || []).length} comments
              </span>
            </div>

            {/* Action Bar: Like / Love / Comment / Share Buttons */}
            <div style={{
              display: 'flex',
              padding: '2px 6px',
              borderBottom: (visibleComments[post.id] || (post.comments || []).length > 0) ? '1px solid var(--fb-divider)' : 'none'
            }}>
              <button
                onClick={() => handleLike(post.id, post.likes)}
                style={{
                  flex: 1,
                  background: 'none',
                  border: 'none',
                  padding: '8px 0',
                  cursor: 'pointer',
                  fontWeight: '600',
                  color: isLiked ? 'var(--fb-blue)' : 'var(--fb-text-secondary)',
                  fontSize: '13px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                <span>👍</span> Like
              </button>

              <button
                onClick={() => handleLove(post.id, post.loves)}
                style={{
                  flex: 1,
                  background: 'none',
                  border: 'none',
                  padding: '8px 0',
                  cursor: 'pointer',
                  fontWeight: '600',
                  color: isLoved ? '#f02849' : 'var(--fb-text-secondary)',
                  fontSize: '13px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                <span>❤️</span> Love
              </button>

              <button
                onClick={() => handleWow(post.id, post.wows)}
                style={{
                  flex: 1,
                  background: 'none',
                  border: 'none',
                  padding: '8px 0',
                  cursor: 'pointer',
                  fontWeight: '600',
                  color: isWowed ? '#f7b125' : 'var(--fb-text-secondary)',
                  fontSize: '13px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                <span>😍</span> Wow
              </button>

              <button
                onClick={() => {
                  setVisibleComments(prev => ({ ...prev, [post.id]: true }));
                  setTimeout(() => {
                    if (commentInputRefs.current[post.id]) {
                      commentInputRefs.current[post.id].focus();
                    }
                  }, 50);
                }}
                style={{
                  flex: 1,
                  background: 'none',
                  border: 'none',
                  padding: '8px 0',
                  cursor: 'pointer',
                  fontWeight: '600',
                  color: 'var(--fb-text-secondary)',
                  fontSize: '13px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                <span>💬</span> Comment
              </button>

              <button
                onClick={() => handleShare(post.id)}
                style={{
                  flex: 1,
                  background: 'none',
                  border: 'none',
                  padding: '8px 0',
                  cursor: 'pointer',
                  fontWeight: '600',
                  color: 'var(--fb-text-secondary)',
                  fontSize: '13px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                <span>🔗</span> Share
              </button>
            </div>

            {/* Comment Composer & Comment List */}
            <div style={{ padding: '10px 14px' }}>
              {/* Comment Input */}
              <form onSubmit={(e) => handleComment(e, post.id)} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <img
                  src={currentUserPhoto.trim() !== '' ? currentUserPhoto : fallbackUserAvatar(currentUserName)}
                  alt=""
                  className="fb-avatar"
                  style={{ width: '32px', height: '32px' }}
                />
                <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input
                    ref={(el) => { commentInputRefs.current[post.id] = el; }}
                    type="text"
                    placeholder="Write a comment..."
                    value={commentInput[post.id] || ''}
                    onChange={(e) => setCommentInput({ ...commentInput, [post.id]: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '8px 36px 8px 12px',
                      fontSize: '13px',
                      borderRadius: '18px',
                      border: '1px solid var(--fb-card-border)',
                      backgroundColor: 'var(--fb-input-bg)',
                      color: 'var(--fb-text)',
                      outline: 'none'
                    }}
                  />
                  <button
                    type="submit"
                    style={{
                      position: 'absolute',
                      right: '8px',
                      background: 'none',
                      border: 'none',
                      color: 'var(--fb-blue)',
                      cursor: 'pointer',
                      fontSize: '14px',
                      padding: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                    title="Send comment"
                  >
                    ➤
                  </button>
                </div>
              </form>

              {/* Comments List */}
              {visibleComments[post.id] && (post.comments || []).length > 0 && (
                <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {post.comments.map((comment, index) => {
                    const commentUid = comment.commentUserId || "";
                    const authorPhoto = usersCache[commentUid]?.photo || "";
                    const authorName = usersCache[commentUid]?.name || comment.userNameRaw || comment.userName || "Student";
                    const isMyComment = myUid === commentUid || isAdmin;

                    return (
                      <div key={index} className="comment-user-row">
                        <img
                          src={authorPhoto.trim() !== "" ? authorPhoto : fallbackUserAvatar(authorName)}
                          alt=""
                          className="comment-avatar"
                          onClick={() => { if (commentUid) navigate(`/profile/${commentUid}`); }}
                          onError={(e) => { e.target.onerror = null; e.target.src = fallbackUserAvatar(authorName); }}
                        />

                        <div className="comment-bubble">
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <strong
                              onClick={() => { if (commentUid) navigate(`/profile/${commentUid}`); }}
                              style={{ fontSize: '12px', color: 'var(--fb-blue)', cursor: 'pointer' }}
                            >
                              {authorName}
                            </strong>

                            {isMyComment && (
                              <div style={{ display: 'flex', gap: '8px', fontSize: '11px' }}>
                                <span
                                  onClick={() => setEditingComment({ postId: post.id, index, text: comment.text })}
                                  style={{ color: 'var(--fb-blue)', cursor: 'pointer' }}
                                >
                                  Edit
                                </span>
                                <span
                                  onClick={() => handleDeleteComment(post.id, post.comments, index)}
                                  style={{ color: '#fa383e', cursor: 'pointer' }}
                                >
                                  Delete
                                </span>
                              </div>
                            )}
                          </div>

                          {editingComment?.postId === post.id && editingComment?.index === index ? (
                            <div style={{ marginTop: '6px', display: 'flex', gap: '6px' }}>
                              <input
                                type="text"
                                value={editingComment.text}
                                onChange={(e) => setEditingComment({ ...editingComment, text: e.target.value })}
                                style={{
                                  flex: 1,
                                  padding: '4px 8px',
                                  fontSize: '12px',
                                  borderRadius: '4px',
                                  border: '1px solid var(--fb-card-border)',
                                  backgroundColor: 'var(--fb-card)',
                                  color: 'var(--fb-text)'
                                }}
                              />
                              <button
                                onClick={() => handleUpdateComment(post.id, post.comments, index, editingComment.text)}
                                className="fb-lite-btn fb-lite-btn-primary"
                                style={{ padding: '2px 8px', fontSize: '11px' }}
                              >
                                Save
                              </button>
                              <button
                                onClick={() => setEditingComment(null)}
                                className="fb-lite-btn fb-lite-btn-secondary"
                                style={{ padding: '2px 8px', fontSize: '11px' }}
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <p style={{ margin: '3px 0 0 0', fontSize: '13px', color: 'var(--fb-text)', lineHeight: '1.4' }}>
                              {comment.text}
                            </p>
                          )}

                          <small style={{ fontSize: '10px', color: 'var(--fb-text-muted)', display: 'block', marginTop: '3px' }}>
                            {comment.createdAt}
                          </small>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </article>
        );
      })}

      {posts.length === 0 && (
        <div className="fb-lite-card" style={{ padding: '30px', textAlign: 'center', color: 'var(--fb-text-secondary)' }}>
          <div style={{ fontSize: '36px', marginBottom: '8px' }}>📰</div>
          <strong style={{ display: 'block', fontSize: '15px', color: 'var(--fb-text)' }}>No Posts in Feed Yet</strong>
          <p style={{ fontSize: '13px', marginTop: '4px' }}>Be the first student to publish a post, photo, or question!</p>
        </div>
      )}

      {/* ── Create Post Full Modal ── */}
      {showPostModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          backgroundColor: 'rgba(0,0,0,0.6)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 3000,
          padding: '10px'
        }}>
          <div style={{
            backgroundColor: 'var(--fb-card)',
            borderRadius: '8px',
            width: '100%',
            maxWidth: '500px',
            boxShadow: '0 8px 30px rgba(0,0,0,0.3)',
            overflow: 'hidden'
          }}>
            {/* Modal Header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              borderBottom: '1px solid var(--fb-divider)'
            }}>
              <strong style={{ fontSize: '16px', color: 'var(--fb-text)' }}>Create Post</strong>
              <button
                onClick={closePostModal}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--fb-text-secondary)',
                  fontSize: '18px',
                  cursor: 'pointer'
                }}
              >
                ✕
              </button>
            </div>

            {/* Author info */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px 0 16px' }}>
              <img
                src={currentUserPhoto.trim() !== '' ? currentUserPhoto : fallbackUserAvatar(currentUserName)}
                alt=""
                className="fb-avatar"
                style={{ width: '40px', height: '40px' }}
              />
              <div>
                <strong style={{ fontSize: '14px', color: 'var(--fb-text)' }}>{currentUserName}</strong>
                <div style={{ fontSize: '11px', color: 'var(--fb-text-secondary)' }}>🌐 Campus Public Feed</div>
              </div>
            </div>

            <form onSubmit={handlePost} style={{ padding: '12px 16px' }}>
              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder="What's on your mind?"
                autoFocus
                style={{
                  width: '100%',
                  minHeight: '100px',
                  border: 'none',
                  outline: 'none',
                  resize: 'vertical',
                  fontSize: '15px',
                  color: 'var(--fb-text)',
                  backgroundColor: 'transparent',
                  fontFamily: 'inherit'
                }}
              />

              <input
                type="text"
                value={mediaUrl}
                onChange={e => setMediaUrl(e.target.value)}
                placeholder="Or paste image/video URL (optional)"
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  border: '1px solid var(--fb-card-border)',
                  backgroundColor: 'var(--fb-input-bg)',
                  color: 'var(--fb-text)',
                  fontSize: '13px',
                  outline: 'none',
                  marginBottom: '10px'
                }}
              />

              {/* Upload Box */}
              <div style={{
                border: '1px dashed var(--fb-card-border)',
                borderRadius: '8px',
                padding: '12px',
                textAlign: 'center',
                backgroundColor: 'var(--fb-hover)',
                marginBottom: '14px'
              }}>
                {window.Capacitor?.isNativePlatform?.() ? (
                  <button
                    type="button"
                    onClick={handleFileChange}
                    className="fb-lite-btn fb-lite-btn-primary"
                  >
                    📁 Choose Photo or Video
                  </button>
                ) : (
                  <>
                    <label
                      htmlFor="file-upload-web"
                      className="fb-lite-btn fb-lite-btn-primary"
                      style={{ cursor: 'pointer' }}
                    >
                      📁 Upload Photo or Video
                    </label>
                    <input 
                      id="file-upload-web"
                      key={fileInputKey}
                      ref={fileInputRef}
                      type="file"
                      accept="image/*,video/*"
                      onChange={handleFileChange} 
                      style={{ display: 'none' }}
                    />
                  </>
                )}

                {selectedFile?.kind === 'video' && selectedFile.previewUrl && (
                  <div style={{ marginTop: '10px', textAlign: 'center' }}>
                    <video src={selectedFile.previewUrl} controls style={{ width: '200px', maxHeight: '140px', borderRadius: '6px' }} />
                    <small style={{ display: 'block', color: 'var(--fb-green)', fontSize: '11px', marginTop: '4px' }}>✓ {selectedFile.fileName} ready</small>
                  </div>
                )}
                {selectedFile?.kind === 'image' && selectedFile.previewUrl && (
                  <div style={{ marginTop: '10px', textAlign: 'center' }}>
                    <img src={selectedFile.previewUrl} alt="Preview" style={{ width: '120px', height: '100px', objectFit: 'cover', borderRadius: '6px' }} />
                    <small style={{ display: 'block', color: 'var(--fb-green)', fontSize: '11px', marginTop: '4px' }}>✓ {selectedFile.fileName} ready</small>
                  </div>
                )}
                {isPosting && selectedFile && (
                  <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--fb-blue)', fontWeight: 'bold' }}>
                    Uploading to server... {uploadProgress}%
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={isPosting}
                className="fb-lite-btn fb-lite-btn-primary"
                style={{
                  width: '100%',
                  padding: '10px',
                  fontSize: '14px',
                  fontWeight: '700',
                  opacity: isPosting ? 0.7 : 1
                }}
              >
                {isPosting ? `Posting (${uploadProgress}%)...` : 'Post'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── Photo Lightbox ── */}
      {expandedImage && (
        <div
          onClick={closeLightbox}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            backgroundColor: 'rgba(0,0,0,0.92)',
            zIndex: 4000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'zoom-out'
          }}
        >
          <img
            src={expandedImage}
            alt=""
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '95%', maxHeight: '95%', objectFit: 'contain', cursor: 'default' }}
          />
          <button
            onClick={closeLightbox}
            style={{
              position: 'absolute',
              top: '16px',
              right: '16px',
              background: 'rgba(255,255,255,0.2)',
              border: 'none',
              color: '#ffffff',
              fontSize: '20px',
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            ✕
          </button>
        </div>
      )}

    </div>
  );
}
