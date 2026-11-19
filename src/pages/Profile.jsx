// File Name: src/pages/Profile.jsx
import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { useParams, useNavigate } from 'react-router-dom';
import IDCard from '../components/IDCard';

export default function Profile() {
  const { userId } = useParams(); 
  const navigate = useNavigate();
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [show3DCardMap, setShow3DCardMap] = useState({});

  useEffect(() => {
    const usersRef = collection(db, "users");

    const unsubscribe = onSnapshot(usersRef, (snapshot) => {
      const allData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      
      const activeProfiles = allData.filter(user => {
        const isDeletedStatus = user.approved === "deleted";
        const isRemovedName = user.name === "Removed User";
        const isApprovedUser =
          user.approved === true ||
          String(user.approved).toLowerCase().trim() === "true" ||
          user.role === "admin" ||
          String(user.role).toLowerCase().trim() === "admin";

        return !isDeletedStatus && !isRemovedName && isApprovedUser;
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
      .then(() => alert("📋 ID card profile link copied to clipboard!"))
      .catch((err) => console.error("Link copy failed: ", err));
  };

  const toggle3DCard = (id) => {
    setShow3DCardMap(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const fallbackAvatar = (name) => `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name || 'Student')}`;

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        height: '70vh',
        color: 'var(--fb-blue)',
        fontSize: '15px',
        fontWeight: 'bold',
        gap: '8px'
      }}>
        <div>🪪 Loading Student Profiles...</div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', paddingBottom: '30px' }}>
      
      {profiles.map(user => {
        const isCurrentUser = auth.currentUser?.uid === user.id || auth.currentUser?.uid === user.uid;
        const profileUniqueId = user.uid || user.id || '';
        const userPhotoUrl = user.photo && user.photo.trim() !== '' ? user.photo : fallbackAvatar(user.name);
        const isShowing3D = show3DCardMap[user.id];

        return (
          <div key={user.id} className="fb-lite-card" style={{ overflow: 'hidden', marginBottom: '14px' }}>
            
            {/* FB Lite Cover Banner */}
            <div style={{
              height: '110px',
              background: 'linear-gradient(135deg, #1877f2 0%, #0056b3 100%)',
              position: 'relative'
            }}>
              <div style={{
                position: 'absolute',
                top: '10px',
                right: '12px',
                backgroundColor: 'rgba(0,0,0,0.3)',
                color: '#ffffff',
                padding: '3px 8px',
                borderRadius: '12px',
                fontSize: '11px',
                fontWeight: 'bold'
              }}>
                🎓 StudentConnect Verified
              </div>
            </div>

            {/* Profile Picture & Identity Block */}
            <div style={{
              padding: '0 16px 14px 16px',
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
              marginTop: '-50px'
            }}>
              {/* Circular Avatar with white border */}
              <div style={{ position: 'relative' }}>
                <img
                  src={userPhotoUrl}
                  alt={user.name || "Student"}
                  className="fb-avatar"
                  style={{
                    width: '96px',
                    height: '96px',
                    border: '3px solid var(--fb-card)',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                    backgroundColor: 'var(--fb-card)'
                  }}
                  onError={(e) => { e.target.onerror = null; e.target.src = fallbackAvatar(user.name); }}
                />
              </div>

              <h2 style={{
                margin: '8px 0 2px 0',
                fontSize: '20px',
                fontWeight: '700',
                color: 'var(--fb-text)'
              }}>
                {user.name}
              </h2>

              {user.fatherName && (
                <div style={{ fontSize: '12px', color: 'var(--fb-text-secondary)', marginBottom: '4px' }}>
                  Father: {user.fatherName}
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
                <span style={{
                  backgroundColor: 'var(--fb-blue-light)',
                  color: 'var(--fb-blue)',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  fontSize: '11px',
                  fontWeight: '700',
                  textTransform: 'uppercase'
                }}>
                  {String(user.role || 'Student').toUpperCase()}
                </span>
                <span style={{ fontSize: '12px', color: 'var(--fb-text-secondary)' }}>
                  ID: <strong>{user.idNo || 'STU-PENDING'}</strong>
                </span>
              </div>

              {/* Action Buttons Row */}
              <div style={{
                display: 'flex',
                gap: '8px',
                width: '100%',
                justifyContent: 'center',
                flexWrap: 'wrap',
                marginBottom: '16px'
              }}>
                <button
                  onClick={() => {
                    if (isCurrentUser) {
                      navigate('/messenger');
                    } else {
                      navigate(`/chat/${profileUniqueId}/${encodeURIComponent(user.name || 'Student')}`);
                    }
                  }}
                  className="fb-lite-btn fb-lite-btn-primary"
                  style={{ flex: 1, minWidth: '120px' }}
                >
                  <span>💬</span> {isCurrentUser ? "My Messages" : "Message"}
                </button>

                <button
                  onClick={() => toggle3DCard(user.id)}
                  className="fb-lite-btn fb-lite-btn-secondary"
                  style={{ flex: 1, minWidth: '120px' }}
                >
                  <span>🪪</span> {isShowing3D ? "Hide 3D Card" : "3D Flip ID Card"}
                </button>

                {isCurrentUser && (
                  <button
                    onClick={() => navigate('/edit-profile')}
                    className="fb-lite-btn fb-lite-btn-secondary"
                  >
                    <span>✏️</span> Edit Profile
                  </button>
                )}

                <button
                  onClick={() => handleCopyProfileLink(profileUniqueId)}
                  className="fb-lite-btn fb-lite-btn-secondary"
                  title="Copy Profile Link"
                >
                  <span>🔗</span> Copy Link
                </button>
              </div>

              {/* 3D Flip Card View */}
              {isShowing3D && (
                <div style={{ width: '100%', marginBottom: '16px', display: 'flex', justifyContent: 'center' }}>
                  <IDCard userData={user} />
                </div>
              )}

              {/* FB Lite "About / Student Details" Box */}
              <div style={{
                width: '100%',
                textAlign: 'left',
                backgroundColor: 'var(--fb-hover)',
                borderRadius: '8px',
                padding: '12px 14px',
                border: '1px solid var(--fb-card-border-subtle)'
              }}>
                <strong style={{ display: 'block', fontSize: '14px', marginBottom: '10px', color: 'var(--fb-text)' }}>
                  Student & Academic Info
                </strong>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {[
                    { icon: "🏛️", label: "College / University", value: user.collegeName || user.institute || 'N/A' },
                    { icon: "🏢", label: "Department", value: user.dept || 'N/A' },
                    { icon: "📚", label: "Class / Year", value: user.studentClass || 'N/A' },
                    { icon: "🎓", label: "Session / Batch", value: user.batch || user.session || 'N/A' },
                    { icon: "🩸", label: "Blood Group", value: user.bloodGroup || user.blood || 'N/A', isBlood: true },
                    { icon: "📞", label: "Phone", value: user.phone || user.mobile || 'N/A' },
                    { icon: "✉️", label: "Email", value: user.email || 'N/A' }
                  ].map((field, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                      <span style={{ fontSize: '15px', width: '20px' }}>{field.icon}</span>
                      <span style={{ color: 'var(--fb-text-secondary)', width: '130px' }}>{field.label}:</span>
                      <strong style={{
                        color: field.isBlood ? 'var(--fb-red)' : 'var(--fb-text)',
                        wordBreak: 'break-all',
                        flex: 1
                      }}>
                        {field.value}
                      </strong>
                    </div>
                  ))}
                </div>

                {/* Social Links */}
                {(user.fbLink || user.instaLink) && (
                  <div style={{
                    display: 'flex',
                    gap: '10px',
                    marginTop: '12px',
                    paddingTop: '10px',
                    borderTop: '1px solid var(--fb-divider)'
                  }}>
                    {user.fbLink && (
                      <a
                        href={user.fbLink.includes('http') ? user.fbLink : `https://${user.fbLink}`}
                        target="_blank"
                        rel="noreferrer"
                        className="fb-lite-btn fb-lite-btn-secondary"
                        style={{ fontSize: '12px', padding: '6px 12px' }}
                      >
                        🌐 Facebook
                      </a>
                    )}
                    {user.instaLink && (
                      <a
                        href={user.instaLink.includes('http') ? user.instaLink : `https://${user.instaLink}`}
                        target="_blank"
                        rel="noreferrer"
                        className="fb-lite-btn fb-lite-btn-secondary"
                        style={{ fontSize: '12px', padding: '6px 12px' }}
                      >
                        📷 Instagram
                      </a>
                    )}
                  </div>
                )}
              </div>

            </div>

          </div>
        );
      })}

      {profiles.length === 0 && (
        <div className="fb-lite-card" style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--fb-text-secondary)' }}>
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>🪪</div>
          <strong>No matching student profiles found</strong>
          <p style={{ fontSize: '13px', marginTop: '4px' }}>Try searching with a different name or student ID.</p>
        </div>
      )}

    </div>
  );
}
