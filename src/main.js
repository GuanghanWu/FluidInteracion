/**
 * Fluid Simulation MVP - Main Entry
 * SPH + Verlet + Interactive
 * Version: 0.05
 */
import * as THREE from 'three';
import { SPHSolver } from './core/SPHSolver.js';
import { Particle } from './core/Particle.js';

// 配置
const CONFIG = {
  particleCount: 300,
  particleRadius: 0.15,
  bounds: { x: 3, y: 5 }, // 扩大边界范围
  gravity: { x: 0, y: -5 }, // 减小重力
  mouseForce: 2.0, // 鼠标作用力
  mouseRadius: 1.5, // 鼠标影响半径
  color: 0x00ffff
};

// 全局变量
let scene, camera, renderer;
let solver;
let mouse = { x: 0, y: 0, isDown: false };
let frameCount = 0;
let lastTime = performance.now();
let particlesMesh;

// 初始化
try {
  init();
  animate();
} catch (error) {
  console.error('Initialization error:', error);
  document.getElementById('info').innerHTML = `
    <div style="color: red; font-size: 16px;">
      错误：${error.message}<br>
      WebGL 支持：${!!window.WebGLRenderingContext}
    </div>
  `;
}

function init() {
  if (!window.WebGLRenderingContext) {
    throw new Error('浏览器不支持 WebGL');
  }
  
  // Three.js 场景
  scene = new THREE.Scene();
  
  // 透视相机 - 调整参数让粒子在视野内
  const aspect = window.innerWidth / window.innerHeight;
  camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 100);
  camera.position.z = 8;
  
  // WebGL 渲染器
  renderer = new THREE.WebGLRenderer({ 
    antialias: true,
    alpha: false
  });
  
  const gl = renderer.getContext();
  if (!gl) {
    throw new Error('无法创建 WebGL 上下文');
  }
  
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 1);
  document.body.style.backgroundColor = '#000000';
  document.body.appendChild(renderer.domElement);
  
  // 初始化 SPH 求解器
  solver = new SPHSolver({
    radius: CONFIG.particleRadius,
    maxParticles: CONFIG.particleCount,
    gravity: CONFIG.gravity
  });
  
  // 添加初始粒子 - 随机分布，不是网格
  for (let i = 0; i < CONFIG.particleCount; i++) {
    const x = (Math.random() - 0.5) * 4;
    const y = (Math.random() - 0.5) * 4;
    solver.addParticle(x, y);
  }
  
  // 创建粒子几何体
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(CONFIG.particleCount * 3);
  const colors = new Float32Array(CONFIG.particleCount * 3);
  
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  
  // 创建粒子材质
  const material = new THREE.PointsMaterial({
    size: 0.2,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
    depthWrite: false
  });
  
  particlesMesh = new THREE.Points(geometry, material);
  scene.add(particlesMesh);
  
  // 事件监听
  window.addEventListener('resize', onResize);
  
  renderer.domElement.addEventListener('touchstart', onTouchStart, { passive: false });
  renderer.domElement.addEventListener('touchmove', onTouchMove, { passive: false });
  renderer.domElement.addEventListener('touchend', onTouchEnd);
  
  renderer.domElement.addEventListener('mousemove', onMouseMove);
  renderer.domElement.addEventListener('mousedown', () => mouse.isDown = true);
  renderer.domElement.addEventListener('mouseup', () => mouse.isDown = false);
  
  console.log('Fluid Simulation initialized');
}

function onResize() {
  const aspect = window.innerWidth / window.innerHeight;
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
}

// 将屏幕坐标转换为世界坐标
function screenToWorld(clientX, clientY) {
  const rect = renderer.domElement.getBoundingClientRect();
  const x = ((clientX - rect.left) / rect.width) * 2 - 1;
  const y = -((clientY - rect.top) / rect.height) * 2 + 1;
  
  // 考虑相机位置和透视
  const worldX = x * camera.position.z * 0.8;
  const worldY = y * camera.position.z * 0.8;
  
  return { x: worldX, y: worldY };
}

function onMouseMove(e) {
  const pos = screenToWorld(e.clientX, e.clientY);
  mouse.x = pos.x;
  mouse.y = pos.y;
}

function onMouseDown() {
  mouse.isDown = true;
}

function onMouseUp() {
  mouse.isDown = false;
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

function onTouchEnd() {
  mouse.isDown = false;
}

// 应用鼠标力
function applyMouseForce() {
  if (!mouse.isDown) return;
  
  for (const p of solver.particles) {
    const dx = mouse.x - p.x;
    const dy = mouse.y - p.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    if (dist < CONFIG.mouseRadius && dist > 0.01) {
      const force = (CONFIG.mouseRadius - dist) / CONFIG.mouseRadius * CONFIG.mouseForce;
      p.vx += (dx / dist) * force * 0.1;
      p.vy += (dy / dist) * force * 0.1;
    }
  }
}

// 颜色映射 - 根据速度着色
function getVelocityColor(vx, vy) {
  const speed = Math.sqrt(vx * vx + vy * vy);
  const maxSpeed = 3;
  const t = Math.min(speed / maxSpeed, 1);
  
  // 从青色到紫色到红色
  const r = t * 255;
  const g = (1 - t) * 255;
  const b = 255;
  
  return { r: r / 255, g: g / 255, b: b / 255 };
}

function animate() {
  requestAnimationFrame(animate);
  
  // 更新物理
  solver.step();
  
  // 应用鼠标力
  applyMouseForce();
  
  // 边界检测
  for (const p of solver.particles) {
    p.checkBounds(
      -CONFIG.bounds.x, -CONFIG.bounds.y,
      CONFIG.bounds.x, CONFIG.bounds.y,
      0.7
    );
  }
  
  // 更新粒子显示
  updateParticles();
  
  // 渲染
  renderer.render(scene, camera);
  
  // 更新 FPS
  updateFPS();
}

function updateParticles() {
  const positions = particlesMesh.geometry.attributes.position.array;
  const colors = particlesMesh.geometry.attributes.color.array;
  
  for (let i = 0; i < solver.particles.length; i++) {
    const p = solver.particles[i];
    
    positions[i * 3] = p.x;
    positions[i * 3 + 1] = p.y;
    positions[i * 3 + 2] = 0;
    
    const color = getVelocityColor(p.vx, p.vy);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  
  particlesMesh.geometry.attributes.position.needsUpdate = true;
  particlesMesh.geometry.attributes.color.needsUpdate = true;
  
  document.getElementById('count').textContent = solver.particles.length;
}

function updateFPS() {
  frameCount++;
  const now = performance.now();
  
  if (now - lastTime >= 1000) {
    document.getElementById('fps').textContent = frameCount;
    frameCount = 0;
    lastTime = now;
  }
}
