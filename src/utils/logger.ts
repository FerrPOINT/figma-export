import { writeFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

/**
 * УТИЛИТА ДЛЯ БЕЗОПАСНОГО ЛОГИРОВАНИЯ БОЛЬШИХ ДАННЫХ
 * 
 * ПРАВИЛА ИСПОЛЬЗОВАНИЯ:
 * 1. ВСЕ большие данные сначала сохраняются на диск
 * 2. В лог выводится только первые 100 символов
 * 3. Обязательно добавлять комментарии о том, что данные большие
 * 4. Использовать эту утилиту для всех текстовых файлов
 */

export interface LogData {
  message: string;
  data?: any;
  dataType?: string;
  filePath?: string;
  maxPreviewLength?: number;
}

/**
 * Безопасное логирование с сохранением больших данных на диск
 * @param logData - объект с данными для логирования
 */
export function safeLog(logData: LogData): void {
  const {
    message,
    data,
    dataType = 'unknown',
    filePath,
    maxPreviewLength = 100
  } = logData;

  try {
    // Если есть данные для сохранения
    if (data !== undefined) {
      let targetPath = filePath;
      
      // Если путь не указан, создаем автоматически с ID
      if (!targetPath) {
        // Извлекаем ID из данных или используем timestamp
        let fileId = 'unknown';
        if (data.id) {
          fileId = data.id;
        } else if (data.nodeId) {
          fileId = data.nodeId;
        } else if (data.messageId) {
          fileId = data.messageId;
        } else {
          fileId = Date.now().toString();
        }
        
        // Очищаем ID от недопустимых символов для имени файла
        fileId = fileId.replace(/[<>:"/\\|?*]/g, '_');
        
        // Создаем папку logs если её нет
        const logsDir = join('./export', 'logs');
        if (!existsSync(logsDir)) {
          mkdirSync(logsDir, { recursive: true });
        }
        
        targetPath = join(logsDir, `${dataType}_${fileId}.json`);
      }

      // Сначала сохраняем на диск
      writeFileSync(targetPath, JSON.stringify(data, null, 2));
      
      // Получаем размер файла
      const fs = require('fs');
      const fileSize = (fs.statSync(targetPath).size / 1024).toFixed(2);
      
      // В лог выводим только первые символы
      const dataString = JSON.stringify(data);
      const preview = dataString.length > maxPreviewLength 
        ? dataString.substring(0, maxPreviewLength) + '...'
        : dataString;
      
      console.log(`💾 ${message}`);
      console.log(`📁 Saved to: ${targetPath}`);
      console.log(`📊 File size: ${fileSize} KB`);
      console.log(`🔍 Preview: ${preview}`);
      
      // Записываем в лог-файл
      const logMessage = `[${new Date().toISOString()}] ${message} | File: ${targetPath} | Size: ${fileSize} KB | Preview: ${preview}\n`;
      appendFileSync(join('./export', 'export_log.txt'), logMessage);
      
    } else {
      // Обычное логирование без данных
      console.log(message);
      const logMessage = `[${new Date().toISOString()}] ${message}\n`;
      appendFileSync(join('./export', 'export_log.txt'), logMessage);
    }
    
  } catch (error) {
    console.error(`❌ Error in safeLog:`, error);
    console.log(message); // Выводим сообщение даже при ошибке
  }
}

/**
 * Логирование входящих сообщений с ограничением размера
 * @param message - сообщение для логирования
 * @param data - данные (опционально)
 */
export function logIncomingMessage(message: string, data?: any): void {
  if (data) {
    const dataString = JSON.stringify(data);
    const preview = dataString.length > 100 ? dataString.substring(0, 100) + '...' : dataString;
    
    console.log(`📥 ${message}`);
    console.log(`🔍 Preview: ${preview}`);
    
    const logMessage = `[${new Date().toISOString()}] 📥 ${message} | Preview: ${preview}\n`;
    appendFileSync(join('./export', 'export_log.txt'), logMessage);
  } else {
    console.log(`📥 ${message}`);
    const logMessage = `[${new Date().toISOString()}] 📥 ${message}\n`;
    appendFileSync(join('./export', 'export_log.txt'), logMessage);
  }
}

/**
 * Логирование исходящих команд
 * @param message - сообщение для логирования
 * @param commandData - данные команды (опционально)
 */
export function logOutgoingCommand(message: string, commandData?: any): void {
  if (commandData) {
    const dataString = JSON.stringify(commandData);
    const preview = dataString.length > 100 ? dataString.substring(0, 100) + '...' : dataString;
    
    console.log(`📤 ${message}`);
    console.log(`🔍 Preview: ${preview}`);
    
    const logMessage = `[${new Date().toISOString()}] 📤 ${message} | Preview: ${preview}\n`;
    appendFileSync(join('./export', 'export_log.txt'), logMessage);
  } else {
    console.log(`📤 ${message}`);
    const logMessage = `[${new Date().toISOString()}] 📤 ${message}\n`;
    appendFileSync(join('./export', 'export_log.txt'), logMessage);
  }
} 