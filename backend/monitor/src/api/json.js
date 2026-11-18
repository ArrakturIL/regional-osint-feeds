export function json(body, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

// Public, read-only satellite analytics: no credentials, raw upstream payloads,
// sensitive monitoring feeds or keys are included in the response.
