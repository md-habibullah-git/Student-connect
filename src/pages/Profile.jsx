import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { useParams, useNavigate } from 'react-router-dom';

export default function Profile() {
  const { userId } = useParams(); 
  const navigate = useNavigate();
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);

  // 📱 Detect mobile screen size to adjust layouts
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const usersRef = collection(db, "users");

    const unsubscribe = onSnapshot(usersRef, (snapshot) => {
      const allData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      const activeProfiles = allData.filter(user => {
        const isDeletedStatus = user.approved === "deleted";
        const isRemovedName = user.name === "Removed User";
        return !isDeletedStatus && !isRemovedName;
      });
      
      if (userId) {
        const searchKey = decodeURIComponent(userId).toLowerCase().trim();
        
        const matched = activeProfiles.filter(p => {
          const docId = String(p.id || '').toLowerCase().trim();
          const userUid = String(p.uid || '').toLowerCase().trim();
          const userName = String(p.name || '').toLowerCase().trim();
          const idNoField = String(p.idNo || '').toLowerCase().trim();
          
          return docId.includes(searchKey) || 
                 userUid.includes(searchKey) || 
                 userName.includes(searchKey) || 
                 idNoField.includes(searchKey);
        });
        setProfiles(matched);
      } else {
        setProfiles(activeProfiles);
      }
      setLoading(false);
    }, (error) => {
      console.error("Profile Sync Error:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [userId]);
  const handleCopyProfileLink = (targetId) => {
    const shareUrl = `${window.location.origin}/profile/${targetId}`;
    navigator.clipboard.writeText(shareUrl)
      .then(() => {
        alert("📋 The unique link of the ID card has been successfully copied! It can now be shared on any platform.");
      })
      .catch((err) => {
        console.error("Link copy failed: ", err);
      });
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh', color: '#00ffff', backgroundColor: '#1a1f29', fontFamily: 'Arial', fontSize: '15px', fontWeight: 'bold' }}>
        🪪 Loading Campus ID Cards...
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', justifyContent: 'center', alignItems: 'center', padding: isMobile ? '15px 10px' : '25px 40px', boxSizing: 'border-box', backgroundColor: 'var(--bg)', minHeight: '90vh' }}>
      
      <svg style={{ position: 'absolute', width: 0, height: 0 }}>
        <defs>
          <clipPath id="rounded-hex-view" clipPathUnits="objectBoundingBox">
            <path d="M 0.5,0 C 0.53,0 0.57,0.02 0.59,0.03 L 0.96,0.22 C 0.99,0.24 1,0.27 1,0.31 L 1,0.69 C 1,0.73 0.99,0.76 0.96,0.78 L 0.59,0.97 C 0.57,0.98 0.53,1 0.5,1 C 0.47,1 0.43,0.98 0.41,0.97 L 0.04,0.78 C 0.01,0.76 0,0.73 0,0.69 L 0,0.31 C 0,0.27 0.01,0.24 0.04,0.22 L 0.41,0.03 C 0.43,0.02 0.47,0 0.5,0 Z" />
          </clipPath>
        </defs>
      </svg>
      {profiles.map(user => {
        const isCurrentUser = auth.currentUser?.uid === user.id || auth.currentUser?.uid === user.uid;
        const profileUniqueId = user.uid || user.id || '';

        const fallbackAvatar = `https://dicebear.com{encodeURIComponent(user.name || 'Student')}`;
        
        let userPhotoUrl = fallbackAvatar;
        if (user.photo) {
          userPhotoUrl = user.photo.startsWith('data:image/') ? user.photo : user.photo.replace('=s96-c', '=s400-c');
        }

        return (
          <div key={user.id} style={{ width: '100%', maxWidth: '750px', backgroundColor: 'var(--bg)', borderRadius: '20px', boxShadow: 'var(--shadow)', overflow: 'hidden', display: 'flex', flexWrap: 'wrap', border: '1px solid var(--border)', position: 'relative' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '5px', backgroundColor: '#0056b3' }}></div>
            
            {/* Left Box Container */}
            <div style={{ width: isMobile ? '100%' : '270px', flexShrink: 0, background: 'linear-gradient(180deg, #022340 0%, #053c69 50%, #011627 100%)', padding: '15px 3px 25px 3px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-around', textAlign: 'center', position: 'relative', boxSizing: 'border-box' }}>
              
              <div style={{ 
                position: 'relative', 
                width: '216px', 
                height: '250px', 
                clipPath: 'url(#rounded-hex-view)', 
                background: 'linear-gradient(135deg, #00c6ff 0%, #0072ff 100%)',
                padding: '4px',
                boxSizing: 'border-box',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center'
              }}>
                <div style={{
                  width: '100%',
                  height: '100%',
                  clipPath: 'url(#rounded-hex-view)',
                  backgroundColor: '#011627',
                  overflow: 'hidden'
                }}>
                  <img 
                    src={userPhotoUrl} 
                    alt={user.name || "Student"} 
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                  />
                </div>
                
                <div style={{ position: 'absolute', bottom: '-4px', left: '50%', transform: 'translateX(-50%)', width: '28px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, filter: 'drop-shadow(0px 3px 6px rgba(0,255,255,0.45))' }}>
                  <svg width="28" height="30" viewBox="0 0 24 24" fill="none" xmlns="http://w3.org">
                    <path d="M12 2L3 5V11C3 16.55 6.84 21.74 12 23C17.16 21.74 21 16.55 21 11V5 L12 2Z" fill="#00ffff" stroke="#053c69" strokeWidth="2" strokeLinejoin="round"/>
                    <path d="M9 12L11 14L15 10" stroke="#011627" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              </div>

              <div style={{ marginTop: '10px', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 8px' }}>
                <h2 style={{ margin: '0 0 2px 0', color: '#ffffff', fontSize: '19px', fontWeight: 'bold', letterSpacing: '0.3px' }}>{user.name}</h2>
                
                <div style={{ display: 'inline-block', textAlign: 'center', marginBottom: '0px' }}>
                  <p style={{ margin: 0, fontSize: '11px', color: '#00ffff', fontStyle: 'italic', opacity: 0.9, paddingBottom: '0px' }}>F. Name: {user.fatherName || 'N/A'}</p>
                  <div style={{ display: 'block', width: '100%', padding: '0px', marginTop: '2px', background: 'rgba(0, 255, 255, 0.5)', borderRadius: '15px', minWidth: '80px', height: '1.5px', boxSizing: 'border-box' }} />
                </div>
                
                <span style={{ background: 'rgba(0, 255, 255, 0.05)', border: '1px solid rgba(0, 255, 255, 0.3)', color: '#00ffff', padding: '3px 18px', borderRadius: '25px', display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '10px', fontWeight: 'bold', letterSpacing: '1.2px', textTransform: 'uppercase', marginTop: '6px', marginBottom: '8px' }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="10" r="3"/><path d="M7 20.662V19a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v1.662"/></svg>
                  {String(user.role || 'Student').toUpperCase()}
                </span>
              </div>

              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', zIndex: 5, gap: '8px' }}>
                <button 
                  onClick={() => {
                    if (isCurrentUser) {
                      navigate('/messenger');
                    } else {
                      navigate(`/chat/${profileUniqueId}/${encodeURIComponent(user.name || 'Student')}`);
                    }
                  }}
                  style={{ width: '92%', padding: '7px', background: 'linear-gradient(135deg, #00c6ff 0%, #0072ff 100%)', color: '#ffffff', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', boxShadow: '0 4px 12px rgba(0,114,255,0.25)' }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>
                  {isCurrentUser ? "Open Messenger" : "Message & Calls"}
                </button>
              </div>
            </div>
            {/* 👉 Right Details Box Customized to auto-fit mobile screens perfectly */}
            <div style={{ flex: 1.3, minWidth: isMobile ? '100%' : '280px', padding: isMobile ? '15px 12px 12px 12px' : '15px 25px 12px 25px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '6px', backgroundColor: 'var(--code-bg)', color: 'var(--text)', overflow: 'hidden', boxSizing: 'border-box' }}>
              {[
                { label: "College/University:", value: user.idNo || 'N/A', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>, bg: '#e8f0fe', color: '#1a73e8' },
                { label: "Department:", value: user.dept || 'N/A', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c0 2 2 3 6 3s6-1 6 3v-5"/></svg>, bg: '#e6f4ea', color: '#137333' },
                { label: "Class/Year:", value: user.studentClass || 'Honours 3rd Year (Science)', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5z"/></svg>, bg: '#f3e5f5', color: '#6a1b9a' },
                { label: "Session/Batch:", value: user.batch || user.session || 'N/A', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 21h18M3 10h18M5 10V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v5M10 21V14h4v7"/></svg>, bg: '#fef7e0', color: '#b06000' },
                { label: "Blood Group:", value: user.bloodGroup || user.blood || 'N/A', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>, bg: '#fce8e6', color: '#d9383a', isCritical: true },
                { label: "Mobile Number:", value: user.phone || user.mobile || 'N/A', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.79 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 .7 2.81A2 2 0 0 1 22 16.92z"/></svg>, bg: '#e8f0fe', color: '#1a73e8' },
                { label: "Personal Email:", value: user.email || 'N/A', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>, bg: '#f3e5f5', color: '#6a1b9a' }
              ].map((item, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', backgroundColor: 'var(--bg)', padding: isMobile ? '5px 8px' : '5px 12px', borderRadius: '12px', border: '1px solid var(--border)', boxShadow: '0 2px 4px rgba(0,0,0,0.01)' }}>
                  <div style={{ width: '28px', height: '28px', borderRadius: '8px', backgroundColor: item.bg, color: item.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginRight: isMobile ? '6px' : '12px' }}>
                    {item.icon}
                  </div>
                  <span style={{ width: isMobile ? '85px' : '105px', color: 'var(--text)', fontSize: isMobile ? '11px' : '13px', fontWeight: '600' }}>{item.label}</span>
                  <div style={{ width: '1px', height: '14px', backgroundColor: 'var(--border)', marginRight: isMobile ? '6px' : '12px' }}></div>
                  <strong style={{ color: item.isCritical ? '#d9383a' : 'var(--text-h)', fontSize: isMobile ? '11px' : '13px', fontWeight: '700', wordBreak: 'break-all' }}>{item.value}</strong>
                </div>
              ))}
              
              <div style={{ display: 'flex', gap: '12px', marginTop: '12px', fontSize: '12px', fontWeight: 'bold', alignItems: 'center', justifyContent: 'center', borderTop: '1px solid var(--border)', paddingTop: '10px', flexWrap: 'wrap' }}>
                <a 
                  href={(() => {
                    const fbData = (user.fbLink || '').trim();
                    if (!fbData) return "https://facebook.com";
                    return fbData.includes('facebook.com') ? fbData : `https://facebook.com{fbData}`;
                  })()} 
                  target="_blank" 
                  rel="noreferrer" 
                  style={{ color: '#1877f2', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '5px', backgroundColor: 'var(--social-bg)', padding: '5px 12px', borderRadius: '20px', border: '1px solid var(--border)' }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                  Facebook
                </a>

                <a 
                  href={(() => {
                    let instaData = (user.instaLink || '').trim();
                    if (!instaData) return "https://instagram.com";
                    if (instaData.includes('instagram.com')) return instaData;
                    if (instaData.startsWith('@')) instaData = instaData.substring(1);
                    return `https://instagram.com{instaData}`;
                  })()} 
                  target="_blank" 
                  rel="noreferrer"
                  style={{ color: '#e1306c', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '5px', backgroundColor: 'var(--social-bg)', padding: '5px 12px', borderRadius: '20px', border: '1px solid var(--border)' }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204 0.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.051.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/></svg>
                  Instagram
                </a>

                <button 
                  onClick={() => handleCopyProfileLink(profileUniqueId)}
                  style={{ color: 'var(--text)', backgroundColor: 'var(--social-bg)', padding: '5px 12px', borderRadius: '20px', border: '1px solid var(--border)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', fontWeight: 'bold' }}
                >
                  🔗 Copy Link
                </button>
              </div>

              <div style={{ textAlign: 'center', marginTop: '10px', opacity: 0.7, fontSize: '11px', fontStyle: 'italic' }}>
                "Discipline Today, Success Tomorrow."
              </div>

            </div>
          </div>
        );
      })}
    </div>
  );
}
