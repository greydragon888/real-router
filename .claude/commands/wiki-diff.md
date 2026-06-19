Прочитай и выполни промпт для сравнения метода с master.

Файлы промпта:
- packages/core/.claude/prompts/wiki-analize/prompts/2-compare-with-master.md
- packages/core/.claude/prompts/wiki-analize/templates/method-diff.md
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

Результат **допиши в конец** файла `{output}/{method}.md` (после существующего содержимого)

Пример:
```
path: packages/core/modules/core/navigation.ts
method: navigate
tests: packages/core/tests/functional/navigation/navigate
output: packages/core/.claude/prompts/wiki-analize/output
```
→ Сохранить в `packages/core/.claude/prompts/wiki-analize/output/navigate.md`
