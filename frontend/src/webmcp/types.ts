/**
 * The part of WebMCP (https://github.com/webmachinelearning/webmcp) Buyerly
 * uses: the page registers tools and the browser's AI agent calls them. Chrome
 * exposes it as `document.modelContext` behind a flag or an origin trial;
 * Chrome 149 had it on `navigator` instead. No other browser has it, so every
 * entry point is optional.
 */

/** The JSON Schema subset the tools publish and `readToolInput` enforces. */
export type JsonSchema =
  | {
      type: 'object';
      properties: Record<string, JsonSchema>;
      required?: string[];
      additionalProperties?: false;
      description?: string;
    }
  | {
      type: 'array';
      items: JsonSchema;
      minItems?: number;
      maxItems?: number;
      description?: string;
    }
  | {
      type: 'string';
      enum?: string[];
      minLength?: number;
      maxLength?: number;
      default?: string;
      description?: string;
    }
  | {
      type: 'number' | 'integer';
      enum?: number[];
      minimum?: number;
      maximum?: number;
      default?: number;
      description?: string;
    };

export interface ToolAnnotations {
  /** The tool changes nothing. */
  readOnlyHint?: boolean;
  /** The tool changes something the person cares about. */
  consequentialHint?: boolean;
  /** The output carries text Buyerly did not write, such as names from Meta. */
  untrustedContentHint?: boolean;
}

export interface ToolExecuteOptions {
  /** Aborted when the agent withdraws the call. */
  signal?: AbortSignal;
}

export interface WebMcpTool {
  name: string;
  title: string;
  description: string;
  inputSchema: JsonSchema;
  annotations: ToolAnnotations;
  /**
   * Chrome serialises whatever this returns to JSON for the agent, but drops
   * the message of anything thrown, so failures are returned, not thrown.
   */
  execute: (input: unknown, options?: ToolExecuteOptions) => Promise<unknown>;
}

export interface ModelContext {
  /** Rejects on a duplicate name, and with AbortError once `signal` aborts. */
  registerTool(tool: WebMcpTool, options?: { signal?: AbortSignal }): Promise<void> | void;
  /** Chrome 149 only: removed from the spec in favour of the abort signal. */
  unregisterTool?(name: string): void;
}

declare global {
  interface Document {
    readonly modelContext?: ModelContext;
  }
  interface Navigator {
    readonly modelContext?: ModelContext;
  }
  interface ImportMetaEnv {
    readonly VITE_WEBMCP?: string;
  }
  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}
