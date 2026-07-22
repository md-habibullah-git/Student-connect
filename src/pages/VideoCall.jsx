import React from 'react';
import { ZegoUIKitPrebuilt } from '@zegocloud/zego-uikit-prebuilt';
import { auth } from '../firebase';

export default function VideoCall({ roomId }) {
  // roomId can be 'global-group-call' or any personal chat ID
  const roomID = roomId || "global-group-call"; 

  const myMeeting = async (element) => {
    // Insert your AppID and ServerSecret obtained from the ZegoCloud console here
    const appID = 123456789; // Insert your actual AppID (Number)
    const serverSecret = "your_server_secret_here"; // Insert your actual Secret (String)
    
    const kitToken = ZegoUIKitPrebuilt.generateKitTokenForTest(
      appID, 
      serverSecret, 
      roomID, 
      auth.currentUser?.uid || Date.now().toString(), 
      auth.currentUser?.displayName || "Student User"
    );

    const zp = ZegoUIKitPrebuilt.create(kitToken);
    zp.joinRoom({
      container: element,
      sharedLinks: [{
        name: 'Copy Call Link',
        url: window.location.protocol + '//' + window.location.host + window.location.pathname + '?roomID=' + roomID,
      }],
      scenario: {
        mode: ZegoUIKitPrebuilt.GroupCall, // For group calls, use GroupCall; for personal calls, you can use OneONoneCall.
      },
      showScreenSharingButton: true,
    });
  };

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <div ref={myMeeting} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}
