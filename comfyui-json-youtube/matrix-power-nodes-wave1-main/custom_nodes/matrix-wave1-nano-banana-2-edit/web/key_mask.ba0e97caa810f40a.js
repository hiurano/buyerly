import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const KEY_CONFIG = {"MATRIX_Wave1NanoBanana2Edit":{"intentHeader":"X-Matrix-Credential-Intent-V2","intentValue":"matrix-credentials-v2","provider":"wavespeed","route":"/matrix/credentials/v2/wavespeed/key"}};
const EXTENSION_NAME = "matrix.compiled.7eb2822d02c20f26.key-mask.v5";
const INSTALLED = Symbol.for("matrix.ui-key-mask:provider-key:v5");
const VIRTUAL_CONTROL = Symbol.for(
  "matrix.ui-key-mask:detached-provider-key:v1",
);
const COLLAPSE_GUARD = Symbol.for(
  "matrix.ui-key-mask:credential-dialog-collapse:v1",
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
      ingestMode: "none",
      statusRequest: null,
      closeDialog: null,
      dialogNode: null,
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

function safeMessage(data, fallback) {
  const message = data?.error;
  return typeof message === "string" && message ? message : fallback;
}

function applyStatus(state, data) {
  state.stored = data?.stored === true;
  state.tail = String(data?.tail ?? "").slice(-4);
  state.verified = data?.verified === true;
  state.ingestMode = data?.ingest_mode === "remote_pairing"
    ? "remote_pairing"
    : data?.ingest_mode === "loopback"
      ? "loopback"
      : "none";
  state.error = "";
}

function dirty(node) {
  node?.setDirtyCanvas(true, false);
}

function isCollapsed(node) {
  return Boolean(node?.flags?.collapsed);
}

async function refresh(config, state, node) {
  if (!state.statusRequest) {
    let succeeded = false;
    const request = fetch(api.apiURL(config.route), {
      credentials: "same-origin",
      headers: intentHeaders(config),
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          state.error = safeMessage(data, "key status unavailable");
          return;
        }
        applyStatus(state, data);
        succeeded = true;
      })
      .catch(() => {
        state.error = "key status unavailable";
      })
      .finally(() => {
        if (!succeeded && state.statusRequest === request) {
          state.statusRequest = null;
        }
      });
    state.statusRequest = request;
  }
  await state.statusRequest;
  dirty(node);
}

async function ingest(config, state, key, pairingToken, node) {
  state.busy = true;
  state.error = "";
  dirty(node);
  try {
    const response = await fetch(api.apiURL(config.route), {
      method: "POST",
      credentials: "same-origin",
      headers: {
        ...intentHeaders(config, true),
        ...(pairingToken ? { "X-Matrix-Credential-Pairing": pairingToken } : {}),
      },
      body: JSON.stringify({ key }),
    });
    const data = await response.json();
    if (!response.ok || data?.ok !== true) {
      state.error = safeMessage(data, "credential rejected");
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
  if (!state.stored) return "No API Key";
  const mark = state.verified ? "✓ verified" : "? unverified";
  return `API Key saved · ${mark}`;
}

function showInputError(config, state, node) {
  state.error = "secure key input unavailable";
  dirty(node);
  try {
    app.extensionManager?.dialog?.showErrorDialog?.(
      `Could not open the secure ${providerLabel(config)} input.`,
      { title: providerLabel(config) },
    );
  } catch {
    // The canvas error remains visible even when ComfyUI's dialog service fails.
  }
}

function closeKeyDialog(state, node) {
  if (state.dialogNode === node) state.closeDialog?.();
}

function installCollapseGuard(node, state) {
  if (node[COLLAPSE_GUARD] || typeof node.collapse !== "function") return;
  const previousCollapse = node.collapse;
  node.collapse = function (...args) {
    const result = previousCollapse.apply(this, args);
    if (isCollapsed(this)) closeKeyDialog(state, this);
    return result;
  };
  node[COLLAPSE_GUARD] = true;
}

function openKeyDialog(config, state, node) {
  try {
    if (!globalThis.document?.body?.appendChild) {
      showInputError(config, state, node);
      return false;
    }
    state.closeDialog?.();

    const overlay = document.createElement("div");
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", `Enter ${providerLabel(config)}`);
    overlay.dataset.matrixCredentialDialog = "true";
    Object.assign(overlay.style, {
      position: "fixed",
      inset: "0",
      zIndex: "100000",
      display: "grid",
      placeItems: "center",
      background: "rgba(0, 0, 0, 0.66)",
    });

    const form = document.createElement("form");
    Object.assign(form.style, {
      width: "min(440px, calc(100vw - 32px))",
      padding: "20px",
      border: "1px solid rgba(0, 255, 65, 0.72)",
      borderRadius: "12px",
      background: "#101510",
      color: "#e7f4e7",
      boxShadow: "0 18px 60px rgba(0, 0, 0, 0.55)",
      fontFamily: "Inter, system-ui, sans-serif",
    });

    const title = document.createElement("div");
    title.textContent = `Enter ${providerLabel(config)}`;
    Object.assign(title.style, {
      marginBottom: "12px",
      fontSize: "16px",
      fontWeight: "700",
    });

    const keyInput = document.createElement("input");
    keyInput.type = "password";
    keyInput.autocomplete = "new-password";
    keyInput.spellcheck = false;
    keyInput.placeholder = "Paste key";
    keyInput.setAttribute("aria-label", providerLabel(config));
    keyInput.dataset.matrixCredentialSecret = "true";
    Object.assign(keyInput.style, {
      boxSizing: "border-box",
      width: "100%",
      padding: "10px 12px",
      border: "1px solid rgba(0, 255, 65, 0.5)",
      borderRadius: "8px",
      outline: "none",
      background: "#070b07",
      color: "#ffffff",
    });

    let pairingInput = null;
    if (state.ingestMode === "remote_pairing") {
      pairingInput = document.createElement("input");
      pairingInput.type = "password";
      pairingInput.autocomplete = "new-password";
      pairingInput.spellcheck = false;
      pairingInput.placeholder = "One-time pairing token";
      pairingInput.setAttribute("aria-label", "One-time pairing token");
      pairingInput.dataset.matrixCredentialPairing = "true";
      Object.assign(pairingInput.style, {
        boxSizing: "border-box",
        width: "100%",
        marginTop: "10px",
        padding: "10px 12px",
        border: "1px solid rgba(0, 255, 65, 0.5)",
        borderRadius: "8px",
        outline: "none",
        background: "#070b07",
        color: "#ffffff",
      });
    }

    const actions = document.createElement("div");
    Object.assign(actions.style, {
      display: "flex",
      justifyContent: "flex-end",
      gap: "8px",
      marginTop: "16px",
    });
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Cancel";
    const submit = document.createElement("button");
    submit.type = "submit";
    submit.textContent = "Save key";
    for (const button of [cancel, submit]) {
      Object.assign(button.style, {
        padding: "8px 12px",
        border: "1px solid rgba(0, 255, 65, 0.5)",
        borderRadius: "8px",
        background: button === submit ? "#00a82d" : "#182018",
        color: "#ffffff",
        cursor: "pointer",
      });
    }

    let closed = false;
    const cleanup = () => {
      if (closed) return;
      closed = true;
      keyInput.blur?.();
      pairingInput?.blur?.();
      keyInput.value = "";
      if (pairingInput) pairingInput.value = "";
      overlay.remove();
      if (state.closeDialog === cleanup) state.closeDialog = null;
      if (state.dialogNode === node) state.dialogNode = null;
      dirty(node);
    };
    state.closeDialog = cleanup;
    state.dialogNode = node;
    cancel.addEventListener("click", cleanup);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) cleanup();
    });
    overlay.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        cleanup();
      }
    });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const key = String(keyInput.value ?? "").trim();
      const pairingToken = String(pairingInput?.value ?? "").trim();
      cleanup();
      if (!key) {
        state.error = "No API Key entered";
        dirty(node);
        return;
      }
      if (state.ingestMode === "remote_pairing" && !pairingToken) {
        state.error = "No pairing token entered";
        dirty(node);
        return;
      }
      void ingest(config, state, key, pairingToken, node);
    });

    actions.append(cancel, submit);
    form.append(title, keyInput);
    if (pairingInput) form.append(pairingInput);
    form.append(actions);
    overlay.append(form);
    document.body.appendChild(overlay);
    keyInput.focus();
    return true;
  } catch {
    state.closeDialog?.();
    showInputError(config, state, node);
    return false;
  }
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
  return openKeyDialog(config, state, node);
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
    if (isCollapsed(this)) {
      closeKeyDialog(state, this);
      return result;
    }
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
      !isCollapsed(this) &&
      Number.isFinite(x) &&
      Number.isFinite(y) &&
      x >= 15 &&
      x <= width - 15 &&
      y >= control.y + 2 &&
      y <= control.y + control.height
    ) {
      return requestKey(config, state, this);
    }
    return previousMouseDown?.apply(this, [event, position, ...rest]);
  };
}

function install(node, config) {
  let widget = node.widgets?.find((candidate) => candidate.name === "api_key");
  const virtual = !widget;
  const state = shared(config);
  installCollapseGuard(node, state);
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
    if (isCollapsed(nodeRef)) {
      closeKeyDialog(state, nodeRef);
      return;
    }
    drawControl(ctx, nodeRef, width, y, height, config, state);
  };

  if (!virtual) {
    const previousCallback = replacedMatrixMask ? null : widget.callback;
    widget.callback = function (value, ...rest) {
      const key = String(value ?? "").trim();
      this.value = "";
      if (isCollapsed(node)) return undefined;
      const result = previousCallback?.apply(this, ["", ...rest]);
      this.value = "";
      if (key && state.ingestMode !== "remote_pairing") {
        void ingest(config, state, key, "", node);
      } else {
        openKeyDialog(config, state, node);
      }
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
