// File Name: src/App.jsx
import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { auth, db } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';

import Navbar from './components/Navbar';
import AdminPanel from './components/AdminPanel';
import Login from './pages/Login';
import Home from './pages/Home';
import Messenger from './pages/Messenger'; 
import Profile from './pages/Profile';
import PersonalChat from './pages/PersonalChat'; 
import EditProfile from './pages/EditProfile';
import GlobalChat from './pages/GlobalChat';

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isApproved, setIsApproved] = useState(false);

  // Core Theme State setup
  const [theme, setTheme] = useState(() => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) return savedTheme;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  const [showDropdown, setShowDropdown] = useState(false);
  useEffect(() => {
    const closeDropdown = () => setShowDropdown(false);
    if (showDropdown) {
      window.addEventListener('click', closeDropdown);
    }
    return () => window.removeEventListener('click', closeDropdown);
  }, [showDropdown]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        const userRef = doc(db, "users", currentUser.uid);
        const unsubscribeUser = onSnapshot(userRef, (docSnap) => {
          if (docSnap.exists()) {
            const userData = docSnap.data();
            setIsAdmin(userData.role === "admin" || String(userData.role).toLowerCase().trim() === "admin");
            setIsApproved(userData.approved === true || String(userData.approved).toLowerCase().trim() === "true"); 
          } else {
            setIsAdmin(false);
            setIsApproved(false);
          }
          setLoading(false); 
        }, (error) => {
          console.error("Error fetching user role:", error);
          setLoading(false);
        });
        return () => unsubscribeUser();
      } else {
        setUser(null);
        setIsAdmin(false);
        setIsApproved(false);
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  };

  // Safeguard loading state layout
  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#0056b3', color: '#fff', fontFamily: 'Arial', fontSize: '16px', fontWeight: 'bold' }}>
        ⚙️ Connecting Campus Network...
      </div>
    );
  }

  // Access validation for authorized users
  const isAuthUser = user && (isApproved || isAdmin);
  return (
    <Router>
      <div style={{ background: 'var(--bg)', minHeight: '100vh', transition: 'background 0.3s ease', position: 'relative' }}>
        
        {/* Render global responsive navbar component */}
        {user && isAuthUser && <Navbar isAdmin={isAdmin} theme={theme} toggleTheme={toggleTheme} />}

        {/* 🎯 Duplicate fixed three-dot layout has been successfully removed from here */}

        <div style={{ marginTop: '10px' }}>
          <Routes>
            <Route path="/" element={isAuthUser ? <Home isAdmin={isAdmin} /> : <Navigate to="/login" replace />} />
            <Route path="/messenger" element={isAuthUser ? <Messenger /> : <Navigate to="/login" replace />} />
            <Route path="/profile" element={isAuthUser ? <Profile /> : <Navigate to="/login" replace />} />
            <Route path="/profile/:userId" element={isAuthUser ? <Profile /> : <Navigate to="/login" replace />} />
            <Route path="/edit-profile" element={isAuthUser ? <EditProfile /> : <Navigate to="/login" replace />} />
            <Route path="/chat/:receiverId/:receiverName" element={isAuthUser ? <PersonalChat /> : <Navigate to="/login" replace />} />
            
            {/* Global Chat and Group gateway route configuration */}
            <Route path="/chat/global/Global-Chatroom" element={isAuthUser ? <GlobalChat /> : <Navigate to="/login" replace />} />
            
            {/* Admin console access route dashboard */}
            <Route path="/admin" element={user && isAdmin ? <AdminPanel /> : <Navigate to="/" replace />} />
            
            {/* Authentication user route management entry point */}
            <Route path="/login" element={!user ? <Login /> : (isAdmin ? <Navigate to="/admin" replace /> : (isApproved ? <Navigate to="/" replace /> : <Login />))} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </div>

      </div>
    </Router>
  );
}
