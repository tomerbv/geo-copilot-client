import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, signal } from '@angular/core';
import { HttpClientModule } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { ApiService, LatLon } from './api.service';
import { environment } from '../environments/environment';

// @ts-ignore
import * as Cesium from 'cesium';

@Component({
  standalone: true,
  selector: 'app-root',
  imports: [HttpClientModule, FormsModule],
  template: `
    <div class="panel">
      <div class="row"><span class="badge">Mode</span>
        <span>{{ pointA() ? (pointB() ? 'A → B (route)' : 'A set (chat)') : 'Click map to set A' }}</span>
      </div>
      <div class="row">
        <textarea [(ngModel)]="prompt" placeholder="Trip prompt..."></textarea>
      </div>
      <div class="row">
        <button (click)="go()" [disabled]="loading">{{ loading ? 'Working…' : 'Go' }}</button>
        <button (click)="clear()" [disabled]="loading">Clear</button>
      </div>
    </div>
    <div #map id="map"></div>
    <div class="summary" *ngIf="summary()">
      <div><b>Result</b></div>
      <div>{{ summary() }}</div>
    </div>
  `,
})
export class AppComponent implements AfterViewInit, OnDestroy {
  @ViewChild('map', { static: true }) mapEl!: ElementRef;
  viewer!: Cesium.Viewer;

  prompt = '';
  loading = false;

  pointA = signal<LatLon | null>(null);
  pointB = signal<LatLon | null>(null);
  summary = signal<string>('');

  pinA?: Cesium.Entity;
  pinB?: Cesium.Entity;

  constructor(private api: ApiService) {}

  ngAfterViewInit(): void {
    (window as any).CESIUM_BASE_URL = '/assets/cesium';
    if (environment.cesiumIonToken) {
      Cesium.Ion.defaultAccessToken = environment.cesiumIonToken;
    }

    this.viewer = new Cesium.Viewer(this.mapEl.nativeElement, {
      animation: false, timeline: false, geocoder: false,
      baseLayerPicker: true, homeButton: true, sceneModePicker: true,
      navigationHelpButton: false, infoBox: false, selectionIndicator: false,
      requestRenderMode: true, maximumRenderTimeChange: Infinity,
    });

    const handler = new Cesium.ScreenSpaceEventHandler(this.viewer.scene.canvas);
    handler.setInputAction((movement: any) => {
      const cartesian = this.viewer.camera.pickEllipsoid(movement.position, this.viewer.scene.globe.ellipsoid);
      if (!cartesian) return;
      const carto = Cesium.Cartographic.fromCartesian(cartesian);
      const lat = Cesium.Math.toDegrees(carto.latitude);
      const lon = Cesium.Math.toDegrees(carto.longitude);

      if (!this.pointA()) {
        this.pointA.set({ lat, lon });
        this.addOrMovePin('A', { lat, lon });
      } else if (!this.pointB()) {
        this.pointB.set({ lat, lon });
        this.addOrMovePin('B', { lat, lon });
      } else {
        this.clear();
        this.pointA.set({ lat, lon });
        this.addOrMovePin('A', { lat, lon });
      }
      this.viewer.scene.requestRender();
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  }

  addOrMovePin(which: 'A' | 'B', coord: LatLon) {
    const cart = Cesium.Cartesian3.fromDegrees(coord.lon, coord.lat);
    const posProp = new Cesium.ConstantPositionProperty(cart);

    const appearance = {
      position: posProp, // <-- PositionProperty, not Cartesian3
      point: { pixelSize: 12 },
      label: {
        text: which, pixelOffset: new Cesium.Cartesian2(0, -18),
        fillColor: Cesium.Color.WHITE, outlineColor: Cesium.Color.BLACK, outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE
      }
    } as any;

    if (which === 'A') {
      if (this.pinA?.position && 'setValue' in this.pinA.position) {
        (this.pinA.position as Cesium.ConstantPositionProperty).setValue(cart);
      } else if (this.pinA) {
        this.pinA.position = posProp;
      } else {
        this.pinA = this.viewer.entities.add(appearance);
      }
    } else {
      if (this.pinB?.position && 'setValue' in this.pinB.position) {
        (this.pinB.position as Cesium.ConstantPositionProperty).setValue(cart);
      } else if (this.pinB) {
        this.pinB.position = posProp;
      } else {
        this.pinB = this.viewer.entities.add(appearance);
      }
    }
  }

  go() {
    if (!this.pointA()) return;
    this.loading = true; this.summary.set('');
    const A = this.pointA()!;
    const B = this.pointB();
    const req = B
      ? this.api.route(A, B, this.prompt || '')
      : this.api.chat(A, this.prompt || '');
    req.subscribe({
      next: (res) => { this.summary.set(res.summary || '(empty)'); this.viewer.scene.requestRender(); },
      error: (err) => { this.summary.set(`Error: ${err?.message || 'request failed'}`); },
      complete: () => (this.loading = false),
    });
  }

  clear() {
    this.pointA.set(null); this.pointB.set(null);
    if (this.pinA) { this.viewer.entities.remove(this.pinA); this.pinA = undefined; }
    if (this.pinB) { this.viewer.entities.remove(this.pinB); this.pinB = undefined; }
    this.summary.set('');
    this.viewer.scene.requestRender();
  }

  ngOnDestroy(): void { if (this.viewer) { this.viewer.destroy(); } }
}