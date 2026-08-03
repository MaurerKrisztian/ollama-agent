# Local Model Chat - Checkpoint & Revert System Documentation

## Overview

The **Checkpoint System** provides automated snapshotting and full revertability for all file mutations in the workspace. It captures file states **before** any modification or deletion occurs—whether triggered by agent file editing tools or raw terminal shell commands (like `rm` or `rm -rf`).

---

## Architecture & Workflow

```mermaid
flowchart TD
    A[Action Triggered: File Tool or Terminal Command] --> B[Parse Target File / Directory Paths]
    B --> C[Check snapshotCache to avoid duplicate snapshots per turn]
    C --> D[Read original content from disk before execution]
    D --> E[Save FileSnapshot: { path, before: content | null }]
    E --> F[Execute Tool / Shell Command e.g. rm file.txt]
    F --> G[Checkpoint Entry ready for Review & Revert]
```

---

## Key Components

### 1. Pre-Execution Snapshot Engine ([src/server/index.ts](file:///media/zero/EXTERNAL_MAIN/local-model-chat/src/server/index.ts))
* **`captureSnapshotByPath(absPath)`**: 
  - Reads and caches original file contents prior to modification.
  - Recursively traverses directories before folder deletions (e.g. `rm -rf <dir>`).
  - Records `before: null` for newly created files so they can be deleted upon revert.
* **`captureCommandSnapshot(command)`**:
  - Parses shell command arguments to locate file and directory targets before executing terminal commands (such as `rm`, `mv`, `cp`, `touch`).
* **Unchanged File Filtering (`before === after`)**:
  - At the end of each prompt turn, the server compares `before` content against current on-disk `after` content.
  - Any files with zero content changes (e.g., read by `cat`, searched with `find`, or touched without edits) are **automatically omitted** from the batch review list and checkpoint history.

### 2. Checkpoint Data Model
```typescript
type FileSnapshot = {
  path: string;
  before: string | null; // null indicates file did not exist before turn
};

type CheckpointEntry = {
  promptId: string;
  promptText: string;
  timestamp: number;
  snapshots: FileSnapshot[];
};
```

---

## Revert Capabilities

| Action Taken | Pre-Snapshot Recorded | Revert Behavior |
| :--- | :--- | :--- |
| **File Modified** | Original file text | Overwrites file back to pre-turn content |
| **File Deleted (`rm`)** | Original file text | Re-creates directories and restores deleted content |
| **Folder Deleted (`rm -rf`)** | Recursive list of all files | Re-creates full folder structure and file contents |
| **New File Created** | `before: null` | Deletes the newly created file |

---

## API Endpoints

* **`GET /api/chat/checkpoints?sessionId=<id>`**
  - Returns the list of checkpoints and snapshots recorded for the session.
* **`POST /api/chat/revert-files`**
  - Accepts `{ sessionId, promptId, revertPaths }` to selectively revert specified files back to their checkpoint state.

---

## Running Verification Tests

Run the dedicated test suite for command execution and checkpointing:

```bash
npx tsx --test src/server/checkpointCommand.test.ts
```

Run the full checkpoint regression suite:

```bash
npx tsx --test src/server/checkpoint.test.ts
```
