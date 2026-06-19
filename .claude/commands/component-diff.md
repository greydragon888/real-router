Прочитай и выполни промпт для сравнения React компонента с master.

Файлы промпта:
- packages/react/.claude/prompts/wiki-analize/prompts/4-compare-component.md
- packages/react/.claude/prompts/wiki-analize/templates/component-diff.md
- packages/react/.claude/prompts/wiki-analize/_shared/role-component.md
- packages/react/.claude/prompts/wiki-analize/_shared/quality.md

Входные данные:
$ARGUMENTS

Формат аргументов:
```
component: ИмяКомпонента
tests: путь/к/тестам
```

Результат **допиши в конец** файла `.claude/wiki/{component}.md`

Пример:
```
component: Link
tests: packages/react/tests/functional/Link.test.tsx
```
→ Дописать в `.claude/wiki/Link.md`
