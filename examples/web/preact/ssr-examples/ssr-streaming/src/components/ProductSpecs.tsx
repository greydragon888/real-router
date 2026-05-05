import type { JSX } from "preact";

interface ProductSpec {
  label: string;
  value: string;
}

const SPECS_BY_PRODUCT: Record<string, ProductSpec[]> = {
  "1": [
    { label: "Switch type", value: "Cherry MX Brown (tactile)" },
    { label: "Layout", value: "ANSI 75%" },
    { label: "Connectivity", value: "USB-C, Bluetooth 5.1, 2.4 GHz wireless" },
    { label: "Battery", value: "4000 mAh, ~80h backlit / ~200h unlit" },
    { label: "Weight", value: "920 g" },
  ],
  "2": [
    { label: "Sensor", value: "PixArt PMW3389 (16k DPI)" },
    { label: "Buttons", value: "6 programmable + scroll click" },
    { label: "Connectivity", value: "USB-C dongle, Bluetooth 5.0" },
    { label: "Weight", value: "78 g" },
  ],
  "3": [
    { label: "Panel", value: "27\" IPS, 3840×2160" },
    { label: "Refresh rate", value: "144 Hz" },
    { label: "HDR", value: "DisplayHDR 600" },
    { label: "Ports", value: "2× HDMI 2.1, 1× DP 1.4, 1× USB-C 90W PD" },
  ],
};

interface ProductSpecsProps {
  readonly productId: string;
}

// This component is loaded via `lazy(() => import("./ProductSpecs"))`
// from ProductDetail.tsx. The dynamic import causes Vite to emit it
// as a separate chunk; on the SSR side, preact-render-to-string's
// renderToReadableStream awaits the import promise before flushing
// this Suspense boundary's chunk.
//
// Module-level fixture data is intentionally bigger than the parent
// component's payload so the chunk has substance — proves the lazy
// boundary actually deferred something meaningful, not just an empty
// component shell.
export default function ProductSpecs({
  productId,
}: ProductSpecsProps): JSX.Element {
  const specs = SPECS_BY_PRODUCT[productId] ?? [];

  if (specs.length === 0) {
    return <p data-testid="specs-empty">No specs available.</p>;
  }

  return (
    <section data-testid="specs-section">
      <h2>Specifications</h2>
      <dl>
        {specs.map((spec) => (
          <div key={spec.label} data-spec-label={spec.label}>
            <dt>{spec.label}</dt>
            <dd>{spec.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
