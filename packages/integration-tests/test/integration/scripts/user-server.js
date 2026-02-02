const http = require('node:http');

const port = 8081;
const server = http.createServer((req, res) => {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/plain');
  res.end('ok');
});

server.listen(port, '0.0.0.0', () => {
  console.log(`User dev server listening on ${port}`);
});
