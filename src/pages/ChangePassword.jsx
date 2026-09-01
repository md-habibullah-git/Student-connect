// File Name: src/pages/ChangePassword.jsx

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../firebase';
import { updatePassword, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';

export default function ChangePassword() {
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  
  // Password visibility states
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Eye SVG Icons
  const EyeIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
      <circle cx="12" cy="12" r="3"></circle>
    </svg>
  );

  const EyeOffIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
      <line x1="1" y1="1" x2="23" y2="23"></line>
    </svg>
  );

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    
    if (newPassword.length < 6) {
      alert("🚨 New password must be at least 6 characters!");
      return;
    }
    
    if (newPassword !== confirmPassword) {
      alert("🚨 New password and confirm password do not match!");
      return;
    }
    
    const user = auth.currentUser;
    if (!user) {
      alert("⚠️ Please login first!");
      navigate('/login');
      return;
    }
    
    setChangingPassword(true);
    
    try {
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPassword);
      alert("✅ Password changed successfully!");
      navigate('/profile');
    } catch (error) {
      if (error.code === 'auth/wrong-password') {
        alert("❌ Current password is incorrect!");
      } else if (error.code === 'auth/too-many-requests') {
        alert("❌ Too many attempts. Please try again later.");
      } else {
        alert("❌ Failed to change password: " + error.message);
      }
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '40px 20px', backgroundColor: '#1a1f29', minHeight: '85vh', fontFamily: 'Arial' }}>
      <form onSubmit={handlePasswordChange} style={{ width: '100%', maxWidth: '420px', backgroundColor: '#11151d', padding: '30px', borderRadius: '20px', boxShadow: '0 8px 32px rgba(0,0,0,0.3)', border: '1px solid #222b36' }}>
        
        <div style={{ textAlign: 'center', marginBottom: '25px' }}>
          <div style={{ fontSize: '40px', marginBottom: '10px' }}>🔒</div>
          <h2 style={{ color: '#ffffff', margin: 0, fontSize: '22px' }}>Change Password</h2>
          <p style={{ color: '#888', fontSize: '12px', marginTop: '5px' }}>Verify your identity to change password</p>
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          
          {/* Current Password */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <label style={{ color: '#00ffff', fontSize: '12px', fontWeight: '600' }}>Current Password:</label>
            <div style={{ position: 'relative', width: '100%' }}>
              <input 
                type={showCurrentPassword ? "text" : "password"} 
                value={currentPassword} 
                onChange={(e) => setCurrentPassword(e.target.value)} 
                required
                placeholder="Enter current password"
                style={{ width: '100%', padding: '12px 40px 12px 15px', backgroundColor: '#1a1f29', border: '1px solid #2c3545', borderRadius: '10px', color: '#ffffff', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }}
              />
              <button 
                type="button"
                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: '0', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.7 }}
                title={showCurrentPassword ? "Hide password" : "Show password"}
              >
                {showCurrentPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </div>
          
          {/* New Password */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <label style={{ color: '#00ffff', fontSize: '12px', fontWeight: '600' }}>New Password:</label>
            <div style={{ position: 'relative', width: '100%' }}>
              <input 
                type={showNewPassword ? "text" : "password"} 
                value={newPassword} 
                onChange={(e) => setNewPassword(e.target.value)} 
                required
                placeholder="Enter new password (min 6 characters)"
                style={{ width: '100%', padding: '12px 40px 12px 15px', backgroundColor: '#1a1f29', border: '1px solid #2c3545', borderRadius: '10px', color: '#ffffff', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }}
              />
              <button 
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: '0', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.7 }}
                title={showNewPassword ? "Hide password" : "Show password"}
              >
                {showNewPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </div>
          
          {/* Confirm Password */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <label style={{ color: '#00ffff', fontSize: '12px', fontWeight: '600' }}>Confirm New Password:</label>
            <div style={{ position: 'relative', width: '100%' }}>
              <input 
                type={showConfirmPassword ? "text" : "password"} 
                value={confirmPassword} 
                onChange={(e) => setConfirmPassword(e.target.value)} 
                required
                placeholder="Re-enter new password"
                style={{ width: '100%', padding: '12px 40px 12px 15px', backgroundColor: '#1a1f29', border: '1px solid #2c3545', borderRadius: '10px', color: '#ffffff', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }}
              />
              <button 
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: '0', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.7 }}
                title={showConfirmPassword ? "Hide password" : "Show password"}
              >
                {showConfirmPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </div>
          
          <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
            <button 
              type="button" 
              onClick={() => navigate(-1)} 
              style={{ flex: 1, padding: '12px', backgroundColor: '#2c3545', color: '#ffffff', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}
            >
              Cancel
            </button>
            
            <button 
              type="submit" 
              disabled={changingPassword}
              style={{ flex: 2, padding: '12px', background: 'linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%)', color: '#ffffff', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', boxShadow: '0 4px 12px rgba(238,90,36,0.3)', opacity: changingPassword ? 0.7 : 1 }}
            >
              {changingPassword ? "Changing..." : "🔒 Change Password"}
            </button>
          </div>
          
        </div>
      </form>
    </div>
  );
}
