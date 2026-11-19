// File Name: src/pages/EditProfile.jsx
import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore'; 
import { useNavigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';

export default function EditProfile() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  
  const [selectedFile, setSelectedFile] = useState(null);
  const [imagePreview, setImagePreview] = useState('');

  const bloodGroups = ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"];

  const [formData, setFormData] = useState({
    id: '', 
    name: '',
    fatherName: '',
    collegeName: '',
    dept: '',
    studentClass:'',
    batch: '',
    bloodGroup: '',
    phone: '',
    email: '',
    fbLink: '',
    instaLink: '',
    photo: ''
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        alert("Please log in first!");
        navigate('/login');
        return;
      }

      try {
        let docRef = doc(db, "users", user.uid);
        let docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const data = docSnap.data();
          setFormData({
            id: docSnap.id,
            name: data.name || '',
            fatherName: data.fatherName || '',
            collegeName: data.collegeName || data.institute || '',
            dept: data.dept || '',
            studentClass: data.studentClass || '',
            batch: data.batch || data.session || '',
            bloodGroup: data.bloodGroup || data.blood || '',
            phone: data.phone || data.mobile || '',
            email: data.email || user.email || '',
            fbLink: data.fbLink || '',
            instaLink: data.instaLink || '',
            photo: data.photo || ''
          });
          if (data.photo) {
            setImagePreview(data.photo);
          }
        } else {
          setFormData(prev => ({ ...prev, id: user.uid, email: user.email || '' }));
        }
      } catch (error) {
        console.error("Error fetching user data:", error);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [navigate]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type.startsWith('image/')) {
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
          
          const compressedBase64 = canvas.toDataURL('image/jpeg', 0.8);
          setSelectedFile(compressedBase64); 
          setImagePreview(compressedBase64);
        };
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) return;

    setUpdating(true);
    let downloadURL = selectedFile ? selectedFile : formData.photo;

    if (downloadURL && downloadURL.length > 1048480) {
      alert("🚨 Photo size exceeds database limits. Please try a different photo.");
      setUpdating(false);
      return;
    }

    try {
      const targetDocId = user.uid; 
      const docRef = doc(db, "users", targetDocId);
      
      await setDoc(docRef, {
        name: formData.name || '',
        fatherName: formData.fatherName || '',
        collegeName: formData.collegeName || '',
        dept: formData.dept || '',
        studentClass: formData.studentClass || '',
        batch: formData.batch || '',
        bloodGroup: formData.bloodGroup || '',
        phone: formData.phone || '',
        fbLink: formData.fbLink || '',
        instaLink: formData.instaLink || '',
        photo: downloadURL, 
        uid: user.uid 
      }, { merge: true });
      
      alert("🎉 Profile information saved successfully!");
      navigate(`/profile/${targetDocId}`); 
    } catch (error) {
      console.error("Firestore Save Error:", error);
      alert("⚠️ Error saving information. Please try again.");
    } finally {
      setUpdating(false); 
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '70vh', color: 'var(--fb-blue)', fontWeight: 'bold', fontSize: '15px' }}>
        🪪 Loading Edit Form...
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '540px', margin: '0 auto', padding: '16px 12px 40px 12px' }}>
      
      <div className="fb-lite-card" style={{ padding: '20px 16px' }}>
        
        <h2 style={{ color: 'var(--fb-text)', textAlign: 'center', margin: '0 0 16px 0', fontSize: '18px', fontWeight: '700' }}>
          Edit ID Card Information
        </h2>
        
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          
          {/* Avatar Preview & Upload */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <div style={{ position: 'relative' }}>
              <img
                src={imagePreview || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(formData.name || 'Student')}`}
                alt="Profile Preview"
                className="fb-avatar"
                style={{
                  width: '96px',
                  height: '96px',
                  border: '3px solid var(--fb-blue)',
                  objectFit: 'cover'
                }}
              />
            </div>

            <label className="fb-lite-btn fb-lite-btn-secondary" style={{ cursor: 'pointer', fontSize: '12px' }}>
              📷 Change Photo
              <input type="file" accept="image/*" onChange={handleImageChange} style={{ display: 'none' }} />
            </label>
          </div>

          {/* Form Fields */}
          {[
            { label: "Full Name", name: "name", type: "text", required: true },
            { label: "Father's Name", name: "fatherName", type: "text" },
            { label: "College / University", name: "collegeName", type: "text" },
            { label: "Department", name: "dept", type: "text" },
            { label: "Class / Year", name: "studentClass", type: "text" },
            { label: "Session / Batch", name: "batch", type: "text" },
            { label: "Blood Group", name: "bloodGroup", type: "select" }, 
            { label: "Mobile Number", name: "phone", type: "text" },
            { label: "Facebook Profile URL", name: "fbLink", type: "text" },
            { label: "Instagram Profile URL", name: "instaLink", type: "text" }
          ].map((field, index) => (
            <div key={index} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ color: 'var(--fb-text-secondary)', fontSize: '12px', fontWeight: '600' }}>
                {field.label}:
              </label>
              
              {field.type === 'select' ? (
                <select
                  name={field.name}
                  value={formData[field.name] || ''}
                  onChange={handleChange}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    backgroundColor: 'var(--fb-input-bg)',
                    border: '1px solid var(--fb-card-border)',
                    borderRadius: '6px',
                    color: 'var(--fb-text)',
                    fontSize: '13px',
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                >
                  <option value="" disabled>Select Blood Group</option>
                  {bloodGroups.map((group, idx) => (
                    <option key={idx} value={group}>
                      {group}
                    </option>
                  ))}
                </select>
              ) : (
                <input 
                  type={field.type} 
                  name={field.name} 
                  value={formData[field.name] || ''} 
                  onChange={handleChange} 
                  required={field.required}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    backgroundColor: 'var(--fb-input-bg)',
                    border: '1px solid var(--fb-card-border)',
                    borderRadius: '6px',
                    color: 'var(--fb-text)',
                    fontSize: '13px',
                    outline: 'none'
                  }}
                />
              )}
            </div>
          ))}

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
              disabled={updating}
              className="fb-lite-btn fb-lite-btn-primary"
              style={{ flex: 2, padding: '10px' }}
            >
              {updating ? "Saving Changes..." : "Save Profile Info"}
            </button>
          </div>

        </form>
      </div>

    </div>
  );
}
