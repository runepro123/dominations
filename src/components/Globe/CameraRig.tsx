// OrbitControls wrapper. We don't auto-fly to the selected country — that
// yanked the camera whenever the user clicked a tile. Instead the panel slides
// in and the player is free to orbit/zoom toward what they want to inspect.

import { OrbitControls } from '@react-three/drei';

interface Props {
  minDistance?: number;
  maxDistance?: number;
}

export function CameraRig({ minDistance = 1.4, maxDistance = 6 }: Props) {
  return (
    <OrbitControls
      enablePan={false}
      enableZoom
      enableRotate
      minDistance={minDistance}
      maxDistance={maxDistance}
      zoomSpeed={0.8}
      rotateSpeed={0.5}
      autoRotate={false}
      makeDefault
    />
  );
}
