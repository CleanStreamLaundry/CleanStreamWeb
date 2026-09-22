import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CortinaPayPage from "./CortinaPayPage";

const service = {
  quote: vi.fn(), createCard: vi.fn(), payWithWallet: vi.fn(),
  status: vi.fn(), hasSession: vi.fn(),
};

vi.mock("../di/container", () => ({ useCortinaVend: () => service }));

describe("CortinaPayPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    service.hasSession.mockResolvedValue(false);
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

  it("lets a dryer customer choose one of six time products", async () => {
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

    const fortyMinutes = await screen.findByRole("button", { name: /40 min.*\$2\.00/ });
    expect(screen.getByText("30 minutes")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { pressed: false })).toHaveLength(5);
    fireEvent.click(fortyMinutes);
    expect(screen.getByText("40 minutes")).toBeInTheDocument();
    expect(fortyMinutes).toHaveAttribute("aria-pressed", "true");
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

    expect(await screen.findByText("Please contact support.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Refund initiated" })).not.toBeInTheDocument();
  });
});
