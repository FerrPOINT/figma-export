import { writeFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * Универсальное немедленное сохранение любых данных на диск.
 * Сохраняет строку как есть, объекты/массивы — как JSON, null — как 'null'.
 * @param dataType string — подкаталог в export/
 * @param rawData any — любые данные
 * @param fileName string — имя файла (по умолчанию timestamp.json)
 * @returns string — путь к сохраненному файлу
 */
export function saveRawDataImmediately(dataType: string, rawData: any, fileName?: string): string {
  const dir = join('./export', dataType);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const filePath = fileName
    ? join(dir, fileName)
    : join(dir, `${Date.now()}.json`);
  if (typeof rawData === 'string') {
    writeFileSync(filePath, rawData);
  } else if (rawData === null) {
    writeFileSync(filePath, 'null');
  } else {
    writeFileSync(filePath, JSON.stringify(rawData, null, 2));
  }
  console.log(`💾 [RAW] Saved ${dataType} (type: ${Array.isArray(rawData) ? 'array' : typeof rawData}) to ${filePath}`);
  return filePath;
}

/**
 * Универсальное сохранение данных с безопасным логированием.
 * Сохраняет данные в JSON формате и логирует превью.
 * @param dataType string — подкаталог в export/
 * @param data any — данные для сохранения
 * @param fileName string — имя файла (по умолчанию timestamp.json)
 * @returns string — путь к сохраненному файлу
 */
export function saveDataImmediately(dataType: string, data: any, fileName?: string): string {
  const dir = join('./export', dataType);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const filePath = fileName
    ? join(dir, fileName)
    : join(dir, `${Date.now()}.json`);
  
  const jsonData = JSON.stringify(data, null, 2);
  writeFileSync(filePath, jsonData);
  
  // Безопасное логирование - только превью
  const preview = jsonData.length > 100 
    ? jsonData.substring(0, 100) + '...'
    : jsonData;
  console.log(`💾 Saved ${dataType} data`);
  console.log(`📁 Saved to: ${filePath}`);
  console.log(`📊 File size: ${(jsonData.length / 1024).toFixed(2)} KB`);
  console.log(`🔍 Preview: ${preview}`);
  
  return filePath;
}

/**
 * Сохранение данных с именованием по ID.
 * Очищает ID от недопустимых символов для использования в имени файла.
 * @param dataType string — тип данных
 * @param data any — данные для сохранения
 * @param id string — ID для именования файла
 * @returns string — путь к сохраненному файлу
 */
export function saveDataById(dataType: string, data: any, id: string): string {
  // Очищаем ID от недопустимых символов
  const cleanId = id.replace(/[<>:"/\\|?*]/g, '_');
  const fileName = `${dataType}_${cleanId}.json`;
  return saveDataImmediately(dataType, data, fileName);
}

/**
 * Сохранение batch данных с временной меткой.
 * @param data any — batch данные
 * @param messageId string — ID сообщения
 * @returns string — путь к сохраненному файлу
 */
export function saveBatchData(data: any, messageId: string): string {
  const fileName = `batch_${messageId}.json`;
  return saveDataImmediately('batches', data, fileName);
}

/**
 * Сохранение изображений нод.
 * @param data any — данные изображения
 * @param nodeId string — ID ноды
 * @returns string — путь к сохраненному файлу
 */
export function saveNodeImage(data: any, nodeId: string): string {
  const cleanNodeId = nodeId.replace(/[<>:"/\\|?*]/g, '_');
  const fileName = `image_${cleanNodeId}.json`;
  return saveDataImmediately('images', data, fileName);
}

/**
 * Сохранение экспорта всех нод.
 * @param data any — данные полного экспорта
 * @param commandId string — ID команды
 * @returns string — путь к сохраненному файлу
 */
export function saveAllNodesExport(data: any, commandId: string): string {
  const fileName = `all_nodes_export_${commandId}.json`;
  return saveDataImmediately('all_nodes_export', data, fileName);
}

/**
 * Сохранение логов входящих сообщений.
 * @param data any — данные сообщения
 * @param messageId string — ID сообщения
 * @returns string — путь к сохраненному файлу
 */
export function saveIncomingMessageLog(data: any, messageId: string): string {
  const fileName = `incoming_message_${messageId}.json`;
  return saveDataImmediately('logs', data, fileName);
}

/**
 * Сохранение статистики экспорта.
 * @param statistics any — статистические данные
 * @returns string — путь к сохраненному файлу
 */
export function saveExportStatistics(statistics: any): string {
  return saveDataImmediately('metadata', statistics, 'export_statistics.json');
}

/**
 * Сохранение отчета валидации.
 * @param report any — отчет валидации
 * @returns string — путь к сохраненному файлу
 */
export function saveValidationReport(report: any): string {
  return saveDataImmediately('metadata', report, 'validation_report.json');
}

/**
 * Чтение файла с обработкой ошибок.
 * @param filePath string — путь к файлу
 * @returns any — содержимое файла или null при ошибке
 */
export function readFileSafe(filePath: string): any {
  try {
    if (!existsSync(filePath)) {
      console.log(`⚠️ File not found: ${filePath}`);
      return null;
    }
    const content = readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`❌ Error reading file ${filePath}:`, error);
    return null;
  }
}

/**
 * Получение размера файла в байтах.
 * @param filePath string — путь к файлу
 * @returns number — размер файла в байтах или 0 при ошибке
 */
export function getFileSize(filePath: string): number {
  try {
    if (!existsSync(filePath)) return 0;
    const stats = statSync(filePath);
    return stats.size;
  } catch (error) {
    console.error(`❌ Error getting file size for ${filePath}:`, error);
    return 0;
  }
}

/**
 * Создание директории если не существует.
 * @param dirPath string — путь к директории
 */
export function ensureDirectoryExists(dirPath: string): void {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
    console.log(`📁 Created directory: ${dirPath}`);
  }
}

/**
 * Получение списка файлов в директории.
 * @param dirPath string — путь к директории
 * @param extension string — расширение файлов (опционально)
 * @returns string[] — список файлов
 */
export function getFilesInDirectory(dirPath: string, extension?: string): string[] {
  try {
    if (!existsSync(dirPath)) return [];
    const files = readdirSync(dirPath);
    if (extension) {
      return files.filter(file => file.endsWith(extension));
    }
    return files;
  } catch (error) {
    console.error(`❌ Error reading directory ${dirPath}:`, error);
    return [];
  }
} 