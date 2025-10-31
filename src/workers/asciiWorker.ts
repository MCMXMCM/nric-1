// GPU-accelerated ASCII renderer worker

export interface WorkerRenderGlMsg {
  type: 'render-gl';
  bitmap: ImageBitmap;
  options: {
    useColor: boolean;
    charWidthPerEm: number;
    caps: { cols: number; rows: number };
    output: { width: number; height: number };
    ramp: string; // characters ordered from lightest to darkest
    requestId?: number;
  };
}

type AnyMsg = WorkerRenderGlMsg;

const wlog = (msg: string, data?: unknown) => {
  try {
    (self as unknown as Worker).postMessage({ type: 'log', message: `[worker] ${msg}`, data });
  } catch {}
  try { console.debug('[ascii-worker]', msg, data || ''); } catch {}
};

// Track WebGL resources for cleanup
let activeTextures: WebGLTexture[] = [];
let activeFramebuffers: WebGLFramebuffer[] = [];
let activePrograms: WebGLProgram[] = [];
let activeShaders: WebGLShader[] = [];
let activeBuffers: WebGLBuffer[] = [];
let glContext: WebGLRenderingContext | null = null;

// Memory monitoring for WebGL resources
let resourceCount = 0;
const MAX_RESOURCES = 50; // Limit total WebGL resources

// Enhanced cleanup function for WebGL resources
const cleanupWebGLResources = () => {
  try {
    if (!glContext) return;

    // Delete all tracked textures
    activeTextures.forEach(texture => {
      try {
        glContext!.deleteTexture(texture);
      } catch (error) {
        wlog('Error deleting texture:', error);
      }
    });

    // Delete all tracked framebuffers
    activeFramebuffers.forEach(framebuffer => {
      try {
        glContext!.deleteFramebuffer(framebuffer);
      } catch (error) {
        wlog('Error deleting framebuffer:', error);
      }
    });

    // Delete all tracked programs
    activePrograms.forEach(program => {
      try {
        glContext!.deleteProgram(program);
      } catch (error) {
        wlog('Error deleting program:', error);
      }
    });

    // Delete all tracked shaders
    activeShaders.forEach(shader => {
      try {
        glContext!.deleteShader(shader);
      } catch (error) {
        wlog('Error deleting shader:', error);
      }
    });

    // Delete all tracked buffers
    activeBuffers.forEach(buffer => {
      try {
        glContext!.deleteBuffer(buffer);
      } catch (error) {
        wlog('Error deleting buffer:', error);
      }
    });

    // Clear arrays and reset counter
    activeTextures = [];
    activeFramebuffers = [];
    activePrograms = [];
    activeShaders = [];
    activeBuffers = [];
    resourceCount = 0;

    // Force garbage collection hint for iOS Safari
    if (typeof window !== 'undefined' && 'gc' in window) {
      try {
        (window as any).gc();
      } catch (e) {
        // Ignore if gc is not available
      }
    }

    wlog(`WebGL resources cleaned up successfully. Resource count reset to ${resourceCount}`);
  } catch (error) {
    wlog('Error during WebGL cleanup:', error);
  }
};

// Check if we need to cleanup due to resource limit
const checkResourceLimit = () => {
  if (resourceCount > MAX_RESOURCES) {
    wlog(`WebGL resource limit exceeded (${resourceCount}/${MAX_RESOURCES}), cleaning up...`);
    cleanupWebGLResources();
  }
};

// Build a glyph atlas using 2D canvas (alpha channel encodes glyph coverage)
const buildGlyphAtlas = (ramp: string, glyphW: number, glyphH: number) => {
  // Pack horizontally (single row) for simpler addressing
  const count = ramp.length;
  const atlasW = glyphW * count;
  const atlasH = glyphH;
  const canvas = new OffscreenCanvas(atlasW, atlasH);
  const ctx = canvas.getContext('2d')!;
  
  // Clear with black background
  ctx.clearRect(0, 0, atlasW, atlasH);
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, atlasW, atlasH);
  
  // Configure text rendering for crisp glyphs
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  
  // Use higher resolution for better anti-aliasing, then scale down
  const fontPx = Math.floor(glyphH * 0.85); // slightly smaller to prevent bleeding
  ctx.font = `${fontPx}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`;
  
  // Enable anti-aliasing for smoother glyph edges
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  
  for (let i = 0; i < count; i++) {
    const ch = ramp[i];
    // Center each glyph in its cell with extra padding to prevent bleeding
    const cellLeft = i * glyphW;
    const cellRight = (i + 1) * glyphW;
    
    // Clear the cell area first to ensure clean boundaries
    ctx.fillStyle = '#000000';
    ctx.fillRect(cellLeft, 0, glyphW, glyphH);
    
    // Draw the glyph with white color
    ctx.fillStyle = '#ffffff';
    const x = cellLeft + glyphW * 0.5;
    const y = glyphH * 0.5;
    ctx.fillText(ch, x, y);
    
    // Add black borders around each glyph cell to prevent bleeding
    ctx.fillStyle = '#000000';
    if (i > 0) {
      ctx.fillRect(cellLeft, 0, 1, glyphH); // left border
    }
    if (i < count - 1) {
      ctx.fillRect(cellRight - 1, 0, 1, glyphH); // right border  
    }
  }
  return { canvas, width: atlasW, height: atlasH };
};

// GL helpers with resource tracking
const createGl = (canvas: OffscreenCanvas) => {
  const gl = canvas.getContext('webgl', { alpha: true, antialias: false, premultipliedAlpha: false }) as WebGLRenderingContext | null;
  if (!gl) return null;
  
  // Store context reference for cleanup
  glContext = gl;
  
  const compile = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    activeShaders.push(s);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(s) || 'shader compile error';
      gl.deleteShader(s);
      activeShaders = activeShaders.filter(shader => shader !== s);
      throw new Error(log);
    }
    return s;
  };
  
  const link = (vsSrc: string, fsSrc: string) => {
    const p = gl.createProgram()!;
    activePrograms.push(p);
    const vs = compile(gl.VERTEX_SHADER, vsSrc);
    const fs = compile(gl.FRAGMENT_SHADER, fsSrc);
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(p) || 'program link error';
      gl.deleteProgram(p);
      activePrograms = activePrograms.filter(program => program !== p);
      throw new Error(log);
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    activeShaders = activeShaders.filter(shader => shader !== vs && shader !== fs);
    return p;
  };
  
  const createTextureFromCanvas = (c: OffscreenCanvas) => {
    const tex = gl.createTexture()!;
    activeTextures.push(tex);
    resourceCount++;
    checkResourceLimit();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    // Use NEAREST to avoid interpolation across glyph cells which can
    // introduce vertical banding/bleeding artifacts when the atlas is sampled.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c as unknown as HTMLCanvasElement);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    return tex;
  };
  
  const createTextureFromBitmap = (bmp: ImageBitmap) => {
    const tex = gl.createTexture()!;
    activeTextures.push(tex);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bmp);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    return tex;
  };
  
  const createFramebufferWithTexture = (width: number, height: number) => {
    const tex = gl.createTexture()!;
    activeTextures.push(tex);
    resourceCount++;
    checkResourceLimit();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    // Use NEAREST filtering for grid texture to prevent interpolation artifacts
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const fb = gl.createFramebuffer()!;
    activeFramebuffers.push(fb);
    resourceCount++;
    checkResourceLimit();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { fb, tex };
  };
  
  // Fullscreen triangle
  const quad = gl.createBuffer()!;
  activeBuffers.push(quad);
  resourceCount++;
  checkResourceLimit();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1,
     3, -1,
    -1,  3,
  ]), gl.STATIC_DRAW);
  return { gl, link, createTextureFromCanvas, createTextureFromBitmap, createFramebufferWithTexture, quad };
};

// Two-pass pipeline: (1) downsample source to grid, (2) draw glyphs from atlas using grid samples
const renderAsciiGl = (bitmap: ImageBitmap, opts: {
  useColor: boolean;
  perEm: number;
  caps: { cols: number; rows: number };
  output: { width: number; height: number };
  ramp: string;
}) => {
  const aspect = bitmap.width / bitmap.height;
  const perEm = opts.perEm;
  let cols = opts.caps.cols;
  let rows = Math.floor((cols * perEm) / aspect);
  if (rows > opts.caps.rows) {
    rows = opts.caps.rows;
    cols = Math.max(10, Math.floor((rows * aspect) / perEm));
  }
  wlog('derived grid', { cols, rows, aspect, perEm });

  // Choose glyph size so that grid fits canvas exactly (integer multiples).
  // This prevents fractional sampling that can cause vertical banding.
  let glyphH = Math.max(8, Math.floor(opts.output.height / rows));
  let glyphW = Math.max(6, Math.floor(opts.output.width / cols));
  let renderW = cols * glyphW;
  let renderH = rows * glyphH;
  // If rounding made it too small relative to requested output, nudge up.
  if (renderW < opts.output.width) {
    glyphW = Math.max(6, glyphW + 1);
    renderW = cols * glyphW;
  }
  if (renderH < opts.output.height) {
    glyphH = Math.max(8, glyphH + 1);
    renderH = rows * glyphH;
  }
  wlog('glyph metrics', { glyphW, glyphH, renderW, renderH, reqW: opts.output.width, reqH: opts.output.height });

  const canvas = new OffscreenCanvas(renderW, renderH);
  const glCtx = createGl(canvas);
  if (!glCtx) {
    wlog('WebGL context creation failed');
    throw new Error('WebGL not available in worker');
  }
  const { gl, link, createTextureFromCanvas, createTextureFromBitmap, createFramebufferWithTexture, quad } = glCtx;
  // Avoid driver-level dithering patterns on near-white backgrounds
  try { gl.disable(gl.DITHER); } catch {}

  const sourceTex = createTextureFromBitmap(bitmap);
  const { canvas: atlasCanvas, width: atlasW, height: atlasH } = buildGlyphAtlas(opts.ramp, glyphW, glyphH);
  const atlasTex = createTextureFromCanvas(atlasCanvas);
  wlog('textures ready', { atlasW, atlasH });

  // Pass 1: downsample to grid texture (cols x rows)
  const pass1VS = `
    attribute vec2 a_pos;
    varying vec2 v_uv;
    void main(){
      v_uv = (a_pos * 0.5) + 0.5;
      gl_Position = vec4(a_pos, 0.0, 1.0);
    }
  `;
  const pass1FS = `
    precision highp float;
    varying vec2 v_uv;
    uniform sampler2D u_src;
    uniform float u_cols;
    uniform float u_rows;
    
    void main(){
      // Calculate which cell we're rendering to
      vec2 cellCoord = floor(v_uv * vec2(u_cols, u_rows));
      
      // Calculate the source region that maps to this cell
      vec2 cellSize = 1.0 / vec2(u_cols, u_rows);
      vec2 cellCenter = (cellCoord + 0.5) * cellSize;
      
      // Multi-sample the source image in a small area around the cell center
      // This reduces aliasing artifacts that can cause dark lines
      vec3 colorSum = vec3(0.0);
      float samples = 0.0;
      
      // 3x3 sampling pattern for better anti-aliasing
      for (float dy = -1.0; dy <= 1.0; dy += 1.0) {
        for (float dx = -1.0; dx <= 1.0; dx += 1.0) {
          vec2 offset = vec2(dx, dy) * cellSize * 0.25; // quarter-cell offset
          vec2 sampleUV = clamp(cellCenter + offset, vec2(0.0), vec2(1.0));
          vec3 sample = texture2D(u_src, sampleUV).rgb;
          colorSum += sample;
          samples += 1.0;
        }
      }
      
      vec3 avgColor = colorSum / samples;
      
      // Tone pre-adjust: lift shadows and mid-tones slightly
      float gamma = 0.85; // < 1.0 brightens
      avgColor = pow(avgColor, vec3(gamma));
      avgColor = clamp(avgColor * 1.08, 0.0, 1.0); // reduced exposure
      
      gl_FragColor = vec4(avgColor, 1.0);
    }
  `;
  const pass1 = link(pass1VS, pass1FS);
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.viewport(0, 0, cols, rows);
  const gridRT = createFramebufferWithTexture(cols, rows);
  gl.bindFramebuffer(gl.FRAMEBUFFER, gridRT.fb);
  gl.useProgram(pass1);
  const aPosLoc1 = gl.getAttribLocation(pass1, 'a_pos');
  gl.enableVertexAttribArray(aPosLoc1);
  gl.vertexAttribPointer(aPosLoc1, 2, gl.FLOAT, false, 0, 0);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, sourceTex);
  const uSrcLoc = gl.getUniformLocation(pass1, 'u_src');
  gl.uniform1i(uSrcLoc, 0);
  // Pass grid dimensions for proper sampling
  gl.uniform1f(gl.getUniformLocation(pass1, 'u_cols'), cols);
  gl.uniform1f(gl.getUniformLocation(pass1, 'u_rows'), rows);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  // Pass 2: render ASCII using atlas and grid texture
  const pass2VS = `
    attribute vec2 a_pos;
    varying vec2 v_fragCoord;
    void main(){
      v_fragCoord = a_pos * 0.5 + 0.5;
      gl_Position = vec4(a_pos, 0.0, 1.0);
    }
  `;
  const pass2FS = `
    precision highp float;
    varying vec2 v_fragCoord; // 0..1
    uniform sampler2D u_grid; // cols x rows RGB
    uniform sampler2D u_atlas; // glyph atlas row
    uniform float u_cols;
    uniform float u_rows;
    uniform float u_glyphW;
    uniform float u_glyphH;
    uniform float u_atlasW;
    uniform float u_atlasH;
    uniform float u_rampCount;
    uniform bool u_useColor;

    float luminance(vec3 c){
      // Perceptual luma
      return dot(c, vec3(0.299, 0.587, 0.114));
    }

    vec3 applyContrast(vec3 color, float contrast){
      return (color - 0.5) * contrast + 0.5;
    }

    vec3 applySaturation(vec3 color, float sat){
      float l = luminance(color);
      return mix(vec3(l), color, sat);
    }

    void main(){
      // Calculate output pixel coordinates in final canvas space
      vec2 outputPixel = v_fragCoord * vec2(u_cols * u_glyphW, u_rows * u_glyphH);
      
      // Determine which ASCII cell this pixel belongs to
      vec2 cellCoord = floor(outputPixel / vec2(u_glyphW, u_glyphH));
      
      // Ensure cell coordinates are within valid bounds
      cellCoord = clamp(cellCoord, vec2(0.0), vec2(u_cols - 1.0, u_rows - 1.0));
      
      // Sample grid at exact cell center to avoid interpolation artifacts
      vec2 cellUV = (cellCoord + vec2(0.5)) / vec2(u_cols, u_rows);
      // Flip Y when sampling grid so rows are upright
      cellUV.y = 1.0 - cellUV.y;
      
      vec3 rgb = texture2D(u_grid, cellUV).rgb;
      
      // Tone and color enhancements for richer ASCII rendering
      float gammaIn = 0.85;      // brighten shadows
      float exposure = 1.08;     // slightly reduced to prevent blown highlights
      float contrast = 1.08;     // slightly reduced for smoother gradients
      float saturation = 1.2;    // slightly reduced for more natural colors
      
      vec3 rgbAdj = pow(rgb, vec3(gammaIn));
      rgbAdj = clamp(rgbAdj * exposure, 0.0, 1.0);
      rgbAdj = applyContrast(rgbAdj, contrast);
      rgbAdj = clamp(applySaturation(rgbAdj, saturation), 0.0, 1.0);
      float lum = luminance(rgbAdj);
      
      // Minimal dithering to prevent banding while avoiding line artifacts
      float noise = fract(sin(dot(cellCoord, vec2(12.9898, 78.233))) * 43758.5453);
      lum = clamp(lum + (noise - 0.5) * 0.005, 0.0, 1.0); // further reduced noise
      
      // Bias toward slightly lighter glyphs for readability
      float lumMapped = pow(lum, 0.95);
      float rampIndex = floor(clamp(lumMapped * (u_rampCount - 1.0), 0.0, u_rampCount - 1.0));
      
      // Calculate precise local coordinates within the glyph cell
      vec2 localPixel = mod(outputPixel, vec2(u_glyphW, u_glyphH));
      vec2 local = localPixel / vec2(u_glyphW, u_glyphH);
      
      // Atlas sampling with precise bounds to prevent inter-glyph bleeding
      float glyphIndex = rampIndex;
      
      // Calculate atlas coordinates with better precision and safety margins
      float epsilon = 1.0 / u_atlasW; // larger epsilon for more safety
      float gx = (glyphIndex * u_glyphW + local.x * (u_glyphW - 2.0) + 1.0) / u_atlasW;
      gx = clamp(gx, (glyphIndex * u_glyphW + epsilon) / u_atlasW, 
                 ((glyphIndex + 1.0) * u_glyphW - epsilon) / u_atlasW);
      
      // Flip Y for atlas sampling with improved safety margins
      float gy = (u_glyphH - local.y * (u_glyphH - 2.0) - 1.0) / u_atlasH;
      gy = clamp(gy, epsilon, (u_glyphH - epsilon) / u_atlasH);
      
      vec4 atlasColor = texture2D(u_atlas, vec2(gx, gy));
      float alpha = atlasColor.r; // white glyph pixels become opaque strokes
      
      // Use enhanced color for output; for monochrome, use enhanced luminance
      vec3 outColor = u_useColor ? rgbAdj : vec3(lum);
      gl_FragColor = vec4(outColor, alpha);
    }
  `;
  const pass2 = link(pass2VS, pass2FS);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.useProgram(pass2);
  const aPosLoc2 = gl.getAttribLocation(pass2, 'a_pos');
  gl.enableVertexAttribArray(aPosLoc2);
  gl.vertexAttribPointer(aPosLoc2, 2, gl.FLOAT, false, 0, 0);
  // Bind textures
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, gridRT.tex);
  const uGridLoc = gl.getUniformLocation(pass2, 'u_grid');
  gl.uniform1i(uGridLoc, 0);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, atlasTex);
  const uAtlasLoc = gl.getUniformLocation(pass2, 'u_atlas');
  gl.uniform1i(uAtlasLoc, 1);
  // Set uniforms
  gl.uniform1f(gl.getUniformLocation(pass2, 'u_cols'), cols);
  gl.uniform1f(gl.getUniformLocation(pass2, 'u_rows'), rows);
  gl.uniform1f(gl.getUniformLocation(pass2, 'u_glyphW'), glyphW);
  gl.uniform1f(gl.getUniformLocation(pass2, 'u_glyphH'), glyphH);
  gl.uniform1f(gl.getUniformLocation(pass2, 'u_atlasW'), atlasW);
  gl.uniform1f(gl.getUniformLocation(pass2, 'u_atlasH'), atlasH);
  gl.uniform1f(gl.getUniformLocation(pass2, 'u_rampCount'), opts.ramp.length);
  gl.uniform1i(gl.getUniformLocation(pass2, 'u_useColor'), opts.useColor ? 1 : 0);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  // Ensure all draws are finished before snapshot
  gl.finish();
  const bitmapOut = canvas.transferToImageBitmap();
  wlog('render complete', { outW: canvas.width, outH: canvas.height });
  return { bitmap: bitmapOut, cols, rows };
};

// CPU fallback: sample into grid on 2D canvas, then render ASCII to output canvas using fillText
const renderAsciiCpu = (bitmap: ImageBitmap, opts: {
  useColor: boolean;
  perEm: number;
  caps: { cols: number; rows: number };
  output: { width: number; height: number };
  ramp: string;
}) => {
  const aspect = bitmap.width / bitmap.height;
  let cols = opts.caps.cols;
  let rows = Math.floor((cols * opts.perEm) / aspect);
  if (rows > opts.caps.rows) {
    rows = opts.caps.rows;
    cols = Math.max(10, Math.floor((rows * aspect) / opts.perEm));
  }
  const gridCanvas = new OffscreenCanvas(cols, rows);
  const gctx = gridCanvas.getContext('2d')!;
  gctx.imageSmoothingEnabled = true;
  gctx.imageSmoothingQuality = 'high'; // improved quality
  gctx.drawImage(bitmap, 0, 0, cols, rows);
  const img = gctx.getImageData(0, 0, cols, rows);
  const data = img.data;

  // Match GL path: choose integer glyph sizes and canvas dimensions that
  // are exact multiples of the grid to avoid fractional sampling artifacts.
  let glyphW = Math.max(6, Math.floor(opts.output.width / cols));
  let glyphH = Math.max(8, Math.floor(opts.output.height / rows));
  let renderW = cols * glyphW;
  let renderH = rows * glyphH;
  if (renderW < opts.output.width) { glyphW += 1; renderW = cols * glyphW; }
  if (renderH < opts.output.height) { glyphH += 1; renderH = rows * glyphH; }
  const out = new OffscreenCanvas(renderW, renderH);
  const octx = out.getContext('2d')!;
  octx.fillStyle = '#000000';
  octx.fillRect(0, 0, out.width, out.height);
  octx.textBaseline = 'top';
  octx.font = `${Math.floor(glyphH * 0.9)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`;

  const rampArr = opts.ramp.split('');
  const rlen = rampArr.length;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = (y * cols + x) * 4;
      // Original sample
      const sr = data[i] / 255.0;
      const sg = data[i + 1] / 255.0;
      const sb = data[i + 2] / 255.0;
      // Apply same tone/color enhancements as GL path (matched values)
      const gammaIn = 0.85;
      const exposure = 1.08;  // reduced to match GL path
      const contrast = 1.08;  // reduced to match GL path
      const saturation = 1.2; // reduced to match GL path
      // gamma and exposure
      let rLin = Math.pow(sr, gammaIn) * exposure;
      let gLin = Math.pow(sg, gammaIn) * exposure;
      let bLin = Math.pow(sb, gammaIn) * exposure;
      // contrast around 0.5
      rLin = (rLin - 0.5) * contrast + 0.5;
      gLin = (gLin - 0.5) * contrast + 0.5;
      bLin = (bLin - 0.5) * contrast + 0.5;
      // saturation
      const lumBase = (0.299 * rLin + 0.587 * gLin + 0.114 * bLin);
      rLin = lumBase + (rLin - lumBase) * saturation;
      gLin = lumBase + (gLin - lumBase) * saturation;
      bLin = lumBase + (bLin - lumBase) * saturation;
      // clamp
      rLin = rLin < 0 ? 0 : (rLin > 1 ? 1 : rLin);
      gLin = gLin < 0 ? 0 : (gLin > 1 ? 1 : gLin);
      bLin = bLin < 0 ? 0 : (bLin > 1 ? 1 : bLin);
      // luminance for ramp index with reduced dithering to prevent artifacts
      let lum = (0.299 * rLin + 0.587 * gLin + 0.114 * bLin);
      const noiseBase = Math.sin((x + 0.5) * 12.9898 + (y + 0.5) * 78.233) * 43758.5453;
      const noise = noiseBase - Math.floor(noiseBase);
      lum = lum + (noise - 0.5) * 0.005; // minimal noise to match GL path
      if (lum < 0) lum = 0; if (lum > 1) lum = 1;
      const lumMapped = Math.pow(lum, 0.95);
      const idx = Math.min(rlen - 1, Math.max(0, Math.floor(lumMapped * (rlen - 1))));
      const ch = rampArr[idx];
      const outR = Math.round(rLin * 255);
      const outG = Math.round(gLin * 255);
      const outB = Math.round(bLin * 255);
      const gray = Math.round(lum * 255);
      const color = opts.useColor ? `rgb(${outR}, ${outG}, ${outB})` : `rgb(${gray}, ${gray}, ${gray})`;
      octx.fillStyle = color;
      octx.fillText(ch, x * glyphW, y * glyphH);
    }
  }
  const bitmapOut = out.transferToImageBitmap();
  return { bitmap: bitmapOut, cols, rows };
};

// Track render count for periodic cleanup
let renderCount = 0;
const CLEANUP_INTERVAL = 10; // Clean up every 10 renders

self.onmessage = async (e: MessageEvent<AnyMsg>) => {
  const msg = e.data as AnyMsg;
  try {
    if (!msg) return;
    if (msg.type === 'render-gl') {
      const { bitmap, options } = msg;
      wlog('received render request', { bmpW: bitmap.width, bmpH: bitmap.height, options });
      
      renderCount++;
      
      try {
        const result = renderAsciiGl(bitmap, {
          useColor: options.useColor,
          perEm: options.charWidthPerEm || 0.6,
          caps: options.caps,
          output: options.output,
          ramp: options.ramp
        });
        (self as unknown as Worker).postMessage({ type: 'bitmap', requestId: options.requestId, bitmap: result.bitmap, cols: result.cols, rows: result.rows }, [result.bitmap as unknown as Transferable]);
        
        // Clean up WebGL resources after rendering to prevent memory leaks
        cleanupWebGLResources();
        
        // Periodic deep cleanup every CLEANUP_INTERVAL renders
        if (renderCount % CLEANUP_INTERVAL === 0) {
          wlog(`Performing periodic cleanup after ${renderCount} renders`);
          // Force a more aggressive cleanup
          setTimeout(() => {
            cleanupWebGLResources();
          }, 100);
        }
      } catch (glErr) {
        wlog('WebGL path failed, using CPU fallback', String(glErr));
        try {
          const result = renderAsciiCpu(bitmap, {
            useColor: options.useColor,
            perEm: options.charWidthPerEm || 0.6,
            caps: options.caps,
            output: options.output,
            ramp: options.ramp
          });
          (self as unknown as Worker).postMessage({ type: 'bitmap', requestId: options.requestId, bitmap: result.bitmap, cols: result.cols, rows: result.rows }, [result.bitmap as unknown as Transferable]);
        } catch (cpuErr) {
          wlog('CPU fallback failed', String(cpuErr));
          throw cpuErr;
        }
      }
    } else if (msg.type === 'cleanup') {
      // Manual cleanup request from main thread
      wlog('Manual cleanup requested');
      cleanupWebGLResources();
      (self as unknown as Worker).postMessage({ type: 'cleanup-complete' });
    }
  } catch (err) {
    wlog('error', String(err));
    (self as unknown as Worker).postMessage({ type: 'error', error: String(err) });
  }
};


