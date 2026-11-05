// JSON as Python's json.dumps() writes it by default: ", " and ": " between
// items, every character outside ASCII as \uXXXX. Where the Python API joins
// pre-encoded JSON into a body (sync bootstrap), the same bytes come out here.
export function pythonJson(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') return asciiString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(pythonJson).join(', ')}]`;
  if (typeof value === 'object') {
    const fields = Object.entries(value as Record<string, unknown>).map(([key, item]) => `${asciiString(key)}: ${pythonJson(item)}`);
    return `{${fields.join(', ')}}`;
  }
  throw new TypeError(`Cannot encode ${typeof value}`);
}

function asciiString(value: string): string {
  // JSON.stringify escapes what JSON requires; Python also escapes everything past ASCII.
  return JSON.stringify(value).replace(/[\u0080-\uffff]/g, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);
}
