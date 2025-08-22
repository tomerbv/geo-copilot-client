import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, ChangeDetectorRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, LatLon } from './api.service';
import { environment } from '../environments/environment';
// @ts-ignore
import * as Cesium from 'cesium';

@Component({
  standalone: true,
  selector: 'app-root',
  imports: [CommonModule, FormsModule],
  template: `
    <div class="app-shell">
      <header class="topbar">
        <div class="brand">Geo‑Copilot</div>
        <div class="grow"></div>
        <button class="btn ghost" (click)="resetView()" title="Reset view">⤾ Reset</button>
      </header>

      <div class="sidebar">
        <div class="field">
          <label>Prompt (optional)</label>
          <input [(ngModel)]="prompt" placeholder="e.g. Plan a 2‑hour walk with views" />
        </div>
        <div class="field compact">
          <label>Point A</label>
          <div class="badge" [class.muted]="!pointA">{{ pointA ? toLabel(pointA) : '—' }}</div>
        </div>
        <div class="field compact">
          <label>Point B</label>
          <div class="badge" [class.muted]="!pointB">{{ pointB ? toLabel(pointB) : '—' }}</div>
        </div>

        <div class="actions">
          <button class="btn primary" (click)="run()" [disabled]="loading || !pointA">{{ loading ? 'Working…' : (pointB ? 'Plan route A→B' : 'Ask about A') }}</button>
          <button class="btn" (click)="clear()" [disabled]="loading && !pointA && !pointB">Clear</button>
        </div>

        <div class="hint">
          Click the map to set <strong>A</strong>, click again to set <strong>B</strong>.
          When A and B are set, another click will clear the selection.
        </div>
      </div>

      <div #map class="map"></div>

      <!-- Results dialog -->
      <div class="modal-backdrop" *ngIf="isDialogOpen" (click)="closeDialog()"></div>
      <div class="modal" *ngIf="isDialogOpen" role="dialog" aria-modal="true">
        <div class="modal-header">
          <h3>Results</h3>
          <button class="icon-btn" (click)="closeDialog()" aria-label="Close">✕</button>
        </div>
        <div class="modal-body">
          <pre class="summary" [innerText]="summary"></pre>
        </div>
        <div class="modal-footer">
          <button class="btn" (click)="copySummary()">Copy</button>
          <button class="btn primary" (click)="closeDialog()">Close</button>
        </div>
      </div>
    </div>
  `,
  styles: [``],
})
export class AppComponent implements AfterViewInit, OnDestroy {
  @ViewChild('map', { static: true }) mapEl!: ElementRef<HTMLDivElement>;

  viewer!: Cesium.Viewer;
  handler!: Cesium.ScreenSpaceEventHandler;

  pointA: LatLon | null = null;
  pointB: LatLon | null = null;
  prompt = '';
  summary = '';
  loading = false;

  pinA?: Cesium.Entity;
  pinB?: Cesium.Entity;
  arrow?: Cesium.Entity;

  // Dialog state
  isDialogOpen = false;

  constructor(private api: ApiService, private cdr: ChangeDetectorRef) {}

  ngAfterViewInit(): void {
    (window as any).CESIUM_BASE_URL = '/assets/cesium';
    if (environment.cesiumIonToken) {
      Cesium.Ion.defaultAccessToken = environment.cesiumIonToken;
    }

    this.viewer = new Cesium.Viewer(this.mapEl.nativeElement, {
      animation: false,
      timeline: false,
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      fullscreenButton: false,
      selectionIndicator: false,
      infoBox: false,
      requestRenderMode: true,
    });

    // Render tweaks
    this.viewer.scene.globe.depthTestAgainstTerrain = true;
    this.viewer.scene.postRender.addEventListener(() => {
      // keep it responsive but efficient
    });

    this.handler = new Cesium.ScreenSpaceEventHandler(this.viewer.scene.canvas);
    this.handler.setInputAction((click: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
      const cartesian = this.viewer.camera.pickEllipsoid(click.position, this.viewer.scene.globe.ellipsoid);
      if (!cartesian) return;
      const carto = Cesium.Cartographic.fromCartesian(cartesian);
      const lat = Cesium.Math.toDegrees(carto.latitude);
      const lon = Cesium.Math.toDegrees(carto.longitude);
      this.onMapClick({ lat, lon });
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    // Nice default view
    this.viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(34.7818, 32.0853, 12000), // Tel‑Aviv-ish
    });
  }

  onMapClick(p: LatLon) {
    // If both are set, clear (do not immediately assign A on this click)
    if (this.pointA && this.pointB) {
      this.clear();
      this.viewer.scene.requestRender();
      return;
    }

    if (!this.pointA) {
      this.pointA = p;
      this.addOrUpdatePin('A');
    } else if (!this.pointB) {
      this.pointB = p;
      this.addOrUpdatePin('B');
      this.addOrUpdateArrow();
    }

    this.viewer.scene.requestRender();
  }

  private addOrUpdatePin(which: 'A' | 'B') {
    const coord = which === 'A' ? this.pointA : this.pointB;
    if (!coord) return;

    // remove old
    const old = which === 'A' ? this.pinA : this.pinB;
    if (old) this.viewer.entities.remove(old);

    const entity = this.viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(coord.lon, coord.lat),
      point: { pixelSize: 12, color: which === 'A' ? Cesium.Color.ORANGE : Cesium.Color.DODGERBLUE },
      label: {
        text: which,
        font: '700 14px Inter, Roboto, Arial, sans-serif',
        pixelOffset: new Cesium.Cartesian2(0, -18),
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 3,
        showBackground: true,
        backgroundColor: Cesium.Color.fromCssColorString('#00000055'),
      },
    });

    if (which === 'A') this.pinA = entity; else this.pinB = entity;
  }

  private addOrUpdateArrow() {
    if (!this.pointA || !this.pointB) return;

    if (this.arrow) {
      this.viewer.entities.remove(this.arrow);
      this.arrow = undefined;
    }

    this.arrow = this.viewer.entities.add({
      polyline: {
        positions: Cesium.Cartesian3.fromDegreesArray([
          this.pointA.lon, this.pointA.lat,
          this.pointB.lon, this.pointB.lat,
        ]),
        width: 6,
        material: new Cesium.PolylineArrowMaterialProperty(Cesium.Color.CYAN.withAlpha(0.9)),
        clampToGround: true,
      },
    });
  }

  toLabel(p: LatLon) {
    return `${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}`;
  }

  async run() {
    if (!this.pointA) return;

    this.loading = true;
    this.summary = '';
    this.isDialogOpen = false;

    const A = this.pointA;
    const B = this.pointB;

    const req = B ? this.api.route(A, B, this.prompt || '') : this.api.chat(A, this.prompt || '');

    req.subscribe({
      next: (res) => {
        this.summary = res.summary || '(empty)';
        this.loading = false;
        this.isDialogOpen = true;
        this.cdr.detectChanges();
        this.viewer.scene.requestRender();
      },
      error: (err) => {
        this.summary = `Error: ${err?.message || 'request failed'}`;
        this.loading = false;
        this.isDialogOpen = true;
        this.cdr.detectChanges();
      },
    });
  }

  clear() {
    this.pointA = null;
    this.pointB = null;
    if (this.pinA) { this.viewer.entities.remove(this.pinA); this.pinA = undefined; }
    if (this.pinB) { this.viewer.entities.remove(this.pinB); this.pinB = undefined; }
    if (this.arrow) { this.viewer.entities.remove(this.arrow); this.arrow = undefined; }
    this.summary = '';
  }

  resetView() {
    this.viewer.flyTo(this.viewer.entities, { duration: 0.6 }).catch(() => {
      this.viewer.camera.flyHome(0.6);
    });
  }

  copySummary() {
    navigator.clipboard?.writeText(this.summary || '').catch(() => {});
  }

  closeDialog() { this.isDialogOpen = false; }

  @HostListener('window:keydown.esc') onEsc() { if (this.isDialogOpen) this.closeDialog(); }

  ngOnDestroy(): void {
    if (this.handler) this.handler.destroy();
    if (this.viewer) this.viewer.destroy();
  }
}