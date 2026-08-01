---
name: research-official-sources
description: Research and fact-check current public claims using first-party, authoritative sources with direct links and explicit uncertainty. Use for prices, product plans, model availability, specifications, policies, release status, provider comparisons, or any request asking to verify, research, check, compare, confirm, latest, or current information.
---

# Research Official Sources

## Workflow

1. Identify the claims, comparison date, geography, currency, product surface, and units that need verification.
2. Use `web_search` with short queries to locate official provider, vendor, government, standards-body, or original-research pages.
3. Use `read_web_page` on the most relevant official results. Do not treat search snippets as final evidence.
4. Use `deep_research` instead when the request is explicitly broad, comprehensive, or needs many claims investigated together. Synthesize only the evidence it inspected.
5. Verify exact names, effective dates, current-versus-legacy status, billing units, thresholds, context tiers, regional differences, taxes, discounts, tool fees, and stated limitations.
6. Cross-check another first-party page when an official page is stale, ambiguous, dynamically rendered, or conflicts with another official source.
7. Use reputable secondary reporting only when primary evidence is unavailable, and label that limitation explicitly.

## Evidence rules

- Prefer the provider's documentation and pricing pages over blogs, aggregators, affiliate sites, forums, and generated comparison pages.
- Distinguish consumer subscriptions, developer APIs, cloud marketplace offerings, and negotiated enterprise contracts.
- Distinguish published facts from calculations, estimates, recommendations, and inference.
- Do not invent enterprise discounts, minimum commitments, per-task costs, or product positioning.
- Do not call something cheapest, best, latest, or most capable unless the inspected evidence and comparison method support it.
- Include the verification date when facts are likely to change.
- Link each material claim to the page that directly supports it.
- State bounded uncertainty when an official source does not establish a claim.

## Comparison output

Lead with the verdict. For multiple claims, use a compact table with `Claim`, `Verdict`, and `Official correction`. Follow it with the most consequential omissions or methodological problems. Keep historical prices separate from current recommended offerings.
