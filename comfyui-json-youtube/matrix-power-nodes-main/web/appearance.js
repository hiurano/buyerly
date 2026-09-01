import { app } from "../../scripts/app.js";

const NODE_TYPES = new Set("MATRIX_DatasetConfig,MATRIX_DatasetImage".split(",").filter(Boolean));
const ANIMATED_NODE_TYPES = new Set(
  "MATRIX_DatasetConfig".split(",").filter(Boolean),
);
const COLORS = {
  color: "#0a150a",
  bgcolor: "#050a05",
  boxcolor: "#00ff41",
  title_color: "#39ff7a",
};
const GLYPHS =
  "アカサタナハマヤラワイキシチニヒミリヰウクスツヌフムユルエケセテネヘメレヱオコソトノホモヨロヲ0123456789";
const ANIMATION_INSTALLED = Symbol("matrixAnimationInstalled");

let glyphCache = null;
function getGlyphCache() {
  if (glyphCache) return glyphCache;
  const size = 16;
  const canvas =
    typeof OffscreenCanvas !== "undefined"
      ? new OffscreenCanvas(GLYPHS.length * size, size)
      : document.createElement("canvas");
  canvas.width = GLYPHS.length * size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.font = "bold 14px monospace";
  ctx.textBaseline = "top";
  for (let i = 0; i < GLYPHS.length; i++) {
    ctx.fillStyle = COLORS.boxcolor;
    ctx.fillText(GLYPHS[i], i * size + 2, 1);
  }
  return (glyphCache = { canvas, size });
}

function drawRain(ctx, node) {
  const colW = 14;
  const cols = Math.max(3, Math.floor(node.size[0] / colW));
  if (!node._matrixRain || node._matrixRain.length !== cols) {
    node._matrixRain = Array.from({ length: cols }, (_, column) => ({
      x: column * colW + 4,
      y: -Math.random() * node.size[1],
      speed: 0.6 + Math.random() * 1.8,
      glyph: Math.floor(Math.random() * GLYPHS.length),
    }));
  }
  const cache = getGlyphCache();
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, node.size[0], node.size[1]);
  ctx.clip();
  for (const drop of node._matrixRain) {
    drop.y += drop.speed;
    if (drop.y > node.size[1] + 20) drop.y = -Math.random() * 40;
    for (let trail = 0; trail < 8; trail++) {
      const y = drop.y - trail * 14;
      if (y < -14 || y > node.size[1]) continue;
      ctx.globalAlpha = Math.max(0, 0.65 - trail * 0.08);
      ctx.drawImage(
        cache.canvas,
        ((drop.glyph + trail) % GLYPHS.length) * cache.size,
        0,
        cache.size,
        cache.size,
        drop.x,
        y,
        cache.size,
        cache.size,
      );
    }
  }
  ctx.restore();
}

function drawChasingBorder(ctx, node, time) {
  ctx.save();
  ctx.strokeStyle = COLORS.boxcolor;
  ctx.shadowColor = COLORS.boxcolor;
  ctx.shadowBlur = 10;
  ctx.lineWidth = 1.8;
  ctx.setLineDash([24, 60]);
  ctx.lineDashOffset = -(time * 90) % 84;
  ctx.strokeRect(0, 0, node.size[0], node.size[1]);
  ctx.restore();
}

function installAnimation(node) {
  if (node[ANIMATION_INSTALLED]) return;
  node[ANIMATION_INSTALLED] = true;
  const priorDrawForeground = node.onDrawForeground;
  node.onDrawForeground = function (ctx) {
    priorDrawForeground?.call(this, ctx);
    if (this.flags?.collapsed) return;
    const scale = app.canvas?.ds?.scale || 1;
    const time = performance.now() / 1000;
    if (scale > 0.45) drawRain(ctx, this);
    drawChasingBorder(ctx, this, time);
    app.canvas?.setDirty?.(true, false);
  };
}

function apply(node) {
  const nodeType = node.comfyClass || node.type;
  Object.assign(node, COLORS);
  if (ANIMATED_NODE_TYPES.has(nodeType)) installAnimation(node);
  node.setDirtyCanvas?.(true, false);
}

app.registerExtension({
  name: `matrix.ui.appearance:${[...NODE_TYPES].sort().join("|")}`,
  nodeCreated(node) {
    if (NODE_TYPES.has(node.comfyClass || node.type)) apply(node);
  },
  loadedGraphNode(node) {
    if (NODE_TYPES.has(node.comfyClass || node.type)) apply(node);
  },
});
