import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function generateShareImage() {
  try {
    const publicDir = path.join(__dirname, '..', 'public');
    const outputPath = path.join(publicDir, 'share-image.png');

    // Social media share image dimensions (1200x630px is optimal)
    const shareWidth = 1200;
    const shareHeight = 630;
    
    // Background color matching the app's dark theme
    const backgroundColor = '#000000';
    
    // Create the NRIC logo SVG with maximized text size
    const nricLogoSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" width="1600" height="1000">
      <defs>
        <mask id="stripeMask" maskUnits="userSpaceOnUse" x="0" y="0" width="1600" height="1000">
          <rect x="0" y="0" width="1600" height="1000" fill="black"/>
          <g fill="white">
            <rect x="0" y="150" width="1600" height="15"/>
            <rect x="0" y="175" width="1600" height="15"/>
            <rect x="0" y="200" width="1600" height="15"/>
            <rect x="0" y="225" width="1600" height="15"/>
            <rect x="0" y="250" width="1600" height="15"/>
            <rect x="0" y="275" width="1600" height="15"/>
            <rect x="0" y="300" width="1600" height="15"/>
            <rect x="0" y="325" width="1600" height="15"/>
            <rect x="0" y="350" width="1600" height="15"/>
            <rect x="0" y="375" width="1600" height="15"/>
            <rect x="0" y="400" width="1600" height="15"/>
            <rect x="0" y="425" width="1600" height="15"/>
            <rect x="0" y="450" width="1600" height="15"/>
            <rect x="0" y="475" width="1600" height="15"/>
            <rect x="0" y="500" width="1600" height="15"/>
            <rect x="0" y="525" width="1600" height="15"/>
            <rect x="0" y="550" width="1600" height="15"/>
            <rect x="0" y="575" width="1600" height="15"/>
            <rect x="0" y="600" width="1600" height="15"/>
            <rect x="0" y="625" width="1600" height="15"/>
            <rect x="0" y="650" width="1600" height="15"/>
            <rect x="0" y="675" width="1600" height="15"/>
            <rect x="0" y="700" width="1600" height="15"/>
            <rect x="0" y="725" width="1600" height="15"/>
            <rect x="0" y="750" width="1600" height="15"/>
            <rect x="0" y="775" width="1600" height="15"/>
            <rect x="0" y="800" width="1600" height="15"/>
            <rect x="0" y="825" width="1600" height="15"/>
          </g>
        </mask>
      </defs>
      <g mask="url(#stripeMask)">
        <text x="50%" y="68%"
              text-anchor="middle"
              font-family="Arial, Helvetica, sans-serif"
              font-weight="900"
              font-size="480"
              letter-spacing="-2"
              fill="#E8D6BA">
          NRIC-1
        </text>
      </g>
    </svg>`;
    
    // Calculate scaling to fit the logo in the center - maximize size
    const maxLogoHeight = shareHeight * 0.95; // Use 95% of height for logo
    const maxLogoWidth = shareWidth * 0.95;   // Use 95% of width for logo
    
    // Scale proportionally to fit within the max dimensions
    const scaleByWidth = maxLogoWidth / 1600;
    const scaleByHeight = maxLogoHeight / 1000;
    const scale = Math.min(scaleByWidth, scaleByHeight);
    
    const newWidth = Math.round(1600 * scale);
    const newHeight = Math.round(1000 * scale);
    
    console.log('Scaled NRIC logo dimensions:', newWidth, 'x', newHeight);
    
    // Position the logo centered
    const logoX = Math.round((shareWidth - newWidth) / 2);
    const logoY = Math.round((shareHeight - newHeight) / 2);
    
    // Create the base share image with black background
    const baseImage = sharp({
      create: {
        width: shareWidth,
        height: shareHeight,
        channels: 3,
        background: backgroundColor
      }
    });
    
    // Resize and overlay the NRIC logo
    const resizedLogoImage = await sharp(Buffer.from(nricLogoSVG))
      .resize(newWidth, newHeight)
      .png()
      .toBuffer();
    
    // Composite the final image
    await baseImage
      .composite([
        {
          input: resizedLogoImage,
          left: logoX,
          top: logoY
        }
      ])
      .png()
      .toFile(outputPath);
    
    console.log('✅ Share image generated successfully:', outputPath);
    console.log('📏 Dimensions: 1200x630px');
    console.log('🎨 NRIC logo positioned at:', logoX, 'x', logoY);
    
  } catch (error) {
    console.error('❌ Error generating share image:', error);
    process.exit(1);
  }
}

// Run the script
generateShareImage();
