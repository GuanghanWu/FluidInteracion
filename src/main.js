/**
 * Fluid Simulation MVP - Metaballs Texture Version
 * SPH + CPU Distance Field + Shader
 * Version: 0.24 - 边缘过渡参数
 */
import * as THREE from 'three';
import { SPHSolver } from './core/SPHSolver.js';

// 配置（会被控制面板覆盖）
let CONFIG = {
  particleCount: 300,  // 更多粒子，更易融合
  particleRadius: 0.22,  // 基础半径
  gravity: { x: 0, y: 0 },  // 无重力 - 颜料池效果
  viscosity: 0.15,
  mouseForce: 2.0,
  mouseRadius: 1.0,
  textureSize: 256,
  edgeSoftness: 0.5  // 边缘过渡比例（0=硬边，1=最软）
};

let scene, camera, renderer;
let solver;
let mouse = { x: 0, y: 0, isDown: false };
let frameCount = 0;
let lastTime = performance.now();

// Metaballs 相关
let metaballsMesh;
let dataTexture;
let pixelData;

try {
  init();
  animate();
} catch (error) {
  console.error('Initialization error:', error);
  document.getElementById('info').innerHTML = `<div style="color: red;">错误：${error.message}</div>`;
}

function init() {
  if (!window.WebGLRenderingContext) {
    throw new Error('浏览器不支持 WebGL');
  }
  
  scene = new THREE.Scene();
  
  const aspect = window.innerWidth / window.innerHeight;
  camera = new THREE.OrthographicCamera(-aspect, aspect, 1, -1, 0.1, 10);
  camera.position.z = 1;
  
  renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(1); // 降低像素比提高性能
  renderer.setClearColor(0x000000, 1);
  document.body.style.backgroundColor = '#000000';
  document.body.appendChild(renderer.domElement);
  
  // 初始化 SPH - 颜料池效果（无重力）
  // aspect 已经在上面定义过了
  solver = new SPHSolver({
    h: 0.35,  // 匹配视觉半径
    maxParticles: CONFIG.particleCount,
    gravity: CONFIG.gravity,  // { x: 0, y: 0 }
    restDensity: 1.0,
    gasConstant: 0.2,
    viscosity: 0.15,
    dt: 0.005,
    bounds: { minX: -aspect * 0.95, minY: -0.95, maxX: aspect * 0.95, maxY: 0.95 }
  });
  
  // 添加初始粒子 - 颜料滴落效果（分散在可视范围内）
  for (let i = 0; i < CONFIG.particleCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * 0.8;
    // 限制在可视范围内
    const x = Math.cos(angle) * r * 1.5;
    const y = Math.sin(angle) * r;
    solver.addParticle(x, y);
  }
  
  // 创建数据纹理
  pixelData = new Uint8Array(CONFIG.textureSize * CONFIG.textureSize * 4);
  dataTexture = new THREE.DataTexture(
    pixelData,
    CONFIG.textureSize,
    CONFIG.textureSize,
    THREE.RGBAFormat
  );
  dataTexture.needsUpdate = true;
  
  // 创建全屏平面 + Shader
  const geometry = new THREE.PlaneGeometry(2 * aspect, 2);
  
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTexture: { value: dataTexture },
      uColor: { value: new THREE.Vector3(0, 0.8, 1.0) },
      uEdgeSoftness: { value: CONFIG.edgeSoftness }
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D uTexture;
      uniform vec3 uColor;
      uniform float uEdgeSoftness;
      varying vec2 vUv;
      
      void main() {
        float field = texture2D(uTexture, vUv).r;
        
        // 阈值产生流体表面
        float threshold = 0.5;
        // 边缘过渡宽度由 edgeSoftness 控制（0.1 ~ 0.5）
        float edgeWidth = 0.1 + uEdgeSoftness * 0.4;
        float alpha = smoothstep(threshold - edgeWidth, threshold + edgeWidth, field);
        
        // 边缘高光（也受 softness 影响）
        float edge = smoothstep(threshold - edgeWidth * 1.5, threshold, field) - alpha;
        
        // 等高线效果 - 根据场值强度分层
        // field 范围：单个粒子 ~0.5，多个叠加可到 5.0+
        // 使用对数压缩，让高值区域也有变化
        float logField = log(field + 1.0) / log(6.0); // 压缩到 0~1
        logField = clamp(logField, 0.0, 1.0);
        
        // 细粒度等高线 - 更多层次
        vec3 color0 = uColor * 1.5;   // 最外：很亮
        vec3 color1 = uColor * 1.2;   // 亮
        vec3 color2 = uColor * 0.9;   // 中等
        vec3 color3 = uColor * 0.6;   // 稍暗
        vec3 color4 = uColor * 0.4;   // 暗
        vec3 color5 = uColor * 0.2;   // 最中心：深色
        
        // 6层渐变
        vec3 innerColor;
        float t;
        if (logField < 0.2) {
          t = logField / 0.2;
          innerColor = mix(color0, color1, t);
        } else if (logField < 0.4) {
          t = (logField - 0.2) / 0.2;
          innerColor = mix(color1, color2, t);
        } else if (logField < 0.6) {
          t = (logField - 0.4) / 0.2;
          innerColor = mix(color2, color3, t);
        } else if (logField < 0.8) {
          t = (logField - 0.6) / 0.2;
          innerColor = mix(color3, color4, t);
        } else {
          t = (logField - 0.8) / 0.2;
          innerColor = mix(color4, color5, t);
        }
        
        // 边缘发光
        vec3 edgeColor = uColor * 1.8;
        vec3 finalColor = mix(edgeColor, innerColor, alpha);
        
        // 整体亮度提升
        finalColor += uColor * 0.1 * field;
        
        gl_FragColor = vec4(finalColor, alpha + edge * 0.5);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending
  });
  
  metaballsMesh = new THREE.Mesh(geometry, material);
  scene.add(metaballsMesh);
  
  scene.add(metaballsMesh);
  
  // 控制面板事件
  setupControls();
  
  // 鼠标/触摸事件
  window.addEventListener('resize', onResize);
  renderer.domElement.addEventListener('mousemove', onMouseMove);
  renderer.domElement.addEventListener('mousedown', () => mouse.isDown = true);
  renderer.domElement.addEventListener('mouseup', () => mouse.isDown = false);
  renderer.domElement.addEventListener('touchstart', onTouchStart, { passive: false });
  renderer.domElement.addEventListener('touchmove', onTouchMove, { passive: false });
  renderer.domElement.addEventListener('touchend', () => mouse.isDown = false);
  
  console.log('Metaballs Fluid v0.09 initialized');
}

// 设置控制面板
function setupControls() {
  // 粒子数量 - 立即添加或删除粒子
  const particleCountSlider = document.getElementById('particleCount');
  const particleCountVal = document.getElementById('particleCountVal');
  particleCountSlider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    CONFIG.particleCount = val;
    particleCountVal.textContent = val;
    solver.maxParticles = val;
    
    // 如果粒子不够，立即添加（限制在可视范围内）
    while (solver.particles.length < val) {
      const angle = Math.random() * Math.PI * 2;
      const r = Math.random() * 0.8;
      // 限制在 -1.5 ~ 1.5 范围内（可视区域）
      const x = Math.cos(angle) * r * 1.5;
      const y = Math.sin(angle) * r;
      solver.addParticle(x, y);
    }
    // 如果粒子太多，删除
    while (solver.particles.length > val) {
      solver.particles.pop();
    }
  });
  
  // 粒子半径比例 - 同时影响视觉和物理
  const radiusSlider = document.getElementById('radiusScale');
  const radiusVal = document.getElementById('radiusVal');
  radiusSlider.addEventListener('input', (e) => {
    const scale = parseFloat(e.target.value);
    radiusVal.textContent = scale.toFixed(1);
    
    // 更新视觉半径
    CONFIG.particleRadius = 0.22 * scale;
    
    // 更新物理核函数半径
    if (solver) solver.h = 0.35 * scale;
  });
  
  // 粘度 - 直接修改
  const viscositySlider = document.getElementById('viscosity');
  const viscosityVal = document.getElementById('viscosityVal');
  viscositySlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    CONFIG.viscosity = val;
    viscosityVal.textContent = val.toFixed(2);
    if (solver) solver.viscosity = val;
  });
  
  // 鼠标力
  const mouseForceSlider = document.getElementById('mouseForce');
  const mouseForceVal = document.getElementById('mouseForceVal');
  mouseForceSlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    CONFIG.mouseForce = val;
    mouseForceVal.textContent = val.toFixed(1);
  });
  
  // 边缘过渡（Edge Softness）
  const edgeSoftnessSlider = document.getElementById('edgeSoftness');
  const edgeSoftnessVal = document.getElementById('edgeSoftnessVal');
  edgeSoftnessSlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    CONFIG.edgeSoftness = val;
    edgeSoftnessVal.textContent = val.toFixed(1);
    // 更新着色器 uniform
    if (metaballsMesh && metaballsMesh.material.uniforms.uEdgeSoftness) {
      metaballsMesh.material.uniforms.uEdgeSoftness.value = val;
    }
  });
}

function onResize() {
  const aspect = window.innerWidth / window.innerHeight;
  renderer.setSize(window.innerWidth, window.innerHeight);
  
  camera.left = -aspect;
  camera.right = aspect;
  camera.updateProjectionMatrix();
  
  // 更新平面大小
  metaballsMesh.geometry.dispose();
  metaballsMesh.geometry = new THREE.PlaneGeometry(2 * aspect, 2);
}

// 屏幕坐标转世界坐标
function screenToWorld(clientX, clientY) {
  const rect = renderer.domElement.getBoundingClientRect();
  const aspect = window.innerWidth / window.innerHeight;
  // X: 映射到 [-aspect, aspect]
  // Y: 映射到 [-1, 1]
  const x = (((clientX - rect.left) / rect.width) * 2 - 1) * aspect;
  const y = -((clientY - rect.top) / rect.height) * 2 + 1;
  return { x, y };
}

function onMouseMove(e) {
  const pos = screenToWorld(e.clientX, e.clientY);
  mouse.x = pos.x;
  mouse.y = pos.y;
}

function onTouchStart(e) {
  e.preventDefault();
  const touch = e.touches[0];
  const pos = screenToWorld(touch.clientX, touch.clientY);
  mouse.x = pos.x;
  mouse.y = pos.y;
  mouse.isDown = true;
}

function onTouchMove(e) {
  e.preventDefault();
  const touch = e.touches[0];
  const pos = screenToWorld(touch.clientX, touch.clientY);
  mouse.x = pos.x;
  mouse.y = pos.y;
}

function applyMouseForce() {
  if (!mouse.isDown) return;
  
  // 添加新粒子
  if (solver.particles.length < CONFIG.particleCount && Math.random() < 0.2) {
    solver.addParticle(
      mouse.x + (Math.random() - 0.5) * 0.2,
      mouse.y + (Math.random() - 0.5) * 0.2
    );
  }
  
  // 吸引粒子
  for (const p of solver.particles) {
    const dx = mouse.x - p.x;
    const dy = mouse.y - p.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    if (dist < CONFIG.mouseRadius && dist > 0.05) {
      const force = (CONFIG.mouseRadius - dist) / CONFIG.mouseRadius * CONFIG.mouseForce;
      p.vx += (dx / dist) * force * 0.01;
      p.vy += (dy / dist) * force * 0.01;
    }
  }
}

// 计算 Metaballs 距离场
function updateMetaballsField() {
  const size = CONFIG.textureSize;
  const aspect = window.innerWidth / window.innerHeight;
  
  // 保持正圆：根据宽高比调整半径计算
  const radiusX = CONFIG.particleRadius * size * 0.5;
  const radiusY = radiusX * aspect; // Y方向根据屏幕比例调整
  const radius = Math.max(radiusX, radiusY);
  
  // 清空
  for (let i = 0; i < pixelData.length; i += 4) {
    pixelData[i] = 0;     // R
    pixelData[i + 1] = 0; // G
    pixelData[i + 2] = 0; // B
    pixelData[i + 3] = 255; // A
  }
  
  // 计算每个粒子的贡献
  for (const p of solver.particles) {
    // 世界坐标 (-aspect to aspect, -1 to 1) 转纹理坐标 (0 to size)
    // X: 从 [-aspect, aspect] 映射到 [0, size]
    // Y: 从 [-1, 1] 映射到 [0, size]
    const tx = ((p.x / aspect) + 1) * 0.5 * size;
    const ty = (p.y + 1) * 0.5 * size;
    
    // 只计算影响范围内的像素
    const minX = Math.max(0, Math.floor(tx - radiusX));
    const maxX = Math.min(size, Math.ceil(tx + radiusX));
    const minY = Math.max(0, Math.floor(ty - radiusY));
    const maxY = Math.min(size, Math.ceil(ty + radiusY));
    
    for (let y = minY; y < maxY; y++) {
      for (let x = minX; x < maxX; x++) {
        // 归一化距离，保持正圆
        const dx = (x - tx) / radiusX;
        const dy = (y - ty) / radiusY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < 1.0) {
          // Metaballs 场函数
          const field = (1.0 - dist) * (1.0 - dist);
          const idx = (y * size + x) * 4;
          
          // 累加场值（增强基础亮度）
          pixelData[idx] = Math.min(255, pixelData[idx] + field * 150);
        }
      }
    }
  }
  
  dataTexture.needsUpdate = true;
}

function animate() {
  requestAnimationFrame(animate);
  
  // 物理更新
  solver.step();
  applyMouseForce();
  
  // 硬边界 - 玻璃墙，完全弹性碰撞（能量守恒）
  const aspect = window.innerWidth / window.innerHeight;
  for (const p of solver.particles) {
    p.applyHardBounds(-aspect * 0.95, -0.95, aspect * 0.95, 0.95, 1.0); // 完全弹性，能量不损失
  }
  
  // 更新 Metaballs 场
  updateMetaballsField();
  
  // 渲染
  renderer.render(scene, camera);
  
  // FPS
  frameCount++;
  const now = performance.now();
  if (now - lastTime >= 1000) {
    document.getElementById('fps').textContent = frameCount;
    document.getElementById('count').textContent = solver.particles.length;
    frameCount = 0;
    lastTime = now;
  }
}
