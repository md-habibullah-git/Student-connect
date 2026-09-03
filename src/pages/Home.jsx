// ✅ Space bar দিয়ে Play/Pause (Fullscreen-এও কাজ করবে)
useEffect(() => {
  const handleKeyDown = (e) => {
    if (e.code === 'Space' || e.key === ' ' || e.keyCode === 32) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return;
      }
      e.preventDefault();
      const activeVideoId = activeVideoIdRef.current;
      if (activeVideoId) {
        const video = videoElementsRef.current[activeVideoId];
        if (video) {
          if (video.paused) {
            playVideo(activeVideoId);
          } else {
            pauseVideo(activeVideoId);
          }
        }
      }
    }
  };

  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, []);

