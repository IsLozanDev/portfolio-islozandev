import { createGlobalPositionStrategy, createOverlayRef, OVERLAY_DEFAULT_CONFIG } from '@angular/cdk/overlay';
import { Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideOverlaysApilados } from './provide-overlays-apilados';

describe('provideOverlaysApilados', () => {
  it('deja los overlays fuera del top layer', () => {
    TestBed.configureTestingModule({ providers: [provideOverlaysApilados()] });
    const injector = TestBed.inject(Injector);

    expect(TestBed.inject(OVERLAY_DEFAULT_CONFIG)).toEqual({ usePopover: false });
    const overlay = createOverlayRef(injector, { positionStrategy: createGlobalPositionStrategy(injector) });
    expect(overlay.hostElement.hasAttribute('popover')).toBe(false);
    overlay.dispose();
  });
});
