import { describe, it, expect, vi, beforeEach, type MockInstance } from 'vitest';
import { SupabaseClient } from '@supabase/supabase-js';
import { EdgeFunctionRepository } from './EdgeFunctionRepository';

describe('EdgeFunctionRepository', () => {
    let mockClient: SupabaseClient;
    let repo: EdgeFunctionRepository;
    let mockInvoke: MockInstance<SupabaseClient['functions']['invoke']>;

    beforeEach(() => {
        mockClient = new SupabaseClient('https://example.invalid', 'test-key', {
            accessToken: async () => 'test-token',
            global: { fetch: vi.fn<typeof fetch>().mockRejectedValue(new Error('Unexpected fetch')) },
        });
        const functions = mockClient.functions;
        mockInvoke = vi.spyOn(functions, 'invoke');
        vi.spyOn(mockClient, 'functions', 'get').mockReturnValue(functions);

        repo = new EdgeFunctionRepository(mockClient);
    });

    it('should call the Supabase function and return data', async () => {
        const mockData = { success: true };
        mockInvoke.mockResolvedValue({ data: mockData, error: null });

        const result = await repo.callFunction('test-function', { foo: 'bar' });

        expect(mockInvoke).toHaveBeenCalledWith('test-function', {
            body: { foo: 'bar' },
        });
        expect(result).toEqual(mockData);
    });

    it('should omit the body when params are absent or undefined', async () => {
        mockInvoke.mockResolvedValue({ data: { success: true }, error: null });

        await repo.callFunction('no-body-function');
        await repo.callFunction('no-body-function', undefined);

        expect(mockInvoke.mock.calls).toStrictEqual([
            ['no-body-function', {}],
            ['no-body-function', {}],
        ]);
    });

    it('should preserve an explicitly empty body', async () => {
        mockInvoke.mockResolvedValue({ data: { success: true }, error: null });

        await repo.callFunction('empty-body-function', {});

        expect(mockInvoke).toHaveBeenCalledWith('empty-body-function', { body: {} });
    });

    it('should throw if response.data is missing', async () => {
        mockInvoke.mockResolvedValue({ data: undefined, error: null });

        await expect(repo.callFunction('empty-function')).rejects.toThrow(
            'empty-function returned no data'
        );
    });

    it('should throw if Supabase returns a function error', async () => {
        const mockError = new Error('Function returned 500');
        mockInvoke.mockResolvedValue({ data: null, error: mockError });

        await expect(repo.callFunction('failing-function')).rejects.toBe(mockError);
    });

    it('should propagate errors thrown by the invocation', async () => {
        const mockError = new Error('Function failed');
        mockInvoke.mockRejectedValue(mockError);

        await expect(repo.callFunction('failing-function')).rejects.toBe(mockError);
    });
});
