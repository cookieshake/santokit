import { createClient } from '/workspace/packages/client/src/index.ts';

async function main() {
  const baseUrl = process.env.API_URL;
  if (!baseUrl) {
    throw new Error('API_URL required');
  }

  const stk = createClient({ baseUrl });
  const result = await stk.logic.echo.ping({ message: 'hello' });
  console.log(JSON.stringify(result));
}

void main();
