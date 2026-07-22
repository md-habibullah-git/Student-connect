import React from 'react';
import './IDCard.css';

export default function IDCard({ userData }) {
  // Live data is being loaded from the database (if not available, it will show default text)
  const user = userData || {
    uid: "dummy_uid",
    name: "Student Name",
    idNo: "STU-2026-0000",
    dept: "Department",
    batch: "2024-2026",
    blood: "O+",
    phone: "Not Set",
    email: "student@email.com",
    address: "Not Set",
    photo: "https://placeholder.com",
    institute: "YOUR INSTITUTE NAME", // Your school/college name
    validFrom: "01/01/2024",
    validTo: "31/12/2026"
  };

  return (
    <div className="profile-container">
      
      {/* 3D Flip ID Card */}
      <div className="id-card-flip">
        <div className="id-card-inner">
          
          {/* 💳 Front Side of the CARD */}
          <div className="id-card-front">
            <div className="card-header" style={{ background: 'linear-gradient(135deg, #0056b3, #0088ff)', color: 'white', padding: '12px' }}>
              {/* 🎯 1. As per your request, STUDENT-CONNECT has been permanently set at the top of the card. */}
              <h3 style={{ margin: '0 0 4px 0', fontSize: '16px', letterSpacing: '0.5px', textTransform: 'uppercase', fontWeight: 'bold' }}>
                STUDENT-CONNECT
              </h3>
              <p style={{ margin: 0, fontSize: '11px', opacity: 0.9, fontWeight: 'bold', color: '#ffeb3b' }}>STUDENT IDENTITY CARD</p>
            </div>
            
            <div className="card-body">
              <div className="photo-section">
                <img src={user.photo} alt="Student" className="student-photo" />
                <div className="verified-seal">VERIFIED</div>
              </div>
              
              <div className="info-section">
                <h3>{user.name}</h3>
                <p><strong>ID No / Roll No:</strong> {user.idNo}</p>
                <p><strong>Department / Class:</strong> {user.dept}</p>
                {/* 🎯 2. As per your request, the institution's name has been added directly below the Department / Class. */}
                <p><strong>Institute:</strong> {user.institute || "Not Set"}</p>
                <p><strong>Batch / Year:</strong> {user.batch || "Not Set"}</p>
                <p><strong>Blood Group:</strong> <span className="blood">{user.blood || "O+"}</span></p>
              </div>
            </div>
            
            <div className="card-footer">
              <img src={`https://qrserver.com{user.uid}`} alt="QR Code" className="qr-code" />
              <div className="signature">
                <p className="sig-line">Admin</p>
                <span>Authorized Sign</span>
              </div>
            </div>
          </div>

          {/* 📑 Back Side of the CARD */}
          <div className="id-card-back">
            <div className="card-header-back">
              <h4>EMERGENCY DETAILS</h4>
            </div>
            <div className="card-body-back">
              <p><strong>Phone:</strong> {user.phone || "Not Set"}</p>
              <p><strong>Email:</strong> {user.email}</p>
              <p><strong>Address:</strong> {user.address || "Not Set"}</p>
              <p><strong>Validity:</strong> {user.validFrom || "01/01/2024"} to {user.validTo || "31/12/2026"}</p>
              
              <div className="terms">
                <p>* This card is non-transferable.</p>
                <p>* If found, please return to the admin panel.</p>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* 👤 Quick Action Button */}
      <div className="lite-action-buttons">
        <button 
          className="btn-msg" 
          onClick={() => window.location.href = `/chat/${user.uid}/${user.name}`}
          style={{ width: '100%', padding: '10px', background: '#0056b3', color: 'white', border: 'none', borderRadius: '5px', fontWeight: 'bold', cursor: 'pointer', marginTop: '15px' }}
        >
          📩 Private Message & Call
        </button>
      </div>

    </div>
  );
}
