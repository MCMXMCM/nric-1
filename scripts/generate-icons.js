import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const sizes = [192, 512, 152, 180, 167, 57, 60, 72, 76, 96, 114, 120, 144, 152, 180, 192, 512, 1024];

// Create SVG content for the NRIC logo with custom colors
function createNRICIconSVG(backgroundColor, textColor) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="1000" height="1000">
    <defs>
      <mask id="stripeMask" maskUnits="userSpaceOnUse" x="0" y="0" width="1000" height="1000">
        <rect x="0" y="0" width="1000" height="1000" fill="black"/>
        <g fill="white">
          <rect x="100" y="200" width="800" height="15"/>
          <rect x="100" y="225" width="800" height="15"/>
          <rect x="100" y="250" width="800" height="15"/>
          <rect x="100" y="275" width="800" height="15"/>
          <rect x="100" y="300" width="800" height="15"/>
          <rect x="100" y="325" width="800" height="15"/>
          <rect x="100" y="350" width="800" height="15"/>
          <rect x="100" y="375" width="800" height="15"/>
          <rect x="100" y="400" width="800" height="15"/>
          <rect x="100" y="425" width="800" height="15"/>
          <rect x="100" y="450" width="800" height="15"/>
          <rect x="100" y="475" width="800" height="15"/>
          <rect x="100" y="500" width="800" height="15"/>
          <rect x="100" y="525" width="800" height="15"/>
          <rect x="100" y="550" width="800" height="15"/>
          <rect x="100" y="575" width="800" height="15"/>
          <rect x="100" y="600" width="800" height="15"/>
          <rect x="100" y="625" width="800" height="15"/>
          <rect x="100" y="650" width="800" height="15"/>
          <rect x="100" y="675" width="800" height="15"/>
          <rect x="100" y="700" width="800" height="15"/>
          <rect x="100" y="725" width="800" height="15"/>
          <rect x="100" y="750" width="800" height="15"/>
          <rect x="100" y="775" width="800" height="15"/>
          <rect x="100" y="800" width="800" height="15"/>
        </g>
      </mask>
    </defs>
    <rect x="0" y="0" width="1000" height="1000" fill="${backgroundColor}"/>
    <g mask="url(#stripeMask)">
      <text x="500" y="600"
            text-anchor="middle"
            font-family="Arial, Helvetica, sans-serif"
            font-weight="900"
            font-size="240"
            letter-spacing="0"
            fill="${textColor}">
        NRIC-1
      </text>
    </g>
  </svg>`;
}

async function generateIcons() {
  const publicDir = path.join(process.cwd(), 'public');
  
  // Ensure public directory exists
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  // Generate regular icons from SVG
  for (const size of sizes) {
    const svgContent = createNRICIconSVG('#25404b', '#d4cbb5');
    
    await sharp(Buffer.from(svgContent))
      .resize(size, size)
      .png()
      .toFile(path.join(publicDir, `icon-${size}.png`));
    
    console.log(`Generated icon-${size}.png`);
  }

  // Generate favicon.ico (16x16, 32x32, 48x48)
  const faviconSizes = [16, 32, 48];
  const faviconBuffers = [];
  
  for (const size of faviconSizes) {
    const svgContent = createNRICIconSVG('#25404b', '#d4cbb5');
    const buffer = await sharp(Buffer.from(svgContent))
      .resize(size, size)
      .png()
      .toBuffer();
    faviconBuffers.push(buffer);
  }
  
  // Create ICO file with multiple sizes
  const icoBuffer = await sharp(faviconBuffers[2]) // Use largest size for ICO
    .resize(48, 48)
    .png()
    .toBuffer();
  
  await sharp(icoBuffer)
    .resize(48, 48)
    .png()
    .toFile(path.join(publicDir, 'favicon.ico'));
  
  console.log('Generated favicon.ico');

  console.log('Successfully generated app icons using NRIC logo SVG!');
  console.log('Background: #25404b, Text: #d4cbb5');
}

generateIcons().catch(console.error);
