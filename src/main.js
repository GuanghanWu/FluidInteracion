/**
 * Fluid Simulation MVP - Main Entry
 * SPH + Verlet + Metaballs
 */
import * as THREE from 'three';
import { SPHSolver } from './core/SPHSolver.js';
import { Particle } from './core/Particle.js';

// 配置
const CONFIG = {
  particleCount: 300,
  particleRadius: 0.08,
  bounds: { x: 2, y: 1.5 },
  gravity: { x: 0, y: -15 },
  color: new THREE.Color(0x00aaff)
};

// 全局变量
let scene, camera, renderer;
let solver, particles;
let mouse = { x: 0, y: 0, isDown: false };
let frameCount = 0;
let lastTime = performance.now();

// 初始化
try {
  init();
  animate();
} catch (error) {
  console.error('Initialization error:', error);
  document.getElementById('info').innerHTML = `
    <div style="color: red; font-size: 16px;">
      错误：${error.message}<br>
      WebGL 支持：${!!window.WebGLRenderingContext}<br>
      Three.js 版本：${THREE.REVISION}
    </div>
  `;
}

function init() {
  // 检查 WebGL 支持
  if (!window.WebGLRenderingContext) {
    throw new Error('浏览器不支持 WebGL');
  }
  
  // Three.js 场景
  scene = new THREE.Scene();
  
  // 适配移动端
  const aspect = window.innerWidth / window.innerHeight;
  const frustumSize = 2;
  
  camera = new THREE.OrthographicCamera(
    -frustumSize * aspect, frustumSize * aspect,
    frustumSize, -frustumSize,
    0.1, 1000
  );
  camera.position.z = 10;
  
  // WebGL 渲染器（移动端优化）
  renderer = new THREE.WebGLRenderer({ 
    antialias: true,
    alpha: false,
    preserveDrawingBuffer: false
  });
  
  // 检查 WebGL 是否可用
  const gl = renderer.getContext();
  if (!gl) {
    throw new Error('无法创建 WebGL 上下文');
  }
  
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 1); // 纯黑背景
  document.body.style.backgroundColor = '#000000'; // 确保背景黑色
  document.body.appendChild(renderer.domElement);
  
  // 初始化 SPH 求解器
  solver = new SPHSolver({
    radius: CONFIG.particleRadius,
    maxParticles: CONFIG.particleCount,
    gravity: CONFIG.gravity
  });
  
  // 添加初始粒子（矩形区域）
  const cols = 20;
  const rows = 15;
  const startX = -0.8;
  const startY = -0.5;
  const spacing = 0.08;
  
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      solver.addParticle(
        startX + i * spacing,
        startY + j * spacing
      );
    }
  }
  
  // 事件监听（移动端 + 桌面端）
  window.addEventListener('resize', onResize);
  
  // 触摸事件
  renderer.domElement.addEventListener('touchstart', onTouchStart, { passive: false });
  renderer.domElement.addEventListener('touchmove', onTouchMove, { passive: false });
  renderer.domElement.addEventListener('touchend', onTouchEnd);
  
  // 鼠标事件
  renderer.domElement.addEventListener('mousemove', onMouseMove);
  renderer.domElement.addEventListener('mousedown', () => mouse.isDown = true);
  renderer.domElement.addEventListener('mouseup', () => mouse.isDown = false);
  
  console.log('Fluid Simulation MVP initialized');
  console.log(`Particles: ${solver.particles.length}`);
}

function onResize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}

function onMouseMove(e) {
  // 转换鼠标坐标到世界空间
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  
  // 鼠标按下时添加粒子
  if (mouse.isDown) {
    solver.addParticle(mouse.x * CONFIG.bounds.x, mouse.y * CONFIG.bounds.y);
  }
}

function onTouchStart(e) {
  e.preventDefault();
  const touch = e.touches[0];
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((touch.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((touch.clientY - rect.top) / rect.height) * 2 + 1;
  mouse.isDown = true;
  
  // 添加粒子
  solver.addParticle(mouse.x * CONFIG.bounds.x, mouse.y * CONFIG.bounds.y);
}

function onTouchMove(e) {
  e.preventDefault();
  const touch = e.touches[0];
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((touch.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((touch.clientY - rect.top) / rect.height) * 2 + 1;
  
  // 拖动时添加粒子
  solver.addParticle(mouse.x * CONFIG.bounds.x, mouse.y * CONFIG.bounds.y);
}

function onTouchEnd() {
  mouse.isDown = false;
}

function animate() {
  requestAnimationFrame(animate);
  
  // 更新物理
  solver.step();
  
  // 边界检测
  for (const p of solver.particles) {
    p.checkBounds(
      -CONFIG.bounds.x, -CONFIG.bounds.y,
      CONFIG.bounds.x, CONFIG.bounds.y,
      0.5
    );
  }
  
  // 渲染
  render();
  
  // 更新 FPS 显示
  updateFPS();
}

function render() {
  // 清空场景
  scene.clear();
  
  // 调试：显示粒子数量
  const particleCount = solver.particles.length;
  document.getElementById('count').textContent = particleCount;
  
  if (particleCount === 0) {
    console.warn('No particles to render');
    renderer.render(scene, camera);
    return;
  }
  
  // 创建粒子几何体
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(particleCount * 3);
  
  for (let i = 0; i < particleCount; i++) {
    const p = solver.particles[i];
    positions[i * 3] = p.x;
    positions[i * 3 + 1] = p.y;
    positions[i * 3 + 2] = 0;
  }
  
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  
  // 创建粒子材质（移动端优化：大尺寸 + 亮色）
  const material = new THREE.PointsMaterial({
    color: 0x00ffff, // 青色（更亮）
    size: 15, // 固定大尺寸（像素单位）
    transparent: true,
    opacity: 1.0,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: false, // 禁用尺寸衰减
    depthWrite: false
  });
  
  const points = new THREE.Points(geometry, material);
  scene.add(points);
  
  renderer.render(scene, camera);
}

function updateFPS() {
  frameCount++;
  const now = performance.now();
  
  if (now - lastTime >= 1000) {
    document.getElementById('count').textContent = solver.particles.length;
    document.getElementById('fps').textContent = frameCount;
    frameCount = 0;
    lastTime = now;
  }
}
