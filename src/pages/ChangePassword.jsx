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
  
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const EyeIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
      <circle cx="12" cy="12" r="3"></circle>
    </svg>
  );

  const EyeOffIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
      alert("🚨 New password and confirmation do not match!");
      return;
    }
    
    const user = auth.currentUser;
    if (!user) {
      alert("Please login first!");
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
    <div style={{ maxWidth: '440px', margin: '0 auto', padding: '24px 14px' }}>
      <div className="fb-lite-card" style={{ padding: '24px 18px' }}>
        
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <div style={{ fontSize: '32px', marginBottom: '6px' }}>🔒</div>
          <h2 style={{ color: 'var(--fb-text)', margin: 0, fontSize: '18px', fontWeight: '700' }}>
            Change Account Password
          </h2>
          <p style={{ color: 'var(--fb-text-secondary)', fontSize: '12px', marginTop: '4px' }}>
            Enter your current password to set a new password
          </p>
        </div>
        
        <form onSubmit={handlePasswordChange} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          
          {/* Current Password */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ color: 'var(--fb-text-secondary)', fontSize: '12px', fontWeight: '600' }}>
              Current Password:
            </label>
            <div style={{ position: 'relative', width: '100%' }}>
              <input 
                type={showCurrentPassword ? "text" : "password"} 
                value={currentPassword} 
                onChange={(e) => setCurrentPassword(e.target.value)} 
                required
                placeholder="Enter current password"
                style={{
                  width: '100%',
                  padding: '10px 40px 10px 12px',
                  backgroundColor: 'var(--fb-input-bg)',
                  border: '1px solid var(--fb-card-border)',
                  borderRadius: '6px',
                  color: 'var(--fb-text)',
                  fontSize: '13px',
                  outline: 'none'
                }}
              />
              <button 
                type="button"
                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center',
                  color: 'var(--fb-text-muted)'
                }}
              >
                {showCurrentPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </div>
          
          {/* New Password */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ color: 'var(--fb-text-secondary)', fontSize: '12px', fontWeight: '600' }}>
              New Password:
            </label>
            <div style={{ position: 'relative', width: '100%' }}>
              <input 
                type={showNewPassword ? "text" : "password"} 
                value={newPassword} 
                onChange={(e) => setNewPassword(e.target.value)} 
                required
                placeholder="At least 6 characters"
                style={{
                  width: '100%',
                  padding: '10px 40px 10px 12px',
                  backgroundColor: 'var(--fb-input-bg)',
                  border: '1px solid var(--fb-card-border)',
                  borderRadius: '6px',
                  color: 'var(--fb-text)',
                  fontSize: '13px',
                  outline: 'none'
                }}
              />
              <button 
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center',
                  color: 'var(--fb-text-muted)'
                }}
              >
                {showNewPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </div>
          
          {/* Confirm Password */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ color: 'var(--fb-text-secondary)', fontSize: '12px', fontWeight: '600' }}>
              Confirm New Password:
            </label>
            <div style={{ position: 'relative', width: '100%' }}>
              <input 
                type={showConfirmPassword ? "text" : "password"} 
                value={confirmPassword} 
                onChange={(e) => setConfirmPassword(e.target.value)} 
                required
                placeholder="Re-enter new password"
                style={{
                  width: '100%',
                  padding: '10px 40px 10px 12px',
                  backgroundColor: 'var(--fb-input-bg)',
                  border: '1px solid var(--fb-card-border)',
                  borderRadius: '6px',
                  color: 'var(--fb-text)',
                  fontSize: '13px',
                  outline: 'none'
                }}
              />
              <button 
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center',
                  color: 'var(--fb-text-muted)'
                }}
              >
                {showConfirmPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
            <button 
              type="button" 
              onClick={() => navigate(-1)} 
              className="fb-lite-btn fb-lite-btn-secondary"
              style={{ flex: 1, padding: '10px' }}
            >
              Cancel
            </button>
            
            <button 
              type="submit" 
              disabled={changingPassword}
              className="fb-lite-btn fb-lite-btn-primary"
              style={{ flex: 2, padding: '10px' }}
            >
              {changingPassword ? "Updating..." : "Update Password"}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}
