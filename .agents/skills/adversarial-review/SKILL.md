---
name: adversarial-review
description: >-
  Conducts an in-depth adversarial code and architecture review acting as a Devil's Advocate.
  Use this skill whenever reviewing PRs, diffs, architectural plans, migrations, or sensitive code
  to identify race conditions, security vulnerabilities, edge cases, failure modes, and performance traps.
---

# Adversarial Code Review (Devil's Advocate)

This skill guides the agent or subagent in performing a rigorous, adversarial review of code, architectures, database migrations, and API implementations.

---

## Review Philosophy & Mindset

1. **Presumption of Failure**: Assume the proposed implementation **will fail** in production. The goal is to uncover precisely *how*, *when*, and *under what load or chaos conditions* it breaks.
2. **Beyond Linter & Syntax**: Linters check style. The adversarial reviewer questions **assumptions, state invariants, failure modes, concurrency, and security boundaries**.
3. **Actionable & Constructive**: Every flagged vulnerability or edge case must include an explanation, a failure scenario (or Proof-of-Concept), and a suggested mitigation.
4. **Grounded & Anti-Hallucination (No False Paranoia)**:
   - Do not flag purely theoretical non-issues if the surrounding framework, database transaction isolation level, or ORM already natively guarantees safety.
   - Every finding must be anchored to a concrete line number, variable state, or execution path in the code.
5. **Scope Anchoring**: Focus strictly on the changes within the target PR/diff and their direct blast radius. Do not derail the review into critiquing unrelated legacy code.
6. **Strict Isolation**: Reviewers operate in **Read-Only** mode (analyzing code without altering it).

---

## Step-by-Step Review Workflow

When conducting an adversarial review, follow these 4 steps in order:

### Step 1: Establish Scope & Blast Radius
1. Determine changed files and diff:
   ```bash
   git log --oneline main..HEAD
   git diff --stat main..HEAD
   git diff main..HEAD
   ```
2. Identify the core components touched: API routers, background workers, database schemas/migrations, external integrations, or shared utilities.

### Step 2: Deep Context Gathering (Beyond the Diff)
Do not review the diff in a vacuum:
- Read surrounding functions, callers, and class definitions.
- Inspect affected database models (`database/models.py`), constraints, unique indexes, and foreign keys.
- Check authentication dependencies and tenant isolation scopes (`workspace_id`, session user).

### Step 3: Run Vector Analysis (5-Pillar Audit)
Audit the implementation against the 5 adversarial vectors below.

### Step 4: Generate Structured Report
Synthesize findings into the standardized report format with PoCs and recommended fixes.

---

## Adversarial Vectors & Checklist

### 1. Concurrency & State Hazards
- **Race Conditions & Check-Then-Act**: Are there non-atomic read-modify-write patterns?
- **Shared Mutable State**: Are variables, singletons, or caches shared across async coroutines or threads without locks?
- **Database Locks & Isolation**: Are transactions isolated properly? Is `SELECT ... FOR UPDATE` required? Is there a risk of deadlocks under concurrent requests?
- **Retry Idempotency**: If a network call or background task fails and retries, will it create duplicate charges, duplicate records, or double-mutations?

### 2. Failure Modes & Edge Cases (Chaos Engineering)
- **Partial Outages / Network Drops**: What happens if an external API (Meta Graph API, Telegram Bot API, Stripe, ClickUp, etc.) times out or returns HTTP 5xx midway through execution?
- **Rollback & Cleanup**: Do unhandled exceptions leave dangling DB transactions, orphaned files on disk, or unreleased locks?
- **Boundary Conditions**: How does the code handle:
  - `None` / `null` / `undefined` / missing dictionary keys
  - Empty collections (`[]`, `{}`)
  - Zero division, negative numbers, or invalid numeric ranges
  - Oversized payloads / memory-exhausting strings / uncompressed streams
  - Malformed JSON / corrupted tokens

### 3. Security & Multi-Tenancy (Access Control)
- **IDOR / Tenant Leakage**: In multi-tenant endpoints (e.g. workspaces, accounts, campaigns), does every DB query strictly scope down to `workspace_id` / `user_id` from the authenticated session?
- **Injection Vectors**: Are raw strings interpolated into SQL queries, shell commands, or HTML templates?
- **Sensitive Data Exposure**: Are API keys, OAuth tokens, passwords, or PII logged in plaintext or exposed in error responses/stack traces?
- **Rate Limiting & DoS**: Can an unauthenticated or malicious user trigger expensive computation, disk writes, or uncontrolled loops?

### 4. Performance, Scale & Resource Leaks
- **N+1 Query Traps**: Are ORM relationships loaded inside loops instead of batch-fetched / joined?
- **Blocking Async Event Loop**: Are there synchronous file I/O, heavy CPU processing, or `time.sleep` calls inside `async def` FastAPI routes or worker tasks?
- **Memory Growth**: Are caches bounded with an eviction policy (e.g. LRU/TTL), or can memory grow indefinitely?
- **Connection Pools**: Are DB sessions and HTTP client sessions (`aiohttp.ClientSession`, `httpx.AsyncClient`) properly reused or closed via context managers?

### 5. Project Policies & Golden Standards Compliance
- Check against rules defined in [`AGENTS.md`](file:///home/user/Projects/ai-mediabuyer/AGENTS.md):
  - No local tests executed locally on user machines.
  - Strict branch isolation and Trunk-Based Development standards.
  - UI consistency with Attio CRM design system where applicable.

---

## How to Run an Adversarial Subagent

When delegating a review to a dedicated subagent:

```json
{
  "TypeName": "research",
  "Role": "Adversarial Code Reviewer",
  "Model": "pro",
  "Prompt": "Perform a rigorous adversarial review (Devil's Advocate) of the changes between main and HEAD. Follow the 4-step workflow and 5-pillar checklist in the adversarial-review skill. Output a structured report with Critical Findings (Blockers), Warnings, Design Challenges, and a Final Verdict."
}
```

---

## Output Report Template

When publishing the adversarial review findings, use this structured format:

```markdown
# Adversarial Review Report

## Executive Summary
- **Scope**: [Files / Diff / Component reviewed]
- **Overall Assessment**: [Short 1-2 sentence verdict]

---

## Critical Findings (Blockers)
*Vulnerabilities, data corruption risks, guaranteed crashes, or tenant leakages.*

### 1. [Title of Critical Issue]
- **Location**: `path/to/file.py:L10-L25`
- **Failure Scenario / PoC**: [Step-by-step how to trigger the failure]
- **Impact**: [What happens: e.g. Data leak, service crash, duplicate billing]
- **Recommended Fix**:
  \`\`\`python
  # Proposed fix code snippet
  \`\`\`

---

## Risk & Edge Cases (Warnings)
*Subtle race conditions, unhandled boundary cases, timeout vulnerabilities.*

### 1. [Title of Risk]
- **Location**: `path/to/file.py:L45`
- **Condition**: [Under what condition this causes issues]
- **Mitigation**: [How to defend against it]

---

## Design & Architecture Challenges
*Questioning unstated assumptions, missing contracts, or leaky abstractions.*
- [Challenge 1: Why assume X when Y can happen?]

---

## Final Verdict
- **[ REJECT / REQUEST CHANGES / PASS WITH NOTES ]**
```
