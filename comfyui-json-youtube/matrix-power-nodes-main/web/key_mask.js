import { app } from "../../scripts/app.js";

const KEY_CONFIG = {"MATRIX_DatasetConfig":{"intentHeader":"X-Matrix-Credential-Intent-19c3b69ab6cb840d","intentValue":"matrix-compiled-19c3b69ab6cb840d","provider":"wavespeed","route":"/matrix/compiled/19c3b69ab6cb840d/wavespeed/key"}};
const EXTENSION_NAME = "matrix.compiled.19c3b69ab6cb840d.key-mask.v4";
const INSTALLED = Symbol.for("matrix.ui-key-mask:provider-key:v4");
const VIRTUAL_CONTROL = Symbol.for(
  "matrix.ui-key-mask:detached-provider-key:v1",
);
const states = new Map();
const COLOR_PRIMARY = "#00ff41";
const MINIMUM_KEY_NODE_WIDTH = 440;
const ROW_HEIGHT = 24;

function shared(config) {
  let state = states.get(config.route);
  if (!state) {
    state = {
      stored: false,
      tail: "",
      verified: false,
      busy: false,
      error: "",
      statusRequest: null,
    };
    states.set(config.route, state);
  }
  return state;
}

function intentHeaders(config, includeContentType = false) {
  const headers = { [config.intentHeader]: config.intentValue };
  if (includeContentType) headers["Content-Type"] = "application/json";
  return headers;
}

function applyStatus(state, data) {
  state.stored = data?.stored === true;
  state.tail = String(data?.tail ?? "").slice(-4);
  state.verified = data?.verified === true;
  state.error = "";
}

function dirty(node) {
  node?.setDirtyCanvas(true, false);
}

async function refresh(config, state, node) {
  state.statusRequest ??= fetch(config.route, {
    credentials: "same-origin",
    headers: intentHeaders(config),
  })
    .then(async (response) => {
      if (!response.ok) throw new Error();
      applyStatus(state, await response.json());
    })
    .catch(() => {
      state.error = "key status unavailable";
    });
  await state.statusRequest;
  dirty(node);
}

async function ingest(config, state, key, node) {
  state.busy = true;
  state.error = "";
  dirty(node);
  try {
    const response = await fetch(config.route, {
      method: "POST",
      credentials: "same-origin",
      headers: intentHeaders(config, true),
      body: JSON.stringify({ key }),
    });
    const data = await response.json();
    if (!response.ok || data?.ok !== true) {
      state.error = String(data?.error || "credential rejected").slice(0, 64);
    } else {
      applyStatus(state, data);
    }
  } catch {
    state.error = "key service unavailable";
  } finally {
    state.busy = false;
    dirty(node);
  }
}

function providerLabel(config) {
  return config.provider === "wavespeed" ? "WaveSpeed Key" : `${config.provider} Key`;
}

function statusLabel(config, state) {
  if (state.busy) return "checking key…";
  if (state.error) return state.error;
  if (!state.stored) return `enter ${providerLabel(config)}`;
  const mark = state.verified ? "✓ verified" : "? unverified";
  return `MATRIX-KEY ******** ${state.tail} ${mark}`;
}

function drawRoundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, width, height, radius);
  } else {
    ctx.rect(x, y, width, height);
  }
}

function fitText(ctx, value, maxWidth) {
  let text = String(value ?? "");
  if (typeof ctx.measureText !== "function") return text;
  if (ctx.measureText(text).width <= maxWidth) return text;
  while (
    text.length > 1 &&
    ctx.measureText(`${text}…`).width > maxWidth
  ) {
    text = text.slice(0, -1);
  }
  return `${text}…`;
}

function drawControl(ctx, node, width, y, height, config, state) {
  const rowHeight = height || globalThis.LiteGraph?.NODE_WIDGET_HEIGHT || 20;
  const left = 15;
  const right = width - 15;
  const top = y + 2;
  const pillHeight = Math.max(14, rowHeight - 4);
  const hasKey = state.stored;
  ctx.save();
  drawRoundRect(ctx, left, top, right - left, pillHeight, 8);
  ctx.fillStyle = "rgba(4, 10, 4, 0.98)";
  ctx.fill();
  ctx.strokeStyle = hasKey
    ? "rgba(0, 255, 65, 0.92)"
    : "rgba(0, 255, 65, 0.58)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.font = "bold 11px monospace";
  ctx.textBaseline = "middle";
  ctx.shadowColor = COLOR_PRIMARY;
  ctx.shadowBlur = hasKey ? 5 : 2;
  ctx.textAlign = "left";
  ctx.fillStyle = hasKey
    ? "rgba(220, 235, 220, 0.95)"
    : "rgba(190, 205, 190, 0.72)";
  ctx.fillText(providerLabel(config), left + 12, top + pillHeight / 2);
  ctx.textAlign = "right";
  ctx.fillStyle = state.error
    ? "#ff6b5a"
    : state.verified
      ? COLOR_PRIMARY
      : "rgba(0, 255, 65, 0.72)";
  ctx.fillText(
    fitText(ctx, statusLabel(config, state), Math.max(40, width - 150)),
    right - 12,
    top + pillHeight / 2,
  );
  ctx.restore();
}

function requestKey(config, state, node) {
  const key = String(
    globalThis.prompt?.(`Paste ${providerLabel(config)}`) ?? "",
  ).trim();
  if (key) void ingest(config, state, key, node);
}

function installVirtualControl(node, config, state) {
  if (node[VIRTUAL_CONTROL]) return;
  const socketRows = (node.inputs ?? []).filter((input) => !input?.widget).length;
  node.widgets_start_y = Math.max(
    Number(node.widgets_start_y) || 0,
    (socketRows + 2) * ROW_HEIGHT,
  );
  const control = {
    get y() {
      return (Number(node.widgets_start_y) || ROW_HEIGHT) - ROW_HEIGHT;
    },
    height: globalThis.LiteGraph?.NODE_WIDGET_HEIGHT || 20,
  };
  node[VIRTUAL_CONTROL] = control;

  const previousDrawForeground = node.onDrawForeground;
  node.onDrawForeground = function (ctx, ...rest) {
    const result = previousDrawForeground?.apply(this, [ctx, ...rest]);
    drawControl(
      ctx,
      this,
      this.size?.[0] ?? MINIMUM_KEY_NODE_WIDTH,
      control.y,
      control.height,
      config,
      state,
    );
    return result;
  };

  const previousMouseDown = node.onMouseDown;
  node.onMouseDown = function (event, position, ...rest) {
    const x = Number(position?.[0]);
    const y = Number(position?.[1]);
    const width = this.size?.[0] ?? MINIMUM_KEY_NODE_WIDTH;
    if (
      Number.isFinite(x) &&
      Number.isFinite(y) &&
      x >= 15 &&
      x <= width - 15 &&
      y >= control.y + 2 &&
      y <= control.y + control.height
    ) {
      requestKey(config, state, this);
      return true;
    }
    return previousMouseDown?.apply(this, [event, position, ...rest]);
  };
}

function install(node, config) {
  let widget = node.widgets?.find((candidate) => candidate.name === "api_key");
  const virtual = !widget;
  const state = shared(config);
  if (virtual) {
    installVirtualControl(node, config, state);
    if ((node.size?.[0] ?? 0) < MINIMUM_KEY_NODE_WIDTH) {
      node.setSize?.([
        MINIMUM_KEY_NODE_WIDTH,
        Math.max(
          node.size?.[1] ?? 0,
          node.computeSize?.()[1] ?? 120,
        ),
      ]);
    }
    void refresh(config, state, node);
    return;
  }
  if (!widget || widget[INSTALLED]) return;
  const replacedMatrixMask = Object.getOwnPropertySymbols(widget).some(
    (symbol) => String(symbol).includes(":api-key"),
  );
  const socketRows = (node.inputs ?? []).filter((input) => !input?.widget).length;
  if (socketRows > 0) {
    // LiteGraph otherwise places the first widget on the same row as the final
    // real input socket. Keep the credential control visible below all sockets.
    node.widgets_start_y = Math.max(
      Number(node.widgets_start_y) || 0,
      (socketRows + 1) * ROW_HEIGHT,
    );
  }
  if ((node.size?.[0] ?? 0) < MINIMUM_KEY_NODE_WIDTH) {
    node.setSize?.([
      MINIMUM_KEY_NODE_WIDTH,
      node.size?.[1] ?? node.computeSize?.()[1] ?? 120,
    ]);
  }
  widget[INSTALLED] = true;
  widget.value = "";
  widget.serializeValue = () => undefined;

  widget.draw = function (ctx, nodeRef, width, y, height) {
    drawControl(ctx, nodeRef, width, y, height, config, state);
  };

  if (!virtual) {
    const previousCallback = replacedMatrixMask ? null : widget.callback;
    widget.callback = function (value, ...rest) {
      const key = String(value ?? "").trim();
      this.value = "";
      const result = previousCallback?.apply(this, ["", ...rest]);
      this.value = "";
      if (key) void ingest(config, state, key, node);
      return result;
    };
  }

  void refresh(config, state, node);
}

app.registerExtension({
  name: EXTENSION_NAME,
  nodeCreated(node) {
    const config = KEY_CONFIG[node.comfyClass || node.type];
    if (config) install(node, config);
  },
});
