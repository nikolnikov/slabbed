import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.scss'
import App from './App.tsx'

// iOS Safari ignores user-scalable=no in the viewport tag, so cancel its pinch gestures directly.
// These are Safari's own gesture events; pointer-based pinching (the photo cropper) is unaffected.
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(type, (event) => event.preventDefault(), { passive: false })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
