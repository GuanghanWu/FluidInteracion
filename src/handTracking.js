// MediaPipe GestureRecognizer 手势追踪
// 使用动态 import 确保加载完成

let gestureRecognizer = null;
let isGestureLoading = false;
let lastVideoTime = -1;
let GestureRecognizer = null;
let FilesetResolver = null;

export async function loadMediaPipe() {
  if (GestureRecognizer && FilesetResolver) return true;
  
  try {
    // 动态导入 MediaPipe
    const module = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/+esm');
    GestureRecognizer = module.GestureRecognizer;
    FilesetResolver = module.FilesetResolver;
    
    console.log('[Gesture] Module loaded:', !!GestureRecognizer, !!FilesetResolver);
    return true;
  } catch (err) {
    console.error('[Gesture] Load failed:', err);
    throw new Error('Failed to load MediaPipe: ' + err.message);
  }
}

export async function initGestureRecognizer() {
  if (gestureRecognizer) {
    console.log('[Gesture] Already initialized');
    return true;
  }
  if (isGestureLoading) {
    console.log('[Gesture] Still loading...');
    // 等待当前加载完成
    while (isGestureLoading) {
      await new Promise(r => setTimeout(r, 100));
    }
    return !!gestureRecognizer;
  }
  
  isGestureLoading = true;
  console.log('[Gesture] Initializing...');
  
  try {
    await loadMediaPipe();
    
    if (!GestureRecognizer || !FilesetResolver) {
      throw new Error('MediaPipe Tasks Vision not available');
    }
    
    console.log('[Gesture] Creating vision tasks...');
    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm'
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
    // 出错时重置状态，允许重试
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
