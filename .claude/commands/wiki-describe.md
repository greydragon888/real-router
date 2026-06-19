Прочитай и выполни промпт для документирования метода.

Файлы промпта:
- packages/core/.claude/prompts/wiki-analize/prompts/1-describe-method.md
- packages/core/.claude/prompts/wiki-analize/templates/method-description.md
- packages/core/.claude/prompts/wiki-analize/_shared/role.md
- packages/core/.claude/prompts/wiki-analize/_shared/quality.md

Входные данные:
$ARGUMENTS

Формат аргументов:
```
path: путь/к/файлу.ts
method: имяМетода
tests: путь/к/тестам
output: папка/для/сохранения
```

Результат сохрани в файл `{output}/{method}.md`

Пример:
```
path: packages/core/modules/core/navigation.ts
method: navigate
tests: packages/core/tests/functional/navigation/navigate
output: packages/core/.claude/prompts/wiki-analize/output
```
→ Сохранить в `packages/core/.claude/prompts/wiki-analize/output/navigate.md`
