async function main() {
  const apiUrl = process.env.API_URL;
  if (!apiUrl) throw new Error('API_URL required');

  const payload = { path: 'echo/ping', params: { message: 'hello' } };
  const res = await fetch(`${apiUrl}/call`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Request failed: ${res.status} ${text}`);
  }

  const json = await res.json();
  console.log(JSON.stringify(json));
}

void main();
