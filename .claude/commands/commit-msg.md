Сгенерируй commit message на основе текущих изменений в git.

Шаги:
1. Выполни `git diff --stat` для обзора изменённых файлов
2. Выполни `git diff` для анализа содержимого изменений
3. Определи тип изменений (feat, fix, refactor, docs, chore, ci, test, perf)
4. Сформулируй краткое описание (50 символов max)
5. При необходимости добавь детали в body

Формат Conventional Commits:
```
<type>(<scope>): <description>

[optional body]
```

Типы:
- feat: новая функциональность
- fix: исправление бага
- refactor: рефакторинг без изменения поведения
- docs: только документация
- chore: обслуживание (deps, configs)
- ci: CI/CD изменения
- test: только тесты
- perf: оптимизация производительности

Scopes (из cz.config.js — используй приоритетно):
- Пакеты: core, core-types, route-tree, search-params, type-guards, helpers, logger
- Плагины: browser-plugin, logger-plugin, persistent-params-plugin
- Фреймворки: react
- Инфраструктура: deps, config, ci, benchmarks

Правила:
- Описание в imperative mood ("add", не "added")
- Scope — приоритетно из списка выше, можно кастомный если нужно
- Не начинай с заглавной буквы после двоеточия
- Без точки в конце description
- Body через пустую строку, каждый пункт с "- "

Примеры:
```
feat(core): add route guards support
```

```
fix(lint): add dependency check rule, fix unlinted property tests

- Add eslint rule to catch missing dependencies
- Add missing logger dependency to browser-plugin and logger-plugin
- Fix duplicate imports in property tests
```

Выведи только готовый commit message без пояснений.
