Прочитай и выполни промпт для документирования React hook.

Файлы промпта:
- packages/react/.claude/prompts/wiki-analize/prompts/1-describe-hook.md
- packages/react/.claude/prompts/wiki-analize/templates/hook-description.md
- packages/react/.claude/prompts/wiki-analize/_shared/role-hook.md
- packages/react/.claude/prompts/wiki-analize/_shared/quality.md

Входные данные:
$ARGUMENTS

Формат аргументов:
```
hook: имяХука
tests: путь/к/тестам
```

Результат сохрани в файл `.claude/wiki/{hook}.md`

Пример:
```
hook: useRoute
tests: packages/react/tests/functional/useRoute.test.tsx
```
→ Сохранить в `.claude/wiki/useRoute.md`
