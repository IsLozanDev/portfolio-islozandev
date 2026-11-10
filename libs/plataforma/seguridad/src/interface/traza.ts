/** `traceparent` W3C versión 00: versión, trace-id, parent-id y flags. */
const TRACEPARENT = /^00-([0-9a-f]{32})-[0-9a-f]{16}-[0-9a-f]{2}$/;
const TRACE_ID_INVALIDO = '0'.repeat(32);

/** El trace-id del `traceparent`, o `undefined` si falta o no es válido. Generarlo es del spec 21. */
export function traceIdDeTraceparent(traceparent: string | undefined): string | undefined {
  const traceId = traceparent?.match(TRACEPARENT)?.[1];
  return traceId === TRACE_ID_INVALIDO ? undefined : traceId;
}
