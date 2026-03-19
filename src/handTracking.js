// MediaPipe GestureRecognizer 手势追踪
import { GestureRecognizer, FilesetResolver } from '@mediapipe/tasks-vision';

let gestureRecognizer = null;
let isGestureLoading = false;
let lastVideoTime = -1;
let frameCount = 0;
let processingCanvas = null;
let processingCtx = null;

// 辅助函数：写入 Debug Log 面板
function logToPanel(level, msg) {
  const logContent = document.getElementById('debugLogContent');
  if (logContent) {
    const colors = { info: '#00ffff', warning: '#ffff00', error: '#ff6666' };
    const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    const entry = document.createElement('div');
    entry.style.cssText = 'margin-bottom: 4px; padding: 4px 0; border-bottom: 1px solid rgba(0,255,255,0.2); color: #fff;';
    entry.innerHTML = `<span style="color: #888;">[${time}]</span> <span style="color: ${colors[level] || colors.info}; font-weight: bold;">${level.toUpperCase()}</span>: ${msg}`;
    logContent.appendChild(entry);
    logContent.scrollTop = logContent.scrollHeight;
  }
  console.log(`[${level}]`, msg);
}

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
    logToPanel('info', '[Gesture] Loading MediaPipe...');
    const vision = await FilesetResolver.forVisionTasks(
      'https://fastly.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm'
    );

    logToPanel('info', '[Gesture] Creating recognizer...');
    try {
      gestureRecognizer = await GestureRecognizer.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task',
          delegate: 'GPU'
        },
        runningMode: 'VIDEO',
        numHands: 1
      });
      logToPanel('info', '[Gesture] GPU mode active');
    } catch (gpuErr) {
      logToPanel('warning', '[Gesture] GPU failed, trying CPU...');
      gestureRecognizer = await GestureRecognizer.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task',
          delegate: 'CPU'
        },
        runningMode: 'VIDEO',
        numHands: 1
      });
      logToPanel('info', '[Gesture] CPU mode active');
    }

    // 创建处理用的 canvas（解决镜像问题）
    processingCanvas = document.createElement('canvas');
    processingCanvas.width = 640;
    processingCanvas.height = 480;
    processingCtx = processingCanvas.getContext('2d');
    logToPanel('info', '[Gesture] Processing canvas created');

    logToPanel('info', '[Gesture] Ready!');
    return true;
  } catch (err) {
    logToPanel('error', '[Gesture] Init failed: ' + err.message);
    gestureRecognizer = null;
    throw err;
  } finally {
    isGestureLoading = false;
  }
}

export function detectGesture(video) {
  frameCount++;
  
  if (!gestureRecognizer) {
    if (frameCount % 60 === 0) logToPanel('info', '[Gesture] Not ready yet');
    return null;
  }
  
  if (video.currentTime === lastVideoTime) {
    return null;
  }
  
  lastVideoTime = video.currentTime;
  
  try {
    // 将视频绘制到 canvas（不翻转，解决镜像问题）
    if (processingCanvas && processingCtx) {
      processingCtx.drawImage(video, 0, 0, processingCanvas.width, processingCanvas.height);
    }
    
    if (frameCount % 60 === 0) {
      logToPanel('info', `[Gesture] Analyzing frame ${frameCount}...`);
    }
    
    // 使用 canvas 代替 video 传给 MediaPipe
    const source = processingCanvas || video;
    const results = gestureRecognizer.recognizeForVideo(source, performance.now());
    
    if (frameCount % 60 === 0) {
      const gestureCount = results.gestures?.length || 0;
      const landmarkCount = results.landmarks?.length || 0;
      logToPanel('info', `[Gesture] Results: ${gestureCount} gestures, ${landmarkCount} landmarks`);
    }
    
    if (results.gestures && results.gestures.length > 0 && 
        results.landmarks && results.landmarks.length > 0) {
      const landmarks = results.landmarks[0];
      const wrist = landmarks[0];
      const gestureName = results.gestures[0][0]?.categoryName || 'Unknown';
      
      logToPanel('info', `[Gesture] Detected: ${gestureName}`);
      
      return {
        x: wrist.x,
        y: wrist.y,
        gesture: gestureName,
        landmarks: landmarks
      };
    }
    
    if (frameCount % 60 === 0) {
      logToPanel('info', `[Gesture] No hand (frame ${frameCount})`);
    }
    
    return null;
  } catch (err) {
    logToPanel('error', '[Gesture] Error: ' + err.message);
    return null;
  }
}

export function disposeGestureRecognizer() {
  if (gestureRecognizer) {
    gestureRecognizer.close();
    gestureRecognizer = null;
  }
  processingCanvas = null;
  processingCtx = null;
}
