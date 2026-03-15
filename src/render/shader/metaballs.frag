// Metaballs Fragment Shader
precision highp float;

uniform vec2 uResolution;
uniform vec3 uParticles[300]; // x, y, radius
uniform int uParticleCount;
uniform vec3 uColor;

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution.xy;
  uv = uv * 2.0 - 1.0;
  uv.x *= uResolution.x / uResolution.y;
  
  float sum = 0.0;
  
  // 计算到所有粒子的距离场
  for (int i = 0; i < 300; i++) {
    if (i >= uParticleCount) break;
    
    vec2 particlePos = uParticles[i].xy;
    float radius = uParticles[i].z;
    
    float dist = length(uv - particlePos);
    
    // Metaballs 场函数
    sum += radius * radius / (dist * dist + 0.001);
  }
  
  // 阈值
  float threshold = 1.0;
  float alpha = smoothstep(threshold - 0.1, threshold + 0.1, sum);
  
  // 边缘发光效果
  float edge = smoothstep(threshold - 0.2, threshold, sum) - alpha;
  vec3 glowColor = uColor * 1.5;
  
  vec3 finalColor = mix(glowColor, uColor, alpha);
  
  gl_FragColor = vec4(finalColor, alpha + edge * 0.5);
}
