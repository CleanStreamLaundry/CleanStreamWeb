// Local static check only. The deployed entrypoint runs on Supabase's Deno runtime.
declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};
