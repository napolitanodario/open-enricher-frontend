# Development preview on GitHub Pages

| Version     | Address                                                       | Source branch                             |
| ----------- | ------------------------------------------------------------- | ----------------------------------------- |
| Stable      | https://napolitanodario.github.io/open-enricher-frontend/     | `main`                                    |
| Development | https://napolitanodario.github.io/open-enricher-frontend/dev/ | `feature/evaluation-performance-redesign` |

GitHub Pages hosts one site per repository. The deployment workflow builds the
stable application at the root and the development application under `/dev/`,
with a separate Next.js base path for each build. A development banner identifies
the preview and links to the stable version.

Push changes to `feature/evaluation-performance-redesign` to update the preview.
The **Validate development preview** workflow checks the branch, then the
**Deploy GitHub Pages** workflow runs from `main` after successful validation.
The Pages deployment always checks out `main` for the stable application and the
feature branch for the preview. Pushes to `main` and manual Pages deployments
also rebuild both versions.

The combined site is published after both applications pass their checks and
build successfully. A failed build leaves the previous published site available.
This arrangement also works when the `github-pages` environment only permits
deployments from `main`; feature pushes trigger the default-branch workflow.

Imported archives remain in browser memory. Each version requires its own folder
selection, and no experiment data is bundled with the published site.

To build the development preview locally:

```sh
NEXT_PUBLIC_BASE_PATH=/open-enricher-frontend/dev \
NEXT_PUBLIC_DEPLOYMENT_CHANNEL=development \
NEXT_PUBLIC_PRODUCTION_BASE_PATH=/open-enricher-frontend/ \
npm run build
```
