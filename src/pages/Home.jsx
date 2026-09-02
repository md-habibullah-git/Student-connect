// File Name: src/pages/Home.jsx

import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { db, auth } from '../firebase';
import { 
  collection, addDoc, query, onSnapshot, doc, updateDoc, 
  arrayUnion, arrayRemove, deleteDoc, getDocs, where 
} from 'firebase/firestore';
import { FilePicker } from '@capawesome/capacitor-file-picker';

const CLOUDINARY_CLOUD_NAME = 'hvdnthrl';
const CLOUDINARY_UPLOAD_PRESET = 'student-connect';
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

const commentFormStyle = { display: 'flex', marginTop: '8px', position: 'relative', width: '100%', alignItems: 'center' };
const commentInputStyle = { width: '100%', padding: '8px 40px 8px 10px', fontSize: '13px', borderRadius: '20px', border: '1px solid var(--border, #ccc)', backgroundColor: 'transparent', outline: 'none', boxSizing: 'border-box' };
const commentIconBtnStyle = { position: 'absolute', right: '10px', background: 'none', border: 'none', color: '#0056b3', cursor: 'pointer', fontSize: '16px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' };

// Cloudinary আপলোড ফাংশন
function uploadMediaToCloudinary(fileOrBlob, resourceType, onProgress, fileName) {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('file', fileOrBlob);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    
    const timestamp = Date.now();
    const safeFileName = (fileName || 'upload').replace(/[^a-zA-Z0-9-_\.]/g, '_');
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
        } catch (err) {
          reject(new Error('Could not parse Cloudinary response'));
        }
      } else {
        let message = `Upload failed (HTTP ${xhr.status})`;
        try { message = JSON.parse(xhr.responseText)?.error?.message || message; } catch (e) { /* ignore */ }
        reject(new Error(message));
      }
    };
    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.send(formData);
  });
}

// Cloudinary delete ফাংশন
async function deleteMediaFromCloudinary(publicId, resourceType) {
  if (!publicId) return;
  
  console.log('🗑️ Cloudinary delete:', publicId, resourceType);
  
  try {
    const res = await fetch('/api/delete-cloudinary-media', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ publicId, resourceType }),
    });
    
    const data = await res.json();
    console.log('   Response:', data);
    
    if (data.success) {
      console.log('✅ Cloudinary delete done');
    } else {
      console.error('❌ Cloudinary delete failed:', data.error);
    }
  } catch (err) {
    console.error('❌ Error:', err.message);
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

  // Updated video refs and management
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

  const resetFileInput = () => {
    setSelectedFile(null);
    setFileInputKey(Date.now());
  };

  // Helper: apply mute state to all videos
  const applyMuteToAll = (muted) => {
    Object.values(videoElementsRef.current).forEach(v => {
      if (v) v.muted = muted;
    });
  };

  // Helper: pause all videos except the given id
  const pauseAllExcept = (exceptId) => {
    Object.entries(videoElementsRef.current).forEach(([id, video]) => {
      if (id !== exceptId && video && !video.paused) {
        internalActionRef.current = true;
        video.pause();
        internalActionRef.current = false;
      }
    });
  };

  // Play a specific video as the active one
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

  // Pause a specific video
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

  // Lightbox
  useEffect(() => {
    if (expandedImage) {
      window.history.pushState({ lightboxOpen: true }, '');
      lightboxHistoryPushed.current = true;
      document.body.style.overflow = 'hidden';
      
      const handlePopState = (event) => {
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
  }, [location.state]);

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

  // IntersectionObserver for video playback
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const videoEl = entry.target;
        const postId = videoEl.dataset.postId;
        if (!postId) return;

        if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
          if (!activeVideoIdRef.current) {
            playVideo(postId);
          } else if (activeVideoIdRef.current === postId) {
            if (videoEl.paused) playVideo(postId);
          }
        } else {
          if (activeVideoIdRef.current === postId) {
            pauseVideo(postId);
          }
        }
      });
    }, { threshold: [0, 0.6, 1] });

    Object.values(videoElementsRef.current).forEach(v => {
      if (v) observer.observe(v);
    });

    return () => observer.disconnect();
  }, [posts]);

  // Fullscreen handling
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

  useEffect(() => {
    // ৭ দিন পর অটো ডিলিট
    const cleanupOldPosts = async () => {
      try {
        const sevenDaysAgo = new Date().getTime() - (7 * 24 * 60 * 60 * 1000);
        const qOld = query(collection(db, "posts"), where("createdAt", "<", sevenDaysAgo));
        const oldPostsSnapshot = await getDocs(qOld);
        
        for (const postDoc of oldPostsSnapshot.docs) {
          const data = postDoc.data();
          
          if (data.mediaPublicId) {
            await deleteMediaFromCloudinary(data.mediaPublicId, data.mediaResourceType);
          }
          
          await deleteDoc(doc(db, "posts", postDoc.id));
        }
      } catch (error) {
        console.error("Cleanup Error:", error);
      }
    };
    cleanupOldPosts();

    const unsubscribeUsers = onSnapshot(collection(db, "users"), (snapshot) => {
      const cache = {};
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        const uId = data.uid || data.id || doc.id;
        const uName = data.name || "";
        const uDisplayName = data.displayName || "";
        const uPhoto = data.photo || "";

        if (uId) {
          const userObj = { name: uName || uDisplayName || "Student", photo: uPhoto };
          cache[uId] = userObj;
          cache[String(uId).trim()] = userObj;
        }
        if (uName) { cache[uName.trim()] = uPhoto; cache[uName.toLowerCase().trim()] = uPhoto; }
        if (uDisplayName) { cache[uDisplayName.trim()] = uPhoto; cache[uDisplayName.toLowerCase().trim()] = uPhoto; }
        if (data.userNameRaw) { cache[data.userNameRaw.trim()] = uPhoto; cache[data.userNameRaw.toLowerCase().trim()] = uPhoto; }
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
      const sortedPosts = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .sort((a, b) => b.createdAt - a.createdAt);
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

  // 🔥 File Picker দিয়ে gallery + file manager access (Native platform)
  const handleFileChange = async (e) => {
    // Native platform-এ File Picker ব্যবহার
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
          
          if (fileType.startsWith('video/')) {
            if (file.size > MAX_VIDEO_BYTES) {
              alert("This video is larger than 100MB. Please choose a smaller video file.");
              resetFileInput();
              return;
            }
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
    
    // Web browser-এ file input
    const file = e.target.files?.[0];
    if (!file) {
      setSelectedFile(null);
      return;
    }

    if (file.type.startsWith('video/')) {
      if (file.size > MAX_VIDEO_BYTES) {
        alert("This video is larger than 100MB. Please choose a smaller video file.");
        resetFileInput();
        return;
      }
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
      alert("Please add some content to post!");
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

      await addDoc(collection(db, "posts"), {
        text: text,
        mediaUrl: finalMediaUrl,
        mediaPublicId: mediaPublicId,
        mediaResourceType: mediaResourceType,
        fileName: fileToUpload?.fileName || null,
        userName: auth.currentUser?.displayName || "Student",
        userId: auth.currentUser?.uid,
        likes: [],
        loves: [],
        wows: [],
        comments: [],
        createdAt: new Date().getTime()
      });

      if (fileToUpload?.previewUrl && fileToUpload.previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(fileToUpload.previewUrl);
      }
      
      setText('');
      setMediaUrl('');
      resetFileInput();
      setUploadProgress(0);
      setShowPostModal(false);
      
      applyMuteToAll(false);
      
      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }, 500);
      
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
      .then(() => {
        alert("Post link copied to clipboard!");
      })
      .catch((err) => {
        console.error("Failed to copy link: ", err);
      });
  };

  const handleComment = async (e, postId) => {
    e.preventDefault();
    const commentText = commentInput[postId];
    if (!commentText || !commentText.trim()) return;

    const postRef = doc(db, "posts", postId);
    await updateDoc(postRef, {
      comments: arrayUnion({
        commentUserId: auth.currentUser?.uid || "unknown",
        userName: auth.currentUser?.displayName || "Student",
        userNameRaw: auth.currentUser?.displayName || "Student",
        text: commentText,
        createdAt: new Date().toLocaleTimeString()
      })
    });
    setCommentInput({ ...commentInput, [postId]: '' });
  };

  const handleDeleteComment = async (postId, postComments, commentIndex) => {
    if (window.confirm("Are you sure you want to delete this comment?")) {
      const postRef = doc(db, "posts", postId);
      const updatedComments = postComments.filter((_, idx) => idx !== commentIndex);
      await updateDoc(postRef, { comments: updatedComments });
    }
  };

  const handleUpdateComment = async (postId, postComments, commentIndex, newText) => {
    if (!newText.trim()) return;
    const postRef = doc(db, "posts", postId);
    const updatedComments = postComments.map((comment, idx) => 
      idx === commentIndex ? { ...comment, text: newText } : comment
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
        console.log('✅ Post deleted');
      } catch (error) {
        console.error('❌ Delete error:', error);
      }
    }
  };

  const handleMediaError = async (e, post) => {
    const el = e.target;
    if (el.dataset.retried) {
      try {
        await deleteDoc(doc(db, "posts", post.id));
        console.log('✅ Post removed (media missing)');
      } catch (error) {
        console.error('❌ Error:', error);
      }
    } else {
      el.dataset.retried = "1";
      setTimeout(() => {
        const sep = post.mediaUrl.includes('?') ? '&' : '?';
        el.src = `${post.mediaUrl}${sep}retry=${Date.now()}`;
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

  return (
    <div style={{ maxWidth: '500px', margin: 'auto', fontFamily: 'Arial', padding: '0', minHeight: '100vh' }}>
      
      <style>{`
        .dynamic-post-card { 
          background-color: #ffffff; 
          border: 1px solid #eee; 
          color: #333333; 
          padding: 15px; 
          border-radius: 0; 
          margin-bottom: 0; 
          min-height: 100vh; 
          display: flex; 
          flex-direction: column; 
          justify-content: center; 
        }
        :root[data-theme='dark'] .dynamic-post-card { background-color: #111111; border: 1px solid #222; color: #ffffff; }
        .dynamic-post-card p { color: inherit; }
        :root[data-theme='dark'] .dynamic-post-card p { color: #f3f4f6; }
        :root[data-theme='dark'] .dynamic-post-card input { color: #ffffff !important; }
        .dynamic-post-card.shared-highlight { box-shadow: 0 0 0 3px #0056b3, 0 4px 14px rgba(0,86,179,0.35); transition: box-shadow 0.4s ease; }
        .inline-reaction-popup {
          position: absolute; bottom: calc(100% + 10px); left: 0; background: #ffffff; color: #222222;
          padding: 10px 14px; border-radius: 10px; font-size: 13px; z-index: 100; width: 240px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.15); text-align: left; border: 1px solid #eee;
          box-sizing: border-box;
        }
        :root[data-theme='dark'] .inline-reaction-popup { background: #222222; color: #ffffff; border-color: #333; box-shadow: 0 8px 24px rgba(0,0,0,0.4); }
        .popup-user-row { display: flex; align-items: center; gap: 8px; margin-top: 6px; padding: 2px 0; }
        .popup-avatar { width: 42px !important; height: 42px !important; border-radius: 50% !important; object-fit: cover !important; border: 1px solid #0056b3; background: #e4e6eb; flex-shrink: 0; cursor: pointer; }
        .comment-user-row { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 8px; width: 100%; box-sizing: border-box; }
        .comment-avatar { width: 42px !important; height: 42px !important; border-radius: 50% !important; object-fit: cover !important; border: 1px solid #0056b3; background: #e4e6eb; flex-shrink: 0; margin-top: 2px; cursor: pointer; }
      `}</style>

      {targetPostId && posts.length > 0 && !posts.some(p => p.id === targetPostId) && (
        <div style={{ padding: '12px 15px', textAlign: 'center', color: '#dc3545', fontStyle: 'italic', border: '1px solid #dc3545', borderRadius: '8px', marginBottom: '15px' }}>
          এই পোস্টটি আর পাওয়া যাচ্ছে না। এটি মুছে ফেলা হয়ে থাকতে পারে।
        </div>
      )}

      {showPostModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000 }}>
          <div style={{ backgroundColor: 'var(--bg, #fff)', padding: '20px', borderRadius: '8px', width: '90%', maxWidth: '450px', position: 'relative', boxShadow: '0 4px 15px rgba(0,0,0,0.2)' }}>
            <button onClick={closePostModal} style={{ position: 'absolute', top: '10px', right: '15px', background: 'none', border: 'none', color: 'var(--text-h, #333)', fontSize: '18px', cursor: 'pointer' }}>✕</button>
            <h3 style={{ marginBottom: '15px', color: '#0056b3', marginTop: 0, textAlign: 'center' }}>Create a Post</h3>
            
            <form onSubmit={handlePost}>
              <textarea value={text} onChange={e => setText(e.target.value)} placeholder="What's on your mind, Student?" style={{ width: '95%', height: '80px', padding: '8px', border: '1px solid var(--border, #ddd)', borderRadius: '5px', resize: 'none', outline: 'none', fontFamily: 'Arial', backgroundColor: 'transparent', color: 'inherit' }} />
              <input type="text" value={mediaUrl} onChange={e => setMediaUrl(e.target.value)} placeholder="Paste Photo/Video Link (Optional)" style={{ width: '95%', padding: '8px', marginTop: '10px', border: '1px solid var(--border, #ddd)', borderRadius: '5px', outline: 'none', backgroundColor: 'transparent', color: 'inherit' }} />
              
              <div style={{ marginTop: '12px', width: '95%' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: 'var(--text, #555)', marginBottom: '5px' }}>Upload from Device:</label>
                
                {/* 🔥 Native-এ button, Web-এ file input */}
                {window.Capacitor?.isNativePlatform?.() ? (
                  <button
                    type="button"
                    onClick={handleFileChange}
                    style={{ 
                      padding: '10px 15px', 
                      backgroundColor: '#0056b3', 
                      color: '#fff', 
                      border: 'none', 
                      borderRadius: '5px', 
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontWeight: 'bold'
                    }}
                  >
                    📁 Choose Photo/Video
                  </button>
                ) : (
                  <input 
                    key={fileInputKey}
                    ref={fileInputRef}
                    type="file" 
                    accept="image/*,video/*" 
                    onChange={handleFileChange} 
                    style={{ fontSize: '13px' }}
                  />
                )}

                {selectedFile?.kind === 'video' && selectedFile.previewUrl && (
                  <div style={{ marginTop: '10px', textAlign: 'center' }}>
                    <video src={selectedFile.previewUrl} controls style={{ width: '160px', maxHeight: '120px', borderRadius: '4px', border: '1px solid #ddd' }} />
                    <small style={{ display: 'block', color: '#28a745', fontSize: '11px', marginTop: '2px' }}>✓ {selectedFile.fileName} ready to post</small>
                  </div>
                )}
                {selectedFile?.kind === 'image' && selectedFile.previewUrl && (
                  <div style={{ marginTop: '10px', textAlign: 'center' }}>
                    <img src={selectedFile.previewUrl} alt="Preview" style={{ width: '80px', height: '60px', objectFit: 'cover', borderRadius: '4px', border: '1px solid #ddd' }} />
                    <small style={{ display: 'block', color: '#28a745', fontSize: '11px', marginTop: '2px' }}>✓ {selectedFile.fileName} ready to post</small>
                  </div>
                )}
                {isPosting && selectedFile && (
                  <div style={{ marginTop: '10px', textAlign: 'center', fontSize: '12px', color: '#0056b3', fontWeight: 'bold' }}>
                    Uploading… {uploadProgress}%
                  </div>
                )}
              </div>
              <button type="submit" disabled={isPosting} style={{ width: '100%', marginTop: '15px', padding: '10px', backgroundColor: isPosting ? '#7fa8d9' : '#0056b3', color: '#fff', border: 'none', borderRadius: '5px', cursor: isPosting ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}>
                {isPosting ? 'Uploading…' : 'Post to Feed'}
              </button>
            </form>
          </div>
        </div>
      )}

      {posts.map(post => {
        const postAvatarFallback = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(post.userName || 'Student')}`;
        return (
          <div key={post.id} id={`post-${post.id}`} className={`dynamic-post-card${highlightedPostId === post.id ? ' shared-highlight' : ''}`}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
              <img src={usersCache[post.userId]?.photo || postAvatarFallback} alt="" style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover', border: '1px solid #0056b3', cursor: 'pointer' }} onClick={() => { if (post.userId) window.location.href = `/profile/${post.userId}`; }} />
              <div>
                <strong style={{ display: 'block', fontSize: '14px', cursor: 'pointer' }} onClick={() => { if (post.userId) window.location.href = `/profile/${post.userId}`; }}>{post.userName}</strong>
                <small style={{ color: '#777', fontSize: '11px' }}>{new Date(post.createdAt).toLocaleDateString()}</small>
              </div>
              {(auth.currentUser?.uid === post.userId || isAdmin) && (
                <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', fontSize: '12px' }}>
                  <span onClick={() => handleDeletePost(post.id, post.mediaPublicId, post.mediaResourceType)} style={{ color: '#ff3366', cursor: 'pointer', padding: '5px' }}>Delete</span>
                </div>
              )}
            </div>

            {post.text && <p style={{ margin: '0 0 12px 0', fontSize: '14px', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>{post.text}</p>}
            
            {post.mediaUrl && (
              <div style={{ borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--border, #eee)', backgroundColor: 'rgba(0,0,0,0.02)', textAlign: 'center', marginBottom: '12px' }}>
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
                      const postId = e.target.dataset.postId;
                      if (postId && activeVideoIdRef.current !== postId) {
                        playVideo(postId);
                      }
                    }}
                    onPause={(e) => {
                      if (internalActionRef.current) return;
                      const postId = e.target.dataset.postId;
                      if (postId && activeVideoIdRef.current === postId) {
                        activeVideoIdRef.current = null;
                      }
                    }}
                    onVolumeChange={(e) => {
                      globalMutedRef.current = e.target.muted;
                      applyMuteToAll(globalMutedRef.current);
                    }}
                    onError={(e) => handleMediaError(e, post)}
                    style={{ maxWidth: '100%', maxHeight: '70vh', width: '100%', objectFit: 'contain' }}
                  />
                ) : (
                  <img
                    src={post.mediaUrl}
                    alt="Post Content"
                    onClick={() => setExpandedImage(post.mediaUrl)}
                    onError={(e) => handleMediaError(e, post)}
                    style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain', cursor: 'zoom-in' }}
                  />
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: '20px', fontSize: '12px', opacity: 0.8, borderBottom: '1px solid var(--border, #eee)', paddingBottom: '8px', marginBottom: '8px', position: 'relative' }}>
              <span onClick={(e) => toggleReactionPopup(e, post.id, "Like")} style={{ cursor: 'pointer', userSelect: 'none', position: 'relative' }}>
                👍 {(post.likes || []).length}
                {activeReactionPopup?.postId === post.id && activeReactionPopup?.type === "Like" && (
                  <div className="inline-reaction-popup" onClick={(e) => e.stopPropagation()}>
                    <strong style={{ borderBottom: '1px solid #ddd', display: 'block', paddingBottom: '4px', color: '#0056b3' }}>👍 Likes:</strong>
                    <div style={{ marginTop: '5px', maxHeight: '120px', overflowY: 'auto' }}>
                      {(post.likes || []).length === 0 ? <div style={{ color: '#888', fontStyle: 'italic' }}>No reactions yet</div> : post.likes.map(uid => {
                        const userPhoto = usersCache[uid]?.photo || "";
                        const defaultAvatar = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(usersCache[uid]?.name || 'Student')}`;
                        return (
                          <div key={uid} className="popup-user-row">
                            <img src={userPhoto.trim() !== "" ? userPhoto : defaultAvatar} alt="" className="popup-avatar" onClick={() => { if (uid) window.location.href = `/profile/${uid}`; }} onError={(e) => { e.target.onerror = null; e.target.src = defaultAvatar; }} />
                            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer' }} onClick={() => { if (uid) window.location.href = `/profile/${uid}`; }}>{usersCache[uid]?.name || "Approved Student"}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </span>

              <span onClick={(e) => toggleReactionPopup(e, post.id, "Love")} style={{ cursor: 'pointer', userSelect: 'none', position: 'relative' }}>
                ❤️ {(post.loves || []).length}
                {activeReactionPopup?.postId === post.id && activeReactionPopup?.type === "Love" && (
                  <div className="inline-reaction-popup" onClick={(e) => e.stopPropagation()}>
                    <strong style={{ borderBottom: '1px solid #ddd', display: 'block', paddingBottom: '4px', color: '#ff3366' }}>❤️ Loves:</strong>
                    <div style={{ marginTop: '5px', maxHeight: '120px', overflowY: 'auto' }}>
                      {(post.loves || []).length === 0 ? <div style={{ color: '#888', fontStyle: 'italic' }}>No reactions yet</div> : post.loves.map(uid => {
                        const userPhoto = usersCache[uid]?.photo || "";
                        const defaultAvatar = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(usersCache[uid]?.name || 'Student')}`;
                        return (
                          <div key={uid} className="popup-user-row">
                            <img src={userPhoto.trim() !== "" ? userPhoto : defaultAvatar} alt="" className="popup-avatar" onClick={() => { if (uid) window.location.href = `/profile/${uid}`; }} onError={(e) => { e.target.onerror = null; e.target.src = defaultAvatar; }} />
                            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer' }} onClick={() => { if (uid) window.location.href = `/profile/${uid}`; }}>{usersCache[uid]?.name || "Approved Student"}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </span>

              <span onClick={(e) => toggleReactionPopup(e, post.id, "Wow")} style={{ cursor: 'pointer', userSelect: 'none', position: 'relative' }}>
                😍 {(post.wows || []).length}
                {activeReactionPopup?.postId === post.id && activeReactionPopup?.type === "Wow" && (
                  <div className="inline-reaction-popup" onClick={(e) => e.stopPropagation()}>
                    <strong style={{ borderBottom: '1px solid #ddd', display: 'block', paddingBottom: '4px', color: '#ffcc00' }}>😍 Wows:</strong>
                    <div style={{ marginTop: '5px', maxHeight: '120px', overflowY: 'auto' }}>
                      {(post.wows || []).length === 0 ? <div style={{ color: '#888', fontStyle: 'italic' }}>No reactions yet</div> : post.wows.map(uid => {
                        const userPhoto = usersCache[uid]?.photo || "";
                        const defaultAvatar = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(usersCache[uid]?.name || 'Student')}`;
                        return (
                          <div key={uid} className="popup-user-row">
                            <img src={userPhoto.trim() !== "" ? userPhoto : defaultAvatar} alt="" className="popup-avatar" onClick={() => { if (uid) window.location.href = `/profile/${uid}`; }} onError={(e) => { e.target.onerror = null; e.target.src = defaultAvatar; }} />
                            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer' }} onClick={() => { if (uid) window.location.href = `/profile/${uid}`; }}>{usersCache[uid]?.name || "Approved Student"}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </span>

              <span onClick={() => toggleCommentVisibility(post.id)} style={{ marginLeft: 'auto', cursor: 'pointer', userSelect: 'none', fontWeight: 'bold', color: '#0056b3' }}>
                {(post.comments || []).length} comments 💬
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border, #eee)', paddingBottom: '5px' }}>
              <button onClick={() => handleLike(post.id, post.likes)} style={{ flex: 1, background: 'none', border: 'none', padding: '8px', cursor: 'pointer', fontWeight: 'bold', color: (post.likes || []).includes(auth.currentUser?.uid) ? '#0088ff' : 'inherit', opacity: (post.likes || []).includes(auth.currentUser?.uid) ? 1 : 0.7, fontSize: '13px' }}>👍 Like</button>
              <button onClick={() => handleLove(post.id, post.loves)} style={{ flex: 1, background: 'none', border: 'none', padding: '8px', cursor: 'pointer', fontWeight: 'bold', color: (post.loves || []).includes(auth.currentUser?.uid) ? '#ff3366' : 'inherit', opacity: (post.loves || []).includes(auth.currentUser?.uid) ? 1 : 0.7, fontSize: '13px' }}>❤️ Love</button>
              <button onClick={() => handleWow(post.id, post.wows)} style={{ flex: 1, background: 'none', border: 'none', padding: '8px', cursor: 'pointer', fontWeight: 'bold', color: (post.wows || []).includes(auth.currentUser?.uid) ? '#ffcc00' : 'inherit', opacity: (post.wows || []).includes(auth.currentUser?.uid) ? 1 : 0.7, fontSize: '13px' }}>😍 Wow</button>
              <button onClick={() => handleShare(post.id)} style={{ flex: 1, background: 'none', border: 'none', padding: '8px', cursor: 'pointer', fontWeight: 'bold', color: 'inherit', opacity: 0.7, fontSize: '13px' }}>🔗 Copy Link</button>
            </div>

            <form onSubmit={(e) => handleComment(e, post.id)} style={commentFormStyle}>
              <input type="text" placeholder="Write a comment..." value={commentInput[post.id] || ''} onChange={(e) => setCommentInput({ ...commentInput, [post.id]: e.target.value })} style={commentInputStyle} />
              <button type="submit" style={commentIconBtnStyle}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
              </button>
            </form>

            {visibleComments[post.id] && (
              <div style={{ marginTop: '12px', transition: 'all 0.3s ease' }}>
                {(post.comments || []).map((comment, index) => {
                  const commentUid = comment.commentUserId || "";
                  const fallbackKey = comment.userNameRaw || comment.userName || "Student";
                  const userPhoto = usersCache[commentUid]?.photo || "";
                  const defaultAvatar = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(usersCache[commentUid]?.name || fallbackKey)}`;

                  return (
                    <div key={index} className="comment-user-row">
                      <img src={userPhoto.trim() !== "" ? userPhoto : defaultAvatar} alt="" className="comment-avatar" onClick={() => { if (commentUid) window.location.href = `/profile/${commentUid}`; }} onError={(e) => { e.target.onerror = null; e.target.src = defaultAvatar; }} />
                      
                      <div style={{ flex: 1, backgroundColor: 'var(--social-bg, #f0f2f5)', padding: '6px 12px', borderRadius: '14px', position: 'relative' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 'bold', fontSize: '12px', color: '#0056b3', cursor: 'pointer' }} onClick={() => { if (commentUid) window.location.href = `/profile/${commentUid}`; }}>{usersCache[commentUid]?.name || fallbackKey}</span>
                          
                          <div style={{ display: 'flex', gap: '6px', fontSize: '10px', marginLeft: 'auto' }}>
                            {(auth.currentUser?.uid === commentUid || isAdmin) && (
                              <>
                                <span onClick={() => setEditingComment({ postId: post.id, index, text: comment.text })} style={{ color: '#0072ff', cursor: 'pointer' }}>Edit</span>
                                <span onClick={() => handleDeleteComment(post.id, post.comments, index)} style={{ color: '#ff3366', cursor: 'pointer' }}>Delete</span>
                              </>
                            )}
                          </div>
                        </div>

                        {editingComment?.postId === post.id && editingComment?.index === index ? (
                          <div style={{ marginTop: '5px', display: 'flex', gap: '5px' }}>
                            <input type="text" value={editingComment.text} onChange={(e) => setEditingComment({ ...editingComment, text: e.target.value })} style={{ width: '80%', padding: '4px', fontSize: '12px', borderRadius: '4px', border: '1px solid #ccc' }} />
                            <button onClick={() => handleUpdateComment(post.id, post.comments, index, editingComment.text)} style={{ padding: '2px 8px', fontSize: '11px', backgroundColor: '#28a745', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Save</button>
                            <button onClick={() => setEditingComment(null)} style={{ padding: '2px 8px', fontSize: '11px', backgroundColor: '#dc3545', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>
                          </div>
                        ) : (
                          <p style={{ margin: '4px 0 2px 0', fontSize: '12px', wordBreak: 'break-all', lineHeight: '1.4' }}>{comment.text}</p>
                        )}
                        <small style={{ fontSize: '9px', opacity: 0.6, display: 'block', marginTop: '2px' }}>{comment.createdAt}</small>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {posts.length === 0 && (
        <div style={{ padding: '20px', textAlign: 'center', color: '#888', fontStyle: 'italic', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          No posts available on the feed.
        </div>
      )}

      {expandedImage && (
        <div
          onClick={closeLightbox}
          style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.9)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out' }}
        >
          <img
            src={expandedImage}
            alt=""
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '95%', maxHeight: '95%', objectFit: 'contain', cursor: 'default' }}
          />
          <button
            onClick={closeLightbox}
            style={{ position: 'absolute', top: '20px', right: '20px', background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', fontSize: '20px', width: '40px', height: '40px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
