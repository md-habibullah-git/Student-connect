// File Name: src/pages/Login.jsx
import React, { useState, useEffect } from 'react';
import { auth, db } from '../firebase'; 
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile, sendEmailVerification } from 'firebase/auth';
import { doc, setDoc, getDoc, updateDoc } from 'firebase/firestore';

export default function Login() {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [collegeName, setCollegeName] = useState('');
  const [studentClass, setStudentClass] = useState('');
  const [dept, setDept] = useState('');
  const [tempPhoto, setTempPhoto] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [pendingVerification, setPendingVerification] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [verificationMsg, setVerificationMsg] = useState('');

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);
  
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
  
  const handleImageChange = (e) => {
    const file = e.target.files?.[0]; 
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 400;
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
          
          const compressedBase64 = canvas.toDataURL('image/jpeg', 0.85);
          setTempPhoto(compressedBase64);
        };
      };
      reader.readAsDataURL(file);
    }
  };

  const checkEmailDomainIsReal = async (emailAddress) => {
    const domain = emailAddress.split('@')[1];
    if (!domain) return false;
    try {
      const res = await fetch(`https://dns.google/resolve?name=${domain}&type=MX`);
      const data = await res.json();
      return data.Status === 0 && Array.isArray(data.Answer) && data.Answer.length > 0;
    } catch {
      return true;
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
        
      const userDoc = await getDoc(doc(db, "users", user.uid));
      if (userDoc.exists()) {
        const userData = userDoc.data();

        if (userData.role === "admin" || userData.role === "Admin") {
          alert("👑 Admin login successful!");
          setTimeout(() => { window.location.reload(); }, 300);
          return;
        }

        const isApprovedTrue = userData.approved === true || String(userData.approved).toLowerCase().trim() === "true";
        const isDeletedUser = userData.approved === "deleted" || userData.name === "Removed User";

        if (isDeletedUser) {
          alert("🚨 Your ID has been removed! Please apply through Sign Up again.");
          await auth.signOut();
          setTimeout(() => { window.location.reload(); }, 300);
          return;
        }

        if (userData.requiresEmailVerification && !user.emailVerified) {
          setPendingVerification(true);
          setVerificationMsg("📧 Please verify your email address first. Check your Inbox or Spam folder for the verification link.");
          return;
        }

        if (!isApprovedTrue) {
          alert("⏳ Your application is pending admin approval. Please wait for approval.");
          await auth.signOut(); 
          setTimeout(() => { window.location.reload(); }, 300);
          return;
        }

        alert("✅ Login successful!");
        setTimeout(() => { window.location.reload(); }, 300);
      } else {
        alert("🚨 Account not found in database! Please sign up first.");
        await auth.signOut();
        setTimeout(() => { window.location.reload(); }, 300);
      }
    } catch {
      alert("❌ Wrong email or password, or account is not approved yet!");
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    
    if (!tempPhoto) {
      alert("🚨 Please select a profile photo for your ID card!");
      return;
    }

    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(email)) {
      alert("🚨 Please use a valid email address!");
      return;
    }

    const isEmailDomainReal = await checkEmailDomainIsReal(email);
    if (!isEmailDomainReal) {
      alert("🚨 This email domain appears invalid. Please use a real email address.");
      return;
    }

    if (password.length < 6) {
      alert("🚨 Password must be at least 6 characters!");
      return;
    }

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      await updateProfile(user, { displayName: name });

      await setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
        name: name,
        collegeName: collegeName,
        dept: dept,
        studentClass: studentClass,
        email: email,
        photo: tempPhoto,
        approved: false,
        requiresEmailVerification: true,
        emailVerified: false,
        role: "student",
        createdAt: Date.now()
      });

      await sendEmailVerification(user);
      setPendingVerification(true);
      setResendCooldown(30);
      setVerificationMsg(`📧 Verification link sent to ${email}. Check your Inbox or Spam folder.`);

    } catch (error) {
      if (error.code === 'auth/email-already-in-use') {
        try {
          const loginCredential = await signInWithEmailAndPassword(auth, email, password);
          const existingUser = loginCredential.user;

          const existingDocSnap = await getDoc(doc(db, "users", existingUser.uid));
          const existingData = existingDocSnap.exists() ? existingDocSnap.data() : null;
          const isExistingAdmin = existingData && (existingData.role === "admin" || existingData.role === "Admin");

          if (isExistingAdmin) {
            alert("❌ This email belongs to an Admin account.");
            await auth.signOut();
            setTimeout(() => { window.location.reload(); }, 300);
            return;
          }

          await updateProfile(existingUser, { displayName: name });

          await setDoc(doc(db, "users", existingUser.uid), {
            uid: existingUser.uid,
            name: name,
            collegeName: collegeName,
            dept: dept,
            studentClass: studentClass,
            email: email,
            photo: tempPhoto,
            approved: false,
            requiresEmailVerification: !existingUser.emailVerified,
            emailVerified: existingUser.emailVerified,
            role: "student",
            createdAt: Date.now()
          });

          if (!existingUser.emailVerified) {
            await sendEmailVerification(existingUser);
            setPendingVerification(true);
            setResendCooldown(30);
            setVerificationMsg(`📧 Verification link sent to ${email}. Check your Inbox or Spam folder.`);
          } else {
            alert("🚀 Re-application sent to admin! ID will activate once approved.");
            await auth.signOut();
            setTimeout(() => { window.location.reload(); }, 400);
          }
        } catch {
          alert("❌ Failed to send request: The password must match your old ID password.");
        }
      } else {
        alert("❌ Registration failed: " + error.message);
      }
    }
  };

  const handleCheckVerified = async () => {
    if (!auth.currentUser) {
      setPendingVerification(false);
      return;
    }
    setVerifying(true);
    try {
      await auth.currentUser.reload();
      if (auth.currentUser.emailVerified) {
        await updateDoc(doc(db, "users", auth.currentUser.uid), {
          emailVerified: true
        });
        alert("🎉 Email verified! Your Campus ID application has been sent to admin for approval.");
        await auth.signOut();
        setPendingVerification(false);
        setTimeout(() => { window.location.reload(); }, 300);
      } else {
        setVerificationMsg("⏳ Not verified yet. Please open the link in your email (check Spam too) and try again.");
      }
    } catch (err) {
      setVerificationMsg("❌ Error checking verification: " + err.message);
    } finally {
      setVerifying(false);
    }
  };

  const handleResendVerification = async () => {
    if (!auth.currentUser || resendCooldown > 0) return;
    try {
      await sendEmailVerification(auth.currentUser);
      setResendCooldown(30);
      setVerificationMsg(`📧 New verification link sent to ${auth.currentUser.email || email}. Check Inbox or Spam.`);
    } catch (err) {
      setVerificationMsg("❌ Could not resend right now: " + err.message);
    }
  };

  const handleCancelVerification = async () => {
    await auth.signOut().catch(() => {});
    setPendingVerification(false);
    setVerificationMsg('');
  };

  const handleTabSwitch = (registerMode) => {
    setIsRegister(registerMode);
    setEmail('');
    setPassword('');
    setName('');
    setCollegeName('');
    setDept('');
    setStudentClass('');
    setTempPhoto('');
    setShowPassword(false);
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '85vh',
      padding: '20px 14px',
      backgroundColor: 'var(--fb-bg)'
    }}>
      {/* FB Lite Brand Header */}
      <div style={{ textAlign: 'center', marginBottom: '20px' }}>
        <h1 style={{
          fontSize: '32px',
          fontWeight: '800',
          color: 'var(--fb-blue)',
          margin: '0 0 4px 0',
          letterSpacing: '-0.8px'
        }}>
          studentconnect
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--fb-text-secondary)', margin: 0 }}>
          Connect with campus peers, share posts, messages, and calls.
        </p>
      </div>

      <div className="fb-lite-card" style={{
        maxWidth: '400px',
        width: '100%',
        padding: '24px 20px',
        margin: '0 auto'
      }}>
        {pendingVerification ? (
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ fontSize: '42px', lineHeight: 1 }}>📧</div>
            <h2 style={{ margin: 0, fontSize: '18px', color: 'var(--fb-text)' }}>Verify Your Email</h2>
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--fb-text-secondary)', lineHeight: 1.5 }}>
              {verificationMsg || `We sent a verification link to ${email}. Click the link in your email, then tap the button below.`}
            </p>
            <button
              type="button"
              onClick={handleCheckVerified}
              disabled={verifying}
              className="fb-lite-btn fb-lite-btn-success"
              style={{ padding: '12px', fontSize: '14px', fontWeight: '700' }}
            >
              {verifying ? 'Checking...' : '✅ I Have Verified My Email'}
            </button>
            <button
              type="button"
              onClick={handleResendVerification}
              disabled={resendCooldown > 0}
              className="fb-lite-btn fb-lite-btn-secondary"
              style={{ padding: '10px', fontSize: '13px' }}
            >
              {resendCooldown > 0 ? `🔄 Resend Email (${resendCooldown}s)` : '🔄 Resend Verification Email'}
            </button>
            <button
              type="button"
              onClick={handleCancelVerification}
              style={{ background: 'none', border: 'none', color: 'var(--fb-blue)', cursor: 'pointer', fontSize: '13px', fontWeight: '600', marginTop: '4px' }}
            >
              ← Back to Log In
            </button>
          </div>
        ) : (
        <>
        {/* Switch tab */}
        <div style={{
          display: 'flex',
          backgroundColor: 'var(--fb-input-bg)',
          borderRadius: '8px',
          padding: '4px',
          marginBottom: '20px',
          gap: '4px'
        }}>
          <button 
            type="button"
            onClick={() => handleTabSwitch(false)}
            style={{
              flex: 1,
              padding: '8px',
              border: 'none',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: '700',
              cursor: 'pointer',
              backgroundColor: !isRegister ? 'var(--fb-card)' : 'transparent',
              color: !isRegister ? 'var(--fb-blue)' : 'var(--fb-text-secondary)',
              boxShadow: !isRegister ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
            }}
          >
            Log In
          </button>
          <button 
            type="button"
            onClick={() => handleTabSwitch(true)}
            style={{
              flex: 1,
              padding: '8px',
              border: 'none',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: '700',
              cursor: 'pointer',
              backgroundColor: isRegister ? 'var(--fb-card)' : 'transparent',
              color: isRegister ? 'var(--fb-blue)' : 'var(--fb-text-secondary)',
              boxShadow: isRegister ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
            }}
          >
            Apply for Campus ID
          </button>
        </div>

        <form onSubmit={isRegister ? handleRegister : handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {isRegister && (
            <>
              <input
                type="text"
                placeholder="Full Name"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                style={{
                  padding: '11px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--fb-card-border)',
                  backgroundColor: 'var(--fb-input-bg)',
                  color: 'var(--fb-text)',
                  outline: 'none',
                  fontSize: '14px'
                }}
              />
              <input
                type="text"
                placeholder="College / University Name"
                value={collegeName}
                onChange={e => setCollegeName(e.target.value)}
                required
                style={{
                  padding: '11px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--fb-card-border)',
                  backgroundColor: 'var(--fb-input-bg)',
                  color: 'var(--fb-text)',
                  outline: 'none',
                  fontSize: '14px'
                }}
              />
              <input
                type="text"
                placeholder="Department"
                value={dept}
                onChange={e => setDept(e.target.value)}
                required
                style={{
                  padding: '11px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--fb-card-border)',
                  backgroundColor: 'var(--fb-input-bg)',
                  color: 'var(--fb-text)',
                  outline: 'none',
                  fontSize: '14px'
                }}
              />
              <input
                type="text"
                placeholder="Class / Year (e.g. Honours 3rd Year)"
                value={studentClass}
                onChange={e => setStudentClass(e.target.value)}
                required
                style={{
                  padding: '11px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--fb-card-border)',
                  backgroundColor: 'var(--fb-input-bg)',
                  color: 'var(--fb-text)',
                  outline: 'none',
                  fontSize: '14px'
                }}
              />
              
              <div style={{
                border: '1px dashed var(--fb-card-border)',
                padding: '12px',
                borderRadius: '6px',
                textAlign: 'center',
                backgroundColor: 'var(--fb-hover)'
              }}>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', fontWeight: 'bold', color: 'var(--fb-text)' }}>
                  📸 ID Card Photo (Required)
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  required={!tempPhoto}
                  style={{ fontSize: '12px', width: '100%', cursor: 'pointer' }}
                />
                {tempPhoto && (
                  <img
                    src={tempPhoto}
                    alt="Preview"
                    style={{
                      width: '60px',
                      height: '70px',
                      marginTop: '8px',
                      objectFit: 'cover',
                      borderRadius: '4px',
                      border: '1px solid var(--fb-card-border)'
                    }}
                  />
                )}
              </div>
            </>
          )}

          <input
            type="email"
            placeholder={isRegister ? "Email address (verification required)" : "Email address"}
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            style={{
              padding: '11px 12px',
              borderRadius: '6px',
              border: '1px solid var(--fb-card-border)',
              backgroundColor: 'var(--fb-input-bg)',
              color: 'var(--fb-text)',
              outline: 'none',
              fontSize: '14px'
            }}
          />
          
          <div style={{ position: 'relative', width: '100%' }}>
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '11px 40px 11px 12px',
                borderRadius: '6px',
                border: '1px solid var(--fb-card-border)',
                backgroundColor: 'var(--fb-input-bg)',
                color: 'var(--fb-text)',
                outline: 'none',
                fontSize: '14px'
              }}
            />
            <button 
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              style={{
                position: 'absolute',
                right: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '0',
                display: 'flex',
                alignItems: 'center',
                color: 'var(--fb-text-muted)'
              }}
              title={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>
          
          <button
            type="submit"
            className={`fb-lite-btn ${isRegister ? 'fb-lite-btn-success' : 'fb-lite-btn-primary'}`}
            style={{
              padding: '12px',
              fontSize: '15px',
              fontWeight: '700',
              marginTop: '6px'
            }}
          >
            {isRegister ? "Submit ID Application" : "Log In"}
          </button>
        </form>

        <div style={{
          borderTop: '1px solid var(--fb-divider)',
          marginTop: '20px',
          paddingTop: '16px',
          textAlign: 'center'
        }}>
          {!isRegister ? (
            <button
              onClick={() => handleTabSwitch(true)}
              className="fb-lite-btn fb-lite-btn-success"
              style={{ fontSize: '13px' }}
            >
              Apply for New Campus ID Card
            </button>
          ) : (
            <button
              onClick={() => handleTabSwitch(false)}
              className="fb-lite-btn fb-lite-btn-secondary"
              style={{ fontSize: '13px' }}
            >
              Already have an ID? Log In
            </button>
          )}
        </div>
        </>
        )}

      </div>
    </div>
  );
}
