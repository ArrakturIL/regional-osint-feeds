import { AIS } from '../../config/constants.js';
import { settings } from '../../config/settings.js';
import { item } from '../../observations/item.js';
export async function vessels(env, slot) {
  const [west, south, east, north] = settings(env).marine;
  const start = Date.now();
  const socket = new WebSocket(AIS);
  socket.binaryType = 'arraybuffer';
  let accepted = false;
  let compressed = null;
  let opened = null;
  let finished = false;
  const observed = new Set();
  await new Promise((resolve, reject) => {
    function finish(error) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (socket.readyState < 2) socket.close();
      if (error) reject(new Error(error));
      else resolve();
    }
    const timer = setTimeout(() => finish(accepted ? null : 'AIS subscription not confirmed'), 18_000);
    socket.addEventListener('open', () => {
      opened = Date.now();
      socket.send(
        JSON.stringify({
          APIKey: env.AIS_KEY,
          BoundingBoxes: [
            [
              [south, west],
              [north, east],
            ],
          ],
          FilterMessageTypes: [
            'PositionReport',
            'StandardClassBPositionReport',
            'ExtendedClassBPositionReport',
          ],
        }),
      );
    });
    socket.addEventListener('message', event => {
      let message;
      try {
        message = JSON.parse(
          typeof event.data === 'string' ? event.data : new TextDecoder().decode(event.data),
        );
      } catch {
        return;
      }
      if (message.MessageType === 'SubscriptionConfirmation') {
        accepted = true;
        compressed =
          message.Message?.SubscriptionConfirmation?.CompressionEnabled ??
          message.Message?.CompressionEnabled ??
          null;
      }
      if (message.MetaData?.MMSI) observed.add(String(message.MetaData.MMSI));
      if (accepted && observed.size >= 300) finish();
    });
    socket.addEventListener('error', () => finish('AIS connection error'));
    socket.addEventListener('close', () => finish('AIS connection closed early'));
  });
  return [
    item(slot, {
      url: 'https://aisstream.io/',
      area: [west, south, east, north],
      observed_vessels: observed.size,
      connected_at: opened,
      ended_at: Date.now(),
      elapsed_ms: Date.now() - start,
      sample_ms: opened === null ? null : Date.now() - opened,
      compressed,
      sample_capped: observed.size >= 300,
    }),
  ];
}

// Military-registered aircraft in broad overlapping regional boxes.
// Stable ICAO identifiers enable de-duplication; exact positions are not persisted.
