# GeoCopilot Client

The **GeoCopilot Client** is a web-based map UI built with **Angular** and **CesiumJS**.  
It lets users pick two points on a 3D globe, send requests to the backend, and get trip routes or recommendations.

## Features
- 🌍 Interactive 3D map (CesiumJS)
- 📍 Select Point A and Point B
- ➡️ Draw arrows and routes between points
- 🤖 Send queries to the backend for routing & recommendations
- 💬 Sidebar input and results dialog

## Setup

### Prerequisites
- Node.js (>= 18)
- Angular CLI

### Install & Run
```bash
npm install
npm start
```
App runs on [http://localhost:4200](http://localhost:4200).

### Build
```bash
ng build
```

## Config
Set backend API URL in `src/environments/environment.ts`:
```ts
export const environment = {
  production: false,
  apiUrl: "http://localhost:5000/api"
};
```

## Usage
1. Start the backend (`geo-copilot-service`)
2. Run the client
3. Select two points on the map
4. Optionally enter a request (e.g., "scenic route")
5. Click **Run Analysis** → results show in a dialog
