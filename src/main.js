/**
 * Fluid Simulation MVP - Metaballs Version
 * SPH + Metaballs Shader
 * Version: 0.06
 */
import * as THREE from 'three';
import { SPHSolver } from './core/SPHSolver.js';

// Shader 代码
const vertexShader = `
  attribute vec2 position;
  void main() {
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

const fragmentShader = `
  precision highp float;
  
  uniform vec2 uResolution;
  uniform vec3 uParticles[300];
  uniform int uParticleCount;
  uniform vec3 uColor;
  
  void main() {
    vec2 uv = gl_FragCoord.xy / uResolution.xy;
    uv = uv * 2.0 - 1.0;
    uv.x *= uResolution.x / uResolution.y;
    
    float sum = 0.0;
    
    for (int i = 0; i < 300; i++) {
      if (i >= uParticleCount) break;
      
      vec2 particlePos = uParticles[i].xy;
      float radius = uParticles[i].z;
      
      float dist = length(uv - particlePos);
      sum += radius * radius / (dist * dist + 0.001);
    }
    
    float threshold = 1.0;
    float alpha = smoothstep(threshold - 0.05, threshold + 0.05, sum);
    
    // 边缘发光
    float edge = smoothstep(threshold - 0.15, threshold, sum) - alpha;
    vec3 glowColor = uColor * 2.0;
    
    vec3 finalColor = mix(glowColor, uColor * 0.8, alpha);
    
    gl_FragColor = vec4(finalColor, alpha + edge * 0.3);
  }
`;

// 配置
const CONFIG = {
  particleCount: 300,
  particleRadius: 0.15,
  gravity: { x: 0, y: -3 },
  mouseForce: 5.0,
  mouseRadius: 1.0,
  color: new THREE.Color(0x00ffff)
};

let scene, camera, renderer;
let solver;
let mouse = { x: 0, y: 0, isDown: false };
let frameCount = 0;
let lastTime = performance.now();

// Shader 材质
let metaballsMaterial;
let particleData = new Float32Array(300 * 3);

try {
  init();
  animate();
} catch (error) {
  console.error('Initialization error:', error);
  document.getElementById('info').innerHTML = `
    <div style="color: red;">错误：${error.message}</div>
  `;
}

function init() {
  if (!window.WebGLRenderingContext) {
    throw new Error('浏览器不支持 WebGL');
  }
  
  scene = new THREE.Scene();
  
  const aspect = window.innerWidth / window.innerHeight;
  camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 100);
  camera.position.z = 5;
  
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 1);
  document.body.style.backgroundColor = '#000000';
  document.body.appendChild(renderer.domElement);
  
  // 初始化 SPH
  solver = new SPHSolver({
    h: 0.4,
    maxParticles: CONFIG.particleCount,
    gravity: CONFIG.gravity,
    restDensity: 1.0,
    gasConstant: 0.3,
    viscosity: 0.05
  });
  
  // 添加初始粒子 - 聚集成水滴状
  for (let i = 0; i < 200; i++) {
    const angle = Math.random() * Math.PI * 2;
    const r = Math.random() * 1.5;
    const x = Math.cos(angle) * r;
    const y = Math.sin(angle) * r + 1;
    solver.addParticle(x, y);
  }
  
  // 创建全屏平面用于 Shader
  const geometry = new THREE.PlaneGeometry(2, 2);
  metaballsMaterial = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
      uParticles: { value: particleData },
      uParticleCount: { value: 0 },
      uColor: { value: new THREE.Vector3(0, 1, 1) }
    },
    transparent: true,
    blending: THREE.AdditiveBlending
  });
  
  const plane = new THREE.Mesh(geometry, metaballsMaterial);
  scene.add(plane);
  
  // 事件
  window.addEventListener('resize', onResize);
  renderer.domElement.addEventListener('mousemove', onMouseMove);
  renderer.domElement.addEventListener('mousedown', () => mouse.isDown = true);
  renderer.domElement.addEventListener('mouseup', () => mouse.isDown = false);
  renderer.domElement.addEventListener('touchstart', onTouchStart, { passive: false });
  renderer.domElement.addEventListener('touchmove', onTouchMove, { passive: false });
  renderer.domElement.addEventListener('touchend', () => mouse.isDown = false);
  
  console.log('Metaballs Fluid initialized');
}

function onResize() {
  const aspect = window.innerWidth / window.innerHeight;
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
  metaballsMaterial.uniforms.uResolution.value.set(window.innerWidth, window.innerHeight);
}

function screenToWorld(clientX, clientY) {
  const rect = renderer.domElement.getBoundingClientRect();
  const x = ((clientX - rect.left) / rect.width) * 2 - 1;
  const y = -((clientY - rect.top) / rect.height) * 2 + 1;
  return { x: x * 2, y: y * 2 };
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
  if (solver.particles.length < CONFIG.particleCount) {
    solver.addParticle(mouse.x + (Math.random() - 0.5) * 0.2, mouse.y + (Math.random() - 0.5) * 0.2);
  }
  
  // 吸引现有粒子
  for (const p of solver.particles) {
    const dx = mouse.x - p.x;
    const dy = mouse.y - p.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    if (dist < CONFIG.mouseRadius && dist > 0.01) {
      const force = (CONFIG.mouseRadius - dist) / CONFIG.mouseRadius * CONFIG.mouseForce;
      p.vx += (dx / dist) * force * 0.05;
      p.vy += (dy / dist) * force * 0.05;
    }
  }
}

function updateParticleData() {
  for (let i = 0; i < solver.particles.length; i++) {
    const p = solver.particles[i];
    particleData[i * 3] = p.x;
    particleData[i * 3 + 1] = p.y;
    particleData[i * 3 + 2] = CONFIG.particleRadius;
  }
  
  metaballsMaterial.uniforms.uParticles.value = particleData;
  metaballsMaterial.uniforms.uParticleCount.value = solver.particles.length;
  
  document.getElementById('count').textContent = solver.particles.length;
}

function animate() {
  requestAnimationFrame(animate);
  
  solver.step();
  applyMouseForce();
  
  // 边界
  for (const p of solver.particles) {
    p.checkBounds(-3, -3, 3, 3, 0.6);
  }
  
  updateParticleData();
  renderer.render(scene, camera);
  
  frameCount++;
  const now = performance.now();
  if (now - lastTime >= 1000) {
    document.getElementById('fps').textContent = frameCount;
    frameCount = 0;
    lastTime = now;
  }
}
