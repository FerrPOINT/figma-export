/**
 * КОНФИГУРАЦИЯ ЭКСПОРТА ИЗОБРАЖЕНИЙ
 * 
 * Настройки для получения изображений высокого качества из Figma
 */

const ImageExportConfig = {
  // Основные настройки качества
  default: {
    scale: 4,           // Масштаб 4x для высокого разрешения
    format: 'PNG',      // Формат PNG для лучшего качества
    constraint: 'SCALE' // Тип ограничения - масштабирование
  },

  // Настройки для разных типов изображений
  presets: {
    // Максимальное качество для печати
    print: {
      scale: 8,
      format: 'PNG',
      constraint: 'SCALE'
    },

    // Высокое качество для веб-дизайна
    web: {
      scale: 4,
      format: 'PNG',
      constraint: 'SCALE'
    },

    // Среднее качество для быстрого экспорта
    fast: {
      scale: 2,
      format: 'PNG',
      constraint: 'SCALE'
    },

    // Качество для мобильных устройств
    mobile: {
      scale: 3,
      format: 'PNG',
      constraint: 'SCALE'
    },

    // Качество для десктопных приложений
    desktop: {
      scale: 4,
      format: 'PNG',
      constraint: 'SCALE'
    },

    // Качество для иконок
    icons: {
      scale: 6,
      format: 'PNG',
      constraint: 'SCALE'
    },

    // Качество для иллюстраций
    illustrations: {
      scale: 5,
      format: 'PNG',
      constraint: 'SCALE'
    }
  },

  // Настройки для разных форматов
  formats: {
    PNG: {
      description: 'Лучшее качество, поддержка прозрачности',
      recommended: true,
      maxScale: 8
    },
    JPG: {
      description: 'Меньший размер, без прозрачности',
      recommended: false,
      maxScale: 4
    },
    SVG: {
      description: 'Векторный формат, масштабируется без потерь',
      recommended: true,
      maxScale: 1 // SVG не нуждается в масштабировании
    },
    PDF: {
      description: 'Для печати и документов',
      recommended: false,
      maxScale: 4
    }
  },

  // Настройки ограничений
  constraints: {
    SCALE: {
      description: 'Масштабирование по заданному коэффициенту',
      recommended: true
    },
    WIDTH: {
      description: 'Фиксированная ширина в пикселях',
      recommended: false
    },
    HEIGHT: {
      description: 'Фиксированная высота в пикселях',
      recommended: false
    }
  },

  // Рекомендации по качеству в зависимости от размера
  sizeRecommendations: {
    small: {
      description: 'Иконки, кнопки (до 100px)',
      scale: 6,
      format: 'PNG'
    },
    medium: {
      description: 'Карточки, баннеры (100-500px)',
      scale: 4,
      format: 'PNG'
    },
    large: {
      description: 'Иллюстрации, скриншоты (500px+)',
      scale: 3,
      format: 'PNG'
    },
    extraLarge: {
      description: 'Плакаты, печать (1000px+)',
      scale: 2,
      format: 'PNG'
    }
  },

  // Функции для получения настроек
  getPreset(presetName) {
    return this.presets[presetName] || this.default;
  },

  getSizeRecommendation(size) {
    return this.sizeRecommendations[size] || this.default;
  },

  getFormatSettings(format) {
    return this.formats[format] || this.formats.PNG;
  },

  // Функция для валидации настроек
  validateSettings(settings) {
    const { scale, format, constraint } = settings;
    const formatSettings = this.getFormatSettings(format);
    
    if (scale > formatSettings.maxScale) {
      console.warn(`⚠️ Масштаб ${scale} превышает максимальный для формата ${format} (${formatSettings.maxScale})`);
      return {
        ...settings,
        scale: formatSettings.maxScale
      };
    }
    
    return settings;
  },

  // Функция для получения оптимальных настроек
  getOptimalSettings(useCase = 'web', size = 'medium') {
    const preset = this.getPreset(useCase);
    const sizeRec = this.getSizeRecommendation(size);
    
    return this.validateSettings({
      scale: Math.max(preset.scale, sizeRec.scale),
      format: preset.format,
      constraint: preset.constraint
    });
  }
};

// Экспорт для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ImageExportConfig;
} else if (typeof window !== 'undefined') {
  window.ImageExportConfig = ImageExportConfig;
}

export default ImageExportConfig; 