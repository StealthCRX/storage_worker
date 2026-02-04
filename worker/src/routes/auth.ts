import { Hono } from 'hono';
import { signJwt } from '../lib/jwt';

type Env = {
  Bindings: {
    ACCESS_CODE: string;
    JWT_SECRET: string;
  };
};

const auth = new Hono<Env>();

auth.post('/verify', async (c) => {
  const body = await c.req.json<{ code: string; name: string }>();

  if (!body.code || !body.name) {
    return c.json({ error: 'Code and name are required' }, 400);
  }

  if (body.code !== c.env.ACCESS_CODE) {
    return c.json({ error: 'Invalid access code' }, 403);
  }

  const now = Math.floor(Date.now() / 1000);
  const token = await signJwt(
    { sub: body.name.trim(), iat: now, exp: now + 86400 },
    c.env.JWT_SECRET,
  );

  return c.json({ token });
});

export default auth;
