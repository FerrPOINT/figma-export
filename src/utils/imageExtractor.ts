import { writeFileSync, mkdirSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';

interface ImageData {
  nodeId: string;
  format: string;
  scale: number;
  mimeType: string;
  imageData: string;
}

/**
 * Извлекает изображения из JSON файлов с base64 данными
 */
export function extractImagesFromJsonFiles() {
  console.log('🖼️ Начинаю извлечение изображений из JSON файлов...');
  
  const imagesDir = join(process.cwd(), 'export', 'images');
  
  // Проверяем, что папка images существует
  if (!existsSync(imagesDir)) {
    console.log(`📁 Папка images не найдена: ${imagesDir}`);
    return {
      success: false,
      error: 'Папка images не найдена',
      extractedCount: 0,
      outputDir: imagesDir
    };
  }
  
  try {
    // Читаем все JSON файлы из папки images
    const fs = require('fs');
    const files = fs.readdirSync(imagesDir).filter((file: string) => file.endsWith('.json'));
    
    console.log(`📊 Найдено ${files.length} JSON файлов с изображениями`);
    
    let extractedCount = 0;
    
    for (const file of files) {
      const filePath = join(imagesDir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      
      try {
        const imageData: ImageData = JSON.parse(content);
        
        if (imageData.imageData && imageData.nodeId) {
          // Извлекаем расширение файла из mimeType
          const extension = imageData.mimeType.split('/')[1] || 'png';
          const fileName = `image_${imageData.nodeId.replace(/:/g, '_')}.${extension}`;
          const outputPath = join(imagesDir, fileName);
          
          // Декодируем base64 в бинарные данные
          const binaryData = Buffer.from(imageData.imageData, 'base64');
          
          // Сохраняем изображение в ту же папку images
          writeFileSync(outputPath, binaryData);
          
          // Удаляем JSON файл после успешного создания PNG
          unlinkSync(filePath);
          
          console.log(`💾 Извлечено изображение: ${fileName} (${binaryData.length} байт) - JSON удален`);
          extractedCount++;
        }
      } catch (error) {
        console.log(`⚠️ Ошибка при обработке файла ${file}:`, error.message);
      }
    }
    
    console.log(`✅ Извлечение завершено! Извлечено ${extractedCount} изображений`);
    console.log(`📁 Изображения сохранены в: ${imagesDir}`);
    
    return {
      success: true,
      extractedCount,
      outputDir: imagesDir
    };
    
  } catch (error) {
    console.error('❌ Ошибка при извлечении изображений:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Извлекает изображения из конкретного JSON файла
 */
export function extractImageFromFile(filePath: string, outputDir?: string) {
  try {
    const fs = require('fs');
    const content = fs.readFileSync(filePath, 'utf8');
    const imageData: ImageData = JSON.parse(content);
    
    if (!imageData.imageData || !imageData.nodeId) {
      throw new Error('Файл не содержит валидные данные изображения');
    }
    
    const extension = imageData.mimeType.split('/')[1] || 'png';
    const fileName = `image_${imageData.nodeId.replace(/:/g, '_')}.${extension}`;
    const outputPath = outputDir ? join(outputDir, fileName) : fileName;
    
    // Декодируем base64 в бинарные данные
    const binaryData = Buffer.from(imageData.imageData, 'base64');
    
    // Создаем папку если нужно
    if (outputDir && !existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }
    
    // Сохраняем изображение
    writeFileSync(outputPath, binaryData);
    
    console.log(`💾 Извлечено изображение: ${fileName} (${binaryData.length} байт)`);
    
    return {
      success: true,
      fileName,
      fileSize: binaryData.length,
      outputPath
    };
    
  } catch (error) {
    console.error('❌ Ошибка при извлечении изображения:', error);
    return {
      success: false,
      error: error.message
    };
  }
} 