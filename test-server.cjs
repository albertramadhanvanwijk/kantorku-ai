const http = require('http');
const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end('OK');
});
server.listen(4000, '127.0.0.1', () => {
  console.log('Server listening on 127.0.0.1:4000');
});