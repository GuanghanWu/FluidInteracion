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
init();
animate();

function init() {
  // Three.js 场景
  scene = new THREE.Scene();
  
  camera = new THREE.OrthographicCamera(
    -CONFIG.bounds.x, CONFIG.bounds.x,
    -CONFIG.bounds.y, CONFIG.bounds.y,
    0.1, 1000
  );
  camera.position.z = 10;
  
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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
  
  // 事件监听
  window.addEventListener('resize', onResize);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mousedown', () => mouse.isDown = true);
  window.addEventListener('mouseup', () => mouse.isDown = false);
  
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
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  
  // 鼠标按下时添加粒子
  if (mouse.isDown) {
    solver.addParticle(mouse.x * CONFIG.bounds.x, mouse.y * CONFIG.bounds.y);
  }
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
  
  // 创建粒子几何体
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(solver.particles.length * 3);
  
  for (let i = 0; i < solver.particles.length; i++) {
    const p = solver.particles[i];
    positions[i * 3] = p.x;
    positions[i * 3 + 1] = p.y;
    positions[i * 3 + 2] = 0;
  }
  
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  
  // 创建粒子材质（简单点渲染，后续替换为 Metaballs Shader）
  const material = new THREE.PointsMaterial({
    color: CONFIG.color,
    size: CONFIG.particleRadius * 2,
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending
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
