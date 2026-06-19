Прочитай и выполни промпт для документирования плагина.

Файлы промпта:
- .claude/prompts/wiki-analize/prompts/1-describe-plugin.md
- .claude/prompts/wiki-analize/templates/plugin-description.md
- .claude/prompts/wiki-analize/_shared/role-plugin.md
- .claude/prompts/wiki-analize/_shared/quality.md

Входные данные:
$ARGUMENTS

Формат аргументов:
```
package: путь/к/пакету/плагина
tests: путь/к/тестам
```

Результат сохрани в файл `.claude/wiki/{plugin-name}.md`

Пример:
```
package: packages/browser-plugin
tests: packages/browser-plugin/tests
```
→ Сохранить в `.claude/wiki/browser-plugin.md`
