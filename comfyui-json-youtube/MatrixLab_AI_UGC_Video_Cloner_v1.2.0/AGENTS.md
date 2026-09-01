# Agent installation contract

This file governs installation and validation of the Matrix Lab AI UGC Video Cloner package. It is written for a coding agent working on behalf of an end user.

## Objective

Install the supplied workflow into the user’s existing ComfyUI instance, verify its dependencies and safe defaults, and leave it ready for the user to add their own source video and reference assets.

Successful installation does not include running Partner Nodes or spending credits.

## Files in scope

- `MatrixLab_AI_UGC_Video_Cloner_v1.2.0.json`
- `README.md`
- `CHANGELOG.md`
- This file

Do not search for or copy demonstration media. The release intentionally contains no source video, character image, voice sample, API key, or generated output.

## Hard constraints

- Do not run, queue, or validate by executing the workflow.
- Do not enable either Seedance group without explicit user approval for a paid generation.
- Do not request, print, store, or edit credential values.
- Do not replace official Partner Nodes with community alternatives.
- Do not change system prompts, graph routing, group geometry, colors, notes, spacing, or reference ordering during installation.
- Do not connect the source video to Mode A.
- Do not enable both Seedance modes simultaneously.
- Preserve the user’s existing ComfyUI installation and unrelated workflows.
- Back up an existing workflow with the same filename before replacing it.

## Required environment

- ComfyUI 0.33.0 or newer.
- Official ComfyUI Partner/API Nodes.
- rgthree-comfy from `https://github.com/rgthree/rgthree-comfy`.
- A current browser frontend with ComfyUI Nodes 2.0 disabled.

No model checkpoint or local inference model is required.

## Installation procedure

1. Discover the user’s actual ComfyUI root and workflow directory. Do not assume a platform-specific path.
2. Record the installed ComfyUI version without changing it.
3. Check whether the following node classes are available:
   - `GeminiNodeV2`
   - `ClaudeNode`
   - `ByteDance2ReferenceNodeV2`
   - `VideoFrameSample`
   - `GetVideoComponents`
   - `ImageScaleToTotalPixels`
   - `SaveText`
   - `SaveVideo`
   - `Fast Groups Bypasser (rgthree)`
   - `Label (rgthree)`
4. If official Partner Nodes are missing, update ComfyUI using the user’s normal supported update method. Do not install look-alike nodes.
5. If rgthree-comfy is missing, install it through ComfyUI Manager. A manual Git installation is acceptable only when Manager is unavailable and the user’s normal custom-node policy permits it.
6. Set `Comfy.VueNodes.Enabled` to `false`. Restart or reload ComfyUI so rgthree uses the stable canvas implementation.
7. Back up any existing workflow with the same destination filename.
8. Copy the supplied JSON into the user’s workflow directory or import it through the ComfyUI interface.
9. Ask the user to sign in through ComfyUI’s normal account interface if Partner Node authentication is not active. Never handle the credential directly.
10. Perform the offline acceptance checks below.
11. Report what was installed, what remains for the user, and that no paid nodes were run.

## Offline acceptance checks

Parse the JSON without executing it and verify:

- Exactly 61 nodes.
- Exactly 78 links.
- Exactly 23 groups.
- Exactly three `GeminiNodeV2` nodes, all configured for Gemini 3.5 Flash.
- Exactly one `ClaudeNode`, configured for Opus 5.
- Exactly two `ByteDance2ReferenceNodeV2` nodes.
- Exactly ten reference groups named R01 through R10.
- The reference switcher’s title filter matches R01 through R10.
- R01–R03 are enabled; R04–R10 are bypassed.
- Every Load Image node contains an empty filename.
- The Load Video node contains an empty filename.
- The optional target screenshot and voice reference are bypassed.
- Both Seedance nodes and both Save Video nodes are bypassed.
- Mode A has no source-video link.
- Mode B has exactly one source-video link.
- Mode A uses Seedance task type `reference`.
- Mode B uses Seedance task type `edit`.
- The shared duration node feeds Gemini verification, Opus compilation, and both Seedance nodes.
- The workflow contains no demonstration-person name, local absolute path, credential, or embedded media.

If a check fails, stop and report the mismatch. Do not silently rewrite the graph.

## User handoff

Tell the user to complete these actions in the ComfyUI interface:

1. Load their source video.
2. Set the desired duration between 4 and 30 seconds.
3. Fill references 1–3 or adjust the reference switches to match the filled slots.
4. Review the Clone Intent.
5. Keep both Seedance modes off for the first analysis run.
6. Inspect the audit outputs and final prompt.
7. Approve one paid mode only after reviewing its live credit estimate.

## Clone Intent guidance

AUTO mode is suitable only when the source contains one unambiguous primary person or product.

For multiple people, require one target description containing:

- Starting position.
- Source wardrobe or visual tracker.
- Source role.
- Decisive action.
- Explicit preserve rule for everyone else.

For products, require:

- Product role in the source.
- How it enters or is handled.
- A distinguishing source tracker.
- Explicit preservation of presenters, hands, packaging, and secondary products.

Do not put biometric identity descriptions into Clone Intent. Replacement identity comes from the active reference images.

## Paid-run gate

Installation authority is not generation authority. Before any paid run, obtain explicit approval that identifies:

- Mode A or Mode B.
- Resolution.
- Duration.
- Active reference count.
- Whether generated audio is enabled.
- Whether a voice reference is enabled.
- The live estimated credit cost.

After approval, enable exactly one Seedance group. Queue one run only. Report the resulting output and the metered credit history when available.

## Known frontend issue

When ComfyUI Nodes 2.0 is enabled, the rgthree Fast Groups Bypasser may display every reference row as R01 and control the first group repeatedly. The supported configuration for this package is `Comfy.VueNodes.Enabled = false`, followed by a frontend reload and workflow re-import.
