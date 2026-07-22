import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom'; 
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';

export default function Navbar({ isAdmin, theme, toggleTheme }) {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchId, setSearchId] = useState('');
  const navigate = useNavigate();
  const location = useLocation(); 

  const [showDropdown, setShowDropdown] = useState(false);
  const [showSettingsSub, setShowSettingsSub] = useState(false);

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
      navigate(`/profile/${searchId}`);
      setSearchId('');
      setIsSearchOpen(false);
    }
  };

  const triggerPostModal = () => {
    const event = new CustomEvent('openPostModal');
    window.dispatchEvent(event);
  };
  return (
    <nav style={{
      background: 'linear-gradient(135deg, #a832ff 0%, #7016ff 100%)', 
      padding: '10px 15px', 
      display: 'flex', 
      justifyContent: 'space-between', 
      alignItems: 'center',
      position: 'sticky',
      top: 0,
      zIndex: 1000,
      boxShadow: '0 3px 10px rgba(112, 22, 255, 0.25)', 
      height: '50px'
    }}>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', zIndex: 10 }}>
        
        <button 
          onClick={() => navigate(-1)} 
          style={{ background: 'rgba(255,255,255,0.25)', border: 'none', color: 'white', padding: '4px 10px', borderRadius: '20px', cursor: 'pointer', fontWeight: 'bold', fontSize: '11px', whiteSpace: 'nowrap', transition: 'background 0.2s' }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.35)'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.25)'}
        >
          ⬅️ Back
        </button>

        <Link to="/" style={{ color: 'white', textDecoration: 'none', fontWeight: 'bold', fontSize: '18px', whiteSpace: 'nowrap', letterSpacing: '0.3px' }}>
          🎓 StudentConnect
        </Link>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
            
            <button 
              onClick={() => setIsSearchOpen(!isSearchOpen)} 
              style={{ background: 'rgba(255,255,255,0.25)', border: 'none', color: 'white', fontSize: '14px', cursor: 'pointer', width: '28px', height: '28px', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 0, transition: 'background 0.2s' }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.35)'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.25)'}
            >
              🔍
            </button>
            
            {isSearchOpen && (
              <form onSubmit={handleSearchSubmit} style={{ marginLeft: '5px' }}>
                <input 
                  type="text" 
                  placeholder="Search ID..." 
                  value={searchId}
                  onChange={(e) => setSearchId(e.target.value)}
                  style={{ 
                    padding: '4px 8px', 
                    borderRadius: '4px', 
                    border: '1px solid rgba(255,255,255,0.4)', 
                    backgroundColor: 'rgba(255,255,255,0.15)', 
                    color: 'white', 
                    outline: 'none',
                    fontSize: '13px'
                  }}
                />
              </form>
            )}
          </div>

          <button 
            onClick={triggerPostModal}
            style={{ 
              background: 'rgba(255,255,255,0.25)', 
              border: 'none', 
              color: 'white', 
              fontSize: '16px', 
              cursor: 'pointer', 
              width: '28px', 
              height: '28px', 
              borderRadius: '50%', 
              display: 'flex', 
              justifyContent: 'center', 
              alignItems: 'center', 
              padding: 0,
              fontWeight: 'bold',
              transition: 'background 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.35)'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.25)'}
          >
            +
          </button>
        </div>
      </div>
      <div style={{ 
        position: 'absolute',
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex', 
        gap: '30px', 
        alignItems: 'center', 
        justifyContent: 'center',
        height: '100%' 
      }}>
        
        <Link 
          to="/" 
          style={{ 
            color: 'white', 
            textDecoration: 'none', 
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '60px',
            height: '100%',
            position: 'relative'
          }} 
          title="Home"
        >
          <div style={{
            background: location.pathname === '/' ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.25)',
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background 0.2s'
          }}>
            <svg xmlns="http://w3.org" width="20" height="22" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" fill="#FFD700" />
              <path d="M12 7.2l4.5 4v5.3a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-5.3l4.5-4z" fill="#7016ff" />
              <path d="M11 13.5h2v3h-2z" fill="#FFD700" />
            </svg>
          </div>
          {location.pathname === '/' && (
            <div style={{ position: 'absolute', bottom: '5px', left: '50%', transform: 'translateX(-50%)', width: '50px', height: '4px', backgroundColor: '#000000', borderRadius: '3px' }} />
          )}
        </Link>
        <Link 
          to="/messenger" 
          style={{ 
            color: 'white', 
            textDecoration: 'none', 
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '60px',
            height: '100%',
            position: 'relative'
          }} 
          title="Chat"
        >
          <div style={{
            background: (location.pathname.startsWith('/messenger') || location.pathname.startsWith('/chat')) ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.25)',
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background 0.2s'
          }}>
            <svg xmlns="http://w3.org" width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" fill="#7016ff" />
              <path d="M6 6h12v2H6zm0 3.5h12v2H6zm0 3.5h8v2H6z" fill="#ffffff" />
            </svg>
          </div>
          {(location.pathname.startsWith('/messenger') || location.pathname.startsWith('/chat')) && (
            <div style={{ position: 'absolute', bottom: '5px', left: '50%', transform: 'translateX(-50%)', width: '50px', height: '4px', backgroundColor: '#000000', borderRadius: '3px' }} />
          )}
        </Link>
        <Link 
          to="/profile" 
          style={{ 
            color: 'white', 
            textDecoration: 'none', 
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '60px',
            height: '100%',
            position: 'relative'
          }} 
          title="ID Profile"
        >
          <div style={{
            background: (location.pathname === '/profile' || location.pathname.startsWith('/profile/') && !location.pathname.includes('/edit')) ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.25)',
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background 0.2s'
          }}>
            <svg xmlns="http://w3.org" width="22" height="22" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" fill="#9370DB" />
              <circle cx="12" cy="9" r="3" fill="#ffffff" />
              <path d="M12 14c-2.7 0-5 1.5-6 3.5 1.2 2.1 3.5 3.5 6 3.5s4.8-1.4 6-3.5c-1-2-3.3-3.5-6-3.5z" fill="#ffffff" />
            </svg>
          </div>
          {(location.pathname === '/profile' || location.pathname.startsWith('/profile/') && !location.pathname.includes('/edit')) && (
            <div style={{ position: 'absolute', bottom: '5px', left: '50%', transform: 'translateX(-50%)', width: '50px', height: '4px', backgroundColor: '#000000', borderRadius: '3px' }} />
          )}
        </Link>
        {isAdmin && (
          <Link 
            to="/admin" 
            style={{ 
              color: '#ffeb3b', 
              textDecoration: 'none', 
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '60px',
              height: '100%',
              position: 'relative'
            }} 
            title="Admin"
          >
            <div style={{
              background: location.pathname.startsWith('/admin') ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.25)',
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.2s'
            }}>
              <svg xmlns="http://w3.org" width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 12z" fill="#7016ff" />
                <circle cx="12" cy="9.5" r="2.5" fill="#FFFF00" />
                <path d="M8 15.5c0-1.5 2-2.5 4-2.5s4 1 4 2.5v1H8v-1.5z" fill="#FFFF00" />
              </svg>
            </div>
            {location.pathname.startsWith('/admin') && (
              <div style={{ position: 'absolute', bottom: '5px', left: '50%', transform: 'translateX(-50%)', width: '50px', height: '4px', backgroundColor: '#000000', borderRadius: '3px' }} />
            )}
          </Link>
        )}
      </div>
      <div style={{ display: 'flex', gap: '15px', alignItems: 'center', zIndex: 10 }}>

        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
          <button 
            onClick={() => {
              setShowDropdown(!showDropdown);
              setShowSettingsSub(false); 
            }}
            style={{ background: 'none', border: 'none', color: '#fff', fontSize: '24px', cursor: 'pointer', padding: '0 5px', display: 'flex', alignItems: 'center', outline: 'none', fontWeight: 'bold' }}
            title="Menu"
          >
            ⋮
          </button>
          
          {showDropdown && (
            /* 🎯 Live Update: Listening to theme data to fix the background as plain white (#fff) in live mode and dynamic black (#1e1e1e) in dark mode */
            <div style={{ 
              position: 'absolute', 
              top: '35px', 
              right: '0', 
              backgroundColor: theme === 'dark' ? '#1e1e1e' : '#ffffff', 
              borderRadius: '6px', 
              boxShadow: theme === 'dark' ? '0 4px 20px rgba(0,0,0,0.5)' : '0 4px 12px rgba(0,0,0,0.15)', 
              border: theme === 'dark' ? '1px solid #333333' : '1px solid #dddddd', 
              minWidth: '150px', 
              zIndex: 1500, 
              overflow: 'hidden' 
            }}>
              
              <button 
                onClick={() => setShowSettingsSub(!showSettingsSub)}
                style={{ 
                  width: '100%', 
                  padding: '10px 15px', 
                  background: 'none', 
                  border: 'none', 
                  color: theme === 'dark' ? '#ffffff' : '#333333', 
                  fontSize: '14px', 
                  fontWeight: 'bold', 
                  textAlign: 'left', 
                  cursor: 'pointer', 
                  borderBottom: theme === 'dark' ? '1px solid #333333' : '1px solid #eee', 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center', 
                  transition: 'background 0.2s' 
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme === 'dark' ? '#2d2d2d' : '#f8f9fa'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <span>⚙️ Settings</span>
                <span style={{ fontSize: '10px', color: '#888' }}>{showSettingsSub ? '▲' : '▼'}</span>
              </button>

              {showSettingsSub && (
                <div style={{ background: theme === 'dark' ? '#252526' : '#f8f9fa' }}>
                  <button 
                    onClick={() => {
                      navigate('/edit-profile');
                      setShowDropdown(false);
                      setShowSettingsSub(false);
                    }}
                    style={{ 
                      width: '100%', 
                      padding: '8px 15px 8px 25px', 
                      background: 'none', 
                      border: 'none', 
                      color: '#a832ff', 
                      fontSize: '13px', 
                      fontWeight: 'bold', 
                      textAlign: 'left', 
                      cursor: 'pointer', 
                      borderBottom: theme === 'dark' ? '1px solid #333333' : '1px solid #eee', 
                      transition: 'background 0.2s' 
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme === 'dark' ? '#333333' : '#e9ecef'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    📝 Edit ID Info
                  </button>

                  <button 
                    onClick={() => {
                      toggleTheme();
                    }}
                    style={{ 
                      width: '100%', 
                      padding: '8px 15px 8px 25px', 
                      background: 'none', 
                      border: 'none', 
                      color: '#a832ff', 
                      fontSize: '13px', 
                      fontWeight: 'bold', 
                      textAlign: 'left', 
                      cursor: 'pointer', 
                      borderBottom: theme === 'dark' ? '1px solid #333333' : '1px solid #eee', 
                      transition: 'background 0.2s' 
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme === 'dark' ? '#333333' : '#e9ecef'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    {theme === 'light' ? '🌙 Dark Mode' : '☀️ Light Mode'}
                  </button>
                </div>
              )}
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
                  padding: '10px 15px', 
                  background: 'none', 
                  border: 'none', 
                  color: '#dc3545', 
                  fontSize: '14px', 
                  fontWeight: 'bold', 
                  textAlign: 'left', 
                  cursor: 'pointer', 
                  transition: 'background 0.2s' 
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme === 'dark' ? '#2d2d2d' : '#f8f9fa'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                🏃‍♂️ Logout
              </button>
            </div>
          )}
        </div>

      </div>
    </nav>
  );
}
