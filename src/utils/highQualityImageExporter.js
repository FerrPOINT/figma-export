/**
 * УТИЛИТА ДЛЯ ЭКСПОРТА ИЗОБРАЖЕНИЙ ВЫСОКОГО КАЧЕСТВА
 * 
 * Предоставляет функции для экспорта изображений из Figma с максимальным качеством
 */

import ImageExportConfig from '../config/image-export-config.js';

class HighQualityImageExporter {
  constructor() {
    this.config = ImageExportConfig;
  }

  /**
   * Экспортирует изображение с оптимальными настройками качества
   * @param {Object} params - Параметры экспорта
   * @param {string} params.nodeId - ID ноды для экспорта
   * @param {string} params.useCase - Тип использования (web, print, mobile, etc.)
   * @param {string} params.size - Размер изображения (small, medium, large, extraLarge)
   * @param {number} params.customScale - Пользовательский масштаб (опционально)
   * @param {string} params.format - Формат изображения (PNG, JPG, SVG, PDF)
   * @returns {Promise<Object>} Результат экспорта
   */
  async exportWithOptimalQuality(params) {
    const {
      nodeId,
      useCase = 'web',
      size = 'medium',
      customScale = null,
      format = null
    } = params;

    // Получаем оптимальные настройки
    const optimalSettings = this.config.getOptimalSettings(useCase, size);
    
    // Применяем пользовательские настройки если указаны
    const finalSettings = {
      ...optimalSettings,
      ...(customScale && { scale: customScale }),
      ...(format && { format: format })
    };

    // Валидируем настройки
    const validatedSettings = this.config.validateSettings(finalSettings);

    console.log(`🖼️ Экспорт изображения с настройками качества:`);
    console.log(`   📏 Масштаб: ${validatedSettings.scale}x`);
    console.log(`   📄 Формат: ${validatedSettings.format}`);
    console.log(`   🎯 Тип: ${validatedSettings.constraint}`);
    console.log(`   📱 Использование: ${useCase}`);
    console.log(`   📐 Размер: ${size}`);

    return this.exportImage(nodeId, validatedSettings);
  }

  /**
   * Экспортирует изображение с максимальным качеством для печати
   * @param {string} nodeId - ID ноды
   * @returns {Promise<Object>} Результат экспорта
   */
  async exportForPrint(nodeId) {
    const printSettings = this.config.getPreset('print');
    console.log(`🖨️ Экспорт для печати с максимальным качеством (${printSettings.scale}x)`);
    return this.exportImage(nodeId, printSettings);
  }

  /**
   * Экспортирует изображение для веб-дизайна
   * @param {string} nodeId - ID ноды
   * @returns {Promise<Object>} Результат экспорта
   */
  async exportForWeb(nodeId) {
    const webSettings = this.config.getPreset('web');
    console.log(`🌐 Экспорт для веб-дизайна (${webSettings.scale}x)`);
    return this.exportImage(nodeId, webSettings);
  }

  /**
   * Экспортирует изображение для мобильных устройств
   * @param {string} nodeId - ID ноды
   * @returns {Promise<Object>} Результат экспорта
   */
  async exportForMobile(nodeId) {
    const mobileSettings = this.config.getPreset('mobile');
    console.log(`📱 Экспорт для мобильных устройств (${mobileSettings.scale}x)`);
    return this.exportImage(nodeId, mobileSettings);
  }

  /**
   * Экспортирует изображение для иконок
   * @param {string} nodeId - ID ноды
   * @returns {Promise<Object>} Результат экспорта
   */
  async exportForIcons(nodeId) {
    const iconSettings = this.config.getPreset('icons');
    console.log(`🎨 Экспорт для иконок (${iconSettings.scale}x)`);
    return this.exportImage(nodeId, iconSettings);
  }

  /**
   * Экспортирует изображение для иллюстраций
   * @param {string} nodeId - ID ноды
   * @returns {Promise<Object>} Результат экспорта
   */
  async exportForIllustrations(nodeId) {
    const illustrationSettings = this.config.getPreset('illustrations');
    console.log(`🎭 Экспорт для иллюстраций (${illustrationSettings.scale}x)`);
    return this.exportImage(nodeId, illustrationSettings);
  }

  /**
   * Основная функция экспорта изображения
   * @param {string} nodeId - ID ноды
   * @param {Object} settings - Настройки экспорта
   * @returns {Promise<Object>} Результат экспорта
   */
  async exportImage(nodeId, settings) {
    try {
      // Получаем ноду из Figma
      const node = await figma.getNodeByIdAsync(nodeId);
      if (!node) {
        throw new Error(`Node not found with ID: ${nodeId}`);
      }

      if (!("exportAsync" in node)) {
        throw new Error(`Node does not support exporting: ${nodeId}`);
      }

      // Настройки экспорта
      const exportSettings = {
        format: settings.format,
        constraint: { 
          type: settings.constraint, 
          value: settings.scale 
        }
      };

      // Экспортируем изображение
      const bytes = await node.exportAsync(exportSettings);

      // Определяем MIME тип
      const mimeType = this.getMimeType(settings.format);

      // Конвертируем в base64
      const base64 = this.customBase64Encode(bytes);

      // Возвращаем результат с дополнительной информацией
      return {
        success: true,
        nodeId,
        format: settings.format,
        scale: settings.scale,
        constraint: settings.constraint,
        mimeType,
        imageData: base64,
        imageSize: bytes.length,
        quality: {
          scale: settings.scale,
          format: settings.format,
          constraint: settings.constraint,
          description: this.getQualityDescription(settings)
        },
        metadata: {
          exportedAt: new Date().toISOString(),
          nodeName: node.name,
          nodeType: node.type,
          originalSize: node.absoluteBoundingBox ? {
            width: node.absoluteBoundingBox.width,
            height: node.absoluteBoundingBox.height
          } : null
        }
      };

    } catch (error) {
      console.error(`❌ Ошибка экспорта изображения: ${error.message}`);
      return {
        success: false,
        error: error.message,
        nodeId
      };
    }
  }

  /**
   * Получает MIME тип для формата
   * @param {string} format - Формат изображения
   * @returns {string} MIME тип
   */
  getMimeType(format) {
    const mimeTypes = {
      'PNG': 'image/png',
      'JPG': 'image/jpeg',
      'JPEG': 'image/jpeg',
      'SVG': 'image/svg+xml',
      'PDF': 'application/pdf'
    };
    return mimeTypes[format] || 'application/octet-stream';
  }

  /**
   * Получает описание качества
   * @param {Object} settings - Настройки
   * @returns {string} Описание качества
   */
  getQualityDescription(settings) {
    const { scale, format } = settings;
    
    if (scale >= 6) return 'Максимальное качество (для печати)';
    if (scale >= 4) return 'Высокое качество (для веб)';
    if (scale >= 2) return 'Среднее качество (для быстрого экспорта)';
    return 'Базовое качество';
  }

  /**
   * Конвертирует Uint8Array в base64
   * @param {Uint8Array} bytes - Байты изображения
   * @returns {string} Base64 строка
   */
  customBase64Encode(bytes) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let base64 = "";

    const byteLength = bytes.byteLength;
    const byteRemainder = byteLength % 3;
    const mainLength = byteLength - byteRemainder;

    let a, b, c, d;
    let chunk;

    // Основной цикл обрабатывает байты группами по 3
    for (let i = 0; i < mainLength; i = i + 3) {
      // Объединяем три байта в одно целое число
      chunk = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];

      // Используем битовые маски для извлечения 6-битных сегментов из триплета
      a = (chunk & 16515072) >> 18; // 16515072 = (2^6 - 1) << 18
      b = (chunk & 258048) >> 12;   // 258048 = (2^6 - 1) << 12
      c = (chunk & 4032) >> 6;      // 4032 = (2^6 - 1) << 6
      d = chunk & 63;                // 63 = 2^6 - 1

      // Конвертируем сырые бинарные сегменты в соответствующую ASCII кодировку
      base64 += chars[a] + chars[b] + chars[c] + chars[d];
    }

    // Обрабатываем оставшиеся байты и паддинг
    if (byteRemainder === 1) {
      chunk = bytes[mainLength];

      a = (chunk & 252) >> 2; // 252 = (2^6 - 1) << 2

      // Устанавливаем 4 наименее значимых бита в ноль
      b = (chunk & 3) << 4; // 3 = 2^2 - 1

      base64 += chars[a] + chars[b] + "==";
    } else if (byteRemainder === 2) {
      chunk = (bytes[mainLength] << 8) | bytes[mainLength + 1];

      a = (chunk & 64512) >> 10; // 64512 = (2^6 - 1) << 10
      b = (chunk & 1008) >> 4;   // 1008 = (2^6 - 1) << 4

      // Устанавливаем 2 наименее значимых бита в ноль
      c = (chunk & 15) << 2; // 15 = 2^4 - 1

      base64 += chars[a] + chars[b] + chars[c] + "=";
    }

    return base64;
  }

  /**
   * Получает информацию о доступных пресетах
   * @returns {Object} Информация о пресетах
   */
  getPresetsInfo() {
    return {
      presets: this.config.presets,
      formats: this.config.formats,
      constraints: this.config.constraints,
      sizeRecommendations: this.config.sizeRecommendations
    };
  }

  /**
   * Валидирует настройки экспорта
   * @param {Object} settings - Настройки для валидации
   * @returns {Object} Результат валидации
   */
  validateExportSettings(settings) {
    const validated = this.config.validateSettings(settings);
    const formatInfo = this.config.getFormatSettings(settings.format);
    
    return {
      isValid: true,
      settings: validated,
      formatInfo,
      recommendations: this.getRecommendations(settings)
    };
  }

  /**
   * Получает рекомендации по настройкам
   * @param {Object} settings - Текущие настройки
   * @returns {Array} Список рекомендаций
   */
  getRecommendations(settings) {
    const recommendations = [];
    const { scale, format } = settings;
    const formatInfo = this.config.getFormatSettings(format);

    if (scale > formatInfo.maxScale) {
      recommendations.push(`Масштаб ${scale} слишком высокий для формата ${format}. Рекомендуется ${formatInfo.maxScale}x`);
    }

    if (scale < 2 && format === 'PNG') {
      recommendations.push('Для лучшего качества PNG рекомендуется масштаб 2x или выше');
    }

    if (format === 'JPG' && scale > 3) {
      recommendations.push('Для JPG рекомендуется масштаб не более 3x для оптимального размера файла');
    }

    return recommendations;
  }
}

// Экспорт для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
  module.exports = HighQualityImageExporter;
} else if (typeof window !== 'undefined') {
  window.HighQualityImageExporter = HighQualityImageExporter;
}

export default HighQualityImageExporter; 