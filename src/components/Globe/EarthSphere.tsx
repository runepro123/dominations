// Satellite-style Earth: day texture blended with night-side city lights via a
// sun-direction terminator, plus a Blinn-Phong specular highlight over oceans.

import { useMemo } from 'react';
import * as THREE from 'three';
import { useFrame, useLoader } from '@react-three/fiber';

// Earth textures are bundled in public/textures/ (Vite serves them at /textures/...).
// This removes our runtime CDN dependency and survives offline / blocked egress.
const TEX = {
  day: '/textures/earth_atmos_2048.jpg',
  spec: '/textures/earth_specular_2048.jpg',
  night: '/textures/earth_lights_2048.png',
  normal: '/textures/earth_normal_2048.jpg',
};

interface Props {
  /** Sun direction (world space, normalised by shader). */
  sunDir?: THREE.Vector3;
}

export function EarthSphere({ sunDir = new THREE.Vector3(1, 0.3, 0.4) }: Props) {
  const [day, spec, night, normal] = useLoader(THREE.TextureLoader, [
    TEX.day,
    TEX.spec,
    TEX.night,
    TEX.normal,
  ]);

  useMemo(() => {
    day.anisotropy = 8;
    day.colorSpace = THREE.SRGBColorSpace;
    spec.colorSpace = THREE.NoColorSpace;
    night.colorSpace = THREE.SRGBColorSpace;
    normal.colorSpace = THREE.NoColorSpace;
  }, [day, spec, night, normal]);

  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uDay: { value: day },
        uNight: { value: night },
        uSpec: { value: spec },
        uNormal: { value: normal },
        uSunDir: { value: sunDir.clone().normalize() },
        uTime: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vWorldPos;
        varying vec3 vNormalW;

        void main() {
          vUv = uv;
          vNormalW = normalize(mat3(modelMatrix) * normal);
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPos = worldPos.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uDay;
        uniform sampler2D uNight;
        uniform sampler2D uSpec;
        uniform sampler2D uNormal;
        uniform vec3 uSunDir;
        uniform float uTime;

        varying vec2 vUv;
        varying vec3 vWorldPos;
        varying vec3 vNormalW;

        void main() {
          vec3 N = normalize(vNormalW);
          vec3 L = normalize(uSunDir);
          vec3 V = normalize(cameraPosition - vWorldPos);

          vec3 dayCol = texture2D(uDay, vUv).rgb;
          vec3 nightCol = texture2D(uNight, vUv).rgb;
          float specMap = texture2D(uSpec, vUv).r;

          float diffuse = clamp(dot(N, L), 0.0, 1.0);
          float lit = smoothstep(-0.05, 0.35, diffuse);

          // Warmer "city lights" on the night side, fading into the day terminator.
          vec3 litTerminator = mix(nightCol * 1.65, dayCol, lit);

          // Blinn-Phong specular highlight, gated to ocean (specMap bright).
          vec3 H = normalize(L + V);
          float specHi = pow(max(0.0, dot(N, H)), 64.0) * specMap;

          // Rim darkening for cinematic contrast at the silhouette.
          float fres = pow(1.0 - max(0.0, dot(N, V)), 3.0);
          vec3 col = (litTerminator + vec3(specHi) * 0.85) * mix(1.0, 0.78, fres * 0.55);

          // Subtle ambient term so fully unlit pixels stay readable.
          col += nightCol * (1.0 - lit) * 0.05;

          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
  }, [day, spec, night, normal, sunDir]);

  useFrame(({ clock }) => {
    material.uniforms.uTime.value = clock.elapsedTime;
  });

  return (
    <mesh material={material}>
      <sphereGeometry args={[1, 96, 96]} />
    </mesh>
  );
}
