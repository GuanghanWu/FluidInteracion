// Metaballs 片段着色器
precision highp float;

uniform vec2 u_resolution;
uniform vec3 u_particles[500]; // xy=位置，z=半径
uniform int u_particleCount;
uniform vec3 u_color;

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  
  float sum = 0.0;
  
  // 累加所有粒子的影响
  for (int i = 0; i < u_particleCount; i++) {
    vec2 pos = u_particles[i].xy;
    float r = u_particles[i].z;
    
    // 转换到屏幕空间
    vec2 screenPos = pos / u_resolution;
    float dist = distance(uv, screenPos);
    
    // Metaballs 阈值函数
    float influence = smoothstep(r, r * 0.5, dist);
    sum += influence;
  }
  
  // 阈值判定（形成连续表面）
  float threshold = 1.0;
  float alpha = smoothstep(threshold - 0.2, threshold + 0.2, sum);
  
  // 根据速度着色（简单版本）
  vec3 finalColor = u_color;
  
  gl_FragColor = vec4(finalColor, alpha);
}
