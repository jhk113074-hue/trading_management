// E:\무역관리프로그램\app\ 루트에서 실행: node generate-icons.mjs
// 의존성 없이 SVG 기반 PNG 아이콘 생성

import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const outDir = join(process.cwd(), 'public', 'icons');
mkdirSync(outDir, { recursive: true });

// YSACC 브랜드 아이콘 SVG (빨강 배경 + YS 텍스트)
const makeSvg = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${size * 0.2}" fill="#C41E3A"/>
  <text
    x="50%" y="54%"
    text-anchor="middle"
    dominant-baseline="middle"
    font-family="Arial, sans-serif"
    font-weight="900"
    font-size="${size * 0.38}"
    fill="white"
    letter-spacing="${size * 0.01}"
  >YS</text>
  <text
    x="50%" y="80%"
    text-anchor="middle"
    dominant-baseline="middle"
    font-family="Arial, sans-serif"
    font-weight="700"
    font-size="${size * 0.14}"
    fill="rgba(255,255,255,0.75)"
    letter-spacing="${size * 0.02}"
  >ACC</text>
</svg>`.trim();

// SVG를 파일로 저장 (브라우저가 SVG를 PNG로 인식하도록 Content-Type 필요하나,
// vite-plugin-pwa는 PNG를 요구하므로 sharp 없이는 SVG만 저장)
// → 아래 안내 참고

const svgContent = makeSvg(512);
writeFileSync(join(outDir, 'icon.svg'), svgContent);
writeFileSync(join(join(process.cwd(), 'public'), 'apple-touch-icon.svg'), makeSvg(180));

console.log('✅ SVG 아이콘 생성 완료: public/icons/icon.svg');
console.log('');
console.log('📌 PNG 변환 방법 (둘 중 하나 선택):');
console.log('');
console.log('방법 A — sharp 설치 후 변환:');
console.log('  npm install sharp --save-dev');
console.log('  node convert-icons.mjs');
console.log('');
console.log('방법 B — 온라인 변환 (더 간단):');
console.log('  1. public/icons/icon.svg 파일을 열기');
console.log('  2. https://svgtopng.com 에서 192x192, 512x512 PNG로 변환');
console.log('  3. 변환된 파일을 public/icons/icon-192.png, icon-512.png 로 저장');
