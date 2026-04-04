console.log = () => {};
console.warn = () => {};
console.error = () => {};

if (!("Touch" in globalThis)) {
  class TouchPolyfill {
    readonly identifier: number;
    readonly target: EventTarget;
    readonly clientX: number;
    readonly clientY: number;
    readonly pageX: number;
    readonly pageY: number;
    readonly screenX: number;
    readonly screenY: number;
    readonly radiusX: number;
    readonly radiusY: number;
    readonly rotationAngle: number;
    readonly force: number;
    readonly altitudeAngle: number;
    readonly azimuthAngle: number;
    readonly touchType: TouchType;

    constructor(init: TouchInit) {
      this.identifier = init.identifier;
      this.target = init.target;
      this.clientX = init.clientX ?? 0;
      this.clientY = init.clientY ?? 0;
      this.pageX = init.pageX ?? 0;
      this.pageY = init.pageY ?? 0;
      this.screenX = init.screenX ?? 0;
      this.screenY = init.screenY ?? 0;
      this.radiusX = init.radiusX ?? 0;
      this.radiusY = init.radiusY ?? 0;
      this.rotationAngle = init.rotationAngle ?? 0;
      this.force = init.force ?? 0;
      this.altitudeAngle = 0;
      this.azimuthAngle = 0;
      this.touchType = "direct";
    }
  }

  Object.defineProperty(globalThis, "Touch", {
    value: TouchPolyfill,
    writable: false,
    configurable: true,
  });
}
