import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { db, auth, storage } from '../firebase';
import { 
  collection, addDoc, query, onSnapshot, doc, updateDoc, 
  arrayUnion, arrayRemove, deleteDoc, getDocs, where 
} from 'firebase/firestore';
import { ref as storageRef, deleteObject } from 'firebase/storage'; // পুরনো পোস্ট (আগে Firebase Storage-এ আপলোড হওয়া ভিডিও) cleanup-এর জন্য এখনো রাখা হয়েছে — নতুন পোস্টে আর ব্যবহার হয় না

// নতুন: পোস্টের ছবি ও ভিডিও — দুটোই এখন Cloudinary-তে (আনসাইনড আপলোড প্রিসেট
// দিয়ে) আপলোড হয়, Firebase Storage বা Firestore-এ raw base64/binary না রেখে।
// এই cloud name/preset আপনার Cloudinary কনসোল থেকে নেওয়া (Upload Presets পেজ)।
const CLOUDINARY_CLOUD_NAME = 'hvdnthrl';
const CLOUDINARY_UPLOAD_PRESET = 'student-connect';
const MAX_VIDEO_BYTES = 100 * 1024 * 1024; // 100MB — Cloudinary প্রিসেটের আপলোড সীমা অনুযায়ী

const commentFormStyle = { display: 'flex', marginTop: '8px', position: 'relative', width: '100%', alignItems: 'center' };
const commentInputStyle = { width: '100%', padding: '8px 40px 8px 10px', fontSize: '13px', borderRadius: '20px', border: '1px solid var(--border, #ccc)', backgroundColor: 'transparent', outline: 'none', boxSizing: 'border-box' };
const commentIconBtnStyle = { position: 'absolute', right: '10px', background: 'none', border: 'none', color: '#0056b3', cursor: 'pointer', fontSize: '16px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' };

// XMLHttpRequest ব্যবহার করা হচ্ছে (fetch না) যাতে আপলোড progress % পাওয়া যায়
function uploadMediaToCloudinary(fileOrBlob, resourceType, onProgress) {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('file', fileOrBlob);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

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
          // নতুন: শুধু URL না, public_id/resource_type-ও রাখা হচ্ছে — পরে
          // পোস্ট ডিলিট হলে এগুলো দিয়েই Cloudinary থেকে আসল ফাইলটা মুছতে হবে
          resolve({ url: data.secure_url, publicId: data.public_id, resourceType: data.resource_type });
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

// নতুন: /api/delete-cloudinary-media.js (Vercel serverless function) কল করে
// Cloudinary থেকে আসল ফাইলটা মুছে ফেলে — API secret এখানে নেই, শুধু সার্ভারে আছে
async function deleteMediaFromCloudinary(publicId, resourceType) {
  if (!publicId) return;
  try {
    const res = await fetch('/api/delete-cloudinary-media', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ publicId, resourceType }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.error('Cloudinary delete failed:', data.error || res.status);
    }
  } catch (err) {
    console.error('Error calling delete-cloudinary-media:', err);
  }
}

export default function Home({ isAdmin }) {
  const location = useLocation();
  const navigate = useNavigate();

  // 🔧 NEW: When the URL is /post/:postId (a shared "Copy Link"), this gives us the target post id.
  const { postId: targetPostId } = useParams();

  const [posts, setPosts] = useState([]);
  const [text, setText] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [selectedFile, setSelectedFile] = useState(null); 
  const [isPosting, setIsPosting] = useState(false); // নতুন: ভিডিও আপলোড হওয়া পর্যন্ত বাটন disabled রাখতে
  const [uploadProgress, setUploadProgress] = useState(0); // নতুন: Cloudinary আপলোড প্রগ্রেস %
  const [commentInput, setCommentInput] = useState({});
  const [showPostModal, setShowPostModal] = useState(false);
  const [expandedImage, setExpandedImage] = useState(null); // নতুন: ছবিতে ক্লিক করলে বড় করে (Facebook-স্টাইল lightbox) দেখানোর জন্য

  // নতুন: ফিডে একসাথে একটাই ভিডিও চলবে, আর স্ক্রল করে viewport-এ আসা ভিডিও
  // অটো-প্লে হবে (আগেরটা থেমে যাবে) — এই দুটো ref সেটাই ব্যবস্থাপনা করে
  const videoRefs = useRef({}); // postId -> <video> DOM element
  const [editingComment, setEditingComment] = useState(null);
  const [usersCache, setUsersCache] = useState({});
  const [visibleComments, setVisibleComments] = useState({});
  const [activeReactionPopup, setActiveReactionPopup] = useState(null);

  // 🔧 NEW: tracks which post (if any) should currently glow after a shared-link visit
  const [highlightedPostId, setHighlightedPostId] = useState(null);
  const hasScrolledRef = useRef(false);

  // 🔧 FIX: If we arrived here from the Navbar's "+" button on another page,
  // location.state.openPostModal will be true. Open the modal and then clear
  // the state so it doesn't reopen on refresh/back navigation.
  useEffect(() => {
    if (location.state?.openPostModal) {
      setShowPostModal(true);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state]);

  // 🔧 NEW: reset the "already scrolled" flag whenever the target post id changes
  // (e.g. user opens a different shared link while the app is still running).
  useEffect(() => {
    hasScrolledRef.current = false;
  }, [targetPostId]);

  // 🔧 NEW: once posts are loaded, find the shared post, scroll to it, and
  // highlight it briefly (3s) so the user can spot it in the feed.
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

  // নতুন: স্ক্রল করার সময় viewport-এ যথেষ্ট দেখা যাওয়া ভিডিওটা অটো-প্লে হবে
  // (মিউটেড — ব্রাউজারের autoplay নীতি মেনে চলার জন্য), viewport থেকে বেরিয়ে
  // গেলে থেমে যাবে। posts লোড/পরিবর্তন হলে observer রিফ্রেশ হয়।
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const videoEl = entry.target;
        if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
          videoEl.play().catch(() => {}); // autoplay ব্লক হলে silently ignore
        } else if (!videoEl.paused) {
          videoEl.pause();
        }
      });
    }, { threshold: [0, 0.6, 1] });

    Object.values(videoRefs.current).forEach((v) => { if (v) observer.observe(v); });
    return () => observer.disconnect();
  }, [posts]);

  useEffect(() => {
    const cleanupOldPosts = async () => {
      try {
        const sevenDaysAgo = new Date().getTime() - (7 * 24 * 60 * 60 * 1000);
        const qOld = query(collection(db, "posts"), where("createdAt", "<", sevenDaysAgo));
        const oldPostsSnapshot = await getDocs(qOld);
        oldPostsSnapshot.forEach(async (postDoc) => {
          const data = postDoc.data();
          // পুরনো (Firebase Storage যুগের) পোস্টের ভিডিও থাকলে সেটাও মুছে ফেলা হচ্ছে
          if (data.mediaStoragePath) {
            await deleteObject(storageRef(storage, data.mediaStoragePath)).catch(() => {});
          }
          // নতুন: Cloudinary-তে থাকা আসল ফাইলটাও ৭ দিন পর মুছে ফেলা হচ্ছে —
          // নাহলে শুধু Firestore-এর এন্ট্রি যেত, Cloudinary-তে জায়গা ভরেই থাকত
          if (data.mediaPublicId) {
            await deleteMediaFromCloudinary(data.mediaPublicId, data.mediaResourceType);
          }
          await deleteDoc(doc(db, "posts", postDoc.id)); 
        });
      } catch (error) {
        console.error("Storage Garbage Collection Error:", error);
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
  const handleFileChange = (e) => {
    const file = e.target.files[0]; // ⚡ Fixed: File object is being read correctly
    if (!file) return;

    if (file.type.startsWith('video/')) {
      // নতুন: শুধু ১০০MB সাইজ-সীমা চেক করা হচ্ছে (আপনার Cloudinary আপলোড প্রিসেট
      // অনুযায়ী) — ডিউরেশন-চেক আর দরকার নেই, তাই video metadata লোড করার
      // ঝামেলাও বাদ (আগে এখানেই HEVC-এর মতো ফরম্যাটে সমস্যা হতো)
      if (file.size > MAX_VIDEO_BYTES) {
        alert("This video is larger than 100MB. Please choose a smaller video file.");
        e.target.value = "";
        setSelectedFile(null);
        return;
      }
      setSelectedFile({ kind: 'video', file, previewUrl: URL.createObjectURL(file) });
    } else if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 800; // Cloudinary-তে আপলোড হবে বলে সামান্য বড় রেজোলিউশন রাখা হলো
          let width = img.width;
          let height = img.height;

          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          // নতুন: base64 স্ট্রিং না বানিয়ে সরাসরি Blob বানানো হচ্ছে — এটাই Cloudinary-তে আপলোড হবে
          canvas.toBlob((blob) => {
            setSelectedFile({ kind: 'image', blob, previewUrl: URL.createObjectURL(blob) });
          }, 'image/jpeg', 0.7);
        };
      };
      reader.readAsDataURL(file);
    }
  };
  const handlePost = async (e) => {
    e.preventDefault();
    if (!text.trim() && !mediaUrl.trim() && !selectedFile) return;

    setIsPosting(true);
    setUploadProgress(0);
    try {
      let finalMediaUrl = mediaUrl;
      let mediaPublicId = null;
      let mediaResourceType = null;

      if (selectedFile?.kind === 'video') {
        // নতুন: ভিডিও এখন সরাসরি Cloudinary-তে আপলোড হচ্ছে (কোনো কম্প্রেশন
        // ছাড়াই) — Firestore ডকুমেন্টে raw base64 গুঁজে দেওয়া হচ্ছে না, তাই
        // ১MB লিমিটে আটকায় না। সাইজ ইতিমধ্যে handleFileChange-এ ১০০MB-এর
        // মধ্যে যাচাই করা হয়েছে।
        const result = await uploadMediaToCloudinary(selectedFile.file, 'video', setUploadProgress);
        finalMediaUrl = result.url;
        mediaPublicId = result.publicId;
        mediaResourceType = result.resourceType;
      } else if (selectedFile?.kind === 'image') {
        // ছবিও এখন Cloudinary-তে আপলোড হচ্ছে (আগে ছিল base64 হিসেবে Firestore-এই)
        const result = await uploadMediaToCloudinary(selectedFile.blob, 'image', setUploadProgress);
        finalMediaUrl = result.url;
        mediaPublicId = result.publicId;
        mediaResourceType = result.resourceType;
      }

      await addDoc(collection(db, "posts"), {
        text,
        mediaUrl: finalMediaUrl,
        mediaPublicId, // নতুন: Cloudinary থেকে পরে মুছতে হলে এটা লাগবে
        mediaResourceType, // 'image' | 'video' | null
        mediaStoragePath: null, // পুরনো পোস্ট (Firebase Storage যুগের) cleanup-এর জন্য এখনো রাখা — নতুন পোস্টে ব্যবহার হয় না
        userName: auth.currentUser?.displayName || "Student",
        userId: auth.currentUser?.uid,
        likes: [],
        loves: [],
        wows: [],
        comments: [],
        createdAt: new Date().getTime()
      });
      setText('');
      setMediaUrl('');
      setSelectedFile(null);
      setShowPostModal(false);
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
        alert("Post link copied to clipboard! You can now share it in your messages.");
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

  const handleDeletePost = async (postId, mediaStoragePath, mediaPublicId, mediaResourceType) => {
    if (window.confirm("Are you sure you want to delete this post? This will empty its space from database permanently.")) {
      // পুরনো (Firebase Storage যুগের) পোস্ট হলে সেটাও মুছে ফেলা হচ্ছে
      if (mediaStoragePath) {
        await deleteObject(storageRef(storage, mediaStoragePath)).catch(() => {});
      }
      // নতুন: Cloudinary-তে থাকা আসল ফাইলটাও মুছে ফেলা হচ্ছে — প্রজেক্ট থেকে
      // ডিলিট করলে এখন Cloudinary থেকেও চলে যাবে
      if (mediaPublicId) {
        await deleteMediaFromCloudinary(mediaPublicId, mediaResourceType);
      }
      await deleteDoc(doc(db, "posts", postId));
    }
  };

  // নতুন: Cloudinary → প্রজেক্ট সিঙ্ক — কোনো পোস্টের ছবি/ভিডিও লোড হতে ব্যর্থ
  // হলে (সম্ভবত Cloudinary কনসোল থেকে সরাসরি মুছে ফেলা হয়েছে), প্রথমবার একটা
  // রিট্রাই দেওয়া হয় (transient নেটওয়ার্ক সমস্যার কারণে ভুলভাবে পোস্ট মুছে
  // যাওয়া এড়াতে) — দ্বিতীয়বারও ব্যর্থ হলে তখন নিশ্চিত হয়ে পোস্টটা Firestore
  // থেকে সরিয়ে ফেলা হয়।
  const handleMediaError = (e, post) => {
    const el = e.target;
    if (el.dataset.retried) {
      console.warn(`Media for post ${post.id} could not be loaded (likely deleted from Cloudinary directly) — removing the post.`);
      deleteDoc(doc(db, "posts", post.id)).catch(() => {});
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
  return (
    <div style={{ maxWidth: '500px', margin: 'auto', fontFamily: 'Arial', padding: '10px', minHeight: '80vh' }}>
      
      <style>{`
        .dynamic-post-card { background-color: #ffffff; border: 1px solid #eee; color: #333333; padding: 15px; border-radius: 8px; margin-bottom: 15px; }
        :root[data-theme='dark'] .dynamic-post-card { background-color: #111111; border: 1px solid #222; color: #ffffff; }
        .dynamic-post-card p { color: inherit; }
        :root[data-theme='dark'] .dynamic-post-card p { color: #f3f4f6; }
        :root[data-theme='dark'] .dynamic-post-card input { color: #ffffff !important; }

        /* 🔧 NEW: brief glow shown on the post opened via a shared "Copy Link" */
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

      {/* 🔧 NEW: if a shared link points to a post that no longer exists (e.g. it aged past
          the 7-day auto-delete window), let the visitor know instead of silently showing nothing. */}
      {targetPostId && posts.length > 0 && !posts.some(p => p.id === targetPostId) && (
        <div style={{ padding: '12px 15px', textAlign: 'center', color: '#dc3545', fontStyle: 'italic', border: '1px solid #dc3545', borderRadius: '8px', marginBottom: '15px' }}>
          এই পোস্টটি আর পাওয়া যাচ্ছে না। এটি মুছে ফেলা হয়ে থাকতে পারে।
        </div>
      )}

      {showPostModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000 }}>
          <div style={{ backgroundColor: 'var(--bg, #fff)', padding: '20px', borderRadius: '8px', width: '90%', maxWidth: '450px', position: 'relative', boxShadow: '0 4px 15px rgba(0,0,0,0.2)' }}>
            <button onClick={() => setShowPostModal(false)} style={{ position: 'absolute', top: '10px', right: '15px', background: 'none', border: 'none', color: 'var(--text-h, #333)', fontSize: '18px', cursor: 'pointer' }}>✕</button>
            <h3 style={{ marginBottom: '15px', color: '#0056b3', marginTop: 0, textAlign: 'center' }}>Create a Post</h3>
            
            <form onSubmit={handlePost}>
              <textarea value={text} onChange={e => setText(e.target.value)} placeholder="What's on your mind, Student?" style={{ width: '95%', height: '80px', padding: '8px', border: '1px solid var(--border, #ddd)', borderRadius: '5px', resize: 'none', outline: 'none', fontFamily: 'Arial', backgroundColor: 'transparent', color: 'inherit' }} />
              <input type="text" value={mediaUrl} onChange={e => setMediaUrl(e.target.value)} placeholder="Paste Photo/Video Link (Optional)" style={{ width: '95%', padding: '8px', marginTop: '10px', border: '1px solid var(--border, #ddd)', borderRadius: '5px', outline: 'none', backgroundColor: 'transparent', color: 'inherit' }} />
              
              <div style={{ marginTop: '12px', width: '95%' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: 'var(--text, #555)', marginBottom: '5px' }}>Upload from Device:</label>
                <input type="file" accept="image/*,video/*" onChange={handleFileChange} style={{ fontSize: '13px' }} />

                {selectedFile?.kind === 'video' && selectedFile.previewUrl && (
                  <div style={{ marginTop: '10px', textAlign: 'center' }}>
                    <video src={selectedFile.previewUrl} controls style={{ width: '160px', maxHeight: '120px', borderRadius: '4px', border: '1px solid #ddd' }} />
                    <small style={{ display: 'block', color: '#28a745', fontSize: '11px', marginTop: '2px' }}>✓ Video ready to post</small>
                  </div>
                )}
                {selectedFile?.kind === 'video' && !selectedFile.previewUrl && (
                  <div style={{ marginTop: '10px', textAlign: 'center' }}>
                    <small style={{ display: 'block', color: '#ffc107', fontSize: '11px' }}>⚠️ Preview unavailable, but the video is ready to post</small>
                  </div>
                )}
                {selectedFile?.kind === 'image' && (
                  <div style={{ marginTop: '10px', textAlign: 'center' }}>
                    <img src={selectedFile.previewUrl} alt="Preview" style={{ width: '80px', height: '60px', objectFit: 'cover', borderRadius: '4px', border: '1px solid #ddd' }} />
                    <small style={{ display: 'block', color: '#28a745', fontSize: '11px', marginTop: '2px' }}>✓ Image ready to post</small>
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
        // 🔧 FIX: proper DiceBear URL (was missing the `$` before `{...}`, so it
        // rendered as a literal, broken string instead of an interpolated URL).
        const postAvatarFallback = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(post.userName || 'Student')}`;
        return (
          <div
            key={post.id}
            id={`post-${post.id}`}
            className={`dynamic-post-card${highlightedPostId === post.id ? ' shared-highlight' : ''}`}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
              <img 
                src={usersCache[post.userId]?.photo || postAvatarFallback} 
                alt="" 
                style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover', border: '1px solid #0056b3', cursor: 'pointer' }} 
                onClick={() => { if (post.userId) window.location.href = `/profile/${post.userId}`; }}
              />
              <div>
                <strong style={{ display: 'block', fontSize: '14px', cursor: 'pointer' }} onClick={() => { if (post.userId) window.location.href = `/profile/${post.userId}`; }}>{post.userName}</strong>
                <small style={{ color: '#777', fontSize: '11px' }}>{new Date(post.createdAt).toLocaleDateString()}</small>
              </div>
              {(auth.currentUser?.uid === post.userId || isAdmin) && (
                <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', fontSize: '12px' }}>
                  <span onClick={() => handleDeletePost(post.id, post.mediaStoragePath, post.mediaPublicId, post.mediaResourceType)} style={{ color: '#ff3366', cursor: 'pointer' }}>Delete</span>
                </div>
              )}
            </div>

            {post.text && <p style={{ margin: '0 0 12px 0', fontSize: '14px', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>{post.text}</p>}
            
            {post.mediaUrl && (
              <div style={{ borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--border, #eee)', backgroundColor: 'rgba(0,0,0,0.02)', textAlign: 'center', marginBottom: '12px' }}>
                {post.mediaUrl.startsWith('data:video/') || post.mediaStoragePath || post.mediaResourceType === 'video' || post.mediaUrl.includes('/video/') || post.mediaUrl.endsWith('.mp4') ? (
                  // নতুন: ref দিয়ে videoRefs-এ রেজিস্টার করা হচ্ছে (একসাথে একটাই
                  // ভিডিও চলার জন্য), muted+playsInline (স্ক্রল-অটোপ্লের জন্য
                  // জরুরি — নাহলে ব্রাউজার ব্লক করে দেয়), আর onError দিয়ে
                  // Cloudinary থেকে সরাসরি মুছে ফেলা হলে পোস্টটাও এখান থেকে সরানো হয়
                  <video
                    ref={(el) => { if (el) videoRefs.current[post.id] = el; else delete videoRefs.current[post.id]; }}
                    src={post.mediaUrl}
                    controls
                    muted
                    playsInline
                    onPlay={(e) => {
                      // একটাই ভিডিও চলবে — এটা প্লে হওয়ার সাথে সাথে বাকি সব থেমে যাবে
                      Object.values(videoRefs.current).forEach((v) => {
                        if (v && v !== e.target && !v.paused) v.pause();
                      });
                    }}
                    onError={(e) => handleMediaError(e, post)}
                    style={{ maxWidth: '100%', maxHeight: '400px', width: '100%' }}
                  />
                ) : (
                  <img
                    src={post.mediaUrl}
                    alt="Post Content"
                    onClick={() => setExpandedImage(post.mediaUrl)}
                    onError={(e) => handleMediaError(e, post)}
                    style={{ maxWidth: '100%', maxHeight: '400px', objectFit: 'contain', cursor: 'zoom-in' }}
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
        <div style={{ padding: '20px', textAlign: 'center', color: '#888', fontStyle: 'italic' }}>
          No posts available on the feed.
        </div>
      )}

      {/* নতুন: ছবিতে ক্লিক করলে Facebook-স্টাইল বড় করে (lightbox) দেখানো হয় */}
      {expandedImage && (
        <div
          onClick={() => setExpandedImage(null)}
          style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.9)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out' }}
        >
          <img
            src={expandedImage}
            alt=""
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '95%', maxHeight: '95%', objectFit: 'contain', cursor: 'default' }}
          />
          <button
            onClick={() => setExpandedImage(null)}
            style={{ position: 'absolute', top: '20px', right: '20px', background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', fontSize: '20px', width: '40px', height: '40px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
