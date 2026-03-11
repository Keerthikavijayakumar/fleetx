# FleetX — Fleet Management & Real-Time Logistics Platform

Production-ready fleet management web application with role-based access, real-time GPS tracking, route planning with Google Maps, and comprehensive data analytics.

## Tech Stack

### Frontend
- **React** (Vite) — fast development & build
- **TailwindCSS v4** — utility-first styling
- **Context API** — global auth state management
- **Axios** — HTTP client
- **Socket.io Client** — real-time truck updates
- **@react-google-maps/api** — Google Maps integration
- **Recharts** — data visualization

### Backend
- **Node.js + Express** — REST API server
- **MongoDB + Mongoose** — database & ODM
- **Socket.io** — real-time WebSocket events
- **JWT** — token-based authentication
- **csv-parser** — CSV file processing
- **express-rate-limit** — API rate limiting
- **express-validator** — input validation

## Architecture

Clean MVC structure:

```
backend/
├── config/         # Database connection
├── controllers/    # Request handlers
├── middleware/      # Auth, validation, rate limiting, error handling
├── models/         # Mongoose schemas (User, Truck, Route, Maintenance, TruckAnalytics)
├── routes/         # Express route definitions
├── services/       # Business logic
├── socket/         # Real-time simulation
└── server.js       # Entry point

frontend/
├── src/
│   ├── components/ # Sidebar, Navbar, DashboardLayout, ProtectedRoute
│   ├── context/    # AuthContext (user, token, role)
│   ├── pages/      # All page components
│   └── services/   # API service functions
```

## Role-Based Access

| Feature | Admin | Manager | Driver |
|---------|-------|---------|--------|
| Dashboard Overview | ✅ | ✅ | — |
| Live Tracking | ✅ | ✅ | ✅ |
| Fleet Management | ✅ (CRUD) | — | — |
| Route Planner | ✅ | ✅ (view) | — |
| Maintenance | ✅ (CRUD) | — | — |
| Data Analytics | ✅ (upload CSV) | ✅ (view) | — |
| Settings | ✅ | — | — |
| My Truck (GPS) | — | — | ✅ |
| My Routes | — | — | ✅ |

## Setup Instructions

### Prerequisites
- Node.js v18+
- MongoDB running locally or MongoDB Atlas URI
- Google Maps API key (Maps JavaScript API, Places API, Directions API enabled)

### 1. Clone Repository

```bash
git clone https://github.com/JeevigaSivakumar18/Fleet.git
cd Fleet
```

### 2. Backend Setup

```bash
cd backend
npm install
```

Create `backend/.env`:

```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/fleetx
JWT_SECRET=your_jwt_secret_key_here
GOOGLE_MAPS_API_KEY=your_google_maps_api_key
GOOGLE_DIRECTIONS_API_KEY=your_google_maps_api_key
```

Start the backend:

```bash
node server.js
```

### 3. Frontend Setup

```bash
cd frontend
npm install
```

Create `frontend/.env`:

```env
VITE_GOOGLE_MAPS_API_KEY=your_google_maps_api_key
```

Start the frontend:

```bash
npm run dev
```

Open http://localhost:5173 in your browser.

### 4. MongoDB Setup

- **Local**: Install MongoDB Community Server, run `mongod`
- **Atlas**: Create a free cluster at https://cloud.mongodb.com and use the connection URI

The app will auto-seed 8 sample trucks on first startup.

## CSV Upload (Admin)

Admin users can upload truck analytics CSV data via the **Data Analytics** page.

### CSV Format

```csv
date,truck_id,distance_km,fuel_used_liters,cost_rs,co2_kg,delivery_time_min
2024-01-05,TRK-001,320,40.0,3800,107.2,245
2024-01-08,TRK-002,185,24.7,2347,66.2,142
2024-01-12,TRK-003,410,45.6,4332,122.2,310
2024-01-15,TRK-001,275,34.4,3268,92.2,198
```

Upload process:
1. Login as **Admin**
2. Navigate to **Data Analytics**
3. Click **Choose CSV File** under "Upload Truck Analytics CSV"
4. Select your CSV file
5. Data is parsed and stored in the `truck_analytics` MongoDB collection
6. Charts update automatically

## Driver GPS Tracking

Drivers share their real-time location from the **My Truck** page.

### How it works:
1. Register/login as a **Driver**
2. Go to **My Truck** page
3. Select your assigned truck
4. Click **Start Sharing Location**
5. Browser asks for GPS permission — allow it
6. Location is sent to `POST /api/location/update` every 5 seconds
7. Map markers update instantly via Socket.io

### GPS Payload

```json
{
    "truckId": "TRK-001",
    "latitude": 28.6139,
    "longitude": 77.2090,
    "speed": 65
}
```

## Dynamic Traffic

Traffic is calculated dynamically using Google Directions API:

| Condition | Level | Color |
|-----------|-------|-------|
| `duration_in_traffic > duration × 1.4` | **High** | 🔴 Red |
| `duration_in_traffic > duration × 1.15` | **Medium** | 🟠 Orange |
| Otherwise | **Low** | 🟢 Green |

## Route Calculations

When planning a route with a selected truck:

```
fuelConsumed = distance / truck.fuelEfficiency
fuelCost = fuelConsumed × truck.costPerLitre
carbonEmission = fuelConsumed × truck.emissionFactor
```

## API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/register` | — | Register user |
| POST | `/api/auth/login` | — | Login |
| GET | `/api/auth/profile` | JWT | Get profile |
| GET | `/api/trucks` | JWT | List trucks |
| POST | `/api/trucks` | JWT (admin) | Add truck |
| PUT | `/api/trucks/:id` | JWT (admin) | Update truck |
| DELETE | `/api/trucks/:id` | JWT (admin) | Delete truck |
| GET | `/api/routes` | JWT | List routes |
| POST | `/api/routes` | JWT | Plan route |
| GET | `/api/maintenance` | JWT | List records |
| POST | `/api/maintenance` | JWT (admin) | Add record |
| GET | `/api/maintenance/overdue` | JWT | Overdue alerts |
| POST | `/api/analytics/upload` | JWT (admin) | Upload CSV |
| GET | `/api/analytics/dashboard` | JWT | Stats |
| GET | `/api/directions` | JWT | Directions proxy |
| POST | `/api/location/update` | JWT | Update GPS |

## License

MIT
