#!/usr/bin/env bun

/**
 * СКРИПТ РУЧНОЙ РЕОРГАНИЗАЦИИ ЭКСПОРТА
 * 
 * Запуск: bun run scripts/reorganize-export.ts
 * 
 * Функции:
 * - Читает существующую папку export/
 * - Запускает реорганизацию по слоям
 * - Создает папку export/reorganized/
 * - НЕ удаляет оригинальные данные
 * - Только добавляет структурированные данные
 */

import { FigmaBatchReorganizer } from '../src/utils/reorganizer';

async function main() {
  console.log(`🚀 ЗАПУСК РУЧНОЙ РЕОРГАНИЗАЦИИ ЭКСПОРТА`);
  console.log(`📅 Время: ${new Date().toISOString()}`);
  console.log(`📁 Анализируем папку export/...`);
  
  try {
    // Проверяем наличие папки export
    const { existsSync } = await import('fs');
    const { join } = await import('path');
    
    const exportPath = join('./export');
    if (!existsSync(exportPath)) {
      console.error(`❌ Папка export/ не найдена!`);
      console.error(`💡 Сначала запустите экспорт: bun run start`);
      process.exit(1);
    }
    
    console.log(`✅ Папка export/ найдена`);
    
    // Запускаем реорганизацию
    console.log(`🔄 Запуск реорганизации...`);
    const reorganizer = new FigmaBatchReorganizer();
    const result = await reorganizer.reorganize();
    
    if (result.success) {
      console.log(`\n✅ РЕОРГАНИЗАЦИЯ ЗАВЕРШЕНА УСПЕШНО!`);
      console.log(`📊 Статистика:`);
      console.log(`   - Исходные ноды: ${result.statistics.originalNodes}`);
      console.log(`   - Сохраненные ноды: ${result.statistics.savedNodes}`);
      console.log(`   - Потери данных: ${result.statistics.dataLoss}`);
      console.log(`   - Создано папок: ${result.statistics.createdFolders}`);
      console.log(`   - Создано файлов: ${result.statistics.createdFiles}`);
      console.log(`   - Общий размер: ${Math.round(result.statistics.totalSize / 1024)} KB`);
      console.log(`   - Время выполнения: ${result.statistics.executionTime}ms`);
      
      if (result.warnings.length > 0) {
        console.log(`\n⚠️ Предупреждения:`);
        result.warnings.forEach(warning => console.log(`   - ${warning}`));
      }
      
      console.log(`\n📁 Результат сохранен в: export/reorganized/`);
      console.log(`💡 Оригинальные данные остались в: export/`);
      
    } else {
      console.error(`\n❌ РЕОРГАНИЗАЦИЯ ЗАВЕРШИЛАСЬ С ОШИБКАМИ!`);
      console.error(`📋 Ошибки:`);
      result.errors.forEach(error => console.error(`   - ${error}`));
      process.exit(1);
    }
    
  } catch (error) {
    console.error(`\n❌ КРИТИЧЕСКАЯ ОШИБКА:`);
    console.error(error);
    process.exit(1);
  }
}

// Запускаем скрипт
main().catch(error => {
  console.error(`❌ Неожиданная ошибка:`, error);
  process.exit(1);
}); 