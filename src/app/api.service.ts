import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../environments/environment';

export interface LatLon { lat: number; lon: number; }

@Injectable({ providedIn: 'root' })
export class ApiService {
  private base = environment.apiBase;

  constructor(private http: HttpClient) {}

  chat(location: LatLon, prompt: string) {
    return this.http.post<{ summary: string }>(`${this.base}/api/chat`, { location, prompt });
  }

  route(start: LatLon, end: LatLon, prompt: string) {
    return this.http.post<{ summary: string }>(`${this.base}/api/route`, { start, end, prompt });
  }
}