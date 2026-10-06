# Architecture

## Purpose and overview

Planners Bypage owns the realization of research or proposal judgments. It turns an approved Storyline, a working Storyline formed from supplied materials, or a non-PPT material package received from PPT Hell into complete page content that can be handed to PPT production.

## Modules

| Module | Unique owner | Interface | Does not do |
|---|---|---|---|
| Handoff intake | This Skill | Upstream memory, source index, Storyline, structure contract and feedback | Does not silently change upstream direction |
| Content realization | This Skill | Page-level content tasks and full argument expansion | Does not reduce a Storyline to a summary |
| Materials and assets | This Skill | Sources, images, material packs and asset manifest | Does not own the global Storyline |
| By-page writing | This Skill | `bypage-draft.md` / `deliverable/by-page.md` | Does not decide PPT layout or template |
| Review and handoff | This Skill | Fact checks, content review and final asset package | Does not ask Validator to judge rhetorical quality |

## Entry paths

- Proposal handoff: consume the approved upstream Storyline and structure reference, then begin content realization.
- PPT Hell material intake: receive a non-PPT source package when PPT Hell needs content understanding before visual production; form the working structure here and return the completed By-page.
- Standalone: form a working structure from the supplied materials when no upstream Storyline exists.

The three paths share the same content realization and delivery responsibility after the structure is understood.

## Seams

Proposal hands over its preserved memory, source index, Storyline, structure contract and feedback. PPT Hell hands over the non-PPT source package when it needs content work before visual production. By-page hands over complete page content and assets to `$planners-ppt-hell`. If content research reveals that the core Storyline must change, return to Proposal on the Proposal path; otherwise return to Stage 02 and ask the user before changing the working structure.

## Scope boundary

The optional content shell and DSH tokens are owned by `planners-review-core`. This Skill's builders map its native artifacts to the shell; `scripts/lib/review-edits.mjs` and `review-inbox.mjs` own source-version checks, backups, human edit/reorder application, and native feedback. Drafts are durable but are not approvals. Copy changes invalidate the old fact audit; edited canonical content, not the original preview, feeds PPT handoff.

By-page decides what the audience needs to see and how the argument should be expressed in content. `$planners-ppt-hell` decides layout, slots, cropping and PPTX implementation. Validators check mechanical and authenticity properties; they do not decide whether the story is sufficiently developed.

## Retired behavior

The Proposal handoff path no longer rebuilds an abstract duplicate of the approved Storyline and treats that as content work. Material packs are support work after content realization, not a substitute for it.
