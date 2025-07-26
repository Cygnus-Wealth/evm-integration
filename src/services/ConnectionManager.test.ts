import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConnectionManager, ConnectionStatus } from './ConnectionManager';
import { WebSocketProvider } from '../providers/WebSocketProvider';

vi.mock('../providers/WebSocketProvider');

describe('ConnectionManager', () => {
  let connectionManager: ConnectionManager;
  let mockProvider: any;

  beforeEach(() => {
    vi.clearAllTimers();
    vi.useFakeTimers();

    // Suppress expected unhandled rejections in tests
    const originalOnUnhandledRejection = process.listeners('unhandledRejection');
    process.removeAllListeners('unhandledRejection');
    process.on('unhandledRejection', (reason) => {
      // Only suppress "Connection failed" errors from our tests
      if (reason instanceof Error && reason.message === 'Connection failed') {
        return;
      }
      // Re-throw other unhandled rejections
      throw reason;
    });

    mockProvider = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn(),
      getConnectedChains: vi.fn().mockReturnValue([]),
      isConnected: vi.fn().mockReturnValue(false),
      cleanup: vi.fn().mockResolvedValue(undefined),
    };

    (WebSocketProvider as any).mockImplementation(() => mockProvider);
    connectionManager = new ConnectionManager();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    connectionManager.cleanup();
  });

  describe('constructor', () => {
    it('should create manager with default options', () => {
      expect(connectionManager).toBeInstanceOf(ConnectionManager);
    });

    it('should create manager with custom options', () => {
      const customManager = new ConnectionManager({
        autoReconnect: false,
        reconnectInterval: 10000,
        maxReconnectAttempts: 10,
        healthCheckInterval: 60000,
      });
      expect(customManager).toBeInstanceOf(ConnectionManager);
    });
  });

  describe('connect', () => {
    it('should connect successfully', async () => {
      await connectionManager.connect(1);

      expect(mockProvider.connect).toHaveBeenCalledWith(1);
      expect(connectionManager.isConnected(1)).toBe(true);
      
      const status = connectionManager.getConnectionStatus(1);
      expect(status).toMatchObject({
        chainId: 1,
        isConnected: true,
        reconnectAttempts: 0,
      });
      expect(status?.lastConnected).toBeDefined();
    });

    it('should handle connection errors', async () => {
      const connectionError = new Error('Connection failed');
      mockProvider.connect.mockRejectedValue(connectionError);

      await expect(connectionManager.connect(1)).rejects.toThrow('Connection failed');

      const status = connectionManager.getConnectionStatus(1);
      expect(status).toMatchObject({
        chainId: 1,
        isConnected: false,
        reconnectAttempts: 1,
        error: 'Connection failed',
      });
    });

    it('should auto-reconnect on failure', async () => {
      const connectionError = new Error('Connection failed');
      mockProvider.connect
        .mockRejectedValueOnce(connectionError)
        .mockResolvedValueOnce(undefined);

      try {
        await connectionManager.connect(1);
      } catch (error) {
        expect(error).toEqual(connectionError);
      }

      // Fast-forward to trigger reconnection
      vi.advanceTimersByTime(5000);

      expect(mockProvider.connect).toHaveBeenCalledTimes(2);
    });

    it('should stop reconnecting after max attempts', async () => {
      const manager = new ConnectionManager({ maxReconnectAttempts: 2 });
      const connectionError = new Error('Connection failed');
      
      // Mock to reject all attempts
      let callCount = 0;
      mockProvider.connect.mockImplementation(() => {
        callCount++;
        return Promise.reject(connectionError);
      });

      // First attempt
      try {
        await manager.connect(1);
      } catch (error) {
        expect(error).toEqual(connectionError);
      }
      
      // Allow time for retries to happen
      await vi.advanceTimersToNextTimerAsync(); // First retry
      await vi.advanceTimersToNextTimerAsync(); // Second retry

      expect(callCount).toBe(3);

      // Should not retry again after max attempts
      vi.advanceTimersByTime(10000);
      
      expect(callCount).toBe(3);

      // Cleanup to prevent unhandled rejections
      await manager.cleanup();
    });

    it('should start health check after successful connection', async () => {
      await connectionManager.connect(1);

      // Fast-forward to trigger health check
      vi.advanceTimersByTime(30000);

      expect(mockProvider.isConnected).toHaveBeenCalledWith(1);
    });
  });

  describe('disconnect', () => {
    it('should disconnect successfully', async () => {
      await connectionManager.connect(1);
      expect(connectionManager.isConnected(1)).toBe(true);

      connectionManager.disconnect(1);

      expect(mockProvider.disconnect).toHaveBeenCalledWith(1);
      expect(connectionManager.isConnected(1)).toBe(false);
      
      const status = connectionManager.getConnectionStatus(1);
      expect(status?.isConnected).toBe(false);
      expect(status?.lastDisconnected).toBeDefined();
    });

    it('should handle disconnect from non-connected chain', () => {
      expect(() => connectionManager.disconnect(1)).not.toThrow();
    });
  });

  describe('disconnectAll', () => {
    it('should disconnect all connected chains', async () => {
      mockProvider.getConnectedChains.mockReturnValue([1, 137]);
      
      await connectionManager.connect(1);
      await connectionManager.connect(137);

      connectionManager.disconnectAll();

      expect(mockProvider.disconnect).toHaveBeenCalledWith(1);
      expect(mockProvider.disconnect).toHaveBeenCalledWith(137);
    });
  });

  describe('status management', () => {
    it('should return connection status', async () => {
      await connectionManager.connect(1);

      const status = connectionManager.getConnectionStatus(1);
      expect(status).toMatchObject({
        chainId: 1,
        isConnected: true,
        reconnectAttempts: 0,
      });
    });

    it('should return undefined for non-existent chain', () => {
      const status = connectionManager.getConnectionStatus(999);
      expect(status).toBeUndefined();
    });

    it('should return all connection statuses', async () => {
      await connectionManager.connect(1);
      await connectionManager.connect(137);

      const statuses = connectionManager.getAllConnectionStatuses();
      expect(statuses).toHaveLength(2);
      expect(statuses.some(s => s.chainId === 1)).toBe(true);
      expect(statuses.some(s => s.chainId === 137)).toBe(true);
    });

    it('should return connected chains', async () => {
      await connectionManager.connect(1);
      await connectionManager.connect(137);

      const connectedChains = connectionManager.getConnectedChains();
      expect(connectedChains).toContain(1);
      expect(connectedChains).toContain(137);
    });

    it('should check if any chain is connected', async () => {
      expect(connectionManager.isAnyConnected()).toBe(false);

      await connectionManager.connect(1);
      expect(connectionManager.isAnyConnected()).toBe(true);
    });
  });

  describe('status listeners', () => {
    it('should notify listeners on status change', async () => {
      const listener = vi.fn();
      const unsubscribe = connectionManager.onStatusChange(listener);

      await connectionManager.connect(1);

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          chainId: 1,
          isConnected: true,
        })
      );

      unsubscribe();
    });

    it('should handle listener errors gracefully', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const faultyListener = vi.fn().mockImplementation(() => {
        throw new Error('Listener error');
      });

      connectionManager.onStatusChange(faultyListener);
      await connectionManager.connect(1);

      expect(consoleError).toHaveBeenCalledWith(
        'Error in connection status listener:',
        expect.any(Error)
      );

      consoleError.mockRestore();
    });

    it('should remove listeners when unsubscribed', async () => {
      const listener = vi.fn();
      const unsubscribe = connectionManager.onStatusChange(listener);

      unsubscribe();
      await connectionManager.connect(1);

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('health checks', () => {
    it('should perform health checks periodically', async () => {
      await connectionManager.connect(1);

      vi.advanceTimersByTime(30000);
      expect(mockProvider.isConnected).toHaveBeenCalledWith(1);

      vi.advanceTimersByTime(30000);
      expect(mockProvider.isConnected).toHaveBeenCalledTimes(2);
    });

    it('should detect disconnection during health check', async () => {
      await connectionManager.connect(1);
      expect(connectionManager.isConnected(1)).toBe(true);

      // Simulate disconnection
      mockProvider.isConnected.mockReturnValue(false);

      const listener = vi.fn();
      connectionManager.onStatusChange(listener);

      vi.advanceTimersByTime(30000);

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          chainId: 1,
          isConnected: false,
        })
      );
    });

    it('should trigger reconnection when health check fails', async () => {
      const manager = new ConnectionManager({ autoReconnect: true });
      await manager.connect(1);

      // Simulate disconnection
      mockProvider.isConnected.mockReturnValue(false);

      vi.advanceTimersByTime(30000); // Health check
      vi.advanceTimersByTime(5000);  // Reconnect interval

      expect(mockProvider.connect).toHaveBeenCalledTimes(2);
    });

    it('should handle health check errors', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      await connectionManager.connect(1);

      mockProvider.isConnected.mockImplementation(() => {
        throw new Error('Health check error');
      });

      const result = await connectionManager.healthCheck(1);

      expect(result).toBe(false);
      expect(consoleError).toHaveBeenCalledWith(
        'Health check failed for chain 1:',
        expect.any(Error)
      );

      consoleError.mockRestore();
    });
  });

  describe('getWebSocketProvider', () => {
    it('should return the WebSocket provider instance', () => {
      const provider = connectionManager.getWebSocketProvider();
      expect(provider).toBe(mockProvider);
    });
  });

  describe('cleanup', () => {
    it('should cleanup all resources', async () => {
      await connectionManager.connect(1);
      await connectionManager.connect(137);

      const listener = vi.fn();
      connectionManager.onStatusChange(listener);

      await connectionManager.cleanup();

      expect(mockProvider.cleanup).toHaveBeenCalled();

      // Should not have any statuses after cleanup
      expect(connectionManager.getAllConnectionStatuses()).toHaveLength(0);
    });

    it('should stop all health check intervals', async () => {
      await connectionManager.connect(1);
      await connectionManager.connect(137);

      await connectionManager.cleanup();

      // Health checks should not run after cleanup
      vi.advanceTimersByTime(60000);
      expect(mockProvider.isConnected).not.toHaveBeenCalled();
    });
  });
});