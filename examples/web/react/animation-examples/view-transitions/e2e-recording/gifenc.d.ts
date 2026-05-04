declare module "gifenc/dist/gifenc.esm.js" {
  export type GIFFormat = "rgb565" | "rgb444" | "rgba4444";

  export interface QuantizeOptions {
    format?: GIFFormat;
    clearAlpha?: boolean;
    clearAlphaColor?: number;
    clearAlphaThreshold?: number;
    oneBitAlpha?: boolean | number;
    useSqrt?: boolean;
  }

  export type Palette = number[][];

  export interface FrameOptions {
    palette?: Palette;
    delay?: number;
    repeat?: number;
    transparent?: boolean;
    transparentIndex?: number;
    colorDepth?: number;
    dispose?: number;
    first?: boolean;
  }

  export interface Encoder {
    reset(): void;
    finish(): void;
    bytes(): Uint8Array;
    bytesView(): Uint8Array;
    readonly buffer: ArrayBuffer;
    writeHeader(): void;
    writeFrame(
      indexed: Uint8Array,
      width: number,
      height: number,
      options?: FrameOptions,
    ): void;
  }

  export function GIFEncoder(options?: {
    initialCapacity?: number;
    auto?: boolean;
  }): Encoder;
  export function quantize(
    rgba: Uint8Array | Uint8ClampedArray,
    maxColors: number,
    options?: QuantizeOptions,
  ): Palette;
  export function applyPalette(
    rgba: Uint8Array | Uint8ClampedArray,
    palette: Palette,
    format?: GIFFormat,
  ): Uint8Array;
}
