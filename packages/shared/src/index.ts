// Types shared by the browser (frontend/) and the server (server/), #611.
// Plain types only: no decorators, no runtime dependencies, nothing that
// belongs to one side. The server's TypeORM entities and TypeGraphQL types
// implement these, and the client imports them directly, so the compiler
// catches a field that one side renamed and the other did not.

export * from './health.ts';
