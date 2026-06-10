"use client";

import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

/**
 * The INJI signal field — a flowing surface of thin lines, like an
 * order-book depth chart breathing at night. Fully procedural GLSL:
 * no video, no textures, no network fetches. Reacts to the pointer
 * and pulses while INJI is responding.
 */

const NOISE_GLSL = /* glsl */ `
vec3 mod289(vec3 x){return x - floor(x * (1.0/289.0)) * 289.0;}
vec4 mod289(vec4 x){return x - floor(x * (1.0/289.0)) * 289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}
float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
            i.z + vec4(0.0, i1.z, i2.z, 1.0))
          + i.y + vec4(0.0, i1.y, i2.y, 1.0))
          + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}
`;

const FIELD_VERTEX = /* glsl */ `
uniform float uTime;
uniform float uAmp;
varying float vGlow;
varying float vFade;
${NOISE_GLSL}
void main() {
  vec3 p = position;
  float t = uTime * 0.22;
  float n = snoise(vec3(p.x * 0.14, p.z * 0.2, t));
  float n2 = snoise(vec3(p.x * 0.4 + 7.0, p.z * 0.55, t * 1.5)) * 0.35;
  float h = (n + n2) * uAmp;
  p.y += h;

  // crests glow, troughs sink toward indigo
  vGlow = clamp(h * 0.55 + 0.42, 0.0, 1.0);

  // fade at the sides and into the distance
  float edge = 1.0 - smoothstep(7.0, 15.0, abs(p.x));
  float depthFade = smoothstep(-17.0, -1.0, p.z);
  vFade = edge * mix(0.1, 1.0, depthFade);

  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

const FIELD_FRAGMENT = /* glsl */ `
varying float vGlow;
varying float vFade;
void main() {
  vec3 indigo = vec3(0.10, 0.10, 0.36);
  vec3 cyan = vec3(0.0, 0.83, 1.0);
  vec3 col = mix(indigo, cyan, vGlow);
  gl_FragColor = vec4(col, vFade * 0.5);
}
`;

const LINES = 70;
const SEGMENTS = 180;
const WIDTH = 30;
const DEPTH = 18;

function FieldLines({ pulse = false }: { pulse?: boolean }) {
  const group = useRef<THREE.Group>(null);
  const uniforms = useMemo(
    () => ({ uTime: { value: 0 }, uAmp: { value: 0.75 } }),
    []
  );

  const geometry = useMemo(() => {
    // one LineSegments buffer: LINES strips along X, laid out in depth (Z)
    const positions = new Float32Array(LINES * SEGMENTS * 2 * 3);
    let o = 0;
    for (let i = 0; i < LINES; i++) {
      const z = -DEPTH + (i / (LINES - 1)) * DEPTH; // -18 .. 0
      for (let j = 0; j < SEGMENTS; j++) {
        const x0 = -WIDTH / 2 + (j / SEGMENTS) * WIDTH;
        const x1 = -WIDTH / 2 + ((j + 1) / SEGMENTS) * WIDTH;
        positions[o++] = x0; positions[o++] = 0; positions[o++] = z;
        positions[o++] = x1; positions[o++] = 0; positions[o++] = z;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return geo;
  }, []);

  useFrame((state, delta) => {
    uniforms.uTime.value += delta;
    const targetAmp = pulse ? 1.4 : 0.75;
    uniforms.uAmp.value = THREE.MathUtils.lerp(
      uniforms.uAmp.value,
      targetAmp,
      delta * 2.5
    );
    if (group.current) {
      // gentle pointer parallax
      group.current.rotation.y = THREE.MathUtils.lerp(
        group.current.rotation.y,
        state.pointer.x * 0.05,
        delta * 2
      );
      group.current.position.y = THREE.MathUtils.lerp(
        group.current.position.y,
        state.pointer.y * 0.15,
        delta * 2
      );
    }
  });

  return (
    <group ref={group}>
      <lineSegments geometry={geometry}>
        <shaderMaterial
          uniforms={uniforms}
          vertexShader={FIELD_VERTEX}
          fragmentShader={FIELD_FRAGMENT}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </lineSegments>
    </group>
  );
}

function Stars({ count = 260 }: { count?: number }) {
  const ref = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 50;
      arr[i * 3 + 1] = Math.random() * 14 + 1;
      arr[i * 3 + 2] = -Math.random() * 30 - 4;
    }
    return arr;
  }, [count]);

  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.y += delta * 0.003;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.04}
        color="#8fa6bd"
        transparent
        opacity={0.4}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  );
}

export function SignalScene({
  pulse = false,
  className,
}: {
  pulse?: boolean;
  className?: string;
}) {
  return (
    <div className={className} aria-hidden>
      <Canvas
        dpr={[1, 2]}
        camera={{ fov: 50, position: [0, 2.3, 7.5] }}
        gl={{ antialias: true, alpha: true }}
        style={{ pointerEvents: "none" }}
        onCreated={({ camera }) => camera.lookAt(0, 0.4, -6)}
      >
        <group position={[0, -1.7, 0]}>
          <FieldLines pulse={pulse} />
        </group>
        <Stars />
      </Canvas>
    </div>
  );
}
