// Generate PWA icon set from a single inline SVG source.
// Outputs three PNGs in public/: icon-192.png, icon-512.png, icon-maskable-512.png.
// Run: `node scripts/generate-icons.mjs`
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const svg = `<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="bg" cx="50%" cy="42%" r="65%">
      <stop offset="0%" stop-color="#1e3a5f"/>
      <stop offset="65%" stop-color="#0b1828"/>
      <stop offset="100%" stop-color="#050810"/>
    </radialGradient>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>

  <!-- Globe: outer ring + meridian ellipse + equator + two latitudes -->
  <circle cx="256" cy="256" r="178" fill="none" stroke="#d4a72c" stroke-width="7" opacity="0.92"/>
  <ellipse cx="256" cy="256" rx="92" ry="178" fill="none" stroke="#d4a72c" stroke-width="4" opacity="0.7"/>
  <line x1="78" y1="256" x2="434" y2="256" stroke="#d4a72c" stroke-width="4" opacity="0.7"/>
  <line x1="110" y1="186" x2="402" y2="186" stroke="#d4a72c" stroke-width="3" opacity="0.5"/>
  <line x1="110" y1="326" x2="402" y2="326" stroke="#d4a72c" stroke-width="3" opacity="0.5"/>

  <!-- Crown star above the globe -->
  <g transform="translate(256,72)" fill="#d4a72c">
    <polygon points="0,-34 9,-11 33,-11 14,5 23,32 0,15 -23,32 -14,5 -33,-11 -9,-11"/>
  </g>
</svg>`;

const targets = [
  { size: 192, out: 'public/icon-192.png' },
  { size: 512, out: 'public/icon-512.png' },
  { size: 512, out: 'public/icon-maskable-512.png' },
];

for (const t of targets) {
  const info = await sharp(Buffer.from(svg))
    .resize(t.size, t.size, { fit: 'cover' })
    .png({ compressionLevel: 9 })
    .toFile(t.out);
  console.log(
    `wrote ${t.out}  ${info.width}x${info.height}  ${info.size} bytes`,
  );
}
