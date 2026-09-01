import { app } from "../../scripts/app.js";

const NODE_IDS = new Set("MATRIX_Wave1Seedream45Edit".split(",").filter(Boolean));
const EXTENSION_NAME = "matrix.compiled.size-composer:MATRIX_Wave1Seedream45Edit";
const INSTALLED = Symbol.for(`${EXTENSION_NAME}:installed`);
const PRESET_PIXELS = {"1:1":[2048,2048],"16:9":[2752,1536],"9:16":[1536,2752],"4:3":[2368,1792],"3:4":[1792,2368],"3:2":[2496,1664],"2:3":[1664,2496]};

function fill(node, selected) {
  const width = node.widgets?.find((widget) => widget.name === "width");
  const height = node.widgets?.find((widget) => widget.name === "height");
  if (!width || !height) return;
  const pixels = selected === "auto" ? [0, 0] : PRESET_PIXELS[selected];
  if (!pixels) return;
  [width.value, height.value] = pixels;
  node.setDirtyCanvas?.(true, true);
}

function install(node) {
  if (node[INSTALLED]) return;
  const size = node.widgets?.find((widget) => widget.name === "size");
  const width = node.widgets?.find((widget) => widget.name === "width");
  const height = node.widgets?.find((widget) => widget.name === "height");
  if (!size || !width || !height) return;
  node[INSTALLED] = true;

  const previousCallback = size.callback;
  size.callback = function (selected) {
    const result = previousCallback?.apply(this, arguments);
    fill(node, selected ?? size.value);
    return result;
  };
}

app.registerExtension({
  name: EXTENSION_NAME,
  nodeCreated(node) {
    if (NODE_IDS.has(node.comfyClass || node.type)) install(node);
  },
  loadedGraphNode(node) {
    if (NODE_IDS.has(node.comfyClass || node.type)) install(node);
  },
});
