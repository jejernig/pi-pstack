---
name: beauty-pageant-architecture
description: Verify frontend and backend application changes against the beauty pageant architecture. Use for UI changes, API or business-logic changes, and full-stack reviews in Poteto Mode. Check that the UI presents and interacts while the backend owns authoritative rules and data decisions.
---

# Beauty pageant architecture

The UI presents the experience. The backend makes authoritative decisions. Verify both sides when both exist; inspect the changed side and its contract when only one side changes. This is an architecture check, not a visual-quality review.

1. Trace one affected user action from the UI through the API to the domain decision and back. For a backend-only change, start at its public entry point. Name the request, response, and owner of each decision. If no UI exists, assess the backend boundary without inventing one.
2. Inspect frontend code for display, accessibility, local drafts, loading, focus, navigation, and interaction state. These belong in the UI. Flag business rules, authorization, pricing, entitlement, persistence decisions, or client-only validation that the server trusts. Client validation can help the user, but the server must enforce the rule.
3. Inspect backend entry points for input parsing, authentication, authorization, and error mapping. Keep transport handlers thin. Put business policy in typed domain or application code behind the API. Keep persistence and transport details out of domain rules. Test the policy without a UI or HTTP server.
4. Check the contract with a real request and response, including one rejected or unauthorized case where relevant. Check that changing the UI cannot bypass a rule. For a UI change, drive the actual interaction and observe its result. Use the project's existing verification tools.
5. Report `pass` or `fail` for frontend ownership, backend ownership, and the full path. For each failure, cite the file and operation, show the rule's current owner, name the correct owner, and give a check that fails before a fix. Mark a side `not applicable` only when it does not exist. If evidence is missing, report `not verified` rather than `pass`.

Apply SOLID where a specific dependency or responsibility causes a problem. Name that coupling and the smaller change that removes it. Do not add interfaces, services, or layers solely to satisfy an acronym. Prefer Rust for a new API when the project has no established backend and Rust fits its constraints. An existing non-Rust backend does not fail this check because of its language.

Pass only when the traced path shows that the backend enforces every authoritative rule and, when a UI exists, the UI completes the interaction. A static import scan or a passing unit test alone is not proof of the boundary.
