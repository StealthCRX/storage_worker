import { Context, Next } from 'hono';

type Env = {
  Bindings: {
    ALLOWED_ORIGIN: string;
  };
};

export async function corsMiddleware(c: Context<Env>, next: Next) {
  const origin = c.req.header('Origin') || '';
  const allowed = c.env.ALLOWED_ORIGIN;

  // Allow the configured origin and localhost for dev
  const isAllowed = origin === allowed || origin.startsWith('http://localhost');

  if (c.req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': isAllowed ? origin : '',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  await next();

  if (isAllowed) {
    c.header('Access-Control-Allow-Origin', origin);
    c.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
}
