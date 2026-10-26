import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import WasherRatesPanel from './WasherRatesPanel';
import CortinaConfigModal from './CortinaConfigModal';
import CheckoutBoundary from './CheckoutBoundary';
import CortinaPayPage from './CortinaPayPage';
import type { LocationService, Machine, WasherSizeRate } from '../interfaces/LocationService';
import type { CortinaVendReference, CortinaVendService } from '../interfaces/CortinaVendService';

const mocks = vi.hoisted(() => ({
  locations: {
    getWasherSizeRates: vi.fn<LocationService['getWasherSizeRates']>(),
    saveWasherSizeRate: vi.fn<LocationService['saveWasherSizeRate']>(),
    saveCortinaConfig: vi.fn<LocationService['saveCortinaConfig']>(),
  },
  vend: {
    hasSession: vi.fn<CortinaVendService['hasSession']>(),
    quote: vi.fn<CortinaVendService['quote']>(),
    payWithWallet: vi.fn<CortinaVendService['payWithWallet']>(),
    createCard: vi.fn<CortinaVendService['createCard']>(),
    status: vi.fn<CortinaVendService['status']>(),
  },
}));
vi.mock('../di/container', () => ({
  useLocations: () => mocks.locations,
  useCortinaVend: () => mocks.vend,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
const rate: WasherSizeRate = { id: 7, location_id: 1, size_label: 'Large', capacity_kg: 12, price_cents: 425, is_active: true, review_required: false };
const machine = {
  id: 1, Name: 'Washer 1', Price: 4, Runtime: 30, Status: 'Idle', Location_ID: 1, Machine_type: 'Washer', Weight_kg: 12,
  cortina_machine_config: { machine_id: 1, public_machine_token: 'fixture', nayax_terminal_id: 'fixture-terminal', nayax_uniqr: null, pulse_line_number: 1, environment: 'sandbox' as const, is_enabled: true, review_required: false },
} satisfies Machine;

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Network prohibited'); }));
  mocks.locations.getWasherSizeRates.mockResolvedValue([rate]);
  mocks.locations.saveWasherSizeRate.mockResolvedValue(undefined);
  mocks.locations.saveCortinaConfig.mockResolvedValue(undefined);
  mocks.vend.hasSession.mockResolvedValue(true);
  mocks.vend.quote.mockResolvedValue({ machineId: 1, machineType: 'washer', machineName: 'Washer 1', washerSizeLabel: null, amountCents: 400, dryer: null });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('saving an existing washer row preserves the unsaved new-row draft across parent refresh', async () => {
  const onChanged = vi.fn();
  const view = render(<WasherRatesPanel locationId={1} onChanged={onChanged} />);
  await screen.findByRole('button', { name: 'Save Large' });
  const draft = within(screen.getByRole('button', { name: 'Add washer rate' }).closest('.rate-row') as HTMLElement);
  fireEvent.change(draft.getByLabelText('Size label'), { target: { value: 'Unsaved small' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save Large' }));
  await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
  view.rerender(<WasherRatesPanel locationId={1} onChanged={() => {}} />);
  expect(draft.getByLabelText('Size label')).toHaveValue('Unsaved small');
  expect(mocks.locations.saveWasherSizeRate).toHaveBeenCalledTimes(1);
});

it('configuration submission does not mutate the caller-owned product map', async () => {
  const product_codes = Object.freeze({ '400': 2 });
  const configured = { ...machine, cortina_machine_config: { ...machine.cortina_machine_config, product_codes, pulse_line_number: null } };
  render(<CortinaConfigModal machine={configured} onClose={() => {}} onSuccess={() => {}} />);
  fireEvent.change(screen.getByLabelText('$4.00 product code'), { target: { value: '5' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save setup' }));
  await waitFor(() => expect(mocks.locations.saveCortinaConfig).toHaveBeenCalledTimes(1));
  expect(product_codes).toEqual({ '400': 2 });
  expect(mocks.locations.saveCortinaConfig).toHaveBeenCalledWith(expect.objectContaining({ product_codes: { '400': 5 } }));
});

function Checkout({ fail = false }: { fail?: boolean }) {
  if (fail) throw new Error('private-render-detail');
  return <CortinaPayPage />;
}
function checkoutTree(fail = false, changedChild = false) {
  return <MemoryRouter initialEntries={['/pay?machine=fixture']}>
    <CheckoutBoundary>{changedChild ? <p>Replacement checkout</p> : <Checkout fail={fail} />}</CheckoutBoundary>
  </MemoryRouter>;
}

it('boundary failure after wallet dispatch suppresses late polling and does not replay payment', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const creation = deferred<CortinaVendReference>();
  mocks.vend.payWithWallet.mockReturnValueOnce(creation.promise);
  const view = render(checkoutTree());
  fireEvent.click(await screen.findByRole('button', { name: 'Use Clean Stream wallet' }));
  await waitFor(() => expect(mocks.vend.payWithWallet).toHaveBeenCalledTimes(1));
  view.rerender(checkoutTree(true));
  expect(screen.getByRole('heading', { name: 'Checkout unavailable' })).toBeInTheDocument();
  await act(async () => creation.resolve({ sessionId: 'fixture-session', accessToken: 'fixture-access' }));
  expect(mocks.vend.status).not.toHaveBeenCalled();
  expect(mocks.vend.payWithWallet).toHaveBeenCalledTimes(1);
  expect(mocks.vend.createCard).not.toHaveBeenCalled();
  expect(document.body).not.toHaveTextContent(/private-render-detail|fixture-access/);
  expect(fetch).not.toHaveBeenCalled();
});

it('a failed boundary stays failed on child replacement without retrying checkout', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const view = render(checkoutTree(true));
  view.rerender(checkoutTree(false, true));
  expect(screen.getByRole('heading', { name: 'Checkout unavailable' })).toBeInTheDocument();
  expect(screen.queryByText('Replacement checkout')).not.toBeInTheDocument();
  expect(mocks.vend.quote).not.toHaveBeenCalled();
});
