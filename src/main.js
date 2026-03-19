// v0.51-fix - 检查库加载状态

const videoElement = document.getElementById('video');
const startBtn = document.getElementById('startBtn');
const statusEl = document.getElementById('status');
const handInfo = document.getElementById('handInfo');
const logEl = document.getElementById('log');

let hands;
let camera;

function log(msg) {
  const div = document.createElement('div');
  const time = new Date().toLocaleTimeString('zh-CN', {hour12: false});
  div.textContent = `[${time}] ${msg}`;
  logEl.appendChild(div);
  logEl.scrollTop = logEl.scrollHeight;
  console.log(msg);
}

// 检查库是否加载
log('Checking libraries...');
if (typeof Hands === 'undefined') {
  log('ERROR: Hands not loaded');
} else {
  log('Hands loaded OK');
}
if (typeof Camera === 'undefined') {
  log('ERROR: Camera not loaded');
} else {
  log('Camera loaded OK');
}

function onResults(results) {
  if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
    const landmarks = results.multiHandLandmarks[0];
    const wrist = landmarks[0];
    const x = Math.round(wrist.x * 100);
    const y = Math.round(wrist.y * 100);
    
    handInfo.textContent = `Hand: ${x}%, ${y}%`;
    
    // Change background color based on hand position
    const r = Math.round(wrist.x * 255);
    const g = Math.round((1 - wrist.y) * 128);
    const b = Math.round((1 - wrist.x) * 255);
    document.body.style.background = `rgb(${r},${g},${b})`;
    
    // Log occasionally
    if (Math.random() < 0.02) {
      log(`Hand: ${x}%, ${y}%`);
    }
  } else {
    handInfo.textContent = 'No hand detected';
    document.body.style.background = '#000';
  }
}

startBtn.addEventListener('click', async () => {
  if (!camera) {
    log('Starting...');
    
    if (typeof Hands === 'undefined') {
      log('ERROR: MediaPipe Hands not loaded');
      return;
    }
    if (typeof Camera === 'undefined') {
      log('ERROR: MediaPipe Camera not loaded');
      return;
    }
    
    try {
      hands = new Hands({locateFile: (file) => {
        log(`Loading: ${file}`);
        return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
      }});
      
      hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
      });
      
      hands.onResults(onResults);
      
      log('Creating camera...');
      camera = new Camera(videoElement, {
        onFrame: async () => {
          await hands.send({image: videoElement});
        },
        width: 320,
        height: 240
      });
      
      log('Starting camera...');
      await camera.start();
      
      statusEl.textContent = 'Running';
      statusEl.style.color = '#0f0';
      videoElement.style.display = 'block';
      startBtn.textContent = 'STOP';
      log('Camera started! Show your hand');
      
    } catch (err) {
      log('ERROR: ' + err.message);
      console.error(err);
      statusEl.textContent = 'Error';
      statusEl.style.color = '#f00';
    }
  } else {
    log('Stopping...');
    camera.stop();
    hands.close();
    camera = null;
    hands = null;
    statusEl.textContent = 'Off';
    statusEl.style.color = '#fff';
    videoElement.style.display = 'none';
    startBtn.textContent = 'START CAMERA';
    handInfo.textContent = 'No hand';
    document.body.style.background = '#000';
    log('Camera stopped');
  }
});
