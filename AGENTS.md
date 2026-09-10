# Инструкции для AI-агентов (Buyerly)

## 🖥 1. Системное окружение
- **ОС**: Fedora (Linux).
- **Пакеты и утилиты**: Использовать системный менеджер пакетов `dnf` (например `sudo dnf install ...`).
- **🚫 ЗАПРЕТ НА ЛОКАЛЬНЫЕ ТЕСТЫ (КАТЕГОРИЧЕСКИ)**:
  * **НИКОГДА** не запускать `pytest`, `unittest`, `python -m unittest` или тестовые пакеты локально на компьютере пользователя. Это перегревает процессор и забивает ресурсы ноутбука.
  * Все тесты выполняются **исключительно в облаке GitHub Actions**. Проверять результаты тестов разрешено только удаленно через `gh run view --log-failed`.

---

## 🏆 2. Эталонный рабочий процесс (Golden Standard Workflow)

Разработка в проекте ведется по стандартам ведущих продуктовых IT-компаний (Trunk-Based Development + Docs-as-Code + CI/CD Quality Gate):

```mermaid
flowchart LR
    A[1. Issue / Задача] --> B[2. План / Архитектура]
    B --> C[3. Изолированная ветка]
    C --> D[4. Облачный CI / Тесты]
    D --> E[5. Pull Request & Review]
    E --> F[6. Merge в main & Auto-Deploy]
    F --> G[7. Release & Changelog]
```

### 1. Постановка задачи и планирование (Issue & Plan):
- Перед началом работы формулируется цель и критерии готовности (Definition of Done).
- Для сложных задач и архитектурных изменений составляется `implementation_plan.md` до внесения правок в код.

### 2. Строгая изоляция веток (No Branch Stacking):
- Каждая новая задача создаётся **СТРОГО от чистого и обновлённого `main`**:
  ```bash
  git checkout main
  git pull origin main
  git checkout -b <type>/issue-<N>-<short-name>
  ```
- **Категорически запрещено** создавать ветки поверх других незамёрдженных фиче-веток.
- 1 ветка = 1 Issue / 1 конкретная задача. Никаких правок параллельных компонентов.

### 3. Хотфиксы и документация:
- Любые обновления юридических документов, политик, инструкций или мелкие фиксы оформляются **отдельной изолированной веткой** от `main` (например `docs/update-...` или `fix/...`), а не поверх открытых задач.

### 4. Стандарт коммитов (Conventional Commits):
- Использовать понятные префиксы:
  - `feat: ...` — новая функциональность.
  - `fix: ...` — исправление ошибки.
  - `docs: ...` — документация, отчеты, регламенты.
  - `test: ...` — добавление или обновление тестов.
  - `refactor: ...` — рефакторинг кода без изменения поведения.
  - `perf: ...` — оптимизация производительности.
- В описании коммита или PR указывать `Closes #N` / `Fixes #N` при наличии Issue.

### 5. Контроль перед коммитом и PR:
- Перед созданием PR обязательно проверить чистоту диффа:
  ```bash
  git log --oneline main..HEAD
  git diff --stat main..HEAD
  ```
- Убедиться, что ветка содержит **только свои целевые коммиты**.

### 6. Облачный Quality Gate (CI / CD):
- После пуша в origin запускается удаленный пайплайн GitHub Actions.
- Тесты проверяются через `gh run watch` / `gh run view --log-failed`.
- Слияние разрешено только при 100% успешном прохождении тестов.

### 7. Слияние и деплой:
- PR мёрджится в `main` (через `gh pr merge <N> --merge --delete-branch`).
- Ветка `main` автоматически деплоится на боевой сервер (VPS) через `.github/workflows/deploy.yml`.

### 8. Документация и релизы (Docs-as-Code):
- Значимые изменения и релизы фиксируются в [`CHANGELOG.md`](CHANGELOG.md) по стандарту *Keep a Changelog* и *SemVer*.
- Архитектурные отчеты и результаты аудитов сохраняются в [`docs/`](docs/).
- Релизные вехи фиксируются через теги и GitHub Releases (`gh release create vX.Y.Z`).

---

## 🎨 3. Дизайн и UI/UX референс
- **Обязательный UI-контракт**: перед любым изменением страницы, модального окна, кнопки, поля, таблицы, статуса или responsive-вёрстки агент обязан полностью прочитать [`docs/UI_CONTRACT.md`](docs/UI_CONTRACT.md) и релевантный раздел [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md).
- **Production-источник визуальных значений**: [`frontend/src/styles/tokens.css`](frontend/src/styles/tokens.css). Цвета, типографика, spacing, размеры controls, radii, shadows, layers и motion меняются semantic-токеном там, а не копируются в page-specific component.
- **Production-источник shared components**: [`frontend/src/ui/`](frontend/src/ui/). Существующий React primitive переиспользуется; повторяющийся control сначала оформляется как shared primitive, а не как новая локальная семья.
- [`frontend/src/styles/index.css`](frontend/src/styles/index.css) — shared/domain composition layer. Он потребляет semantic tokens, но не создаёт второй источник глобальных constants.
- `webapp/` — legacy authenticated UI, не production-приложение. Новая продуктовая функциональность туда не добавляется; production image использует оттуда только public legal HTML.
- Vite создаёт fingerprinted assets, поэтому ручной cache-version не нужен. При изменении shared UI обновить `tests/test_react_frontend_contract.py` и пройти визуальную проверку 390/768/1024/1440px без document-level overflow.
- Id, handlers, API payloads, workspace isolation и security boundaries не меняются визуальным рефакторингом, если это явно не входит в задачу.
- Захваченные страницы сторонних продуктов и локальные HTML-снимки в репозитории не хранятся.
