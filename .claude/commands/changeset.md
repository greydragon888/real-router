Сгенерируй changeset файл на основе текущих изменений в git.

## Шаги

1. **Получи контекст задачи из GitHub issue:**
   ```bash
   # Извлеки номер issue из имени ветки (формат: <number>-<slug>)
   git branch --show-current | grep -oE '^[0-9]+'
   # Получи описание задачи
   gh issue view <number>
   ```
   **Если issue не найден — ПРЕКРАТИ выполнение** и сообщи об этом.

2. **Проанализируй изменения:**
   ```bash
   git diff main...HEAD --stat
   git diff main...HEAD
   ```

3. **Определи затронутые публичные пакеты:**
   - `@real-router/core`, `@real-router/react`, `@real-router/browser-plugin`
   - `@real-router/helpers`, `@real-router/logger-plugin`, `@real-router/persistent-params-plugin`
   - `@real-router/logger`, `@real-router/types`

   НЕ включай private: `route-tree`, `search-params`, `type-guards`, `router-benchmarks`

4. **Определи тип изменения:**
   - `major` — breaking changes
   - `minor` — новая функциональность
   - `patch` — исправления, рефакторинг

5. **Задавай вопросы ТОЛЬКО если** из issue и кода неоднозначно понятно, что реализовано (например, исправление стороннего бага).

## Формат changeset файла

```markdown
---
"@real-router/core": minor
"@real-router/react": patch
---

Краткое описание изменений на английском языке.

- Детали изменения 1
- Детали изменения 2
```

## Правила

- Описание на **английском**, безличный тон ("Add feature", не "I added")
- Путь: `.changeset/<random-name>.md` (например `happy-dolphins-swim.md`)
- Если изменения только в private/CI/config/tests — changeset не нужен
- Для major — укажи как мигрировать

## Пример

```markdown
---
"@real-router/core": minor
---

Add support for async route guards

- New `beforeEnter` and `beforeLeave` async guards
- Guards can return `false` to cancel navigation
```
