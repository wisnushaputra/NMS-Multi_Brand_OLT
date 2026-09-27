/**
 * Server-Sent Events (SSE) Event Bus for real-time live push to clients
 */
const clients = new Set();

export function addClient(res) {
  clients.add(res);
  res.on('close', () => {
    clients.delete(res);
  });
}

export function broadcastEvent(eventType, data) {
  const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) {
    try {
      client.write(payload);
    } catch (e) {
      clients.delete(client);
    }
  }
}

export function getConnectedClientsCount() {
  return clients.size;
}
