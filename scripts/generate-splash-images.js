/**
 * Generate iOS PWA splash screen images
 *
 * This script generates startup images for iOS PWA in both light and dark themes.
 * The images are created for all major iPhone and iPad screen sizes and placed
 * in the public/splash/ directory with exact filenames referenced in index.html.
 *
 * Usage: npm run generate-splash
 *
 * The script uses the OstrichLogo SVG as a centered logo with theme-appropriate colors.
 * Both light and dark variants are generated automatically.
 */

import fs from 'fs';
import path from 'path';
import { createCanvas, loadImage } from 'canvas';
import sharp from 'sharp';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create SVG content for the NRIC logo
function createNRICSVG(color) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 1024" width="1200" height="1024">
    <defs>
      <mask id="stripeMask" maskUnits="userSpaceOnUse" x="0" y="0" width="1200" height="1024">
        <rect x="0" y="0" width="1200" height="1024" fill="black"/>
        <g fill="white">
          <rect x="0" y="120" width="1200" height="18"/>
          <rect x="0" y="148" width="1200" height="18"/>
          <rect x="0" y="176" width="1200" height="18"/>
          <rect x="0" y="204" width="1200" height="18"/>
          <rect x="0" y="232" width="1200" height="18"/>
          <rect x="0" y="260" width="1200" height="18"/>
          <rect x="0" y="288" width="1200" height="18"/>
          <rect x="0" y="316" width="1200" height="18"/>
          <rect x="0" y="344" width="1200" height="18"/>
          <rect x="0" y="372" width="1200" height="18"/>
          <rect x="0" y="400" width="1200" height="18"/>
          <rect x="0" y="428" width="1200" height="18"/>
          <rect x="0" y="456" width="1200" height="18"/>
          <rect x="0" y="484" width="1200" height="18"/>
          <rect x="0" y="512" width="1200" height="18"/>
          <rect x="0" y="540" width="1200" height="18"/>
          <rect x="0" y="568" width="1200" height="18"/>
          <rect x="0" y="596" width="1200" height="18"/>
          <rect x="0" y="624" width="1200" height="18"/>
          <rect x="0" y="652" width="1200" height="18"/>
          <rect x="0" y="680" width="1200" height="18"/>
          <rect x="0" y="708" width="1200" height="18"/>
          <rect x="0" y="736" width="1200" height="18"/>
          <rect x="0" y="764" width="1200" height="18"/>
          <rect x="0" y="792" width="1200" height="18"/>
          <rect x="0" y="820" width="1200" height="18"/>
          <rect x="0" y="848" width="1200" height="18"/>
        </g>
      </mask>
    </defs>
    <g mask="url(#stripeMask)">
      <text x="50%" y="58%"
            text-anchor="middle"
            font-family="Arial, Helvetica, sans-serif"
            font-weight="900"
            font-size="360"
            letter-spacing="0"
            fill="${color}">
        NRIC-1
      </text>
    </g>
  </svg>`;
}

// Function to convert SVG to PNG buffer
async function svgToPngBuffer(svgContent, size) {
  const intSize = Math.round(size); // Ensure integer dimensions
  return await sharp(Buffer.from(svgContent))
    .resize(intSize, intSize, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 } // Transparent background
    })
    .png()
    .toBuffer();
}

// Function to draw NRIC logo on canvas
async function drawNRICLogo(ctx, x, y, size, color) {
  const svgContent = createNRICSVG(color);
  const pngBuffer = await svgToPngBuffer(svgContent, size);

  // Create a temporary canvas to load the PNG
  const tempCanvas = createCanvas(size, size);
  const tempCtx = tempCanvas.getContext('2d');
  const img = await loadImage(pngBuffer);

  tempCtx.drawImage(img, 0, 0, size, size);

  // Draw the temporary canvas onto the main canvas
  ctx.drawImage(tempCanvas, x, y, size, size);
}

// Required splash screen sizes and their corresponding filenames
const splashSizes = [
  // iPad Pro 12.9"
  { width: 2048, height: 2732, name: '2048x2732' },
  // iPad Pro 11"
  { width: 1668, height: 2388, name: '1668x2388' },
  // iPad Air
  { width: 1536, height: 2048, name: '1536x2048' },
  // iPhone 15 Pro Max
  { width: 1290, height: 2796, name: '1290x2796' },
  // iPhone 12/13/14 Pro Max
  { width: 1284, height: 2778, name: '1284x2778' },
  // iPhone 14 Plus
  { width: 1179, height: 2556, name: '1179x2556' },
  // iPhone XS Max, 11 Pro Max
  { width: 1242, height: 2688, name: '1242x2688' },
  // iPhone 12/13/14 Pro
  { width: 1170, height: 2532, name: '1170x2532' },
  // iPhone X, XS, 11 Pro
  { width: 1125, height: 2436, name: '1125x2436' },
  // iPhone XR, 11
  { width: 828, height: 1792, name: '828x1792' },
  // iPhone 8, 7, 6s, 6
  { width: 750, height: 1334, name: '750x1334' },
  // iPhone 5s, 5c, 5
  { width: 640, height: 1136, name: '640x1136' }
];

async function generateSplashImages() {
  const splashDir = path.join(__dirname, '..', 'public', 'splash');

  // Ensure splash directory exists
  if (!fs.existsSync(splashDir)) {
    fs.mkdirSync(splashDir, { recursive: true });
  }

  for (const size of splashSizes) {
    // Generate light theme splash screen
    const lightCanvas = createCanvas(size.width, size.height);
    const lightCtx = lightCanvas.getContext('2d');

    // Light background
    lightCtx.fillStyle = '#f5efe5'; // Match the light theme background from CSS
    lightCtx.fillRect(0, 0, size.width, size.height);

    // Add centered NRIC logo in black for light theme
    const logoSize = Math.round(Math.min(size.width, size.height) * 0.8); // 80% of smallest dimension, rounded to integer
    const logoX = (size.width - logoSize) / 2;
    const logoY = (size.height - logoSize) / 2;
    await drawNRICLogo(lightCtx, logoX, logoY, logoSize, '#000000'); // Black logo for light background

    // Save light image
    const lightBuffer = lightCanvas.toBuffer('image/png');
    const lightPath = path.join(splashDir, `light-${size.name}.png`);
    fs.writeFileSync(lightPath, lightBuffer);
    console.log(`Generated: light-${size.name}.png`);

    // Generate dark theme splash screen
    const darkCanvas = createCanvas(size.width, size.height);
    const darkCtx = darkCanvas.getContext('2d');

    // Dark background
    darkCtx.fillStyle = '#000000'; // Match the dark theme background from CSS
    darkCtx.fillRect(0, 0, size.width, size.height);

    // Add centered NRIC logo in white for dark theme
    await drawNRICLogo(darkCtx, logoX, logoY, logoSize, '#ffffff'); // White logo for dark background

    // Save dark image
    const darkBuffer = darkCanvas.toBuffer('image/png');
    const darkPath = path.join(splashDir, `dark-${size.name}.png`);
    fs.writeFileSync(darkPath, darkBuffer);
    console.log(`Generated: dark-${size.name}.png`);
  }

  console.log(`\nSuccessfully generated ${splashSizes.length * 2} splash screen images using SVG NRIC Logo!`);
  console.log('Images are located in: public/splash/');
  console.log('Light theme: Black NRIC logo on cream background');
  console.log('Dark theme: White NRIC logo on black background');
}

generateSplashImages().catch(console.error);
