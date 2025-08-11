import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrthographicCamera } from '@react-three/drei'
import { EffectComposer, Pixelation, Noise, Bloom, Vignette } from '@react-three/postprocessing'
import * as THREE from 'three'
import { useMemo, useRef } from 'react'

export type PixelLiquidR3FProps = {
  pixelSize?: number
  speed?: number
  intensity?: number
  palette?: [string, string, string]
  className?: string
  opacity?: number
}

const frag = `
precision highp float;
varying vec2 vUv;
uniform vec2  uRes;
uniform float uTime;
uniform float uSpeed;
uniform float uIntensity;
uniform vec3  uC0;
uniform vec3  uC1;
uniform vec3  uC2;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  float a = hash(i), b = hash(i+vec2(1.,0.)), c = hash(i+vec2(0.,1.)), d = hash(i+vec2(1.,1.));
  vec2 u = f*f*(3.-2.*f);
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}
float fbm(vec2 p){
  float v=0., a=0.5;
  for(int i=0;i<5;i++){ v += a*noise(p); p*=2.02; a*=.55; }
  return v;
}
vec2 flow(vec2 uv, float t){
  float n = fbm(uv*1.4 + t*.08*uSpeed);
  float a = n*6.2831;
  return vec2(cos(a), sin(a));
}
float metaballs(vec2 uv, float t){
  float f = 0.;
  for(int i=0;i<6;i++){
    float fi = float(i);
    vec2 p = vec2(
      fbm(uv*.6 + fi*3.1 + t*.12*uSpeed),
      fbm(uv*.6 + fi*7.7 - t*.10*uSpeed)
    );
    vec2 c = vec2(
      .2 + p.x*.6 + .1*sin(t*.3+fi),
      .25 + p.y*.5 + .1*cos(t*.27+fi*1.2)
    );
    c += .04*flow(c*3., t);
    float d = length(uv - c);
    f += .17/(d*d + .01);
  }
  return f;
}
void main() {
  vec2 uv = vUv;
  float t = uTime;
  float field = metaballs(uv, t);
  field += .6 * fbm(uv*3. + t*.2*uSpeed);
  float v = smoothstep(.6, 1.4, field * uIntensity);
  vec3 col = mix(uC0, uC1, smoothstep(0., .7, v));
  col = mix(col, uC2, smoothstep(.5, 1., v));
  gl_FragColor = vec4(col, 1.);
}`

const vert = `
precision highp float;
varying vec2 vUv;
void main(){
  vUv = uv;
  gl_Position = vec4(position.xy, 0., 1.);
}`

function QuadMaterial({ speed, intensity, palette }: { speed:number; intensity:number; palette:[string,string,string] }) {
  const mat = useRef<THREE.ShaderMaterial>(null!)
  const { size } = useThree()
  const uniforms = useMemo(() => ({
    uRes:       { value: new THREE.Vector2(size.width, size.height) },
    uTime:      { value: 0 },
    uSpeed:     { value: speed },
    uIntensity: { value: intensity },
    uC0:        { value: new THREE.Color(palette[0]) },
    uC1:        { value: new THREE.Color(palette[1]) },
    uC2:        { value: new THREE.Color(palette[2]) },
  }), [size, speed, intensity, palette])

  useFrame((_, dt) => {
    uniforms.uTime.value += dt
    uniforms.uRes.value.set(size.width, size.height)
    uniforms.uSpeed.value = speed
    uniforms.uIntensity.value = intensity
  })

  return (
    <shaderMaterial args={[{ uniforms, vertexShader: vert, fragmentShader: frag }]} />
  )
}

function Scene({ speed, intensity, palette, pixelSize }: { speed:number; intensity:number; palette:[string,string,string]; pixelSize:number }) {
  return (
    <>
      <OrthographicCamera makeDefault position={[0,0,1]} zoom={1} />
      <mesh>
        <planeGeometry args={[2, 2]} />
        <QuadMaterial speed={speed} intensity={intensity} palette={palette} />
      </mesh>
      <EffectComposer multisampling={0}>
        <Pixelation granularity={pixelSize} />
        <Noise premultiply opacity={0.08} />
        <Bloom intensity={0.25} luminanceThreshold={0.2} luminanceSmoothing={0.9} />
        <Vignette eskil={false} offset={0.3} darkness={0.6} />
      </EffectComposer>
    </>
  )
}

export default function PixelLiquidR3F({
  pixelSize = 12,
  speed = 1.2,
  intensity = 1.2,
  palette = ['#3b0a67', '#6a5ff5', '#ff7a2f'],
  className,
  opacity = 0.92,
}: PixelLiquidR3FProps) {
  return (
    <div className={className} style={{ opacity }}>
      <Canvas gl={{ antialias: false, powerPreference: 'high-performance' }} dpr={[1, 2]}>
        <Scene pixelSize={pixelSize} speed={speed} intensity={intensity} palette={palette} />
      </Canvas>
    </div>
  )
}