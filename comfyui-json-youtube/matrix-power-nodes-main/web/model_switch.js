import { app } from "../../scripts/app.js";

const NODE_IDS = new Set("MATRIX_DatasetConfig,MATRIX_DatasetImage".split(",").filter(Boolean));
const EXTENSION_NAME = "matrix.compiled.19c3b69ab6cb840d.model-switch";
const DATA = {"routes":{"google/nano-banana-2/edit":{"active":["aspect_ratio","enable_image_search","enable_web_search","images","output_format","prompt","resolution"],"fields":{"aspect_ratio":{"description":"The aspect ratio of the generated media.","enum":["1:1","3:2","2:3","3:4","4:3","4:5","5:4","9:16","16:9","21:9","1:4","4:1","1:8","8:1"],"required":false,"type":"string"},"enable_image_search":{"default":false,"description":"If enabled, the model will use image search to enhance the generation with real-time information.","required":false,"type":"boolean"},"enable_web_search":{"default":false,"description":"If enabled, the model will use web search to enhance the generation with real-time information.","required":false,"type":"boolean"},"images":{"description":"List of URLs of input images for editing. The maximum number of images is 14.","required":true,"type":"array"},"output_format":{"default":"png","description":"The format of the output image.","enum":["png","jpeg"],"required":false,"type":"string"},"prompt":{"description":"The positive prompt for the generation.","required":true,"type":"string"},"resolution":{"default":"1k","description":"The resolution of the output image.","enum":["0.5k","1k","2k","4k"],"required":false,"type":"string"}},"price":0.07},"google/nano-banana-pro/edit":{"active":["aspect_ratio","images","output_format","prompt","resolution"],"fields":{"aspect_ratio":{"description":"The aspect ratio of the generated media.","enum":["1:1","3:2","2:3","3:4","4:3","4:5","5:4","9:16","16:9","21:9"],"required":false,"type":"string"},"images":{"description":"List of URLs of input images for editing. The maximum number of images is 14.","required":true,"type":"array"},"output_format":{"default":"png","description":"The format of the output image.","enum":["png","jpeg"],"required":false,"type":"string"},"prompt":{"description":"The positive prompt for the generation.","required":true,"type":"string"},"resolution":{"default":"1k","description":"The resolution of the output image.","enum":["1k","2k","4k"],"required":false,"type":"string"}},"price":0.14},"openai/gpt-image-2/edit":{"active":["aspect_ratio","images","output_format","prompt","quality","resolution"],"fields":{"aspect_ratio":{"description":"The aspect ratio of the generated image. Auto-detected from input image if not specified.","enum":["1:1","1:2","2:1","1:3","3:1","2:3","3:2","3:4","4:3","4:5","5:4","9:16","16:9","9:21","21:9"],"required":false,"type":"string"},"images":{"description":"List of URLs of input images for editing.","required":true,"type":"array"},"output_format":{"default":"png","description":"The format of the output image.","enum":["png","jpeg","webp"],"required":false,"type":"string"},"prompt":{"description":"The positive prompt for the generation.","required":true,"type":"string"},"quality":{"default":"medium","description":"The quality of the generated image. Higher quality costs more.","enum":["low","medium","high"],"required":false,"type":"string"},"resolution":{"default":"1k","description":"The resolution of the output image.","enum":["1k","2k","4k"],"required":false,"type":"string"}},"price":0.07}},"union":["aspect_ratio","enable_image_search","enable_web_search","images","output_format","prompt","quality","resolution"]};
const INSTALLED = Symbol.for(`${EXTENSION_NAME}:installed`);

function valid(field, value) {
  return value !== undefined && value !== null &&
    (!field.enum || field.enum.includes(value));
}

function install(node) {
  if (node[INSTALLED]) return;
  const model = node.widgets?.find((widget) => widget.name === "model");
  if (!model) return;
  node[INSTALLED] = true;

  const memory = new Map();
  let current = model.value;

  for (const widget of node.widgets) {
    if (!DATA.union.includes(widget.name)) continue;
    widget.__modelSwitchType = widget.type;
    widget.__modelSwitchComputeSize = widget.computeSize;
    widget.__modelSwitchSerialize = widget.serializeValue;
    widget.serializeValue = function () {
      if (this.hidden) return undefined;
      return this.__modelSwitchSerialize?.apply(this, arguments) ?? this.value;
    };
  }

  function stash(routeId) {
    const route = DATA.routes[routeId];
    if (!route) return;
    const values = memory.get(routeId) || new Map();
    for (const name of route.active) {
      const widget = node.widgets.find((candidate) => candidate.name === name);
      if (widget && valid(route.fields[name], widget.value)) values.set(name, widget.value);
    }
    memory.set(routeId, values);
  }

  function apply(routeId) {
    const route = DATA.routes[routeId];
    if (!route) return;
    const saved = memory.get(routeId);
    for (const widget of node.widgets) {
      if (!DATA.union.includes(widget.name)) continue;
      const field = route.fields[widget.name];
      if (!field) {
        widget.hidden = true;
        widget.type = "matrix-hidden";
        widget.computeSize = () => [0, -4];
        widget.value = null;
        continue;
      }
      widget.hidden = false;
      widget.type = widget.__modelSwitchType;
      widget.computeSize = widget.__modelSwitchComputeSize;
      if (field.enum) {
        widget.options ??= {};
        widget.options.values = [...field.enum];
      }
      const remembered = saved?.get(widget.name);
      if (valid(field, remembered)) widget.value = remembered;
      else if (widget.value === null && "default" in field) widget.value = field.default;
    }
    const width = node.size?.[0] ?? node.computeSize()[0];
    node.setSize?.([width, Math.max(node.computeSize()[1], 120)]);
    node.setDirtyCanvas?.(true, true);
  }

  const previousCallback = model.callback;
  model.callback = function () {
    stash(current);
    const result = previousCallback?.apply(this, arguments);
    current = this.value;
    apply(current);
    return result;
  };

  const previousConfigure = node.onConfigure;
  node.onConfigure = function () {
    const result = previousConfigure?.apply(this, arguments);
    current = model.value;
    stash(current);
    apply(current);
    return result;
  };

  stash(current);
  apply(current);
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
