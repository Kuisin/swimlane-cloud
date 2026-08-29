import { NextResponse } from "next/server";

/** Typed HTTP error that route handlers may throw; mapped to a JSON response. */
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

type Handler = (req: Request, ctx: any) => Promise<Response> | Response;

/**
 * Wraps a route handler so thrown ApiError (and unexpected errors) become JSON
 * responses with the right status. Keeps handlers free of try/catch boilerplate.
 */
export function withApi(handler: Handler): Handler {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      if (err instanceof ApiError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      const message = err instanceof Error ? err.message : "Internal error";
      // Surface config errors (missing env) as 500 with a useful message.
      return NextResponse.json({ error: message }, { status: 500 });
    }
  };
}

/** Convenience JSON success response. */
export function json<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

/** Parse the JSON body, throwing a 400 ApiError on malformed input. */
export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new ApiError(400, "Invalid JSON body");
  }
}
