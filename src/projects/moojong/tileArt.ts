import * as THREE from 'three';
import type { PastureKit } from '../../lib/pastureKit';
import { SUIT_STYLES, TILE_DESIGNS, type TileDesign } from './deck';
import { buildMiniature, createStudioBuilder, createStudioStage, frameModel } from '../../lib/miniatures';

export interface TileArtAtlas {
  materials: Map<string, THREE.MeshStandardMaterial>;
  previews: Record<string, string>;
  dispose(): void;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Renders all 42 Pasture Patrol low-poly 3D miniatures onto high-DPI ceramic
 * Mahjong tile faces once at startup, normalizing every asset by its actual
 * rendered 2D pixel silhouette and optical density so all 42 icons share a
 * consistent visual size across the board.
 */
export function buildTileArtAtlas(renderer: THREE.WebGLRenderer, kit: PastureKit): TileArtAtlas {
  const studioSize = 256;
  const tileW = 256;
  const tileH = 320;

  const prevSize = new THREE.Vector2();
  renderer.getSize(prevSize);
  const prevPixelRatio = renderer.getPixelRatio();
  const prevClearColor = new THREE.Color();
  renderer.getClearColor(prevClearColor);
  const prevClearAlpha = renderer.getClearAlpha();

  const studio = createStudioBuilder(kit);
  const stage = createStudioStage();

  renderer.setPixelRatio(1);
  renderer.setSize(studioSize, studioSize, false);
  renderer.setClearColor(0x000000, 0);

  // Reusable 2D scratch canvas for pixel-accurate bounding-box & optical-density normalization
  const scratchCanvas = document.createElement('canvas');
  scratchCanvas.width = studioSize;
  scratchCanvas.height = studioSize;
  const scratchCtx = scratchCanvas.getContext('2d', { willReadFrequently: true })!;

  const normalizedSpriteCanvas = document.createElement('canvas');
  normalizedSpriteCanvas.width = studioSize;
  normalizedSpriteCanvas.height = studioSize;
  const normalizedSpriteCtx = normalizedSpriteCanvas.getContext('2d')!;

  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const previews: Record<string, string> = {};
  const textures: THREE.CanvasTexture[] = [];
  const maxAniso = Math.min(4, renderer.capabilities.getMaxAnisotropy());

  for (const design of TILE_DESIGNS) {
    const holder = frameModel(buildMiniature(studio, design.id));
    stage.scene.add(holder);
    renderer.clear();
    renderer.render(stage.scene, stage.camera);
    stage.scene.remove(holder);

    // Measure exact rendered 2D pixel silhouette bounds & fill density
    scratchCtx.clearRect(0, 0, studioSize, studioSize);
    scratchCtx.drawImage(renderer.domElement, 0, 0);
    const bounds = measureSpritePixels(scratchCtx, studioSize, studioSize);

    // Build an optically normalized studio sprite for the tile face
    normalizedSpriteCtx.clearRect(0, 0, studioSize, studioSize);
    const normBox = 204;
    const fit = Math.min(normBox / bounds.w, normBox / bounds.h);
    // Dense solid cubes (Crate, Barn, Rock) scale down slightly vs open silhouettes (Cow, Daisy, Cat)
    const opticalFactor = THREE.MathUtils.clamp(
      Math.sqrt(0.48 / Math.max(0.28, bounds.fillDensity)),
      0.78,
      1.0,
    );
    const drawW = bounds.w * fit * opticalFactor;
    const drawH = bounds.h * fit * opticalFactor;
    normalizedSpriteCtx.drawImage(
      scratchCanvas,
      bounds.minX,
      bounds.minY,
      bounds.w,
      bounds.h,
      (studioSize - drawW) / 2,
      (studioSize - drawH) / 2,
      drawW,
      drawH,
    );

    const canvas = document.createElement('canvas');
    canvas.width = tileW;
    canvas.height = tileH;
    const ctx = canvas.getContext('2d')!;

    paintTileFace(ctx, tileW, tileH, design, normalizedSpriteCanvas);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = maxAniso;
    texture.needsUpdate = true;
    textures.push(texture);

    const faceMaterial = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.42,
      metalness: 0.02,
    });
    materials.set(design.id, faceMaterial);

    previews[design.id] = canvas.toDataURL('image/png');
  }

  // Dispose temporary studio-only geometries & materials now that all 42 faces are baked
  studio.dispose();

  // Restore renderer state cleanly
  renderer.setPixelRatio(prevPixelRatio);
  renderer.setSize(prevSize.x, prevSize.y, false);
  renderer.setClearColor(prevClearColor, prevClearAlpha);

  return {
    materials,
    previews,
    dispose() {
      for (const tex of textures) tex.dispose();
      for (const mat of materials.values()) mat.dispose();
      textures.length = 0;
      materials.clear();
    },
  };
}

function measureSpritePixels(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const { data } = ctx.getImageData(0, 0, width, height);
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  let opaqueCount = 0;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * width * 4;
    for (let x = 0; x < width; x++) {
      if (data[rowOffset + x * 4 + 3] > 16) {
        opaqueCount++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (opaqueCount === 0 || maxX < minX || maxY < minY) {
    return { minX: 0, minY: 0, w: width, h: height, fillDensity: 0.5 };
  }

  // Add a 2px margin so anti-aliased edge pixels stay crisp
  minX = Math.max(0, minX - 2);
  minY = Math.max(0, minY - 2);
  maxX = Math.min(width - 1, maxX + 2);
  maxY = Math.min(height - 1, maxY + 2);
  const w = Math.max(1, maxX - minX + 1);
  const h = Math.max(1, maxY - minY + 1);
  const fillDensity = opaqueCount / (w * h);

  return { minX, minY, w, h, fillDensity };
}

function paintTileFace(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  design: TileDesign,
  renderedSprite: HTMLCanvasElement,
) {
  const suit = SUIT_STYLES[design.suit];

  // Warm ceramic ivory base
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#fbf6ea');
  grad.addColorStop(1, '#f0e7d4');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Subtle recessed inner tile frame tinted by suit
  const pad = 14;
  drawRoundedRect(ctx, pad, pad, w - pad * 2, h - pad * 2, 16);
  ctx.fillStyle = suit.softBg;
  ctx.fill();
  ctx.lineWidth = design.isBonus ? 4.5 : 3;
  ctx.strokeStyle = suit.border;
  ctx.stroke();

  // Bonus tiles get a distinctive dashed inner medallion frame
  if (design.isBonus) {
    ctx.save();
    drawRoundedRect(ctx, pad + 6, pad + 6, w - (pad + 6) * 2, h - (pad + 6) * 2, 11);
    ctx.setLineDash([7, 5]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = suit.accent;
    ctx.globalAlpha = 0.5;
    ctx.stroke();
    ctx.restore();
  }

  // Subtle soft radial shade behind the icon center + silhouette-hugging blurred drop shade
  // so both light and dark miniatures stay crisp and legible against every suit color.
  const spriteSize = 212;
  const spriteX = (w - spriteSize) / 2;
  const spriteY = 58;

  ctx.save();
  const backdrop = ctx.createRadialGradient(w / 2, spriteY + spriteSize * 0.5, 16, w / 2, spriteY + spriteSize * 0.5, 96);
  backdrop.addColorStop(0, 'rgba(20, 26, 22, 0.2)');
  backdrop.addColorStop(0.65, 'rgba(20, 26, 22, 0.08)');
  backdrop.addColorStop(1, 'rgba(20, 26, 22, 0)');
  ctx.fillStyle = backdrop;
  ctx.beginPath();
  ctx.arc(w / 2, spriteY + spriteSize * 0.5, 96, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Soft wide silhouette shadow behind the miniature
  ctx.save();
  ctx.shadowColor = 'rgba(18, 24, 20, 0.46)';
  ctx.shadowBlur = 16;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 4;
  ctx.drawImage(renderedSprite, spriteX, spriteY, spriteSize, spriteSize);
  ctx.restore();

  // Tight subtle edge-separation shadow pass for crisp bright silhouettes (Cow, Sheep, Daisy, Moon)
  ctx.save();
  ctx.shadowColor = 'rgba(18, 24, 20, 0.28)';
  ctx.shadowBlur = 5;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 1;
  ctx.drawImage(renderedSprite, spriteX, spriteY, spriteSize, spriteSize);
  ctx.restore();

  // Top-left crisp suit badge pill
  ctx.save();
  const badgeText = design.badge;
  ctx.font = '700 28px "Paper Mono", ui-monospace, monospace';
  const badgeW = Math.max(42, ctx.measureText(badgeText).width + 18);
  drawRoundedRect(ctx, 22, 22, badgeW, 38, 9);
  ctx.fillStyle = suit.accent;
  ctx.fill();

  ctx.fillStyle = '#fbf7ee';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(badgeText, 22 + badgeW / 2, 42);
  ctx.restore();

  // Top-right suit marker, scaled from its measured glyph bounds into a fixed box: the symbol
  // glyphs (●, ■, ✦, ☀…) render at very different sizes within the same font size.
  ctx.save();
  ctx.fillStyle = suit.accent;
  ctx.font = '700 100px system-ui, sans-serif';
  const glyph = ctx.measureText(suit.symbol);
  const glyphW = glyph.actualBoundingBoxLeft + glyph.actualBoundingBoxRight;
  const glyphH = glyph.actualBoundingBoxAscent + glyph.actualBoundingBoxDescent;
  const scale = 34 / Math.max(glyphW, glyphH);
  ctx.translate(w - 22 - 17, 41);
  ctx.scale(scale, scale);
  ctx.fillText(
    suit.symbol,
    glyph.actualBoundingBoxLeft - glyphW / 2,
    glyph.actualBoundingBoxAscent - glyphH / 2,
  );
  ctx.restore();

  // Bottom caption, as large as fits inside the frame for scannability on small mobile screens
  ctx.save();
  ctx.fillStyle = suit.accent;
  const footerLabel = design.name.toUpperCase();
  ctx.font = '700 100px "Paper Mono", ui-monospace, monospace';
  const fontSize = Math.min(30, Math.floor((100 * (w - pad * 2 - 16)) / ctx.measureText(footerLabel).width));
  ctx.font = `700 ${fontSize}px "Paper Mono", ui-monospace, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(footerLabel, w / 2, h - 24);
  ctx.restore();
}
