// MediaPipe GestureRecognizer 手势追踪
// 使用 script 标签加载的 MediaPipe

let gestureRecognizer = null;
let isGestureLoading = false;
let lastVideoTime = -1;

function waitForMediaPipe() {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const maxAttempts = 50; // 5秒超时
    
    function check() {
      if (window.GestureRecognizer && window.FilesetResolver) {
        resolve({
          GestureRecognizer: window.GestureRecognizer,
          FilesetResolver: window.FilesetResolver
        });
        return;
      }
      
      attempts++;
      if (attempts >= maxAttempts) {
        reject(new Error('MediaPipe loading timeout'));
        return;
      }
      
      setTimeout(check, 100);
    }
    
    check();
  });
}

export async function initGestureRecognizer() {
  if (gestureRecognizer) return true;
  if (isGestureLoading) {
    // 等待当前加载完成
    while (isGestureLoading) {
      await new Promise(r => setTimeout(r, 100));
    }
    return !!gestureRecognizer;
  }
  
  isGestureLoading = true;
  
  try {
    console.log('[Gesture] Waiting for MediaPipe...');
    const { GestureRecognizer, FilesetResolver } = await waitForMediaPipe();
    
    console.log('[Gesture] Creating vision tasks...');
    const vision = await FilesetResolver.forVisionTasks(
      'https://fastly.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm'
    );
    
    console.log('[Gesture] Loading model...');
    gestureRecognizer = await GestureRecognizer.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task',
        delegate: 'GPU'
      },
      runningMode: 'VIDEO',
      numHands: 1
    });
    
    console.log('[Gesture] Initialized successfully');
    return true;
  } catch (err) {
    console.error('[Gesture] Init failed:', err);
    gestureRecognizer = null;
    throw err;
  } finally {
    isGestureLoading = false;
  }
}

export function detectGesture(video) {
  if (!gestureRecognizer || video.currentTime === lastVideoTime) {
    return null;
  }
  
  lastVideoTime = video.currentTime;
  const results = gestureRecognizer.recognizeForVideo(video, performance.now());
  
  if (results.gestures.length > 0 && results.landmarks.length > 0) {
    const landmarks = results.landmarks[0];
    const wrist = landmarks[0];
    
    return {
      x: wrist.x,
      y: wrist.y,
      gesture: results.gestures[0][0].categoryName,
      landmarks: landmarks
    };
  }
  
  return null;
}

export function disposeGestureRecognizer() {
  if (gestureRecognizer) {
    gestureRecognizer.close();
    gestureRecognizer = null;
  }
}
