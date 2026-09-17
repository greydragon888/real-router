import { useRoute } from "@real-router/react";
import { getSsrDataMode } from "@real-router/ssr-data-plugin";
import { useEffect, useState } from "react";

interface DocumentData {
  id: string;
  format: string;
  body: string;
}

export function DocumentPage() {
  const { route } = useRoute();
  const mode = getSsrDataMode(route);
  const ssrData = route.context.data as DocumentData | undefined;
  const [clientData, setClientData] = useState<DocumentData | null>(null);

  useEffect(() => {
    if (mode !== "client-only" || ssrData !== undefined) {
      return;
    }

    const handle = setTimeout(() => {
      setClientData({
        id: route.params.id as string,
        format: route.search.format as string,
        body: `(client) PDF placeholder for ${route.params.id as string}`,
      });
    }, 50);

    return () => {
      clearTimeout(handle);
    };
  }, [mode, ssrData, route.params.id, route.search.format]);

  const data = ssrData ?? clientData;

  return (
    <main data-testid="doc">
      <h1>Doc (mode: {mode})</h1>
      {data === null ? (
        <p data-testid="doc-loading">Loading…</p>
      ) : (
        <div>
          <p data-testid="doc-id">id: {data.id}</p>
          <p data-testid="doc-format">format: {data.format}</p>
          <p data-testid="doc-body">{data.body}</p>
        </div>
      )}
    </main>
  );
}
