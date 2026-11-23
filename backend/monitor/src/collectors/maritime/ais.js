import { AIS } from '../../config/constants.js';
import { settings } from '../../config/settings.js';
import { item } from '../../observations/item.js';
// 23.11: since 22.11 18:00 aisstream often sends no SubscriptionConfirmation
// within 18 s ("AIS subscription not confirmed", 2–5 samples an hour instead of
// 12). Position reports themselves prove the subscription works; the wait is
// 25 s; a session that got neither is retried once in the same run (≤50 s).
export const AIS_CONFIRM_MS = 25_000;
const AIS_CAP = 300;
function listen(env, box) {
  const [west, south, east, north] = box;
  const socket = new WebSocket(AIS);
  socket.binaryType = 'arraybuffer';
  const s = { accepted: false, compressed: null, opened: null, observed: new Set() };
  return new Promise(resolve => {
    let finished = false;
    function finish(error) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (socket.readyState < 2) socket.close();
      resolve({ ...s, error: error || null });
    }
    const wait = Number(env.AIS_CONFIRM_MS) || AIS_CONFIRM_MS; // override only in tests
    const timer = setTimeout(() => finish(s.accepted ? null : 'AIS subscription not confirmed'), wait);
    socket.addEventListener('open', () => {
      s.opened = Date.now();
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
        s.accepted = true;
        s.compressed =
          message.Message?.SubscriptionConfirmation?.CompressionEnabled ??
          message.Message?.CompressionEnabled ??
          null;
      }
      if (message.MetaData?.MMSI) {
        s.accepted = true; // data flows: the subscription is live
        s.observed.add(String(message.MetaData.MMSI));
      }
      if (s.accepted && s.observed.size >= AIS_CAP) finish();
    });
    socket.addEventListener('error', () => finish(s.accepted ? null : 'AIS connection error'));
    socket.addEventListener('close', () => finish(s.accepted ? null : 'AIS connection closed early'));
  });
}

export async function vessels(env, slot) {
  const box = settings(env).marine;
  const [west, south, east, north] = box;
  const start = Date.now();
  let r = await listen(env, box);
  let retried = false;
  if (r.error && !r.observed.size) {
    retried = true;
    r = await listen(env, box);
  }
  if (r.error && !r.observed.size) throw new Error(r.error);
  return [
    item(slot, {
      url: 'https://aisstream.io/',
      area: [west, south, east, north],
      observed_vessels: r.observed.size,
      connected_at: r.opened,
      ended_at: Date.now(),
      elapsed_ms: Date.now() - start,
      sample_ms: r.opened === null ? null : Date.now() - r.opened,
      compressed: r.compressed,
      sample_capped: r.observed.size >= AIS_CAP,
      resubscribed: retried,
    }),
  ];
}

// Military-registered aircraft in broad overlapping regional boxes.
// Stable ICAO identifiers enable de-duplication; exact positions are not persisted.
