import { Readable } from "node:stream";
import express from "express";

function toFetchHeaders(nodeHeaders: express.Request["headers"]): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(nodeHeaders)) {
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v);
    } else if (value !== undefined) {
      headers.set(key, value);
    }
  }
  return headers;
}

export function expressToFetchRequest(req: express.Request): Request {
  const url = `http://${req.headers.host}${req.originalUrl}`;
  const init: RequestInit & { duplex?: "half" } = {
    method: req.method,
    headers: toFetchHeaders(req.headers),
  };

  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = Readable.toWeb(req) as ReadableStream<Uint8Array>;
    init.duplex = "half";
  }

  return new Request(url, init);
}

export async function streamResponseToExpress(
  response: Response,
  res: express.Response,
): Promise<void> {
  res.status(response.status);
  response.headers.forEach((v, k) => res.setHeader(k, v));

  if (!response.body) {
    res.end();
    return;
  }

  const reader = response.body.getReader();

  while (true) {
    const { done, value } = await reader.read();

    if (done) break;

    res.write(Buffer.from(value));
  }

  res.end();
}
