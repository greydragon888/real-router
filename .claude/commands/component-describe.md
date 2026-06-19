Прочитай и выполни промпт для документирования React компонента.

Файлы промпта:
- packages/react/.claude/prompts/wiki-analize/prompts/3-describe-component.md
- packages/react/.claude/prompts/wiki-analize/templates/component-description.md
- packages/react/.claude/prompts/wiki-analize/_shared/role-component.md
- packages/react/.claude/prompts/wiki-analize/_shared/quality.md

Входные данные:
$ARGUMENTS

Формат аргументов:
```
component: ИмяКомпонента
tests: путь/к/тестам
```

Результат сохрани в файл `.claude/wiki/{component}.md`

Пример:
```
component: Link
tests: packages/react/tests/functional/Link.test.tsx
```
→ Сохранить в `.claude/wiki/Link.md`
