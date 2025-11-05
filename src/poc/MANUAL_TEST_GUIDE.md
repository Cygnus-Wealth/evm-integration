# Manual Testing Guide

## How to Use the Interactive Manual Testing Tool

### Start the Tool

```bash
npx tsx src/poc/manual-test.ts
```

### Menu Options

When the tool starts, you'll see 13 menu options:

#### Testing Features

**1. Test RateLimiter**
- Tests the token bucket rate limiting
- You choose how many tokens to acquire
- Shows which tokens were acquired/denied
- Displays remaining tokens

**2. Test HealthMonitor**
- Runs all registered health checks
- Shows overall system status
- Displays component-level health
- Shows response times

**3. Test MetricsCollector**
- Choose metric type (counter, gauge, histogram, summary)
- Provide custom values
- Add labels for tracking
- Great for understanding metrics

**4. Test CircuitBreaker**
- Execute successful or failing operations
- Watch circuit state change
- See failure/success counts
- Observe open/closed transitions

**5. Test RetryPolicy**
- Choose failure scenario
- Watch retry attempts
- See exponential backoff in action
- Observe success after retries

**6. Test CacheManager**
- Set/get/delete cache entries
- Set custom TTL values
- Check key existence
- Experiment with cache behavior

**7. Test BalanceService**
- Fetch mock balance data
- Provide custom address or use default
- See cache hit/miss stats
- Observe fetch timing

#### Viewing Stats

**8. View RateLimiter Stats**
- Current available tokens
- Capacity and refill rate
- Quick status check

**9. View Health Status**
- Overall system health
- All component statuses
- Uptime information

**10. View Metrics (Prometheus format)**
- See all collected metrics
- Prometheus-compatible export
- Useful for understanding metric structure

**11. View Cache Stats**
- Cache size and capacity
- Hit/miss ratio
- Eviction count

**12. View CircuitBreaker Stats**
- Current circuit state
- Failure/success counts
- Last failure time

#### Utility

**13. Reset All Components**
- Resets all components to initial state
- Clears all metrics
- Fresh start for testing

**0. Exit**
- Cleanly exit the tool

## Example Usage Scenarios

### Scenario 1: Test Rate Limiting

1. Run the tool: `npx tsx src/poc/manual-test.ts`
2. Choose option `1` (Test RateLimiter)
3. Enter `5` to acquire 5 tokens
4. Observe which tokens were acquired
5. Choose option `8` to view remaining tokens
6. Try acquiring more tokens to see denials
7. Wait a few seconds and check option `8` again to see refill

### Scenario 2: Understand Circuit Breaker

1. Choose option `4` (Test CircuitBreaker)
2. Choose option `1` (successful operation) - see it work
3. Choose option `12` to view stats
4. Choose option `4` again
5. Choose option `2` (failing operation) multiple times
6. Watch the circuit open after failures
7. View stats with option `12` to see state change

### Scenario 3: Explore Caching

1. Choose option `6` (Test CacheManager)
2. Choose `1` to set a value
   - Key: `user:123`
   - Value: `Alice`
   - TTL: `60`
3. Choose option `11` to view cache stats (1 entry)
4. Choose option `6` again, then `2` to get value
   - Key: `user:123`
   - See: `Alice` returned (cache hit!)
5. View stats again - see hit count increase

### Scenario 4: Test Balance Service

1. Choose option `7` (Test BalanceService)
2. Press Enter to use default address
3. Observe the fetch time and results
4. Choose option `7` again immediately
5. Notice faster response time (cache hit!)
6. See cache hit/miss statistics

### Scenario 5: Watch Metrics Grow

1. Choose option `3` (Test MetricsCollector)
2. Choose `1` (counter)
   - Value: `5`
   - Label: `ethereum`
3. Repeat a few times with different labels
4. Choose option `10` to view Prometheus metrics
5. See your counters in standard format

### Scenario 6: See Retry in Action

1. Choose option `5` (Test RetryPolicy)
2. Choose option `2` (succeeds on second try)
3. Watch it fail on attempt 1
4. Watch it succeed on attempt 2
5. See exponential backoff delays

## Tips

- **Start simple**: Try one feature at a time
- **View stats often**: Use stat viewing options to understand state
- **Reset when needed**: Option 13 gives you a clean slate
- **Experiment**: Try edge cases like exhausting tokens or maxing cache
- **Compare**: Test the same feature with different inputs

## Interactive Features

All inputs are customizable:
- Token counts for rate limiter
- Metric values and labels
- Cache keys, values, and TTLs
- Addresses for balance service
- Success/failure scenarios

## Safety

This tool uses:
- Mock adapters (no real blockchain calls)
- In-memory state (nothing persisted)
- Isolated components (won't affect production)

Perfect for learning, experimenting, and understanding how each feature works!

## Troubleshooting

**Tool doesn't start?**
```bash
# Make sure tsx is available
npm install -D tsx

# Or use npx
npx tsx src/poc/manual-test.ts
```

**Inputs not working?**
- Press Enter after each input
- Use Ctrl+C to exit if stuck
- Option 0 to exit cleanly

**Want to see automated version?**
```bash
npx tsx src/poc/demo-poc.ts
```

## What You'll Learn

Using this tool, you'll understand:
- ✅ How token bucket rate limiting works
- ✅ Circuit breaker state transitions
- ✅ Cache hit/miss behavior
- ✅ Retry policies with backoff
- ✅ Health check aggregation
- ✅ Metrics collection patterns
- ✅ Service layer architecture

Have fun exploring! 🚀
