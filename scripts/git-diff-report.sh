#!/bin/bash

BASE_BRANCH="${1:-master}"
COMPARE_BRANCH="${2:-HEAD}"
OUTPUT_FILE="${3:-git-diff-report.md}"

# Паттерны для исключения из основной статистики (legacy/удалённый контент)
EXCLUDE_PATTERNS="^(docs|examples|unmaintained|dist)/"

# Паттерны для категоризации
CORE_PATTERN="packages/[^/]+/modules/[^_]"
TEST_PATTERN="packages/[^/]+/(tests|modules/__tests__)"
CONFIG_PATTERN="\.(json|mjs|mts|yml|yaml|sh)$|config\.|tsconfig|eslint|prettier|npmignore|gitignore|editorconfig|npmrc|^scripts/|^\.husky/|turbo\.json|\.travis\.yml"
LOCK_PATTERN="(package-lock\.json|yarn\.lock|pnpm-lock\.yaml)"

if ! git rev-parse "$BASE_BRANCH" >/dev/null 2>&1; then
  echo "Ошибка: ветка $BASE_BRANCH не существует" >&2
  exit 1
fi

# Проверка наличия cloc
if ! command -v cloc >/dev/null 2>&1; then
  echo "Ошибка: утилита 'cloc' не установлена" >&2
  echo "Установите её для работы с метриками кода:" >&2
  echo "  macOS:    brew install cloc" >&2
  echo "  Ubuntu:   sudo apt-get install cloc" >&2
  echo "  Fedora:   sudo dnf install cloc" >&2
  exit 1
fi

# Создаём временную директорию для работы с cloc
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

# Функция для подсчёта строк с фильтром
count_lines_with_filter() {
  local filter="$1"
  local column="$2" # 1=added, 2=removed
  git diff --numstat $BASE_BRANCH...$COMPARE_BRANCH | \
    grep -E "$filter" | \
    awk -v col="$column" '{sum+=$col} END {print sum+0}'
}

# Функция для подсчёта файлов с фильтром
count_files_with_filter() {
  local diff_filter="$1"
  local pattern="$2"
  git diff --diff-filter="$diff_filter" --name-only $BASE_BRANCH...$COMPARE_BRANCH | \
    grep -E "$pattern" | wc -l | tr -d ' '
}

# Функция для подсчета строк кода (без комментариев) через cloc
# Аргументы: файл, ветка (или "current" для текущей версии)
count_code_lines() {
  local file="$1"
  local branch="$2"
  local result

  if [ "$branch" = "current" ]; then
    # Текущий файл существует - читаем напрямую
    if [ -f "$file" ]; then
      result=$(cloc "$file" --quiet --csv 2>/dev/null | tail -1 | cut -d',' -f5)
    else
      result=0
    fi
  else
    # Файл из git (может быть удален в текущей версии)
    result=$(git show "$branch:$file" 2>/dev/null | \
             cloc --stdin-name="$file" --quiet --csv 2>/dev/null | \
             tail -1 | cut -d',' -f5)
  fi

  # Возвращаем 0 если cloc не смог обработать файл
  echo "${result:-0}"
}

{
  echo "## МЕТАИНФОРМАЦИЯ"
  echo ""
  echo "Дата создания: $(date '+%Y-%m-%d %H:%M:%S')"
  echo ""
  echo "Сравнение: $BASE_BRANCH...$COMPARE_BRANCH"
  echo ""
  echo "Текущая ветка: $(git branch --show-current)"
  echo ""
  echo "Commit HEAD: $(git rev-parse --short HEAD) - $(git log -1 --format=%s HEAD)"
  echo ""
  echo "Commit $BASE_BRANCH: $(git rev-parse --short $BASE_BRANCH) - $(git log -1 --format=%s $BASE_BRANCH)"
  echo ""

  echo "## ОБЩАЯ СТАТИСТИКА"
  git diff --shortstat $BASE_BRANCH...$COMPARE_BRANCH
  echo ""

  # Подсчет метрик
  TOTAL_LINES=$(git diff --numstat $BASE_BRANCH...$COMPARE_BRANCH | awk '{sum+=$1+$2} END {print sum}')
  ADDED_LINES=$(git diff --numstat $BASE_BRANCH...$COMPARE_BRANCH | awk '{sum+=$1} END {print sum}')
  REMOVED_LINES=$(git diff --numstat $BASE_BRANCH...$COMPARE_BRANCH | awk '{sum+=$2} END {print sum}')

  FILES_ADDED=$(git diff --diff-filter=A --name-only $BASE_BRANCH...$COMPARE_BRANCH | wc -l)
  FILES_DELETED=$(git diff --diff-filter=D --name-only $BASE_BRANCH...$COMPARE_BRANCH | wc -l)
  FILES_MODIFIED=$(git diff --diff-filter=M --name-only $BASE_BRANCH...$COMPARE_BRANCH | wc -l)
  FILES_RENAMED=$(git diff --diff-filter=R --name-only $BASE_BRANCH...$COMPARE_BRANCH | wc -l)
  TOTAL_FILES=$((FILES_ADDED + FILES_DELETED + FILES_MODIFIED + FILES_RENAMED))

  BASE_REPO_FILES=$(git ls-tree -r --name-only $BASE_BRANCH | wc -l)
  UNCHANGED_FILES=$((BASE_REPO_FILES - FILES_DELETED - FILES_MODIFIED - FILES_RENAMED))

  echo "### Детализация по строкам"

  if [ "$TOTAL_LINES" -gt 0 ]; then
    ADDED_PCT=$(awk "BEGIN {printf \"%.1f\", ($ADDED_LINES / $TOTAL_LINES) * 100}")
    REMOVED_PCT=$(awk "BEGIN {printf \"%.1f\", ($REMOVED_LINES / $TOTAL_LINES) * 100}")
    echo "- Добавлено: $ADDED_LINES ($ADDED_PCT%)"
    echo "- Удалено: $REMOVED_LINES ($REMOVED_PCT%)"
    echo "- Всего изменений: $TOTAL_LINES"
  else
    echo "Нет изменений"
  fi
  echo ""

  echo "### Состав изменений"
  echo "*База для расчёта: изменённые файлы ($TOTAL_FILES)*"
  echo ""

  if [ "$TOTAL_FILES" -gt 0 ]; then
    ADDED_FILES_PCT=$(awk "BEGIN {printf \"%.1f\", ($FILES_ADDED / $TOTAL_FILES) * 100}")
    DELETED_FILES_PCT=$(awk "BEGIN {printf \"%.1f\", ($FILES_DELETED / $TOTAL_FILES) * 100}")
    MODIFIED_FILES_PCT=$(awk "BEGIN {printf \"%.1f\", ($FILES_MODIFIED / $TOTAL_FILES) * 100}")
    RENAMED_FILES_PCT=$(awk "BEGIN {printf \"%.1f\", ($FILES_RENAMED / $TOTAL_FILES) * 100}")

    echo "- Новые: $FILES_ADDED ($ADDED_FILES_PCT%)"
    echo "- Удалённые: $FILES_DELETED ($DELETED_FILES_PCT%)"
    echo "- Модифицированные: $FILES_MODIFIED ($MODIFIED_FILES_PCT%)"
    echo "- Переименованные: $FILES_RENAMED ($RENAMED_FILES_PCT%)"
    echo ""

    # Вывод о составе изменений
    if (( $(echo "$DELETED_FILES_PCT > 40" | bc -l) )) && (( $(echo "$ADDED_FILES_PCT > 20" | bc -l) )); then
      echo "**💡 Вывод:** Паттерн изменений характерен для **масштабного рефакторинга**: $DELETED_FILES_PCT% удалений и $ADDED_FILES_PCT% добавлений при всего $MODIFIED_FILES_PCT% модификаций."
      echo "   - Высокое соотношение «удалено/добавлено» + низкий процент модификаций говорит о том, что старый код не правится точечно, а **заменяется новым**."
      echo "   - Это подтверждает глубокую архитектурную перестройку, а не поверхностные улучшения."
    elif (( $(echo "$MODIFIED_FILES_PCT > 50" | bc -l) )); then
      echo "**💡 Вывод:** Преобладают модификации существующих файлов ($MODIFIED_FILES_PCT%) — это эволюционное развитие без радикальной перестройки."
    else
      echo "**💡 Вывод:** Смешанный паттерн изменений с балансом между новыми файлами ($ADDED_FILES_PCT%), удалениями ($DELETED_FILES_PCT%) и модификациями ($MODIFIED_FILES_PCT%)."
    fi
  else
    echo "Нет изменений"
  fi
  echo ""

  echo "### Масштаб изменений"
  echo "*База для расчёта: все файлы в $BASE_BRANCH ($BASE_REPO_FILES)*"
  echo ""

  if [ "$BASE_REPO_FILES" -gt 0 ] && [ "$TOTAL_FILES" -gt 0 ]; then
    TOUCHED_PCT=$(awk "BEGIN {printf \"%.1f\", ($TOTAL_FILES / $BASE_REPO_FILES) * 100}")
    UNCHANGED_FILES_PCT=$(awk "BEGIN {printf \"%.1f\", ($UNCHANGED_FILES / $BASE_REPO_FILES) * 100}")

    echo "- Затронуто файлов: $TOTAL_FILES ($TOUCHED_PCT%)"
    echo "- Не затронуто: $UNCHANGED_FILES ($UNCHANGED_FILES_PCT%)"
    echo ""

    # Вывод о масштабе
    if (( $(echo "$TOUCHED_PCT > 100" | bc -l) )); then
      echo "**💡 Вывод:** Масштабные изменения - затронуто больше файлов ($TOTAL_FILES), чем было в базовой ветке ($BASE_REPO_FILES)."
      echo "Это говорит о значительной перестройке проекта с удалением legacy-кода ($FILES_DELETED файлов) и добавлением новой функциональности ($FILES_ADDED файлов)."
    elif (( $(echo "$TOUCHED_PCT > 50" | bc -l) )); then
      echo "**💡 Вывод:** Значительные изменения - затронуто более половины файлов в проекте."
    else
      echo "**💡 Вывод:** Умеренные изменения - затронута относительно небольшая часть кодовой базы."
    fi
  else
    echo "Невозможно рассчитать"
  fi
  echo ""

  # =========== КАТЕГОРИЗИРОВАННАЯ СТАТИСТИКА ===========
  echo "## КАТЕГОРИЗИРОВАННАЯ СТАТИСТИКА"
  echo ""
  echo "### 🎯 Основной код (Core)"
  echo "*Файлы в packages/*/modules/ (исключая тесты)*"
  echo ""

  CORE_ADDED=$(count_lines_with_filter "$CORE_PATTERN" 1)
  CORE_REMOVED=$(count_lines_with_filter "$CORE_PATTERN" 2)
  CORE_TOTAL=$((CORE_ADDED + CORE_REMOVED))
  CORE_FILES_NEW=$(count_files_with_filter "A" "$CORE_PATTERN")
  CORE_FILES_MOD=$(count_files_with_filter "M" "$CORE_PATTERN")
  CORE_FILES_DEL=$(count_files_with_filter "D" "$CORE_PATTERN")

  if [ "$CORE_TOTAL" -gt 0 ]; then
    echo "- Изменено строк: +$CORE_ADDED -$CORE_REMOVED (всего $CORE_TOTAL)"
    echo "- Файлов: новые $CORE_FILES_NEW | изменённые $CORE_FILES_MOD | удалённые $CORE_FILES_DEL"
    echo ""
    git diff --numstat $BASE_BRANCH...$COMPARE_BRANCH | \
      grep -E "$CORE_PATTERN" | \
      awk '{printf "  +%-6d -%-6d %s\n\n", $1, $2, $3}' | head -20
    echo ""
  else
    echo "Нет изменений в основном коде"
    echo ""
  fi

  echo "### 🧪 Тесты"
  echo "*Файлы в packages/*/tests/*"
  echo ""

  TEST_ADDED=$(count_lines_with_filter "$TEST_PATTERN" 1)
  TEST_REMOVED=$(count_lines_with_filter "$TEST_PATTERN" 2)
  TEST_TOTAL=$((TEST_ADDED + TEST_REMOVED))
  TEST_FILES_NEW=$(count_files_with_filter "A" "$TEST_PATTERN")
  TEST_FILES_MOD=$(count_files_with_filter "M" "$TEST_PATTERN")
  TEST_FILES_DEL=$(count_files_with_filter "D" "$TEST_PATTERN")

  if [ "$TEST_TOTAL" -gt 0 ]; then
    echo "- Изменено строк: +$TEST_ADDED -$TEST_REMOVED (всего $TEST_TOTAL)"
    echo "- Файлов: новые $TEST_FILES_NEW | изменённые $TEST_FILES_MOD | удалённые $TEST_FILES_DEL"
    echo ""
    git diff --numstat $BASE_BRANCH...$COMPARE_BRANCH | \
      grep -E "$TEST_PATTERN" | \
      sort -k1 -rn | \
      awk '{printf "  +%-6d -%-6d %s\n\n", $1, $2, $3}' | head -15
    echo ""

    # Вывод о тестах
    TEST_TO_CORE_RATIO=$(awk "BEGIN {printf \"%.1f\", ($TEST_ADDED / ($CORE_ADDED + 1)) }")
    if (( $(echo "$TEST_TO_CORE_RATIO > 3" | bc -l) )); then
      echo "**💡 Вывод:** Отличное покрытие тестами - добавлено $TEST_ADDED строк тестов против $CORE_ADDED строк Core кода (соотношение ${TEST_TO_CORE_RATIO}:1). Проект демонстрирует серьёзный подход к качеству."
    elif (( $(echo "$TEST_TO_CORE_RATIO > 1" | bc -l) )); then
      echo "**💡 Вывод:** Хорошее покрытие тестами - тестов добавлено больше, чем Core кода (соотношение ${TEST_TO_CORE_RATIO}:1)."
    else
      echo "**💡 Вывод:** Умеренное покрытие тестами - соотношение test/core составляет ${TEST_TO_CORE_RATIO}:1."
    fi
    echo ""
  else
    echo "Нет изменений в тестах"
    echo ""
  fi

  echo "### ⚙️ Конфигурация и инфраструктура"
  echo "*package.json, tsconfig, eslint, scripts, etc. (БЕЗ lock-файлов)*"
  echo ""

  # Считаем CONFIG без lock-файлов
  CONFIG_ADDED=$(git diff --numstat $BASE_BRANCH...$COMPARE_BRANCH | grep -E "$CONFIG_PATTERN" | grep -v -E "$LOCK_PATTERN" | awk '{sum+=$1} END {print sum+0}')
  CONFIG_REMOVED=$(git diff --numstat $BASE_BRANCH...$COMPARE_BRANCH | grep -E "$CONFIG_PATTERN" | grep -v -E "$LOCK_PATTERN" | awk '{sum+=$2} END {print sum+0}')
  CONFIG_TOTAL=$((CONFIG_ADDED + CONFIG_REMOVED))
  CONFIG_FILES_NEW=$(git diff --diff-filter="A" --name-only $BASE_BRANCH...$COMPARE_BRANCH | grep -E "$CONFIG_PATTERN" | grep -v -E "$LOCK_PATTERN" | wc -l | tr -d ' ')
  CONFIG_FILES_MOD=$(git diff --diff-filter="M" --name-only $BASE_BRANCH...$COMPARE_BRANCH | grep -E "$CONFIG_PATTERN" | grep -v -E "$LOCK_PATTERN" | wc -l | tr -d ' ')

  if [ "$CONFIG_TOTAL" -gt 0 ]; then
    echo "- Изменено строк: +$CONFIG_ADDED -$CONFIG_REMOVED (всего $CONFIG_TOTAL)"
    echo "- Файлов: новые $CONFIG_FILES_NEW | изменённые $CONFIG_FILES_MOD"
    echo ""
    git diff --numstat $BASE_BRANCH...$COMPARE_BRANCH | \
      grep -E "$CONFIG_PATTERN" | \
      grep -v "package-lock.json" | \
      awk '{printf "  +%-6d -%-6d %s\n\n", $1, $2, $3}' | head -20
    echo ""
  else
    echo "Нет изменений в конфигах"
    echo ""
  fi

  echo "### 🔒 Lock-файлы (исключены из основной статистики)"
  echo "*package-lock.json, yarn.lock, etc.*"
  echo ""

  LOCK_ADDED=$(count_lines_with_filter "$LOCK_PATTERN" 1)
  LOCK_REMOVED=$(count_lines_with_filter "$LOCK_PATTERN" 2)
  LOCK_TOTAL=$((LOCK_ADDED + LOCK_REMOVED))
  LOCK_FILES=$(git diff --name-only $BASE_BRANCH...$COMPARE_BRANCH | grep -E "$LOCK_PATTERN" | wc -l | tr -d ' ')

  if [ "$LOCK_TOTAL" -gt 0 ]; then
    echo "- Изменено строк: +$LOCK_ADDED -$LOCK_REMOVED (всего $LOCK_TOTAL)"
    echo "- Файлов: $LOCK_FILES"
    echo ""
    git diff --numstat $BASE_BRANCH...$COMPARE_BRANCH | \
      grep -E "$LOCK_PATTERN" | \
      awk '{printf "  +%-6d -%-6d %s\n\n", $1, $2, $3}'
    echo ""
  else
    echo "Нет изменений в lock-файлах"
    echo ""
  fi

  echo "### 🗑️ Удалённый legacy-контент"
  echo "*docs/, examples/, unmaintained/, dist/*"
  echo ""

  LEGACY_REMOVED=0  # git diff --numstat не показывает deleted файлы
  LEGACY_FILES_DEL=$(count_files_with_filter "D" "$EXCLUDE_PATTERNS")

  if [ "$LEGACY_FILES_DEL" -gt 0 ]; then
    echo "- Удалено файлов: $LEGACY_FILES_DEL"
    echo "- Удалено строк: *подсчёт недоступен для deleted файлов*"
    echo ""
    echo "Удалённые директории:"
    git diff --diff-filter=D --name-only $BASE_BRANCH...$COMPARE_BRANCH | \
      grep -E "$EXCLUDE_PATTERNS" | \
      awk -F'/' '{print "  - " $1}' | sort -u
    echo ""
  else
    echo "Нет удалённого legacy-контента"
    echo ""
  fi

  echo "### 📊 Сводка категорий"
  echo ""

  # Подсчёт с lock-файлами
  ALL_CATEGORIZED=$((CORE_TOTAL + TEST_TOTAL + CONFIG_TOTAL + LOCK_TOTAL + LEGACY_REMOVED))
  if [ "$TOTAL_LINES" -gt 0 ]; then
    CORE_PCT=$(awk "BEGIN {printf \"%.1f\", ($CORE_TOTAL / $TOTAL_LINES) * 100}")
    TEST_PCT=$(awk "BEGIN {printf \"%.1f\", ($TEST_TOTAL / $TOTAL_LINES) * 100}")
    CONFIG_PCT=$(awk "BEGIN {printf \"%.1f\", ($CONFIG_TOTAL / $TOTAL_LINES) * 100}")
    LOCK_PCT=$(awk "BEGIN {printf \"%.1f\", ($LOCK_TOTAL / $TOTAL_LINES) * 100}")
    OTHER_LINES=$((TOTAL_LINES - ALL_CATEGORIZED))
    OTHER_PCT=$(awk "BEGIN {printf \"%.1f\", ($OTHER_LINES / $TOTAL_LINES) * 100}")

    echo "**Все изменения (включая lock-файлы):**"
    echo ""
    echo "| Категория | Строки | % от всех |"
    echo "|-----------|--------|-----------|"
    echo "| 🎯 Core | $CORE_TOTAL | $CORE_PCT% |"
    echo "| 🧪 Тесты | $TEST_TOTAL | $TEST_PCT% |"
    echo "| ⚙️ Конфиги | $CONFIG_TOTAL | $CONFIG_PCT% |"
    echo "| 🔒 Lock-файлы | $LOCK_TOTAL | $LOCK_PCT% |"
    if [ "$OTHER_LINES" -gt 0 ]; then
      echo "| 📦 Прочее | $OTHER_LINES | $OTHER_PCT% |"
    fi
    echo "| **ВСЕГО** | **$TOTAL_LINES** | **100%** |"
    echo ""

    # Подсчёт БЕЗ lock-файлов
    MEANINGFUL_TOTAL=$((TOTAL_LINES - LOCK_TOTAL))
    if [ "$MEANINGFUL_TOTAL" -gt 0 ]; then
      CORE_PCT_CLEAN=$(awk "BEGIN {printf \"%.1f\", ($CORE_TOTAL / $MEANINGFUL_TOTAL) * 100}")
      TEST_PCT_CLEAN=$(awk "BEGIN {printf \"%.1f\", ($TEST_TOTAL / $MEANINGFUL_TOTAL) * 100}")
      CONFIG_PCT_CLEAN=$(awk "BEGIN {printf \"%.1f\", ($CONFIG_TOTAL / $MEANINGFUL_TOTAL) * 100}")
      OTHER_CLEAN=$((MEANINGFUL_TOTAL - CORE_TOTAL - TEST_TOTAL - CONFIG_TOTAL))
      OTHER_PCT_CLEAN=$(awk "BEGIN {printf \"%.1f\", ($OTHER_CLEAN / $MEANINGFUL_TOTAL) * 100}")

      echo "**Значимые изменения (БЕЗ lock-файлов):**"
      echo ""
      echo "| Категория | Строки | % от значимых |"
      echo "|-----------|--------|---------------|"
      echo "| 🎯 Core | $CORE_TOTAL | $CORE_PCT_CLEAN% |"
      echo "| 🧪 Тесты | $TEST_TOTAL | $TEST_PCT_CLEAN% |"
      echo "| ⚙️ Конфиги | $CONFIG_TOTAL | $CONFIG_PCT_CLEAN% |"
      if [ "$OTHER_CLEAN" -gt 0 ]; then
        echo "| 📦 Прочее | $OTHER_CLEAN | $OTHER_PCT_CLEAN% |"
      fi
      echo "| **ВСЕГО** | **$MEANINGFUL_TOTAL** | **100%** |"
      echo ""

      # Подсчёт БЕЗ тестов И lock-файлов (чистый code + config)
      CODE_AND_CONFIG=$((MEANINGFUL_TOTAL - TEST_TOTAL))
      if [ "$CODE_AND_CONFIG" -gt 0 ]; then
        CORE_PCT_NO_TESTS=$(awk "BEGIN {printf \"%.1f\", ($CORE_TOTAL / $CODE_AND_CONFIG) * 100}")
        CONFIG_PCT_NO_TESTS=$(awk "BEGIN {printf \"%.1f\", ($CONFIG_TOTAL / $CODE_AND_CONFIG) * 100}")
        OTHER_NO_TESTS=$((CODE_AND_CONFIG - CORE_TOTAL - CONFIG_TOTAL))
        OTHER_PCT_NO_TESTS=$(awk "BEGIN {printf \"%.1f\", ($OTHER_NO_TESTS / $CODE_AND_CONFIG) * 100}")

        echo "**Production код (БЕЗ тестов И lock-файлов):**"
        echo ""
        echo "| Категория | Строки | % от production |"
        echo "|-----------|--------|-----------------|"
        echo "| 🎯 Core | $CORE_TOTAL | $CORE_PCT_NO_TESTS% |"
        echo "| ⚙️ Конфиги | $CONFIG_TOTAL | $CONFIG_PCT_NO_TESTS% |"
        if [ "$OTHER_NO_TESTS" -gt 0 ]; then
          echo "| 📦 Прочее | $OTHER_NO_TESTS | $OTHER_PCT_NO_TESTS% |"
        fi
        echo "| **ВСЕГО** | **$CODE_AND_CONFIG** | **100%** |"
      fi
    fi
  fi
  echo ""

  # Вывод о категориях
  if [ "$LOCK_TOTAL" -gt 0 ] && [ "$TOTAL_LINES" -gt 0 ]; then
    echo "**💡 Вывод о категориях:**"
    echo ""
    echo "Три таблицы выше раскрывают истинную природу изменений через последовательную фильтрацию шума:"
    echo ""
    echo "1. **Lock-файлы как шум:** $LOCK_PCT% ($LOCK_TOTAL строк) — это технический артефакт смены пакетного менеджера, не связанный с логикой кода."
    echo ""
    echo "2. **Эволюция процента Core кода:** $CORE_PCT% → $CORE_PCT_CLEAN% → $CORE_PCT_NO_TESTS%"
    echo "   - Рост с $CORE_PCT% до $CORE_PCT_NO_TESTS% показывает, что почти **половина production-кода была значительно изменена**."
    echo "   - Это не косметические правки — это фундаментальная эволюция архитектуры."
    echo ""
    TEST_TO_PROD_RATIO=$(awk -v test="$TEST_TOTAL" -v core="$CORE_TOTAL" -v config="$CONFIG_TOTAL" 'BEGIN {printf "%.1f", test / (core + config + 1)}')
    echo "3. **Тесты как индикатор качества:** $TEST_PCT_CLEAN% в значимых изменениях означает, что на каждую строку production-кода приходится в среднем ${TEST_TO_PROD_RATIO}x строк тестов."
    echo "   - Проект не просто переписывается — он **покрывается комплексными тестами**."
    echo ""
    echo "4. **Структура production-кода:** Core ($CORE_PCT_NO_TESTS%) + Config ($CONFIG_PCT_NO_TESTS%)"
    echo "   - Core доминирует, что подтверждает: это **рефакторинг бизнес-логики**, а не только настройка инфраструктуры."
    echo ""
  fi

  echo "### 📦 Разбивка по пакетам"
  echo ""
  echo "**Изменения в каждом пакете (БЕЗ lock-файлов):**"
  echo ""
  echo "*⚠️ Метрики учитывают только строки кода (без комментариев и пустых строк)*"
  echo ""

  # Получаем списки пакетов из обеих веток
  PACKAGES_BASE=$(git ls-tree -r --name-only $BASE_BRANCH | grep "^packages/" | cut -d'/' -f2 | sort -u)
  PACKAGES_HEAD=$(git ls-tree -r --name-only HEAD | grep "^packages/" | cut -d'/' -f2 | sort -u)

  # Проверяем, какие пакеты новые (в HEAD, но не в BASE)
  NEW_PACKAGES=$(comm -13 <(echo "$PACKAGES_BASE") <(echo "$PACKAGES_HEAD") | tr '\n' '|' | sed 's/|$//')

  # Проверяем, какие пакеты удалены (в BASE, но не в HEAD)
  DELETED_PACKAGES=$(comm -23 <(echo "$PACKAGES_BASE") <(echo "$PACKAGES_HEAD") | tr '\n' '|' | sed 's/|$//')

  # Собираем данные о полностью удалённых Core файлах для каждого пакета
  DELETED_CORE_DATA=$(git diff --diff-filter=D --name-only $BASE_BRANCH...$COMPARE_BRANCH | \
    grep "^packages/" | grep "/modules/" | grep -v "test" | grep -v "package-lock\|yarn.lock" | \
    while read deleted_file; do
      pkg=$(echo "$deleted_file" | cut -d'/' -f2)
      temp_file="$TEMP_DIR/deleted_$(basename $deleted_file)"
      git show $BASE_BRANCH:"$deleted_file" > "$temp_file" 2>/dev/null
      lines=$(cloc "$temp_file" --quiet --csv 2>/dev/null | tail -1 | cut -d',' -f5)
      rm -f "$temp_file"
      if [ -n "$lines" ] && [ "$lines" != "0" ]; then
        # Format: pkg:core_lines:test_lines:config_lines
        is_test=0
        is_core=0
        is_config=0
        if echo "$deleted_file" | grep -q "/tests/\|/__tests__/"; then
          is_test=1
        elif echo "$deleted_file" | grep -q "/modules/"; then
          is_core=1
        else
          is_config=1
        fi
        echo "$pkg:$is_core:$is_test:$is_config:$lines"
      fi
    done | awk -F: '{
      pkg_data[$1"_core"] += $2 * $5
      pkg_data[$1"_test"] += $3 * $5
      pkg_data[$1"_config"] += $4 * $5
    }
    END {
      for (key in pkg_data) {
        print key "=" pkg_data[key]
      }
    }' | tr '\n' ';' | sed 's/;$//')

  # Собираем данные о ВСЕХ Core и Test файлах из базовой ветки для расчета покрытия
  echo "Подсчёт базовых метрик из ветки $BASE_BRANCH..." >&2
  ALL_BASE_FILES_DATA=$(git ls-tree -r --name-only $BASE_BRANCH | \
    grep "^packages/" | grep -v "package-lock\|yarn.lock" | \
    while read base_file; do
      pkg=$(echo "$base_file" | cut -d'/' -f2)
      # Определяем тип файла
      is_test=0
      is_core=0
      if echo "$base_file" | grep -q "/tests/\|/__tests__/"; then
        is_test=1
      elif echo "$base_file" | grep -q "/modules/" && ! echo "$base_file" | grep -q "/modules/__tests__/"; then
        is_core=1
      fi

      # Обрабатываем только Core и Test файлы
      if [ "$is_test" = "1" ] || [ "$is_core" = "1" ]; then
        temp_file="$TEMP_DIR/base_all_$(basename $base_file)"
        git show $BASE_BRANCH:"$base_file" > "$temp_file" 2>/dev/null
        if [ -s "$temp_file" ]; then
          lines=$(cloc "$temp_file" --quiet --csv 2>/dev/null | tail -1 | cut -d',' -f5)
          if [ -n "$lines" ] && [ "$lines" != "0" ]; then
            echo "$pkg:$is_core:$is_test:$lines"
          fi
        fi
        rm -f "$temp_file"
      fi
    done | awk -F: '{
      pkg_data[$1"_core"] += $2 * $4
      pkg_data[$1"_test"] += $3 * $4
    }
    END {
      for (key in pkg_data) {
        print key "=" pkg_data[key]
      }
    }' | tr '\n' ';' | sed 's/;$//')

  # Подсчитываем общее количество файлов для прогресс-бара
  TOTAL_FILES_TO_PROCESS=$(git diff --numstat $BASE_BRANCH...$COMPARE_BRANCH | wc -l | tr -d ' ')

  # Собираем статистику по пакетам используя cloc для точного подсчета кода
  git diff --numstat $BASE_BRANCH...$COMPARE_BRANCH | \
    awk -v new_pkgs="$NEW_PACKAGES" -v deleted_pkgs="$DELETED_PACKAGES" -v base_branch="$BASE_BRANCH" -v compare_branch="$COMPARE_BRANCH" -v temp_dir="$TEMP_DIR" -v deleted_data="$DELETED_CORE_DATA" -v all_base_data="$ALL_BASE_FILES_DATA" -v total_files="$TOTAL_FILES_TO_PROCESS" '
    BEGIN {
      file_counter = 0
      processed_counter = 0
      quote = "\""

      # Парсим данные о ВСЕХ файлах из базовой ветки для расчета покрытия
      # Формат: "router5_core=1234;router5_test=5678;react-router5_core=456"
      if (all_base_data != "") {
        split(all_base_data, base_pairs, ";")
        for (i in base_pairs) {
          if (base_pairs[i] == "") continue
          split(base_pairs[i], kv, "=")
          if (length(kv) != 2) continue

          key = kv[1]
          value = kv[2] + 0

          # Определяем тип: key имеет формат "pkg_type" (например "router5_core")
          if (key ~ /_core$/) {
            pkg_name = key
            sub(/_core$/, "", pkg_name)
            core_original[pkg_name] = value  # Используем = вместо +=, так как это полные данные
          } else if (key ~ /_test$/) {
            pkg_name = key
            sub(/_test$/, "", pkg_name)
            test_original[pkg_name] = value
          }
        }
      }

      # Парсим данные о полностью удалённых файлах для gross_removed
      # Формат: "router5_core=93;react-router5_core=116;router5_test=25"
      # NOTE: core_original и test_original уже инициализированы из all_base_data
      if (deleted_data != "") {
        split(deleted_data, deleted_pairs, ";")
        for (i in deleted_pairs) {
          if (deleted_pairs[i] == "") continue
          split(deleted_pairs[i], kv, "=")
          if (length(kv) != 2) continue

          key = kv[1]
          value = kv[2] + 0

          # Определяем тип: key имеет формат "pkg_type" (например "router5_core")
          if (key ~ /_core$/) {
            pkg_name = key
            sub(/_core$/, "", pkg_name)
            # Полностью удаленные файлы - это gross_removed!
            core_gross_removed[pkg_name] += value
          } else if (key ~ /_test$/) {
            pkg_name = key
            sub(/_test$/, "", pkg_name)
            test_gross_removed[pkg_name] += value
          } else if (key ~ /_config$/) {
            pkg_name = key
            sub(/_config$/, "", pkg_name)
            config_gross_removed[pkg_name] += value
          }
        }
      }
    }
    $3 ~ /^packages\// && $3 !~ /(package-lock\.json|yarn\.lock)/ {
      split($3, path, "/")
      pkg = path[2]
      file = $3

      # Проверяем, является ли это полностью удалённым файлом (added=0 в numstat)
      # Такие файлы уже учтены в core_original через DELETED_CORE_DATA
      is_fully_deleted = ($1 == 0)

      # Проверяем, является ли это Modified файлом (есть и добавления, и удаления)
      is_modified = ($1 > 0 && $2 > 0)

      # Получаем расширение файла для временных файлов
      ext = file
      gsub(/.*\./, ".", ext)

      # Создаем временные файлы с правильными расширениями
      file_counter++
      temp_base = temp_dir "/base_" file_counter ext

      # Сохраняем base version во временный файл и запускаем cloc
      cmd_save_base = "git show " base_branch ":" $3 " 2>/dev/null > " temp_base
      system(cmd_save_base)

      # Извлекаем код И комментарии из base версии
      code_base = 0
      comments_base = 0
      cloc_line_base = ""  # Reset to prevent reusing old value
      cmd_cloc_base = "cloc " temp_base " --quiet --csv 2>/dev/null | tail -1"
      if ((cmd_cloc_base | getline cloc_line_base) > 0) {
        close(cmd_cloc_base)
        split(cloc_line_base, fields_base, ",")
        comments_base = fields_base[4] + 0  # column 4 = comments
        code_base = fields_base[5] + 0       # column 5 = code
      } else {
        close(cmd_cloc_base)
      }

      # НЕ удаляем temp_base здесь - он понадобится для is_docs секции!
      # Удалим его позже, после обработки всех категорий

      # Обрабатываем текущую версию
      code_current = 0
      comments_current = 0
      if (system("[ -f \"" $3 "\" ]") == 0) {
        cloc_line_current = ""  # Reset to prevent reusing old value
        cmd_cloc_current = "cloc \"" $3 "\" --quiet --csv 2>/dev/null | tail -1"
        if ((cmd_cloc_current | getline cloc_line_current) > 0) {
          close(cmd_cloc_current)
          split(cloc_line_current, fields_current, ",")
          comments_current = fields_current[4] + 0
          code_current = fields_current[5] + 0
        } else {
          close(cmd_cloc_current)
        }
      }

      # Вычисляем NET изменения для кода (для общей статистики)
      if (code_current > code_base) {
        added = code_current - code_base
        removed = 0
      } else if (code_base > code_current) {
        added = 0
        removed = code_base - code_current
      } else {
        # Одинаковое количество строк кода - возможно только комментарии изменились
        added = 0
        removed = 0
      }

      lines = added + removed

      # Вычисляем NET изменения для комментариев
      if (comments_current > comments_base) {
        comments_added = comments_current - comments_base
        comments_removed = 0
      } else if (comments_base > comments_current) {
        comments_added = 0
        comments_removed = comments_base - comments_current
      } else {
        comments_added = 0
        comments_removed = 0
      }

      # Для Modified файлов вычисляем GROSS удаления (реально удаленные строки в diff)
      # Это важно для метрики "% переписанного кода"
      #
      # ИСПРАВЛЕНИЕ БАГА: вместо cloc на diff-фрагментах используем ПОЛНЫЕ файлы
      # Причина: cloc на фрагментах дает неточные результаты (43 вместо 46, 49 вместо 46)
      # Решение: для MODIFIED файлов GROSS = code_base и code_current из полных файлов
      gross_removed = 0
      gross_added = 0
      gross_comments_removed = 0
      gross_comments_added = 0
      if (is_modified) {
        file_counter++
        temp_deleted = temp_dir "/deleted_" file_counter ext
        temp_added = temp_dir "/added_" file_counter ext

        # Для MODIFIED файлов используем ПОЛНЫЕ файлы вместо diff-фрагментов
        # GROSS показывает истинный масштаб изменений:
        # - GROSS_removed = весь код в base версии файла
        # - GROSS_added = весь код в current версии файла
        # Это правильно отражает "сколько кода было переписано"
        gross_removed = code_base
        gross_added = code_current
        gross_comments_removed = comments_base
        gross_comments_added = comments_current

        # Сохраняем temp_deleted и temp_added для обработки docs ниже
        # Извлекаем удаленные строки из diff (нужно только для docs)
        cmd_extract_deleted = "git diff " base_branch "..." compare_branch " -- " $3 " 2>/dev/null | grep '^-' | grep -v '^---' | sed 's/^-//' > " temp_deleted
        system(cmd_extract_deleted)

        # Извлекаем добавленные строки из diff (нужно только для docs)
        cmd_extract_added = "git diff " base_branch "..." compare_branch " -- " $3 " 2>/dev/null | grep '^+' | grep -v '^+++' | sed 's/^+//' > " temp_added
        system(cmd_extract_added)
      }

      # Определяем категорию файла (используем оригинальный путь $3)
      is_test = ($3 ~ /packages\/[^\/]+\/(tests|modules\/__tests__)/)
      is_core = ($3 ~ /packages\/[^\/]+\/modules\/[^_]/)
      is_docs = ($3 ~ /README\.md|CHANGELOG\.md|CONTRIBUTING\.md|LICENSE/)
      is_config = !is_test && !is_core && !is_docs

      if (is_test) {
        test[pkg] += lines
        test_added[pkg] += added
        test_removed[pkg] += removed
        # Gross changes для тестов
        if (is_modified) {
          test_gross_removed[pkg] += gross_removed
          test_gross_added[pkg] += gross_added
        } else if (!is_fully_deleted) {
          # Для новых тестов (НЕ для полностью удаленных!)
          # Полностью удаленные уже учтены в BEGIN block
          if (added > 0) {
            test_gross_added[pkg] += added
          }
        }
      } else if (is_core) {
        core[pkg] += lines
        core_added[pkg] += added
        core_removed[pkg] += removed
        # Gross changes для Core - это ключевая метрика!
        if (is_modified) {
          core_gross_removed[pkg] += gross_removed
          core_gross_added[pkg] += gross_added
          core_comments_gross_removed[pkg] += gross_comments_removed
          core_comments_gross_added[pkg] += gross_comments_added
        } else if (!is_fully_deleted) {
          # Для новых файлов (НЕ для полностью удаленных!)
          # Полностью удаленные файлы уже учтены в BEGIN block через DELETED_CORE_DATA
          if (added > 0) {
            core_gross_added[pkg] += added
            core_comments_gross_added[pkg] += comments_added
          }
        }

        # Отслеживаем комментарии для расчета документированности
        core_comments_base[pkg] += comments_base
        core_comments_current[pkg] += comments_current
      } else if (is_docs) {
        docs[pkg] += lines
        docs_added[pkg] += added
        docs_removed[pkg] += removed

        # Для docs файлов считаем ВСЕ строки (не только код), так как в README важен весь контент
        # Подсчитываем оригинальный размер (все строки в base version)
        if (!is_fully_deleted) {
          docs_original_lines = 0
          cmd_count_base = "awk " quote "END {print NR}" quote " " temp_base " 2>/dev/null"
          if ((cmd_count_base | getline docs_original_lines) > 0) {
            close(cmd_count_base)
            docs_original[pkg] += docs_original_lines + 0
          } else {
            close(cmd_count_base)
          }
        }

        # Gross changes для документации - показываем реально измененные строки
        # ИСПРАВЛЕНИЕ: для MODIFIED файлов используем только измененные строки из diff,
        # а не полные файлы (как для Core кода), так как для документации важно показать
        # истинный масштаб изменений, а не весь файл
        if (is_modified) {
          # Для MODIFIED файлов используем temp_deleted и temp_added,
          # которые уже созданы выше и содержат только измененные строки из diff
          docs_gross_removed_lines = 0
          cmd_count_deleted = "awk " quote "END {print NR}" quote " " temp_deleted " 2>/dev/null"
          if ((cmd_count_deleted | getline docs_gross_removed_lines) > 0) {
            close(cmd_count_deleted)
          } else {
            close(cmd_count_deleted)
            docs_gross_removed_lines = 0
          }

          # Для added используем temp_added (реально добавленные строки из diff)
          docs_gross_added_lines = 0
          cmd_count_added = "awk " quote "END {print NR}" quote " " temp_added " 2>/dev/null"
          if ((cmd_count_added | getline docs_gross_added_lines) > 0) {
            close(cmd_count_added)
          } else {
            close(cmd_count_added)
            docs_gross_added_lines = 0
          }

          docs_gross_removed[pkg] += docs_gross_removed_lines + 0
          docs_gross_added[pkg] += docs_gross_added_lines + 0
        } else if (!is_fully_deleted) {
          # Для новых docs файлов gross_added = все строки в файле
          docs_gross_added_lines = 0
          cmd_count_current = "[ -f \"" $3 "\" ] && awk " quote "END {print NR}" quote " \"" $3 "\" 2>/dev/null"
          if ((cmd_count_current | getline docs_gross_added_lines) > 0) {
            close(cmd_count_current)
            docs_gross_added[pkg] += docs_gross_added_lines + 0
          } else {
            close(cmd_count_current)
          }
        }
      } else {
        config[pkg] += lines
        config_added[pkg] += added
        config_removed[pkg] += removed
      }

      # Удаляем временные файлы после обработки ВСЕХ категорий
      # temp_base создается для всех файлов, поэтому удаляем его всегда
      system("rm -f " temp_base)
      # temp_deleted и temp_added создаются только для modified файлов
      if (is_modified) {
        system("rm -f " temp_deleted " " temp_added)
      }

      # NOTE: core_original и test_original уже инициализированы из all_base_data в BEGIN блоке
      # Они содержат ПОЛНЫЕ размеры всех Core и Test файлов из базовой ветки
      # docs_original считается напрямую в секции is_docs (все строки, не только код)

      total[pkg] += lines

      # Запоминаем новые пакеты (точное совпадение с разделителями)
      pkg_pattern = "(^|\\|)" pkg "(\\||$)"
      if (new_pkgs ~ pkg_pattern) {
        is_new[pkg] = 1
      }

      # Запоминаем удаленные пакеты (точное совпадение с разделителями)
      if (deleted_pkgs ~ pkg_pattern) {
        is_deleted[pkg] = 1
      }

      # Показываем прогресс обработки
      processed_counter++
      if (processed_counter % 5 == 0 || processed_counter == total_files) {
        percent = int(processed_counter * 100 / total_files)
        printf "\rОбработано: %d/%d файлов (%d%%)...", processed_counter, total_files, percent > "/dev/stderr"
      }
    }
    END {
      # Завершаем строку прогресса
      printf "\rОбработано: %d/%d файлов (100%%) - готово!\n", total_files, total_files > "/dev/stderr"
      # Сортируем пакеты по общему объёму изменений
      n = 0
      for (pkg in total) {
        packages[n] = pkg
        n++
      }

      # Bubble sort по total[pkg]
      for (i = 0; i < n; i++) {
        for (j = i + 1; j < n; j++) {
          if (total[packages[i]] < total[packages[j]]) {
            tmp = packages[i]
            packages[i] = packages[j]
            packages[j] = tmp
          }
        }
      }

      # Выводим таблицу
      print "| Пакет | Production (Core+Config) | Тесты | Всего | Core от Prod | Характер изменений |"
      print "|-------|--------------------------|-------|-------|--------------|-------------------|"

      for (i = 0; i < n; i++) {
        pkg = packages[i]
        production = core[pkg] + config[pkg]
        core_pct_from_prod = production > 0 ? (core[pkg] / production * 100) : 0

        # Для характеристики тестов используем net changes (добавлено - удалено)
        # Это показывает: "в диффе тестов добавилось больше, чем кода"
        test_net = test_added[pkg] - test_removed[pkg]
        production_net = (core_added[pkg] - core_removed[pkg]) + (config_added[pkg] - config_removed[pkg])
        test_to_prod_ratio = production_net > 0 ? (test_net / production_net) : 0

        # Определяем иконку для имени пакета
        if (is_new[pkg]) {
          pkg_name = "🆕 " pkg
        } else if (is_deleted[pkg]) {
          pkg_name = "🗑️ " pkg
        } else {
          pkg_name = pkg
        }

        # Генерируем краткую характеристику
        # Для удалённых пакетов не анализируем - сам факт удаления и есть их характеристика
        if (is_deleted[pkg]) {
          characteristics = "-"
        } else {
          characteristics = ""

          # Анализ фокуса (Core vs Config)
          # Специальная логика для новых пакетов: если есть Core код, это не "Конфиги"
          # Для существующих: если Core >= Config, то это тоже не "Конфиги"
          if (core_pct_from_prod >= 85) {
            characteristics = "🎯 Логика"
          } else if (core_pct_from_prod >= 60 || core[pkg] >= config[pkg] || (is_new[pkg] && core[pkg] > 0)) {
            characteristics = "🎯 Логика+конфиг"
          } else {
            characteristics = "⚙️ Конфиги"
          }

          # Анализ покрытия тестами (на основе net changes в диффе)
          if (test_to_prod_ratio >= 2.0) {
            characteristics = characteristics ", ✅ тесты"
          } else if (test_to_prod_ratio >= 1.0) {
            characteristics = characteristics ", ✓ тесты"
          } else if (test_to_prod_ratio < 0.5) {
            characteristics = characteristics ", ⚠️ мало тестов"
          }

          # Анализ масштаба
          if (total[pkg] >= 10000) {
            characteristics = characteristics ", 📊 крупный"
          }
        }

        printf "| %s | %d (%d+%d) | %d | **%d** | **%.1f%%** | %s |\n",
          pkg_name, production, core[pkg]+0, config[pkg]+0, test[pkg]+0, total[pkg], core_pct_from_prod, characteristics
      }

      print ""
      print "**Детальная разбивка по всем пакетам:**"
      print "*Исключены полностью удалённые пакеты (без добавлений)*"
      print ""
      print "⚠️ **Важно:** Все метрики ниже показывают **только код** (строки без комментариев и пустых строк), подсчитанный через `cloc`."
      print "   - **Core: +X -Y** — это GROSS изменения (реально добавленный/удаленный код в git diff)"
      print "   - **% от оригинала** — какая доля исходного кода была физически удалена при рефакторинге"
      print "   - **Core от production** — доля Core кода от всего production кода (Core + Config). Показывает фокус изменений. Считается без документации и тестов."
      print "   - **Документированность: X% → Y%** — соотношение (комментарии / код) × 100% в base и current версиях. Показывает качество документирования. >100% означает, что комментариев больше, чем кода (это нормально для хорошо документированного кода)."
      print "   - **Покрытие: X% → Y%** — соотношение (тесты / код) × 100% в base и current версиях. Показывает, сколько строк тестов приходится на строку кода. >100% означает, что тестов больше, чем кода (отлично для хорошо протестированного проекта)."
      print ""

      detailed_count = 0
      for (i = 0; i < n; i++) {
        pkg = packages[i]

        # Пропускаем полностью удалённые пакеты (где ничего не добавлено)
        if (core_added[pkg] == 0 && test_added[pkg] == 0 && config_added[pkg] == 0) {
          continue
        }

        detailed_count++
        production = core[pkg] + config[pkg]
        core_pct_from_prod = production > 0 ? (core[pkg] / production * 100) : 0
        core_pct_from_total = total[pkg] > 0 ? (core[pkg] / total[pkg] * 100) : 0
        test_pct_from_total = total[pkg] > 0 ? (test[pkg] / total[pkg] * 100) : 0
        config_pct_from_total = total[pkg] > 0 ? (config[pkg] / total[pkg] * 100) : 0

        new_label = is_new[pkg] ? " 🆕 [НОВЫЙ]" : ""

        # Вычисляем процент переписанности от оригинала
        # ВАЖНО: используем gross_removed - сколько РЕАЛЬНО было удалено строк кода
        # (а не NET изменение), чтобы показать истинный масштаб переписывания
        rewrite_from_original = 0
        if (core_original[pkg] > 0 && core_gross_removed[pkg] > 0) {
          rewrite_from_original = (core_gross_removed[pkg] / core_original[pkg]) * 100
        }

        # Определяем, было ли переписывание:
        # 1. Обычный rewrite: removed > 40% от added (много удалений относительно добавлений) - используем GROSS значения!
        # 2. Архитектурный rewrite: removed >= 30 строк И expansion >= 10x (малый код → большая архитектура)
        # 3. Значительный рефакторинг: removed >= 40 строк И expansion >= 5x (существенное переписывание + расширение)
        #    Этот критерий улавливает случаи, когда удалено много строк в абсолютном значении
        #    (например, 75% от исходного файла), даже если это меньше добавленного
        # 4. Переписывание от оригинала: > 50% оригинального кода было удалено (используем gross!)
        rewrite_ratio = core_gross_added[pkg] > 0 ? (core_gross_removed[pkg] / core_gross_added[pkg]) : 0
        expansion_ratio = core_gross_removed[pkg] > 0 ? (core_gross_added[pkg] / core_gross_removed[pkg]) : 0

        is_regular_rewrite = rewrite_ratio > 0.4
        is_architectural_rewrite = (core_removed[pkg] >= 30 && expansion_ratio >= 10)
        is_significant_refactor = (core_removed[pkg] >= 40 && expansion_ratio >= 5 && expansion_ratio < 10)
        is_rewrite_from_original = (rewrite_from_original > 50)
        is_rewrite = is_regular_rewrite || is_architectural_rewrite || is_significant_refactor || is_rewrite_from_original

        rewrite_label = is_rewrite ? " 🔄 [ПЕРЕПИСАН]" : ""

        printf "%d. **%s**%s%s (%d строк всего)\n", detailed_count, pkg, new_label, rewrite_label, total[pkg]

        # Показываем GROSS изменения (реальное количество добавленного/удаленного кода)
        # а не NET (итоговое изменение размера), так как GROSS показывает истинный масштаб переписывания
        gross_added_display = core_gross_added[pkg] > 0 ? core_gross_added[pkg] : core_added[pkg]
        gross_removed_display = core_gross_removed[pkg] > 0 ? core_gross_removed[pkg] : core_removed[pkg]

        printf "   - **Core:** +%d -%d строк", gross_added_display, gross_removed_display

        # Показываем детали переписывания
        # ВАЖНО: порядок проверок имеет значение! Проверяем от более специфичного к общему
        if (is_rewrite) {
          if (is_rewrite_from_original) {
            # Самый важный случай: 100% переписано - показываем в первую очередь
            printf " (переписано %.0f%% от оригинала) 🔄", rewrite_from_original
          } else if (is_architectural_rewrite) {
            printf " (расширение %.0fx) 🏗️ архитектурный", expansion_ratio
          } else if (is_significant_refactor) {
            printf " (расширение %.1fx) 🔄 значительный рефакторинг", expansion_ratio
          } else {
            printf " (баланс %.0f%%) 🔄", rewrite_ratio * 100
          }

          # Если есть данные об оригинале, показываем их дополнительно
          if (core_original[pkg] > 0 && !is_rewrite_from_original) {
            printf " [%.0f%% от оригинала]", rewrite_from_original
          }
          printf "\n"
        } else {
          # Даже если не переписан, показываем процент от оригинала если есть данные
          # ВАЖНО: проверяем core_gross_removed, а не core_removed (NET может быть 0)
          if (core_original[pkg] > 0 && core_gross_removed[pkg] > 0) {
            printf " (переписано %.0f%% от оригинала)\n", rewrite_from_original
          } else {
            printf "\n"
          }
        }

        # Показываем метрику комментариев (документированность)
        gross_comments_added_display = core_comments_gross_added[pkg] > 0 ? core_comments_gross_added[pkg] : 0
        gross_comments_removed_display = core_comments_gross_removed[pkg] > 0 ? core_comments_gross_removed[pkg] : 0

        # Вычисляем процент документированности (комментарии / код)
        doc_ratio_before = core_original[pkg] > 0 ? (core_comments_base[pkg] / core_original[pkg] * 100) : 0
        code_current_total = core_original[pkg] + gross_added_display - gross_removed_display
        doc_ratio_after = code_current_total > 0 ? (core_comments_current[pkg] / code_current_total * 100) : 0

        # Вычисляем процент покрытия тестами (тесты / код)
        # Для base: используем test_original и core_original
        # Для current: используем current значения тестов и кода
        coverage_before = core_original[pkg] > 0 ? (test_original[pkg] / core_original[pkg] * 100) : 0
        test_current_total = test_original[pkg] + test_added[pkg] - test_removed[pkg]
        coverage_after = code_current_total > 0 ? (test_current_total / code_current_total * 100) : 0

        # Для тестов используем GROSS значения (аналогично Core)
        gross_tests_added_display = test_gross_added[pkg] > 0 ? test_gross_added[pkg] : test_added[pkg]
        gross_tests_removed_display = test_gross_removed[pkg] > 0 ? test_gross_removed[pkg] : test_removed[pkg]

        # Показываем изменения в документации (README, CHANGELOG и т.д.)
        # Используем GROSS значения, если доступны, иначе NET
        gross_docs_added_display = docs_gross_added[pkg] > 0 ? docs_gross_added[pkg] : docs_added[pkg]
        gross_docs_removed_display = docs_gross_removed[pkg] > 0 ? docs_gross_removed[pkg] : docs_removed[pkg]

        printf "   - **Core от production: %.1f%%** 🎯\n", core_pct_from_prod

        if (gross_docs_added_display > 0 || gross_docs_removed_display > 0) {
          # Вычисляем процент переписанной документации от оригинала
          docs_rewrite_from_original = 0
          if (docs_original[pkg] > 0 && gross_docs_removed_display > 0) {
            docs_rewrite_from_original = (gross_docs_removed_display / docs_original[pkg]) * 100
          }

          # ИСПРАВЛЕНИЕ: если добавлено больше строк, чем было в оригинале,
          # это полное переписывание (даже если git diff показывает мало удалений)
          # Пример: файл вырос с 13 до 526 строк (+519 -6) - это 100% переписывание
          if (docs_original[pkg] > 0 && gross_docs_added_display > docs_original[pkg]) {
            docs_rewrite_from_original = 100
          }

          # Показываем с процентом если есть данные об оригинале
          if (docs_rewrite_from_original > 0) {
            printf "   - **Документация (README, CHANGELOG):** +%d -%d строк (переписано %.0f%% от оригинала) 📄\n", \
              gross_docs_added_display+0, gross_docs_removed_display+0, docs_rewrite_from_original
          } else {
            printf "   - **Документация (README, CHANGELOG):** +%d -%d строк 📄\n", gross_docs_added_display+0, gross_docs_removed_display+0
          }
        }

        # Показываем комментарии только если есть изменения
        if (gross_comments_added_display > 0 || gross_comments_removed_display > 0) {
          printf "   - **Комментарии:** +%d -%d строк 📝 (документированность: %.0f%% → %.0f%%)\n", \
            gross_comments_added_display, gross_comments_removed_display, doc_ratio_before, doc_ratio_after
        }

        printf "   - **Тесты:** +%d -%d строк 🧪 (покрытие: %.0f%% → %.0f%%)\n", \
          gross_tests_added_display, gross_tests_removed_display, coverage_before, coverage_after
        print ""
      }
    }'

} > "$OUTPUT_FILE"

echo "Отчёт сохранён в $OUTPUT_FILE"
