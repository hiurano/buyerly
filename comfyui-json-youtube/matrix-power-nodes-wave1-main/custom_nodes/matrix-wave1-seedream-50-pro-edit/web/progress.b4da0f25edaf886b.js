import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const NODE_TYPES = new Set("MATRIX_Wave1Seedream50ProEdit".split(",").filter(Boolean));
const STATE = Symbol.for("matrix.ui.progress");

function detail(event) {
  return event?.detail ?? event ?? {};
}

function nodeById(id) {
  return app.graph?.getNodeById?.(id) ??
    app.graph?._nodes?.find((node) => String(node.id) === String(id));
}

function install(node) {
  if (node[STATE]?.installed) return;
  node[STATE] = { installed: true, active: false, promptId: "", label: "" };
  const previous = node.onDrawForeground;
  node.onDrawForeground = function (ctx) {
    const result = previous?.apply(this, arguments);
    const state = this[STATE];
    if (!this.flags?.collapsed && state?.active) {
      ctx.save();
      ctx.font = "12px sans-serif";
      ctx.fillStyle = state.phase === "queued" ? "#f5c542" : "#7dfa8a";
      ctx.fillText(state.label, 10, this.size[1] - 8);
      ctx.restore();
    }
    return result;
  };
}

function clearNode(node) {
  const state = node?.[STATE];
  if (!state) return;
  state.active = false;
  node.setDirtyCanvas?.(true, false);
}

function clearEvent(event) {
  const data = detail(event);
  if (data.node_id ?? data.node) clearNode(nodeById(data.node_id ?? data.node));
  if (data.prompt_id) {
    for (const node of app.graph?._nodes ?? []) {
      if (node[STATE]?.promptId === data.prompt_id) clearNode(node);
    }
  }
}

api.addEventListener("matrix.progress", (event) => {
  const data = detail(event);
  if (!NODE_TYPES.has(data.node_type)) return;
  const node = nodeById(data.node_id);
  if (!node) return;
  install(node);
  Object.assign(node[STATE], {
    active: data.phase === "queued" || data.phase === "processing",
    promptId: data.prompt_id,
    phase: data.phase,
    label: data.label,
  });
  node.setDirtyCanvas?.(true, false);
});

for (const name of ["executed", "execution_error", "execution_interrupted", "execution_success"]) {
  api.addEventListener(name, clearEvent);
}

app.registerExtension({
  name: `matrix.ui.progress:${[...NODE_TYPES].sort().join("|")}`,
  nodeCreated(node) {
    if (NODE_TYPES.has(node.comfyClass || node.type)) install(node);
  },
  loadedGraphNode(node) {
    if (NODE_TYPES.has(node.comfyClass || node.type)) install(node);
  },
});
