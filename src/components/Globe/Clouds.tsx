// Procedural cloud sphere. No texture dependency — we generate FBM noise in the
// fragment shader, soft-threshold it for a cloud-like silhouette, and drift it
// slowly eastward. The group self-rotates a touch for parallax against Earth.

import { useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

let cachedMaterial: THREE.ShaderMaterial | null = null;

const CLOUD_FRAGMENT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalW;
  uniform float uTime;
  uniform vec3 uSunDir;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }
  float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * valueNoise(p);
      p *= 2.07;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    // Continents run ~360° wide × 180° tall; sample at higher "zoom" for visible swirls.
    vec2 p = vUv * vec2(6.0, 3.0);
    p.x += uTime * 0.006;

    float clouds = fbm(p);
    float alpha = smoothstep(0.58, 0.76, clouds);

    // Soft polar taper so the band over the equator/deserts looks more natural.
    float polar = abs(vUv.y - 0.5) * 2.0;
    alpha *= 1.0 - smoothstep(0.78, 1.0, polar);

    // Brightness modulates with sun side: clouds read warm in day, cool at night.
    float warm = smoothstep(-0.05, 0.3, dot(normalize(vNormalW), normalize(uSunDir)));
    vec3 cloudCol = mix(vec3(0.36, 0.42, 0.55), vec3(1.0, 0.98, 0.94), warm);

    if (alpha < 0.04) discard;
    gl_FragColor = vec4(cloudCol, alpha * 0.32);
  }
`;

const CLOUD_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalW;
  uniform vec3 uSunDir;
  void main() {
    vUv = uv;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export function Clouds() {
  const groupRef = useRef<THREE.Group>(null);
  const sunDir = new THREE.Vector3(1.0, 0.4, 0.4);

  if (!cachedMaterial) {
    cachedMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.FrontSide,
      uniforms: {
        uTime: { value: 0 },
        uSunDir: { value: sunDir.clone().normalize() },
      },
      vertexShader: CLOUD_VERTEX,
      fragmentShader: CLOUD_FRAGMENT,
    });
  }
  const material = cachedMaterial;

  useFrame(({ clock }, dt) => {
    if (groupRef.current) groupRef.current.rotation.y += dt * 0.012;
    material.uniforms.uTime.value = clock.elapsedTime;
  });

  return (
    <group ref={groupRef}>
      {/* raycast={null} so click events pass through to the country hitboxes. */}
      <mesh material={material} raycast={() => null}>
        <sphereGeometry args={[1.012, 96, 96]} />
      </mesh>
    </group>
  );
}
