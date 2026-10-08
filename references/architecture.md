# Architecture

## Purpose and overview

Planners Bypage owns the realization of research or proposal judgments. It turns a saved Storyline, a working Storyline formed from supplied materials, or a non-PPT material package received from PPT Hell into complete page content that can be handed to PPT production.

## Modules

| Module | Unique owner | Interface | Does not do |
|---|---|---|---|
| Handoff intake | This Skill | Upstream memory, source index, Storyline, structure contract and feedback | Does not silently change upstream direction |
| Content realization | This Skill | Page-level content tasks and full argument expansion | Does not reduce a Storyline to a summary |
| Materials and assets | This Skill | Sources, images, material packs and asset manifest | Does not own the global Storyline |
| By-page writing | This Skill | `bypage-draft.md` / `deliverable/by-page.md` | Does not decide PPT layout or template |
| Review and handoff | This Skill | Fact checks, content review and final asset package | Does not ask Validator to judge rhetorical quality |

## Entry paths

- Proposal handoff: consume the upstream canonical Storyline and structure reference, then begin content realization.
- PPT Hell material intake: receive a non-PPT source package when PPT Hell needs content understanding before visual production; form the working structure here and return the completed By-page.
- Standalone: form a working structure from the supplied materials when no upstream Storyline exists.

The three paths share the same content realization and delivery responsibility after the structure is understood.

## Seams

The shared path/ownership interface is `references/content-handoff.md`. Proposal hands over its preserved memory, source index, canonical structure and current Workbench head. `adapt-proposal-architecture.mjs` converts its vocabulary into a separate working architecture without replacing the original or existing work. PPT Hell passes materials, existing active paths and its resume position. Bypage returns the current production snapshot together with active source, audit and Workbench paths. Changes to a core judgment require a user decision.

## Scope boundary

The optional content shell and DSH tokens are owned by `planners-review-core`. This Skill's builders map its native artifacts to the shell; Workbench owns source-version checks, CAS saves, backups, human edit/reorder application, and pending tasks. `review-inbox.mjs` is legacy-only. Drafts are durable but are not canonical saves. Copy changes invalidate the old fact audit; edited canonical content, not the original preview, feeds PPT handoff.

By-page decides what the audience needs to see and how the argument should be expressed in content. `$planners-ppt-hell` decides layout, slots, cropping and PPTX implementation. Validators check mechanical and authenticity properties; they do not decide whether the story is sufficiently developed.

## Retired behavior

`SKILL.md` owns the five-step workflow. The duplicate `WORKFLOW.md`, eight stage instructions and local writing/language rulebooks were retired; writing uses `slide-copy` and optional `storytelling`. Legacy Storyline/sample review CLIs remain for existing project continuation and regression compatibility, not as required entry gates. Fact-check independence and agent reuse belong to `planners-fact-check`, not Review Core.

The Proposal handoff path no longer rebuilds an abstract duplicate of the saved Storyline and treats that as content work. Material packs are support work after content realization, not a substitute for it.
