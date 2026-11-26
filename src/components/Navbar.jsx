// File Name: src/components/Navbar.jsx
import React, { useState, useEffect, useRef } from 'react'; 
import { Link, useNavigate, useLocation } from 'react-router-dom'; 
import { signOut } from 'firebase/auth'; 
import { auth, db } from '../firebase'; 
import { collection, query, where, onSnapshot } from 'firebase/firestore';

export default function Navbar({ isAdmin, theme, toggleTheme }) { 
  const [isSearchOpen, setIsSearchOpen] = useState(false); 
  const [searchId, setSearchId] = useState(''); 
  const navigate = useNavigate(); 
  const location = useLocation(); 
  const [showDropdown, setShowDropdown] = useState(false); 
  const [showSettingsSub, setShowSettingsSub] = useState(false);
  const [unreadTotal, setUnreadTotal] = useState(0);
  const roomsDocsRef = useRef([]);
  const pathnameRef = useRef(location.pathname);

  const currentUid = auth.currentUser?.uid;

  useEffect(() => {
    pathnameRef.current = location.pathname;
  }, [location.pathname]);

  const recomputeUnread = (docs, pathname) => {
    if (!currentUid) return;
    const chatMatch = (pathname || '').match(/^\/chat\/([^/]+)\//);
    const activeOtherUid = chatMatch && chatMatch[1] !== 'global' ? chatMatch[1] : null;
    const activeRoomId = activeOtherUid ? [currentUid, activeOtherUid].sort().join('_') : null;

    let count = 0;
    docs.forEach((docSnap) => {
      const data = docSnap.data();
      const roomId = docSnap.id;
      const lastReadKey = `lastRead_personal_${roomId}`;

      if (activeRoomId && roomId === activeRoomId) {
        localStorage.setItem(lastReadKey, String(Math.max(Date.now(), data.lastMessageAt || 0)));
        return;
      }

      const lastRead = Number(localStorage.getItem(lastReadKey)) || 0;
      if (data.lastMessageAt && data.lastMessageAt > lastRead && data.lastMessageSenderId !== currentUid) {
        count += 1;
      }
    });
    setUnreadTotal(count);
  };

  // Unread badge counter for messenger tab
  useEffect(() => {
    if (!currentUid) return;

    const q = query(
      collection(db, "personal-rooms"),
      where("participants", "array-contains", currentUid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      roomsDocsRef.current = snapshot.docs;
      recomputeUnread(snapshot.docs, pathnameRef.current);
    }, () => {});

    const handleReadUpdated = () => {
      recomputeUnread(roomsDocsRef.current, pathnameRef.current);
    };
    window.addEventListener('unreadReadUpdated', handleReadUpdated);

    return () => {
      unsubscribe();
      window.removeEventListener('unreadReadUpdated', handleReadUpdated);
    };
  }, [currentUid]);

  // ✅ When user navigates to a chat room, mark it as read and recompute badge immediately
  useEffect(() => {
    if (!currentUid) return;
    recomputeUnread(roomsDocsRef.current, location.pathname);
  }, [location.pathname, currentUid]);
  
  useEffect(() => { 
    const closeDropdown = () => { 
      setShowDropdown(false); 
      setShowSettingsSub(false); 
    }; 
    if (showDropdown) { 
      window.addEventListener('click', closeDropdown); 
    } 
    return () => window.removeEventListener('click', closeDropdown); 
  }, [showDropdown]); 

  const handleSearchSubmit = (e) => { 
    e.preventDefault(); 
    if (searchId.trim()) { 
      navigate(`/profile/${encodeURIComponent(searchId.trim())}`); 
      setSearchId(''); 
      setIsSearchOpen(false); 
    } 
  };

  const triggerPostModal = () => { 
    if (location.pathname === '/') {
      const event = new CustomEvent('openPostModal'); 
      window.dispatchEvent(event); 
    } else {
      navigate('/', { state: { openPostModal: true } });
    }
  }; 

  const isHome = location.pathname === '/' || location.pathname.startsWith('/post/');
  const isMessenger = location.pathname === '/messenger' || location.pathname.startsWith('/chat/');
  const isGlobalRoom = location.pathname === '/chat/global/Global-Chatroom';
  const isProfile = location.pathname === '/profile' || (location.pathname.startsWith('/profile/') && !location.pathname.includes('/edit'));
  const isAdminTab = location.pathname.startsWith('/admin');

  return ( 
    <header className="fb-lite-header">
      {/* ── Top Bar (FB Lite Blue Brand Header) ── */}
      <div style={{
        height: '46px',
        padding: '0 10px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid rgba(0, 0, 0, 0.08)',
        background: theme === 'dark' ? '#242526' : '#1877f2'
      }}>
        {/* Left: Brand & Back */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {location.pathname !== '/' && (
            <button
              onClick={() => navigate(-1)}
              style={{
                background: 'rgba(255, 255, 255, 0.2)',
                border: 'none',
                color: '#ffffff',
                width: '30px',
                height: '30px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                fontSize: '14px',
                padding: 0
              }}
              title="Go Back"
            >
              ←
            </button>
          )}

          <Link
            to="/"
            onClick={() => window.location.reload()}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              textDecoration: 'none',
              color: '#ffffff'
            }}
          >
            <span style={{
              background: '#ffffff',
              color: theme === 'dark' ? '#242526' : '#1877f2',
              fontWeight: '900',
              fontSize: '17px',
              width: '28px',
              height: '28px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              letterSpacing: '-0.5px'
            }}>
              SC
            </span>
            <span style={{
              fontWeight: '800',
              fontSize: '17px',
              letterSpacing: '-0.3px',
              display: 'inline-block'
            }}>
              StudentConnect
            </span>
          </Link>
        </div>

        {/* Right Action Icons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {/* Quick Search */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            {isSearchOpen ? (
              <form onSubmit={handleSearchSubmit} style={{ display: 'flex', alignItems: 'center' }}>
                <input
                  type="text"
                  placeholder="Search ID/Name..."
                  value={searchId}
                  onChange={(e) => setSearchId(e.target.value)}
                  autoFocus
                  style={{
                    padding: '4px 8px',
                    borderRadius: '16px',
                    border: 'none',
                    backgroundColor: '#ffffff',
                    color: '#050505',
                    outline: 'none',
                    fontSize: '12px',
                    width: '110px'
                  }}
                />
                <button
                  type="button"
                  onClick={() => setIsSearchOpen(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#ffffff',
                    marginLeft: '4px',
                    cursor: 'pointer',
                    fontSize: '14px'
                  }}
                >
                  ✕
                </button>
              </form>
            ) : (
              <button
                onClick={() => setIsSearchOpen(true)}
                style={{
                  background: 'rgba(255, 255, 255, 0.2)',
                  border: 'none',
                  color: '#ffffff',
                  width: '30px',
                  height: '30px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  fontSize: '13px',
                  padding: 0
                }}
                title="Search Student"
              >
                🔍
              </button>
            )}
          </div>

          {/* Quick Post Button */}
          <button
            onClick={triggerPostModal}
            style={{
              background: 'rgba(255, 255, 255, 0.2)',
              border: 'none',
              color: '#ffffff',
              width: '30px',
              height: '30px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontSize: '18px',
              fontWeight: 'bold',
              padding: 0,
              lineHeight: 1
            }}
            title="Create Post"
          >
            +
          </button>

          {/* APK download pill */}
          <a
            href="https://github.com/md-habibullah-git/Student-connect/releases/download/v1.0.0/app-debug.apk"
            target="_blank"
            rel="noreferrer"
            style={{
              backgroundColor: '#2e7d32',
              color: '#ffffff',
              padding: '4px 8px',
              borderRadius: '12px',
              textDecoration: 'none',
              fontWeight: 'bold',
              fontSize: '11px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '3px'
            }}
            title="Download Android APK"
          >
            📥 APK
          </a>

          {/* 3-dots Settings Menu */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => { setShowDropdown(!showDropdown); setShowSettingsSub(false); }}
              style={{
                background: 'rgba(255, 255, 255, 0.2)',
                border: 'none',
                color: '#ffffff',
                width: '30px',
                height: '30px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                fontSize: '16px',
                fontWeight: 'bold',
                padding: 0
              }}
              title="Menu & Settings"
            >
              ⋮
            </button>

            {showDropdown && (
              <div style={{
                position: 'absolute',
                top: '36px',
                right: 0,
                backgroundColor: theme === 'dark' ? '#242526' : '#ffffff',
                borderRadius: '8px',
                boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
                border: theme === 'dark' ? '1px solid #393a3b' : '1px solid #ccd0d5',
                minWidth: '200px',
                zIndex: 2000,
                overflow: 'hidden'
              }}>
                <button
                  onClick={() => setShowSettingsSub(!showSettingsSub)}
                  style={{
                    width: '100%',
                    padding: '11px 16px',
                    background: 'none',
                    border: 'none',
                    color: theme === 'dark' ? '#e4e6eb' : '#050505',
                    fontSize: '13px',
                    fontWeight: '600',
                    textAlign: 'left',
                    cursor: 'pointer',
                    borderBottom: theme === 'dark' ? '1px solid #393a3b' : '1px solid #f0f2f5',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <span>⚙️ Account Settings</span>
                  <span style={{ fontSize: '10px', color: '#888' }}>{showSettingsSub ? '▲' : '▼'}</span>
                </button>

                {showSettingsSub && (
                  <div style={{ background: theme === 'dark' ? '#18191a' : '#f0f2f5' }}>
                    <button
                      onClick={() => { navigate('/edit-profile'); setShowDropdown(false); setShowSettingsSub(false); }}
                      style={{
                        width: '100%',
                        padding: '9px 16px 9px 28px',
                        background: 'none',
                        border: 'none',
                        color: theme === 'dark' ? '#2d88ff' : '#1877f2',
                        fontSize: '13px',
                        fontWeight: '600',
                        textAlign: 'left',
                        cursor: 'pointer',
                        borderBottom: theme === 'dark' ? '1px solid #393a3b' : '1px solid #e4e6eb'
                      }}
                    >
                      📝 Edit ID Card Info
                    </button>
                    <button
                      onClick={() => { navigate('/change-password'); setShowDropdown(false); setShowSettingsSub(false); }}
                      style={{
                        width: '100%',
                        padding: '9px 16px 9px 28px',
                        background: 'none',
                        border: 'none',
                        color: '#fa383e',
                        fontSize: '13px',
                        fontWeight: '600',
                        textAlign: 'left',
                        cursor: 'pointer',
                        borderBottom: theme === 'dark' ? '1px solid #393a3b' : '1px solid #e4e6eb'
                      }}
                    >
                      🔒 Change Password
                    </button>
                  </div>
                )}

                <button
                  onClick={toggleTheme}
                  style={{
                    width: '100%',
                    padding: '11px 16px',
                    background: 'none',
                    border: 'none',
                    color: theme === 'dark' ? '#e4e6eb' : '#050505',
                    fontSize: '13px',
                    fontWeight: '600',
                    textAlign: 'left',
                    cursor: 'pointer',
                    borderBottom: theme === 'dark' ? '1px solid #393a3b' : '1px solid #f0f2f5'
                  }}
                >
                  {theme === 'light' ? '🌙 Dark Mode' : '☀️ Light Mode'}
                </button>

                <button
                  onClick={async () => {
                    try {
                      await signOut(auth);
                      navigate('/login');
                    } catch (err) {
                      console.error("Logout Error:", err);
                    }
                    setShowDropdown(false);
                  }}
                  style={{
                    width: '100%',
                    padding: '11px 16px',
                    background: 'none',
                    border: 'none',
                    color: '#fa383e',
                    fontSize: '13px',
                    fontWeight: 'bold',
                    textAlign: 'left',
                    cursor: 'pointer'
                  }}
                >
                  🏃‍♂️ Log Out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Bottom Navigation Tabs (Iconic FB Lite Navigation Bar) ── */}
      <nav style={{
        display: 'flex',
        height: '42px',
        backgroundColor: theme === 'dark' ? '#242526' : '#ffffff',
        borderBottom: theme === 'dark' ? '1px solid #393a3b' : '1px solid #ccd0d5'
      }}>
        {/* Tab 1: Home / News Feed */}
        <Link
          to="/"
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: isHome ? (theme === 'dark' ? '#2d88ff' : '#1877f2') : (theme === 'dark' ? '#b0b3b8' : '#65676b'),
            borderBottom: isHome ? `3px solid ${theme === 'dark' ? '#2d88ff' : '#1877f2'}` : '3px solid transparent',
            textDecoration: 'none',
            fontSize: '18px',
            position: 'relative'
          }}
          title="News Feed"
        >
          <span style={{ fontSize: '19px' }}>📰</span>
        </Link>

        {/* Tab 2: Messenger */}
        <Link
          to="/messenger"
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: (isMessenger && !isGlobalRoom) ? (theme === 'dark' ? '#2d88ff' : '#1877f2') : (theme === 'dark' ? '#b0b3b8' : '#65676b'),
            borderBottom: (isMessenger && !isGlobalRoom) ? `3px solid ${theme === 'dark' ? '#2d88ff' : '#1877f2'}` : '3px solid transparent',
            textDecoration: 'none',
            fontSize: '18px',
            position: 'relative'
          }}
          title="Messages"
        >
          <span style={{ fontSize: '19px' }}>💬</span>
          {unreadTotal > 0 && (
            <span style={{
              position: 'absolute',
              top: '4px',
              right: '25%',
              backgroundColor: '#fa383e',
              color: '#ffffff',
              fontSize: '10px',
              fontWeight: 'bold',
              minWidth: '16px',
              height: '16px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 3px'
            }}>
              {unreadTotal > 9 ? '9+' : unreadTotal}
            </span>
          )}
        </Link>

        {/* Tab 3: Global Room / Conference */}
        <Link
          to="/chat/global/Global-Chatroom"
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: isGlobalRoom ? (theme === 'dark' ? '#2d88ff' : '#1877f2') : (theme === 'dark' ? '#b0b3b8' : '#65676b'),
            borderBottom: isGlobalRoom ? `3px solid ${theme === 'dark' ? '#2d88ff' : '#1877f2'}` : '3px solid transparent',
            textDecoration: 'none',
            fontSize: '18px',
            position: 'relative'
          }}
          title="Campus Global Conference"
        >
          <span style={{ fontSize: '19px' }}>🌐</span>
        </Link>

        {/* Tab 4: Student ID Profile */}
        <Link
          to="/profile"
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: isProfile ? (theme === 'dark' ? '#2d88ff' : '#1877f2') : (theme === 'dark' ? '#b0b3b8' : '#65676b'),
            borderBottom: isProfile ? `3px solid ${theme === 'dark' ? '#2d88ff' : '#1877f2'}` : '3px solid transparent',
            textDecoration: 'none',
            fontSize: '18px',
            position: 'relative'
          }}
          title="Student ID Profile"
        >
          <span style={{ fontSize: '19px' }}>🪪</span>
        </Link>

        {/* Tab 5: Admin Panel (If user is Admin) */}
        {isAdmin && (
          <Link
            to="/admin"
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: isAdminTab ? '#f7b125' : (theme === 'dark' ? '#b0b3b8' : '#65676b'),
              borderBottom: isAdminTab ? '3px solid #f7b125' : '3px solid transparent',
              textDecoration: 'none',
              fontSize: '18px',
              position: 'relative'
            }}
            title="Admin Console"
          >
            <span style={{ fontSize: '19px' }}>🛡️</span>
          </Link>
        )}
      </nav>
    </header>
  ); 
}
