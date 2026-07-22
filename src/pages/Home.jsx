import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
import { 
  collection, addDoc, query, onSnapshot, doc, updateDoc, 
  arrayUnion, arrayRemove, deleteDoc, getDocs, where 
} from 'firebase/firestore';

const commentFormStyle = { display: 'flex', marginTop: '8px', position: 'relative', width: '100%', alignItems: 'center' };
const commentInputStyle = { width: '100%', padding: '8px 40px 8px 10px', fontSize: '13px', borderRadius: '20px', border: '1px solid var(--border, #ccc)', backgroundColor: 'transparent', outline: 'none', boxSizing: 'border-box' };
const commentIconBtnStyle = { position: 'absolute', right: '10px', background: 'none', border: 'none', color: '#0056b3', cursor: 'pointer', fontSize: '16px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' };

export default function Home({ isAdmin }) {
  const [posts, setPosts] = useState([]);
  const [text, setText] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [selectedFile, setSelectedFile] = useState(null); 
  const [commentInput, setCommentInput] = useState({});
  const [showPostModal, setShowPostModal] = useState(false);
  const [editingComment, setEditingComment] = useState(null);
  const [usersCache, setUsersCache] = useState({});
  const [visibleComments, setVisibleComments] = useState({});
  const [activeReactionPopup, setActiveReactionPopup] = useState(null);
  useEffect(() => {
    const cleanupOldPosts = async () => {
      try {
        const sevenDaysAgo = new Date().getTime() - (7 * 24 * 60 * 60 * 1000);
        const qOld = query(collection(db, "posts"), where("createdAt", "<", sevenDaysAgo));
        const oldPostsSnapshot = await getDocs(qOld);
        oldPostsSnapshot.forEach(async (postDoc) => {
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
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        window.URL.revokeObjectURL(video.src);
        if (video.duration > 60) {
          alert("Error: Video duration cannot exceed 1 minute!");
          e.target.value = ""; 
          setSelectedFile(null);
        } else {
          const reader = new FileReader();
          reader.onload = (event) => {
            setSelectedFile(event.target.result);
          };
          reader.readAsDataURL(file);
        }
      };
      video.src = URL.createObjectURL(file);
    } else if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 500;
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
          
          const compressedBase64 = canvas.toDataURL('image/jpeg', 0.6);
          setSelectedFile(compressedBase64);
        };
      };
      reader.readAsDataURL(file);
    } else {
      setSelectedFile(file);
    }
  };
  const handlePost = async (e) => {
    e.preventDefault();
    if (!text.trim() && !mediaUrl.trim() && !selectedFile) return;

    let finalMediaUrl = mediaUrl;
    if (selectedFile) {
      finalMediaUrl = selectedFile;
    }

    if (finalMediaUrl && finalMediaUrl.length > 1048480) {
      alert("🚨 Video size is too large! Please reduce your resolution or shorten it before uploading.");
      return;
    }

    try {
      await addDoc(collection(db, "posts"), {
        text,
        mediaUrl: finalMediaUrl,
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
    }
  };

  const handleEditPost = async (postId, currentText) => {
    const promptText = prompt("Edit your post text:", currentText);
    if (promptText === null || promptText.trim() === "") return;
    try {
      await updateDoc(doc(db, "posts", postId), { text: promptText });
    } catch (error) {
      console.error("Error editing post: ", error);
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

  const handleDeletePost = async (postId) => {
    if (window.confirm("Are you sure you want to delete this post? This will empty its space from database permanently.")) {
      await deleteDoc(doc(db, "posts", postId));
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
                
                {selectedFile && (
                  <div style={{ marginTop: '10px', textAlign: 'center' }}>
                    {selectedFile.startsWith('data:video/') ? (
                      <span style={{ color: '#28a745', fontSize: '12px', fontWeight: 'bold' }}>✓ Video Loaded (Ready to Post)</span>
                    ) : selectedFile.startsWith('data:image/') ? (
                      <div>
                        <img src={selectedFile} alt="Compressed Preview" style={{ width: '80px', height: '60px', objectFit: 'cover', borderRadius: '4px', border: '1px solid #ddd' }} />
                        <small style={{ display: 'block', color: '#28a745', fontSize: '11px', marginTop: '2px' }}>✓ Image Auto-Compressed</small>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
              <button type="submit" style={{ width: '100%', marginTop: '15px', padding: '10px', backgroundColor: '#0056b3', color: '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>Post to Feed</button>
            </form>
          </div>
        </div>
      )}
      {posts.map(post => {
        const postAvatarFallback = `https://dicebear.com{encodeURIComponent(post.userName || 'Student')}`;
        return (
          <div key={post.id} className="dynamic-post-card">
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
                  <span onClick={() => handleEditPost(post.id, post.text)} style={{ color: '#0072ff', cursor: 'pointer' }}>Edit</span>
                  <span onClick={() => handleDeletePost(post.id)} style={{ color: '#ff3366', cursor: 'pointer' }}>Delete</span>
                </div>
              )}
            </div>

            {post.text && <p style={{ margin: '0 0 12px 0', fontSize: '14px', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>{post.text}</p>}
            
            {post.mediaUrl && (
              <div style={{ borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--border, #eee)', backgroundColor: 'rgba(0,0,0,0.02)', textAlign: 'center', marginBottom: '12px' }}>
                {post.mediaUrl.startsWith('data:video/') || post.mediaUrl.includes('video/') || post.mediaUrl.endsWith('.mp4') ? (
                  <video src={post.mediaUrl} controls style={{ maxWidth: '100%', maxHeight: '400px', width: '100%' }} />
                ) : (
                  <img src={post.mediaUrl} alt="Post Content" style={{ maxWidth: '100%', maxHeight: '400px', objectFit: 'contain' }} />
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
                        const defaultAvatar = `https://dicebear.com{encodeURIComponent(usersCache[uid]?.name || 'Student')}`;
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
                        const defaultAvatar = `https://dicebear.com{encodeURIComponent(usersCache[uid]?.name || 'Student')}`;
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
                        const defaultAvatar = `https://dicebear.com{encodeURIComponent(usersCache[uid]?.name || 'Student')}`;
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
              <button onClick={() => handleShare(post.id)} style={{ flex: 1, background: 'none', border: 'none', padding: '8px', cursor: 'pointer', fontWeight: 'bold', color: 'inherit', opacity: 0.7, fontSize: '13px' }}>🔗 Share</button>
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
                  const defaultAvatar = `https://dicebear.com{encodeURIComponent(usersCache[commentUid]?.name || fallbackKey)}`;

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
    </div>
  );
}
