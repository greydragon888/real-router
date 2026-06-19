Прочитай и выполни промпт для сравнения React hook с master.

Файлы промпта:
- packages/react/.claude/prompts/wiki-analize/prompts/2-compare-hook.md
- packages/react/.claude/prompts/wiki-analize/templates/hook-diff.md
- packages/react/.claude/prompts/wiki-analize/_shared/role-hook.md
- packages/react/.claude/prompts/wiki-analize/_shared/quality.md

Входные данные:
$ARGUMENTS

Формат аргументов:
```
hook: имяХука
tests: путь/к/тестам
```

Результат **допиши в конец** файла `.claude/wiki/{hook}.md`

Пример:
```
hook: useRoute
tests: packages/react/tests/functional/useRoute.test.tsx
```
→ Дописать в `.claude/wiki/useRoute.md`
