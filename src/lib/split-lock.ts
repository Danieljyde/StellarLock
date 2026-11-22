import { Address, nativeToScVal, xdr } from "@stellar/stellar-sdk"
import { CONTRACTS, submitCallWithHash } from "@/lib/stellar"
import { getOnChainTokenMeta } from "@/lib/token-metadata"

export interface SplitBeneficiary {
  address: string
  /** Basis points 0–10 000. All entries must sum to exactly 10 000. */
  shareBps: number
}

export interface CreateSplitLockArgs {
  tokenAddress: string
  totalAmount: number
  beneficiaries: SplitBeneficiary[]
  unlockAt: number // unix seconds
  vesting?: { start: number; end: number }
}

function addressArg(addr: string): xdr.ScVal {
  return new Address(addr).toScVal()
}

export async function createSplitLock(
  args: CreateSplitLockArgs,
  sourceAddress: string,
  signTransaction: (xdr: string) => Promise<{ signedTxXdr: string }>,
): Promise<{ txHash: string }> {
  // Issue #1058: scale by the token's real decimals instead of the hardcoded
  // 7 (STELLAR_DECIMALS), mirroring createTokenLock / createLpLock.
  const { decimals } = await getOnChainTokenMeta(args.tokenAddress)
  const amountStroops = BigInt(Math.round(args.totalAmount * 10 ** decimals))
  const unlockAtBig = BigInt(Math.floor(args.unlockAt))

  // Vec<(Address, u64)> — each element is a two-element vec [address, share_bps]
  const beneficiariesVal = xdr.ScVal.scvVec(
    args.beneficiaries.map((b) =>
      xdr.ScVal.scvVec([addressArg(b.address), nativeToScVal(BigInt(b.shareBps), { type: "u64" })]),
    ),
  )

  const scArgs: xdr.ScVal[] = [
    addressArg(sourceAddress),
    addressArg(args.tokenAddress),
    nativeToScVal(amountStroops, { type: "i128" }),
    beneficiariesVal,
    nativeToScVal(unlockAtBig, { type: "u64" }),
  ]

  if (args.vesting) {
    scArgs.push(
      xdr.ScVal.scvMap([
        new xdr.ScMapEntry({
          key: xdr.ScVal.scvSymbol("end"),
          val: nativeToScVal(BigInt(Math.floor(args.vesting.end)), { type: "u64" }),
        }),
        new xdr.ScMapEntry({
          key: xdr.ScVal.scvSymbol("released"),
          val: nativeToScVal(BigInt(0), { type: "i128" }),
        }),
        new xdr.ScMapEntry({
          key: xdr.ScVal.scvSymbol("start"),
          val: nativeToScVal(BigInt(Math.floor(args.vesting.start)), { type: "u64" }),
        }),
      ]),
    )
  } else {
    scArgs.push(xdr.ScVal.scvVoid())
  }

  const { txHash } = await submitCallWithHash<void>(
    CONTRACTS.tokenLocker,
    "create_split_lock",
    scArgs,
    sourceAddress,
    signTransaction,
  )
  return { txHash }
}
