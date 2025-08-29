import { Server, ServerWebSocket } from "bun";
import { rmSync, mkdirSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync, appendFileSync } from "fs";
import { join } from "path";
import { safeLog, logIncomingMessage, logOutgoingCommand } from "./utils/logger";
import { 
  saveRawDataImmediately, 
  saveBatchData, 
  saveNodeImage, 
  saveAllNodesExport, 
  saveIncomingMessageLog,
  saveExportStatistics,
  saveValidationReport,
  readFileSafe,
  getFileSize,
  ensureDirectoryExists,
  getFilesInDirectory
} from "./utils/fileUtils";
// import { FigmaBatchReorganizer } from "./utils/reorganizer"; // ОТЛОЖЕНО

// Глобальные переменные для хранения ID нод
let documentNodeIds: string[] = [];
let selectedNodeIds: string[] = [];
let processedNodes = new Set<string>(); // Set для отслеживания обработанных нод
let nodeQueue: string[] = []; // Queue для обработки нод согласно ТЗ
let savedFiles: string[] = []; // Stack для отслеживания сохраненных файлов
let currentConnection: ServerWebSocket<any> | null = null; // Единственное соединение с Figma
let structureTimeout: ReturnType<typeof setTimeout> | null = null;

// Функция для логирования в файл
function logToFile(message: string) {
  try {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}\n`;
    const logPath = join('./export', 'export_log.txt');
    
    // Создаем папку export если её нет
    const exportDir = './export';
    if (!existsSync(exportDir)) {
      mkdirSync(exportDir, { recursive: true });
    }
    
    appendFileSync(logPath, logMessage);
  } catch (error) {
    console.error(`❌ Error writing to log file:`, error);
  }
}

// Состояние экспорта
const exportState = {
  timeout: 300000, // 5 минут
      batchSize: 4, // Установлен размер батча в 4 ноды
  documentStructure: null as any,
  currentStage: 1,
  isExporting: false,
  isExportCompleted: false, // Добавляем флаг завершения экспорта
  // Добавляем счетчики для отслеживания этапов
  stage3Completed: 0,
  stage3Total: 4, // get_styles, get_local_components, get_document_info, get_annotations
  stage4Completed: 0,
  stage4Total: 0,
  stage5Completed: 0,
  stage5Total: 6, // scan_text_nodes, scan_nodes_by_types, create_connections, get_reactions, get_instance_overrides, get_selection
  stage6Started: false,
  imagesExported: false, // Флаг для предотвращения повторного экспорта изображений
  processedNodes: processedNodes,
  nodeQueue: nodeQueue,
  savedFiles: savedFiles,
  cachedNodes: new Set<string>(),
  startTime: Date.now(),
  commandsUsed: [
    'read_my_design',
    'get_styles',
    'get_local_components', 
    'get_document_info',
    'get_annotations',
    'get_nodes_info',
    'get_instance_overrides',
    'get_reactions',
    'scan_text_nodes',
    'scan_nodes_by_types',
    'create_connections',
    'get_selection'
  ]
};

// Функция для очистки папки export
function clearExportFolder() {
  try {
    const exportDir = './export';
    
    // Принудительно удаляем папку если она существует
    if (existsSync(exportDir)) {
      console.log(`🗑️ Force clearing export folder: ${exportDir}`);
      logToFile(`🗑️ Force clearing export folder: ${exportDir}`);
      
      // Пробуем несколько способов удаления
      try {
        // Способ 1: Обычное удаление
        rmSync(exportDir, { recursive: true, force: true });
        console.log(`✅ Export folder cleared successfully`);
        logToFile(`✅ Export folder cleared successfully`);
      } catch (rmError: any) {
        console.log(`⚠️ First attempt failed: ${rmError.message}`);
        logToFile(`⚠️ First attempt failed: ${rmError.message}`);
        
        // Способ 2: Удаление через PowerShell
        try {
          const { execSync } = require('child_process');
          execSync(`powershell -Command "Remove-Item -Path '${exportDir}' -Recurse -Force -ErrorAction SilentlyContinue"`, { stdio: 'ignore' });
          console.log(`✅ Export folder cleared via PowerShell`);
          logToFile(`✅ Export folder cleared via PowerShell`);
        } catch (psError: any) {
          console.log(`⚠️ PowerShell attempt failed: ${psError.message}`);
          logToFile(`⚠️ PowerShell attempt failed: ${psError.message}`);
          
          // Способ 3: Удаление файлов по одному
          try {
            const fs = require('fs');
            const path = require('path');
            
            function removeDirectoryRecursive(dirPath: string) {
              if (existsSync(dirPath)) {
                const files = fs.readdirSync(dirPath);
                for (const file of files) {
                  const curPath = path.join(dirPath, file);
                  if (fs.lstatSync(curPath).isDirectory()) {
                    removeDirectoryRecursive(curPath);
                  } else {
                    fs.unlinkSync(curPath);
                  }
                }
                fs.rmdirSync(dirPath);
              }
            }
            
            removeDirectoryRecursive(exportDir);
            console.log(`✅ Export folder cleared via recursive deletion`);
            logToFile(`✅ Export folder cleared via recursive deletion`);
          } catch (recursiveError: any) {
            console.log(`❌ All deletion methods failed: ${recursiveError.message}`);
            logToFile(`❌ All deletion methods failed: ${recursiveError.message}`);
            throw new Error(`Could not clear export folder: ${recursiveError.message}`);
          }
        }
      }
    }
    
    // Создаем новую папку
    console.log(`📁 Creating new export folder: ${exportDir}`);
    logToFile(`📁 Creating new export folder: ${exportDir}`);
    mkdirSync(exportDir, { recursive: true });
    
    // Создаем структуру подпапок согласно ТЗ
    const subdirs = [
      'metadata', 'structure', 'styles', 'components', 'nodes',
      'interactions', 'overrides', 'annotations', 'batches', 'images'
    ];
    
    subdirs.forEach(dir => {
      mkdirSync(join(exportDir, dir), { recursive: true });
    });
    
    console.log(`✅ Export folder cleared and structure created`);
    logToFile(`✅ Export folder cleared and structure created`);
  } catch (error) {
    console.error(`❌ Error clearing export folder:`, error);
    logToFile(`❌ Error clearing export folder: ${error}`);
    process.exit(1);
  }
}

// Функция для сброса состояния экспорта
function resetExportState() {
  processedNodes.clear();
  nodeQueue.length = 0;
  savedFiles.length = 0;
  exportState.isExporting = false;
  exportState.isExportCompleted = false; // Сбрасываем флаг завершения
  exportState.currentStage = 1;
  exportState.documentStructure = null;
  // Сбрасываем счетчики этапов
  exportState.stage3Completed = 0;
  exportState.stage4Completed = 0;
  exportState.stage4Total = 0;
  exportState.stage5Completed = 0;
  exportState.stage6Started = false;
  exportState.imagesExported = false; // Сбрасываем флаг экспорта изображений
  console.log(`🔄 Export state reset`);
}

// Функция для немедленного сохранения данных
function saveDataImmediately(dataType: string, data: any, fileName?: string) {
  try {
    const fs = require('fs');
    const path = require('path');
    const exportDir = './export';
    
    let filePath: string;
    let fileNameToUse: string;
    
    switch (dataType) {
      case 'documentStructure':
        fileNameToUse = 'document_structure.json';
        filePath = path.join(exportDir, 'structure', fileNameToUse);
        break;
      case 'styles':
        // Сохраняем стили в отдельные файлы согласно ТЗ
        if (data.colors) {
          const colorsPath = path.join(exportDir, 'styles', 'colors.json');
          fs.writeFileSync(colorsPath, JSON.stringify(data.colors, null, 2));
          savedFiles.push(colorsPath);
        }
        if (data.textStyles) {
          const typographyPath = path.join(exportDir, 'styles', 'typography.json');
          fs.writeFileSync(typographyPath, JSON.stringify(data.textStyles, null, 2));
          savedFiles.push(typographyPath);
        }
        if (data.effectStyles) {
          const effectsPath = path.join(exportDir, 'styles', 'effects.json');
          fs.writeFileSync(effectsPath, JSON.stringify(data.effectStyles, null, 2));
          savedFiles.push(effectsPath);
        }
        if (data.gridStyles) {
          const gridsPath = path.join(exportDir, 'styles', 'grids.json');
          fs.writeFileSync(gridsPath, JSON.stringify(data.gridStyles, null, 2));
          savedFiles.push(gridsPath);
        }
        return; // Выходим, так как уже сохранили отдельные файлы
      case 'components':
        fileNameToUse = 'local_components.json';
        filePath = path.join(exportDir, 'components', fileNameToUse);
        break;
      case 'documentInfo':
        fileNameToUse = 'document_info.json';
        filePath = path.join(exportDir, 'metadata', fileNameToUse);
        break;
      case 'annotations':
        fileNameToUse = 'all_annotations.json';
        filePath = path.join(exportDir, 'annotations', fileNameToUse);
        break;
      case 'textNodes':
        fileNameToUse = 'text_nodes.json';
        filePath = path.join(exportDir, 'nodes', fileNameToUse);
        break;
      case 'nodesByTypes':
        fileNameToUse = 'nodes_by_types.json';
        filePath = path.join(exportDir, 'nodes', fileNameToUse);
        break;
      case 'reactions':
        fileNameToUse = 'reactions.json';
        filePath = path.join(exportDir, 'interactions', fileNameToUse);
        break;
      case 'instanceOverrides':
        fileNameToUse = 'instance_overrides.json';
        filePath = path.join(exportDir, 'overrides', fileNameToUse);
        break;
      case 'connections':
        fileNameToUse = 'connections.json';
        filePath = path.join(exportDir, 'interactions', fileNameToUse);
        break;
      case 'batch':
        // Используем ID из данных для имени файла
        const batchId = data?.id || data?.messageId || Date.now().toString();
        const cleanBatchId = batchId.toString().replace(/[<>:"/\\|?*]/g, '_');
        fileNameToUse = `batch_${cleanBatchId}.json`;
        filePath = path.join(exportDir, 'batches', fileNameToUse);
        break;
      case 'images':
        // Используем nodeId для имени файла изображения
        const imageId = data?.nodeId || data?.id || Date.now().toString();
        const cleanImageId = imageId.toString().replace(/[<>:"/\\|?*]/g, '_');
        fileNameToUse = `image_${cleanImageId}.json`;
        filePath = path.join(exportDir, 'images', fileNameToUse);
        
        // Автоматически извлекаем изображение из JSON сразу после сохранения
        setTimeout(async () => {
          try {
            const { extractImageFromFile } = await import('./utils/imageExtractor');
            const result = extractImageFromFile(filePath);
            if (result.success) {
              console.log(`🖼️ Автоматически извлечено изображение: ${result.outputPath}`);
            }
          } catch (error) {
            console.log(`⚠️ Ошибка при автоматическом извлечении: ${error}`);
          }
        }, 100);
        break;
      case 'all_nodes_export':
        // Используем ID команды для имени файла
        const exportId = data?.id || data?.messageId || Date.now().toString();
        const cleanExportId = exportId.toString().replace(/[<>:"/\\|?*]/g, '_');
        fileNameToUse = `all_nodes_export_${cleanExportId}.json`;
        filePath = path.join(exportDir, fileNameToUse);
        break;
      case 'vectors':
        fileNameToUse = 'vector_nodes.json';
        filePath = path.join(exportDir, 'nodes', fileNameToUse);
        break;
      case 'exportStatistics':
        fileNameToUse = 'export_statistics.json';
        filePath = path.join(exportDir, 'metadata', fileNameToUse);
        break;
      default:
        fileNameToUse = `${dataType}_${Date.now()}.json`;
        filePath = path.join(exportDir, fileNameToUse);
    }
    
    // ИСПОЛЬЗУЕМ БЕЗОПАСНОЕ ЛОГИРОВАНИЕ ДЛЯ БОЛЬШИХ ДАННЫХ
    // Все данные сначала сохраняются на диск, в лог выводится только превью
    safeLogWithSizeLimit({
      message: `Saved ${dataType} data`,
      data: data,
      dataType: dataType,
      filePath: filePath,
      maxPreviewLength: 100
    });
    
    savedFiles.push(filePath);
    
  } catch (error) {
    console.error(`❌ Error saving ${dataType}:`, error);
    process.exit(1);
  }
}

// Функция для извлечения всех node ID из структуры документа (Tree Traversal DFS)
function extractNodeIds(node: any, ids: Set<string> = new Set()): Set<string> {
  if (!node) return ids;
  
  if (node.id && typeof node.id === 'string') {
    ids.add(node.id);
  }
  
  if (node.children && Array.isArray(node.children)) {
    node.children.forEach((child: any) => {
      extractNodeIds(child, ids);
    });
  }
  
  return ids;
}

// Функция для извлечения ID нод из структуры документа
function extractNodeIdsFromStructure(structure: any): string[] {
  const nodeIds: string[] = [];
  
  function traverse(node: any) {
    if (node && node.id) {
      // Фильтруем только валидные node IDs (не instance IDs)
      const nodeId = node.id;
      if (nodeId && !nodeId.includes(';') && !nodeId.startsWith('I')) {
        nodeIds.push(nodeId);
      }
    }
    if (node && node.children && Array.isArray(node.children)) {
      node.children.forEach(traverse);
    }
  }
  
  console.log(`🔍 === DEBUG: extractNodeIdsFromStructure ===`);
  console.log(`🔍 Input structure type: ${typeof structure}`);
  console.log(`🔍 Input structure keys: ${structure ? Object.keys(structure) : 'null'}`);
  
  // Обрабатываем структуру документа
  if (structure && typeof structure === 'object') {
    // Если это массив, обрабатываем каждый элемент
    if (Array.isArray(structure)) {
      console.log(`🔍 Processing as array with ${structure.length} elements`);
      structure.forEach((item: any, index: number) => {
        console.log(`🔍 Processing array item ${index}:`, {
          hasDocument: !!(item && item.document),
          hasId: !!(item && item.id),
          hasNodeId: !!(item && item.nodeId),
          itemType: typeof item,
          itemKeys: item ? Object.keys(item) : 'null'
        });
        
        // Проверяем структуру элемента массива
        if (item && item.document) {
          console.log(`🔍 Traversing item.document`);
          traverse(item.document);
        } else if (item && item.nodeId) {
          console.log(`🔍 Adding nodeId: ${item.nodeId}`);
          nodeIds.push(item.nodeId);
        } else if (item && item.id) {
          console.log(`🔍 Traversing item directly`);
          traverse(item);
        } else {
          console.log(`🔍 Item has no document, nodeId, or id property`);
        }
      });
    } else {
      // Если это объект с числовыми ключами (результат read_my_design)
      if (Object.keys(structure).every(key => !isNaN(Number(key)))) {
        console.log(`🔍 Detected object with numeric keys (read_my_design result)`);
        console.log(`🔍 Object has ${Object.keys(structure).length} numeric keys`);
        
        // Обрабатываем каждый элемент объекта
        Object.values(structure).forEach((item: any, index: number) => {
          console.log(`🔍 Processing item ${index}:`, {
            hasDocument: !!(item && item.document),
            hasId: !!(item && item.id),
            hasNodeId: !!(item && item.nodeId),
            itemType: typeof item,
            itemKeys: item ? Object.keys(item) : 'null'
          });
          
          if (item && item.document) {
            console.log(`🔍 Traversing item.document`);
            traverse(item.document);
          } else if (item && item.nodeId) {
            console.log(`🔍 Adding nodeId: ${item.nodeId}`);
            nodeIds.push(item.nodeId);
          } else if (item && item.id) {
            console.log(`🔍 Traversing item directly`);
            traverse(item);
          } else {
            console.log(`🔍 Item has no document, nodeId, or id property`);
          }
        });
      } else {
        // Если это обычный объект, обрабатываем его
        console.log(`🔍 Processing as regular object`);
        traverse(structure);
      }
    }
  }
  
  console.log(`🔍 Extracted ${nodeIds.length} node IDs from document structure`);
  if (nodeIds.length > 0) {
    console.log(`📋 Sample node IDs: ${nodeIds.slice(0, 5).join(', ')}${nodeIds.length > 5 ? `... and ${nodeIds.length - 5} more` : ''}`);
  } else {
    console.log(`❌ WARNING: No node IDs extracted!`);
  }
  
  console.log(`🔍 === END DEBUG ===`);
  return nodeIds;
}

// Функция для получения только корневых фреймов (основных слоев)
function getRootFrameIds(): string[] {
  console.log(`🔍 === DEBUG: getRootFrameIds ===`);
  
  // Используем ТОЛЬКО выделенные ноды (это и есть корневые фреймы)
  if (selectedNodeIds.length > 0) {
    console.log(`🔍 Found ${selectedNodeIds.length} selected root frames: ${selectedNodeIds.join(', ')}`);
    return selectedNodeIds;
  }
  
  // Если нет выделенных нод, не экспортируем ничего
  console.log(`⚠️ No selected nodes found - skipping image export`);
  console.log(`🔍 === END DEBUG: getRootFrameIds ===`);
  return [];
}

// Функция для получения всех выделенных node ID
function getSelectedNodeIds(): string[] {
  console.log(`🔍 === DEBUG: getSelectedNodeIds ===`);
  
  // Сначала пробуем выделенные ноды
  if (selectedNodeIds.length > 0) {
    console.log(`🔍 Found ${selectedNodeIds.length} selected node IDs`);
    return selectedNodeIds;
  }
  
  // Затем пробуем ноды из структуры документа
  if (documentNodeIds.length > 0) {
    console.log(`🔍 Using ${documentNodeIds.length} document node IDs`);
    return documentNodeIds;
  }
  
  console.log(`⚠️ No valid node IDs found for image export`);
  console.log(`🔍 === END DEBUG: getSelectedNodeIds ===`);
  return [];
}

// Функция для получения первого валидного ID ноды
function getFirstValidNodeId(): string {
  console.log(`🔍 === DEBUG: getFirstValidNodeId ===`);
  console.log(`🔍 selectedNodeIds length: ${selectedNodeIds.length}`);
  console.log(`🔍 documentNodeIds length: ${documentNodeIds.length}`);
  
  // Сначала пробуем выделенные ноды
  if (selectedNodeIds.length > 0) {
    console.log(`🔍 Using selected node ID: ${selectedNodeIds[0]}`);
    return selectedNodeIds[0];
  }
  
  // Затем пробуем ноды из структуры документа
  if (documentNodeIds.length > 0) {
    console.log(`🔍 Using document node ID: ${documentNodeIds[0]}`);
    return documentNodeIds[0];
  }
  
  // Если ничего нет, возвращаем null и пропускаем команду
  console.log(`⚠️ No valid node IDs found, skipping command`);
  console.log(`🔍 === END DEBUG: getFirstValidNodeId ===`);
  return '';
}

// Функция для обработки батча нод
function processNodeBatch(nodeIds: string[]) {
  console.log(`📦 Processing batch of ${nodeIds.length} nodes`);
  console.log(`📋 Node IDs: ${nodeIds.slice(0, 5).join(', ')}${nodeIds.length > 5 ? `... and ${nodeIds.length - 5} more` : ''}`);
  logToFile(`📦 Processing batch of ${nodeIds.length} nodes: ${nodeIds.join(', ')}`);
  
  // ТОЛЬКО get_nodes_info - убираем параллельные команды
  const batchId = Date.now();
  const nodesInfoMessage = {
    id: `stage4-nodes-${batchId}`,
    type: 'message',
    channel: currentConnection?.data?.channel,
    message: {
      id: `stage4-nodes-${batchId}`,
      command: 'get_nodes_info',
      params: {
        nodeIds: nodeIds
      }
    }
  };
  
  console.log(`📤 Sending get_nodes_info for ${nodeIds.length} nodes...`);
  console.log(`⏳ This is a LIGHT operation for debugging...`);
  logToFile(`📤 Sending get_nodes_info for ${nodeIds.length} nodes`);
  
  currentConnection?.send(JSON.stringify(nodesInfoMessage));
  console.log(`✅ Message sent to WebSocket`);
  logToFile(`✅ get_nodes_info message sent to WebSocket`);
  
  // Убираем таймаут - ждем ответа
  console.log(`⏳ Waiting for response...`);
  logToFile(`⏳ Waiting for get_nodes_info response...`);
}

// Функция для обработки следующего батча
function processNextBatch() {
  if (nodeQueue.length === 0) {
    console.log(`✅ All batches processed! Moving to Stage 5...`);
    logToFile(`✅ All batches processed! Moving to Stage 5...`);
    setTimeout(() => {
      startStage5SpecializedExport();
    }, 1000);
    return;
  }
  
  // Берем batchSize нод из очереди
  const batchSize = exportState.batchSize;
  const nextBatch = nodeQueue.splice(0, batchSize);
  if (nextBatch.length > 0) {
    console.log(`📦 Processing next batch...`);
    logToFile(`📦 Processing next batch...`);
    processNodeBatch(nextBatch);
  }
}

// Функция для запуска Этапа 4: Рекурсивная обработка нод
function startStage4RecursiveProcessing() {
  console.log(`🔄 Stage 4: Starting recursive node processing...`);
  logToFile(`🔄 Stage 4: Starting recursive node processing...`);
  
  if (!exportState.documentStructure) {
    console.error(`❌ No document structure available for Stage 4`);
    console.error(`❌ This means Stage 2 (read_my_design) failed or didn't save structure`);
    return;
  }
  
  console.log(`🔍 === DEBUG: Stage 4 ===`);
  console.log(`🔍 Document structure type: ${typeof exportState.documentStructure}`);
  console.log(`🔍 Document structure keys: ${exportState.documentStructure ? Object.keys(exportState.documentStructure) : 'null'}`);
  console.log(`🔍 Document structure preview:`, JSON.stringify(exportState.documentStructure, null, 2).substring(0, 500) + '...');
  
  // Извлекаем все ID нод из структуры документа
  documentNodeIds = extractNodeIdsFromStructure(exportState.documentStructure);
  console.log(`📊 Found ${documentNodeIds.length} total document node IDs`);
  
  if (documentNodeIds.length === 0) {
    console.error(`❌ No node IDs extracted from document structure!`);
    console.error(`❌ This means extractNodeIdsFromStructure is not working correctly`);
    console.error(`❌ Document structure:`, exportState.documentStructure);
    return;
  }
  
  // Фильтруем уже обработанные
  const newNodeIds = documentNodeIds.filter(id => !processedNodes.has(id));
  console.log(`📦 Found ${newNodeIds.length} new nodes to process`);
  console.log(`🔍 === END DEBUG: Stage 4 ===`);
  
  if (newNodeIds.length === 0) {
    console.log(`✅ All nodes already processed, moving to Stage 5`);
    startStage5SpecializedExport();
    return;
  }
  
  // Батчевая обработка - последовательно
  const batchSize = exportState.batchSize;
  const totalBatches = Math.ceil(newNodeIds.length / batchSize);
  
  // Устанавливаем общее количество батчей для отслеживания
  exportState.stage4Total = totalBatches;
  exportState.stage4Completed = 0;
  
  console.log(`📊 Stage 4: Will process ${totalBatches} batches of ${batchSize} nodes each`);
  logToFile(`📊 Stage 4: Will process ${totalBatches} batches of ${batchSize} nodes each`);
  
  // Добавляем все ноды в очередь
  nodeQueue.push(...newNodeIds);
  
  // Начинаем обработку первого батча
  console.log(`🔄 Starting sequential batch processing...`);
  logToFile(`🔄 Starting sequential batch processing...`);
  processNextBatch();
}

// Функция для Этапа 6: Рекурсивное углубление
function startStage6RecursiveDeepening() {
  console.log(`🔄 Stage 6: Starting recursive deepening analysis...`);
  
  try {
    const batchesDir = './export/batches';
    if (!existsSync(batchesDir)) {
      console.log(`⚠️ No batches directory found, skipping Stage 6`);
      finishExport();
      return;
    }
    
    const batchFiles = readdirSync(batchesDir).filter(file => file.endsWith('.json'));
    console.log(`📁 Found ${batchFiles.length} batch files to analyze`);
    
    if (batchFiles.length === 0) {
      console.log(`⚠️ No batch files found, skipping Stage 6`);
      finishExport();
      return;
    }
    
    const newNodeIds = new Set<string>();
    
    // Анализируем каждый батч-файл
    batchFiles.forEach(file => {
      try {
        const filePath = join(batchesDir, file);
        const content = readFileSync(filePath, 'utf8');
        const batchData = JSON.parse(content);
        
        // Извлекаем новые node ID из сохраненных данных
        extractNodeIds(batchData, newNodeIds);
        
      } catch (error) {
        console.error(`❌ Error reading batch file ${file}:`, error);
      }
    });
    
    // Фильтруем уже обработанные ID
    const filteredNewIds = Array.from(newNodeIds).filter(id => !processedNodes.has(id));
    
    console.log(`🔍 Found ${filteredNewIds.length} new node IDs in batch files`);
    
    if (filteredNewIds.length > 0) {
      // Добавляем в очередь для обработки согласно ТЗ
      nodeQueue.push(...filteredNewIds);
      console.log(`📥 Added ${filteredNewIds.length} new nodes to queue`);
      
      // Обрабатываем батчами (повтор Этапа 4)
      const batchSize = exportState.batchSize;
      let processedBatches = 0;
      const totalBatches = Math.ceil(filteredNewIds.length / batchSize);
      
      console.log(`📊 Stage 6: Will process ${totalBatches} batches of ${batchSize} nodes each`);
      
      for (let i = 0; i < filteredNewIds.length; i += batchSize) {
        const batch = filteredNewIds.slice(i, i + batchSize);
        setTimeout(() => {
          processNodeBatch(batch);
          processedBatches++;
          
          // Когда все батчи обработаны, завершаем экспорт
          if (processedBatches === totalBatches) {
            console.log(`✅ Stage 6 completed! All recursive nodes processed`);
            setTimeout(() => {
              finishExport();
            }, 2000);
          }
        }, i * 100);
      }
    } else {
      console.log(`✅ No new nodes found - recursive deepening complete`);
      finishExport();
    }
    
  } catch (error) {
    console.error(`❌ Error in Stage 6 recursive deepening:`, error);
    process.exit(1);
  }
}

// Функция для запуска Этапа 5: Получение выделения и экспорт изображений
function startStage5SpecializedExport() {
  console.log(`🖼️ Stage 5: Getting selection and exporting images...`);
  logToFile(`🖼️ Stage 5: Getting selection and exporting images...`);
  
  // Сначала получаем текущее выделение
  setTimeout(() => {
    console.log(`📋 Stage 5.1: Getting current selection...`);
    const selectionMessage = {
      id: 'stage5-selection-' + Date.now(),
      type: 'message',
      channel: currentConnection?.data?.channel,
      message: {
        id: 'stage5-selection-' + Date.now(),
        command: 'get_selection'
      }
    };
    currentConnection?.send(JSON.stringify(selectionMessage));
  }, 1000);
  
  // Затем экспортируем изображения для выделенных нод
  setTimeout(() => {
    console.log(`🖼️ Stage 5.2: Exporting images for selected frames...`);
    
    // Получаем выделенные ноды
    const rootFrameIds = getRootFrameIds();
    console.log(`📊 Найдено ${rootFrameIds.length} выделенных фреймов для экспорта изображений`);
    
    if (rootFrameIds.length === 0) {
      console.log(`⚠️ Нет выделенных фреймов для экспорта изображений`);
      finishExport();
      return;
    }
    
    // Экспортируем изображения для выделенных фреймов
    rootFrameIds.forEach((nodeId, index) => {
      setTimeout(() => {
        console.log(`🖼️ Экспорт изображения для выделенного фрейма: ${nodeId}`);
        const imageExportMessage = {
          id: 'stage5-image-export-' + Date.now() + '-' + index,
          type: 'message',
          channel: currentConnection?.data?.channel,
          message: {
            id: 'stage5-image-export-' + Date.now() + '-' + index,
            command: 'export_node_as_image',
            params: {
              nodeId: nodeId,
              format: 'PNG',
              constraint: 'SCALE',
              value: 4 // Увеличиваем масштаб до 4x для более высокого разрешения
            }
          }
        };
        currentConnection?.send(JSON.stringify(imageExportMessage));
        
        // После отправки последнего изображения завершаем экспорт
        if (index === rootFrameIds.length - 1) {
          setTimeout(() => {
            console.log(`✅ Все изображения отправлены, завершаем экспорт`);
            finishExport();
          }, 2000); // Ждем 2 секунды для получения ответов
        }
      }, index * 1000); // Задержка 1 секунда между экспортами
    });
  }, 2000); // Ждем 1 секунду после получения выделения
}

// Функция для завершения экспорта
function finishExport() {
  console.log(`🎯 Starting final export processing...`);
  logToFile(`🎯 Starting final export processing...`);
  
  // Сохраняем финальную статистику
  const finalStatistics = {
    totalProcessedNodes: exportState.processedNodes.size,
    processedNodes: Array.from(exportState.processedNodes),
    nodeQueueLength: exportState.nodeQueue.length,
    savedFilesCount: savedFiles.length,
    cachedNodesCount: exportState.cachedNodes.size,
    commandsUsed: exportState.commandsUsed,
    exportDuration: Date.now() - exportState.startTime,
    completedAt: new Date().toISOString()
  };
  
  saveDataImmediately('metadata', finalStatistics, 'export_statistics.json');
  
  console.log(`📊 Export statistics:`);
  console.log(`   - Processed nodes: ${finalStatistics.totalProcessedNodes}`);
  console.log(`   - Saved files: ${finalStatistics.savedFilesCount}`);
  console.log(`   - Cached nodes: ${finalStatistics.cachedNodesCount}`);
  console.log(`   - Commands used: ${finalStatistics.commandsUsed}`);
  
  // Валидация результата
  validateExportResult();
  
                // Запускаем обработку батчей после завершения экспорта
              setTimeout(() => {
                processBatchesAndOrganizeData();
              }, 2000);

                              // РЕОРГАНИЗАЦИЯ ОТЛОЖЕНА - запускаем без неё
                console.log(`⏸️ Реорганизация отложена - экспорт завершен`);
  
  // Автоматическое извлечение изображений из JSON файлов
  setTimeout(async () => {
    try {
      console.log(`🖼️ Автоматическое извлечение изображений...`);
      const { extractImagesFromJsonFiles } = await import('./utils/imageExtractor');
      const result = extractImagesFromJsonFiles();
      
      if (result.success) {
        console.log(`✅ Извлечено изображений: ${result.extractedCount}`);
        console.log(`📁 Папка с изображениями: ${result.outputDir}`);
      } else {
        console.log(`⚠️ Ошибка при извлечении изображений: ${result.error}`);
      }
    } catch (error) {
      console.log(`⚠️ Не удалось извлечь изображения: ${error}`);
    }
  }, 1000);

  // Финальное сообщение о завершении
  setTimeout(() => {
    const durationMinutes = Math.round(finalStatistics.exportDuration / 1000 / 60 * 10) / 10; // Округляем до 1 знака после запятой
    console.log(`🎉 EXPORT COMPLETED SUCCESSFULLY!`);
    console.log(`📁 All data saved to export/ folder`);
    console.log(`📊 Total files: ${savedFiles.length}`);
    console.log(`⏱️ Duration: ${durationMinutes} minutes`);
    logToFile(`🎉 EXPORT COMPLETED SUCCESSFULLY! Total files: ${savedFiles.length}, Duration: ${durationMinutes} minutes`);
    
    // Сбрасываем состояние для следующего экспорта
    resetExportState();
  }, 3000);
}

// Функция для валидации результата экспорта
function validateExportResult() {
  console.log(`🔍 Starting export result validation...`);
  
  try {
    const exportDir = './export';
    const validationReport = {
      timestamp: new Date().toISOString(),
      validationComplete: false,
      structureValidation: {
        requiredDirs: ['metadata', 'structure', 'styles', 'components', 'nodes', 'interactions', 'overrides', 'annotations', 'batches', 'images'],
        foundDirs: [] as string[],
        missingDirs: [] as string[],
        valid: false
      },
      fileValidation: {
        totalFiles: 0,
        validJsonFiles: 0,
        invalidJsonFiles: 0,
        totalSize: 0
      },
      dataAnalysis: {
        documentStructure: false,
        styles: false,
        components: false,
        nodes: false,
        annotations: false,
        reactions: false,
        overrides: false,
        connections: false,
        images: false,
        vectors: false
      },
      statistics: {
        totalElements: 0,
        elementsByType: {
          'documentStructure': 0,
          'styles': 0,
          'components': 0,
          'nodes': 0,
          'annotations': 0,
          'reactions': 0,
          'overrides': 0,
          'connections': 0,
          'images': 0,
          'vectors': 0,
          'batches': 0
        } as Record<string, number>
      }
    };
    
    // 1. Сканирование папки export
    if (!existsSync(exportDir)) {
      console.error(`❌ Export directory not found`);
      process.exit(1);
    }
    
    const allFiles = readdirSync(exportDir, { recursive: true });
    validationReport.fileValidation.totalFiles = allFiles.length;
    
    // 2. Проверка структуры
    const foundDirs = new Set<string>();
    allFiles.forEach((file: any) => {
      if (typeof file === 'string') {
        const dir = file.split('/')[0];
        if (dir) foundDirs.add(dir);
      }
    });
    
    validationReport.structureValidation.foundDirs = Array.from(foundDirs);
    validationReport.structureValidation.missingDirs = validationReport.structureValidation.requiredDirs.filter(
      dir => !foundDirs.has(dir)
    );
    validationReport.structureValidation.valid = validationReport.structureValidation.missingDirs.length === 0;
    
    // 3. Анализ содержимого
    allFiles.forEach((file: any) => {
      if (typeof file === 'string' && file.endsWith('.json')) {
        try {
          const filePath = join(exportDir, file);
          const content = readFileSync(filePath, 'utf8');
          const data = JSON.parse(content);
          const fileSize = statSync(filePath).size;
          
          validationReport.fileValidation.validJsonFiles++;
          validationReport.fileValidation.totalSize += fileSize;
          
          // Анализ типов данных
          if (file.includes('document_structure')) validationReport.dataAnalysis.documentStructure = true;
          if (file.includes('styles') || file.includes('colors') || file.includes('typography') || file.includes('effects') || file.includes('grids')) validationReport.dataAnalysis.styles = true;
          if (file.includes('components')) validationReport.dataAnalysis.components = true;
          if (file.includes('nodes')) validationReport.dataAnalysis.nodes = true;
          if (file.includes('annotations')) validationReport.dataAnalysis.annotations = true;
          if (file.includes('reactions')) validationReport.dataAnalysis.reactions = true;
          if (file.includes('overrides')) validationReport.dataAnalysis.overrides = true;
          if (file.includes('connections')) validationReport.dataAnalysis.connections = true;
          if (file.includes('images')) validationReport.dataAnalysis.images = true;
          if (file.includes('vectors')) validationReport.dataAnalysis.vectors = true;
          
          // Подсчет элементов
          if (Array.isArray(data)) {
            validationReport.statistics.totalElements += data.length;
          } else if (data && typeof data === 'object') {
            Object.keys(data).forEach(key => {
              if (Array.isArray(data[key])) {
                validationReport.statistics.elementsByType[key] = (validationReport.statistics.elementsByType[key] || 0) + data[key].length;
              }
            });
          }
          
        } catch (error) {
          validationReport.fileValidation.invalidJsonFiles++;
          console.error(`❌ Invalid JSON in file ${file}:`, error);
        }
      }
    });
    
    validationReport.validationComplete = true;
    
    // Сохраняем отчет
    const reportPath = join(exportDir, 'validation_report.json');
    require('fs').writeFileSync(reportPath, JSON.stringify(validationReport, null, 2));
    
    // Выводим отчет в консоль
    console.log(`\n📋 EXPORT VALIDATION REPORT:`);
    console.log(`   Structure validation: ${validationReport.structureValidation.valid ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   Total files: ${validationReport.fileValidation.totalFiles}`);
    console.log(`   Valid JSON files: ${validationReport.fileValidation.validJsonFiles}`);
    console.log(`   Invalid JSON files: ${validationReport.fileValidation.invalidJsonFiles}`);
    console.log(`   Total size: ${(validationReport.fileValidation.totalSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   Total elements: ${validationReport.statistics.totalElements}`);
    
    console.log(`\n📊 Data types found:`);
    Object.entries(validationReport.dataAnalysis).forEach(([type, found]) => {
      console.log(`   ${type}: ${found ? '✅' : '❌'}`);
    });
    
    console.log(`\n📈 Elements by type:`);
    Object.entries(validationReport.statistics.elementsByType).forEach(([type, count]) => {
      console.log(`   ${type}: ${count}`);
    });
    
    if (validationReport.structureValidation.valid && validationReport.fileValidation.invalidJsonFiles === 0) {
      console.log(`🎉 EXPORT VALIDATION PASSED! All requirements met.`);
    } else {
      console.log(`⚠️ EXPORT VALIDATION FAILED! Check validation_report.json for details.`);
    }
    
    // ДЕТАЛЬНЫЙ АНАЛИЗ ПОДОЗРИТЕЛЬНЫХ ОТВЕТОВ
    console.log(`\n🔍 ДЕТАЛЬНЫЙ АНАЛИЗ ПОДОЗРИТЕЛЬНЫХ ОТВЕТОВ:`);
    
    // Проверяем аннотации
    const annotationsPath = join(exportDir, 'annotations', 'all_annotations.json');
    if (existsSync(annotationsPath)) {
      try {
        const annotationsContent = readFileSync(annotationsPath, 'utf8');
        const annotationsData = JSON.parse(annotationsContent);
        console.log(`📝 Аннотации (${annotationsPath}):`);
        console.log(`   Размер файла: ${statSync(annotationsPath).size} байт`);
        console.log(`   Содержимое: ${annotationsContent.substring(0, 200)}...`);
        console.log(`   Тип данных: ${typeof annotationsData}`);
        console.log(`   Ключи: ${Object.keys(annotationsData).join(', ')}`);
        console.log(`   Пустой объект: ${Object.keys(annotationsData).length === 0 ? 'ДА' : 'НЕТ'}`);
      } catch (error) {
        console.log(`   ❌ Ошибка чтения аннотаций: ${error}`);
      }
    }
    
    // Проверяем реакции
    const reactionsPath = join(exportDir, 'interactions', 'reactions.json');
    if (existsSync(reactionsPath)) {
      try {
        const reactionsContent = readFileSync(reactionsPath, 'utf8');
        const reactionsData = JSON.parse(reactionsContent);
        console.log(`⚡ Реакции (${reactionsPath}):`);
        console.log(`   Размер файла: ${statSync(reactionsPath).size} байт`);
        console.log(`   Содержимое: ${reactionsContent.substring(0, 200)}...`);
        console.log(`   Тип данных: ${typeof reactionsData}`);
        console.log(`   Ключи: ${Object.keys(reactionsData).join(', ')}`);
        console.log(`   nodesCount: ${reactionsData.nodesCount || 'НЕТ'}`);
        console.log(`   nodesWithReactions: ${reactionsData.nodesWithReactions || 'НЕТ'}`);
        console.log(`   nodes массив: ${Array.isArray(reactionsData.nodes) ? reactionsData.nodes.length : 'НЕ МАССИВ'}`);
      } catch (error) {
        console.log(`   ❌ Ошибка чтения реакций: ${error}`);
      }
    }
    
    // Проверяем связи
    const connectionsPath = join(exportDir, 'interactions', 'connections.json');
    if (existsSync(connectionsPath)) {
      try {
        const connectionsContent = readFileSync(connectionsPath, 'utf8');
        const connectionsData = JSON.parse(connectionsContent);
        console.log(`🔗 Связи (${connectionsPath}):`);
        console.log(`   Размер файла: ${statSync(connectionsPath).size} байт`);
        console.log(`   Содержимое: ${connectionsContent.substring(0, 200)}...`);
        console.log(`   Тип данных: ${typeof connectionsData}`);
        console.log(`   Ключи: ${Object.keys(connectionsData).join(', ')}`);
        console.log(`   Пустой объект: ${Object.keys(connectionsData).length === 0 ? 'ДА' : 'НЕТ'}`);
      } catch (error) {
        console.log(`   ❌ Ошибка чтения связей: ${error}`);
      }
    }
    
    // Проверяем переопределения
    const overridesPath = join(exportDir, 'overrides', 'instance_overrides.json');
    if (existsSync(overridesPath)) {
      try {
        const overridesContent = readFileSync(overridesPath, 'utf8');
        const overridesData = JSON.parse(overridesContent);
        console.log(`🔄 Переопределения (${overridesPath}):`);
        console.log(`   Размер файла: ${statSync(overridesPath).size} байт`);
        console.log(`   Содержимое: ${overridesContent.substring(0, 200)}...`);
        console.log(`   Тип данных: ${typeof overridesData}`);
        console.log(`   Ключи: ${Object.keys(overridesData).join(', ')}`);
        console.log(`   success: ${overridesData.success || 'НЕТ'}`);
        console.log(`   message: ${overridesData.message || 'НЕТ'}`);
        console.log(`   Ошибка: ${overridesData.success === false ? 'ДА' : 'НЕТ'}`);
      } catch (error) {
        console.log(`   ❌ Ошибка чтения переопределений: ${error}`);
      }
    }
    
    // Проверяем логи команд
    const logsDir = join(exportDir, 'logs');
    if (existsSync(logsDir)) {
      const logFiles = readdirSync(logsDir).filter(file => file.includes('annotations') || file.includes('reactions') || file.includes('connections') || file.includes('overrides'));
      console.log(`📋 Логи команд (найдено ${logFiles.length} файлов):`);
      logFiles.forEach(file => {
        try {
          const logPath = join(logsDir, file);
          const logContent = readFileSync(logPath, 'utf8');
          const logData = JSON.parse(logContent);
          console.log(`   ${file}:`);
          console.log(`     Размер: ${statSync(logPath).size} байт`);
          console.log(`     Команда: ${logData.message?.command || 'НЕТ'}`);
          console.log(`     Результат: ${logData.message?.result ? 'ЕСТЬ' : 'НЕТ'}`);
          if (logData.message?.result) {
            const resultStr = JSON.stringify(logData.message.result);
            console.log(`     Размер результата: ${resultStr.length} символов`);
            console.log(`     Превью: ${resultStr.substring(0, 100)}...`);
          }
        } catch (error) {
          console.log(`     ❌ Ошибка чтения лога ${file}: ${error}`);
        }
      });
    }
    
    console.log(`\n📊 ВЫВОД: Все подозрительные ответы проанализированы выше.`);
    
    // Сбрасываем флаг экспорта
    exportState.isExporting = false;
  
} catch (error) {
    console.error(`❌ Error in validation:`, error);
    process.exit(1);
  }
}

// Функция для обработки батчей и раскладки данных по папкам
function processBatchesAndOrganizeData() {
  try {
    console.log(`🔄 Processing batches and organizing data...`);
    logToFile(`🔄 Processing batches and organizing data...`);
    
    const batchesDir = join('./export', 'batches');
    const nodesDir = join('./export', 'nodes');
    const componentsDir = join('./export', 'components');
    const stylesDir = join('./export', 'styles');
    
    if (!existsSync(batchesDir)) {
      console.log(`⚠️ No batches directory found`);
      return;
    }
    
    const batchFiles = readdirSync(batchesDir).filter(file => file.endsWith('.json'));
    console.log(`📦 Found ${batchFiles.length} batch files to process`);
    logToFile(`📦 Found ${batchFiles.length} batch files to process`);
    
    let totalNodes = 0;
    let totalComponents = 0;
    let totalStyles = 0;
    
    const organizedData = {
      nodes: [],
      components: [],
      styles: [],
      frames: [],
      text: [],
      instances: [],
      rectangles: [],
      groups: []
    };
    
    // Функция для рекурсивного обхода всех нод
    function traverseNode(node: any, parentId?: string) {
      if (!node || !node.id) return;
      
      totalNodes++;
      
      // Добавляем ноду в общий список
      organizedData.nodes.push({
        id: node.id,
        name: node.name,
        type: node.type,
        nodeId: node.id,
        parentId: parentId,
        absoluteBoundingBox: node.absoluteBoundingBox,
        fills: node.fills,
        strokes: node.strokes,
        characters: node.characters,
        style: node.style,
        cornerRadius: node.cornerRadius,
        children: node.children ? node.children.length : 0
      });
      
      // Категоризируем по типу
      switch (node.type) {
        case 'COMPONENT':
        case 'COMPONENT_SET':
          organizedData.components.push(node);
          totalComponents++;
          break;
        case 'FRAME':
          organizedData.frames.push(node);
          break;
        case 'TEXT':
          organizedData.text.push(node);
          break;
        case 'INSTANCE':
          organizedData.instances.push(node);
          break;
        case 'RECTANGLE':
          organizedData.rectangles.push(node);
          break;
        case 'GROUP':
          organizedData.groups.push(node);
          break;
      }
      
      // Обрабатываем стили
      if (node.fills && node.fills.length > 0) {
        organizedData.styles.push({
          nodeId: node.id,
          nodeName: node.name,
          type: 'fills',
          styles: node.fills
        });
        totalStyles++;
      }
      
      if (node.strokes && node.strokes.length > 0) {
        organizedData.styles.push({
          nodeId: node.id,
          nodeName: node.name,
          type: 'strokes',
          styles: node.strokes
        });
        totalStyles++;
      }
      
      // Рекурсивно обрабатываем дочерние элементы
      if (node.children && Array.isArray(node.children)) {
        node.children.forEach((child: any) => {
          traverseNode(child, node.id);
        });
      }
    }
    
    for (const batchFile of batchFiles) {
      const batchPath = join(batchesDir, batchFile);
      const batchData = JSON.parse(readFileSync(batchPath, 'utf8'));
      
      console.log(`📋 Processing batch: ${batchFile} (${batchData.length} items)`);
      logToFile(`📋 Processing batch: ${batchFile} (${batchData.length} items)`);
      
      for (const item of batchData) {
        if (item && item.document) {
          // Рекурсивно обрабатываем весь документ
          traverseNode(item.document);
        }
      }
    }
    
    // Создаем папки если их нет
    if (!existsSync(nodesDir)) mkdirSync(nodesDir, { recursive: true });
    if (!existsSync(componentsDir)) mkdirSync(componentsDir, { recursive: true });
    if (!existsSync(stylesDir)) mkdirSync(stylesDir, { recursive: true });
    
    // Сохраняем организованные данные
    writeFileSync(join(nodesDir, 'all_nodes.json'), JSON.stringify(organizedData.nodes, null, 2));
    writeFileSync(join(nodesDir, 'frames.json'), JSON.stringify(organizedData.frames, null, 2));
    writeFileSync(join(nodesDir, 'text_nodes.json'), JSON.stringify(organizedData.text, null, 2));
    writeFileSync(join(nodesDir, 'instances.json'), JSON.stringify(organizedData.instances, null, 2));
    writeFileSync(join(nodesDir, 'rectangles.json'), JSON.stringify(organizedData.rectangles, null, 2));
    writeFileSync(join(nodesDir, 'groups.json'), JSON.stringify(organizedData.groups, null, 2));
    
    writeFileSync(join(componentsDir, 'extracted_components.json'), JSON.stringify(organizedData.components, null, 2));
    writeFileSync(join(stylesDir, 'extracted_styles.json'), JSON.stringify(organizedData.styles, null, 2));
    
    const summary = {
      totalBatches: batchFiles.length,
      totalNodes: totalNodes,
      totalComponents: totalComponents,
      totalStyles: totalStyles,
      breakdown: {
        frames: organizedData.frames.length,
        text: organizedData.text.length,
        instances: organizedData.instances.length,
        rectangles: organizedData.rectangles.length,
        groups: organizedData.groups.length,
        components: organizedData.components.length
      },
      processedAt: new Date().toISOString()
    };
    
    writeFileSync(join('./export', 'batch_processing_summary.json'), JSON.stringify(summary, null, 2));
    
    console.log(`✅ Batch processing completed:`);
    console.log(`   📊 Total nodes: ${totalNodes}`);
    console.log(`   🧩 Components: ${totalComponents}`);
    console.log(`   🎨 Styles: ${totalStyles}`);
    console.log(`   📁 Files saved to organized folders`);
    
    logToFile(`✅ Batch processing completed: ${totalNodes} nodes, ${totalComponents} components, ${totalStyles} styles`);
    
    // РЕОРГАНИЗАЦИЯ ОТЛОЖЕНА - запускаем без неё
    console.log(`⏸️ Реорганизация отложена - экспорт завершен`);
    
  } catch (error) {
    console.error(`❌ Error processing batches:`, error);
    logToFile(`❌ Error processing batches: ${error}`);
  }
}

// Улучшенная функция безопасного логирования
function safeLogWithSizeLimit(logData: any) {
  const { message, data, dataType, filePath, maxPreviewLength = 100 } = logData;
  
  try {
    if (data !== undefined) {
      let targetPath = filePath;
      
      if (!targetPath) {
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
        
        fileId = fileId.replace(/[<>:"/\\|?*]/g, '_');
        
        const logsDir = join('./export', 'logs');
        if (!existsSync(logsDir)) {
          mkdirSync(logsDir, { recursive: true });
        }
        
        targetPath = join(logsDir, `${dataType}_${fileId}.json`);
      }
      
      // Сохраняем на диск
      writeFileSync(targetPath, JSON.stringify(data, null, 2));
      
      // Получаем размер файла
      const fileSize = (statSync(targetPath).size / 1024).toFixed(2);
      
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
      console.log(message);
      const logMessage = `[${new Date().toISOString()}] ${message}\n`;
      appendFileSync(join('./export', 'export_log.txt'), logMessage);
    }
    
  } catch (error) {
    console.error(`❌ Error in safeLog:`, error);
    console.log(message);
  }
}

// Обработчик подключения WebSocket
function handleConnection(ws: ServerWebSocket<any>) {
  console.log("📥 New client connected");
  
  ws.send(JSON.stringify({
    type: "system",
    message: "Please join to start export process",
  }));
  
  ws.close = () => {
    console.log("📤 Client disconnected");
    // Удаляем канал из данных соединения при отключении
    if (ws.data?.channel) {
      delete ws.data.channel;
    }
  };
}

// Основной сервер
const server = Bun.serve({
  port: 3055,
  fetch(req: Request, server: Server) {
    if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      });
    }

    const success = server.upgrade(req, {
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
    });

    if (success) {
      return;
    }

    return new Response("Figma Export WebSocket Server", {
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
    });
  },
  websocket: {
    open: handleConnection,
    message(ws: ServerWebSocket<any>, message: string | Buffer) {
      try {
        // БЕЗОПАСНОЕ ЛОГИРОВАНИЕ ВХОДЯЩИХ СООБЩЕНИЙ
        // Не выводим полное сообщение в консоль - только превью
        const messageString = message.toString();
        const messagePreview = messageString.length > 100 
          ? messageString.substring(0, 100) + '...'
          : messageString;
        console.log(`📥 Received message (${messageString.length} chars): ${messagePreview}`);
        
        const data = JSON.parse(message as string);
        
        if (!data || typeof data !== 'object') {
          console.error(`❌ ERROR: Invalid message format received`);
          process.exit(1);
        }
        
        console.log(`🔍 Message type: ${data.type}`);
        // Убираем полный вывод данных - оставляем только краткую информацию
        if (data.type === 'message' && data.message && data.message.result) {
          const result = data.message.result;
          const resultSize = JSON.stringify(result).length;
          const messageId = data.message.id || 'unknown';
          console.log(`📥 Received response for: ${messageId}`);
          console.log(`📥 Result type: ${typeof result}`);
          console.log(`📥 Result size: ${resultSize} characters`);
          
          // Детальный дебаг для read_my_design
          if (messageId.includes('read_my_design') || messageId.includes('stage2')) {
            console.log(`🔍 === DEBUG: read_my_design response ===`);
            console.log(`🔍 Result type: ${typeof result}`);
            console.log(`🔍 Result keys: ${result ? Object.keys(result) : 'null'}`);
            if (result && typeof result === 'object') {
              console.log(`🔍 First few keys: ${Object.keys(result).slice(0, 5).join(', ')}`);
              if (Object.keys(result).length > 0) {
                const firstKey = Object.keys(result)[0];
                const firstItem = result[firstKey];
                console.log(`🔍 First item structure:`, {
                  hasDocument: !!(firstItem && firstItem.document),
                  hasId: !!(firstItem && firstItem.id),
                  itemKeys: firstItem ? Object.keys(firstItem) : 'null'
                });
              }
            }
            console.log(`🔍 === END DEBUG ===`);
          }
          
          // Показываем детали в зависимости от типа команды
          if (messageId.includes('structure') || messageId.includes('stage2')) {
            console.log(`📥 Received document structure response`);
            
            // Детальный дебаг структуры документа
            console.log(`🔍 === DEBUG: Document Structure Response ===`);
            console.log(`🔍 Result type: ${typeof result}`);
            console.log(`🔍 Result keys: ${result ? Object.keys(result) : 'null'}`);
            if (result && typeof result === 'object') {
              console.log(`🔍 Result structure preview:`, {
                hasId: !!(result.id),
                hasName: !!(result.name),
                hasChildren: !!(result.children),
                childrenCount: result.children ? result.children.length : 0,
                firstFewKeys: Object.keys(result).slice(0, 5)
              });
            }
            console.log(`🔍 === END DEBUG ===`);
            
            if (structureTimeout) clearTimeout(structureTimeout);
            if (!result || typeof result !== 'object') {
              console.error(`❌ ERROR: Плагин вернул пустой или некорректный ответ!`);
              console.error(`❌ Получено: ${typeof result}, ожидалось: object`);
              console.error(`❌ Проверьте, что в Figma открыт документ с элементами`);
              console.error(`❌ САМ ОТВЕТ ОТ ПЛАГИНА:`);
              console.error(`❌ ${JSON.stringify(result, null, 2)}`);
              process.exit(1);
            }
            
            // Проверяем, что это либо массив (выделенные элементы), либо объект с id (весь документ)
            if (!Array.isArray(result) && !result.id) {
              console.error(`❌ ERROR: Неправильный формат структуры документа!`);
              console.error(`❌ Ожидалось: массив элементов ИЛИ объект с id`);
              console.error(`❌ Получено: ${typeof result} без id`);
              console.error(`❌ Проверьте, что плагин корректно экспортирует документ`);
              console.error(`❌ САМ ОТВЕТ ОТ ПЛАГИНА:`);
              console.error(`❌ ${JSON.stringify(result, null, 2)}`);
              process.exit(1);
            }

            // Сохраняем структуру документа
            exportState.documentStructure = result;
            saveDataImmediately('documentStructure', result);
            console.log(`💾 Saved document structure data`);
            
            if (result.name) {
              console.log(`📋 Document: "${result.name}" (ID: ${result.id})`);
            }
            if (result.children && Array.isArray(result.children)) {
              console.log(`📊 Found ${result.children.length} top-level elements`);
              result.children.slice(0, 3).forEach((child: any, index: number) => {
                console.log(`   ${index + 1}. "${child.name}" (${child.type}, ID: ${child.id})`);
              });
              if (result.children.length > 3) {
                console.log(`   ... and ${result.children.length - 3} more elements`);
              }
            }
            
            // Запускаем Этап 3: Параллельный экспорт метаданных
            console.log(`📋 Stage 3: Starting metadata export...`);
            
            // Этап 3.1: Стили
            setTimeout(() => {
              console.log(`🎨 Stage 3.1: Getting styles...`);
              const stylesMessage = {
                id: 'stage3-styles-' + Date.now(),
                type: 'message',
                channel: ws.data.channel,
                message: {
                  id: 'stage3-styles-' + Date.now(),
                  command: 'get_styles'
                }
              };
              ws.send(JSON.stringify(stylesMessage));
            }, 1000);
            
            // Этап 3.2: Компоненты
            setTimeout(() => {
              console.log(`🧩 Stage 3.2: Getting components...`);
              const componentsMessage = {
                id: 'stage3-components-' + Date.now(),
                type: 'message',
                channel: ws.data.channel,
                message: {
                  id: 'stage3-components-' + Date.now(),
                  command: 'get_local_components'
                }
              };
              ws.send(JSON.stringify(componentsMessage));
            }, 2000);
            
            // Этап 3.3: Информация о документе
            setTimeout(() => {
              console.log(`📋 Stage 3.3: Getting document info...`);
              const docInfoMessage = {
                id: 'stage3-docinfo-' + Date.now(),
                type: 'message',
                channel: ws.data.channel,
                message: {
                  id: 'stage3-docinfo-' + Date.now(),
                  command: 'get_document_info'
                }
              };
              ws.send(JSON.stringify(docInfoMessage));
            }, 3000);
            
            // Этап 3.4: Аннотации
            setTimeout(() => {
              console.log(`📝 Stage 3.4: Getting annotations...`);
              const annotationsMessage = {
                id: 'stage3-annotations-' + Date.now(),
                type: 'message',
                channel: ws.data.channel,
                message: {
                  id: 'stage3-annotations-' + Date.now(),
                  command: 'get_annotations'
                }
              };
              ws.send(JSON.stringify(annotationsMessage));
            }, 4000);
          
          } else if (messageId.includes('components')) {
            console.log(`🔍 === DEBUG: Components Response ===`);
            console.log(`🔍 Components count: ${result.count || 'unknown'}`);
            console.log(`🔍 Components array length: ${result.components ? result.components.length : 'null'}`);
            if (result.components && Array.isArray(result.components)) {
              console.log(`🔍 First 3 components:`, result.components.slice(0, 3).map((comp: any) => ({
                id: comp.id,
                name: comp.name,
                key: comp.key
              })));
            }
            console.log(`🔍 === END DEBUG ===`);
            
            if (result.count) {
              console.log(`🧩 Components: ${result.count} total components`);
            }
            if (result.components && Array.isArray(result.components)) {
              console.log(`📋 Sample components:`);
              result.components.slice(0, 3).forEach((comp: any, index: number) => {
                console.log(`   ${index + 1}. "${comp.name}" (ID: ${comp.id})`);
              });
              if (result.components.length > 3) {
                console.log(`   ... and ${result.components.length - 3} more components`);
              }
            }
          } else if (messageId.includes('docinfo')) {
            if (result.name) {
              console.log(`📋 Document info: "${result.name}" (ID: ${result.id})`);
            }
            if (result.children && Array.isArray(result.children)) {
              console.log(`📊 Document has ${result.children.length} frames:`);
              result.children.forEach((frame: any, index: number) => {
                console.log(`   ${index + 1}. "${frame.name}" (ID: ${frame.id})`);
              });
            }
          } else if (messageId.includes('annotations')) {
            if (result.annotatedNodes && Array.isArray(result.annotatedNodes)) {
              console.log(`📝 Annotations: ${result.annotatedNodes.length} annotated nodes`);
            }
            if (result.categories && Array.isArray(result.categories)) {
              console.log(`📋 Annotation categories: ${result.categories.length} categories`);
              result.categories.forEach((cat: any) => {
                console.log(`   - "${cat.label}" (${cat.color})`);
              });
            }
          } else if (messageId.includes('styles')) {
            console.log(`🎨 Styles data received`);
            if (result.colors) console.log(`   - Colors: ${Object.keys(result.colors).length} color styles`);
            if (result.textStyles) console.log(`   - Typography: ${Object.keys(result.textStyles).length} text styles`);
            if (result.effectStyles) console.log(`   - Effects: ${Object.keys(result.effectStyles).length} effect styles`);
            if (result.gridStyles) console.log(`   - Grids: ${Object.keys(result.gridStyles).length} grid styles`);
          } else if (messageId.includes('batch-')) {
            console.log(`📦 Batch processing: ${result.length || 0} nodes`);
            if (result.length > 0) {
              console.log(`📋 Sample nodes in batch:`);
              result.slice(0, 3).forEach((node: any, index: number) => {
                console.log(`   ${index + 1}. "${node.name || 'Unnamed'}" (${node.type}, ID: ${node.id})`);
              });
              if (result.length > 3) {
                console.log(`   ... and ${result.length - 3} more nodes`);
              }
            }
          } else {
            // БЕЗОПАСНОЕ ЛОГИРОВАНИЕ РЕЗУЛЬТАТОВ
            // Показываем только первые 100 символов для всех объектов
            const resultString = JSON.stringify(result);
            const preview = resultString.length > 100 
              ? resultString.substring(0, 100) + '...'
              : resultString;
            console.log(`📥 Result preview: ${preview}`);
          }
        }

        if (data.type === "join") {
          console.log(`📥 Received join request`);
          
          // Проверяем, что экспорт еще не запущен
          if (exportState.isExporting) {
            console.log(`⚠️ Export already in progress, rejecting new connection`);
            ws.send(JSON.stringify({
              type: "system",
              message: "Export already in progress, please wait for completion",
              channel: data.channel || 'figma'
            }));
            return;
          }
          
          // Устанавливаем флаг экспорта
          exportState.isExporting = true;
          
          // Инициализируем данные соединения
          ws.data = { channel: data.channel };
          currentConnection = ws;
          
          console.log(`🔗 Client joined with channel: ${ws.data.channel}`);
          
          // Отправляем handshake, который ожидает плагин
          ws.send(JSON.stringify({
            type: "system",
            channel: ws.data.channel,
            message: {
              type: "system",
              result: true,
              channel: ws.data.channel
            }
          }));
          
          // После успешного handshake начинаем экспорт
          console.log(`🚀 Starting Figma data export...`);
          
          // Этап 1: Инициализация
          console.log(`📋 Stage 1: Initialization`);
          clearExportFolder();
          resetExportState();
          
          // Этап 2: Получение базовой структуры
          console.log(`📋 Stage 2: Getting document structure`);
          const structureMessage = {
            id: 'stage2-structure-' + Date.now(),
            type: 'message',
            channel: ws.data.channel,
            message: {
              id: 'stage2-structure-' + Date.now(),
              command: 'read_my_design'
            }
          };
          
          console.log(`📤 Sending structure request...`);
          ws.send(JSON.stringify(structureMessage));
          
          // Убираем таймаут - ждем бесконечно
          console.log(`⏳ Waiting for document structure response (no timeout)...`);
        } else if (data.type === "message" || data.type === "response" || data.type === "execute-command") {
          if (!currentConnection) {
            console.log(`❌ No active connection`);
            return;
          }
          
          const messageId = (data as any).message?.id || data.id || '';
          const result = (data as any).message?.result || data.result || data.data;
          const command = (data as any).message?.command || (data as any).command;
          
          console.log(`📥 === DEBUG: INCOMING MESSAGE ===`);
          console.log(`📥 Message type: ${data.type}`);
          console.log(`📥 Message ID: ${messageId}`);
          console.log(`📥 Command: ${command}`);
                  // ИСПОЛЬЗУЕМ БЕЗОПАСНОЕ ЛОГИРОВАНИЕ ДЛЯ БОЛЬШИХ ВХОДЯЩИХ ДАННЫХ
        // Полные данные сохраняются в отдельный файл, в лог выводится только превью
        safeLogWithSizeLimit({
          message: `Received large incoming data`,
          data: data,
          dataType: 'incoming_message',
          maxPreviewLength: 100
        });
        
        logToFile(`📥 Received message: ${data.type} | ID: ${messageId} | Command: ${command} | Size: ${result ? JSON.stringify(result).length : 0} chars`);
          
          // Обрабатываем новый формат execute-command
          if (data.type === "execute-command") {
            console.log(`🔍 Processing execute-command format`);
            // Плагин обработает команду и отправит результат обратно
            return;
          }
          
          if (result) {
            // БЕЗОПАСНОЕ ЛОГИРОВАНИЕ РЕЗУЛЬТАТОВ
            const resultString = JSON.stringify(result);
            const preview = resultString.length > 100 
              ? resultString.substring(0, 100) + '...'
              : resultString;
            console.log(`📥 Result preview: ${preview}`);
          }
          
          // Обработка ответов согласно этапам ТЗ
          if (messageId.startsWith('stage2-')) {
            console.log(`📋 Received document structure`);
            logToFile(`📋 Stage 2: Received document structure`);
            
            if (!result) {
              console.error(`❌ ERROR: No document structure received`);
              console.error(`❌ Full response:`, JSON.stringify(data, null, 2));
              logToFile(`❌ ERROR: No document structure received`);
              console.log(`⏳ Waiting for document structure...`);
              return;
            }
            
            // Сохраняем структуру немедленно
            saveDataImmediately('documentStructure', result);
            exportState.documentStructure = result;
            
            // Извлекаем все ID нод из структуры документа
            documentNodeIds = extractNodeIdsFromStructure(result);
            console.log(`📊 Found ${documentNodeIds.length} total document node IDs`);
            logToFile(`📊 Stage 2: Found ${documentNodeIds.length} total document node IDs`);
            
          } else if (messageId.startsWith('stage3-')) {
            console.log(`📥 Received metadata response for: ${messageId}`);
            logToFile(`📥 Stage 3: Received metadata response for: ${messageId}`);
            console.log(`🔍 === DEBUG: Stage 3 Response ===`);
            console.log(`🔍 Message ID: ${messageId}`);
            console.log(`🔍 Result type: ${typeof result}`);
            console.log(`🔍 Result keys: ${result ? Object.keys(result) : 'null'}`);
            console.log(`🔍 === END DEBUG ===`);
            
            if (messageId.includes('styles')) {
              saveDataImmediately('styles', result);
              console.log(`💾 Saved styles data`);
              exportState.stage3Completed++;
            } else if (messageId.includes('components')) {
              saveDataImmediately('components', result);
              console.log(`💾 Saved components data`);
              exportState.stage3Completed++;
            } else if (messageId.includes('docinfo')) {
              saveDataImmediately('documentInfo', result);
              console.log(`💾 Saved document info data`);
              exportState.stage3Completed++;
            } else if (messageId.includes('annotations')) {
  saveRawDataImmediately('annotations', result, 'all_annotations.json');
  exportState.stage3Completed++;
} else {
              saveDataImmediately('metadata', result);
              console.log(`💾 Saved generic metadata data`);
              exportState.stage3Completed++;
            }
            
            // Проверяем завершение Этапа 3
            console.log(`📊 Stage 3 progress: ${exportState.stage3Completed}/${exportState.stage3Total}`);
            if (exportState.stage3Completed >= exportState.stage3Total) {
              console.log(`✅ Stage 3 completed! Starting Stage 4...`);
              console.log(`🔍 === DEBUG: Stage 3 to Stage 4 transition ===`);
              console.log(`🔍 exportState.documentStructure exists: ${!!exportState.documentStructure}`);
              console.log(`🔍 exportState.documentStructure type: ${typeof exportState.documentStructure}`);
              console.log(`🔍 === END DEBUG ===`);
              setTimeout(() => {
                startStage4RecursiveProcessing();
              }, 1000);
            }
            
          } else if (messageId.startsWith('stage4-')) {
            console.log(`📥 Received batch response for: ${messageId}`);
            logToFile(`📥 Stage 4: Received batch response for: ${messageId}`);
            console.log(`🔍 Result type: ${typeof result}`);
            // БЕЗОПАСНОЕ ЛОГИРОВАНИЕ РАЗМЕРА РЕЗУЛЬТАТА
            const resultSize = result ? JSON.stringify(result).length : 0;
            console.log(`🔍 Result size: ${resultSize} characters`);
            if (result && typeof result === 'object') {
              console.log(`🔍 Result keys: ${Object.keys(result)}`);
            }
            
            if (messageId.includes('nodes')) {
              saveDataImmediately('batch', result);
              console.log(`💾 Saved nodes info data`);
              logToFile(`💾 Saved nodes info data for batch`);
              exportState.stage4Completed++;
              
              // После получения ответа отправляем следующий батч
              setTimeout(() => {
                processNextBatch();
              }, 1000);
            }
            
            // Проверяем завершение Этапа 4 (теперь только get_nodes_info)
            console.log(`📊 Stage 4 progress: ${exportState.stage4Completed}/${exportState.stage4Total}`);
            logToFile(`📊 Stage 4 progress: ${exportState.stage4Completed}/${exportState.stage4Total}`);
            
            if (exportState.stage4Completed >= exportState.stage4Total && exportState.stage4Total > 0) {
              console.log(`✅ Stage 4 completed! Starting Stage 5...`);
              logToFile(`✅ Stage 4 completed! Starting Stage 5...`);
              setTimeout(() => {
                startStage5SpecializedExport();
              }, 1000);
            } else if (exportState.stage4Completed > 0 && exportState.stage4Total === 0) {
              // Если Stage 4 не запускался (нет нод), переходим к Stage 5
              console.log(`⚠️ Stage 4 not started (no nodes), starting Stage 5...`);
              logToFile(`⚠️ Stage 4 not started (no nodes), starting Stage 5...`);
              setTimeout(() => {
                startStage5SpecializedExport();
              }, 1000);
            }
            
          } else if (messageId.startsWith('stage5-')) {
            console.log(`📥 Received specialized export response for: ${messageId}`);
            logToFile(`📥 Stage 5: Received specialized export response for: ${messageId}`);
            
            if (messageId.includes('text')) {
              saveDataImmediately('textNodes', result);
              console.log(`💾 Saved text nodes data`);
              exportState.stage5Completed++;
            } else if (messageId.includes('types')) {
              saveDataImmediately('nodesByTypes', result);
              console.log(`💾 Saved nodes by types data`);
              exportState.stage5Completed++;
            } else if (messageId.includes('connections')) {
              saveDataImmediately('connections', result);
              console.log(`💾 Saved connections data`);
              exportState.stage5Completed++;
            } else if (messageId.includes('reactions')) {
              saveDataImmediately('reactions', result);
              console.log(`💾 Saved reactions data`);
              exportState.stage5Completed++;
            } else if (messageId.includes('overrides')) {
              saveDataImmediately('instanceOverrides', result);
              console.log(`💾 Saved instance overrides data`);
              exportState.stage5Completed++;
            } else if (messageId.includes('selection')) {
              // get_selection - сохраняем ID выделенных нод
              console.log(`📋 Received selection data`);
              if (result && result.selection && Array.isArray(result.selection)) {
                selectedNodeIds = result.selection.map((node: any) => node.id).filter(Boolean);
                console.log(`📊 Found ${selectedNodeIds.length} selected node IDs:`, selectedNodeIds);
              }
              exportState.stage5Completed++;
            } else if (messageId.includes('image-export')) {
              saveDataImmediately('images', result);
              console.log(`💾 Saved node images data`);
              exportState.stage5Completed++;
            } else if (messageId.includes('export-all-nodes')) {
              // УБРАНО - батчи уже содержат исчерпывающую информацию
              console.log(`📦 Skipped export_all_nodes response - using batch data instead`);
              exportState.stage5Completed++;
            } else {
              saveDataImmediately('specialized', result);
              console.log(`💾 Saved generic specialized data`);
              exportState.stage5Completed++;
            }
            
            // Проверяем завершение Этапа 5
            console.log(`📊 Stage 5 progress: ${exportState.stage5Completed}/${exportState.stage5Total}`);
            if (exportState.stage5Completed >= exportState.stage5Total && !exportState.stage6Started) {
              console.log(`✅ Stage 5 completed! Starting Stage 6...`);
              exportState.stage6Started = true;
              setTimeout(() => {
                startStage6RecursiveDeepening();
              }, 1000);
            }
            
          } else if (messageId.includes('batch-')) {
            console.log(`📥 Received batch response`);
            saveDataImmediately('batch', result);
            
          } else if (messageId.includes('image-')) {
            console.log(`🖼️ Received image export response`);
            saveDataImmediately('images', result);
            
          } else if (messageId.includes('selection')) {
            console.log(`📋 Received selection response`);
            // Сохраняем ID выделенных нод
            if (result && result.selection && Array.isArray(result.selection)) {
              selectedNodeIds = result.selection.map((node: any) => node.id).filter(Boolean);
              console.log(`📊 Found ${selectedNodeIds.length} selected node IDs:`, selectedNodeIds);
            }
            
            // После получения выделения завершаем экспорт
            setTimeout(() => {
              console.log(`✅ Selection received, finishing export...`);
              finishExport();
            }, 2000);
            
          } else {
            console.log(`📥 Received unknown response for: ${messageId}`);
            console.log(`📥 Command: ${command}`);
            // Убираем полный вывод данных
            
            // Сохраняем как общий ответ
            saveDataImmediately('unknown', result);
          }
        } else if (data.type === "progress_update") {
          console.log(`📥 Received progress update:`, {
            commandType: data.message?.data?.commandType,
            status: data.message?.data?.status,
            progress: data.message?.data?.progress,
            processedItems: data.message?.data?.processedItems,
            totalItems: data.message?.data?.totalItems,
            message: data.message?.data?.message
          });
        } else {
          console.log(`📥 Received other message type: ${data.type}`);
          // Убираем полный вывод данных
        }
        
      } catch (error) {
        console.error(`❌ Error processing message:`, error);
        console.error(`❌ Message that caused error:`, message);
        process.exit(1);
      }
    },
    close(ws: ServerWebSocket<any>) {
      console.log("📤 Client disconnected");
      // Удаляем канал из данных соединения при отключении
      if (ws.data?.channel) {
        delete ws.data.channel;
      }
    }
  }
});

console.log(`🚀 Figma Export Server started on port 3055`);
console.log(`📋 Waiting for Figma plugin connection...`);
console.log(`⏰ Timeout set to ${exportState.timeout / 1000} seconds for large files`);