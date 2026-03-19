/**
 * Camera Hand Tracker
 * Version: 0.50-fix2 - 使用全局 MediaPipe
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
let camera = null;

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

async function startCamera() {
  statusEl.textContent = 'Loading...';
  statusEl.style.color = '#ff0';

  try {
    // 检查 MediaPipe 是否加载
    if (typeof Hands === 'undefined' || typeof Camera === 'undefined') {
      throw new Error('MediaPipe not loaded yet, please wait');
    }

    statusEl.textContent = 'Initializing...';

    // 创建 Hands 实例
    hands = new Hands({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${file}`
    });

    hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1, // 试试中等复杂度
      minDetectionConfidence: 0.3, // 降低阈值
      minTrackingConfidence: 0.3
    });

    hands.onResults(onResults);

    // 启动摄像头
    camera = new Camera(previewVideo, {
      onFrame: async () => {
        await hands.send({ image: previewVideo });
      },
      width: 320,
      height: 240
    });

    await camera.start();

    // 检查视频是否正常工作
    console.log('[Debug] Video readyState:', previewVideo.readyState);
    console.log('[Debug] Video size:', previewVideo.videoWidth, 'x', previewVideo.videoHeight);

    isCameraActive = true;
    cameraPreview.style.display = 'block';
    statusEl.textContent = 'Active - Show your hand';
    statusEl.style.color = '#0f0';

  } catch (error) {
    statusEl.textContent = 'Error: ' + error.message;
    statusEl.style.color = '#f00';
    console.error(error);
    cameraSwitch.classList.remove('active');
    
    // 如果 MediaPipe 没加载，3秒后重试
    if (error.message.includes('not loaded')) {
      setTimeout(() => {
        if (cameraSwitch.classList.contains('active')) {
          startCamera();
        }
      }, 3000);
    }
  }
}

function stopCamera() {
  isCameraActive = false;
  if (camera) {
    camera.stop();
    camera = null;
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
}

let frameCount = 0;

function onResults(results) {
  if (!isCameraActive) return;

  frameCount++;

  // 每30帧打印一次调试信息
  if (frameCount % 30 === 0) {
    console.log('[Debug] Frame:', frameCount, 'Hands:', results.multiHandLandmarks?.length || 0);
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
      console.log('[Debug] Hand detected at:', x.toFixed(2), y.toFixed(2));
    }
  } else {
    handPosEl.textContent = 'Not detected';
    document.body.style.background = '#000';
    bgColorEl.textContent = '#000000';
  }
}
