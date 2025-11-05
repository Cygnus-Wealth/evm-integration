# 🚀 Quick Start - Live Testnet Demo

Get up and running in **2 minutes**!

## Step 1: Install Dependencies (30 seconds)

```bash
cd demo-ui
npm install
```

## Step 2: Start Dev Server (10 seconds)

```bash
npm run dev
```

Browser opens automatically at `http://localhost:3000` 🎉

## Step 3: Get Testnet ETH (1 minute)

1. Install MetaMask if needed: https://metamask.io
2. Switch to **Sepolia** testnet in MetaMask
3. Get free testnet ETH: https://sepoliafaucet.com
4. Wait ~30 seconds for testnet ETH to arrive

## Step 4: Test Live Balance Updates! (30 seconds)

1. Click **"Connect MetaMask"** in the demo UI
2. Your balance appears automatically ✨
3. Enable **"Auto-refresh every 5 seconds"**
4. In MetaMask, send yourself 0.001 SepoliaETH
5. **Watch your balance update live!** 🔥

## That's It! 🎉

You're now:
- ✅ Connected to a real blockchain (Sepolia testnet)
- ✅ Fetching live balances
- ✅ Watching real-time updates
- ✅ Testing the EVM Integration library

## What You're Testing

This demo uses:
- **Viem** for blockchain interaction
- **Sepolia testnet** (real Ethereum test network)
- **MetaMask** for wallet connection
- **React** for the UI
- **Real RPC calls** to public nodes

## Troubleshooting

### "MetaMask is not installed"
→ Install MetaMask browser extension

### Balance shows 0.00
→ Get testnet ETH from faucet (link in Step 3)

### Can't connect wallet
→ Make sure MetaMask is unlocked and on Sepolia network

### Balance not updating
→ Click "Fetch Balance" button manually

## Advanced Testing

### Test Multiple Addresses
1. Disconnect wallet
2. Paste any Sepolia address in the input
3. Click "Fetch Balance"

### Watch Live Transactions
1. Keep auto-refresh enabled
2. Make a transaction in MetaMask
3. Watch balance change in real-time

### Test Error Handling
- Try invalid address format
- Switch MetaMask to wrong network
- See error messages appear

## Need Help?

See full documentation: `demo-ui/README.md`

---

**Enjoy testing!** If you see live balance updates, everything is working perfectly! 🎊
