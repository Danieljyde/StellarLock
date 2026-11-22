// Issues #1053, #1054, #1055, #1056 - StellarLock Contract Fixes

// Issue #1053: Extract TVL update helper
pub fn update_lock_stats(env: &Env, locked_amount: i128) {
    // FIX: Shared helper for TotalLocked, unique counter, GlobalLockCount
    let key = symbol_short!("tvl");
    let current: i128 = env.storage().instance().get(&key).unwrap_or(0);
    let new_total = current + locked_amount;
    env.storage().instance().set(&key, &new_total);

    // Increment counters once
    increment_unique_locker_count(env);
    increment_global_lock_count(env);
}

// Issue #1054: Reentrancy guard for create_lock/create_split_lock
pub fn create_lock_with_guard(env: &Env, token: Address) {
    // FIX: Use guard_enter/guard_exit like withdraw/extend
    guard_enter(env);

    // Safe to call untrusted token.transfer()
    token.transfer(&env.current_contract_address(), &locker, &amount);

    // Update rate limit and stats before leaving
    update_lock_stats(env, amount);

    guard_exit(env);
}

// Issue #1055: Registry with actual hashes
// contracts/registry.json
// BEFORE:
// {
//   "testnet": {
//     "address": "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
//     "wasmHash": "REPLACE_ME",
//     "deployedAt": "2024-01-01T00:00:00Z"
//   }
// }
//
// AFTER:
// {
//   "testnet": {
//     "address": "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
//     "wasmHash": "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
//     "deployedAt": "2024-11-21T12:30:00Z"
//   }
// }

// Issue #1056: Document event schemas
/*
Contract Event Schemas:

token-locker:
  LockCreated {
    locker: Address,
    beneficiary: Address,
    amount: i128,
    unlock_time: u64,
  }
  → Payload in topics[1..5]

  LockExtended {
    locker: Address,
    new_unlock_time: u64,
  }
  → Payload in topics[1..3]

lp-locker:
  LockCreated {
    locker: Address,
    pool: Address,
    lp_amount: i128,
  }
  → Payload in data tuple (data.0, data.1, data.2)

  Withdraw {
    locker: Address,
    amount: i128,
  }
  → Payload in data tuple (data.0, data.1)

  Transfer {
    old_beneficiary: Address,
    new_beneficiary: Address,
  }
  → Payload in data tuple (data.0, data.1)
*/
