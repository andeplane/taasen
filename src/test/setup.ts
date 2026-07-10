// jsdom lacks a few browser APIs the app uses; provide typed polyfills.

if (typeof window.PointerEvent === 'undefined') {
  class PointerEventPolyfill extends MouseEvent {
    readonly pointerId: number;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
    }
  }
  Object.defineProperty(window, 'PointerEvent', { value: PointerEventPolyfill });
}

if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = function (this: Element, _pointerId: number): void { /* no-op in jsdom */ };
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = function (this: Element, _pointerId: number): void { /* no-op in jsdom */ };
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function (this: Element, _arg?: boolean | ScrollIntoViewOptions): void { /* no-op in jsdom */ };
}
