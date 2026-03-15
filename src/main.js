/**
 * Fluid Simulation MVP - Working Version
 * SPH + Point Cloud (Fallback)
 * Version: 0.07
 */
import * as THREE from 'three';
import { SPHSolver } from './core/SPHSolver.js';

// 配置
const CONFIG = {
  particleCount: 300,
  particleRadius: 0.12,
  gravity: { x: 0, y: -2 },
  mouseForce: 3.0,
  mouseRadius: 1.2,
  color: 0x00ffff
};

let scene, camera, renderer;
let solver;
let mouse = { x: 0, y: 0, isDown: false };
let frameCount = 0;
let lastTime = performance.now();
let particlesMesh;
let particlePositions = new Float32Array(CONFIG.particleCount * 3);
let particleColors = new Float32Array(CONFIG.particleCount * 3);

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
  camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 100);
  camera.position.z = 6;
  
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x050510, 1);
  document.body.style.backgroundColor = '#050510';
  document.body.appendChild(renderer.domElement);
  
  // 初始化 SPH
  solver = new SPHSolver({
    h: 0.35,
    maxParticles: CONFIG.particleCount,
    gravity: CONFIG.gravity,
    restDensity: 1.0,
    gasConstant: 0.4,
    viscosity: 0.08
  });
  
  // 添加初始粒子 - 水滴状聚集
  const centerX = 0;
  const centerY = 1.5;
  for (let i = 0; i < 150; i++) {
    const angle = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * 1.2;
    const x = centerX + Math.cos(angle) * r;
    const y = centerY + Math.sin(angle) * r * 0.6;
    solver.addParticle(x, y);
  }
  
  // 创建粒子几何体
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(particleColors, 3));
  
  // 粒子材质 - 大尺寸 + 发光效果
  const material = new THREE.PointsMaterial({
    size: 0.35,
    vertexColors: true,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
    depthWrite: false
  });
  
  particlesMesh = new THREE.Points(geometry, material);
  scene.add(particlesMesh);
  
  // 事件监听
  window.addEventListener('resize', onResize);
  renderer.domElement.addEventListener('mousemove', onMouseMove);
  renderer.domElement.addEventListener('mousedown', () => mouse.isDown = true);
  renderer.domElement.addEventListener('mouseup', () => mouse.isDown = false);
  renderer.domElement.addEventListener('touchstart', onTouchStart, { passive: false });
  renderer.domElement.addEventListener('touchmove', onTouchMove, { passive: false });
  renderer.domElement.addEventListener('touchend', () => mouse.isDown = false);
  
  console.log('Fluid Simulation v0.07 initialized');
}

function onResize() {
  const aspect = window.innerWidth / window.innerHeight;
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
}

function screenToWorld(clientX, clientY) {
  const rect = renderer.domElement.getBoundingClientRect();
  const x = ((clientX - rect.left) / rect.width) * 2 - 1;
  const y = -((clientY - rect.top) / rect.height) * 2 + 1;
  return { x: x * 3, y: y * 3 };
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
  
  // 添加新粒子（限制频率）
  if (solver.particles.length < CONFIG.particleCount && Math.random() < 0.3) {
    solver.addParticle(
      mouse.x + (Math.random() - 0.5) * 0.3,
      mouse.y + (Math.random() - 0.5) * 0.3
    );
  }
  
  // 吸引粒子
  for (const p of solver.particles) {
    const dx = mouse.x - p.x;
    const dy = mouse.y - p.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    if (dist < CONFIG.mouseRadius && dist > 0.05) {
      const force = (CONFIG.mouseRadius - dist) / CONFIG.mouseRadius * CONFIG.mouseForce;
      p.vx += (dx / dist) * force * 0.02;
      p.vy += (dy / dist) * force * 0.02;
    }
  }
}

function getColor(speed) {
  // 根据速度返回颜色
  const maxSpeed = 2;
  const t = Math.min(speed / maxSpeed, 1);
  
  // 青色(慢) -> 蓝色(中) -> 紫色(快)
  const r = t * 0.5;
  const g = 1.0 - t * 0.3;
  const b = 1.0;
  
  return { r, g, b };
}

function updateParticles() {
  for (let i = 0; i < solver.particles.length; i++) {
    const p = solver.particles[i];
    
    particlePositions[i * 3] = p.x;
    particlePositions[i * 3 + 1] = p.y;
    particlePositions[i * 3 + 2] = 0;
    
    const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
    const color = getColor(speed);
    particleColors[i * 3] = color.r;
    particleColors[i * 3 + 1] = color.g;
    particleColors[i * 3 + 2] = color.b;
  }
  
  // 隐藏未使用的粒子
  for (let i = solver.particles.length; i < CONFIG.particleCount; i++) {
    particlePositions[i * 3 + 2] = -1000;
  }
  
  particlesMesh.geometry.attributes.position.needsUpdate = true;
  particlesMesh.geometry.attributes.color.needsUpdate = true;
  
  document.getElementById('count').textContent = solver.particles.length;
}

function animate() {
  requestAnimationFrame(animate);
  
  solver.step();
  applyMouseForce();
  
  // 边界
  for (const p of solver.particles) {
    p.checkBounds(-3.5, -3, 3.5, 4, 0.5);
  }
  
  updateParticles();
  renderer.render(scene, camera);
  
  frameCount++;
  const now = performance.now();
  if (now - lastTime >= 1000) {
    document.getElementById('fps').textContent = frameCount;
    frameCount = 0;
    lastTime = now;
  }
}
