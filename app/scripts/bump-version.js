import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const versionFilePath = path.resolve(__dirname, '../src/version.ts');

try {
  let content = fs.readFileSync(versionFilePath, 'utf8');
  
  const match = content.match(/export const APP_VERSION = 'v(\d+)\.(\d+)\.(\d+)';/);
  if (!match) {
    console.error('Could not match APP_VERSION in version.ts');
    process.exit(1);
  }

  const major = parseInt(match[1], 10);
  const minor = parseInt(match[2], 10);
  const patch = parseInt(match[3], 10) + 1;
  const newVersion = `v${major}.${minor}.${patch}`;

  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const kst = new Date(utc + (9 * 3600000));
  
  const yyyy = kst.getFullYear();
  const mm = String(kst.getMonth() + 1).padStart(2, '0');
  const dd = String(kst.getDate()).padStart(2, '0');
  const hh = String(kst.getHours()).padStart(2, '0');
  const min = String(kst.getMinutes()).padStart(2, '0');

  const buildDate = `${yyyy}.${mm}.${dd}`;
  const buildTime = `${hh}:${min}`;

  const newContent = `export const APP_VERSION = '${newVersion}';
export const BUILD_DATE = '${buildDate}';
export const BUILD_TIME = '${buildTime}';
export const BUILD_FULL_TEXT = \`\${APP_VERSION} (Build \${BUILD_DATE} \${BUILD_TIME})\`;
`;

  fs.writeFileSync(versionFilePath, newContent, 'utf8');
  console.log(`[Version Bump] Successfully bumped version to ${newVersion} (${buildDate} ${buildTime})`);
} catch (err) {
  console.error('Error bumping version:', err);
  process.exit(1);
}
