// MediaPipe GestureRecognizer 手势追踪
// 使用新版 @mediapipe/tasks-vision API

let gestureRecognizer = null;
let isGestureLoading = false;
let lastVideoTime = -1;

export async function initGestureRecognizer() {
  if (gestureRecognizer) return true;
  if (isGestureLoading) return false;
  
  isGestureLoading = true;
  console.log('[Gesture] Initializing...');
  
  try {
    const { GestureRecognizer, FilesetResolver } = window;
    
    if (!GestureRecognizer || !FilesetResolver) {
      throw new Error('MediaPipe Tasks Vision not loaded');
    }
    
    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm'
    );
    
    gestureRecognizer = await GestureRecognizer.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task',
        delegate: 'GPU'
      },
      runningMode: 'VIDEO',
      numHands: 1
    });
    
    console.log('[Gesture] Initialized successfully');
    isGestureLoading = false;
    return true;
  } catch (err) {
    console.error('[Gesture] Init failed:', err);
    isGestureLoading = false;
    throw err;
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
    const wrist = landmarks[0];  // 手腕位置
    
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
