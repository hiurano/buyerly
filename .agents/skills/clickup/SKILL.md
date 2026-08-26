---
name: clickup
description: >-
  Manage and interact with ClickUp tasks, backlogs, roadmap, sprints, and task lifecycles in the Buyerly workspace.
  Use this skill whenever looking up task requirements, listing open issues, transitioning task statuses,
  adding progress reports/comments, or synchronizing Git PRs with ClickUp tasks.
---

# ClickUp Task & Workflow Integration

This skill enables Antigravity to interact seamlessly with the **Buyerly** ClickUp workspace (`90183003824`).

---

## ⚠️ Правило оформления: СТРОГИЙ ЗАПРЕТ НА ЭМОДЗИ
- **КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО** использовать любые эмодзи (🚀, 👀, 📋, ✅, ⚠️ и т.д.) в комментариях, заголовках, описаниях и отчётах ClickUp.
- Все сообщения в ClickUp должны быть оформлены в строгом, чистом, профессиональном текстовом стиле без декоративных символов.

---

## Available CLI Utility

A Python CLI script is located at [`.agents/skills/clickup/clickup_tool.py`](file:///home/user/Projects/ai-mediabuyer/.agents/skills/clickup/clickup_tool.py).

### Commands:

1. **List Tasks**:
   ```bash
   python3 .agents/skills/clickup/clickup_tool.py list
   # With filters:
   python3 .agents/skills/clickup/clickup_tool.py list --status "backlog,ready to start"
   ```

2. **Get Task Details** (Description, acceptance criteria, checklist):
   ```bash
   python3 .agents/skills/clickup/clickup_tool.py get <TASK_ID>
   # Including comments:
   python3 .agents/skills/clickup/clickup_tool.py get <TASK_ID> --comments
   ```

3. **Update Task Status**:
   ```bash
   python3 .agents/skills/clickup/clickup_tool.py status <TASK_ID> "in progress"
   # Allowed statuses: "backlog", "ready to start", "in progress", "in rev", "complete"
   ```

4. **Add Comment / Progress Report / PR Link**:
   ```bash
   python3 .agents/skills/clickup/clickup_tool.py comment <TASK_ID> "PR created: https://github.com/hiurano/buyerly/pull/123"
   ```

5. **Search Tasks by Keyword**:
   ```bash
   python3 .agents/skills/clickup/clickup_tool.py search "OAuth"
   ```

6. **View Workspace Structure**:
   ```bash
   python3 .agents/skills/clickup/clickup_tool.py structure
   ```

---

## Standard Workflow with ClickUp & Git

When picking up a task from ClickUp:

1. **Fetch Task**:
   `python3 .agents/skills/clickup/clickup_tool.py get <TASK_ID>`
   Read the problem statement, definition of done, and technical requirements.

2. **Update Status to `in progress`**:
   `python3 .agents/skills/clickup/clickup_tool.py status <TASK_ID> "in progress"`

3. **Branch Creation**:
   Create a branch according to Golden Standard Workflow:
   `git checkout main && git pull origin main`
   `git checkout -b <type>/cu-<TASK_ID>-<short-description>`

4. **Implementation & Cloud CI**:
   Implement the changes, push to origin, and verify CI tests via GitHub Actions.

5. **Update Status to `in rev` and Comment (NO EMOJIS)**:
   When PR is opened:
   `python3 .agents/skills/clickup/clickup_tool.py status <TASK_ID> "in rev"`
   `python3 .agents/skills/clickup/clickup_tool.py comment <TASK_ID> "PR opened: <URL>"`
   Wait for user review and approval before merging.

6. **Complete**:
   Only after user approves and PR is merged into `main`:
   `python3 .agents/skills/clickup/clickup_tool.py status <TASK_ID> "complete"`

