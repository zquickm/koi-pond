// 水面焦散（caustics）：fish-d 的水之所以「活」，靠的是这层缓慢流动的折射光网。
// 着色器骨架照搬 fish-d watergl.js（MIT）：cScale 1.8 / cPow 11 / cGain 0.32 / cSpeed 0.25 / 5 次迭代，
// 半分辨率渲染（P.rs=0.5）。合成不用 fish-d 的 screen（那是给它的深水底色的，浅色水墨底上看不见），
// 改 overlay 双向：亮丝提亮、暗格压深，浅底也能读出光网。昼夜强度由 main.ts 调 uStrength。
import { Filter, GlProgram, Graphics } from 'pixi.js';

const VERT = `#version 300 es
in vec2 aPosition;
out vec2 vTextureCoord;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
void main(void) {
    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
    gl_Position = vec4(position, 0.0, 1.0);
    vTextureCoord = aPosition * (uOutputFrame.zw * uInputSize.zw);
}`;

const FRAG = `#version 300 es
in vec2 vTextureCoord;
out vec4 outColor;
uniform float uTime;
uniform float uStrength;
uniform float uScale;
uniform float uPow;
uniform float uGain;
uniform vec4 uInputSize;
void main(void) {
    vec2 uv = vTextureCoord * uInputSize.xy;
    vec2 p = mod(uv / uInputSize.y * uScale * 6.28318, 6.28318) - 250.0;
    vec2 i = p;
    float c = 1.0;
    float inten = 0.005;
    for (int n = 0; n < 5; n++) {
        float t = uTime * (1.0 - (3.5 / float(n + 1)));
        i = p + vec2(cos(t - i.x) + sin(t + i.y), sin(t - i.y) + cos(t + i.x));
        c += 1.0 / length(vec2(p.x / (sin(i.x + t) / inten), p.y / (cos(i.y + t) / inten)));
    }
    c /= 5.0;
    c = 1.17 - pow(c, 1.4);
    float v = pow(abs(c), uPow) * uGain;
    float v01 = clamp(v * 3.0, 0.0, 1.0);
    vec3 col = mix(vec3(0.47, 0.53, 0.51), vec3(1.0, 0.99, 0.95), v01);
    outColor = vec4(mix(vec3(0.5), col, uStrength), 1.0);
}`;

export type CausticParams = {
  scale?: number; // 光网格子大小（小=细密）
  pow?: number; // 对比锐度（大=细亮丝，小=软块面）
  gain?: number; // 光强
  speed?: number; // 流动速度
  strength?: number; // overlay 混合强度基准
  resolution?: number; // 滤镜渲染目标分辨率（相对渲染器分辨率）；大块软纹可调低省显存
};

export class Caustics {
  readonly layer = new Graphics();
  readonly filter: Filter;
  private speed: number;
  private strength: number;

  constructor(opts: CausticParams = {}) {
    const scale = opts.scale ?? 3.5;
    const pw = opts.pow ?? 11;
    const gain = opts.gain ?? 0.32;
    this.speed = opts.speed ?? 0.25;
    this.strength = opts.strength ?? 0.95;
    this.filter = new Filter({
      glProgram: GlProgram.from({ vertex: VERT, fragment: FRAG }),
      resolution: opts.resolution ?? 0.5,
      antialias: false,
      padding: 0,
      resources: {
        timeUniforms: {
          uTime: { value: 0, type: 'f32' },
        },
        strength: {
          uStrength: { value: this.strength, type: 'f32' },
        },
        shape: {
          uScale: { value: scale, type: 'f32' },
          uPow: { value: pw, type: 'f32' },
          uGain: { value: gain, type: 'f32' },
        },
      },
    });
    // overlay 属于 v8 的「高级混合模式」（WebGL 下走 BlendModeFilter 滤镜管道），
    // 要设在容器上让框架注入混合滤镜；设在自定义 Filter 上会被静默忽略。
    this.layer.blendMode = 'overlay';
    this.layer.filters = [this.filter];
  }

  /** 全幅底板：滤镜输出整幅 overlay 光网，靠遮罩裁进水岸 */
  layout(W: number, H: number) {
    this.layer.clear().rect(0, 0, W, H).fill({ color: 0xffffff, alpha: 1 });
  }

  update(t: number, strengthMul: number) {
    this.filter.resources.timeUniforms.uniforms.uTime = t * this.speed;
    this.filter.resources.strength.uniforms.uStrength = this.strength * strengthMul;
  }
}
