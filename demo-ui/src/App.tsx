import { useState, useEffect, useRef } from 'react';
import { type Address } from 'viem';
import { ChainRegistry, EvmChainAdapter } from '@cygnus-wealth/evm-integration';
import { sepoliaConfig } from './sepolia-config';
import './App.css';

function App() {
  const [address, setAddress] = useState<Address | ''>('');
  const [balance, setBalance] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [liveUpdates, setLiveUpdates] = useState(false);
  const [connected, setConnected] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [connectionType, setConnectionType] = useState<'websocket' | 'http'>('http');

  // Create registry and adapter
  const registryRef = useRef<ChainRegistry | null>(null);
  const adapterRef = useRef<EvmChainAdapter | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  // Initialize adapter
  useEffect(() => {
    if (!registryRef.current) {
      registryRef.current = new ChainRegistry();
      registryRef.current.registerChain(sepoliaConfig);
      adapterRef.current = registryRef.current.getAdapter(11155111) as EvmChainAdapter;
      adapterRef.current.connect();
    }
  }, []);

  const connectWallet = async () => {
    if (typeof window.ethereum !== 'undefined') {
      try {
        const accounts = await window.ethereum.request({
          method: 'eth_requestAccounts',
        });
        setAddress(accounts[0] as Address);
        setConnected(true);
        setError('');
        setCurrentStep(3); // Move to step 3 after connecting
      } catch (err: any) {
        setError(`Failed to connect: ${err.message}`);
      }
    } else {
      setError('MetaMask is not installed. Install it from https://metamask.io');
    }
  };

  const fetchBalance = async (addr: Address) => {
    if (!addr || !adapterRef.current) return;

    setLoading(true);
    setError('');

    try {
      const balanceData = await adapterRef.current.getBalance(addr);
      setBalance(balanceData.value?.amount.toString() || '0');
      setLastUpdated(new Date());
      setConnectionType('http');
      if (currentStep === 3) setCurrentStep(4); // Move to step 4 after first fetch
    } catch (err: any) {
      setError(`Failed to fetch balance: ${err.message}`);
      setBalance('');
    } finally {
      setLoading(false);
    }
  };

  const handleAddressSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (address) {
      fetchBalance(address);
    }
  };

  // Handle WebSocket subscription for live updates
  useEffect(() => {
    if (!liveUpdates || !address || !adapterRef.current) {
      // Clean up subscription if live updates are disabled
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
        setConnectionType('http');
      }
      return;
    }

    // Subscribe to balance updates via WebSocket
    const setupSubscription = async () => {
      try {
        const unsubscribe = await adapterRef.current!.subscribeToBalance(
          address,
          (balanceData) => {
            setBalance(balanceData.value?.amount.toString() || '0');
            setLastUpdated(new Date());
            setConnectionType('websocket');
          }
        );
        unsubscribeRef.current = unsubscribe;
      } catch (err: any) {
        console.error('WebSocket subscription failed:', err);
        setError(`WebSocket failed: ${err.message}. Using HTTP polling instead.`);
        // Fall back to polling if WebSocket fails
        const interval = setInterval(() => {
          fetchBalance(address);
        }, 5000);
        unsubscribeRef.current = () => clearInterval(interval);
      }
    };

    setupSubscription();

    // Cleanup on unmount or when dependencies change
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [liveUpdates, address]);

  useEffect(() => {
    if (address) {
      fetchBalance(address);
    }
  }, [address]);

  return (
    <div className="app">
      <div className="card">
        <h1>🔗 EVM Integration Live Demo</h1>
        <p className="subtitle">Test real blockchain balance fetching on Sepolia testnet</p>

        {/* Step-by-step guide */}
        <div className="steps-container">
          <div className={`step ${currentStep >= 1 ? 'active' : ''} ${currentStep > 1 ? 'completed' : ''}`}>
            <div className="step-number">1</div>
            <div className="step-content">
              <h3>Install MetaMask</h3>
              <p>
                {typeof window.ethereum !== 'undefined' ? (
                  <span className="success">✓ MetaMask detected!</span>
                ) : (
                  <>
                    Install the{' '}
                    <a href="https://metamask.io" target="_blank" rel="noopener noreferrer">
                      MetaMask browser extension
                    </a>
                  </>
                )}
              </p>
            </div>
          </div>

          <div className={`step ${currentStep >= 2 ? 'active' : ''} ${currentStep > 2 ? 'completed' : ''}`}>
            <div className="step-number">2</div>
            <div className="step-content">
              <h3>Switch to Sepolia & Get Testnet ETH</h3>
              <p>
                <strong>Switch MetaMask to Sepolia network:</strong>
              </p>
              <ol style={{ marginLeft: '20px', marginBottom: '12px' }}>
                <li>Click the network dropdown at the top of MetaMask</li>
                <li>Enable "Show test networks" if you don't see Sepolia</li>
                <li>Select <strong>Sepolia test network</strong></li>
              </ol>
              <p>
                Then get free testnet ETH:
              </p>
              <a
                href="https://sepoliafaucet.com"
                target="_blank"
                rel="noopener noreferrer"
                className="faucet-link"
              >
                🚰 Get Sepolia ETH (Free)
              </a>
              <p className="small">Takes ~30 seconds. You only need 0.01 SepoliaETH</p>
            </div>
          </div>

          <div className={`step ${currentStep >= 3 ? 'active' : ''} ${currentStep > 3 ? 'completed' : ''}`}>
            <div className="step-number">3</div>
            <div className="step-content">
              <h3>Connect & View Balance</h3>
              {!connected ? (
                <button className="action-btn" onClick={connectWallet}>
                  Connect MetaMask
                </button>
              ) : (
                <div>
                  <span className="success">✓ Wallet Connected!</span>
                  <p className="small">Address: {address?.slice(0, 6)}...{address?.slice(-4)}</p>
                </div>
              )}
            </div>
          </div>

          <div className={`step ${currentStep >= 4 ? 'active' : ''} ${currentStep > 4 ? 'completed' : ''}`}>
            <div className="step-number">4</div>
            <div className="step-content">
              <h3>Watch Live Updates</h3>
              {balance ? (
                <div>
                  <p>Enable WebSocket connection to see balance update in real-time!</p>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={liveUpdates}
                      onChange={(e) => {
                        setLiveUpdates(e.target.checked);
                        if (e.target.checked) setCurrentStep(5);
                      }}
                    />
                    <span>Live updates via WebSocket {connectionType === 'websocket' && '🟢'}</span>
                  </label>
                </div>
              ) : (
                <p className="small">Balance will appear here after connecting</p>
              )}
            </div>
          </div>

          <div className={`step ${currentStep >= 5 ? 'active' : ''}`}>
            <div className="step-number">5</div>
            <div className="step-content">
              <h3>Test Live Transaction</h3>
              <p>Send yourself 0.001 SepoliaETH in MetaMask and watch it update here! 🎉</p>
            </div>
          </div>
        </div>

        {/* Balance display */}
        {balance && (
          <div className="balance-section">
            <div className="balance-card">
              <div className="balance-label">Your Sepolia Balance</div>
              <div className="balance-amount">{balance} SepoliaETH</div>
              {lastUpdated && (
                <div className="last-updated">
                  Last updated: {lastUpdated.toLocaleTimeString()}
                  {liveUpdates && <span className="pulse"> • {connectionType === 'websocket' ? 'WebSocket Live' : 'Polling'}</span>}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Manual address input */}
        <details className="advanced-section">
          <summary>Advanced: Test Any Address</summary>
          <form onSubmit={handleAddressSubmit} className="address-form">
            <input
              type="text"
              placeholder="0x... (any Sepolia address)"
              value={address}
              onChange={(e) => setAddress(e.target.value as Address)}
              className="address-input"
            />
            <button type="submit" className="fetch-btn" disabled={loading || !address}>
              {loading ? 'Fetching...' : 'Fetch Balance'}
            </button>
          </form>
        </details>

        {error && (
          <div className="error-box">
            <strong>⚠️ Error:</strong> {error}
          </div>
        )}

        {/* Quick tips */}
        <div className="tips-section">
          <h3>💡 Quick Tips</h3>
          <ul>
            <li>Make sure MetaMask is on <strong>Sepolia</strong> network</li>
            <li>The faucet gives you testnet ETH instantly (no real money)</li>
            <li>With WebSocket enabled, balance updates instantly on new blocks</li>
            <li>Look for the green 🟢 indicator when WebSocket is connected</li>
            <li>You can test any Sepolia address using the advanced section</li>
          </ul>
        </div>

        <div className="footer">
          <p>
            <strong>What you're testing:</strong> Real blockchain connection • WebSocket subscriptions
            • Live balance updates • MetaMask integration
          </p>
          <p className="small">
            Tech: React + TypeScript + @cygnus-wealth/evm-integration + Viem + Sepolia Testnet
          </p>
        </div>
      </div>
    </div>
  );
}

declare global {
  interface Window {
    ethereum?: any;
  }
}

export default App;
