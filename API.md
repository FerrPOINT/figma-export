# 🔌 API Документация

Документация по API для **Cursor Talk to Figma WebSocket Integration**.

## 📋 Содержание

- [Обзор](#обзор)
- [WebSocket API](#websocket-api)
- [Figma API Интеграция](#figma-api-интеграция)
- [Команды](#команды)
- [События](#события)
- [Ошибки](#ошибки)
- [Примеры](#примеры)

## 🎯 Обзор

Проект предоставляет WebSocket API для интеграции с Figma через плагин. API позволяет:

- 📡 Получать данные из Figma в реальном времени
- 🖼️ Экспортировать изображения элементов
- 📦 Обрабатывать данные батчами
- 📊 Получать аналитику экспорта

## 🔌 WebSocket API

### Подключение

```javascript
const ws = new WebSocket('ws://localhost:3055');
```

### Аутентификация

```javascript
// Присоединение к каналу
ws.send(JSON.stringify({
  type: 'join',
  channel: 'figma'
}));
```

### Формат сообщений

Все сообщения передаются в формате JSON:

```javascript
{
  "type": "command_type",
  "data": {
    // данные команды
  },
  "id": "unique_message_id"
}
```

## 📡 Figma API Интеграция

### Основные команды

#### 1. Получение структуры документа

```javascript
{
  "type": "get_document_structure",
  "data": {
    "documentId": "figma_document_id"
  }
}
```

**Ответ:**
```javascript
{
  "type": "document_structure",
  "data": {
    "nodes": [...],
    "components": [...],
    "styles": [...],
    "metadata": {...}
  }
}
```

#### 2. Экспорт изображений

```javascript
{
  "type": "export_images",
  "data": {
    "nodeIds": ["node_id_1", "node_id_2"],
    "format": "png",
    "scale": 4
  }
}
```

**Ответ:**
```javascript
{
  "type": "images_exported",
  "data": {
    "images": [
      {
        "nodeId": "node_id_1",
        "url": "image_url",
        "format": "png"
      }
    ]
  }
}
```

#### 3. Получение компонентов

```javascript
{
  "type": "get_components",
  "data": {
    "documentId": "figma_document_id"
  }
}
```

#### 4. Получение стилей

```javascript
{
  "type": "get_styles",
  "data": {
    "documentId": "figma_document_id"
  }
}
```

## 🎮 Команды

### Команды экспорта

| Команда | Описание | Параметры |
|---------|----------|-----------|
| `get_document_structure` | Получить структуру документа | `documentId` |
| `export_images` | Экспортировать изображения | `nodeIds`, `format`, `scale` |
| `get_components` | Получить компоненты | `documentId` |
| `get_styles` | Получить стили | `documentId` |
| `get_annotations` | Получить аннотации | `documentId` |
| `get_selection` | Получить выбранные элементы | - |

### Команды управления

| Команда | Описание | Параметры |
|---------|----------|-----------|
| `start_export` | Начать экспорт | `options` |
| `stop_export` | Остановить экспорт | - |
| `get_status` | Получить статус | - |
| `clear_cache` | Очистить кэш | - |

## 📡 События

### События подключения

```javascript
// Подключение установлено
{
  "type": "connected",
  "data": {
    "serverTime": "2025-08-29T03:08:23.458Z",
    "version": "0.3.1"
  }
}

// Отключение
{
  "type": "disconnected",
  "data": {
    "reason": "client_disconnect"
  }
}
```

### События экспорта

```javascript
// Начало экспорта
{
  "type": "export_started",
  "data": {
    "totalNodes": 33993,
    "batchSize": 4
  }
}

// Прогресс экспорта
{
  "type": "export_progress",
  "data": {
    "currentBatch": 125,
    "totalBatches": 252,
    "progress": 49.6
  }
}

// Завершение экспорта
{
  "type": "export_completed",
  "data": {
    "totalExported": 33993,
    "totalImages": 15,
    "duration": "2m 34s"
  }
}
```

### События ошибок

```javascript
{
  "type": "error",
  "data": {
    "code": "FIGMA_API_ERROR",
    "message": "Failed to fetch document",
    "details": {...}
  }
}
```

## ❌ Ошибки

### Коды ошибок

| Код | Описание | Решение |
|-----|----------|---------|
| `CONNECTION_FAILED` | Не удалось подключиться | Проверить сервер |
| `FIGMA_API_ERROR` | Ошибка Figma API | Проверить токен |
| `INVALID_DOCUMENT_ID` | Неверный ID документа | Проверить ID |
| `EXPORT_TIMEOUT` | Таймаут экспорта | Увеличить таймаут |
| `INVALID_COMMAND` | Неверная команда | Проверить формат |

### Обработка ошибок

```javascript
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  
  if (message.type === 'error') {
    console.error('API Error:', message.data);
    // Обработка ошибки
  }
};
```

## 💡 Примеры

### Полный цикл экспорта

```javascript
const ws = new WebSocket('ws://localhost:3055');

ws.onopen = () => {
  // Присоединяемся к каналу
  ws.send(JSON.stringify({
    type: 'join',
    channel: 'figma'
  }));
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  
  switch (message.type) {
    case 'connected':
      console.log('Подключено к серверу');
      break;
      
    case 'export_started':
      console.log('Экспорт начался');
      break;
      
    case 'export_progress':
      console.log(`Прогресс: ${message.data.progress}%`);
      break;
      
    case 'export_completed':
      console.log('Экспорт завершен');
      break;
      
    case 'error':
      console.error('Ошибка:', message.data);
      break;
  }
};

// Начинаем экспорт
ws.send(JSON.stringify({
  type: 'start_export',
  data: {
    documentId: 'your_figma_document_id',
    options: {
      includeImages: true,
      batchSize: 4,
      timeout: 300000
    }
  }
}));
```

### Экспорт изображений

```javascript
// Экспорт конкретных элементов
ws.send(JSON.stringify({
  type: 'export_images',
  data: {
    nodeIds: ['node_id_1', 'node_id_2'],
    format: 'png',
    scale: 4
  }
}));
```

### Получение компонентов

```javascript
// Получение всех компонентов документа
ws.send(JSON.stringify({
  type: 'get_components',
  data: {
    documentId: 'your_figma_document_id'
  }
}));
```

## 🔧 Конфигурация

### Настройки сервера

```javascript
const serverConfig = {
  port: 3055,
  timeout: 300000, // 5 минут
  batchSize: 4,
  maxConnections: 10
};
```

### Настройки клиента

```javascript
const clientConfig = {
  reconnectInterval: 5000,
  maxReconnectAttempts: 5,
  heartbeatInterval: 30000
};
```

## 📊 Мониторинг

### Метрики API

- **Время ответа**: Среднее время ответа на запросы
- **Количество подключений**: Активные WebSocket соединения
- **Ошибки**: Количество ошибок по типам
- **Экспорты**: Статистика экспортов

### Логирование

```javascript
// Включение подробного логирования
ws.send(JSON.stringify({
  type: 'set_log_level',
  data: {
    level: 'debug'
  }
}));
```

---

## 🔗 Полезные ссылки

- [Figma API Documentation](https://www.figma.com/developers/api)
- [WebSocket MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
- [JSON Schema](https://json-schema.org/)

## 📞 Поддержка

При возникновении проблем с API:

1. Проверьте логи сервера
2. Убедитесь в правильности формата сообщений
3. Проверьте подключение к Figma
4. Создайте issue в репозитории
