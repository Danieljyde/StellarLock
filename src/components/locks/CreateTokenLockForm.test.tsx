import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { MemoryRouter, type NavigateFunction } from "react-router-dom"
import "@/i18n"
import { CreateTokenLockForm } from "@/components/locks/CreateTokenLockForm"
import { addTransaction } from "@/lib/transaction-history"

const mockSignTransaction = vi.fn()
const VALID_TOKEN = "CBFCKEOQRQIXKLGU4QBUQVOINOKFBOXJ37LXEKLKNUO6TW4FNGDU26AW"

vi.mock("@/hooks/useWallet", () => ({
  useWallet: () => ({
    // Must be a checksum-valid Stellar address — it's used as the fallback
    // beneficiary when the form's beneficiary field is left blank, and form
    // validation rejects an invalid one, which silently keeps submit disabled.
    address: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
    signTransaction: mockSignTransaction,
  }),
}))

// CreateTokenLockForm sources its balance from useTokenBalanceSWR, not
// useTokenBalance from @/hooks/useLocks. Configurable per test so the
// balance/decimals scaling can be exercised (#1059).
const mockUseTokenBalanceSWR = vi.fn()
vi.mock("@/hooks/useTokenBalanceSWR", () => ({
  useTokenBalanceSWR: (...args: unknown[]) => mockUseTokenBalanceSWR(...args),
}))

vi.mock("@/lib/token-locker", () => ({
  createTokenLock: vi.fn().mockResolvedValue({ id: "42", txHash: "deadbeef" }),
}))

const addTransactionMock = vi.fn<typeof addTransaction>()
vi.mock("@/lib/transaction-history", () => ({
  addTransaction: (...args: Parameters<typeof addTransaction>) => addTransactionMock(...args),
}))

const navigateMock = vi.fn<NavigateFunction>()
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom")
  return { ...actual, useNavigate: () => navigateMock }
})

describe("CreateTokenLockForm", () => {
  beforeEach(() => {
    addTransactionMock.mockClear()
    navigateMock.mockClear()
    mockUseTokenBalanceSWR.mockReturnValue({
      balance: null,
      decimals: null,
      isLoading: false,
      isRevalidating: false,
      refetch: vi.fn(),
      clear: vi.fn(),
    })
  })

  it("records a transaction on successful lock creation", async () => {
    render(
      <MemoryRouter>
        <CreateTokenLockForm />
      </MemoryRouter>,
    )

    fireEvent.change(screen.getByLabelText(/token contract address/i), {
      target: { value: "CBFCKEOQRQIXKLGU4QBUQVOINOKFBOXJ37LXEKLKNUO6TW4FNGDU26AW" },
    })
    fireEvent.change(screen.getByLabelText(/amount to lock/i), { target: { value: "100" } })

    const minDate = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10)
    fireEvent.change(screen.getByLabelText(/^unlock date$/i), { target: { value: minDate } })

    fireEvent.click(screen.getByRole("button", { name: /lock tokens/i }))

    const confirmButton = await screen.findByRole("button", { name: /confirm & lock/i })
    fireEvent.click(confirmButton)

    await waitFor(() => {
      expect(addTransactionMock).toHaveBeenCalledTimes(1)
    })

    expect(addTransactionMock).toHaveBeenCalledWith("deadbeef", "create_lock", {
      lockId: "42",
      amount: "100",
    })
    expect(navigateMock).toHaveBeenCalledWith(
      "/app/lock-created",
      // vitest types `expect.objectContaining`'s return as `any`, so this nested
      // matcher can't be assigned without tripping no-unsafe-assignment.
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      expect.objectContaining({ state: expect.objectContaining({ lockId: "42", txHash: "deadbeef" }) }),
    )
  })

  it("displays the balance scaled by 6 decimals (#1059)", async () => {
    mockUseTokenBalanceSWR.mockReturnValue({
      balance: 1_500_000n,
      decimals: 6,
      isLoading: false,
      isRevalidating: false,
      refetch: vi.fn(),
      clear: vi.fn(),
    })
    render(
      <MemoryRouter>
        <CreateTokenLockForm />
      </MemoryRouter>,
    )
    fireEvent.change(screen.getByLabelText(/token contract address/i), { target: { value: VALID_TOKEN } })

    // 1.5 tokens at 6 decimals; the old /1e7 would have shown 0.15.
    expect(await screen.findByText("Balance: 1.5")).toBeInTheDocument()
  })

  it("displays the balance scaled by 7 decimals (#1059)", async () => {
    mockUseTokenBalanceSWR.mockReturnValue({
      balance: 125_000_000n,
      decimals: 7,
      isLoading: false,
      isRevalidating: false,
      refetch: vi.fn(),
      clear: vi.fn(),
    })
    render(
      <MemoryRouter>
        <CreateTokenLockForm />
      </MemoryRouter>,
    )
    fireEvent.change(screen.getByLabelText(/token contract address/i), { target: { value: VALID_TOKEN } })

    expect(await screen.findByText("Balance: 12.5")).toBeInTheDocument()
  })

  it("displays the balance scaled by 18 decimals (#1059)", async () => {
    mockUseTokenBalanceSWR.mockReturnValue({
      balance: 2_500_000_000_000_000_000n,
      decimals: 18,
      isLoading: false,
      isRevalidating: false,
      refetch: vi.fn(),
      clear: vi.fn(),
    })
    render(
      <MemoryRouter>
        <CreateTokenLockForm />
      </MemoryRouter>,
    )
    fireEvent.change(screen.getByLabelText(/token contract address/i), { target: { value: VALID_TOKEN } })

    // 2.5 tokens at 18 decimals; the old /1e7 would have shown 250,000,000,000.
    expect(await screen.findByText("Balance: 2.5")).toBeInTheDocument()
  })
})
