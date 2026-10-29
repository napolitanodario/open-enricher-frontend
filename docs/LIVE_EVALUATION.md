# Optional live metadata evaluation

The source folders can remain on the user's computer while the application calls an AI provider. However, remote evaluation necessarily sends the selected input to that provider. “Local source files” does not mean “no data leaves the browser”. No live calls or API key fields have been added in this revision.

## Recommended interaction

In Overview, an optional **Evaluate metadata** action could open a small dialog with provider, model and credentials, the criteria/prompt, an exact payload preview, and an explicit **Send for evaluation** button. Send the final profile and video title by default, optionally the reference synopsis. Do not send frames, the full transcript or logs unless deliberately selected. Reuse OpenEnricher's rubric and report format so imported and live results remain comparable.

Show progress, cancellation, provider failures and raw response inspection. Keep results in session memory and offer an explicit export of a new `score.json`; do not overwrite imported files silently. Record provider/model, evaluation time, prompt/rubric version and whether a synopsis was supplied. Validate the response and compute aggregate scores with the same weights/thresholds as the pipeline. Distinguish provider errors from low-quality metadata.

A future enabled evaluation mode must replace the unconditional “No data upload” status with accurate wording when outbound calls are available or active, and show the disclosure beside the send action.

## Hosting choices

| Approach | GitHub Pages compatible? | Key handling and tradeoff |
| --- | --- | --- |
| Browser calls provider directly | Yes, if the selected provider permits browser requests through CORS | User supplies their own key, held only in tab memory. It is visible to the browser and cannot be hidden in client code. Use scoped/short-lived credentials if supported; never ship a shared key or put it in local storage, URLs or logs. CORS support must be checked for the actual endpoint. |
| Small hosted proxy, such as a Cloudflare Worker | Pages remains the frontend; proxy is a separate service | Provider key stays on the server. Selected metadata passes through the proxy and provider. No database is needed, but authentication, quotas and abuse protection are needed; the fixed `1234` client gate is insufficient for a shared paid API. |
| Local evaluation service / local model | Best with a locally served frontend | Data can remain entirely on the machine if the model is local. Browser access from an HTTPS Pages site to localhost depends on CORS, HTTPS/mixed-content rules and local-network permissions; a localhost service is not automatically reachable. A local service that calls a cloud provider still sends metadata off-device. |

For occasional personal use, bring-your-own-key direct calls are the smallest addition if the chosen provider supports them. For a team using a shared provider account, use a protected proxy. If no metadata may leave the computer, use a local model.

GitHub Pages cannot run Next.js API routes or store provider secrets at runtime. None of these choices requires an experiment database or uploading the source archive as a whole.
