import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CortinaVendService, CortinaVendStatus } from "../interfaces/CortinaVendService";
import CortinaPayPage from "./CortinaPayPage";

const service = {
  quote: vi.fn<CortinaVendService["quote"]>(), createCard: vi.fn<CortinaVendService["createCard"]>(),
  payWithWallet: vi.fn<CortinaVendService["payWithWallet"]>(),
  status: vi.fn<CortinaVendService["status"]>(), hasSession: vi.fn<CortinaVendService["hasSession"]>(),
};

vi.mock("../di/container", () => ({ useCortinaVend: () => service }));

describe("CortinaPayPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    service.hasSession.mockResolvedValue(false);
    service.quote.mockResolvedValue({
      machineId: 1, machineName: "Washer 4", machineType: "washer",
      washerSizeLabel: "Large", amountCents: 425, dryer: null,
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("uses the server washer price and leaves cycle selection to the machine", async () => {
    service.quote.mockResolvedValue({
      machineId: 1, machineName: "Washer 4", machineType: "washer",
      washerSizeLabel: "Large", amountCents: 425, dryer: null,
    });
    render(<MemoryRouter initialEntries={["/pay?machine=public-token"]}><CortinaPayPage /></MemoryRouter>);

    expect(await screen.findByText("Washer 4")).toBeInTheDocument();
    expect(screen.getByText("$4.25")).toBeInTheDocument();
    expect(screen.getByText(/Choose temperature and cycle settings/)).toBeInTheDocument();
    expect(service.quote).toHaveBeenCalledWith("public-token", undefined);
  });

  it("rejects an unknown machine quote without offering payment actions", async () => {
    service.hasSession.mockResolvedValue(true);
    service.quote.mockRejectedValue(new Error("Machine not found."));
    render(<MemoryRouter initialEntries={["/pay?machine=unknown-token"]}><CortinaPayPage /></MemoryRouter>);

    expect(await screen.findByRole("heading", { name: "Unable to continue" })).toBeInTheDocument();
    expect(screen.getByText("Machine not found.")).toBeInTheDocument();
    expect(service.quote).toHaveBeenCalledExactlyOnceWith("unknown-token", undefined);
    expect(screen.queryByRole("heading", { name: "Review and pay" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Credit or debit card/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Use Clean Stream wallet" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Contact support" })).toHaveAttribute("href", "/support");
    expect(service.createCard).not.toHaveBeenCalled();
    expect(service.payWithWallet).not.toHaveBeenCalled();
    expect(service.status).not.toHaveBeenCalled();
  });

  it.each(["pointer", "keyboard"])("lets a dryer customer choose all six time products by %s", async (input) => {
    const user = userEvent.setup();
    service.quote.mockResolvedValue({
      machineId: 2, machineName: "Dryer 2", machineType: "dryer",
      washerSizeLabel: null, amountCents: 150,
      dryer: {
        defaultCents: 150,
        options: [
          { minutes: 10, amountCents: 50 },
          { minutes: 20, amountCents: 100 },
          { minutes: 30, amountCents: 150 },
          { minutes: 40, amountCents: 200 },
          { minutes: 60, amountCents: 300 },
          { minutes: 90, amountCents: 450 },
        ],
      },
    });
    render(<MemoryRouter initialEntries={["/pay?machine=public-token"]}><CortinaPayPage /></MemoryRouter>);

    const options = within(await screen.findByRole("group", { name: "Dryer time" }));
    expect(options.getAllByRole("button")).toHaveLength(6);
    expect(screen.getByText("30 minutes")).toBeInTheDocument();
    expect(options.getByRole("button", { pressed: true })).toHaveAccessibleName("30 min$1.50");
    const total = within(screen.getByText("Total").parentElement!);
    const payment = within(screen.getByRole("button", { name: /Credit or debit card/ }));
    expect(total.getByText("$1.50")).toBeInTheDocument();
    expect(payment.getByText("Pay $1.50")).toBeInTheDocument();
    if (input === "keyboard") {
      await user.tab();
      expect(screen.getByRole("link", { name: "Clean Stream Laundry home" })).toHaveFocus();
    }
    for (const [index, [minutes, price]] of ([
      [10, "$0.50"], [20, "$1.00"], [30, "$1.50"],
      [40, "$2.00"], [60, "$3.00"], [90, "$4.50"],
    ] as const).entries()) {
      const option = options.getByRole("button", { name: `${minutes} min${price}`, exact: true });
      if (input === "keyboard") {
        await user.tab();
        expect(option).toHaveFocus();
        await user.keyboard(index % 2 === 0 ? "{Enter}" : " ");
      } else {
        await user.click(option);
      }
      expect(screen.getByText(`${minutes} minutes`)).toBeInTheDocument();
      expect(screen.getByText(`${minutes} minute dry`)).toBeInTheDocument();
      expect(total.getByText(price)).toBeInTheDocument();
      expect(payment.getByText(`Pay ${price}`)).toBeInTheDocument();
      expect(options.getByRole("button", { pressed: true })).toBe(option);
      expect(options.getAllByRole("button", { pressed: false })).toHaveLength(5);
    }
    expect(service.createCard).not.toHaveBeenCalled();
    expect(service.payWithWallet).not.toHaveBeenCalled();
    expect(service.status).not.toHaveBeenCalled();
  });

  it("resumes a paid browser session without exposing machine identifiers", async () => {
    service.status.mockResolvedValue({ status: "started" });
    render(<MemoryRouter initialEntries={["/pay?session=session-1&access=secret-1"]}><CortinaPayPage /></MemoryRouter>);

    await waitFor(() => expect(screen.getByText("Machine started")).toBeInTheDocument());
    expect(screen.getByText("Select your wash cycle on the machine.")).toBeInTheDocument();
    expect(service.status).toHaveBeenCalledWith({ sessionId: "session-1", accessToken: "secret-1" });
    expect(service.quote).not.toHaveBeenCalled();
  });

  it("polls an authenticated wallet vend until the machine starts", async () => {
    service.hasSession.mockResolvedValue(true);
    service.quote.mockResolvedValue({
      machineId: 2, machineName: "Dryer 2", machineType: "dryer",
      washerSizeLabel: null, amountCents: 150,
      dryer: {
        defaultCents: 150,
        options: [
          { minutes: 10, amountCents: 50 },
          { minutes: 20, amountCents: 100 },
          { minutes: 30, amountCents: 150 },
          { minutes: 40, amountCents: 200 },
          { minutes: 60, amountCents: 300 },
          { minutes: 90, amountCents: 450 },
        ],
      },
    });
    service.payWithWallet.mockResolvedValue({ sessionId: "wallet-1", accessToken: "wallet-secret" });
    service.status.mockResolvedValue({ status: "started", dryer_minutes: 30 });
    render(<MemoryRouter initialEntries={["/pay?machine=public-token"]}><CortinaPayPage /></MemoryRouter>);

    fireEvent.click(await screen.findByRole("button", { name: "Use Clean Stream wallet" }));

    await waitFor(() => expect(screen.getByText("Your purchased time has been added.")).toBeInTheDocument());
    expect(service.status).toHaveBeenCalledWith({ sessionId: "wallet-1", accessToken: "wallet-secret" });
  });

  it("shows the refund action instead of the raw Nayax decline", async () => {
    service.status.mockResolvedValue({ status: "refunded", failure_message: "Nayax Start declined with HTTP 200" });
    render(<MemoryRouter initialEntries={["/pay?session=session-1&access=secret-1"]}><CortinaPayPage /></MemoryRouter>);

    expect(await screen.findByRole("heading", { name: "Refund initiated" })).toBeInTheDocument();
    expect(screen.queryByText(/Nayax Start declined/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });

  it("does not claim a refund when support is required", async () => {
    service.status.mockResolvedValue({ status: "support_required", failure_message: "Please contact support." });
    render(<MemoryRouter initialEntries={["/pay?session=session-1&access=secret-1"]}><CortinaPayPage /></MemoryRouter>);

    expect(await screen.findByText(/Please contact support before making another payment/)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Refund initiated" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });

  function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((done) => { resolve = done; });
    return { promise, resolve };
  }

  const renderReturn = () => render(
    <MemoryRouter initialEntries={["/pay?session=session-1&access=secret-1"]}><CortinaPayPage /></MemoryRouter>,
  );
  const advance = async (milliseconds = 0) => {
    await act(async () => { await vi.advanceTimersByTimeAsync(milliseconds); });
  };
  const expectUncertain = () => {
    expect(screen.getByRole("heading", { name: "Confirmation unavailable" })).toBeInTheDocument();
    expect(screen.queryByText(/Payment received|Machine started|Refund initiated|Unable to continue/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Contact support" })).toHaveAttribute("href", "/support");
  };

  it.each([
    "session=session-1", "access=secret-1", "session=", "access=",
    "session=session-1&access=", "session=&access=secret-1",
  ])("never offers a fresh payment for incomplete return %s", async (reference) => {
    render(<MemoryRouter initialEntries={[`/pay?machine=public-token&${reference}`]}><CortinaPayPage /></MemoryRouter>);
    await screen.findByRole("heading", { name: "Confirmation unavailable" });
    expectUncertain();
    expect(screen.queryByRole("heading", { name: "Review and pay" })).not.toBeInTheDocument();
    expect(service.hasSession).not.toHaveBeenCalled();
    expect(service.quote).not.toHaveBeenCalled();
    expect(service.status).not.toHaveBeenCalled();
    expect(service.createCard).not.toHaveBeenCalled();
    expect(service.payWithWallet).not.toHaveBeenCalled();
  });

  it("discards a late result when navigation changes to an incomplete return", async () => {
    vi.useFakeTimers();
    const result = deferred<CortinaVendStatus>();
    service.status.mockReturnValue(result.promise);
    render(<MemoryRouter initialEntries={["/pay?session=old&access=old-token"]}>
      <Link to="/pay?uniqr=public-qr&session=old">Incomplete return</Link><CortinaPayPage />
    </MemoryRouter>);
    await advance();
    fireEvent.click(screen.getByText("Incomplete return"));
    await advance();
    expectUncertain();
    await act(async () => { result.resolve({ status: "started" }); });
    await advance(180000);
    expectUncertain();
    expect(service.status).toHaveBeenCalledTimes(1);
    expect(service.quote).not.toHaveBeenCalled();
    expect(service.createCard).not.toHaveBeenCalled();
    expect(service.payWithWallet).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["unknown", "failed", "timed_out", "voided"])("keeps %s outcomes uncertain without a retry or refund claim", async (status) => {
    service.status.mockResolvedValue({ status, failure_message: "Your payment will be returned. Try again." });
    renderReturn();
    await screen.findByRole("heading", { name: "Confirmation unavailable" });
    expectUncertain();
    expect(screen.queryByText(/Your payment will be returned/)).not.toBeInTheDocument();
    expect(service.status).toHaveBeenCalledTimes(1);
    expect(service.createCard).not.toHaveBeenCalled();
    expect(service.payWithWallet).not.toHaveBeenCalled();
  });

  it("stops on network uncertainty without another status request or automatic charge", async () => {
    vi.useFakeTimers();
    service.status.mockRejectedValue(new Error("Connection lost"));
    renderReturn();
    await advance();
    expectUncertain();
    await advance(180000);
    expect(service.status).toHaveBeenCalledTimes(1);
    expect(service.createCard).not.toHaveBeenCalled();
    expect(service.payWithWallet).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("times out a hung request and ignores its late successful response", async () => {
    vi.useFakeTimers();
    const result = deferred<CortinaVendStatus>();
    service.status.mockReturnValue(result.promise);
    renderReturn();
    await advance();
    expect(screen.getByRole("heading", { name: "Checking your payment" })).toBeInTheDocument();
    expect(screen.queryByText("Payment received")).not.toBeInTheDocument();
    await advance(10000);
    expectUncertain();
    await act(async () => { result.resolve({ status: "started" }); });
    await advance(180000);
    expectUncertain();
    expect(service.status).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("serializes checks and stops at the absolute two-minute deadline", async () => {
    vi.useFakeTimers();
    const result = deferred<CortinaVendStatus>();
    service.status.mockReturnValueOnce(result.promise).mockResolvedValue({ status: "paid" });
    renderReturn();
    await advance(9000);
    expect(service.status).toHaveBeenCalledTimes(1);
    await act(async () => { result.resolve({ status: "paid" }); });
    await advance(1499);
    expect(service.status).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(service.status).toHaveBeenCalledTimes(2);
    await advance(109500);
    expectUncertain();
    const requests = service.status.mock.calls.length;
    await advance(180000);
    expect(service.status).toHaveBeenCalledTimes(requests);
    expect(service.createCard).not.toHaveBeenCalled();
    expect(service.payWithWallet).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels the delay on unmount without another request", async () => {
    vi.useFakeTimers();
    service.status.mockResolvedValue({ status: "starting" });
    const { unmount } = renderReturn();
    await advance();
    unmount();
    await advance(180000);
    expect(service.status).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("ignores a status response arriving after unmount", async () => {
    vi.useFakeTimers();
    const result = deferred<CortinaVendStatus>();
    service.status.mockReturnValue(result.promise);
    const { unmount } = renderReturn();
    await advance();
    unmount();
    await act(async () => { result.resolve({ status: "paid" }); });
    await advance(180000);
    expect(service.status).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("ignores the old session response after the target changes", async () => {
    vi.useFakeTimers();
    const oldResult = deferred<CortinaVendStatus>();
    service.status.mockReturnValueOnce(oldResult.promise).mockResolvedValue({ status: "unknown" });
    render(<MemoryRouter initialEntries={["/pay?session=old&access=old-token"]}>
      <Link to="/pay?session=new&access=new-token">New target</Link><CortinaPayPage />
    </MemoryRouter>);
    await advance();
    fireEvent.click(screen.getByText("New target"));
    await advance();
    expectUncertain();
    await act(async () => { oldResult.resolve({ status: "started" }); });
    await advance(180000);
    expectUncertain();
    expect(service.status.mock.calls).toEqual([
      [{ sessionId: "old", accessToken: "old-token" }],
      [{ sessionId: "new", accessToken: "new-token" }],
    ]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not start wallet status checks after a late creation response on unmount", async () => {
    service.hasSession.mockResolvedValue(true);
    const result = deferred<Awaited<ReturnType<CortinaVendService["payWithWallet"]>>>();
    service.payWithWallet.mockReturnValue(result.promise);
    const { unmount } = render(<MemoryRouter initialEntries={["/pay?machine=public-token"]}><CortinaPayPage /></MemoryRouter>);
    const button = await screen.findByRole("button", { name: "Use Clean Stream wallet" });
    vi.useFakeTimers();
    fireEvent.click(button);
    await advance();
    unmount();
    await act(async () => { result.resolve({ sessionId: "late", accessToken: "late-token" }); });
    await advance(180000);
    expect(service.status).not.toHaveBeenCalled();
    expect(service.payWithWallet).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["card", "wallet"])("guards duplicate %s clicks and preserves uncertain creation", async (method) => {
    service.hasSession.mockResolvedValue(true);
    service.createCard.mockRejectedValue(new Error("Network error"));
    service.payWithWallet.mockRejectedValue(new Error("Network error"));
    render(<MemoryRouter initialEntries={["/pay?machine=public-token"]}><CortinaPayPage /></MemoryRouter>);
    const button = await screen.findByRole("button", { name: method === "wallet" ? "Use Clean Stream wallet" : /Credit or debit card/ });
    vi.useFakeTimers();
    act(() => { button.click(); button.click(); });
    await advance();
    expectUncertain();
    await advance(180000);
    const request = method === "wallet" ? service.payWithWallet : service.createCard;
    expect(request).toHaveBeenCalledExactlyOnceWith("public-token", undefined, 425, expect.any(String));
    expect(service.status).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
