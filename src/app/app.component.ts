import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, ChangeDetectorRef } from '@angular/core';
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
    <div class="panel">
      <div class="row">
        <span class="badge">Mode</span>
        <span>{{ pointA ? (pointB ? 'A → B (route)' : 'A set (chat)') : 'Click map to set A' }}</span>
      </div>

      <div class="row">
        <textarea [(ngModel)]="prompt" placeholder="Trip prompt..."></textarea>
      </div>

      <div class="row">
        <button (click)="go()" [disabled]="loading">{{ loading ? 'Working…' : 'Go' }}</button>
        <button (click)="clear()" [disabled]="loading">Clear</button>
      </div>

      <div class="row" style="font-size:12px;opacity:.8">
        Click once to set <b>A</b>; click again to set <b>B</b>. One point calls <code>/api/chat</code>, two points call <code>/api/route</code>.
      </div>
    </div>

    <div #map id="map"></div>

    <div class="summary" *ngIf="summary">
      <div style="margin-bottom:8px; font-weight:600;">Result</div>
      <div>{{ summary }}</div>
    </div>
  `,
})
export class AppComponent implements AfterViewInit, OnDestroy {
  @ViewChild('map', { static: true }) mapEl!: ElementRef;
  viewer!: Cesium.Viewer;

  prompt = '';
  loading = false;

  pointA: LatLon | null = null;
  pointB: LatLon | null = null;
  summary = '';

  pinA?: Cesium.Entity;
  pinB?: Cesium.Entity;

  constructor(private api: ApiService, private cdr: ChangeDetectorRef) {}

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

      if (!this.pointA) {
        this.pointA = { lat, lon };
        this.addOrMovePin('A', this.pointA);
      } else if (!this.pointB) {
        this.pointB = { lat, lon };
        this.addOrMovePin('B', this.pointB);
      } else {
        this.clear();
        this.pointA = { lat, lon };
        this.addOrMovePin('A', this.pointA);
      }
      this.viewer.scene.requestRender();
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  }

  addOrMovePin(which: 'A' | 'B', coord: LatLon) {
    const cart = Cesium.Cartesian3.fromDegrees(coord.lon, coord.lat);
    const posProp = new Cesium.ConstantPositionProperty(cart);

    const appearance = {
      position: posProp,
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
    if (!this.pointA) return;
    this.loading = true;
    this.summary = '';

    const A = this.pointA!;
    const B = this.pointB;

    const req = B
      ? this.api.route(A, B, this.prompt || '')
      : this.api.chat(A, this.prompt || '');

    req.subscribe({
      next: (res) => {
        this.summary = res.summary || '(empty)';
        // Ensure UI updates immediately
        this.cdr.detectChanges();
        this.viewer.scene.requestRender();
      },
      error: (err) => {
        this.summary = `Error: ${err?.message || 'request failed'}`;
        this.cdr.detectChanges();
      },
      complete: () => (this.loading = false),
    });
  }

  clear() {
    this.pointA = null;
    this.pointB = null;
    if (this.pinA) { this.viewer.entities.remove(this.pinA); this.pinA = undefined; }
    if (this.pinB) { this.viewer.entities.remove(this.pinB); this.pinB = undefined; }
    this.summary = '';
    this.viewer.scene.requestRender();
  }

  ngOnDestroy(): void {
    if (this.viewer) this.viewer.destroy();
  }
}
