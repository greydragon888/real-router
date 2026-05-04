import { Readable } from "node:stream";

import type express from "express";

function toFetchHeaders(nodeHeaders: express.Request["headers"]): Headers {
  const headers = new Headers();

  for (const [key, value] of Object.entries(nodeHeaders)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(key, item);
      }
    } else if (value !== undefined) {
      headers.set(key, value);
    }
  }

  return headers;
}

export function expressToFetchRequest(
  request: express.Request,
  signal?: AbortSignal,
): Request {
  const url = `http://${request.headers.host}${request.originalUrl}`;
  const init: RequestInit & { duplex?: "half" } = {
    method: request.method,
    headers: toFetchHeaders(request.headers),
    // Wire the per-request AbortSignal into the Web Request so the
    // RSC handler (and any loaders that read it via getDep) can
    // observe disconnects. Without this, mid-stream cancellation
    // on `req.on("close")` is invisible to the handler — the
    // server keeps doing work for a response no one will read.
    signal,
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = Readable.toWeb(request) as ReadableStream<Uint8Array>;
    init.duplex = "half";
  }

  return new Request(url, init);
}

export async function streamResponseToExpress(
  response: Response,
  expressResponse: express.Response,
): Promise<void> {
  expressResponse.status(response.status);
  response.headers.forEach((value, key) =>
    expressResponse.setHeader(key, value),
  );

  if (!response.body) {
    expressResponse.end();

    return;
  }

  for await (const chunk of response.body) {
    expressResponse.write(Buffer.from(chunk));
  }

  expressResponse.end();
}
