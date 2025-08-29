#!/usr/bin/env bun

import { extractImagesFromJsonFiles } from '../src/utils/imageExtractor';

console.log('🚀 Запуск извлечения изображений из JSON файлов...');
console.log('📅 Время:', new Date().toISOString());

const result = extractImagesFromJsonFiles();

if (result.success) {
  console.log('\n✅ ИЗВЛЕЧЕНИЕ ИЗОБРАЖЕНИЙ ЗАВЕРШЕНО УСПЕШНО!');
  console.log(`📊 Извлечено изображений: ${result.extractedCount}`);
  console.log(`📁 Папка с изображениями: ${result.outputDir}`);
} else {
  console.log('\n❌ ОШИБКА ПРИ ИЗВЛЕЧЕНИИ ИЗОБРАЖЕНИЙ!');
  console.log(`🔍 Ошибка: ${result.error}`);
  process.exit(1);
}

console.log('\n🎉 Готово! Изображения извлечены и сохранены.'); 