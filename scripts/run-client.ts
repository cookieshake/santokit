import { createClient } from '../packages/client/src/index.ts';

async function main() {
  console.log('🤖 Initializing Client...');
  
  const stk = createClient({
    baseUrl: 'http://localhost:3000',
    // We can simulate auth token here if needed
    // tokenStorage: ... 
  });

  // Mock a token for authenticated access (since logic/users/get.sql requires 'authenticated')
  // We'll just manually add the header for this raw request test or implement token storage.
  // The server's authenticateRequest decodes JWT without verification.
  const dummyToken = 'header.' + btoa(JSON.stringify({ sub: 'user_123', email: 'me@test.com', roles: ['authenticated'] })) + '.sig';
  
  console.log('📡 Calling stk.logic.users.get({ id: "user_123" })...');
  
  try {
    // Using raw request or proxy if types were generated. 
    // Since we don't have types generated yet, we use the proxy blindly (which works in JS runtime)
    // or use request() explicitly.
    
    // Note: The proxy is `stk.logic.<namespace>.<name>`
    // Logic path: logic/users/get.sql -> namespace: users, name: get
    
    // We need to pass the token. createClient handles it if we set it.
    // await stk.auth.login({} as any); // Fake login won't work with this setup unless we mock auth endpoints too.
    
    // Let's just use request with custom header for MVP
    const result = await stk.request('users/get', { id: 'user_123' }, {
      headers: {
        'Authorization': `Bearer ${dummyToken}`
      }
    });

    console.log('\n✅ Response received:');
    console.log(JSON.stringify(result, null, 2));
    
  } catch (err: any) {
    console.error('❌ Request failed:', err.message);
    if (err.cause) console.error(err.cause);
  }
}

main();
