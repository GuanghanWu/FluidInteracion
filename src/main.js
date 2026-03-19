// v0.51 - 使用谷歌官方方式

const videoElement = document.getElementById('video');
const startBtn = document.getElementById('startBtn');
const statusEl = document.getElementById('status');
const handInfo = document.getElementById('handInfo');
const logEl = document.getElementById('log');

let hands;
let camera;

function log(msg) {
  const div = document.createElement('div');
  div.textContent = msg;
  logEl.appendChild(div);
  logEl.scrollTop = logEl.scrollHeight;
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
    
    if (Math.random() < 0.05) {  // 5% chance to log
      log(`Detected at ${x}%, ${y}%`);
    }
  } else {
    handInfo.textContent = 'No hand';
    document.body.style.background = '#000';
  }
}

startBtn.addEventListener('click', () => {
  if (!camera) {
    log('Initializing...');
    
    hands = new Hands({locateFile: (file) => {
      return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
    }});
    
    hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });
    
    hands.onResults(onResults);
    
    camera = new Camera(videoElement, {
      onFrame: async () => {
        await hands.send({image: videoElement});
      },
      width: 320,
      height: 240
    });
    
    camera.start()
      .then(() => {
        statusEl.textContent = 'Running';
        statusEl.style.color = '#0f0';
        videoElement.style.display = 'block';
        startBtn.textContent = 'STOP';
        log('Camera started');
      })
      .catch(err => {
        log('Error: ' + err.message);
        statusEl.textContent = 'Error';
        statusEl.style.color = '#f00';
      });
  } else {
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
