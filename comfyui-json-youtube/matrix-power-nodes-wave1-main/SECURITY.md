# Security policy

Do not open a public issue containing an API key, credential file, request body, private image,
provider task identifier, or local user path. Revoke an exposed key at WaveSpeed immediately.

The nodes accept credentials only through a temporary password dialog and local credential ABI v2.
The key is intentionally absent from ComfyUI widget values, workflow JSON, prompt graphs, logs,
screenshots, and repository files.

Report non-sensitive security issues through a GitHub issue with minimal redacted reproduction
steps. For sensitive reports, contact the repository owner privately through the profile contact
channel.

