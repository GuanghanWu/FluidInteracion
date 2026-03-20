/**
 * 粒子类 - 用于 SPH 流体模拟
 */
export class Particle {
  constructor(x, y) {
    // 位置
    this.x = x;
    this.y = y;
    
    // 速度
    this.vx = 0;
    this.vy = 0;
    
    // 加速度
    this.ax = 0;
    this.ay = 0;
    
    // 密度和压力
    this.density = 0;
    this.pressure = 0;
    
    // 质量（所有粒子相同）
    this.mass = 1.0;
  }
  
  /**
   * Verlet 积分更新位置
   * @param {number} dt - 时间步长
   */
  update(dt) {
    // Verlet 积分
    this.vx += this.ax * dt;
    this.vy += this.ay * dt;
    
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    
    // 重置加速度（会在 SPH 求解器中重新计算）
    this.ax = 0;
    this.ay = 0;
  }
  
  /**
   * 应用外力（重力等）
   * @param {number} gx - 重力 X 分量
   * @param {number} gy - 重力 Y 分量
   */
  applyForce(gx, gy) {
    this.ax += gx;
    this.ay += gy;
  }
  
  /**
   * 软边界 - 弹簧恢复力
   * 粒子越界时产生恢复力，而非硬碰撞
   * @param {number} minX 
   * @param {number} minY 
   * @param {number} maxX 
   * @param {number} maxY 
   * @param {number} stiffness - 弹簧刚度 (默认 50)
   * @param {number} damping - 速度阻尼 (默认 0.9)
   */
  applySoftBounds(minX, minY, maxX, maxY, stiffness = 50, damping = 0.9) {
    const boundaryMargin = 0.1; // 边界缓冲区
    
    // X 轴边界
    if (this.x < minX + boundaryMargin) {
      const penetration = (minX + boundaryMargin) - this.x;
      this.ax += stiffness * penetration; // 恢复力
      this.vx *= damping; // 速度阻尼
    } else if (this.x > maxX - boundaryMargin) {
      const penetration = this.x - (maxX - boundaryMargin);
      this.ax -= stiffness * penetration;
      this.vx *= damping;
    }
    
    // Y 轴边界
    if (this.y < minY + boundaryMargin) {
      const penetration = (minY + boundaryMargin) - this.y;
      this.ay += stiffness * penetration;
      this.vy *= damping;
    } else if (this.y > maxY - boundaryMargin) {
      const penetration = this.y - (maxY - boundaryMargin);
      this.ay -= stiffness * penetration;
      this.vy *= damping;
    }
  }
  
  /**
   * 硬边界 - 容器效果
   * 粒子严格限制在边界内，无法逃逸
   * @param {number} minX 
   * @param {number} minY 
   * @param {number} maxX 
   * @param {number} maxY 
   * @param {number} damping - 反弹阻尼 (默认 0.7)
   */
  applyHardBounds(minX, minY, maxX, maxY, damping = 0.7) {
    // X 轴硬边界
    if (this.x < minX) {
      this.x = minX;
      this.vx *= -damping;
    } else if (this.x > maxX) {
      this.x = maxX;
      this.vx *= -damping;
    }
    
    // Y 轴硬边界
    if (this.y < minY) {
      this.y = minY;
      this.vy *= -damping;
    } else if (this.y > maxY) {
      this.y = maxY;
      this.vy *= -damping;
    }
  }
}
