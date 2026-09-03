import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// 🔥 Browser Extension Block — element remove
const removeExtensionElements = () => {
  const selectors = [
    '[class*="wordtap"]',
    '[id*="wordtap"]',
    '[class*="WordTap"]',
    '[id*="WordTap"]',
    '[class*="extension"]',
    '[id*="extension"]',
    '[class*="chrome-extension"]',
    '[id*="chrome-extension"]',
    '[class*="tooltip"]:not([class*="admin"])',
    '[id*="tooltip"]:not([id*="admin"])'
  ];
  
  selectors.forEach(selector => {
    try {
      document.querySelectorAll(selector).forEach(el => {
        // শুধু root-এর বাইরের element remove
        if (!el.closest('#root')) {
          el.remove();
        }
      });
    } catch (err) {
      // invalid selector হলে ignore
    }
  });
};

// 🔥 Extension নতুন element inject করলে সাথে সাথে remove
const observer = new MutationObserver((mutations) => {
  mutations.forEach(mutation => {
    mutation.addedNodes.forEach(node => {
      if (node.nodeType === 1) {
        const el = node;
        const className = String(el.className || '').toLowerCase();
        const id = String(el.id || '').toLowerCase();
        
        if (
          className.includes('wordtap') ||
          className.includes('extension') ||
          className.includes('tooltip') ||
          id.includes('wordtap') ||
          id.includes('extension') ||
          id.includes('tooltip')
        ) {
          if (!el.closest('#root')) {
            el.remove();
          }
        }
      }
    });
  });
});

// Page ready হলে observe শুরু
if (document.body) {
  observer.observe(document.body, { childList: true, subtree: true });
} else {
  document.addEventListener('DOMContentLoaded', () => {
    observer.observe(document.body, { childList: true, subtree: true });
  });
}

// প্রতি ১ সেকেন্ডে check করুন
const extensionCleanup = setInterval(removeExtensionElements, 1000);

// Page load-এও check
window.addEventListener('load', removeExtensionElements);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
