import { WebSocket } from 'ws';
import * as fs from 'fs';
import * as path from 'path';

interface FigmaNode {
  id: string;
  name: string;
  type: string;
  children?: FigmaNode[];
  fills?: any[];
  strokes?: any[];
  effects?: any[];
  constraints?: any;
  absoluteBoundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  relativeTransform?: number[][];
  [key: string]: any;
}

interface ExportConfig {
  outputDir: string;
  includeImages: boolean;
  includeStyles: boolean;
  includeComponents: boolean;
  maxDepth: number;
  timeout: number;
  batchSize: number;
}

class FigmaExporter {
  private ws: WebSocket;
  private config: ExportConfig;
  private exportQueue: string[] = [];
  private processedNodes: Set<string> = new Set();
  private nodeCache: Map<string, FigmaNode> = new Map();
  private isConnected: boolean = false;
  private messageId: number = 0;

  constructor(config: Partial<ExportConfig> = {}) {
    this.config = {
      outputDir: './export',
      includeImages: true,
      includeStyles: true,
      includeComponents: true,
      maxDepth: 10,
      timeout: 300000, // 5 минут
      batchSize: 5, // Установлен размер батча в 5 нод
      ...config
    };

    this.ws = new WebSocket('ws://localhost:3055');
    this.setupWebSocket();
  }

  private setupWebSocket(): void {
    this.ws.on('open', () => {
      console.log('🔗 Connected to WebSocket server');
      this.isConnected = true;
      this.joinChannel();
    });

    this.ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleMessage(message);
      } catch (error) {
        console.error('❌ Error parsing message:', error);
      }
    });

    this.ws.on('error', (error) => {
      console.error('❌ WebSocket error:', error);
    });

    this.ws.on('close', () => {
      console.log('🔌 WebSocket connection closed');
      this.isConnected = false;
    });
  }

  private joinChannel(): void {
    const joinMessage = {
      type: 'join',
      channel: 'figma'
    };
    this.ws.send(JSON.stringify(joinMessage));
    console.log('📡 Joined figma channel');
  }

  private handleMessage(message: any): void {
    if (message.type === 'join-response') {
      console.log('✅ Successfully joined channel');
      this.startExport();
    } else if (message.result) {
      this.processNodeResponse(message);
    } else if (message.error) {
      console.error('❌ Figma API error:', message.error);
    }
  }

  private async startExport(): Promise<void> {
    console.log('🚀 Starting Figma export...');
    
    // Создаем структуру папок
    this.createExportStructure();
    
    // Получаем информацию о документе
    await this.getDocumentInfo();
    
    // Получаем все страницы
    await this.getAllPages();
    
    // Начинаем обработку очереди
    this.processQueue();
  }

  private createExportStructure(): void {
    const dirs = [
      this.config.outputDir,
      path.join(this.config.outputDir, 'nodes'),
      path.join(this.config.outputDir, 'images'),
      path.join(this.config.outputDir, 'styles'),
      path.join(this.config.outputDir, 'components'),
      path.join(this.config.outputDir, 'metadata')
    ];

    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`📁 Created directory: ${dir}`);
      }
    });
  }

  private async getDocumentInfo(): Promise<void> {
    const messageId = this.generateMessageId();
    const message = {
      id: messageId,
      type: 'message',
      channel: 'figma',
      message: {
        id: messageId,
        command: 'get_document_info',
        params: { commandId: messageId }
      }
    };

    this.ws.send(JSON.stringify(message));
    console.log('📄 Requesting document info...');
  }

  private async getAllPages(): Promise<void> {
    const messageId = this.generateMessageId();
    const message = {
      id: messageId,
      type: 'message',
      channel: 'figma',
      message: {
        id: messageId,
        command: 'get_all_pages',
        params: { commandId: messageId }
      }
    };

    this.ws.send(JSON.stringify(message));
    console.log('📑 Requesting all pages...');
  }

  private processNodeResponse(message: any): void {
    const node = message.result;
    if (!node) return;

    console.log(`📦 Processing node: ${node.name} (${node.id})`);
    
    // Сохраняем узел в кэш
    this.nodeCache.set(node.id, node);
    this.processedNodes.add(node.id);

    // Сохраняем узел в файл
    this.saveNodeToFile(node);

    // Добавляем дочерние элементы в очередь
    if (node.children && Array.isArray(node.children)) {
      node.children.forEach((child: any) => {
        if (child.id && !this.processedNodes.has(child.id)) {
          this.exportQueue.push(child.id);
        }
      });
    }

    // Продолжаем обработку очереди
    setTimeout(() => this.processQueue(), 100);
  }

  private saveNodeToFile(node: FigmaNode): void {
    try {
      // Создаем безопасное имя файла
      const safeName = this.sanitizeFileName(node.name);
      const fileName = `${node.id}_${safeName}.json`;
      const filePath = path.join(this.config.outputDir, 'nodes', fileName);

      // Подготавливаем данные для сохранения
      const exportData = {
        metadata: {
          exportedAt: new Date().toISOString(),
          nodeId: node.id,
          nodeName: node.name,
          nodeType: node.type,
          exportVersion: '1.0.0'
        },
        node: this.sanitizeNodeData(node),
        relationships: this.extractRelationships(node)
      };

      // Сохраняем в файл
      fs.writeFileSync(filePath, JSON.stringify(exportData, null, 2));
      console.log(`💾 Saved node: ${fileName}`);

      // Сохраняем изображение если нужно
      if (this.config.includeImages && this.shouldExportImage(node)) {
        this.exportNodeImage(node);
      }

    } catch (error) {
      console.error(`❌ Error saving node ${node.id}:`, error);
    }
  }

  private sanitizeNodeData(node: FigmaNode): any {
    // Удаляем циклические ссылки и большие объекты
    const sanitized = { ...node };
    
    // Удаляем потенциально проблемные поля
    delete sanitized.children;
    delete sanitized.parent;
    
    return sanitized;
  }

  private extractRelationships(node: FigmaNode): any {
    const relationships = {
      children: [],
      parent: null,
      styles: [],
      components: []
    };

    if (node.children) {
      relationships.children = node.children.map((child: any) => ({
        id: child.id,
        name: child.name,
        type: child.type
      }));
    }

    return relationships;
  }

  private shouldExportImage(node: FigmaNode): boolean {
    const imageTypes = ['RECTANGLE', 'ELLIPSE', 'POLYGON', 'STAR', 'VECTOR', 'TEXT', 'FRAME', 'GROUP', 'COMPONENT', 'INSTANCE'];
    return imageTypes.includes(node.type);
  }

  private async exportNodeImage(node: FigmaNode): Promise<void> {
    try {
      const messageId = this.generateMessageId();
      const message = {
        id: messageId,
        type: 'message',
        channel: 'figma',
        message: {
          id: messageId,
          command: 'export_node_image',
          params: {
            commandId: messageId,
            nodeId: node.id,
            format: 'PNG',
            constraint: 'SCALE',
            value: 4 // Увеличиваем масштаб до 4x для более высокого разрешения
          }
        }
      };

      this.ws.send(JSON.stringify(message));
      console.log(`🖼️ Requesting image for node: ${node.id}`);
    } catch (error) {
      console.error(`❌ Error requesting image for node ${node.id}:`, error);
    }
  }

  private processQueue(): void {
    if (this.exportQueue.length === 0) {
      console.log('✅ Export queue is empty. Export completed!');
      this.generateExportReport();
      return;
    }

    const batch = this.exportQueue.splice(0, this.config.batchSize);
    console.log(`🔄 Processing batch of ${batch.length} nodes...`);

    batch.forEach(nodeId => {
      if (!this.processedNodes.has(nodeId)) {
        this.requestNodeInfo(nodeId);
      }
    });
  }

  private requestNodeInfo(nodeId: string): void {
    const messageId = this.generateMessageId();
    const message = {
      id: messageId,
      type: 'message',
      channel: 'figma',
      message: {
        id: messageId,
        command: 'get_node_info',
        params: {
          commandId: messageId,
          nodeId: nodeId
        }
      }
    };

    this.ws.send(JSON.stringify(message));
  }

  private generateMessageId(): string {
    return `export_${++this.messageId}_${Date.now()}`;
  }

  private sanitizeFileName(name: string): string {
    return name
      .replace(/[<>:"/\\|?*]/g, '_')
      .replace(/\s+/g, '_')
      .substring(0, 50);
  }

  private generateExportReport(): void {
    const report = {
      exportInfo: {
        exportedAt: new Date().toISOString(),
        totalNodes: this.processedNodes.size,
        totalFiles: this.nodeCache.size,
        exportConfig: this.config
      },
      statistics: {
        nodesByType: this.getNodesByType(),
        totalSize: this.calculateTotalSize()
      },
      files: Array.from(this.nodeCache.keys()).map(id => {
        const node = this.nodeCache.get(id)!;
        return {
          id: node.id,
          name: node.name,
          type: node.type,
          fileName: `${node.id}_${this.sanitizeFileName(node.name)}.json`
        };
      })
    };

    const reportPath = path.join(this.config.outputDir, 'metadata', 'export_report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`📊 Export report saved: ${reportPath}`);
  }

  private getNodesByType(): Record<string, number> {
    const types: Record<string, number> = {};
    this.nodeCache.forEach(node => {
      types[node.type] = (types[node.type] || 0) + 1;
    });
    return types;
  }

  private calculateTotalSize(): number {
    let totalSize = 0;
    this.nodeCache.forEach(node => {
      totalSize += JSON.stringify(node).length;
    });
    return totalSize;
  }

  public async export(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        console.log('⏰ Export timeout reached, but continuing...');
        resolve(); // Не отклоняем, а разрешаем
      }, this.config.timeout);

      this.ws.on('close', () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }

  public disconnect(): void {
    if (this.ws) {
      this.ws.close();
    }
  }
}

// Функция для запуска экспорта
async function runFigmaExport(config?: Partial<ExportConfig>): Promise<void> {
  console.log('🎨 Figma Export Tool Starting...');
  
  const exporter = new FigmaExporter(config);
  
  try {
    await exporter.export();
    console.log('🎉 Export completed successfully!');
  } catch (error) {
    console.error('❌ Export failed:', error);
  } finally {
    exporter.disconnect();
  }
}

// Экспорт для использования в других модулях
export { FigmaExporter, runFigmaExport, ExportConfig };

// Запуск если файл выполняется напрямую
if (require.main === module) {
  const config: Partial<ExportConfig> = {
    outputDir: './export',
    includeImages: true,
    includeStyles: true,
    includeComponents: true,
    maxDepth: 10,
    timeout: 60000, // 1 минута
    batchSize: 5
  };

  runFigmaExport(config).catch(console.error);
} 