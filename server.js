const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { WebSocketServer } = require('ws');

const PORT = parseInt(process.env.PORT || '3000', 10);
const PUBLIC_DIR = path.join(__dirname, 'public');

const mime = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/config') {
    const ifaces = os.networkInterfaces();
    const localIps = [];
    for (const name of Object.keys(ifaces)) {
      for (const iface of ifaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) localIps.push(iface.address);
      }
    }
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      stunUrl: process.env.STUN_URL || null,
      port: PORT,
      localIps,
    }));
    return;
  }

  let file = req.url === '/' ? '/index.html' : req.url;
  file = path.join(PUBLIC_DIR, path.normalize(file));
  if (!file.startsWith(PUBLIC_DIR)) {
    res.statusCode = 403;
    res.end();
    return;
  }

  const ext = path.extname(file);
  const contentType = mime[ext] || 'application/octet-stream';

  fs.readFile(file, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.statusCode = 404;
        res.end('Not found');
        return;
      }
      res.statusCode = 500;
      res.end('Server error');
      return;
    }
    res.setHeader('Content-Type', contentType);
    res.end(data);
  });
});

const wss = new WebSocketServer({ server });

let sender = null;
let receiver = null;
let pendingOffer = null;
const pendingIceFromSender = [];

function forward(from, to, message) {
  if (to && to.readyState === 1) {
    to.send(message);
  }
}

wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    const { type } = msg;

    if (type === 'role') {
      if (msg.role === 'sender') {
        // Solo un emisor a la vez: rechazar si ya hay uno conectado (no cerrar al actual)
        if (sender && sender.readyState === 1) {
          console.log('[server] Rejecting second sender');
          ws.send(JSON.stringify({ type: 'sender_rejected', reason: 'already_connected' }));
          return;
        }
        sender = ws;
        console.log('[server] Sender registered');
        // Si ya hay un receptor conectado, pedir oferta para reconexión (p. ej. tras recargar el receiver)
        if (receiver && receiver.readyState === 1) {
          console.log('[server] Receiver already connected, sending receiver_ready to sender');
          sender.send(JSON.stringify({ type: 'receiver_ready' }));
        }
      } else if (msg.role === 'receiver') {
        // Solo un receptor a la vez: rechazar si ya hay uno conectado
        if (receiver && receiver.readyState === 1) {
          console.log('[server] Rejecting second receiver');
          ws.send(JSON.stringify({ type: 'receiver_rejected', reason: 'already_connected' }));
          return;
        }
        receiver = ws;
        console.log('[server] Receiver registered');
        const hadPendingOffer = pendingOffer && receiver && receiver.readyState === 1;
        if (hadPendingOffer) {
          receiver.send(pendingOffer);
          pendingIceFromSender.forEach((m) => receiver.send(m));
          pendingOffer = null;
          pendingIceFromSender.length = 0;
        }
        if (!hadPendingOffer && sender && sender.readyState === 1) {
          console.log('[server] Sender already connected, sending receiver_ready to sender');
          sender.send(JSON.stringify({ type: 'receiver_ready' }));
        }
      }
      return;
    }

    if (type === 'offer') {
      const offerPayload = typeof raw === 'string' ? raw : raw.toString();
      if (receiver && receiver.readyState === 1) {
        console.log('[server] Forwarding offer to receiver');
        receiver.send(offerPayload);
      } else {
        pendingOffer = offerPayload;
        pendingIceFromSender.length = 0;
      }
      return;
    }

    if (type === 'ice' && ws === sender) {
      const icePayload = typeof raw === 'string' ? raw : raw.toString();
      if (receiver && receiver.readyState === 1) {
        receiver.send(icePayload);
      } else {
        pendingIceFromSender.push(icePayload);
      }
      return;
    }

    if (type === 'request_offer') {
      if (ws === receiver && sender && sender.readyState === 1) {
        console.log('[server] Receiver requested offer, sending receiver_ready to sender');
        sender.send(JSON.stringify({ type: 'receiver_ready' }));
      }
    }

    if (type === 'answer' || type === 'ice') {
      if (ws === receiver && sender && sender.readyState === 1) {
        const payload = typeof raw === 'string' ? raw : raw.toString();
        sender.send(payload);
      }
    }
  });

  ws.on('close', () => {
    if (ws === sender) {
      console.log('[server] Sender disconnected');
      sender = null;
      pendingOffer = null;
      pendingIceFromSender.length = 0;
    }
    if (ws === receiver) {
      console.log('[server] Receiver disconnected');
      receiver = null;
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Screen Mirror VR running at http://localhost:${PORT}`);
  console.log('On mobile (same network), open: http://<this-PC-IP>:' + PORT);
});
