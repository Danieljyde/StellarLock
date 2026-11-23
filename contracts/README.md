# StellarLock Contracts

Two Soroban smart contracts that power StellarLock.

## Contracts

### `token-locker`

Locks SEP-41 tokens with an optional linear vesting schedule.

**Storage layout**
- `Lock(u64)` — lock struct by id
- `NextId` — auto-incrementing id counter (starts at 1000)
- `ByCreator(Address)` — index of lock ids per creator
- `ByBeneficiary(Address)` — index of lock ids per beneficiary
- `ByToken(Address)` — index of lock ids per token

**Key invariants**
- `unlock_at` can only increase, never decrease
- Only the beneficiary can withdraw, only after `unlock_at`
- Only the creator can extend
- Tokens are held by the contract until withdrawal

**Split locks** (`create_split_lock`)
- Lock one token amount, split across 2–10 beneficiaries via basis-point shares (must sum to 10 000)
- Each beneficiary receives an independent `Lock` sub-lock with their proportional amount; integer-division remainder goes to the last beneficiary (see [ADR-010](../docs/adr/ADR-010-split-lock-allocation.md))
- An optional vesting schedule applies uniformly to every sub-lock in the group
- The returned `group_id` is also the lock id of the first sub-lock; use `get_split_group` to enumerate all sub-lock ids
- Storage layout additions: `SplitGroup(u64)` — split group record by group_id; `SplitByCreator(Address)` — index of split group ids per creator

### `lp-locker`

Locks LP pool share tokens from Aquarius or Soroswap with optional linear vesting, matching `token-locker`'s vesting semantics. Carries additional `dex`, `token_a`, `token_b` fields to identify the underlying pool.

**Storage layout**
- `Lock(u64)` — lock struct by id
- `NextId` — auto-incrementing id counter (starts at 5000)
- `ByCreator(Address)` — index of lock ids per creator
- `ByBeneficiary(Address)` — index of lock ids per beneficiary
- `ByPoolShare(Address)` — index of lock ids per pool-share token
- `SplitGroup(u64)` — split group record by group_id
- `SplitByCreator(Address)` — index of split group ids per creator

**Key invariants**
- `unlock_at` can only increase, never decrease
- Only the beneficiary can withdraw, only after `unlock_at`
- Only the creator can extend
- Without a vesting schedule, the full amount is released at `unlock_at`
- With a vesting schedule, each withdrawal releases only the linearly vested
  portion since the last claim; the lock stays open until fully released

**Split locks** (`create_split_lock`)
- Transfer one pool-share token amount, split across 2–10 beneficiaries via basis-point shares (must sum to 10 000)
- Each beneficiary receives an independent `LpLock` sub-lock with their proportional amount; integer-division remainder goes to the last beneficiary (see [ADR-010](../docs/adr/ADR-010-split-lock-allocation.md))
- An optional vesting schedule applies uniformly to every sub-lock in the group
- The returned `group_id` is also the lock id of the first sub-lock; use `get_split_group` to enumerate all sub-lock ids
- TVL is counted once (total amount) and global lock count increments by the number of sub-locks

## Error codes

The two contracts use different numeric codes for the same (and overlapping)
error variants. Always key off the symbolic variant name, not the raw number,
when mapping `Error(Contract, #N)` to a user-facing message — the same number
can mean different things in the two contracts (for example `CanOnlyExtend` is
`#6` in `token-locker` but `#5` in `lp-locker`, while `NotInitialized` is `#16`
versus `#25`). Any future v2 of these contracts should align the numeric codes
so a single table suffices for both.

| Code | `token-locker` | `lp-locker` | Meaning |
|------|----------------|-------------|---------|
| 1 | AmountMustBePositive | AmountMustBePositive | Lock amount must be greater than zero |
| 2 | UnlockMustBeFuture | UnlockMustBeFuture | `unlock_at` must be in the future |
| 3 | AlreadyWithdrawn | AlreadyWithdrawn | The lock has already been fully withdrawn |
| 4 | StillLocked | StillLocked | The unlock date has not been reached yet |
| 5 | NothingToRelease | CanOnlyExtend | token: nothing vested to release yet; lp: new unlock date must increase |
| 6 | CanOnlyExtend | NotAdmin | token: new unlock date must increase; lp: caller is not the admin |
| 7 | VestingEndBeforeStart | NoPendingAdmin | token: vesting end must be after start; lp: no pending admin to accept |
| 8 | TooFewBeneficiaries | NotPendingAdmin | token: split needs at least 2 beneficiaries; lp: caller is not the pending admin |
| 9 | TooManyBeneficiaries | ReentrancyDetected | token: split allows at most 10 beneficiaries; lp: reentrant call blocked |
| 10 | SharesMustSum10000 | AmountOverflow | token: split shares must sum to 10,000 bps; lp: arithmetic overflow |
| 11 | RateLimitExceeded | LockNotFound | token: create-lock cooldown not elapsed; lp: lock id not found |
| 12 | AmountOverflow | TooFewBeneficiaries | token: arithmetic overflow; lp: split needs at least 2 beneficiaries |
| 13 | NoPendingAdmin | TooManyBeneficiaries | token: no pending admin; lp: split allows at most 10 beneficiaries |
| 14 | NotPendingAdmin | SharesMustSum10000 | token: caller is not the pending admin; lp: split shares must sum to 10,000 bps |
| 15 | NotAdmin | VestingEndBeforeStart | token: caller is not the admin; lp: vesting end must be after start |
| 16 | NotInitialized | NothingToRelease | token: contract not initialized yet; lp: nothing vested to release yet |
| 17 | TimelockNotElapsed | RateLimitExceeded | token: upgrade timelock not elapsed; lp: create-lock cooldown not elapsed |
| 18 | NoPendingUpgrade | NoPendingUpgrade | No pending upgrade to execute or cancel |
| 19 | ReentrancyDetected | TimelockNotElapsed | token: reentrant call blocked; lp: upgrade timelock not elapsed |
| 20 | LockNotFound | IdenticalTokens | token: lock id not found; lp: token A and token B must differ |
| 21 | ContractPaused | ContractPaused | The contract is paused by the administrator |
| 22 | ExtensionLimitExceeded | ExtensionLimitExceeded | Maximum number of extensions reached |
| 23 | LockDurationTooShort | LockDurationTooShort | Lock duration below the 24-hour minimum |
| 24 | LockDurationTooLong | LockDurationTooLong | Lock duration above the 10-year maximum |
| 25 | InvalidBeneficiary | NotInitialized | token: beneficiary cannot be the locker contract (#1046); lp: contract not initialized yet |
| 26 | — | InvalidBeneficiary | lp: beneficiary cannot be the locker contract (#1046) |

**Note:** Every `ContractError` variant in both contracts appears above. Codes
`25` and `26` (`InvalidBeneficiary`) were added in #1046 to prevent funds from
being locked to an address the contract can never authorize (`require_auth`
fails for the contract itself).

## Build

```bash
stellar contract build
```

## Test

```bash
cargo test
```

## Deploy

```bash
./deploy.sh <account-alias>
```

## Deployed Addresses (Testnet)

| Contract | Address |
|---|---|
| token-locker | `CBFCKEOQRQIXKLGU4QBUQVOINOKFBOXJ37LXEKLKNUO6TW4FNGDU26AW` |
| lp-locker | `CA3WYETNIF5IAF3VUNQ3SYKZFV45TOFBF7CEZ46I7QEBPWTRM73WLEI4` |
