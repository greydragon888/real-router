import { useEffect, useState, type JSX } from "react";
import { createPortal } from "react-dom";

interface Props {
  productId: string;
  productName: string;
}

// React's createPortal is the analog of Vue's <Teleport>. The portal
// target (#modal-target) lives in index.html outside #root, so the
// dialog DOM is attached as a sibling of the main app subtree even
// though the React component is declared inside ProductDetail.
//
// Why the `mounted` gate matters for SSR: createPortal cannot render
// during server SSR — the target DOM node doesn't exist on the server
// (we render to a string, not a DOM). React 19 handles this gracefully
// by skipping the portal output during renderToReadableStream, BUT
// the client-side hydration walker would mismatch if we rendered the
// dialog conditionally based on a state that flips post-hydration.
// The canonical fix is to render the trigger button server-side and
// only allow the dialog content to mount post-hydration via the
// `mounted` flag. SSR ships zero dialog markup; hydration completes
// without warnings; user clicks then opens the dialog through the
// portal.
export function ProductSpecsModal({
  productId,
  productName,
}: Props): JSX.Element {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <>
      <button
        type="button"
        data-testid="open-specs-modal"
        onClick={() => setOpen((prev) => !prev)}
      >
        {open ? "Close" : "Open"} specs
      </button>

      {mounted && open
        ? createPortal(
            <div
              role="dialog"
              data-testid="specs-modal"
              data-product-id={productId}
            >
              <h3>{productName} — full specs</h3>
              <p>Detailed specs for product id {productId}.</p>
              <button
                type="button"
                data-testid="close-specs-modal"
                onClick={() => setOpen(false)}
              >
                Close
              </button>
            </div>,
            document.querySelector("#modal-target") ?? document.body,
          )
        : null}
    </>
  );
}
