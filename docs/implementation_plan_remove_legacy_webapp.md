# Remove the retired web interface

## Goal and completion criteria

Remove the authenticated legacy `webapp/` source and its dedicated build and tests. React remains the sole product interface. Public legal routes, their assets, and durable user uploads must remain available. GitHub Actions must pass before merge; no local tests are run.

## Implementation

1. Move the three legal documents and their referenced CSS/SVG assets unchanged into `frontend/public`, preserving public URLs. Vite copies them into the production build; the local FastAPI fallback serves the same source documents and assets.
2. Move the upload runtime root to `uploads/`, retaining the named `buyerly-uploads` volume and public `/uploads/` URLs. Keep the old-container upload migration in the deploy script for upgrades.
3. Remove the remaining tracked legacy interface, its Docker/Nginx files, legacy-only contract tests and JavaScript CI step.
4. Update current source-location documentation and replace legal checks with production packaging, asset availability and public route coverage. Historical reports remain historical records.
5. Inspect the diff, publish the isolated branch and PR, and validate through GitHub Actions.

## Risks

Legal assets must not fall through to the SPA. Upload files must stay in the same named volume despite the changed container mount path. Retired UI assertions must not remove backend or production React coverage.
