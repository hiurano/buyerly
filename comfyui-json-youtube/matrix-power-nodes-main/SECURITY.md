# Security policy

## Supported version

Security fixes are applied to the latest release.

## Reporting

Report vulnerabilities privately to Matrix Lab through the repository owner's private contact
channel. Do not open a public issue containing credentials, customer images, provider responses,
or exploit details.

## Credential boundary

- The Python node schema contains no provider-key input for the dataset config node.
- The browser control sends a pasted key directly to a loopback, same-origin, intent-protected
  route and does not serialize it into the workflow.
- The key is stored in cleartext under the current ComfyUI user's credential directory. This
  product is for controlled single-user ComfyUI installations, not shared multi-user servers.
- Credential files use atomic replacement and restrictive file permissions where supported.
- Malformed credential state fails closed.

Never publish workflows, logs, screenshots, or support bundles before checking them for secrets
and private reference images.
