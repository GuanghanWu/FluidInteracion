/**
 * Fluid Simulation MVP - GPU Metaballs Version
 * SPH + GPU Distance Field + Shader
 * Version: 0.40 - HSV面板放颜色下方，EdgeSoftness效果增强
 */
import * as THREE from 'three';
import { SPHSolver } from './core/SPHSolver.js';

// 配置
let CONFIG = {
  density: 2.6,
  baseParticleCount: 300,
  particleRadius: 0.08,
  gravity: { x: 0, y: 0 },
  viscosity: 0.25,
  mouseForce: 4.0,
  mouseRadius: 1.0,
  textureSize: 512,
  edgeSoftness: 0.5,
  colorLayers: 4,
  color1: '#66ffff',
  color2: '#00ccff',
  color3: '#0088cc',
  color4: '#001133',
  activeColorIndex: 1,
  randomAlgo: 'perlin',
  randomScale: 1.4,
  randomIntensity: 0.70,
  fpsLimit: 60
};

let scene, camera, renderer;
let solver;
let mouse = { x: 0, y: 0, isDown: false };
let frameCount = 0;
let lastTime = performance.now();
let lastFrameTime = performance.now();

// GPU Metaballs
let metaballsMesh;
let metaballsRT;
let particleMesh;
let particleScene, particleCamera;
let particleMaterial;

const PARTICLE_QUAD_SIZE = 0.15;

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
  
  const aspect = window.innerWidth / window.innerHeight;
  
  renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(1);
  renderer.setClearColor(0x000000, 1);
  document.body.style.backgroundColor = '#000000';
  document.body.appendChild(renderer.domElement);
  
  scene = new THREE.Scene();
  camera = new THREE.OrthographicCamera(-aspect, aspect, 1, -1, 0.1, 10);
  camera.position.z = 1;
  
  // GPU RenderTarget
  metaballsRT = new THREE.WebGLRenderTarget(CONFIG.textureSize, CONFIG.textureSize, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat
  });
  
  // 粒子离屏场景
  particleScene = new THREE.Scene();
  particleCamera = new THREE.OrthographicCamera(-aspect, aspect, 1, -1, 0.1, 10);
  particleCamera.position.z = 1;
  
  // 粒子材质 - 圆形渐变纹理（metaball 效果关键）
  const particleGeo = new THREE.PlaneGeometry(1, 1);
  
  // 创建径向渐变纹理
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.3)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  const particleTexture = new THREE.CanvasTexture(canvas);
  
  particleMaterial = new THREE.MeshBasicMaterial({
    map: particleTexture,
    transparent: true,
    opacity: 1.0,
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false
  });
  
  // InstancedMesh 用于批量渲染粒子（容量支持最大密度）
  particleMesh = new THREE.InstancedMesh(particleGeo, particleMaterial, 1600);
  particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  particleScene.add(particleMesh);
  
  // SPH
  const initialCount = Math.round(CONFIG.baseParticleCount * CONFIG.density);
  solver = new SPHSolver({
    h: 0.35,
    maxParticles: initialCount,
    gravity: CONFIG.gravity,
    restDensity: 1.0,
    gasConstant: 0.2,
    viscosity: 0.25,
    dt: 0.005,
    bounds: { minX: -aspect * 0.95, minY: -0.95, maxX: aspect * 0.95, maxY: 0.95 }
  });
  
  for (let i = 0; i < initialCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * 0.8;
    const x = Math.cos(angle) * r * 1.5;
    const y = Math.sin(angle) * r;
    solver.addParticle(x, y);
  }
  
  updateParticleInstances();
  
  // 主场景 - 使用渲染目标作为纹理
  const planeGeo = new THREE.PlaneGeometry(2 * aspect, 2);
  const planeMat = new THREE.ShaderMaterial({
    uniforms: {
      uTexture: { value: metaballsRT.texture },
      uColor1: { value: new THREE.Color(CONFIG.color1) },
      uColor2: { value: new THREE.Color(CONFIG.color2) },
      uColor3: { value: new THREE.Color(CONFIG.color3) },
      uColor4: { value: new THREE.Color(CONFIG.color4) },
      uEdgeSoftness: { value: CONFIG.edgeSoftness },
      uColorLayers: { value: CONFIG.colorLayers }
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
      uniform vec3 uColor1;
      uniform vec3 uColor2;
      uniform vec3 uColor3;
      uniform vec3 uColor4;
      uniform float uEdgeSoftness;
      uniform float uColorLayers;
      varying vec2 vUv;
      
      void main() {
        float field = texture2D(uTexture, vUv).r;
        
        // 固定阈值，EdgeSoftness 只影响层间过渡
        float threshold = 0.15;
        float alpha = smoothstep(threshold - 0.05, threshold + 0.05, field);
        
        // 边缘发光效果
        float edgeGlowAlpha = smoothstep(threshold - 0.1, threshold, field) - alpha;
        
        float logField = log(field * 2.0 + 1.0) / log(2.5);
        logField = clamp(logField, 0.0, 1.0);
        
        float layers = uColorLayers;
        float layerIndex = floor(logField * layers);
        float t = fract(logField * layers);
        
        // EdgeSoftness 模糊层间过渡（效果更明显）
        float softness = uEdgeSoftness;
        t = smoothstep(0.5 - softness * 0.5, 0.5 + softness * 0.5, t);
        
        vec3 colorA, colorB;
        
        // 根据层数选择对应的颜色
        if (layers < 2.0) {
          colorA = uColor1;
          colorB = uColor1;
        } else if (layers < 3.0) {
          if (layerIndex < 1.0) {
            colorA = uColor1;
            colorB = uColor2;
          } else {
            colorA = uColor2;
            colorB = uColor2;
          }
        } else if (layers < 4.0) {
          if (layerIndex < 1.0) {
            colorA = uColor1;
            colorB = uColor2;
          } else if (layerIndex < 2.0) {
            colorA = uColor2;
            colorB = uColor3;
          } else {
            colorA = uColor3;
            colorB = uColor3;
          }
        } else {
          if (layerIndex < 1.0) {
            colorA = uColor1;
            colorB = uColor2;
          } else if (layerIndex < 2.0) {
            colorA = uColor2;
            colorB = uColor3;
          } else if (layerIndex < 3.0) {
            colorA = uColor3;
            colorB = uColor4;
          } else {
            colorA = uColor4;
            colorB = uColor4;
          }
        }
        
        vec3 innerColor = mix(colorA, colorB, t);
        vec3 edgeGlow = uColor1 * 1.3;
        vec3 finalColor = mix(edgeGlow, innerColor, alpha);
        
        gl_FragColor = vec4(finalColor, alpha + edgeGlowAlpha * 0.5);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending
  });
  
  metaballsMesh = new THREE.Mesh(planeGeo, planeMat);
  scene.add(metaballsMesh);
  
  setupControls();
  window.addEventListener('resize', onResize);
  renderer.domElement.addEventListener('mousemove', onMouseMove);
  renderer.domElement.addEventListener('mousedown', () => mouse.isDown = true);
  renderer.domElement.addEventListener('mouseup', () => mouse.isDown = false);
  renderer.domElement.addEventListener('touchstart', onTouchStart, { passive: false });
  renderer.domElement.addEventListener('touchmove', onTouchMove, { passive: false });
  renderer.domElement.addEventListener('touchend', () => mouse.isDown = false);
  
  console.log('GPU Metaballs Fluid v0.32 initialized');
}

// 噪声函数
function noise(x, y, seed = 0) {
  const n = Math.sin(x * 12.9898 + y * 78.233 + seed) * 43758.5453;
  return n - Math.floor(n);
}

function perlinNoise(x, y, scale = 1) {
  const X = Math.floor(x * scale);
  const Y = Math.floor(y * scale);
  const fx = (x * scale) - X;
  const fy = (y * scale) - Y;
  
  const n00 = noise(X, Y);
  const n10 = noise(X + 1, Y);
  const n01 = noise(X, Y + 1);
  const n11 = noise(X + 1, Y + 1);
  
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  
  return (1 - u) * (1 - v) * n00 + u * (1 - v) * n10 + (1 - u) * v * n01 + u * v * n11;
}

function simplexNoise(x, y, scale = 1) {
  // 简化的 Simplex 噪声，用 Perlin 近似
  return perlinNoise(x, y, scale);
}

function getNoiseValue(x, y, algo, scale) {
  switch (algo) {
    case 'perlin': return perlinNoise(x, y, scale);
    case 'simplex': return simplexNoise(x, y, scale);
    case 'white': return noise(x * scale, y * scale);
    default: return 0.5;
  }
}

function updateParticleInstances() {
  const dummy = new THREE.Object3D();
  const baseScale = CONFIG.particleRadius * 0.8;
  
  for (let i = 0; i < solver.particles.length; i++) {
    const p = solver.particles[i];
    dummy.position.set(p.x, p.y, 0);
    
    // 应用噪声随机化大小
    let scale = baseScale;
    if (CONFIG.randomAlgo !== 'none') {
      const n = getNoiseValue(p.x, p.y, CONFIG.randomAlgo, CONFIG.randomScale);
      const variation = (n - 0.5) * 2 * CONFIG.randomIntensity;
      scale = baseScale * (1 + variation);
    }
    
    dummy.scale.set(scale, scale, 1);
    dummy.updateMatrix();
    particleMesh.setMatrixAt(i, dummy.matrix);
  }
  particleMesh.instanceMatrix.needsUpdate = true;
  particleMesh.count = solver.particles.length;
}

function setupControls() {
  document.getElementById('density')?.addEventListener('input', (e) => {
    const density = parseFloat(e.target.value);
    CONFIG.density = density;
    document.getElementById('densityVal').textContent = density.toFixed(1) + 'x';
    const newCount = Math.round(CONFIG.baseParticleCount * density);
    solver.maxParticles = newCount;
    while (solver.particles.length < newCount) {
      const angle = Math.random() * Math.PI * 2;
      const r = Math.random() * 0.8;
      solver.addParticle(Math.cos(angle) * r * 1.5, Math.sin(angle) * r);
    }
    while (solver.particles.length > newCount) solver.particles.pop();
  });
  
  document.getElementById('radiusScale')?.addEventListener('input', (e) => {
    const scale = parseFloat(e.target.value);
    document.getElementById('radiusVal').textContent = scale.toFixed(1);
    CONFIG.particleRadius = 0.08 * scale;
    if (solver) solver.h = 0.12 * scale;
  });
  
  document.getElementById('viscosity')?.addEventListener('input', (e) => {
    CONFIG.viscosity = parseFloat(e.target.value);
    document.getElementById('viscosityVal').textContent = CONFIG.viscosity.toFixed(2);
    if (solver) solver.viscosity = CONFIG.viscosity;
  });
  
  document.getElementById('mouseForce')?.addEventListener('input', (e) => {
    CONFIG.mouseForce = parseFloat(e.target.value);
    document.getElementById('mouseForceVal').textContent = CONFIG.mouseForce.toFixed(1);
  });
  
  document.getElementById('edgeSoftness')?.addEventListener('input', (e) => {
    CONFIG.edgeSoftness = parseFloat(e.target.value);
    document.getElementById('edgeSoftnessVal').textContent = CONFIG.edgeSoftness.toFixed(1);
    if (metaballsMesh?.material.uniforms.uEdgeSoftness) {
      metaballsMesh.material.uniforms.uEdgeSoftness.value = CONFIG.edgeSoftness;
    }
  });
  
  // Color Layers - 控制显示的颜色数量和shader中的层数
  function updateColorLayers() {
    const layers = CONFIG.colorLayers;
    // 显示/隐藏颜色项
    for (let i = 1; i <= 4; i++) {
      const item = document.getElementById('color' + i + 'Item');
      if (item) {
        item.style.display = i <= layers ? 'block' : 'none';
      }
    }
    // 更新shader
    if (metaballsMesh?.material.uniforms.uColorLayers) {
      metaballsMesh.material.uniforms.uColorLayers.value = layers;
    }
  }
  
  document.getElementById('colorLayers')?.addEventListener('input', (e) => {
    CONFIG.colorLayers = parseInt(e.target.value);
    document.getElementById('colorLayersVal').textContent = CONFIG.colorLayers;
    updateColorLayers();
  });
  
  // HSV 颜色选择器辅助函数
  function hsvToHex(h, s, v) {
    s /= 100;
    v /= 100;
    const c = v * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = v - c;
    let r, g, b;
    if (h < 60) [r, g, b] = [c, x, 0];
    else if (h < 120) [r, g, b] = [x, c, 0];
    else if (h < 180) [r, g, b] = [0, c, x];
    else if (h < 240) [r, g, b] = [0, x, c];
    else if (h < 300) [r, g, b] = [x, 0, c];
    else [r, g, b] = [c, 0, x];
    const toHex = (n) => Math.round((n + m) * 255).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }
  
  function setupHSVColor(num, uniformName) {
    const h = document.getElementById('color' + num + 'H');
    const s = document.getElementById('color' + num + 'S');
    const v = document.getElementById('color' + num + 'V');
    const bar = document.getElementById('color' + num + 'Bar');
    const popup = document.getElementById('color' + num + 'Popup');
    
    function update() {
      const hex = hsvToHex(parseInt(h.value), parseInt(s.value), parseInt(v.value));
      bar.style.background = hex;
      CONFIG['color' + num] = hex;
      if (metaballsMesh?.material.uniforms[uniformName]) {
        metaballsMesh.material.uniforms[uniformName].value.set(hex);
      }
    }
    
    // 点击颜色条展开/收起 HSV 面板
    bar?.addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelectorAll('.hsv-popup.show').forEach(p => {
        if (p !== popup) p.classList.remove('show');
      });
      document.querySelectorAll('.color-bar.active').forEach(b => {
        if (b !== bar) b.classList.remove('active');
      });
      popup?.classList.toggle('show');
      bar?.classList.toggle('active');
    });
    
    h?.addEventListener('input', update);
    s?.addEventListener('input', update);
    v?.addEventListener('input', update);
  }
  
  // 新颜色选择器：点击圆点选择颜色
  const colorDots = [1, 2, 3, 4].map(i => document.getElementById('color' + i + 'Dot'));
  const hsvPanel = document.getElementById('hsvPanel');
  const hInput = document.getElementById('activeColorH');
  const sInput = document.getElementById('activeColorS');
  const vInput = document.getElementById('activeColorV');
  
  function hexToHsv(hex) {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const d = max - min;
    let h = 0, s = max === 0 ? 0 : d / max, v = max;
    if (d !== 0) {
      if (max === r) h = ((g - b) / d + 6) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
    }
    return { h: Math.round(h), s: Math.round(s * 100), v: Math.round(v * 100) };
  }
  
  function updateActiveColor() {
    if (!CONFIG.activeColorIndex) return;
    const hex = hsvToHex(parseInt(hInput.value), parseInt(sInput.value), parseInt(vInput.value));
    CONFIG['color' + CONFIG.activeColorIndex] = hex;
    const dot = document.getElementById('color' + CONFIG.activeColorIndex + 'Dot');
    if (dot) dot.style.background = hex;
    const uniformName = 'uColor' + CONFIG.activeColorIndex;
    if (metaballsMesh?.material.uniforms[uniformName]) {
      metaballsMesh.material.uniforms[uniformName].value.set(hex);
    }
  }
  
  colorDots.forEach((dot, i) => {
    if (!dot) return;
    dot.addEventListener('click', (e) => {
      e.stopPropagation();
      colorDots.forEach(d => d?.classList.remove('active'));
      dot.classList.add('active');
      CONFIG.activeColorIndex = i + 1;
      const hsv = hexToHsv(CONFIG['color' + (i + 1)]);
      hInput.value = hsv.h;
      sInput.value = hsv.s;
      vInput.value = hsv.v;
      hsvPanel?.classList.add('show');
    });
  });
  
  hInput?.addEventListener('input', updateActiveColor);
  sInput?.addEventListener('input', updateActiveColor);
  vInput?.addEventListener('input', updateActiveColor);
  
  // 初始化颜色层数显示
  updateColorLayers();
  
  // 点击其他地方关闭 HSV 面板
  document.addEventListener('click', () => {
    hsvPanel?.classList.remove('show');
    colorDots.forEach(d => d?.classList.remove('active'));
  });
  
  // Random 控制
  document.getElementById('randomAlgo')?.addEventListener('change', (e) => {
    CONFIG.randomAlgo = e.target.value;
  });
  document.getElementById('randomScale')?.addEventListener('input', (e) => {
    CONFIG.randomScale = parseFloat(e.target.value);
    document.getElementById('randomScaleVal').textContent = CONFIG.randomScale.toFixed(1);
  });
  document.getElementById('randomIntensity')?.addEventListener('input', (e) => {
    CONFIG.randomIntensity = parseFloat(e.target.value);
    document.getElementById('randomIntensityVal').textContent = CONFIG.randomIntensity.toFixed(2);
  });
  
  // FPS 限制
  document.getElementById('fpsLimit')?.addEventListener('change', (e) => {
    CONFIG.fpsLimit = parseInt(e.target.value);
    document.getElementById('fpsLimitVal').textContent = CONFIG.fpsLimit;
  });
  
  // 主折叠面板
  document.querySelectorAll('.accordion-header').forEach(header => {
    header.addEventListener('click', () => {
      const target = header.dataset.accordion;
      const content = document.getElementById(target);
      header.classList.toggle('collapsed');
      content?.classList.toggle('collapsed');
    });
  });
  
  // 二级折叠面板
  document.querySelectorAll('.sub-header').forEach(header => {
    header.addEventListener('click', (e) => {
      e.stopPropagation();
      const target = header.dataset.sub;
      const content = document.getElementById(target);
      header.classList.toggle('collapsed');
      content?.classList.toggle('collapsed');
    });
  });
  
  document.getElementById('panelToggle')?.addEventListener('click', () => {
    document.getElementById('panelToggle').classList.toggle('collapsed');
    document.getElementById('panelContent')?.classList.toggle('collapsed');
    document.getElementById('info')?.classList.toggle('collapsed');
  });
}

function onResize() {
  const aspect = window.innerWidth / window.innerHeight;
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.left = -aspect;
  camera.right = aspect;
  camera.updateProjectionMatrix();
  particleCamera.left = -aspect;
  particleCamera.right = aspect;
  particleCamera.updateProjectionMatrix();
  metaballsMesh.geometry.dispose();
  metaballsMesh.geometry = new THREE.PlaneGeometry(2 * aspect, 2);
}

function screenToWorld(clientX, clientY) {
  const rect = renderer.domElement.getBoundingClientRect();
  const aspect = window.innerWidth / window.innerHeight;
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
  
  if (solver.particles.length < CONFIG.particleCount && Math.random() < 0.2) {
    solver.addParticle(
      mouse.x + (Math.random() - 0.5) * 0.2,
      mouse.y + (Math.random() - 0.5) * 0.2
    );
  }
  
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

function animate() {
  requestAnimationFrame(animate);
  
  const now = performance.now();
  
  // 物理更新（每帧都执行，保证触控响应）
  solver.step();
  applyMouseForce();
  
  // 边界
  const aspect = window.innerWidth / window.innerHeight;
  for (const p of solver.particles) {
    p.applyHardBounds(-aspect * 0.95, -0.95, aspect * 0.95, 0.95, 1.0);
  }
  
  // FPS 限制 - 只限制渲染
  const delta = now - lastFrameTime;
  const frameInterval = 1000 / CONFIG.fpsLimit;
  
  if (delta >= frameInterval) {
    lastFrameTime = now - (delta % frameInterval);
    
    // 更新粒子位置到 GPU
    updateParticleInstances();
    
    // 渲染 metaballs 到纹理（GPU）
    renderer.setRenderTarget(metaballsRT);
    renderer.clear();
    renderer.render(particleScene, particleCamera);
    
    // 渲染主场景
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);
    
    // FPS 统计
    frameCount++;
  }
  
  // FPS 显示更新（每秒一次）
  if (now - lastTime >= 1000) {
    document.getElementById('fps').textContent = frameCount;
    document.getElementById('count').textContent = solver.particles.length;
    frameCount = 0;
    lastTime = now;
  }
}