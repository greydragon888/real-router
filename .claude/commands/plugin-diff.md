Прочитай и выполни промпт для сравнения плагина с master.

Файлы промпта:
- .claude/prompts/wiki-analize/prompts/2-compare-plugin.md
- .claude/prompts/wiki-analize/templates/plugin-diff.md
- .claude/prompts/wiki-analize/_shared/role-plugin.md
- .claude/prompts/wiki-analize/_shared/quality.md

Входные данные:
$ARGUMENTS

Формат аргументов:
```
package: путь/к/пакету/плагина
tests: путь/к/тестам
```

Результат **допиши в конец** файла `.claude/wiki/{plugin-name}.md` (после существующего содержимого)

Пример:
```
package: packages/browser-plugin
tests: packages/browser-plugin/tests
```
→ Дописать в `.claude/wiki/browser-plugin.md`
