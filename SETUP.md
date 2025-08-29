# 🛠️ Руководство по установке и настройке

Подробное руководство по установке и настройке **Cursor Talk to Figma WebSocket Integration**.

## 📋 Содержание

- [Предварительные требования](#предварительные-требования)
- [Установка](#установка)
- [Настройка](#настройка)
- [Первый запуск](#первый-запуск)
- [Настройка Figma плагина](#настройка-figma-плагина)
- [Устранение неполадок](#устранение-неполадок)
- [Обновление](#обновление)

## ⚙️ Предварительные требования

### Системные требования

- **ОС**: Windows 10+, macOS 10.15+, Ubuntu 18.04+
- **RAM**: Минимум 4GB, рекомендуется 8GB+
- **Дисковое пространство**: 2GB свободного места
- **Сеть**: Стабильное интернет-соединение

### Программное обеспечение

- **Node.js** 18.0.0+ или **Bun** 1.0.0+
- **Git** 2.30.0+
- **Figma Desktop** или **Figma Web**

### Проверка требований

```bash
# Проверка Node.js
node --version
# Должно быть v18.0.0 или выше

# Проверка npm
npm --version
# Должно быть v8.0.0 или выше

# Проверка Git
git --version
# Должно быть v2.30.0 или выше

# Проверка Bun (опционально)
bun --version
# Должно быть v1.0.0 или выше
```

## 📦 Установка

### Способ 1: Клонирование репозитория

```bash
# Клонирование репозитория
git clone https://github.com/your-username/figma-export.git
cd figma-export

# Установка зависимостей
npm install
# или
bun install
```

### Способ 2: Скачивание релиза

1. Перейдите на страницу [Releases](https://github.com/your-username/figma-export/releases)
2. Скачайте последний релиз
3. Распакуйте архив
4. Установите зависимости:

```bash
cd figma-export
npm install
```

### Способ 3: Установка через npm (будущее)

```bash
npm install -g figma-export
```

## ⚙️ Настройка

### 1. Конфигурация проекта

Создайте файл `.env` в корне проекта:

```bash
# .env
FIGMA_ACCESS_TOKEN=your_figma_access_token
WEBSOCKET_PORT=3055
EXPORT_TIMEOUT=300000
BATCH_SIZE=4
LOG_LEVEL=info
```

### 2. Получение Figma Access Token

1. Перейдите на [Figma Settings](https://www.figma.com/settings)
2. Выберите вкладку "Personal access tokens"
3. Нажмите "Create new token"
4. Дайте токену имя (например, "Figma Export Tool")
5. Скопируйте токен и добавьте в `.env`

### 3. Настройка портов

По умолчанию сервер запускается на порту 3055. Если порт занят, измените в `.env`:

```bash
WEBSOCKET_PORT=3056
```

### 4. Настройка путей экспорта

В файле `src/config/image-export-config.js`:

```javascript
module.exports = {
  outputDir: './export',
  imageFormat: 'png',
  imageScale: 4,
  quality: 100
};
```

## 🚀 Первый запуск

### 1. Сборка проекта

```bash
# Сборка TypeScript в JavaScript
npm run build
# или
bun run build
```

### 2. Запуск сервера

```bash
# Запуск WebSocket сервера
npm run start
# или
bun run start
```

Ожидаемый вывод:
```
🚀 Figma Export Server started on port 3055
📋 Waiting for Figma plugin connection...
⏰ Timeout set to 300 seconds for large files
```

### 3. Запуск клиента (опционально)

В новом терминале:

```bash
# Запуск клиента экспорта
npm run src/figma-export.ts
# или
bun run src/figma-export.ts
```

### 4. Проверка работы

Откройте браузер и перейдите по адресу:
```
http://localhost:3055
```

Должно отобразиться: "Figma Export WebSocket Server"

## 🎨 Настройка Figma плагина

### 1. Установка плагина

1. Откройте Figma
2. Перейдите в Plugins → Browse plugins in Community
3. Найдите "Figma Export Plugin" (или создайте свой)
4. Установите плагин

### 2. Настройка плагина

В коде плагина настройте WebSocket URL:

```javascript
const ws = new WebSocket('ws://localhost:3055');
```

### 3. Подключение к серверу

```javascript
// Присоединение к каналу
ws.send(JSON.stringify({
  type: 'join',
  channel: 'figma'
}));
```

### 4. Тестирование соединения

1. Запустите сервер
2. Откройте Figma плагин
3. Проверьте подключение в логах сервера

## 🔧 Устранение неполадок

### Проблема: Сервер не запускается

**Ошибка**: `EADDRINUSE: address already in use`

**Решение**:
```bash
# Найти процесс на порту 3055
netstat -ano | findstr :3055
# или
lsof -i :3055

# Остановить процесс
taskkill /PID <process_id>
# или
kill <process_id>
```

### Проблема: Не удается подключиться к Figma API

**Ошибка**: `FIGMA_API_ERROR`

**Решение**:
1. Проверьте правильность токена в `.env`
2. Убедитесь, что токен не истек
3. Проверьте права доступа к документу

### Проблема: Таймаут экспорта

**Ошибка**: `EXPORT_TIMEOUT`

**Решение**:
1. Увеличьте таймаут в `.env`:
   ```bash
   EXPORT_TIMEOUT=600000  # 10 минут
   ```
2. Уменьшите размер батча:
   ```bash
   BATCH_SIZE=2
   ```

### Проблема: Недостаточно памяти

**Ошибка**: `JavaScript heap out of memory`

**Решение**:
```bash
# Увеличьте лимит памяти Node.js
node --max-old-space-size=4096 dist/figma-export-server.js
```

### Проблема: Ошибки TypeScript

**Ошибка**: `TypeScript compilation failed`

**Решение**:
```bash
# Очистите кэш и пересоберите
rm -rf dist/
npm run build
```

## 🔄 Обновление

### Автоматическое обновление

```bash
# Получение последних изменений
git pull origin main

# Установка новых зависимостей
npm install

# Пересборка проекта
npm run build
```

### Ручное обновление

1. Скачайте новый релиз
2. Создайте резервную копию текущей версии
3. Замените файлы
4. Обновите зависимости:
   ```bash
   npm install
   npm run build
   ```

## 📊 Мониторинг

### Логи

Логи сохраняются в файле `export/export_log.txt`:

```bash
# Просмотр логов в реальном времени
tail -f export/export_log.txt
```

### Метрики

Сервер предоставляет метрики через HTTP endpoint:

```bash
curl http://localhost:3055/metrics
```

### Здоровье системы

```bash
curl http://localhost:3055/health
```

## 🔒 Безопасность

### Рекомендации

1. **Не публикуйте токены** в публичных репозиториях
2. **Используйте HTTPS** в продакшене
3. **Ограничьте доступ** к порту 3055
4. **Регулярно обновляйте** зависимости

### Файрвол

```bash
# Разрешить доступ только с localhost
ufw allow from 127.0.0.1 to any port 3055
```

## 📞 Поддержка

### Полезные команды

```bash
# Проверка статуса сервера
curl http://localhost:3055

# Просмотр процессов
ps aux | grep figma-export

# Очистка логов
rm export/export_log.txt

# Сброс экспорта
rm -rf export/*
```

### Получение помощи

1. Проверьте [README.md](README.md)
2. Изучите [API.md](API.md)
3. Создайте issue в репозитории
4. Обратитесь к [CONTRIBUTING.md](CONTRIBUTING.md)

---

## ✅ Чек-лист установки

- [ ] Установлены все предварительные требования
- [ ] Проект успешно клонирован
- [ ] Зависимости установлены
- [ ] Создан файл `.env` с токеном
- [ ] Проект собран (`npm run build`)
- [ ] Сервер запущен (`npm run start`)
- [ ] Проверено подключение к `http://localhost:3055`
- [ ] Настроен Figma плагин
- [ ] Протестировано соединение

**Поздравляем! Проект готов к использованию!** 🎉
