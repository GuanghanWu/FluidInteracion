/**
 * Camera Hand Tracker
 * Version: 0.50 - 最简版，只检测手的位置改变背景颜色
 */

// DOM 元素
const cameraToggle = document.getElementById('cameraToggle');
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
  cameraToggle.addEventListener('change', (e) => {
    if (e.target.checked) {
      startCamera();
    } else {
      stopCamera();
    }
  });
}

async function startCamera() {
  statusEl.textContent = 'Loading MediaPipe...';
  statusEl.style.color = '#ff0';

  try {
    // 动态加载 MediaPipe
    const [{ Hands }, { Camera }] = await Promise.all([
      import('https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/+esm'),
      import('https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils@0.3.1675466862/+esm')
    ]);

    statusEl.textContent = 'Initializing...';

    // 创建 Hands 实例
    hands = new Hands({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${file}`
    });

    hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 0, // 轻量级
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
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

    isCameraActive = true;
    cameraPreview.style.display = 'block';
    statusEl.textContent = 'Active - Show your hand';
    statusEl.style.color = '#0f0';

  } catch (error) {
    statusEl.textContent = 'Error: ' + error.message;
    statusEl.style.color = '#f00';
    console.error(error);
    cameraToggle.checked = false;
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

function onResults(results) {
  if (!isCameraActive) return;

  if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
    // 获取手腕位置 (landmark 0)
    const wrist = results.multiHandLandmarks[0][0];
    const x = wrist.x; // 0-1
    const y = wrist.y; // 0-1

    // 更新显示
    handPosEl.textContent = `${(x * 100).toFixed(0)}%, ${(y * 100).toFixed(0)}%`;

    // 根据坐标改变背景颜色
    // X: 蓝色到红色, Y: 深色到亮色
    const r = Math.floor(x * 255);
    const g = Math.floor((1 - y) * 128);
    const b = Math.floor((1 - x) * 255);
    const color = `rgb(${r}, ${g}, ${b})`;

    document.body.style.background = color;
    bgColorEl.textContent = color;

  } else {
    handPosEl.textContent = 'Not detected';
    document.body.style.background = '#000';
    bgColorEl.textContent = '#000000';
  }
}
