// Soft blue atmosphere halo using a backside fresnel shell.

import { useMemo } from 'react';
import * as THREE from 'three';

export function Atmosphere() {
  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uIntensity: { value: 0.9 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vNormal;
        uniform float uIntensity;
        void main() {
          float fres = pow(1.0 - max(0.0, dot(vNormal, vec3(0.0, 0.0, 1.0))), 2.4);
          vec3 col = mix(vec3(0.18, 0.45, 0.95), vec3(0.6, 0.75, 1.0), fres);
          gl_FragColor = vec4(col * fres * uIntensity, fres);
        }
      `,
    });
  }, []);

  return (
    <mesh material={material} renderOrder={2}>
      <sphereGeometry args={[1.06, 64, 64]} />
    </mesh>
  );
}
