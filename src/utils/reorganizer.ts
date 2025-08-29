/**
 * МОДУЛЬ РЕОРГАНИЗАЦИИ БАТЧЕЙ FIGMA
 * 
 * Цель: Реорганизовать экспортированные данные в структурированную систему файлов
 * для удобного чтения и эффективной реализации дизайна в React.
 * 
 * КРИТИЧНЫЕ ТРЕБОВАНИЯ:
 * - Сохранить ВСЕ данные без потерь
 * - Обработать все файлы из nodes/, styles/, components/
 * - Разделить по слоям
 * - Группировать компоненты по типам
 * - Извлечь уникальные дизайн-токены
 * - Детальное логирование процесса
 * - Валидация целостности данных
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

// Интерфейсы для типизации
interface FigmaNode {
  id: string;
  name: string;
  type: string;
  parentId?: string;
  absoluteBoundingBox?: any;
  fills?: any[];
  strokes?: any[];
  characters?: string;
  style?: any;
  cornerRadius?: number;
  children?: number;
}

interface LayerData {
  metadata: {
    id: string;
    name: string;
    type: string;
    dimensions: { width: number; height: number };
    background: string;
    nodeCount: number;
    componentCount: number;
    styleCount: number;
  };
  structure: {
    rootFrame: FigmaNode;
    children: FigmaNode[];
    hierarchy: Record<string, string[]>;
  };
  components: {
    buttons: FigmaNode[];
    cards: FigmaNode[];
    inputs: FigmaNode[];
    navigation: FigmaNode[];
    feedback: FigmaNode[];
  };
  styles: {
    colors: any[];
    typography: any[];
    spacing: any[];
    shadows: any[];
  };
  content: {
    text: FigmaNode[];
    labels: FigmaNode[];
    data: any[];
  };
}

interface SizeAnalysis {
  originalSize: number;
  reorganizedSize: number;
  sizeReduction: number;
  sizeReductionPercent: number;
  fileCount: {
    original: number;
    reorganized: number;
  };
  folderCount: {
    original: number;
    reorganized: number;
  };
  averageFileSize: {
    original: number;
    reorganized: number;
  };
  largestFiles: Array<{
    path: string;
    size: number;
    type: 'original' | 'reorganized';
  }>;
  sizeByCategory: Record<string, {
    original: number;
    reorganized: number;
    reduction: number;
  }>;
}

interface ReorganizationResult {
  success: boolean;
  statistics: {
    originalNodes: number;
    savedNodes: number;
    dataLoss: number;
    createdFolders: number;
    createdFiles: number;
    totalSize: number;
    executionTime: number;
  };
  sizeAnalysis: SizeAnalysis;
  errors: string[];
  warnings: string[];
}

export class FigmaBatchReorganizer {
  private readonly exportPath = './export';
  private readonly reorganizedPath = './export/reorganized';
  private readonly nodesPath = './export/nodes';
  private readonly stylesPath = './export/styles';
  private readonly componentsPath = './export/components';

  private statistics = {
    originalNodes: 0,
    savedNodes: 0,
    dataLoss: 0,
    createdFolders: 0,
    createdFiles: 0,
    totalSize: 0,
    executionTime: 0
  };

  private sizeAnalysis: SizeAnalysis = {
    originalSize: 0,
    reorganizedSize: 0,
    sizeReduction: 0,
    sizeReductionPercent: 0,
    fileCount: { original: 0, reorganized: 0 },
    folderCount: { original: 0, reorganized: 0 },
    averageFileSize: { original: 0, reorganized: 0 },
    largestFiles: [],
    sizeByCategory: {}
  };

  private errors: string[] = [];
  private warnings: string[] = [];

  /**
   * ОСНОВНАЯ ФУНКЦИЯ РЕОРГАНИЗАЦИИ
   */
  async reorganize(): Promise<ReorganizationResult> {
    const startTime = Date.now();
    
    try {
      console.log(`🚀 НАЧАЛО РЕОРГАНИЗАЦИИ БАТЧЕЙ FIGMA`);
      console.log(`📅 Время: ${new Date().toISOString()}`);
      
      // Создание основной папки реорганизации
      if (!existsSync(this.reorganizedPath)) {
        mkdirSync(this.reorganizedPath, { recursive: true });
        console.log(`📁 Создана папка: ${this.reorganizedPath}`);
      }
      
      // Этап 1: Анализ и классификация
      const analysisResult = await this.analyzeAndClassify();
      if (!analysisResult.success) {
        throw new Error(`Ошибка анализа: ${analysisResult.error}`);
      }
      
      // Этап 2: Разделение по слоям
      const layersResult = await this.separateByLayers(analysisResult.data);
      if (!layersResult.success) {
        throw new Error(`Ошибка разделения по слоям: ${layersResult.error}`);
      }
      
      // Этап 3: Группировка компонентов
      const componentsResult = await this.groupComponents(analysisResult.data);
      if (!componentsResult.success) {
        throw new Error(`Ошибка группировки компонентов: ${componentsResult.error}`);
      }
      
      // Этап 4: Извлечение дизайн-токенов
      const tokensResult = await this.extractDesignTokens(analysisResult.data);
      if (!tokensResult.success) {
        throw new Error(`Ошибка извлечения токенов: ${tokensResult.error}`);
      }
      
      // Этап 5: Валидация и проверка
      const validationResult = await this.validateAndCheck();
      if (!validationResult.success) {
        throw new Error(`Ошибка валидации: ${validationResult.error}`);
      }
      
      // Этап 6: Копирование недостающих данных
      await this.copyMissingData();
      
      // Этап 7: Анализ размеров
      await this.analyzeSizes();
      
      // Финальная статистика
      this.statistics.executionTime = Date.now() - startTime;
      await this.logFinalStatistics();
      
      return {
        success: true,
        statistics: this.statistics,
        sizeAnalysis: this.sizeAnalysis,
        errors: this.errors,
        warnings: this.warnings
      };
      
    } catch (error) {
      console.error(`❌ КРИТИЧЕСКАЯ ОШИБКА РЕОРГАНИЗАЦИИ:`, error);
      this.errors.push(error instanceof Error ? error.message : String(error));
      
      return {
        success: false,
        statistics: this.statistics,
        sizeAnalysis: this.sizeAnalysis,
        errors: this.errors,
        warnings: this.warnings
      };
    }
  }

  /**
   * ЭТАП 1: АНАЛИЗ И КЛАССИФИКАЦИЯ
   */
  private async analyzeAndClassify(): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      console.log(`\n🔍 ЭТАП 1: АНАЛИЗ И КЛАССИФИКАЦИЯ`);
      
      // Чтение всех нод из файлов nodes/
      console.log(`   📁 Чтение файлов nodes/...`);
      const allNodes: FigmaNode[] = [];
      const allBatches: any[] = [];
      const allStyles: any[] = [];
      const allComponents: any[] = [];
      const allImages: any[] = [];
      const allMetadata: any[] = [];
      
      // Читаем all_nodes.json
      const allNodesPath = join(this.nodesPath, 'all_nodes.json');
      if (existsSync(allNodesPath)) {
        console.log(`   📋 Обработка all_nodes.json...`);
        const allNodesData = JSON.parse(readFileSync(allNodesPath, 'utf8'));
        if (Array.isArray(allNodesData)) {
          allNodes.push(...allNodesData);
          console.log(`   ✅ Загружено ${allNodesData.length} нод из all_nodes.json`);
        } else if (allNodesData.nodes && Array.isArray(allNodesData.nodes)) {
          allNodes.push(...allNodesData.nodes);
          console.log(`   ✅ Загружено ${allNodesData.nodes.length} нод из all_nodes.json`);
        }
      }
      
      // Читаем frames.json
      const framesPath = join(this.nodesPath, 'frames.json');
      if (existsSync(framesPath)) {
        console.log(`   📋 Обработка frames.json...`);
        const framesData = JSON.parse(readFileSync(framesPath, 'utf8'));
        if (Array.isArray(framesData)) {
          allNodes.push(...framesData);
          console.log(`   ✅ Загружено ${framesData.length} фреймов из frames.json`);
        } else if (framesData.frames && Array.isArray(framesData.frames)) {
          allNodes.push(...framesData.frames);
          console.log(`   ✅ Загружено ${framesData.frames.length} фреймов из frames.json`);
        }
      }
      
      // Читаем instances.json
      const instancesPath = join(this.nodesPath, 'instances.json');
      if (existsSync(instancesPath)) {
        console.log(`   📋 Обработка instances.json...`);
        const instancesData = JSON.parse(readFileSync(instancesPath, 'utf8'));
        if (Array.isArray(instancesData)) {
          allNodes.push(...instancesData);
          console.log(`   ✅ Загружено ${instancesData.length} инстансов из instances.json`);
        } else if (instancesData.instances && Array.isArray(instancesData.instances)) {
          allNodes.push(...instancesData.instances);
          console.log(`   ✅ Загружено ${instancesData.instances.length} инстансов из instances.json`);
        }
      }
      
      // Читаем text_nodes.json
      const textNodesPath = join(this.nodesPath, 'text_nodes.json');
      if (existsSync(textNodesPath)) {
        console.log(`   📋 Обработка text_nodes.json...`);
        const textNodesData = JSON.parse(readFileSync(textNodesPath, 'utf8'));
        if (Array.isArray(textNodesData)) {
          allNodes.push(...textNodesData);
          console.log(`   ✅ Загружено ${textNodesData.length} текстовых нод из text_nodes.json`);
        } else if (textNodesData.textNodes && Array.isArray(textNodesData.textNodes)) {
          allNodes.push(...textNodesData.textNodes);
          console.log(`   ✅ Загружено ${textNodesData.textNodes.length} текстовых нод из text_nodes.json`);
        }
      }
      
      // Читаем rectangles.json
      const rectanglesPath = join(this.nodesPath, 'rectangles.json');
      if (existsSync(rectanglesPath)) {
        console.log(`   📋 Обработка rectangles.json...`);
        const rectanglesData = JSON.parse(readFileSync(rectanglesPath, 'utf8'));
        if (Array.isArray(rectanglesData)) {
          allNodes.push(...rectanglesData);
          console.log(`   ✅ Загружено ${rectanglesData.length} прямоугольников из rectangles.json`);
        } else if (rectanglesData.rectangles && Array.isArray(rectanglesData.rectangles)) {
          allNodes.push(...rectanglesData.rectangles);
          console.log(`   ✅ Загружено ${rectanglesData.rectangles.length} прямоугольников из rectangles.json`);
        }
      }
      
      // Читаем groups.json
      const groupsPath = join(this.nodesPath, 'groups.json');
      if (existsSync(groupsPath)) {
        console.log(`   📋 Обработка groups.json...`);
        const groupsData = JSON.parse(readFileSync(groupsPath, 'utf8'));
        if (Array.isArray(groupsData)) {
          allNodes.push(...groupsData);
          console.log(`   ✅ Загружено ${groupsData.length} групп из groups.json`);
        } else if (groupsData.groups && Array.isArray(groupsData.groups)) {
          allNodes.push(...groupsData.groups);
          console.log(`   ✅ Загружено ${groupsData.groups.length} групп из groups.json`);
        }
      }
      
      this.statistics.originalNodes = allNodes.length;
      console.log(`   📊 Всего загружено нод: ${allNodes.length}`);
      
      // Чтение батчей
      console.log(`   📁 Чтение файлов batches/...`);
      const batchesPath = join(this.exportPath, 'batches');
      if (existsSync(batchesPath)) {
        const batchFiles = readdirSync(batchesPath);
        console.log(`   📋 Найдено батчей: ${batchFiles.length}`);
        
        for (const fileName of batchFiles) {
          const filePath = join(batchesPath, fileName);
          try {
            const data = JSON.parse(readFileSync(filePath, 'utf8'));
            if (Array.isArray(data)) {
              allBatches.push(...data);
            }
          } catch (error) {
            console.log(`   ❌ Ошибка чтения ${fileName}: ${error}`);
          }
        }
        console.log(`   ✅ Загружено ${allBatches.length} нод из батчей`);
      }
      
      // Чтение стилей
      console.log(`   📁 Чтение файлов styles/...`);
      if (existsSync(this.stylesPath)) {
        const styleFiles = readdirSync(this.stylesPath);
        console.log(`   📋 Найдено файлов стилей: ${styleFiles.length}`);
        
        for (const fileName of styleFiles) {
          const filePath = join(this.stylesPath, fileName);
          try {
            const data = JSON.parse(readFileSync(filePath, 'utf8'));
            allStyles.push(data);
          } catch (error) {
            console.log(`   ❌ Ошибка чтения ${fileName}: ${error}`);
          }
        }
        console.log(`   ✅ Загружено ${allStyles.length} файлов стилей`);
      }
      
      // Чтение компонентов
      console.log(`   📁 Чтение файлов components/...`);
      if (existsSync(this.componentsPath)) {
        const componentFiles = readdirSync(this.componentsPath);
        console.log(`   📋 Найдено файлов компонентов: ${componentFiles.length}`);
        
        for (const fileName of componentFiles) {
          const filePath = join(this.componentsPath, fileName);
          try {
            const data = JSON.parse(readFileSync(filePath, 'utf8'));
            allComponents.push(data);
          } catch (error) {
            console.log(`   ❌ Ошибка чтения ${fileName}: ${error}`);
          }
        }
        console.log(`   ✅ Загружено ${allComponents.length} файлов компонентов`);
      }
      
      // Чтение изображений
      console.log(`   📁 Чтение файлов images/...`);
      const imagesPath = join(this.exportPath, 'images');
      if (existsSync(imagesPath)) {
        const imageFiles = readdirSync(imagesPath);
        console.log(`   📋 Найдено файлов изображений: ${imageFiles.length}`);
        allImages.push(...imageFiles);
      }
      
      // Чтение метаданных
      console.log(`   📁 Чтение файлов metadata/...`);
      const metadataPath = join(this.exportPath, 'metadata');
      if (existsSync(metadataPath)) {
        const metadataFiles = readdirSync(metadataPath);
        console.log(`   📋 Найдено файлов метаданных: ${metadataFiles.length}`);
        
        for (const fileName of metadataFiles) {
          const filePath = join(metadataPath, fileName);
          try {
            const data = JSON.parse(readFileSync(filePath, 'utf8'));
            allMetadata.push(data);
          } catch (error) {
            console.log(`   ❌ Ошибка чтения ${fileName}: ${error}`);
          }
        }
        console.log(`   ✅ Загружено ${allMetadata.length} файлов метаданных`);
      }
      
      // Удаляем дубликаты по ID
      const uniqueNodes = this.removeDuplicates(allNodes);
      console.log(`   📊 Уникальных нод: ${uniqueNodes.length}`);
      
      // Обработка батчей (ОБОГАЩЕНИЕ ДАННЫМИ)
      console.log(`   📦 Обработка ${allBatches.length} батчей для обогащения данных:`);
      
      // Создаем Map для быстрого поиска нод по ID
      const nodesMap = new Map(uniqueNodes.map(node => [node.id, node]));
      const batchNodeIds = new Set<string>();
      const enrichedNodes = [...uniqueNodes];
      
      // Обрабатываем батчи
      for (const batchItem of allBatches) {
        if (batchItem.nodeId && batchItem.document) {
          batchNodeIds.add(batchItem.nodeId);
          
          // Ищем соответствующую ноду в основных данных
          const existingNode = nodesMap.get(batchItem.nodeId);
          
          if (existingNode) {
            // Обогащаем существующую ноду данными из батча
            const enrichedNode = {
              ...existingNode,
              ...batchItem.document,
              // Сохраняем оригинальные поля, если они есть
              originalFills: existingNode.fills,
              originalStrokes: existingNode.strokes,
              // Добавляем детализированные данные из батча
              detailedFills: batchItem.document.fills,
              detailedStrokes: batchItem.document.strokes,
              detailedChildren: batchItem.document.children,
              detailedBoundingBox: batchItem.document.absoluteBoundingBox,
              cornerRadius: batchItem.document.cornerRadius,
              // Метаданные батча
              batchData: {
                nodeId: batchItem.nodeId,
                source: 'batch'
              }
            };
            
            // Заменяем ноду в Map
            nodesMap.set(batchItem.nodeId, enrichedNode);
            
            // Обновляем в массиве
            const index = enrichedNodes.findIndex(n => n.id === batchItem.nodeId);
            if (index !== -1) {
              enrichedNodes[index] = enrichedNode;
            }
          } else {
            // Добавляем новую ноду из батча
            const newNode = {
              ...batchItem.document,
              batchData: {
                nodeId: batchItem.nodeId,
                source: 'batch-only'
              }
            };
            enrichedNodes.push(newNode);
            nodesMap.set(batchItem.nodeId, newNode);
          }
        }
      }
      
      console.log(`   📊 Уникальных nodeId в батчах: ${batchNodeIds.size}`);
      console.log(`   🔗 Обогащено нод: ${enrichedNodes.length - uniqueNodes.length}`);
      
      // Находим корневые фреймы (слои)
      const rootFrames = enrichedNodes.filter(node => 
        node.type === 'FRAME' && !node.parentId
      );
      console.log(`   📊 Найдено корневых фреймов: ${rootFrames.length}`);
      
      return {
        success: true,
        data: {
          nodes: enrichedNodes,
          rootFrames: rootFrames,
          batches: allBatches,
          styles: allStyles,
          components: allComponents,
          images: allImages,
          metadata: allMetadata
        }
      };
      
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Удаление дубликатов по ID
   */
  private removeDuplicates(nodes: FigmaNode[]): FigmaNode[] {
    const seen = new Set<string>();
    return nodes.filter(node => {
      if (seen.has(node.id)) {
        return false;
      }
      seen.add(node.id);
      return true;
    });
  }

  /**
   * ЭТАП 2: РАЗДЕЛЕНИЕ ПО СЛОЯМ
   */
  private async separateByLayers(data: any): Promise<{ success: boolean; error?: string }> {
    try {
      console.log(`\n📂 ЭТАП 2: РАЗДЕЛЕНИЕ ПО СЛОЯМ`);
      
      const { nodes, rootFrames } = data;
      
      // Создаем папку layers
      const layersPath = join(this.reorganizedPath, 'layers');
      if (!existsSync(layersPath)) {
        mkdirSync(layersPath, { recursive: true });
        this.statistics.createdFolders++;
      }
      
      for (const rootFrame of rootFrames) {
        console.log(`   📁 Обработка слоя: ${rootFrame.name} (${rootFrame.id})`);
        
        // Получаем все ноды для этого слоя
        const layerNodes = this.getNodesForLayer(nodes, rootFrame.id);
        console.log(`      - Нод в слое: ${layerNodes.length}`);
        
        // Создаем папку для слоя
        const layerFolderName = `layer-${rootFrame.name.toLowerCase().replace(/\s+/g, '-')}`;
        const layerPath = join(layersPath, layerFolderName);
        if (!existsSync(layerPath)) {
          mkdirSync(layerPath, { recursive: true });
          this.statistics.createdFolders++;
        }
        
        // Извлекаем данные слоя
        const layerData = this.extractLayerData(layerNodes, rootFrame);
        
        // Сохраняем структуру
        const structurePath = join(layerPath, 'structure.json');
        writeFileSync(structurePath, JSON.stringify(layerData.structure, null, 2));
        this.statistics.createdFiles++;
        
        // Сохраняем компоненты
        const componentsPath = join(layerPath, 'components.json');
        writeFileSync(componentsPath, JSON.stringify(layerData.components, null, 2));
        this.statistics.createdFiles++;
        
        // Сохраняем стили
        const stylesPath = join(layerPath, 'styles.json');
        writeFileSync(stylesPath, JSON.stringify(layerData.styles, null, 2));
        this.statistics.createdFiles++;
        
        // Сохраняем контент
        const contentPath = join(layerPath, 'content.json');
        writeFileSync(contentPath, JSON.stringify(layerData.content, null, 2));
        this.statistics.createdFiles++;
        
        // Сохраняем метаданные
        const metadataPath = join(layerPath, 'metadata.json');
        writeFileSync(metadataPath, JSON.stringify(layerData.metadata, null, 2));
        this.statistics.createdFiles++;
        
        console.log(`      💾 Сохранено 5 файлов для слоя ${rootFrame.name}`);
      }
      
      return { success: true };
      
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * ЭТАП 3: ГРУППИРОВКА КОМПОНЕНТОВ
   */
  private async groupComponents(data: any): Promise<{ success: boolean; error?: string }> {
    try {
      console.log(`\n🔧 ЭТАП 3: ГРУППИРОВКА КОМПОНЕНТОВ`);
      
      const { nodes } = data;
      
      // Создаем папку components
      const componentsPath = join(this.reorganizedPath, 'components');
      if (!existsSync(componentsPath)) {
        mkdirSync(componentsPath, { recursive: true });
        this.statistics.createdFolders++;
      }
      
      // Группируем компоненты по типам
      const groupedComponents = {
        buttons: nodes.filter((n: FigmaNode) => this.isButton(n)),
        cards: nodes.filter((n: FigmaNode) => this.isCard(n)),
        inputs: nodes.filter((n: FigmaNode) => this.isInput(n)),
        navigation: nodes.filter((n: FigmaNode) => this.isNavigation(n)),
        feedback: nodes.filter((n: FigmaNode) => this.isFeedback(n))
      };
      
      for (const [type, components] of Object.entries(groupedComponents)) {
        if (components.length > 0) {
          console.log(`   📦 ${type}: ${components.length} компонентов`);
          
          const typePath = join(componentsPath, type);
          if (!existsSync(typePath)) {
            mkdirSync(typePath, { recursive: true });
            this.statistics.createdFolders++;
          }
          
          const filePath = join(typePath, `${type}.json`);
          writeFileSync(filePath, JSON.stringify(components, null, 2));
          this.statistics.createdFiles++;
        }
      }
      
      return { success: true };
      
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * ЭТАП 4: ИЗВЛЕЧЕНИЕ ДИЗАЙН-ТОКЕНОВ
   */
  private async extractDesignTokens(data: any): Promise<{ success: boolean; error?: string }> {
    try {
      console.log(`\n🎨 ЭТАП 4: ИЗВЛЕЧЕНИЕ ДИЗАЙН-ТОКЕНОВ`);
      
      const { nodes } = data;
      
      // Создаем папку design-tokens
      const tokensPath = join(this.reorganizedPath, 'design-tokens');
      if (!existsSync(tokensPath)) {
        mkdirSync(tokensPath, { recursive: true });
        this.statistics.createdFolders++;
      }
      
      // Извлекаем цвета
      const colors = this.extractUniqueColors(nodes);
      const colorsPath = join(tokensPath, 'colors.json');
      writeFileSync(colorsPath, JSON.stringify(colors, null, 2));
      this.statistics.createdFiles++;
      console.log(`   🎨 Цвета: ${colors.length} уникальных`);
      
      // Извлекаем типографику
      const typography = this.extractUniqueTypography(nodes);
      const typographyPath = join(tokensPath, 'typography.json');
      writeFileSync(typographyPath, JSON.stringify(typography, null, 2));
      this.statistics.createdFiles++;
      console.log(`   📝 Типографика: ${typography.length} стилей`);
      
      // Извлекаем отступы
      const spacing = this.extractUniqueSpacing(nodes);
      const spacingPath = join(tokensPath, 'spacing.json');
      writeFileSync(spacingPath, JSON.stringify(spacing, null, 2));
      this.statistics.createdFiles++;
      console.log(`   📏 Отступы: ${spacing.length} размеров`);
      
      // Извлекаем тени
      const shadows = this.extractUniqueShadows(nodes);
      const shadowsPath = join(tokensPath, 'shadows.json');
      writeFileSync(shadowsPath, JSON.stringify(shadows, null, 2));
      this.statistics.createdFiles++;
      console.log(`   🌟 Тени: ${shadows.length} эффектов`);
      
      return { success: true };
      
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * ЭТАП 5: ВАЛИДАЦИЯ И ПРОВЕРКА
   */
  private async validateAndCheck(): Promise<{ success: boolean; error?: string }> {
    try {
      console.log(`\n✅ ЭТАП 5: ВАЛИДАЦИЯ И ПРОВЕРКА`);
      
      // Проверка сохранности данных
      console.log(`   ✅ Валидация сохранности данных:`);
      this.statistics.savedNodes = this.countSavedNodes();
      this.statistics.dataLoss = this.statistics.originalNodes - this.statistics.savedNodes;
      
      console.log(`      - Исходные ноды: ${this.statistics.originalNodes}`);
      console.log(`      - Сохраненные ноды: ${this.statistics.savedNodes}`);
      console.log(`      - Потери данных: ${this.statistics.dataLoss}`);
      
      if (this.statistics.dataLoss > 0) {
        this.warnings.push(`Обнаружена потеря ${this.statistics.dataLoss} нод`);
      }
      
      // Проверка структуры файлов
      console.log(`   📋 Проверка структуры файлов:`);
      const fileStructure = this.analyzeFileStructure();
      
      for (const [category, files] of Object.entries(fileStructure)) {
        console.log(`      - ${category}: ${files.length} файлов`);
      }
      
      return { success: true };
      
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * ЭТАП 6: КОПИРОВАНИЕ НЕДОСТАЮЩИХ ДАННЫХ
   */
  private async copyMissingData(): Promise<void> {
    try {
      console.log(`\n📋 ЭТАП 6: КОПИРОВАНИЕ НЕДОСТАЮЩИХ ДАННЫХ`);
      
      // Создание недостающих папок
      console.log(`   📁 Создание недостающих папок...`);
      const missingFolders = [
        'annotations',
        'structure', 
        'logs'
      ];
      
      for (const folder of missingFolders) {
        const folderPath = join(this.reorganizedPath, folder);
        if (!existsSync(folderPath)) {
          mkdirSync(folderPath, { recursive: true });
          console.log(`      ✅ Создана папка: ${folder}`);
        }
      }
      
      // Копирование критично важных файлов
      console.log(`   📋 Копирование критично важных файлов...`);
      const criticalFiles = [
        { src: 'export/annotations/all_annotations.json', dest: 'export/reorganized/annotations/' },
        { src: 'export/structure/document_structure.json', dest: 'export/reorganized/structure/' },
        { src: 'export/metadata/document_info.json', dest: 'export/reorganized/metadata/' },
        { src: 'export/styles/colors.json', dest: 'export/reorganized/styles/' },
        { src: 'export/styles/extracted_styles.json', dest: 'export/reorganized/styles/' }
      ];
      
      for (const file of criticalFiles) {
        if (existsSync(file.src)) {
          const fileName = file.src.split('/').pop();
          const destPath = join(file.dest, fileName);
          writeFileSync(destPath, readFileSync(file.src));
          console.log(`      ✅ Скопирован: ${file.src}`);
        } else {
          console.log(`      ⚠️ Файл не найден: ${file.src}`);
        }
      }
      
      // Копирование важных файлов
      console.log(`   📋 Копирование важных файлов...`);
      const importantFiles = [
        { src: 'export/components/extracted_components.json', dest: 'export/reorganized/components/' },
        { src: 'export/components/local_components.json', dest: 'export/reorganized/components/' }
      ];
      
      for (const file of importantFiles) {
        if (existsSync(file.src)) {
          const fileName = file.src.split('/').pop();
          const destPath = join(file.dest, fileName);
          writeFileSync(destPath, readFileSync(file.src));
          console.log(`      ✅ Скопирован: ${file.src}`);
        } else {
          console.log(`      ⚠️ Файл не найден: ${file.src}`);
        }
      }
      
      // Копирование изображений
      console.log(`   📋 Копирование изображений...`);
      const imagesPath = join(this.exportPath, 'images');
      const reorganizedImagesPath = join(this.reorganizedPath, 'images');
      
      if (existsSync(imagesPath)) {
        const imageFiles = readdirSync(imagesPath);
        console.log(`      📁 Найдено изображений: ${imageFiles.length}`);
        
        for (const imageFile of imageFiles) {
          const srcPath = join(imagesPath, imageFile);
          const destPath = join(reorganizedImagesPath, imageFile);
          writeFileSync(destPath, readFileSync(srcPath));
          console.log(`      ✅ Скопировано: ${imageFile}`);
        }
      }
      
      // Опционально: копирование логов (не критично)
      console.log(`   📋 Копирование логов (опционально)...`);
      const logsPath = join(this.exportPath, 'logs');
      const reorganizedLogsPath = join(this.reorganizedPath, 'logs');
      
      if (existsSync(logsPath)) {
        const logFiles = readdirSync(logsPath);
        console.log(`      📁 Найдено логов: ${logFiles.length}`);
        
        // Копируем только первые 10 логов для экономии места
        const filesToCopy = logFiles.slice(0, 10);
        for (const logFile of filesToCopy) {
          const srcPath = join(logsPath, logFile);
          const destPath = join(reorganizedLogsPath, logFile);
          writeFileSync(destPath, readFileSync(srcPath));
          console.log(`      ✅ Скопирован лог: ${logFile}`);
        }
        console.log(`      📊 Скопировано ${filesToCopy.length} из ${logFiles.length} логов`);
      }
      
      console.log(`   ✅ Копирование недостающих данных завершено`);
      
    } catch (error) {
      console.error(`❌ Ошибка копирования данных:`, error);
      this.errors.push(`Ошибка копирования данных: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * ЭТАП 7: АНАЛИЗ РАЗМЕРОВ
   */
  private async analyzeSizes(): Promise<void> {
    try {
      console.log(`\n📊 ЭТАП 7: АНАЛИЗ РАЗМЕРОВ`);
      
      // Анализ исходных размеров
      console.log(`   📁 Анализ исходных размеров...`);
      const originalAnalysis = this.analyzeDirectorySize(this.exportPath);
      this.sizeAnalysis.originalSize = originalAnalysis.totalSize;
      this.sizeAnalysis.fileCount.original = originalAnalysis.fileCount;
      this.sizeAnalysis.folderCount.original = originalAnalysis.folderCount;
      this.sizeAnalysis.averageFileSize.original = originalAnalysis.averageFileSize;
      
      console.log(`      - Общий размер: ${Math.round(originalAnalysis.totalSize / 1024)} KB`);
      console.log(`      - Файлов: ${originalAnalysis.fileCount}`);
      console.log(`      - Папок: ${originalAnalysis.folderCount}`);
      console.log(`      - Средний размер файла: ${Math.round(originalAnalysis.averageFileSize)} bytes`);
      
      // Анализ реорганизованных размеров
      console.log(`   📁 Анализ реорганизованных размеров...`);
      const reorganizedAnalysis = this.analyzeDirectorySize(this.reorganizedPath);
      this.sizeAnalysis.reorganizedSize = reorganizedAnalysis.totalSize;
      this.sizeAnalysis.fileCount.reorganized = reorganizedAnalysis.fileCount;
      this.sizeAnalysis.folderCount.reorganized = reorganizedAnalysis.folderCount;
      this.sizeAnalysis.averageFileSize.reorganized = reorganizedAnalysis.averageFileSize;
      
      console.log(`      - Общий размер: ${Math.round(reorganizedAnalysis.totalSize / 1024)} KB`);
      console.log(`      - Файлов: ${reorganizedAnalysis.fileCount}`);
      console.log(`      - Папок: ${reorganizedAnalysis.folderCount}`);
      console.log(`      - Средний размер файла: ${Math.round(reorganizedAnalysis.averageFileSize)} bytes`);
      
      // Расчет эффективности
      this.sizeAnalysis.sizeReduction = originalAnalysis.totalSize - reorganizedAnalysis.totalSize;
      this.sizeAnalysis.sizeReductionPercent = originalAnalysis.totalSize > 0 
        ? (this.sizeAnalysis.sizeReduction / originalAnalysis.totalSize) * 100 
        : 0;
      
      console.log(`   📈 Эффективность реорганизации:`);
      console.log(`      - Сокращение размера: ${Math.round(this.sizeAnalysis.sizeReduction / 1024)} KB`);
      console.log(`      - Процент сокращения: ${this.sizeAnalysis.sizeReductionPercent.toFixed(1)}%`);
      
    } catch (error) {
      console.error(`❌ Ошибка анализа размеров:`, error);
      this.errors.push(`Ошибка анализа размеров: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ
   */
  
  private getNodesForLayer(nodes: FigmaNode[], layerId: string): FigmaNode[] {
    const layerNodes: FigmaNode[] = [];
    const processedIds = new Set<string>();
    
    const collectNodes = (nodeId: string) => {
      if (processedIds.has(nodeId)) return;
      processedIds.add(nodeId);
      
      const node = nodes.find(n => n.id === nodeId);
      if (node) {
        layerNodes.push(node);
        
        // Ищем дочерние элементы
        const children = nodes.filter(n => n.parentId === nodeId);
        children.forEach(child => collectNodes(child.id));
      }
    };
    
    // Начинаем с корневого фрейма слоя
    const rootNode = nodes.find(n => n.id === layerId);
    if (rootNode) {
      collectNodes(layerId);
    }
    
    return layerNodes;
  }
  
  private extractLayerData(nodes: FigmaNode[], layer: any): LayerData {
    const rootFrame = nodes.find(n => n.id === layer.id) || nodes[0];
    const children = nodes.filter(n => n.parentId === layer.id);
    
    // Построение иерархии
    const hierarchy: Record<string, string[]> = {};
    for (const node of nodes) {
      if (node.parentId) {
        if (!hierarchy[node.parentId]) {
          hierarchy[node.parentId] = [];
        }
        hierarchy[node.parentId].push(node.id);
      }
    }
    
    // Классификация компонентов
    const components = {
      buttons: nodes.filter(n => this.isButton(n)),
      cards: nodes.filter(n => this.isCard(n)),
      inputs: nodes.filter(n => this.isInput(n)),
      navigation: nodes.filter(n => this.isNavigation(n)),
      feedback: nodes.filter(n => this.isFeedback(n))
    };
    
    // Извлечение стилей
    const styles = {
      colors: this.extractUniqueColors(nodes),
      typography: this.extractUniqueTypography(nodes),
      spacing: this.extractUniqueSpacing(nodes),
      shadows: this.extractUniqueShadows(nodes)
    };
    
    // Извлечение контента
    const content = {
      text: nodes.filter(n => n.type === 'TEXT'),
      labels: nodes.filter(n => n.name.toLowerCase().includes('label')),
      data: []
    };
    
    return {
      metadata: {
        id: layer.id,
        name: layer.name,
        type: layer.type,
        dimensions: layer.absoluteBoundingBox || { width: 0, height: 0 },
        background: this.extractBackground(layer),
        nodeCount: nodes.length,
        componentCount: Object.values(components).reduce((sum, arr) => sum + arr.length, 0),
        styleCount: Object.values(styles).reduce((sum, arr) => sum + arr.length, 0)
      },
      structure: {
        rootFrame,
        children,
        hierarchy
      },
      components,
      styles,
      content
    };
  }

  // Методы классификации компонентов
  private isButton(node: FigmaNode): boolean {
    return node.name.toLowerCase().includes('button') || 
           node.type === 'INSTANCE' && node.name.toLowerCase().includes('btn');
  }
  
  private isCard(node: FigmaNode): boolean {
    return node.name.toLowerCase().includes('card') || 
           node.type === 'FRAME' && node.name.toLowerCase().includes('card');
  }
  
  private isInput(node: FigmaNode): boolean {
    return node.name.toLowerCase().includes('input') || 
           node.name.toLowerCase().includes('field');
  }
  
  private isNavigation(node: FigmaNode): boolean {
    return node.name.toLowerCase().includes('nav') || 
           node.name.toLowerCase().includes('menu');
  }
  
  private isFeedback(node: FigmaNode): boolean {
    return node.name.toLowerCase().includes('alert') || 
           node.name.toLowerCase().includes('notification');
  }

  // Методы извлечения стилей
  private extractUniqueColors(nodes: FigmaNode[]): any[] {
    const colors = new Set<string>();
    nodes.forEach(node => {
      if (node.fills) {
        node.fills.forEach(fill => {
          if (fill.color) {
            colors.add(JSON.stringify(fill.color));
          }
        });
      }
    });
    return Array.from(colors).map(color => JSON.parse(color));
  }
  
  private extractUniqueTypography(textNodes: FigmaNode[]): any[] {
    const typography = new Set<string>();
    textNodes.forEach(node => {
      if (node.style) {
        typography.add(JSON.stringify(node.style));
      }
    });
    return Array.from(typography).map(style => JSON.parse(style));
  }
  
  private extractUniqueSpacing(nodes: FigmaNode[]): any[] {
    const spacing = new Set<number>();
    nodes.forEach(node => {
      if (node.absoluteBoundingBox) {
        spacing.add(node.absoluteBoundingBox.x);
        spacing.add(node.absoluteBoundingBox.y);
        spacing.add(node.absoluteBoundingBox.width);
        spacing.add(node.absoluteBoundingBox.height);
      }
    });
    return Array.from(spacing).sort((a, b) => a - b);
  }
  
  private extractUniqueShadows(nodes: FigmaNode[]): any[] {
    const shadows = new Set<string>();
    nodes.forEach(node => {
      if (node.strokes) {
        node.strokes.forEach(stroke => {
          shadows.add(JSON.stringify(stroke));
        });
      }
    });
    return Array.from(shadows).map(shadow => JSON.parse(shadow));
  }
  
  private extractBackground(node: any): string {
    if (node.fills && node.fills.length > 0) {
      const fill = node.fills[0];
      if (fill.color) {
        return `#${Math.round(fill.color.r * 255).toString(16).padStart(2, '0')}${Math.round(fill.color.g * 255).toString(16).padStart(2, '0')}${Math.round(fill.color.b * 255).toString(16).padStart(2, '0')}`;
      }
    }
    return '#ffffff';
  }

  // Методы анализа
  private countSavedNodes(): number {
    let count = 0;
    try {
      const layersPath = join(this.reorganizedPath, 'layers');
      if (existsSync(layersPath)) {
        const layerFolders = readdirSync(layersPath, { withFileTypes: true })
          .filter(dirent => dirent.isDirectory())
          .map(dirent => dirent.name);
        
        for (const layerFolder of layerFolders) {
          const layerPath = join(layersPath, layerFolder);
          const componentsPath = join(layerPath, 'components.json');
          
          if (existsSync(componentsPath)) {
            const componentsData = JSON.parse(readFileSync(componentsPath, 'utf8'));
            count += (componentsData.buttons?.length || 0);
            count += (componentsData.cards?.length || 0);
            count += (componentsData.inputs?.length || 0);
            count += (componentsData.navigation?.length || 0);
            count += (componentsData.feedback?.length || 0);
          }
        }
      }
    } catch (error) {
      console.warn('Не удалось подсчитать сохраненные ноды:', error);
    }
    return count;
  }
  
  private analyzeFileStructure(): Record<string, string[]> {
    const structure: Record<string, string[]> = {};
    try {
      const files = readdirSync(this.reorganizedPath, { recursive: true });
      for (const file of files) {
        if (typeof file === 'string' && file.endsWith('.json')) {
          const category = file.split('/')[0];
          if (!structure[category]) {
            structure[category] = [];
          }
          structure[category].push(file);
        }
      }
    } catch (error) {
      console.warn('Не удалось проанализировать структуру файлов');
    }
    return structure;
  }
  
  private analyzeDirectorySize(dirPath: string): {
    totalSize: number;
    fileCount: number;
    folderCount: number;
    averageFileSize: number;
  } {
    let totalSize = 0;
    let fileCount = 0;
    let folderCount = 0;
    
    try {
      const analyzeRecursive = (currentPath: string) => {
        if (!existsSync(currentPath)) return;
        
        const items = readdirSync(currentPath, { withFileTypes: true });
        
        for (const item of items) {
          const fullPath = join(currentPath, item.name);
          
          if (item.isDirectory()) {
            folderCount++;
            analyzeRecursive(fullPath);
          } else if (item.isFile()) {
            try {
              const stats = statSync(fullPath);
              totalSize += stats.size;
              fileCount++;
            } catch (error) {
              // Игнорируем ошибки доступа к файлам
            }
          }
        }
      };
      
      analyzeRecursive(dirPath);
      
    } catch (error) {
      console.warn(`Не удалось проанализировать директорию ${dirPath}:`, error);
    }
    
    return {
      totalSize,
      fileCount,
      folderCount,
      averageFileSize: fileCount > 0 ? totalSize / fileCount : 0
    };
  }

  private async logFinalStatistics(): Promise<void> {
    console.log(`\n✅ РЕОРГАНИЗАЦИЯ ЗАВЕРШЕНА`);
    console.log(`📊 Финальная статистика:`);
    console.log(`   📁 Создано папок: ${this.statistics.createdFolders}`);
    console.log(`   📄 Создано файлов: ${this.statistics.createdFiles}`);
    console.log(`   💾 Общий размер: ${Math.round(this.statistics.totalSize / 1024)} KB`);
    console.log(`   ⏱️ Время выполнения: ${this.statistics.executionTime}ms`);
    
    // Детальная статистика размеров
    console.log(`\n📊 ДЕТАЛЬНАЯ СТАТИСТИКА РАЗМЕРОВ:`);
    console.log(`   📦 Исходный размер: ${Math.round(this.sizeAnalysis.originalSize / 1024)} KB`);
    console.log(`   📦 Реорганизованный размер: ${Math.round(this.sizeAnalysis.reorganizedSize / 1024)} KB`);
    console.log(`   📉 Сокращение: ${Math.round(this.sizeAnalysis.sizeReduction / 1024)} KB (${this.sizeAnalysis.sizeReductionPercent.toFixed(1)}%)`);
    console.log(`   📁 Файлов: ${this.sizeAnalysis.fileCount.original} → ${this.sizeAnalysis.fileCount.reorganized}`);
    console.log(`   📂 Папок: ${this.sizeAnalysis.folderCount.original} → ${this.sizeAnalysis.folderCount.reorganized}`);
    console.log(`   📏 Средний размер файла: ${Math.round(this.sizeAnalysis.averageFileSize.original)} → ${Math.round(this.sizeAnalysis.averageFileSize.reorganized)} bytes`);
    
    if (this.errors.length > 0) {
      console.log(`   ❌ Ошибки: ${this.errors.length}`);
      this.errors.forEach(error => console.log(`      - ${error}`));
    }
    
    if (this.warnings.length > 0) {
      console.log(`   ⚠️ Предупреждения: ${this.warnings.length}`);
      this.warnings.forEach(warning => console.log(`      - ${warning}`));
    }
  }
}
