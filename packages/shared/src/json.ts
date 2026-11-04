// JSON as PostgreSQL's JSONB stores it: what a column holds when nothing
// narrower is known about its shape.
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonArray = JsonValue[];
export interface JsonObject {
  [key: string]: JsonValue;
}
