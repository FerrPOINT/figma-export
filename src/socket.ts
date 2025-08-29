import { Server, ServerWebSocket } from "bun";
import { rmSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

// Store clients by channel
const channels = new Map<string, Set<ServerWebSocket<any>>>();
let channelCounter = 0;

// Global export data storage
const exportData = {
  documentStructure: null,
  styles: null,
  components: null,
  documentInfo: null,
  annotations: null,
  textNodes: null,
  nodesByTypes: null,
  reactions: null,
  nodeDetails: null,
  instanceOverrides: null,
  screens: null, // Новое поле для главных экранов
  nodeBatches: null, // Новое поле для батчевой обработки
  connections: null // Новое поле для связей между нодами
};

// Функция для очистки папки export
function clearExportFolder() {
  try {
    const exportDir = './export';
    if (existsSync(exportDir)) {
      console.log(`🗑️ Clearing export folder: ${exportDir}`);
      rmSync(exportDir, { recursive: true, force: true });
    }
    mkdirSync(exportDir, { recursive: true });
    console.log(`✅ Export folder cleared and recreated`);
  } catch (error) {
    console.error(`❌ Error clearing export folder:`, error);
  }
}

// Состояние экспорта
const exportState = {
  currentStep: 0,
  totalSteps: 0,
  processedNodes: new Set(),
  pendingNodes: new Set(),
  nodeQueue: [],
  isExporting: false,
  savedFiles: [], // Стек сохраненных файлов
  documentStructure: null // Сохраненная структура документа
};

// Функция для рекурсивной обработки сохраненной структуры
function processSavedDocumentStructure() {
  if (!exportState.documentStructure) {
    console.log(`⚠️ No document structure saved for recursive processing`);
    return;
  }

  console.log(`🔄 Starting recursive processing of saved document structure...`);
  
  // Извлекаем все ID нод из структуры
  const allNodeIds = new Set<string>();
  extractNodeIds(exportState.documentStructure, allNodeIds);
  
  console.log(`📊 Found ${allNodeIds.size} total nodes in document structure`);
  
  // Фильтруем уже обработанные ноды
  const newNodeIds = Array.from(allNodeIds).filter(id => !exportState.processedNodes.has(id));
  
  console.log(`📦 Found ${newNodeIds.length} new nodes to process`);
  
  if (newNodeIds.length > 0) {
    // Добавляем в очередь для обработки
    exportState.nodeQueue.push(...newNodeIds);
    newNodeIds.forEach(id => exportState.processedNodes.add(id));
    
    // Обрабатываем батчами по 5 нод
    const batchSize = 5;
    for (let i = 0; i < newNodeIds.length; i += batchSize) {
      const batch = newNodeIds.slice(i, i + batchSize);
      setTimeout(() => {
        processNodeBatch(batch, channels.get('current') || new Set(), 'current');
      }, i * 100); // Небольшая задержка между батчами
    }
    
    console.log(`✅ Scheduled processing of ${newNodeIds.length} nodes in ${Math.ceil(newNodeIds.length / batchSize)} batches`);
  } else {
    console.log(`✅ All nodes already processed`);
  }
}

// Функция для немедленного сохранения данных
function saveDataImmediately(dataType: string, data: any, channelName: string) {
  try {
    const fs = require('fs');
    const path = require('path');
    const exportDir = './export';
    
    if (!fs.existsSync(exportDir)) {
      fs.mkdirSync(exportDir, { recursive: true });
    }
    
    const timestamp = Date.now();
    const fileName = `${dataType}_${timestamp}.json`;
    const filePath = path.join(exportDir, fileName);
    
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log(`💾 IMMEDIATELY SAVED ${dataType} to: ${filePath}`);
    
    // Также сохраняем в основную структуру для финального экспорта
    exportData[dataType] = data;
  } catch (error) {
    console.error(`❌ Error saving ${dataType}:`, error);
  }
}

// Функция для извлечения ID нод из структуры
function extractNodeIds(node: any, ids: Set<string> = new Set()): Set<string> {
  if (!node) return ids;
  
  if (node.id) {
    ids.add(node.id);
  }
  
  if (node.children) {
    node.children.forEach((child: any) => extractNodeIds(child, ids));
  }
  
  return ids;
}

// Функция для батчевой обработки нод
function processNodeBatch(nodeIds: string[], channelClients: Set<ServerWebSocket<any>>, channelName: string) {
  if (nodeIds.length === 0) return;
  
  console.log(`🔍 Processing batch of ${nodeIds.length} nodes...`);
  
  // Батч 1: Получение детальной информации о нодах
  const nodeDetailsMessage = {
    id: 'batch-nodes-' + Date.now(),
    type: 'message',
    channel: channelName,
    message: {
      id: 'batch-nodes-' + Date.now(),
      command: 'get_nodes_info',
      params: {
        nodeIds: nodeIds,
        commandId: 'batch-nodes-' + Date.now()
      }
    }
  };
  
  channelClients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      console.log(`📤 Sending get_nodes_info batch command to Figma plugin`);
      client.send(JSON.stringify(nodeDetailsMessage));
    }
  });
  
  // Батч 2: Получение переопределений для компонентов
  const overridesMessage = {
    id: 'batch-overrides-' + Date.now(),
    type: 'message',
    channel: channelName,
    message: {
      id: 'batch-overrides-' + Date.now(),
      command: 'get_instance_overrides',
      params: {
        nodeIds: nodeIds,
        commandId: 'batch-overrides-' + Date.now()
      }
    }
  };
  
  channelClients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      console.log(`📤 Sending get_instance_overrides batch command to Figma plugin`);
      client.send(JSON.stringify(overridesMessage));
    }
  });
  
  // Батч 3: Получение реакций для нод
  const reactionsMessage = {
    id: 'batch-reactions-' + Date.now(),
    type: 'message',
    channel: channelName,
    message: {
      id: 'batch-reactions-' + Date.now(),
      command: 'get_reactions',
      params: {
        nodeIds: nodeIds,
        commandId: 'batch-reactions-' + Date.now()
      }
    }
  };
  
  channelClients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      console.log(`📤 Sending get_reactions batch command to Figma plugin`);
      client.send(JSON.stringify(reactionsMessage));
    }
  });
}

// Рекурсивная функция для обработки экранов
function processScreensRecursively(screens: any[], channelClients: Set<ServerWebSocket<any>>, channelName: string, depth: number = 0) {
  if (!screens || screens.length === 0) {
    console.log(`✅ Finished processing at depth ${depth}`);
    return;
  }
  
  console.log(`🔄 Processing ${screens.length} screens at depth ${depth}...`);
  
  // Извлекаем ID всех нод из экранов
  const allNodeIds = new Set<string>();
  screens.forEach(screen => {
    extractNodeIds(screen, allNodeIds);
  });
  
  // Фильтруем уже обработанные ноды
  const newNodeIds = Array.from(allNodeIds).filter(id => !exportState.processedNodes.has(id));
  
  if (newNodeIds.length > 0) {
    console.log(`📦 Found ${newNodeIds.length} new nodes to process at depth ${depth}`);
    
    // Добавляем в очередь для обработки
    exportState.nodeQueue.push(...newNodeIds);
    newNodeIds.forEach(id => exportState.processedNodes.add(id));
    
    // Обрабатываем батчами по 5 нод
    const batchSize = 5;
    for (let i = 0; i < newNodeIds.length; i += batchSize) {
      const batch = newNodeIds.slice(i, i + batchSize);
      setTimeout(() => {
        processNodeBatch(batch, channelClients, channelName);
      }, i * 100); // Небольшая задержка между батчами
    }
    
    // Рекурсивно обрабатываем дочерние экраны
    const childScreens = [];
    screens.forEach(screen => {
      if (screen.children) {
        screen.children.forEach((child: any) => {
          if (child.type === 'FRAME' || child.type === 'COMPONENT' || child.type === 'INSTANCE') {
            childScreens.push(child);
          }
        });
      }
    });
    
    if (childScreens.length > 0) {
      setTimeout(() => {
        processScreensRecursively(childScreens, channelClients, channelName, depth + 1);
      }, newNodeIds.length * 100 + 1000); // Задержка после обработки текущих нод
    }
  }
}

function handleConnection(ws: ServerWebSocket<any>) {
  // Don't add to clients immediately - wait for channel join
  console.log("New client connected");

  // Send welcome message to the new client
  ws.send(JSON.stringify({
    type: "system",
    message: "Please join a channel to start chatting",
  }));

  ws.close = () => {
    console.log("Client disconnected");

    // Remove client from their channel
    channels.forEach((clients, channelName) => {
      if (clients.has(ws)) {
        clients.delete(ws);

        // Notify other clients in same channel
        clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
              type: "system",
              message: "A user has left the channel",
              channel: channelName
            }));
          }
        });
      }
    });
  };
}

const server = Bun.serve({
  port: 3055,
  // uncomment this to allow connections in windows wsl
  // hostname: "0.0.0.0",
  fetch(req: Request, server: Server) {
    // Handle CORS preflight
    if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      });
    }

    // Handle WebSocket upgrade
    const success = server.upgrade(req, {
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
    });

    if (success) {
      return; // Upgraded to WebSocket
    }

    // Return response for non-WebSocket requests
    return new Response("WebSocket server running", {
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
    });
  },
  websocket: {
    open: handleConnection,
    message(ws: ServerWebSocket<any>, message: string | Buffer) {
      try {
        console.log("📥 Received message from client:", message);
        const data = JSON.parse(message as string);
        
        // Проверяем, что сообщение корректное
        if (!data || typeof data !== 'object') {
          console.error(`❌ ERROR: Invalid message format received`);
          console.error(`❌ Raw message: ${message}`);
          process.exit(1);
        }
        
        console.log(`🔍 DEBUG: Parsed message type: ${data.type}`);
        console.log(`🔍 DEBUG: Message keys: ${Object.keys(data).join(', ')}`);

        if (data.type === "join") {
          const channelName = data.channel;
          console.log(`🔗 Client joining channel: ${channelName}`);
          console.log(`🔍 DEBUG: Starting join process for channel: ${channelName}`);
          
          if (!channelName || typeof channelName !== "string") {
            ws.send(JSON.stringify({
              type: "error",
              message: "Invalid channel name",
            }));
            return;
          }

          // Add client to channel
          if (!channels.has(channelName)) {
            channels.set(channelName, new Set());
          }
          channels.get(channelName)!.add(ws);

          // Send confirmation
          ws.send(JSON.stringify({
            type: "system",
            message: `Joined channel: ${channelName}`,
            channel: channelName
          }));

          // Notify other clients in same channel
          const channelClients = channels.get(channelName)!;
          channelClients.forEach((client) => {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({
                type: "system",
                message: "A new user has joined the channel",
                channel: channelName
              }));
            }
          });

          // Start optimized recursive export process
          console.log(`🚀 Starting optimized recursive export process for channel: ${channelName}`);
          
          // Clear export folder before starting new export
          clearExportFolder();
          
          // Reset export state
          exportState.currentStep = 0;
          exportState.processedNodes.clear();
          exportState.nodeQueue = [];
          exportState.isExporting = true;
          
          // Таймаут для ожидания ответов от Figma плагина
          global.responseTimeout = setTimeout(() => {
            console.error(`❌ ERROR: No responses received from Figma plugin within 30 seconds`);
            console.error(`❌ Expected: Responses to commands: read_my_design, get_styles, etc.`);
            console.error(`❌ Check if Figma plugin is connected and responding`);
            process.exit(1);
          }, 30000); // 30 секунд таймаут
          
          // Step 1: Get document structure (основа для рекурсивного обхода)
          setTimeout(() => {
            console.log(`📋 Step 1: Getting document structure for recursive processing...`);
            const docStructureMessage = {
              id: 'step1-' + Date.now(),
              type: 'message',
              channel: channelName,
              message: {
                id: 'step1-' + Date.now(),
                command: 'read_my_design',
                params: {
                  commandId: 'step1-' + Date.now()
                }
              }
            };
            
            // Отправляем команду только подключенному клиенту
            if (ws.readyState === WebSocket.OPEN) {
              console.log(`📤 Sending read_my_design command to Figma plugin`);
              console.log(`🔍 DEBUG: Command message: ${JSON.stringify(docStructureMessage)}`);
              ws.send(JSON.stringify(docStructureMessage));
            } else {
              console.error(`❌ ERROR: WebSocket not ready. State: ${ws.readyState}`);
              process.exit(1);
            }
          }, 1000);
          
          // Step 2: Get all styles (параллельно)
          setTimeout(() => {
            console.log(`🎨 Step 2: Getting all styles...`);
            const stylesMessage = {
              id: 'step2-' + Date.now(),
              type: 'message',
              channel: channelName,
              message: {
                id: 'step2-' + Date.now(),
                command: 'get_styles',
                params: {
                  commandId: 'step2-' + Date.now()
                }
              }
            };
            
            // Отправляем команду только подключенному клиенту
            if (ws.readyState === WebSocket.OPEN) {
              console.log(`📤 Sending get_styles command to Figma plugin`);
              ws.send(JSON.stringify(stylesMessage));
            }
          }, 1500);
          
          // Step 3: Get all components (параллельно)
          setTimeout(() => {
            console.log(`🧩 Step 3: Getting all components...`);
            const componentsMessage = {
              id: 'step3-' + Date.now(),
              type: 'message',
              channel: channelName,
              message: {
                id: 'step3-' + Date.now(),
                command: 'get_local_components',
                params: {
                  commandId: 'step3-' + Date.now()
                }
              }
            };
            
            // Отправляем команду только подключенному клиенту
            if (ws.readyState === WebSocket.OPEN) {
              console.log(`📤 Sending get_local_components command to Figma plugin`);
              ws.send(JSON.stringify(componentsMessage));
            }
          }, 2000);
          
          // Step 4: Get document info
          setTimeout(() => {
            console.log(`📋 Step 4: Getting document info...`);
            const documentInfoMessage = {
              id: 'step4-' + Date.now(),
              type: 'message',
              channel: channelName,
              message: {
                id: 'step4-' + Date.now(),
                command: 'get_document_info',
                params: {
                  commandId: 'step4-' + Date.now()
                }
              }
            };
            
            // Отправляем команду только подключенному клиенту
            if (ws.readyState === WebSocket.OPEN) {
              console.log(`📤 Sending get_document_info command to Figma plugin`);
              ws.send(JSON.stringify(documentInfoMessage));
            }
          }, 2500);
          
          // Step 5: Get annotations
          setTimeout(() => {
            console.log(`📝 Step 5: Getting annotations...`);
            const annotationsMessage = {
              id: 'step5-' + Date.now(),
              type: 'message',
              channel: channelName,
              message: {
                id: 'step5-' + Date.now(),
                command: 'get_annotations',
                params: {
                  commandId: 'step5-' + Date.now()
                }
              }
            };
            
            // Отправляем команду только подключенному клиенту
            if (ws.readyState === WebSocket.OPEN) {
              console.log(`📤 Sending get_annotations command to Figma plugin`);
              ws.send(JSON.stringify(annotationsMessage));
            }
          }, 3000);
          
          // Step 6: Get all text nodes (оптимизированно)
          setTimeout(() => {
            console.log(`📝 Step 6: Getting all text nodes...`);
            const textNodesMessage = {
              id: 'step6-' + Date.now(),
              type: 'message',
              channel: channelName,
              message: {
                id: 'step6-' + Date.now(),
                command: 'scan_text_nodes',
                params: {
                  nodeId: 'current',
                  useChunking: true,
                  chunkSize: 200, // Увеличено для скорости
                  maxDepth: 50, // Увеличено для полноты
                  includeInvisible: false,
                  includeLocked: false,
                  timeout: 300000, // 5 минут
                  commandId: 'step6-' + Date.now()
                }
              }
            };
            
            // Отправляем команду только подключенному клиенту
            if (ws.readyState === WebSocket.OPEN) {
              console.log(`📤 Sending scan_text_nodes command to Figma plugin`);
              ws.send(JSON.stringify(textNodesMessage));
            }
          }, 3500);
          
          // Step 7: Scan nodes by types (все специфичные типы)
          setTimeout(() => {
            console.log(`🔍 Step 7: Scanning nodes by types for complete coverage...`);
            const scanTypesMessage = {
              id: 'step7-' + Date.now(),
              type: 'message',
              channel: channelName,
              message: {
                id: 'step7-' + Date.now(),
                command: 'scan_nodes_by_types',
                params: {
                  nodeId: 'current',
                  types: [
                    'FRAME', 'COMPONENT', 'INSTANCE', 'RECTANGLE', 'TEXT', 'ELLIPSE', 
                    'POLYGON', 'STAR', 'VECTOR', 'LINE', 'GROUP', 'BOOLEAN_OPERATION',
                    'VECTOR', 'REGULAR_POLYGON', 'SLICE', 'STAMP', 'STICKY', 'SHAPE_WITH_TEXT',
                    'CONNECTOR', 'CODE_BLOCK', 'EMBED', 'LINK_UNFURL', 'MEDIA', 'TABLE',
                    'TABLE_CELL', 'WASHI_TAPE', 'WIDGET', 'WIDGET_INSTANCE', 'IMAGE'
                  ],
                  chunkSize: 200,
                  maxDepth: 50,
                  includeInvisible: false,
                  includeLocked: false,
                  timeout: 300000,
                  commandId: 'step7-' + Date.now()
                }
              }
            };
            
            // Отправляем команду только подключенному клиенту
            if (ws.readyState === WebSocket.OPEN) {
              console.log(`📤 Sending scan_nodes_by_types command to Figma plugin`);
              ws.send(JSON.stringify(scanTypesMessage));
            }
          }, 4000);
          
          // Step 8: Get all reactions and interactions
          setTimeout(() => {
            console.log(`🎭 Step 8: Getting all reactions and interactions...`);
            const reactionsMessage = {
              id: 'step8-' + Date.now(),
              type: 'message',
              channel: channelName,
              message: {
                id: 'step8-' + Date.now(),
                command: 'get_reactions',
                params: {
                  nodeIds: [], // Получим все реакции для всех нод
                  commandId: 'step8-' + Date.now()
                }
              }
            };
            
            // Отправляем команду только подключенному клиенту
            if (ws.readyState === WebSocket.OPEN) {
              console.log(`📤 Sending get_reactions command to Figma plugin`);
              ws.send(JSON.stringify(reactionsMessage));
            }
          }, 4500);
          
          // Step 9: Get instance overrides (переопределения компонентов)
          setTimeout(() => {
            console.log(`🔄 Step 9: Getting instance overrides...`);
            const overridesMessage = {
              id: 'step9-' + Date.now(),
              type: 'message',
              channel: channelName,
              message: {
                id: 'step9-' + Date.now(),
                command: 'get_instance_overrides',
                params: {
                  nodeIds: [], // Получим все переопределения
                  commandId: 'step9-' + Date.now()
                }
              }
            };
            
            // Отправляем команду только подключенному клиенту
            if (ws.readyState === WebSocket.OPEN) {
              console.log(`📤 Sending get_instance_overrides command to Figma plugin`);
              ws.send(JSON.stringify(overridesMessage));
            }
          }, 5000);
          
          // Step 10: Get connections (связи между нодами)
          setTimeout(() => {
            console.log(`🔗 Step 10: Getting connections between nodes...`);
            const connectionsMessage = {
              id: 'step10-' + Date.now(),
              type: 'message',
              channel: channelName,
              message: {
                id: 'step10-' + Date.now(),
                command: 'create_connections',
                params: {
                  nodeIds: [], // Получим все связи
                  commandId: 'step10-' + Date.now()
                }
              }
            };
            
            // Отправляем команду только подключенному клиенту
            if (ws.readyState === WebSocket.OPEN) {
              console.log(`📤 Sending create_connections command to Figma plugin`);
              ws.send(JSON.stringify(connectionsMessage));
            }
          }, 5500);
          
          // Step 11: Final comprehensive save
          setTimeout(async () => {
            console.log(`💾 Step 11: Final comprehensive save...`);
            
            try {
              const fs = require('fs');
              const path = require('path');
              
              // Create comprehensive export directory structure
              const exportDir = './export';
              const dirs = [
                exportDir,
                path.join(exportDir, 'metadata'),
                path.join(exportDir, 'nodes'),
                path.join(exportDir, 'images'),
                path.join(exportDir, 'styles'),
                path.join(exportDir, 'components'),
                path.join(exportDir, 'annotations'),
                path.join(exportDir, 'reactions'),
                path.join(exportDir, 'overrides'),
                path.join(exportDir, 'detailed'),
                path.join(exportDir, 'batches'),
                path.join(exportDir, 'connections'),
                path.join(exportDir, 'text'),
                path.join(exportDir, 'vectors'),
                path.join(exportDir, 'images')
              ];
              
              dirs.forEach(dir => {
                if (!fs.existsSync(dir)) {
                  fs.mkdirSync(dir, { recursive: true });
                }
              });
              
              // Save all data with comprehensive structure
              const savePromises = [];
              
              if (exportData.documentStructure) {
                const docStructurePath = path.join(exportDir, 'metadata', 'document_structure.json');
                savePromises.push(fs.promises.writeFile(docStructurePath, JSON.stringify(exportData.documentStructure, null, 2)));
                console.log(`✅ Saved document structure to ${docStructurePath}`);
              }
              
              if (exportData.styles) {
                const stylesPath = path.join(exportDir, 'styles', 'all_styles.json');
                savePromises.push(fs.promises.writeFile(stylesPath, JSON.stringify(exportData.styles, null, 2)));
                console.log(`✅ Saved styles to ${stylesPath}`);
              }
              
              if (exportData.components) {
                const componentsPath = path.join(exportDir, 'components', 'all_components.json');
                savePromises.push(fs.promises.writeFile(componentsPath, JSON.stringify(exportData.components, null, 2)));
                console.log(`✅ Saved components to ${componentsPath}`);
              }
              
              if (exportData.documentInfo) {
                const docInfoPath = path.join(exportDir, 'metadata', 'document_info.json');
                savePromises.push(fs.promises.writeFile(docInfoPath, JSON.stringify(exportData.documentInfo, null, 2)));
                console.log(`✅ Saved document info to ${docInfoPath}`);
              }
              
              if (exportData.annotations) {
                const annotationsPath = path.join(exportDir, 'annotations', 'all_annotations.json');
                savePromises.push(fs.promises.writeFile(annotationsPath, JSON.stringify(exportData.annotations, null, 2)));
                console.log(`✅ Saved annotations to ${annotationsPath}`);
              }
              
              if (exportData.textNodes) {
                const textNodesPath = path.join(exportDir, 'text', 'all_text_nodes.json');
                savePromises.push(fs.promises.writeFile(textNodesPath, JSON.stringify(exportData.textNodes, null, 2)));
                console.log(`✅ Saved text nodes to ${textNodesPath}`);
              }
              
              if (exportData.nodesByTypes) {
                const nodesByTypesPath = path.join(exportDir, 'nodes', 'nodes_by_types.json');
                savePromises.push(fs.promises.writeFile(nodesByTypesPath, JSON.stringify(exportData.nodesByTypes, null, 2)));
                console.log(`✅ Saved nodes by types to ${nodesByTypesPath}`);
              }
              
              if (exportData.reactions) {
                const reactionsPath = path.join(exportDir, 'reactions', 'all_reactions.json');
                savePromises.push(fs.promises.writeFile(reactionsPath, JSON.stringify(exportData.reactions, null, 2)));
                console.log(`✅ Saved reactions to ${reactionsPath}`);
              }
              
              if (exportData.instanceOverrides) {
                const overridesPath = path.join(exportDir, 'overrides', 'instance_overrides.json');
                savePromises.push(fs.promises.writeFile(overridesPath, JSON.stringify(exportData.instanceOverrides, null, 2)));
                console.log(`✅ Saved instance overrides to ${overridesPath}`);
              }
              
              if (exportData.nodeDetails) {
                const nodeDetailsPath = path.join(exportDir, 'detailed', 'node_details.json');
                savePromises.push(fs.promises.writeFile(nodeDetailsPath, JSON.stringify(exportData.nodeDetails, null, 2)));
                console.log(`✅ Saved node details to ${nodeDetailsPath}`);
              }
              
              // Save export state and statistics
              const exportStats = {
                timestamp: new Date().toISOString(),
                processedNodes: Array.from(exportState.processedNodes),
                totalProcessedNodes: exportState.processedNodes.size,
                nodeQueueLength: exportState.nodeQueue.length,
                exportComplete: true,
                dataTypes: Object.keys(exportData).filter(key => exportData[key] !== null),
                commandsUsed: [
                  'read_my_design',
                  'get_styles', 
                  'get_local_components',
                  'get_document_info',
                  'get_annotations',
                  'scan_text_nodes',
                  'scan_nodes_by_types',
                  'get_reactions',
                  'get_instance_overrides',
                  'create_connections'
                ]
              };
              
              const statsPath = path.join(exportDir, 'export_statistics.json');
              savePromises.push(fs.promises.writeFile(statsPath, JSON.stringify(exportStats, null, 2)));
              console.log(`✅ Saved export statistics to ${statsPath}`);
              
              // Wait for all saves to complete
              await Promise.all(savePromises);
              console.log(`🎉 COMPREHENSIVE EXPORT COMPLETE! All data saved to ./export/`);
              console.log(`📊 Processed ${exportState.processedNodes.size} nodes in total`);
              console.log(`🔍 Used ${exportStats.commandsUsed.length} different Figma commands`);
              
            } catch (error) {
              console.error(`❌ Error in final save:`, error);
            }
          }, 12000); // Увеличено время для завершения всех операций
          
        } else if (data.type === "message") {
          const channelName = data.channel;
          const channelClients = channels.get(channelName);
          
          if (!channelClients) {
            console.log(`❌ Channel ${channelName} not found`);
            return;
          }
          
          // Handle different message types from Figma plugin
          const messageId = data.message?.id || '';
          const result = data.message?.result;
          
          console.log(`📥 Received message with ID: ${messageId}, type: ${data.message?.command}`);
          console.log(`🔍 DEBUG: Full message structure:`, {
            messageId: messageId,
            command: data.message?.command,
            hasResult: !!result,
            resultKeys: result ? Object.keys(result) : [],
            messageKeys: data.message ? Object.keys(data.message) : []
          });
          
          // Process responses based on message ID
          if (messageId.startsWith('step1-')) {
            console.log(`📋 Received document structure data - starting recursive processing...`);
            
            // Очищаем таймаут, так как получили ответ
            if (global.responseTimeout) {
              clearTimeout(global.responseTimeout);
              global.responseTimeout = null;
            }
            
            // Проверяем, что получили данные
            if (!result) {
              console.error(`❌ ERROR: No document structure received from Figma plugin`);
              console.error(`❌ Expected: Document structure with children`);
              console.error(`❌ Received: ${JSON.stringify(data.message)}`);
              process.exit(1);
            }
            
            console.log(`🔍 DEBUG: Result structure:`, {
              hasResult: !!result,
              hasChildren: !!(result && result.children),
              childrenCount: result?.children?.length || 0,
              resultKeys: result ? Object.keys(result) : []
            });
            
            // Детальная диагностика структуры
            if (result) {
              console.log(`📊 DOCUMENT STRUCTURE ANALYSIS:`);
              console.log(`   - Document name: ${result.name || 'N/A'}`);
              console.log(`   - Document type: ${result.type || 'N/A'}`);
              console.log(`   - Children count: ${result.children?.length || 0}`);
              console.log(`   - Available keys: ${Object.keys(result).join(', ')}`);
              
              if (result.children && result.children.length > 0) {
                console.log(`   - First 5 children types: ${result.children.slice(0, 5).map((c: any) => `${c.name} (${c.type})`).join(', ')}`);
              }
            }
            
            saveDataImmediately('documentStructure', result, channelName);
            
            // Сохраняем структуру для рекурсивной обработки
            if (result) {
              exportState.documentStructure = result;
              console.log(`💾 Saved document structure for recursive processing`);
              
              // Запускаем рекурсивную обработку после небольшой задержки
              setTimeout(() => {
                processSavedDocumentStructure();
              }, 3000);
            }
            
            // Начинаем рекурсивную обработку экранов
            if (result && result.children) {
              console.log(`🔍 DEBUG: Found ${result.children.length} children in document structure`);
              
              const mainScreens = result.children.filter((child: any) => {
                const isScreen = child.type === 'FRAME' || child.type === 'COMPONENT' || child.type === 'INSTANCE';
                console.log(`🔍 DEBUG: Child ${child.name} (${child.type}) - isScreen: ${isScreen}`);
                return isScreen;
              });
              
              console.log(`🔍 DEBUG: Found ${mainScreens.length} main screens after filtering`);
              
              if (mainScreens.length > 0) {
                console.log(`🔄 Starting recursive processing of ${mainScreens.length} main screens...`);
                console.log(`🔍 DEBUG: Main screens:`, mainScreens.map((s: any) => `${s.name} (${s.type})`));
                
                setTimeout(() => {
                  processScreensRecursively(mainScreens, channelClients, channelName, 0);
                }, 2000); // Небольшая задержка после получения структуры
              } else {
                console.log(`⚠️ No main screens found for recursive processing`);
              }
            } else {
              console.log(`⚠️ No children found in document structure`);
            }
          } else if (messageId.startsWith('step2-')) {
            console.log(`🎨 Received styles data`);
            
            // Проверяем, что получили данные стилей
            if (!result) {
              console.error(`❌ ERROR: No styles data received from Figma plugin`);
              console.error(`❌ Expected: Styles data with colors, textStyles, etc.`);
              console.error(`❌ Received: ${JSON.stringify(data.message)}`);
              process.exit(1);
            }
            
            console.log(`🔍 DEBUG: Styles structure:`, {
              hasResult: !!result,
              stylesCount: result?.colors?.length || 0,
              textStylesCount: result?.textStyles?.length || 0,
              effectStylesCount: result?.effectStyles?.length || 0,
              gridStylesCount: result?.gridStyles?.length || 0
            });
            
            // Детальная диагностика стилей
            if (result) {
              console.log(`📊 STYLES ANALYSIS:`);
              console.log(`   - Colors: ${result.colors?.length || 0}`);
              console.log(`   - Text styles: ${result.textStyles?.length || 0}`);
              console.log(`   - Effect styles: ${result.effectStyles?.length || 0}`);
              console.log(`   - Grid styles: ${result.gridStyles?.length || 0}`);
              console.log(`   - Available keys: ${Object.keys(result).join(', ')}`);
            }
            
            saveDataImmediately('styles', result, channelName);
          } else if (messageId.startsWith('step3-')) {
            console.log(`🧩 Received components data`);
            console.log(`🔍 DEBUG: Components structure:`, {
              hasResult: !!result,
              componentsCount: result?.count || 0,
              componentsArrayLength: result?.components?.length || 0
            });
            
            // Детальная диагностика компонентов
            if (result) {
              console.log(`📊 COMPONENTS ANALYSIS:`);
              console.log(`   - Total components: ${result.count || 0}`);
              console.log(`   - Components array length: ${result.components?.length || 0}`);
              console.log(`   - Available keys: ${Object.keys(result).join(', ')}`);
              
              if (result.components && result.components.length > 0) {
                console.log(`   - First 5 components: ${result.components.slice(0, 5).map((c: any) => c.name).join(', ')}`);
              }
            }
            
            saveDataImmediately('components', result, channelName);
          } else if (messageId.startsWith('step4-')) {
            console.log(`📋 Received document info data`);
            console.log(`🔍 DEBUG: Document info:`, {
              hasResult: !!result,
              documentName: result?.name,
              documentVersion: result?.version,
              lastModified: result?.lastModified
            });
            
            // Детальная диагностика информации о документе
            if (result) {
              console.log(`📊 DOCUMENT INFO ANALYSIS:`);
              console.log(`   - Name: ${result.name || 'N/A'}`);
              console.log(`   - Version: ${result.version || 'N/A'}`);
              console.log(`   - Last modified: ${result.lastModified || 'N/A'}`);
              console.log(`   - Available keys: ${Object.keys(result).join(', ')}`);
            }
            
            saveDataImmediately('documentInfo', result, channelName);
          } else if (messageId.startsWith('step5-')) {
            console.log(`📝 Received annotations data`);
            console.log(`🔍 DEBUG: Annotations structure:`, {
              hasResult: !!result,
              annotatedNodesCount: result?.annotatedNodes?.length || 0
            });
            
            // Детальная диагностика аннотаций
            if (result) {
              console.log(`📊 ANNOTATIONS ANALYSIS:`);
              console.log(`   - Annotated nodes: ${result.annotatedNodes?.length || 0}`);
              console.log(`   - Available keys: ${Object.keys(result).join(', ')}`);
            }
            
            saveDataImmediately('annotations', result, channelName);
          } else if (messageId.startsWith('step6-')) {
            console.log(`📝 Received text nodes data`);
            console.log(`🔍 DEBUG: Text nodes structure:`, {
              hasResult: !!result,
              textNodesCount: result?.textNodes?.length || 0,
              totalTextNodes: result?.totalCount || 0
            });
            
            // Детальная диагностика текстовых нод
            if (result) {
              console.log(`📊 TEXT NODES ANALYSIS:`);
              console.log(`   - Text nodes found: ${result.textNodes?.length || 0}`);
              console.log(`   - Total count: ${result.totalCount || 0}`);
              console.log(`   - Available keys: ${Object.keys(result).join(', ')}`);
            }
            
            saveDataImmediately('textNodes', result, channelName);
          } else if (messageId.startsWith('step7-')) {
            console.log(`🔍 Received nodes by types data`);
            console.log(`🔍 DEBUG: Nodes by types structure:`, {
              hasResult: !!result,
              nodesByTypeCount: result?.nodesByType?.length || 0,
              totalNodes: result?.totalCount || 0
            });
            
            // Детальная диагностика нод по типам
            if (result) {
              console.log(`📊 NODES BY TYPES ANALYSIS:`);
              console.log(`   - Nodes by type: ${result.nodesByType?.length || 0}`);
              console.log(`   - Total nodes: ${result.totalCount || 0}`);
              console.log(`   - Available keys: ${Object.keys(result).join(', ')}`);
            }
            
            saveDataImmediately('nodesByTypes', result, channelName);
          } else if (messageId.startsWith('step8-')) {
            console.log(`🎭 Received reactions data`);
            console.log(`🔍 DEBUG: Reactions structure:`, {
              hasResult: !!result,
              reactionsCount: result?.reactions?.length || 0,
              nodesWithReactions: result?.nodesWithReactions || 0
            });
            
            // Детальная диагностика реакций
            if (result) {
              console.log(`📊 REACTIONS ANALYSIS:`);
              console.log(`   - Reactions found: ${result.reactions?.length || 0}`);
              console.log(`   - Nodes with reactions: ${result.nodesWithReactions || 0}`);
              console.log(`   - Available keys: ${Object.keys(result).join(', ')}`);
            }
            
            saveDataImmediately('reactions', result, channelName);
          } else if (messageId.startsWith('step9-')) {
            console.log(`🔄 Received instance overrides data`);
            console.log(`🔍 DEBUG: Overrides structure:`, {
              hasResult: !!result,
              overridesCount: result?.overrides?.length || 0,
              nodesWithOverrides: result?.nodesWithOverrides || 0
            });
            
            // Детальная диагностика переопределений
            if (result) {
              console.log(`📊 OVERRIDES ANALYSIS:`);
              console.log(`   - Overrides found: ${result.overrides?.length || 0}`);
              console.log(`   - Nodes with overrides: ${result.nodesWithOverrides || 0}`);
              console.log(`   - Available keys: ${Object.keys(result).join(', ')}`);
            }
            
            saveDataImmediately('instanceOverrides', result, channelName);
          } else if (messageId.startsWith('step10-')) {
            console.log(`🔗 Received connections data`);
            console.log(`🔍 DEBUG: Connections structure:`, {
              hasResult: !!result,
              connectionsCount: result?.connections?.length || 0,
              totalConnections: result?.totalCount || 0
            });
            
            // Детальная диагностика связей
            if (result) {
              console.log(`📊 CONNECTIONS ANALYSIS:`);
              console.log(`   - Connections found: ${result.connections?.length || 0}`);
              console.log(`   - Total connections: ${result.totalCount || 0}`);
              console.log(`   - Available keys: ${Object.keys(result).join(', ')}`);
            }
            
            saveDataImmediately('connections', result, channelName);
          } else if (messageId.startsWith('batch-nodes-')) {
            console.log(`🔍 Received batch nodes data`);
            console.log(`🔍 DEBUG: Batch nodes structure:`, {
              hasResult: !!result,
              nodesCount: result?.nodes?.length || 0,
              batchSize: result?.batchSize || 0
            });
            saveDataImmediately('nodeDetails', result, channelName);
          } else if (messageId.startsWith('batch-overrides-')) {
            console.log(`🔄 Received batch overrides data`);
            console.log(`🔍 DEBUG: Overrides structure:`, {
              hasResult: !!result,
              overridesCount: result?.overrides?.length || 0,
              nodesWithOverrides: result?.nodesWithOverrides || 0
            });
            saveDataImmediately('instanceOverrides', result, channelName);
          } else if (messageId.startsWith('batch-reactions-')) {
            console.log(`🎭 Received batch reactions data`);
            console.log(`🔍 DEBUG: Reactions structure:`, {
              hasResult: !!result,
              reactionsCount: result?.reactions?.length || 0,
              nodesWithReactions: result?.nodesWithReactions || 0
            });
            saveDataImmediately('reactions', result, channelName);
          } else {
            console.log(`📥 Received other message: ${data.message?.command || 'unknown'}`);
            console.log(`🔍 DEBUG: Unknown message structure:`, {
              hasResult: !!result,
              resultKeys: result ? Object.keys(result) : [],
              messageCommand: data.message?.command
            });
          }
          
          // Broadcast to other clients in same channel
          channelClients.forEach((client) => {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify(data));
            }
          });
        }
      } catch (error) {
        console.error("Error processing message:", error);
      }
    },
    close(ws: ServerWebSocket<any>) {
      console.log("Client disconnected");
      
      // Remove client from their channel
      channels.forEach((clients, channelName) => {
        if (clients.has(ws)) {
          clients.delete(ws);
          
          // Notify other clients in same channel
          clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({
                type: "system",
                message: "A user has left the channel",
                channel: channelName
              }));
            }
          });
        }
      });
    }
  }
});

console.log(`🚀 WebSocket server running on port ${server.port}`);
console.log(`📡 Server ready to accept connections`);
console.log(`🔗 Connect to: ws://localhost:${server.port}`);
