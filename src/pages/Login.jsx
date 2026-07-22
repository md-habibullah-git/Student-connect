import React, { useState } from 'react';
import { auth, db } from '../firebase'; 
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';

export default function Login() {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [collegeName, setCollegeName] = useState('');
  const [studentClass, setStudentClass] = useState('');
  const [dept, setDept] = useState('');
  const [tempPhoto, setTempPhoto] = useState('');
  const handleImageChange = (e) => {
    const file = e.target.files[0]; 
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 120;
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
          
          const compressedBase64 = canvas.toDataURL('image/jpeg', 0.5);
          setTempPhoto(compressedBase64);
        };
      };
      reader.readAsDataURL(file);
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
          alert("🚨 Your ID has been removed! Please go to the Sign Up option and send a new application or request again.");
          await auth.signOut();
          setTimeout(() => { window.location.reload(); }, 300);
          return;
        }

        if (!isApprovedTrue) {
          alert("🚨 Your ID has been removed! Please go to the Sign Up option and send a new application or request again.");
          await auth.signOut(); 
          setTimeout(() => { window.location.reload(); }, 300);
          return;
        }

        alert("✅ Login successful!");
        setTimeout(() => { window.location.reload(); }, 300);
      } else {
        alert("🚨 Your account was not found in the database! Please sign up first and send a request.");
        await auth.signOut();
        setTimeout(() => { window.location.reload(); }, 300);
      }
    } catch (error) {
      alert("❌ Wrong email or password, or your account has not been approved yet!");
    }
  };
  const handleRegister = async (e) => {
    e.preventDefault();
    
    if (!tempPhoto) {
      alert("🚨 Please select a profile picture for the ID card!");
      return;
    }

    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(email)) {
      alert("🚨 Please use a correct and valid email address!");
      return;
    }

    if (password.length < 6) {
      alert("🚨 The password is too weak! Please provide a password of at least 6 characters.");
      return;
    }

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      await updateProfile(user, { displayName: name });

      // The request is being sent directly to the "users" collection to match your admin panel.
      await setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
        name: name,
        collegeName: collegeName,
        dept: dept,
        studentClass: studentClass,
        email: email,
        photo: tempPhoto,
        approved: false, // Since this is false, it will show up under "New ID Requests" in the admin panel.
        role: "student",
        createdAt: new Date().getTime()
      });

      alert("🚀 Your ID card application has been successfully sent to the admin! Your ID will only become active after the admin approves it.");
      await auth.signOut();
      setTimeout(() => { window.location.reload(); }, 400);

    } catch (error) {
      if (error.code === 'auth/email-already-in-use') {
        try {
          const loginCredential = await signInWithEmailAndPassword(auth, email, password);
          const existingUser = loginCredential.user;

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
            role: "student",
            createdAt: new Date().getTime()
          });

          alert("🚀 Your re-application from your old ID has been successfully sent to the admin! The ID will become active again once the admin accepts it.");
          await auth.signOut();
          setTimeout(() => { window.location.reload(); }, 400);
        } catch (innerErr) {
          alert("❌ Failed to send request: The password must match your old ID password, or the password is incorrect.");
        }
      } else {
        alert("❌ Registration failed: " + error.message);
      }
    }
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
  };
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '85vh', flexDirection: 'column', gap: '15px', backgroundColor: '#f0f2f5', padding: '15px' }}>
      <div style={{ maxWidth: '380px', width: '100%', margin: 'auto', padding: '30px 25px', border: '1px solid #e1e8ed', borderRadius: '15px', fontFamily: 'Arial', background: '#fff', boxShadow: '0 10px 25px rgba(0,0,0,0.08)', boxSizing: 'border-box' }}>
        
        <div style={{ display: 'flex', background: '#f1f3f5', borderRadius: '10px', padding: '5px', marginBottom: '25px', gap: '5px' }}>
          <button 
            type="button"
            onClick={() => handleTabSwitch(false)}
            style={{ flex: 1, padding: '10px', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.3s', backgroundColor: !isRegister ? '#0056b3' : 'transparent', color: !isRegister ? '#fff' : '#555' }}
          >
            🔑 Sign In
          </button>
          <button 
            type="button"
            onClick={() => handleTabSwitch(true)}
            style={{ flex: 1, padding: '10px', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.3s', backgroundColor: isRegister ? '#0056b3' : 'transparent', color: isRegister ? '#fff' : '#555' }}
          >
            🪪 Sign Up
          </button>
        </div>

        <h2 style={{ textAlign: 'center', color: '#333', fontSize: '22px', fontWeight: 'bold', marginBottom: '20px', letterSpacing: '0.5px' }}>
          {isRegister ? "Apply for Campus ID" : "Student Login"}
        </h2>
        <form onSubmit={isRegister ? handleRegister : handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {isRegister && (
            <>
              <input type="text" placeholder="👨‍🎓 Full Name" value={name} onChange={e => setName(e.target.value)} required style={{ padding: '12px', borderRadius: '6px', border: '1px solid #ccc', outline: 'none', fontSize: '14px' }} />
              <input type="text" placeholder="🆔 College / University" value={collegeName} onChange={e => setCollegeName(e.target.value)} required style={{ padding: '12px', borderRadius: '6px', border: '1px solid #ccc', outline: 'none', fontSize: '14px' }} />
              <input type="text" placeholder="🏢 Department" value={dept} onChange={e => setDept(e.target.value)} required style={{ padding: '12px', borderRadius: '6px', border: '1px solid #ccc', outline: 'none', fontSize: '14px' }} />
              <input type="text" placeholder="⏳ Class / Year (e.g. Honours 3rd Year)" value={studentClass} onChange={e => setStudentClass(e.target.value)} required style={{ padding: '12px', borderRadius: '6px', border: '1px solid #ccc', outline: 'none', fontSize: '14px' }} />
              <div style={{ border: '1px dashed #0056b3', padding: '12px', borderRadius: '6px', textAlign: 'center', background: '#f8f9fa' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 'bold', color: '#333' }}>📸 Take/Select Photo</label>
                <input type="file" accept="image/*" onChange={handleImageChange} required={!tempPhoto} style={{ fontSize: '12px', width: '100%', cursor: 'pointer' }} />
                {tempPhoto && <img src={tempPhoto} alt="Preview" style={{ width: '65px', height: '75px', marginTop: '10px', objectFit: 'cover', borderRadius: '4px', border: '1px solid #ddd' }} />}
              </div>
            </>
          )}
          <input type="email" placeholder="📧 Email Address" value={email} onChange={e => setEmail(e.target.value)} required style={{ padding: '12px', borderRadius: '6px', border: '1px solid #ccc', outline: 'none', fontSize: '14px' }} />
          <input type="password" placeholder="🔒 Password" value={password} onChange={e => setPassword(e.target.value)} required style={{ padding: '12px', borderRadius: '6px', border: '1px solid #ccc', outline: 'none', fontSize: '14px' }} />
          
          <button type="submit" style={{ background: '#0056b3', color: 'white', padding: '14px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '15px', marginTop: '10px', boxShadow: '0 4px 12px rgba(0,86,179,0.25)', transition: 'background 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.background = '#004494'} onMouseLeave={(e) => e.currentTarget.style.background = '#0056b3'}>
            {isRegister ? "Submit Request" : "Login"}
          </button>
        </form>

      </div>
    </div>
  );
}
