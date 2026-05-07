import { useRoute } from "@real-router/react";
import { getSsrDataMode } from "@real-router/ssr-data-plugin";
import { useEffect, useState } from "react";
export function Doc() {
    const { route } = useRoute();
    const mode = getSsrDataMode(route);
    const ssrData = route.context.data;
    const [clientData, setClientData] = useState(null);
    useEffect(() => {
        if (mode !== "client-only" || ssrData !== undefined) {
            return;
        }
        const handle = setTimeout(() => {
            setClientData({
                id: String(route.params.id),
                format: String(route.params.format),
                body: `(client) PDF placeholder for ${String(route.params.id)}`,
            });
        }, 50);
        return () => {
            clearTimeout(handle);
        };
    }, [mode, ssrData, route.params.id, route.params.format]);
    const data = ssrData ?? clientData;
    return (<main data-testid="doc">
      <h1>Doc (mode: {mode})</h1>
      {data === null || data === undefined ? (<p data-testid="doc-loading">Loading…</p>) : (<div>
          <p data-testid="doc-id">id: {data.id}</p>
          <p data-testid="doc-format">format: {data.format}</p>
          <p data-testid="doc-body">{data.body}</p>
        </div>)}
    </main>);
}
