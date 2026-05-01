import express from "express";

export function expressToFetchRequest(req: express.Request): Request {
  const url = `http://${req.headers.host}${req.originalUrl}`;
  const init: RequestInit = {
    method: req.method,
    headers: req.headers as Record<string, string>,
  };

  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = req as unknown as BodyInit;
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
