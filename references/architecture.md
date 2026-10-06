# Architecture

## Purpose and overview

Planners Bypage owns the realization of research or proposal judgments. It turns an approved Storyline, or a working Storyline formed in its standalone path, into complete page content that can be handed to PPT production.

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
- Standalone: form a working structure from the supplied materials when no upstream Storyline exists.

The two paths share the same content realization and delivery responsibility after the structure is understood.

## Seams

Proposal hands over its preserved memory, source index, Storyline, structure contract and feedback. By-page hands over complete page content and assets to `$planners-ppt-hell`. If content research reveals that the core Storyline must change, return to Proposal rather than silently changing it here.

## Scope boundary

By-page decides what the audience needs to see and how the argument should be expressed in content. `$planners-ppt-hell` decides layout, slots, cropping and PPTX implementation. Validators check mechanical and authenticity properties; they do not decide whether the story is sufficiently developed.

## Retired behavior

The Proposal handoff path no longer rebuilds an abstract duplicate of the approved Storyline and treats that as content work. Material packs are support work after content realization, not a substitute for it.
