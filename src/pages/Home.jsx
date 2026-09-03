// File Name: src/pages/Home.jsx

import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { db, auth } from '../firebase';
import { 
  collection, addDoc, query, onSnapshot, doc, updateDoc, 
  arrayUnion, arrayRemove, deleteDoc, getDocs, where 
} from 'firebase/firestore';
import { FilePicker } from '@capawesome/capacitor-file-picker';
import FileManager from './FileManager'; // ✅ নতুন import

const CLOUDINARY_CLOUD_NAME = 'hvdnthrl';
const CLOUDINARY_UPLOAD_PRESET = 'student-connect';
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

// ... বাকি সব constant এবং function একই থাকবে ...

export default function Home({ isAdmin }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { postId: targetPostId } = useParams();

  const [posts, setPosts] = useState([]);
  const [text, setText] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [isPosting, setIsPosting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [commentInput, setCommentInput] = useState({});
  const [showPostModal, setShowPostModal] = useState(false);
  const [expandedImage, setExpandedImage] = useState(null);
  const [fileInputKey, setFileInputKey] = useState(Date.now());
  const [showFileManager, setShowFileManager] = useState(false); // ✅ নতুন state
  
  // ... বাকি সব state এবং ref একই থাকবে ...

  const handleFileSelect = (file) => {
    const previewUrl = URL.createObjectURL(file);
    setSelectedFile({
      kind: file.type.startsWith('video/') ? 'video' : 'image',
      file: file,
      previewUrl: previewUrl,
      fileName: file.name,
      fileSize: file.size,
      selectedAt: Date.now()
    });
  };

  const openFileManager = () => {
    setShowFileManager(true);
  };

  const closeFileManager = () => {
    setShowFileManager(false);
  };

  const handleFileChange = async (e) => {
    // 📱 Native App (Capacitor)
    if (window.Capacitor?.isNativePlatform?.()) {
      try {
        const result = await FilePicker.pickFiles({
          readData: true,
        });
        
        if (result && result.files && result.files.length > 0) {
          const pickedFile = result.files[0];
          
          let blob = null;
          const fileType = pickedFile.mimeType || 'image/jpeg';
          const fileName = pickedFile.name || `file-${Date.now()}.jpg`;
          
          if (!fileType.startsWith('image/') && !fileType.startsWith('video/')) {
            alert("Please select an image or video file.");
            return;
          }
          
          if (pickedFile.data) {
            const base64Data = pickedFile.data.replace(/^data:.*;base64,/, '');
            const byteCharacters = atob(base64Data);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
              byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            blob = new Blob([byteArray], { type: fileType });
          }
          
          if (!blob) return;
          
          const file = new File([blob], fileName, { type: fileType });
          
          if (fileType.startsWith('video/')) {
            if (file.size > MAX_VIDEO_BYTES) {
              alert("This video is larger than 100MB. Please choose a smaller video file.");
              resetFileInput();
              return;
            }
          }
          
          handleFileSelect(file);
        }
      } catch (err) {
        console.error("File picker error:", err);
      }
      return;
    }
    
    // 🌐 Web Version - কাস্টম File Manager খুলবে
    openFileManager();
  };

  // ... বাকি সব function একই থাকবে ...

  return (
    <div style={{ 
      maxWidth: '500px', 
      margin: 'auto', 
      fontFamily: 'Arial', 
      padding: '0', 
      height: '100vh',
      overflowY: 'scroll',
      WebkitOverflowScrolling: 'touch',
      scrollbarWidth: 'none'
    }}>
      
      {/* ... style tag একই থাকবে ... */}

      {/* File Manager Modal */}
      {showFileManager && (
        <FileManager
          onSelectFile={handleFileSelect}
          onClose={closeFileManager}
        />
      )}

      {/* ... বাকি UI একই থাকবে ... */}

      {showPostModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000 }}>
          <div style={{ backgroundColor: 'var(--bg, #fff)', padding: '20px', borderRadius: '8px', width: '90%', maxWidth: '450px', position: 'relative', boxShadow: '0 4px 15px rgba(0,0,0,0.2)' }}>
            {/* ... modal content ... */}
            
            <div style={{ marginTop: '12px', width: '95%' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: 'var(--text, #555)', marginBottom: '5px' }}>Upload from Device:</label>
              
              {/* ✅ সব platform-এ File Manager খুলবে */}
              <button
                type="button"
                onClick={handleFileChange}
                style={{ 
                  padding: '10px 15px', 
                  backgroundColor: '#0056b3', 
                  color: '#fff', 
                  border: 'none', 
                  borderRadius: '5px', 
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 'bold'
                }}
              >
                📁 Open File Manager
              </button>

              {/* ... file preview ... */}
            </div>
            
            {/* ... rest of modal ... */}
          </div>
        </div>
      )}

      {/* ... বাকি UI একই থাকবে ... */}
    </div>
  );
}
