import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore'; 
import { useNavigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';

export default function EditProfile() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  
  const [selectedFile, setSelectedFile] = useState(null); // This will contain the compressed Base64 data
  const [imagePreview, setImagePreview] = useState('');
  const [isHovered, setIsHovered] = useState(false);

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
        alert("অনুগ্রহ করে আগে লগইন করুন!");
        navigate('/');
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
            collegeName: data.collegeName  || '',
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

  // 🛠️ Canvas compression trick similar to Home.jsx (converting images to permanent text)
  const handleImageChange = (e) => {
    const file = e.target.files[0]; // Ensuring a specific single file is taken
    if (!file) return;

    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 400; // Perfect size for profile
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
          
          // Converted into Base64 text by compressing at 60% quality
          const compressedBase64 = canvas.toDataURL('image/jpeg', 0.6);
          setSelectedFile(compressedBase64); 
          setImagePreview(compressedBase64); // Instant preview show
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
    // If a new picture is provided, the new Base64 text will be set; otherwise, the previous picture will remain (permanently forever)
    let downloadURL = selectedFile ? selectedFile : formData.photo;

    if (downloadURL && downloadURL.length > 1048480) {
      alert("🚨 The picture size is larger than the database limit! Please try another picture.");
      setUpdating(false);
      return;
    }

    try {
      const targetDocId = user.uid; 
      const docRef = doc(db, "users", targetDocId);
      
      // Pictures and text are being written together permanently in Firestore (there is no time limit)
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
      }, { merge: true }); // merge: true will prevent other old data from being deleted
      
      alert("🎉 Profile information and the new picture have been successfully saved permanently!");
      navigate(`/profile/${targetDocId}`); 
    } catch (error) {
      console.error("Firestore Core Save Error:", error);
      alert("⚠️ There was a problem saving the information. Please try again.");
    } finally {
      setUpdating(false); 
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#1a1f29', color: '#00ffff', fontWeight: 'bold', fontSize: '18px', fontFamily: 'Arial' }}>
        🪪 Loading Edit Form...
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '40px 20px', backgroundColor: '#1a1f29', minHeight: '100vh', fontFamily: 'Arial' }}>
      
      <svg style={{ position: 'absolute', width: 0, height: 0 }}>
        <defs>
          <clipPath id="rounded-hex-clip" clipPathUnits="objectBoundingBox">
            <path d="M 0.5,0 C 0.53,0 0.57,0.02 0.59,0.03 L 0.96,0.22 C 0.99,0.24 1,0.27 1,0.31 L 1,0.69 C 1,0.73 0.99,0.76 0.96,0.78 L 0.59,0.97 C 0.57,0.98 0.53,1 0.5,1 C 0.47,1 0.43,0.98 0.41,0.97 L 0.04,0.78 C 0.01,0.76 0,0.73 0,0.69 L 0,0.31 C 0,0.27 0.01,0.24 0.04,0.22 L 0.41,0.03 C 0.43,0.02 0.47,0 0.5,0 Z" />
          </clipPath>
        </defs>
      </svg>

      <form onSubmit={handleSubmit} style={{ width: '100%', maxWidth: '520px', backgroundColor: '#11151d', padding: '30px', borderRadius: '20px', boxShadow: '0 8px 32px rgba(0,0,0,0.3)', border: '1px solid #222b36' }}>
        
        <h2 style={{ color: '#ffffff', textAlign: 'center', marginBottom: '25px', fontSize: '22px' }}>Edit Profile Information</h2>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          
          {/* 📸 Perfect 1:1 Hexagon Image Uploader */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '35px' }}>
            <label 
              onMouseEnter={() => setIsHovered(true)}
              onMouseLeave={() => setIsHovered(false)}
              style={{ 
                position: 'relative', 
                width: '320px',             
                height: '320px',            
                clipPath: 'url(#rounded-hex-clip)', 
                backgroundColor: '#1a1f29', 
                display: 'flex', 
                justifyContent: 'center', 
                alignItems: 'center', 
                cursor: 'pointer',
                boxShadow: '0 0 25px rgba(0,255,255,0.4)',
                background: 'linear-gradient(135deg, #00c6ff 0%, #0072ff 100%)',
                padding: '5px',
                boxSizing: 'border-box',
                transition: 'all 0.3s ease'
              }}
            >
              <div style={{ 
                width: '100%', 
                height: '100%', 
                clipPath: 'url(#rounded-hex-clip)', 
                backgroundColor: '#11151d',
                position: 'relative',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center'
              }}>
                {imagePreview ? (
                  <img src={imagePreview} alt="Profile Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ color: '#00ffff', fontSize: '16px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <span style={{ fontSize: '32px' }}>📷</span>
                    <span style={{ fontWeight: '600' }}>Upload Photo</span>
                  </div>
                )}

                <div style={{
                  position: 'absolute',
                  top: 0, left: 0, width: '100%', height: '100%',
                  backgroundColor: isHovered ? 'rgba(0, 0, 0, 0.6)' : 'rgba(0, 0, 0, 0)',
                  display: 'flex', justifyContent: 'center', alignItems: 'center',
                  color: '#00ffff', fontSize: '16px', fontWeight: 'bold',
                  opacity: isHovered ? 1 : 0,
                  transition: 'all 0.3s ease',
                  textAlign: 'center'
                }}>
                  Change<br/>Photo
                </div>
              </div>

              <input type="file" accept="image/*" onChange={handleImageChange} style={{ display: 'none' }} />
            </label>
          </div>

          {/* Input fields */}
          {[
            { label: "Full Name", name: "name", type: "text" },
            { label: "Father's Name", name: "fatherName", type: "text" },
            { label: "College/University", name: "collegeName", type: "text" },
            { label: "Department", name: "dept", type: "text" },
            { label: "Class / Year", name: "studentClass", type: "text" },
            { label: "Session / Batch", name: "batch", type: "text" },
            { label: "Blood Group", name: "bloodGroup", type: "select" }, 
            { label: "Mobile Number", name: "phone", type: "text" },
            { label: "Facebook Link / Username", name: "fbLink", type: "text" },
            { label: "Instagram Link / Username", name: "instaLink", type: "text" }
          ].map((field, index) => (
            <div key={index} style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <label style={{ color: '#00ffff', fontSize: '12px', fontWeight: '600' }}>{field.label}:</label>
              
              {field.type === 'select' ? (
                <select
                  name={field.name}
                  value={formData[field.name] || ''}
                  onChange={handleChange}
                  style={{ width: '100%', padding: '10px 15px', backgroundColor: '#1a1f29', border: '1px solid #2c3545', borderRadius: '10px', color: '#ffffff', fontSize: '13px', outline: 'none', boxSizing: 'border-box', cursor: 'pointer' }}
                >
                  <option value="" disabled style={{ color: '#888' }}>Select Blood Group</option>
                  {bloodGroups.map((group, idx) => (
                    <option key={idx} value={group} style={{ backgroundColor: '#11151d', color: '#ffffff' }}>
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
                  required={field.name === 'name'}
                  style={{ width: '100%', padding: '10px 15px', backgroundColor: '#1a1f29', border: '1px solid #2c3545', borderRadius: '10px', color: '#ffffff', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }}
                />
              )}
            </div>
          ))}

          <div style={{ display: 'flex', gap: '15px', marginTop: '15px' }}>
            <button 
              type="button" 
              onClick={() => navigate(-1)} 
              style={{ flex: 1, padding: '12px', backgroundColor: '#2c3545', color: '#ffffff', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold' }}
            >
              Cancel
            </button>
            
            <button 
              type="submit" 
              disabled={updating}
              style={{ flex: 2, padding: '12px', background: 'linear-gradient(135deg, #00c6ff 0%, #0072ff 100%)', color: '#ffffff', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold', boxShadow: '0 4px 12px rgba(0,114,255,0.3)', opacity: updating ? 0.7 : 1 }}
            >
              {updating ? "Saving Changes..." : "Save Profile Info"}
            </button>
          </div>

        </div>
      </form>
    </div>
  );
}
