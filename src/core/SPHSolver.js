/**
 * SPH 流体求解器 - 修复版
 * 能量守恒 + 正确粘度
 */
import { Particle } from './Particle.js';

export class SPHSolver {
  constructor(options = {}) {
    this.h = options.h || 0.3;
    this.maxParticles = options.maxParticles || 300;
    this.dt = options.dt || 0.016;
    this.gravity = options.gravity || { x: 0, y: -2 };
    this.restDensity = options.restDensity || 1.0;
    this.gasConstant = options.gasConstant || 0.3;
    this.viscosity = options.viscosity || 0.1;
    this.particles = [];
    
    // 边界设置（用于镜像粒子）
    this.bounds = options.bounds || null; // { minX, minY, maxX, maxY }
  }
  
  addParticle(x, y) {
    if (this.particles.length >= this.maxParticles) return false;
    this.particles.push(new Particle(x, y));
    return true;
  }
  
  // Poly6 核函数
  poly6(r) {
    if (r >= this.h) return 0;
    const h2 = this.h * this.h;
    const diff = h2 - r * r;
    return (315 / (64 * Math.PI * Math.pow(this.h, 9))) * diff * diff * diff;
  }
  
  // Spiky 核函数梯度（用于压力）
  spikyGrad(r) {
    if (r >= this.h || r < 0.0001) return 0;
    const diff = this.h - r;
    return (-45 / (Math.PI * Math.pow(this.h, 6))) * diff * diff;
  }
  
  // 粘度核函数拉普拉斯（用于粘度）
  viscosityLap(r) {
    if (r >= this.h) return 0;
    return (45 / (Math.PI * Math.pow(this.h, 6))) * (this.h - r);
  }
  
  // 计算镜像粒子对密度的贡献
  _ghostParticleDensity(pi) {
    let ghostDensity = 0;
    const { minX, minY, maxX, maxY } = this.bounds;
    const h = this.h;
    
    // 检查四个边界，生成镜像粒子
    // 左边界
    if (pi.x - minX < h) {
      const dist = pi.x - minX;
      ghostDensity += this.poly6(2 * dist); // 镜像距离 = 2 * 到边界距离
    }
    // 右边界
    if (maxX - pi.x < h) {
      const dist = maxX - pi.x;
      ghostDensity += this.poly6(2 * dist);
    }
    // 下边界
    if (pi.y - minY < h) {
      const dist = pi.y - minY;
      ghostDensity += this.poly6(2 * dist);
    }
    // 上边界
    if (maxY - pi.y < h) {
      const dist = maxY - pi.y;
      ghostDensity += this.poly6(2 * dist);
    }
    
    return ghostDensity;
  }
  
  step() {
    const h2 = this.h * this.h;
    
    // 1. 计算密度（包含镜像粒子）
    for (let i = 0; i < this.particles.length; i++) {
      const pi = this.particles[i];
      pi.density = 0;
      
      // 真实粒子贡献
      for (let j = 0; j < this.particles.length; j++) {
        const pj = this.particles[j];
        const dx = pi.x - pj.x;
        const dy = pi.y - pj.y;
        const r2 = dx * dx + dy * dy;
        
        if (r2 < h2) {
          pi.density += this.poly6(Math.sqrt(r2));
        }
      }
      
      // 镜像粒子贡献（边界补偿）
      if (this.bounds) {
        pi.density += this._ghostParticleDensity(pi);
      }
      
      // 压力 = k * (密度 - 静止密度)
      pi.pressure = this.gasConstant * Math.max(0, pi.density - this.restDensity);
    }
    
    // 2. 计算力
    for (let i = 0; i < this.particles.length; i++) {
      const pi = this.particles[i];
      let fx = 0, fy = 0;
      
      for (let j = 0; j < this.particles.length; j++) {
        if (i === j) continue;
        
        const pj = this.particles[j];
        const dx = pi.x - pj.x;
        const dy = pi.y - pj.y;
        const r = Math.sqrt(dx * dx + dy * dy);
        
        if (r >= this.h || r < 0.0001) continue;
        
        // 压力力（相互排斥）
        const pressureForce = -this.spikyGrad(r) * (pi.pressure + pj.pressure) / (2 * pj.density);
        fx += pressureForce * (dx / r);
        fy += pressureForce * (dy / r);
        
        // 粘度力（速度平滑）
        const viscForce = this.viscosity * this.viscosityLap(r) / pj.density;
        fx += viscForce * (pj.vx - pi.vx);
        fy += viscForce * (pj.vy - pi.vy);
      }
      
      pi.ax = fx + this.gravity.x;
      pi.ay = fy + this.gravity.y;
    }
    
    // 3. 更新速度和位置
    for (const p of this.particles) {
      // 半隐式欧拉积分（更稳定）
      p.vx += p.ax * this.dt;
      p.vy += p.ay * this.dt;
      
      // 速度限制（防止爆炸）
      const maxSpeed = 10;
      const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      if (speed > maxSpeed) {
        p.vx = (p.vx / speed) * maxSpeed;
        p.vy = (p.vy / speed) * maxSpeed;
      }
      
      p.x += p.vx * this.dt;
      p.y += p.vy * this.dt;
    }
  }
}
