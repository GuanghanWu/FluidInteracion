/**
 * SPH 流体求解器
 * 使用 Poly6 和 Spiky 核函数
 */
import { Particle } from './Particle.js';

export class SPHSolver {
  constructor(options = {}) {
    // 粒子半径（影响范围）
    this.radius = options.radius || 0.1;
    
    // 粒子数量
    this.maxParticles = options.maxParticles || 500;
    
    // 时间步长
    this.dt = options.dt || 0.016;
    
    // 重力
    this.gravity = options.gravity || { x: 0, y: -9.8 };
    
    // 静止密度
    this.density0 = options.density0 || 1000;
    
    // 气体常数（压力计算）
    this.gasConstant = options.gasConstant || 2000;
    
    // 粘度系数
    this.viscosity = options.viscosity || 250;
    
    // 粒子数组
    this.particles = [];
    
    // 空间哈希（优化邻居查找）
    this.cellSize = this.radius * 2;
    this.spatialHash = new Map();
  }
  
  /**
   * 添加粒子
   */
  addParticle(x, y) {
    if (this.particles.length >= this.maxParticles) return false;
    this.particles.push(new Particle(x, y));
    return true;
  }
  
  /**
   * 构建空间哈希
   */
  buildSpatialHash() {
    this.spatialHash.clear();
    
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      const cellX = Math.floor(p.x / this.cellSize);
      const cellY = Math.floor(p.y / this.cellSize);
      const key = `${cellX},${cellY}`;
      
      if (!this.spatialHash.has(key)) {
        this.spatialHash.set(key, []);
      }
      this.spatialHash.get(key).push(i);
    }
  }
  
  /**
   * 查询邻居粒子
   */
  queryNeighbors(particle) {
    const cellX = Math.floor(particle.x / this.cellSize);
    const cellY = Math.floor(particle.y / this.cellSize);
    
    const neighbors = [];
    
    // 检查周围 9 个格子
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const key = `${cellX + dx},${cellY + dy}`;
        const cell = this.spatialHash.get(key);
        if (cell) {
          neighbors.push(...cell);
        }
      }
    }
    
    return neighbors;
  }
  
  /**
   * Poly6 核函数（密度计算）
   */
  poly6Kernel(r) {
    const h = this.radius;
    if (r >= h) return 0;
    
    const coef = 315 / (64 * Math.PI * Math.pow(h, 9));
    const diff = h * h - r * r;
    return coef * Math.pow(diff, 3);
  }
  
  /**
   * Spiky 核函数（压力计算）
   */
  spikyKernel(r) {
    const h = this.radius;
    if (r >= h) return 0;
    
    const coef = -45 / (Math.PI * Math.pow(h, 6));
    const diff = h - r;
    return coef * Math.pow(diff, 2);
  }
  
  /**
   * 计算密度和压力
   */
  computeDensityPressure() {
    this.buildSpatialHash();
    
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      p.density = 0;
      
      const neighbors = this.queryNeighbors(p);
      
      for (const j of neighbors) {
        const neighbor = this.particles[j];
        const dx = neighbor.x - p.x;
        const dy = neighbor.y - p.y;
        const r = Math.sqrt(dx * dx + dy * dy);
        
        p.density += neighbor.mass * this.poly6Kernel(r);
      }
      
      // 状态方程计算压力
      p.pressure = this.gasConstant * (p.density - this.density0);
    }
  }
  
  /**
   * 计算粘度力
   */
  computeViscosity() {
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      
      const neighbors = this.queryNeighbors(p);
      
      for (const j of neighbors) {
        if (i === j) continue;
        
        const neighbor = this.particles[j];
        const dx = neighbor.x - p.x;
        const dy = neighbor.y - p.y;
        const r = Math.sqrt(dx * dx + dy * dy);
        
        if (r < 0.0001) continue;
        
        // 粘度力
        const viscosityForce = this.viscosity * this.spikyKernel(r);
        
        p.ax += viscosityForce * (neighbor.vx - p.vx) / r;
        p.ay += viscosityForce * (neighbor.vy - p.vy) / r;
      }
    }
  }
  
  /**
   * 应用压力
   */
  applyPressure() {
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      
      const neighbors = this.queryNeighbors(p);
      
      for (const j of neighbors) {
        if (i === j) continue;
        
        const neighbor = this.particles[j];
        const dx = neighbor.x - p.x;
        const dy = neighbor.y - p.y;
        const r = Math.sqrt(dx * dx + dy * dy);
        
        if (r < 0.0001) continue;
        
        // 压力梯度
        const pressureGradient = -0.5 * (p.pressure + neighbor.pressure) / neighbor.density;
        const force = pressureGradient * this.spikyKernel(r);
        
        p.ax += force * dx / r;
        p.ay += force * dy / r;
      }
    }
  }
  
  /**
   * 更新一步模拟
   */
  step() {
    // 1. 计算密度和压力
    this.computeDensityPressure();
    
    // 2. 计算粘度力
    this.computeViscosity();
    
    // 3. 应用压力
    this.applyPressure();
    
    // 4. 应用外力和更新位置
    for (const p of this.particles) {
      p.applyForce(this.gravity.x, this.gravity.y);
      p.update(this.dt);
    }
  }
}
