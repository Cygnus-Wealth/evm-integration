import { WebSocketProvider } from '../providers/WebSocketProvider';

export interface ConnectionStatus {
  chainId: number;
  isConnected: boolean;
  lastConnected?: number;
  lastDisconnected?: number;
  reconnectAttempts: number;
  error?: string;
}

export interface ConnectionManagerOptions {
  autoReconnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  healthCheckInterval?: number;
}

export type ConnectionStatusListener = (status: ConnectionStatus) => void;

export class ConnectionManager {
  private wsProvider: WebSocketProvider;
  private connectionStatuses: Map<number, ConnectionStatus> = new Map();
  private statusListeners: Set<ConnectionStatusListener> = new Set();
  private healthCheckIntervals: Map<number, NodeJS.Timeout> = new Map();
  private options: Required<ConnectionManagerOptions>;

  constructor(options: ConnectionManagerOptions = {}) {
    this.options = {
      autoReconnect: options.autoReconnect ?? true,
      reconnectInterval: options.reconnectInterval ?? 5000,
      maxReconnectAttempts: options.maxReconnectAttempts ?? 5,
      healthCheckInterval: options.healthCheckInterval ?? 30000,
    };

    this.wsProvider = new WebSocketProvider({
      autoReconnect: this.options.autoReconnect,
      reconnectInterval: this.options.reconnectInterval,
      maxReconnectAttempts: this.options.maxReconnectAttempts,
    });
  }

  public async connect(chainId: number): Promise<void> {
    try {
      await this.wsProvider.connect(chainId);
      this.updateConnectionStatus(chainId, {
        chainId,
        isConnected: true,
        lastConnected: Date.now(),
        reconnectAttempts: 0,
        error: undefined,
      });

      this.startHealthCheck(chainId);
    } catch (error) {
      const currentStatus = this.connectionStatuses.get(chainId);
      this.updateConnectionStatus(chainId, {
        chainId,
        isConnected: false,
        lastDisconnected: Date.now(),
        reconnectAttempts: (currentStatus?.reconnectAttempts ?? 0) + 1,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      if (this.options.autoReconnect && 
          (currentStatus?.reconnectAttempts ?? 0) < this.options.maxReconnectAttempts) {
        setTimeout(() => this.connect(chainId), this.options.reconnectInterval);
      }

      throw error;
    }
  }

  public disconnect(chainId: number): void {
    this.wsProvider.disconnect(chainId);
    this.stopHealthCheck(chainId);
    
    this.updateConnectionStatus(chainId, {
      chainId,
      isConnected: false,
      lastDisconnected: Date.now(),
      reconnectAttempts: 0,
    });
  }

  public disconnectAll(): void {
    const connectedChains = this.wsProvider.getConnectedChains();
    connectedChains.forEach(chainId => this.disconnect(chainId));
  }

  public getConnectionStatus(chainId: number): ConnectionStatus | undefined {
    return this.connectionStatuses.get(chainId);
  }

  public getAllConnectionStatuses(): ConnectionStatus[] {
    return Array.from(this.connectionStatuses.values());
  }

  public getConnectedChains(): number[] {
    return Array.from(this.connectionStatuses.values())
      .filter(status => status.isConnected)
      .map(status => status.chainId);
  }

  public isConnected(chainId: number): boolean {
    const status = this.connectionStatuses.get(chainId);
    return status?.isConnected ?? false;
  }

  public isAnyConnected(): boolean {
    return Array.from(this.connectionStatuses.values())
      .some(status => status.isConnected);
  }

  public onStatusChange(listener: ConnectionStatusListener): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  public getWebSocketProvider(): WebSocketProvider {
    return this.wsProvider;
  }

  public async healthCheck(chainId: number): Promise<boolean> {
    try {
      const isConnected = this.wsProvider.isConnected(chainId);
      const currentStatus = this.connectionStatuses.get(chainId);
      
      if (currentStatus && currentStatus.isConnected !== isConnected) {
        this.updateConnectionStatus(chainId, {
          ...currentStatus,
          isConnected,
          lastDisconnected: isConnected ? currentStatus.lastDisconnected : Date.now(),
          lastConnected: isConnected ? Date.now() : currentStatus.lastConnected,
        });

        if (!isConnected && this.options.autoReconnect) {
          setTimeout(() => this.connect(chainId), this.options.reconnectInterval);
        }
      }

      return isConnected;
    } catch (error) {
      console.error(`Health check failed for chain ${chainId}:`, error);
      return false;
    }
  }

  private updateConnectionStatus(chainId: number, status: ConnectionStatus): void {
    this.connectionStatuses.set(chainId, status);
    this.notifyStatusListeners(status);
  }

  private notifyStatusListeners(status: ConnectionStatus): void {
    this.statusListeners.forEach(listener => {
      try {
        listener(status);
      } catch (error) {
        console.error('Error in connection status listener:', error);
      }
    });
  }

  private startHealthCheck(chainId: number): void {
    this.stopHealthCheck(chainId);
    
    const interval = setInterval(() => {
      this.healthCheck(chainId);
    }, this.options.healthCheckInterval);

    this.healthCheckIntervals.set(chainId, interval);
  }

  private stopHealthCheck(chainId: number): void {
    const interval = this.healthCheckIntervals.get(chainId);
    if (interval) {
      clearInterval(interval);
      this.healthCheckIntervals.delete(chainId);
    }
  }

  public async cleanup(): Promise<void> {
    // Stop all health checks
    this.healthCheckIntervals.forEach(interval => clearInterval(interval));
    this.healthCheckIntervals.clear();

    // Disconnect all connections
    this.disconnectAll();

    // Clear listeners
    this.statusListeners.clear();
    this.connectionStatuses.clear();

    // Cleanup WebSocket provider
    await this.wsProvider.cleanup();
  }
}