// Platform globals used by Edge Functions, for the pre-publication TypeScript check.
declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): unknown;
};
declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };
