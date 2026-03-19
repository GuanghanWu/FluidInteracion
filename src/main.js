/**
 * Camera Hand Tracker
 * Version: 0.50-fix5 - 使用标准 getUserMedia
 */

// DOM 元素
const cameraSwitch = document.getElementById('cameraSwitch');
const cameraPreview = document.getElementById('cameraPreview');
const previewVideo = document.getElementById('previewVideo');
const statusEl = document.getElementById('status');
const handPosEl = document.getElementById('handPos');
const bgColorEl = document.getElementById('bgColor');

// 状态
let isCameraActive = false;
let hands = null;
let animationId = null;
let frameCount = 0;

// 初始化
init();

function init() {
  cameraSwitch.addEventListener('click', () => {
    const isActive = cameraSwitch.classList.toggle('active');
    if (isActive) {
      startCamera();
    } else {
      stopCamera();
    }
  });
}

// Debug Log 函数
function debugLog(level, msg) {
  const logContent = document.getElementById('debugLogContent');
  if (!logContent) return;
  
  const colors = { info: '#00ffff', warning: '#ffff00', error: '#ff6666' };
  const time = new Date().toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const entry = document.createElement('div');
  entry.style.cssText = 'margin-bottom: 2px; padding: 2px 0; border-bottom: 1px solid rgba(0,255,255,0.1); color: #fff; font-size: 11px;';
  entry.innerHTML = `<span style="color: #888;">[${time}]</span> <span style="color: ${colors[level] || colors.info}; font-weight: bold;">${level.toUpperCase()}</span>: ${msg}`;
  logContent.appendChild(entry);
  logContent.scrollTop = logContent.scrollHeight;
}

async function startCamera() {
  statusEl.textContent = 'Loading...';
  statusEl.style.color = '#ff0';
  debugLog('info', 'Starting camera...');

  try {
    if (typeof Hands === 'undefined') {
      throw new Error('MediaPipe not loaded yet');
    }

    statusEl.textContent = 'Initializing...';
    debugLog('info', 'MediaPipe loaded, initializing Hands...');

    hands = new Hands({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${file}`
    });

    hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.3,
      minTrackingConfidence: 0.3
    });

    hands.onResults(onResults);

    // 使用标准 getUserMedia
    debugLog('info', 'Requesting camera permission...');
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { 
        width: { ideal: 320 },
        height: { ideal: 240 },
        facingMode: 'user'
      }
    });

    previewVideo.srcObject = stream;
    
    // 等待视频准备好
    await new Promise((resolve) => {
      previewVideo.onloadedmetadata = () => {
        debugLog('info', `Video metadata: ${previewVideo.videoWidth}x${previewVideo.videoHeight}`);
        resolve();
      };
    });

    await previewVideo.play();
    debugLog('info', `Video playing: ${previewVideo.videoWidth}x${previewVideo.videoHeight}`);

    isCameraActive = true;
    cameraPreview.style.display = 'block';
    statusEl.textContent = 'Active - Show your hand';
    statusEl.style.color = '#0f0';

    // 开始检测循环
    detectLoop();

  } catch (error) {
    statusEl.textContent = 'Error: ' + error.message;
    statusEl.style.color = '#f00';
    debugLog('error', error.message);
    cameraSwitch.classList.remove('active');
  }
}

async function detectLoop() {
  if (!isCameraActive) return;

  if (previewVideo.readyState >= 2 && hands) {
    await hands.send({ image: previewVideo });
  }

  animationId = requestAnimationFrame(detectLoop);
}

function stopCamera() {
  isCameraActive = false;
  
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }

  if (previewVideo.srcObject) {
    previewVideo.srcObject.getTracks().forEach(track => track.stop());
    previewVideo.srcObject = null;
  }

  if (hands) {
    hands.close();
    hands = null;
  }

  cameraPreview.style.display = 'none';
  statusEl.textContent = 'Off';
  statusEl.style.color = '#fff';
  handPosEl.textContent = '--';
  document.body.style.background = '#000';
  bgColorEl.textContent = '#000000';
  debugLog('info', 'Camera stopped');
}

function onResults(results) {
  frameCount++;

  if (frameCount % 30 === 0) {
    const handCount = results.multiHandLandmarks?.length || 0;
    debugLog('info', `Frame ${frameCount}: ${handCount} hand(s)`);
  }

  if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
    const wrist = results.multiHandLandmarks[0][0];
    const x = wrist.x;
    const y = wrist.y;

    handPosEl.textContent = `${(x * 100).toFixed(0)}%, ${(y * 100).toFixed(0)}%`;

    const r = Math.floor(x * 255);
    const g = Math.floor((1 - y) * 128);
    const b = Math.floor((1 - x) * 255);
    const color = `rgb(${r}, ${g}, ${b})`;

    document.body.style.background = color;
    bgColorEl.textContent = color;

    if (frameCount % 30 === 0) {
      debugLog('info', `Hand at ${(x*100).toFixed(0)}%, ${(y*100).toFixed(0)}%`);
    }
  } else {
    handPosEl.textContent = 'Not detected';
    document.body.style.background = '#000';
    bgColorEl.textContent = '#000000';
  }
}
