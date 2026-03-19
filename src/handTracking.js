// MediaPipe GestureRecognizer 手势追踪
import { GestureRecognizer, FilesetResolver } from '@mediapipe/tasks-vision';

let gestureRecognizer = null;
let isGestureLoading = false;
let lastVideoTime = -1;
let frameCount = 0;

export async function initGestureRecognizer() {
  if (gestureRecognizer) return true;
  if (isGestureLoading) {
    while (isGestureLoading) {
      await new Promise(r => setTimeout(r, 100));
    }
    return !!gestureRecognizer;
  }

  isGestureLoading = true;

  try {
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
  frameCount++;
  
  if (!gestureRecognizer) {
    if (frameCount % 30 === 0) console.log('[Gesture] Recognizer not ready');
    return null;
  }
  
  // 每30帧打印一次调试信息
  const shouldLog = frameCount % 30 === 0;
  
  if (video.currentTime === lastVideoTime) {
    if (shouldLog) console.log('[Gesture] Video frame unchanged');
    return null;
  }
  
  lastVideoTime = video.currentTime;
  
  try {
    const results = gestureRecognizer.recognizeForVideo(video, performance.now());
    
    if (shouldLog) {
      console.log('[Gesture] Detection result:', {
        gestures: results.gestures?.length || 0,
        landmarks: results.landmarks?.length || 0
      });
    }
    
    if (results.gestures && results.gestures.length > 0 && 
        results.landmarks && results.landmarks.length > 0) {
      const landmarks = results.landmarks[0];
      const wrist = landmarks[0];
      const gestureName = results.gestures[0][0]?.categoryName || 'Unknown';
      
      console.log('[Gesture] Hand detected:', gestureName, 'at', wrist.x.toFixed(2), wrist.y.toFixed(2));
      
      return {
        x: wrist.x,
        y: wrist.y,
        gesture: gestureName,
        landmarks: landmarks
      };
    }
    
    return null;
  } catch (err) {
    console.error('[Gesture] Detection error:', err);
    return null;
  }
}

export function disposeGestureRecognizer() {
  if (gestureRecognizer) {
    gestureRecognizer.close();
    gestureRecognizer = null;
  }
}
