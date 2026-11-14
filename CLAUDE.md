# Уке — PWA для обучения игре на укулеле

Личное приложение: телефон Android в первую очередь, десктоп тоже. Главное — интерес и ежедневная привычка, а не музыкальная точность.
Интерфейс и тексты — по-русски, на «ты», коротко.

- Продуктовый план: `PLAN.md`. Контракты модулей и владельцы файлов: `ARCHITECTURE.md` (читать перед правками). Исследование: `research/`.
- Стек: Preact 11 + @preact/signals, esbuild из `build.py`, idb, pitchy, lucide-preact. Без GPL/AGPL в бандле, без CDN во время работы.
- Сборка: `npm run build` (= `python3 build.py`, результат в `docs/`). Тесты: `npm test`. Локально: `npm run dev` → http://localhost:5180.
- Сайт — GitHub Pages из `docs/` репозитория `Tratsiaka/ukulele`: https://tratsiaka.github.io/ukulele/. `docs/` хранится в git:
  коммить его вместе с `src/`, после push в `main` сайт обновляется примерно за минуту. Проверка:
  `curl -s https://tratsiaka.github.io/ukulele/ | grep -o 'app.js?v=[0-9a-f]*'` — версия как в выводе `build.py`.
  Публиковать только под личным аккаунтом `Tratsiaka`, не под рабочим.
- Hash-маршруты, относительные пути (сайт живёт в подпапке `/ukulele/`). IndexedDB `uke`, localStorage только с префиксом `uke:`.
- Чужие тексты песен не попадают в репозиторий: стартовый набор — только общественное достояние, реальные страницы для тестов —
  в `fixtures-private/` (в `.gitignore`).
