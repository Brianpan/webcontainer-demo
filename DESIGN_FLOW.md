# Design Flow

This document defines the working protocol for multi-agent delivery. It is
meant to remove guesswork: every agent should know which phase it owns, which
files to read, which files to write, and when to hand off.

## Goal

Use a visual quorum to finish project work through a sequence of independent
agent passes:

1. plan the work
2. explain the plan in plain language
3. challenge the plan before implementation
4. implement the work
5. challenge the implementation before tests
6. test the work with a different agent
7. capture memory for future agents

The adversary phases are marked with `[A]`. An adversary agent challenges the
work and records findings. It must not silently rewrite the work it reviews.

## Glossary

- **Phase artifact**: a timestamped Markdown file written for one phase of one
  task, such as a plan, grill, action summary, or test report.
- **Memory file**: a lightweight note that preserves context future agents
  cannot infer from code or phase artifacts.
- **Controlled tag**: a tag from the stable project vocabulary. Agents may add
  task-specific tags after the controlled tags.
- **Follow-up**: the next action, owner, artifact, command, or check needed
  after a phase. Write `None` when no follow-up remains.
- **Adversary agent**: an agent assigned to challenge a plan, implementation,
  or verification path. It records findings instead of silently repairing the
  work under review.

## Project Lanes

Use the existing lane docs before starting a task:

- QEMU work: read `qemu/AGENTS.md`, then process `qemu_tasks/*.md` in numeric
  order.
- htdocs work: read `htdocs/AGENTS.md`, then process `htdocs_tasks/*.md` in numeric
  order.


The lane decides the implementation area. The design flow decides how agents
coordinate around that implementation.

## Phase Map

```
Task Brief
    |
    v
Plan -> Explain -> Grill 1 [A] -> Action -> Grill 2 [A] -> Test [A]
    |        |            |          |             |            |
    +--------+------------+----------+-------------+------------+
                             |
                             v
                          Memories
```

Each phase reads the task brief, the lane doc, the latest `index.md` files from
earlier phases, and any linked memory notes.

## Phase Contracts

### 1. Plan

Purpose: turn the task brief into an executable approach.

The planning agent writes:

- scope and non-goals
- affected files or modules
- assumptions
- implementation strategy
- expected tests
- risks and open questions

Exit gate: another agent can implement from the plan without asking what the
task means.

### 2. Explain

Purpose: restate the plan so a non-specialist can understand it.

The explain agent writes:

- a plain-language summary
- the user-visible outcome
- the smallest useful milestone
- any confusing terms translated into simple language

Exit gate: a fifth-grade reader could describe what will change and why.

### 3. Grill 1 `[A]`

Purpose: challenge whether the plan is worth implementing.

The adversary agent checks:

- whether the plan matches `AGENTS.md`, the lane doc, and the task brief
- whether the solution is overbuilt or under-specified
- whether the wrong subsystem is being changed
- whether test expectations are missing
- whether state, coordination, containers, or metric hooks were forgotten

The adversary agent writes findings as:

- `blocker`: must be resolved before action
- `risk`: acceptable only if named and tracked
- `nit`: small clarity issue

Exit gate: no unresolved blockers remain, or the planner records why the work
is intentionally proceeding despite them.

### 4. Action

Purpose: implement the approved plan.

The action agent writes:

- a summary of changes made
- files changed
- deviations from the plan
- commands run
- manual checks performed
- remaining risks

Implementation rules:

- Follow `AGENTS.md` for the lane.
- Do not check compiled files into `public/js`.
- Keep implementation scoped to the task.
- Preserve unrelated user or agent changes.
- Use the commit pattern `[who] tasks` when committing.

Exit gate: the work is implemented and can be reviewed without relying on chat
history.

### 5. Grill 2 `[A]`

Purpose: challenge the implementation structure before tests are written.

The adversary agent checks:

- module boundaries and state flow
- error handling and lifecycle behavior
- whether Docker/OCI assumptions are isolated for backend work
- whether metric hooks can run in print mode and sandbox mode
- whether the console still uses Node.js, Express, TypeScript, and no frontend
  framework such as React or Redux
- whether the implementation created hidden coupling

The Grill 2 agent must not write tests. It records structural findings only.

Exit gate: no structural blocker remains, or the action agent records why the
risk is accepted.

### 6. Test `[A]`

Purpose: verify behavior with a different agent from the action agent.

The test agent writes:

- test strategy
- tests added or updated
- commands run
- passing and failing results
- reproduction notes for failures

Rules:

- The test framework must be written or updated by an agent different from the
  action agent.
- Prefer focused tests that prove the task behavior.
- If tests cannot run, record the exact blocker and the next command to try.

Exit gate: the task has automated or clearly documented manual verification.

### 7. Memories

Purpose: preserve handoff context that future agents cannot infer from code.

Write memory notes when:

- a decision affects future tasks
- an assumption was corrected
- a workaround was used
- an adversary finding was accepted instead of fixed
- coordination between console, backend, and metrics changed

Memory is not a diary. It should be short, searchable, and useful.

## Folder Structure

Create one flow folder per task or goal:

```
flow_tasks/<task-or-goal>/
  brief.md
  plans/
    index.md
    <YYYYMMDDHHMMSS>-<name>.md
  explains/
    index.md
    <YYYYMMDDHHMMSS>-<name>.md
  grills1/
    index.md
    <YYYYMMDDHHMMSS>-<name>.md
  actions/
    index.md
    <YYYYMMDDHHMMSS>-<name>.md
  grills2/
    index.md
    <YYYYMMDDHHMMSS>-<name>.md
  tests/
    index.md
    <YYYYMMDDHHMMSS>-<name>.md
  memories/
    index.md
    <YYYYMMDDHHMMSS>-<phase>-<name>.md
```

If the task belongs clearly to one lane, place the flow folder under that lane:

- `qemu_tasks/flow_tasks/<task-or-goal>/`
- `htdocs_tasks/flow_tasks/<task-or-goal>/`

If a task crosses lanes, use top-level `flow_tasks/<task-or-goal>/` and name
the affected lanes in `brief.md`.

## File Rules

### `brief.md`

The brief is the source of truth for the task. Include:

- task title
- lane: `qemu`, `htdocs`, or `cross-lane`
- tags
- source task file, if any
- desired user outcome
- constraints
- acceptance criteria

Use `Tags:` near the top of the brief so agents can find work by lane, phase,
risk, or subsystem without opening every file.

### `index.md`

Each phase directory has an `index.md`.

The index must include:

- current files in that phase directory
- summary for each file in 100 words or less
- tags for each file entry
- latest status: `draft`, `blocked`, `ready`, `superseded`, or `accepted`
- links to follow-up memories or findings

Index entries should be scannable:

```md
- `20260712143005-session-storage-plan.md`
  - Status: ready
  - Tags: [backend, plan, state, session-storage]
  - Summary: Defines the backend session storage approach and expected tests.
```

### Timestamped Phase Files

Use this format:

```
<YYYYMMDDHHMMSS>-<short-kebab-name>.md
```

Example:

```
20260712143005-session-storage-plan.md
```

Each phase file should start with:

```md
# <Phase>: <Task Name>

- Lane:
- Agent:
- Date:
- Inputs read:
- Status:
- Tags:
```

`Tags:` must live in the metadata block. Use controlled tags first, then add
task-specific tags when helpful.

Controlled tags:

```md
[console, backend, metric, cross-lane, plan, explain, grill1, action, grill2, test, memory, blocker, risk, state, oci, docker, hooks]
```

Example:

```md
# Plan: Session Storage

- Lane: backend
- Agent: codex
- Date: 2026-07-12
- Inputs read: [AGENTS.md, DESIGN_FLOW.md, backend.md, backend_tasks/1.md]
- Status: ready
- Tags: [backend, plan, state, session-storage]
```

After the metadata block, every non-memory phase artifact must use this outline:

```md
## Purposes/Goals

- [ ] checklist item

## Conclusions

Few sentences stating the result, judgment, or decision.

## Constraints/Dependencies

Specific constraints, such as language, runtime, machine environment, lane docs,
business tone, required tools, and forbidden outputs.

## Follow-ups

What should happen next, who should do it, and what artifact or command proves
it. Write `None` when no follow-up remains.
```

### Memory Files

Use this format:

```
<YYYYMMDDHHMMSS>-<phase>-<short-kebab-name>.md
```

Example:

```
20260712150122-grill2-accepted-oci-risk.md
```

Memory files use a lighter format:

```md
# Memory: <Short Name>

- Date:
- Agent:
- Related phase:
- Tags:
- Decision/Observation:
- Reason:
- Impact:
- Next agent who should care:
```

Use controlled tags first, then add task-specific tags when helpful.

## Handoff Rules

Before handing off, every agent must:

1. update the phase `index.md`
2. record blockers explicitly
3. link any new memory notes
4. state the next recommended phase
5. list commands run, if any

The next agent should never need to recover important context from chat logs.

## Quorum Rules

- The same agent may not own both Action and Test for the same task.
- Adversary agents challenge and record; they do not silently repair.
- A blocker must be resolved by a later phase file or explicitly accepted as a
  risk.
- If a task changes scope, update `brief.md` before continuing.
- If a lane doc conflicts with this flow, the lane doc controls implementation
  details and this file controls coordination.

## Agent Checklist

At the start:

- Read `AGENTS.md`.
- Read this file.
- Read the relevant lane doc.
- Read `brief.md`.
- Read earlier phase indexes.

During work:

- Keep the phase contract in mind.
- Write findings in the correct phase folder.
- Keep summaries short and link the details.

At the end:

- Update the phase `index.md`.
- Record verification or blockers.
- Name the next phase.