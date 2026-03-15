/**
 * SPH 流体求解器 - 简化稳定版
 * Smoothed Particle Hydrodynamics
 */
import { Particle } from './Particle.js';

export class SPHSolver {
  constructor(options = {}) {
    // 平滑核半径（粒子影响范围）
    this.h = options.h || 0.5;
    
    // 最大粒子数
    this.maxParticles = options.maxParticles || 300;
    
    // 时间步长
    this.dt = options.dt || 0.008;
    
    // 重力
    this.gravity = options.gravity || { x: 0, y: -2 };
    
    // SPH 参数
    this.restDensity = options.restDensity || 1.0;
    this.gasConstant = options.gasConstant || 0.5;
    this.viscosity = options.viscosity || 0.1;
    
    // 粒子数组
    this.particles = [];
  }
  
  addParticle(x, y) {
    if (this.particles.length >= this.maxParticles) return false;
    this.particles.push(new Particle(x, y));
    return true;
  }
  
  /**
   * Poly6 核函数 - 用于密度计算
   */
  poly6(r) {
    if (r >= this.h) return 0;
    const h2 = this.h * this.h;
    const h2_r2 = h2 - r * r;
    return (315 / (64 * Math.PI * Math.pow(this.h, 9))) * h2_r2 * h2_r2 * h2_r2;
  }
  
  /**
   * Spiky 核函数梯度 - 用于压力计算
   */
  spikyGrad(r) {
    if (r >= this.h || r < 0.0001) return 0;
    const h_r = this.h - r;
    return (-45 / (Math.PI * Math.pow(this.h, 6))) * h_r * h_r;
  }
  
  /**
   * 计算密度和压力
   */
  computeDensityPressure() {
    for (let i = 0; i < this.particles.length; i++) {
      const pi = this.particles[i];
      pi.density = 0;
      
      for (let j = 0; j < this.particles.length; j++) {
        const pj = this.particles[j];
        const dx = pj.x - pi.x;
        const dy = pj.y - pi.y;
        const r = Math.sqrt(dx * dx + dy * dy);
        
        pi.density += this.poly6(r);
      }
      
      // 压力 = 气体常数 * (密度 - 静止密度)
      pi.pressure = this.gasConstant * (pi.density - this.restDensity);
    }
  }
  
  /**
   * 计算并应用力
   */
  computeForces() {
    for (let i = 0; i < this.particles.length; i++) {
      const pi = this.particles[i];
      
      let fx = 0;
      let fy = 0;
      
      for (let j = 0; j < this.particles.length; j++) {
        if (i === j) continue;
        
        const pj = this.particles[j];
        const dx = pi.x - pj.x;
        const dy = pi.y - pj.y;
        const r = Math.sqrt(dx * dx + dy * dy);
        
        if (r >= this.h || r < 0.0001) continue;
        
        // 压力梯度力
        const pressureAvg = (pi.pressure + pj.pressure) / 2;
        const spikyGrad = this.spikyGrad(r);
        
        fx += pressureAvg * spikyGrad * (dx / r) / pi.density;
        fy += pressureAvg * spikyGrad * (dy / r) / pi.density;
        
        // 粘度力
        const viscosityLap = this.spikyGrad(r); // 简化
        fx += this.viscosity * viscosityLap * (pj.vx - pi.vx) / pi.density;
        fy += this.viscosity * viscosityLap * (pj.vy - pi.vy) / pi.density;
      }
      
      pi.ax = fx;
      pi.ay = fy;
    }
  }
  
  /**
   * 更新一步
   */
  step() {
    // 1. 计算密度和压力
    this.computeDensityPressure();
    
    // 2. 计算力
    this.computeForces();
    
    // 3. 应用重力和更新
    for (const p of this.particles) {
      // 添加重力
      p.ax += this.gravity.x;
      p.ay += this.gravity.y;
      
      // Verlet 积分
      p.vx += p.ax * this.dt;
      p.vy += p.ay * this.dt;
      
      // 阻尼（稳定性）
      p.vx *= 0.99;
      p.vy *= 0.99;
      
      p.x += p.vx * this.dt;
      p.y += p.vy * this.dt;
    }
  }
}
