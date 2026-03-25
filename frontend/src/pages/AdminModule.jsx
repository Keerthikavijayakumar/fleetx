import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminSyncAPI, authAPI, routesAPI, trucksAPI, salaryAPI } from '../services/api';
import {
    HiOutlineViewGrid,
    HiOutlineTruck,
    HiOutlineClipboardList,
    HiOutlineMap,
    HiOutlineUser,
    HiOutlineUsers,
    HiOutlineFolder,
    HiOutlineRefresh,
    HiOutlineTrash,
    HiOutlineSearch,
    HiOutlineArrowRight,
    HiOutlineSave,
    HiOutlineDocumentDownload,
    HiOutlineCurrencyDollar,
} from 'react-icons/hi';
import {
    generateAllLorriesReport,
    generateAllPeopleReport,
    generateAllDriversReport,
    generateAllAssistantsReport,
    generateAllTripsReport,
    generateTripReport,
} from '../services/reportGenerator';
import * as XLSX from 'xlsx';
// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
const fmtDate = (d) => {
    if (!d) return '—';
    const dt = new Date(d);
    return dt.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const fmtMonth = (m) => {
    if (!m || !/^\d{4}-\d{2}$/.test(m)) return m || '—';
    const [y, mo] = m.split('-').map(Number);
    return new Date(y, (mo || 1) - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
};

const fmtNum = (n) => new Intl.NumberFormat('en-IN').format(Number(n || 0));
const currentMonthKey = new Date().toISOString().slice(0, 7);

const normalizeReg = (value) => String(value || '').replace(/\s+/g, '').toUpperCase();

const getFirstValue = (row, keys) => {
    for (const key of keys) {
        if (row?.[key] !== undefined && row?.[key] !== null && row?.[key] !== '') return row[key];
    }
    return null;
};

const toDateSafe = (value) => {
    if (!value) return null;
    const dt = new Date(value);
    if (!Number.isNaN(dt.getTime())) return dt;
    if (typeof value === 'number') {
        const excelEpoch = new Date(Date.UTC(1899, 11, 30));
        const parsed = new Date(excelEpoch.getTime() + (value * 86400000));
        if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    return null;
};

const getRowDate = (row) => {
    return toDateSafe(getFirstValue(row, ['Date', 'date', 'Timestamp', 'timestamp', 'DateTime', 'datetime']));
};

const toNum = (value) => {
    const n = Number(value ?? 0);
    return Number.isFinite(n) ? n : 0;
};

const getDistance = (row) => toNum(getFirstValue(row, ['Distance', 'distance', 'distance_km', 'DistanceKm', 'distanceKm']));
const getFuel = (row) => toNum(getFirstValue(row, ['FuelUsed', 'fuel_used_liters', 'fuelUsedLiters', 'Fuel', 'fuel']));
const getCost = (row) => toNum(getFirstValue(row, ['Cost', 'cost', 'cost_rs', 'CostRs', 'costRs']));
const getSpeed = (row) => toNum(getFirstValue(row, ['Speed', 'speed', 'SpeedKmph', 'speed_kmph', 'vehicleSpeedKmph']));
const getFuelPercent = (row) => toNum(getFirstValue(row, ['FuelPercent', 'fuelPercent', 'FuelLevel', 'fuelLevel']));

const isRunningStatus = (row) => {
    const status = String(getFirstValue(row, ['Status', 'status', 'Ignition', 'ignitionStatus', 'EngineStatus', 'engineStatus']) || '').toLowerCase();
    return status.includes('running') || status.includes('ignition on') || status.includes('on');
};

const daysUntil = (d) => {
    if (!d) return null;
    return Math.ceil((new Date(d) - new Date()) / 86400000);
};

const dueBadge = (d) => {
    const days = daysUntil(d);
    if (days === null) return null;
    if (days < 0)  return <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-red-100 text-red-700">Overdue</span>;
    if (days <= 30) return <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-yellow-100 text-yellow-700">Due in {days}d</span>;
    return <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-green-100 text-green-700">Due in {days}d</span>;
};

const FIELD_LABEL_CLASS = 'block text-sm font-semibold text-gray-700 mb-1';

const Field = ({ label, children }) => (
    <div>
        <label className={FIELD_LABEL_CLASS}>{label}</label>
        {children}
    </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// Empty forms
// ─────────────────────────────────────────────────────────────────────────────
const emptyTruckForm = {
    licensePlate: '',
    registrationDate: '',
    status: 'active',
    mileage: '',
    tankCapacity: '',
    costPerLitre: '',
    insuranceNumber: '',
    insuranceExpiry: '',
    taxDocumentNumber: '',
    stateTaxAmount: '',
    stateTaxPaidDate: '',
    centralTaxAmount: '',
    centralTaxPaidDate: '',
};

const emptyTripForm = {
    source: '',
    destination: '',
    truckId: '',
    driverId: '',
    assistantId: '',
    distance: '',
    duration: '',
    tollCount: 0,
    tollPrice: 0,
    foodCost: 0,
    tripStartTime: '',
    tripEndTime: '',
    status: 'scheduled',
};

const emptyUserForm = {
    username: '',
    email: '',
    password: 'arm',
    fullName: '',
    dateOfBirth: '',
    phone: '',
    additionalPhone: '',
    address: '',
    driverLicenceNumber: '',
    aadharNumber: '',
    experienceYears: '',
    monthlySalary: '',
};

// ─────────────────────────────────────────────────────────────────────────────
// Module-level cache — survives route navigation without losing data
// ─────────────────────────────────────────────────────────────────────────────
const _adminCache = { trucks: null, trips: null, users: null, fetchedAt: 0 };

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
const AdminModule = () => {
    const navigate = useNavigate();
    const [section, setSection] = useState('add-trip');
    // Only show full-page spinner on the very first load; subsequent navigations
    // use cached data instantly and refresh silently in the background.
    const [loading, setLoading] = useState(!_adminCache.fetchedAt);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');

    const [trucks, setTrucks]   = useState(_adminCache.trucks || []);
    const [trips, setTrips]     = useState(_adminCache.trips  || []);
    const [users, setUsers]     = useState(_adminCache.users  || []);
    const [fleetData, setFleetData] = useState([]);
    const [rawDataError, setRawDataError] = useState('');

    // Truck form state
    const [truckForm, setTruckForm]   = useState(emptyTruckForm);
    const stateTaxPermitRef           = useRef(null);
    const centralTaxPermitRef         = useRef(null);

    // Trip / user form state
    const [tripForm, setTripForm]   = useState(emptyTripForm);
    const [userForm, setUserForm]   = useState(emptyUserForm);
    const userPhotoRef              = useRef(null);
    const [tripAssignmentDrafts, setTripAssignmentDrafts] = useState({});
    const [tripAssignmentSavingId, setTripAssignmentSavingId] = useState('');
    const [tripDriverSpreadSaving, setTripDriverSpreadSaving] = useState(false);
    const [tripMissingAssignSaving, setTripMissingAssignSaving] = useState(false);

    const [monthlySyncStatus, setMonthlySyncStatus] = useState(null);
    const [monthlySyncSummary, setMonthlySyncSummary] = useState(null);
    const [syncHistory, setSyncHistory] = useState([]);
    const [expandedHistoryMonths, setExpandedHistoryMonths] = useState({});
    const monthlyUploadRef = useRef(null);
    const [monthlyUploadFile, setMonthlyUploadFile] = useState(null);
    const [monthlyUploadMonth, setMonthlyUploadMonth] = useState(currentMonthKey);
    const [monthlyUploadTruckIds, setMonthlyUploadTruckIds] = useState([]);
    const [monthlyTruckUploadBusy, setMonthlyTruckUploadBusy] = useState(false);
    const [monthlyTruckUploadError, setMonthlyTruckUploadError] = useState('');

    // Truck list filter state
    const [truckSearch, setTruckSearch]         = useState('');
    const [truckStatusFilter, setTruckStatusFilter] = useState('all');

    // Trip assignment filter state
    const [taSearch, setTaSearch]               = useState('');
    const [taTruckFilter, setTaTruckFilter]     = useState('all');
    const [taDriverFilter, setTaDriverFilter]   = useState('all');
    const [taStatusFilter, setTaStatusFilter]   = useState('all');
    const [taTab, setTaTab]                     = useState('active'); // 'active' | 'past'
    const [assignedSalaries, setAssignedSalaries] = useState([]);

    // Salary form state
    const [salaryForm, setSalaryForm] = useState({
        selectedTripId: '',
        driverId: '',
        assistantId: '',
        totalAmountReceived: '',
        salaryDate: new Date().toISOString().split('T')[0],
        notes: '',
    });
    const [tripSearchFilters, setTripSearchFilters] = useState({
        dateFrom: '',
        dateTo: '',
        source: '',
        destination: '',
        driverId: '',
    });

    const refreshAll = async () => {
        try {
            // Only block the UI with a spinner when there is no cached data yet.
            // After the first load, all re-fetches happen silently in the background.
            if (!_adminCache.fetchedAt) setLoading(true);
            const [usersRes, trucksRes, tripsRes, salariesRes] = await Promise.all([
                authAPI.adminListUsers(),
                trucksAPI.getAll(),
                routesAPI.getAll(),
                salaryAPI.getSalaries({ limit: 500 }),
            ]);
            const fetchedUsers  = usersRes.data?.users || [];
            const fetchedTrucks = Array.isArray(trucksRes.data) ? trucksRes.data : [];
            const fetchedTrips  = Array.isArray(tripsRes.data) ? tripsRes.data : [];
            const fetchedSalaries = salariesRes.data?.salaries || [];
            
            setAssignedSalaries(fetchedSalaries);
            // Update module-level cache so the next mount is instant
            _adminCache.users     = fetchedUsers;
            _adminCache.trucks    = fetchedTrucks;
            _adminCache.trips     = fetchedTrips;
            _adminCache.fetchedAt = Date.now();
            setUsers(fetchedUsers);
            setTrucks(fetchedTrucks);
            setTrips(fetchedTrips);
            setFleetData([]);
            setRawDataError('');
        } catch (err) {
            console.error('Admin module fetch error', err);
            setMessage('Failed to load admin data.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { refreshAll(); }, []);
    useEffect(() => {
        if (section === 'monthly-report') loadMonthlySyncStatus();
    }, [section]);

    const drivers    = useMemo(() => users.filter((u) => u.role === 'driver'), [users]);
    const assistants = useMemo(() => users.filter((u) => u.role === 'assistant'), [users]);
    const assistantTripCandidates = useMemo(
        () => users.filter((u) => u.role === 'assistant' || u.role === 'driver'),
        [users]
    );
    const assignedTripsForUser = useCallback((person) => {
        return trips.filter((trip) => {
            const driverId = trip.driverId?._id || trip.driverId;
            const assistantId = trip.assistantId?._id || trip.assistantId;
            return String(driverId) === String(person._id) || String(assistantId) === String(person._id);
        });
    }, [trips]);
    const assignedEarningsForUser = useCallback((person) => {
        return assignedSalaries.reduce((sum, s) => {
            const isDriver = String(s.driverId?._id || s.driverId) === String(person._id);
            const isAsst = String(s.assistantId?._id || s.assistantId) === String(person._id);
            if (isDriver) return sum + (s.driverShare || 0);
            if (isAsst) return sum + (s.assistantShare || 0);
            return sum;
        }, 0);
    }, [assignedSalaries]);
    const selectedTripTruck = useMemo(
        () => trucks.find((t) => t._id === tripForm.truckId),
        [trucks, tripForm.truckId]
    );
    const tripEstimates = useMemo(() => {
        const distanceKm = Number(tripForm.distance || 0);
        if (!selectedTripTruck || distanceKm <= 0) {
            return { fuelLitres: 0, timeHours: 0, fuelCost: 0, totalCost: 0 };
        }
        const mileage = Number(selectedTripTruck.fuelEfficiency || selectedTripTruck.mileage || 8);
        const speed = Number(selectedTripTruck.speed || 45) > 0 ? Number(selectedTripTruck.speed || 45) : 45;
        const fuelLitres = mileage > 0 ? distanceKm / mileage : 0;
        const timeHours = distanceKm / speed;
        const fuelCost = fuelLitres * Number(selectedTripTruck.costPerLitre || 0);
        const tollCost = Number(tripForm.tollCount || 0) * Number(tripForm.tollPrice || 0);
        const foodCost = Number(tripForm.foodCost || 0);
        return {
            fuelLitres,
            timeHours,
            fuelCost,
            totalCost: fuelCost + tollCost + foodCost,
        };
    }, [selectedTripTruck, tripForm.distance, tripForm.tollCount, tripForm.tollPrice, tripForm.foodCost]);

    // ── Helper: return all trips that belong to a given truck ──────────────────
    // Seeded / CSV-ingested trips store the truck as `registrationNumber` (string)
    // rather than a Mongoose ObjectId ref, so we match against both.
    const normReg = (s) => String(s || '').replace(/\s+/g, '').toUpperCase();
    const tripsForTruck = useCallback((truck) => {
        const mongoId = String(truck._id);
        const strId   = normReg(truck.truckId);
        const plate   = normReg(truck.licensePlate);
        return trips.filter((r) => {
            const tid = r.truckId?._id || r.truckId;
            if (tid && String(tid) === mongoId) return true;
            const reg = normReg(r.registrationNumber);
            return reg && (reg === strId || reg === plate);
        });
    }, [trips]);

    // Filtered truck list for the card grid
    const filteredTrucks = useMemo(() => {
        return trucks.filter((t) => {
            const matchStatus = truckStatusFilter === 'all' || t.status === truckStatusFilter;
            const q = truckSearch.toLowerCase();
            const matchSearch = !q
                || t.licensePlate?.toLowerCase().includes(q)
                || t.insuranceNumber?.toLowerCase().includes(q);
            return matchStatus && matchSearch;
        });
    }, [trucks, truckSearch, truckStatusFilter]);

    // Helper: readable truck label from a trip
    const tripTruckLabel = (trip) =>
        trip.truckId?.licensePlate
        || trip.truckId?.truckId
        || trip.registrationNumber
        || '—';

    // Derived lists for trip assignment tabs
    const taActiveTrips = useMemo(
        () => trips.filter((t) => ['scheduled', 'in_transit'].includes(t.status)),
        [trips]
    );
    const taPastTrips = useMemo(
        () => trips.filter((t) => ['completed', 'delayed'].includes(t.status)),
        [trips]
    );

    // Unique trucks present in trips (for the filter dropdown)
    const tripsUniqueTrucks = useMemo(() => {
        const seen = new Map();
        trips.forEach((t) => {
            const id = t.truckId?._id || t.truckId || t.registrationNumber;
            if (id && !seen.has(id)) seen.set(id, tripTruckLabel(t));
        });
        return Array.from(seen.entries()).map(([id, label]) => ({ id, label }));
    }, [trips]);

    // Apply filters to whichever tab is active
    const taFilteredTrips = useMemo(() => {
        const base = taTab === 'active' ? taActiveTrips : taPastTrips;
        return base.filter((trip) => {
            if (taStatusFilter !== 'all' && trip.status !== taStatusFilter) return false;
            if (taTruckFilter !== 'all') {
                const truckKey = trip.truckId?._id || trip.truckId || trip.registrationNumber;
                if (String(truckKey) !== taTruckFilter) return false;
            }
            if (taDriverFilter !== 'all') {
                const dId = trip.driverId?._id || trip.driverId;
                if (String(dId) !== taDriverFilter) return false;
            }
            if (taSearch) {
                const q = taSearch.toLowerCase();
                const inRoute = `${trip.source} ${trip.destination}`.toLowerCase().includes(q);
                const inTruck = tripTruckLabel(trip).toLowerCase().includes(q);
                const inDriver = (trip.driverId?.fullName || trip.driverId?.username || '').toLowerCase().includes(q);
                if (!inRoute && !inTruck && !inDriver) return false;
            }
            return true;
        });
    }, [taTab, taActiveTrips, taPastTrips, taStatusFilter, taTruckFilter, taDriverFilter, taSearch]);

    const filteredTripsForSalary = useMemo(() => {
        let filtered = trips || [];

        // 1. Apply search filters
        if (tripSearchFilters.dateFrom) {
            const fromDate = new Date(tripSearchFilters.dateFrom);
            filtered = filtered.filter((r) => new Date(r.tripStartTime || r.createdAt) >= fromDate);
        }

        if (tripSearchFilters.dateTo) {
            const toDate = new Date(tripSearchFilters.dateTo);
            toDate.setHours(23, 59, 59, 999);
            filtered = filtered.filter((r) => new Date(r.tripStartTime || r.createdAt) <= toDate);
        }

        if (tripSearchFilters.source) {
            const sourceNorm = tripSearchFilters.source.trim().toLowerCase();
            filtered = filtered.filter((r) => (r.source || '').toLowerCase().includes(sourceNorm));
        }

        if (tripSearchFilters.destination) {
            const destNorm = tripSearchFilters.destination.trim().toLowerCase();
            filtered = filtered.filter((r) => (r.destination || '').toLowerCase().includes(destNorm));
        }

        if (tripSearchFilters.driverId) {
            filtered = filtered.filter((r) => (r.driverId?._id || r.driverId) === tripSearchFilters.driverId);
        }

        // Only show trips with BOTH driver and assistant assigned
        filtered = filtered.filter((r) => (r.driverId?._id || r.driverId) && (r.assistantId?._id || r.assistantId));

        return filtered;
    }, [trips, tripSearchFilters]);

    const rowsByTruck = useMemo(() => {
        const map = new Map();
        fleetData.forEach((row) => {
            const truckId = row.truck_id || getFirstValue(row, ['truck_id', 'TruckID', 'truckId', 'vehicle_id']) || 'UNKNOWN';
            if (!map.has(truckId)) map.set(truckId, []);
            map.get(truckId).push(row);
        });
        return map;
    }, [fleetData]);

    const activeTruckIds = useMemo(() => {
        return Array.from(rowsByTruck.entries())
            .filter(([, rows]) => {
                const latest = [...rows]
                    .map((r) => ({ row: r, dt: getRowDate(r) }))
                    .filter((r) => r.dt)
                    .sort((a, b) => b.dt - a.dt)[0];
                return latest ? isRunningStatus(latest.row) : false;
            })
            .map(([truckId]) => truckId);
    }, [rowsByTruck]);

    const maintenanceDueDetails = useMemo(() => {
        const today = new Date();
        const oneDay = 24 * 60 * 60 * 1000;

        return Array.from(rowsByTruck.entries()).map(([truckId, rows]) => {
            const withDates = rows
                .map((row) => ({ row, dt: getRowDate(row) }))
                .filter((r) => r.dt)
                .sort((a, b) => a.dt - b.dt);

            const lastActiveDate = withDates.length ? withDates[withDates.length - 1].dt : null;
            const daysSinceActive = lastActiveDate ? Math.floor((today - lastActiveDate) / oneDay) : Number.POSITIVE_INFINITY;

            const lastServiceDate = withDates
                .map((r) => toDateSafe(getFirstValue(r.row, ['LastServiceDate', 'last_service_date', 'ServiceDate', 'service_date', 'lastServiceDate'])))
                .filter((d) => d)
                .sort((a, b) => b - a)[0] || null;

            const rowsSinceService = lastServiceDate
                ? withDates.filter((r) => r.dt >= lastServiceDate).map((r) => r.row)
                : rows;
            const distanceSinceService = rowsSinceService.reduce((sum, row) => sum + getDistance(row), 0);

            const needsMaintenance = daysSinceActive >= 60 || distanceSinceService > 10000;
            return {
                truckId,
                lastActiveDate,
                daysSinceActive: Number.isFinite(daysSinceActive) ? daysSinceActive : null,
                distanceSinceService,
                needsMaintenance,
            };
        }).filter((row) => row.needsMaintenance)
            .sort((a, b) => (b.daysSinceActive || 0) - (a.daysSinceActive || 0));
    }, [rowsByTruck]);

    const todayDaily = useMemo(() => {
        const todayKey = new Date().toISOString().slice(0, 10);
        const todayRows = fleetData.filter((row) => {
            const dt = getRowDate(row);
            return dt ? dt.toISOString().slice(0, 10) === todayKey : false;
        });
        return {
            trips: todayRows.length,
            totalDistanceKm: todayRows.reduce((sum, row) => sum + getDistance(row), 0),
            totalFuelUsed: todayRows.reduce((sum, row) => sum + getFuel(row), 0),
            totalCostRs: todayRows.reduce((sum, row) => sum + getCost(row), 0),
        };
    }, [fleetData]);

    const monthlySummary = useMemo(() => {
        const now = new Date();
        const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const monthRows = fleetData.filter((row) => {
            const dt = getRowDate(row);
            return dt ? dt.toISOString().slice(0, 7) === monthKey : false;
        });
        return {
            monthKey,
            trips: monthRows.length,
            totalDistanceKm: monthRows.reduce((sum, row) => sum + getDistance(row), 0),
            totalFuelUsed: monthRows.reduce((sum, row) => sum + getFuel(row), 0),
            totalCostRs: monthRows.reduce((sum, row) => sum + getCost(row), 0),
        };
    }, [fleetData]);

    const placesTravelledRows = useMemo(() => {
        return fleetData
            .map((row, idx) => ({
                id: `${row.truck_id || 'UNK'}-${idx}`,
                truckId: row.truck_id || 'UNKNOWN',
                source: getFirstValue(row, ['Source', 'source', 'From', 'from', 'Origin', 'origin']) || '—',
                destination: getFirstValue(row, ['Destination', 'destination', 'To', 'to']) || '—',
                distance: getDistance(row),
                fuelEst: toNum(getFirstValue(row, ['FuelEst', 'fuel_est', 'Fuel_Est', 'estimatedFuel'])),
                fuelLive: toNum(getFirstValue(row, ['FuelLive', 'fuel_live', 'Fuel_Live', 'liveFuel'])),
                timeEst: toNum(getFirstValue(row, ['TimeEst', 'time_est', 'Time_Est', 'estimatedTime'])),
                timeLive: toNum(getFirstValue(row, ['TimeLive', 'time_live', 'Time_Live', 'liveTime'])),
                costEst: toNum(getFirstValue(row, ['CostEst', 'cost_est', 'Cost_Est', 'estimatedCost'])),
                costLive: toNum(getFirstValue(row, ['CostLive', 'cost_live', 'Cost_Live', 'liveCost'])),
                status: getFirstValue(row, ['Status', 'status']) || 'Unknown',
            }))
            .slice(0, 30);
    }, [fleetData]);

    const liveTrackingRows = useMemo(() => {
        return Array.from(rowsByTruck.entries()).map(([truckId, rows]) => {
            const latest = [...rows]
                .map((r) => ({ row: r, dt: getRowDate(r) }))
                .filter((r) => r.dt)
                .sort((a, b) => b.dt - a.dt)[0];
            if (!latest || !isRunningStatus(latest.row)) return null;

            return {
                truckId,
                speed: getSpeed(latest.row),
                fuelPercent: getFuelPercent(latest.row),
                status: String(getFirstValue(latest.row, ['Status', 'status', 'Ignition', 'ignitionStatus']) || 'Running'),
                lastSeen: latest.dt,
            };
        }).filter(Boolean).sort((a, b) => b.lastSeen - a.lastSeen);
    }, [rowsByTruck]);

    const loadMonthlySyncStatus = async () => {
        try {
            // Trucks are already loaded by refreshAll; no need to re-fetch them here.
            const [statusRes, historyRes] = await Promise.allSettled([
                adminSyncAPI.getIAlertSyncStatus(),
                adminSyncAPI.getIAlertSyncHistory(100),
            ]);
            if (statusRes.status === 'fulfilled') {
                setMonthlySyncStatus(statusRes.value.data || null);
                setMonthlySyncSummary(statusRes.value.data?.state?.lastSummary || null);
            }
            if (historyRes.status === 'fulfilled') {
                const logs = Array.isArray(historyRes.value.data) ? historyRes.value.data : [];
                setSyncHistory(logs);
                // Auto-expand the most recent month
                if (logs.length > 0) {
                    const latest = new Date(logs[0].startedAt);
                    const key = `${latest.getFullYear()}-${String(latest.getMonth() + 1).padStart(2, '0')}`;
                    setExpandedHistoryMonths({ [key]: true });
                }
            }
        } catch (err) {
            console.error('Failed to load sync status', err);
        }
    };

    const getTruckRegFromRow = (row) => {
        return getFirstValue(row, [
            'registrationNumber', 'RegistrationNumber',
            'truck_id', 'TruckID', 'truckId', 'vehicle_id', 'VehicleID',
            'numberPlate', 'NumberPlate', 'licensePlate', 'LicensePlate', 'license_plate',
            'reg_no', 'RegNo', 'regNo', 'vehicleNumber', 'Vehicle Number',
        ]);
    };

    const getTruckTokens = (truck) => {
        const out = [];
        const reg = normalizeReg(truck.truckId);
        const plate = normalizeReg(truck.licensePlate);
        if (reg) out.push(reg);
        if (plate) out.push(plate);
        return out;
    };

    const onMonthlyTruckFilePick = (file) => {
        if (!file) {
            setMonthlyUploadFile(null);
            setMonthlyTruckUploadError('');
            return;
        }
        const name = String(file.name || '').toLowerCase();
        if (!name.endsWith('.xlsx')) {
            setMonthlyTruckUploadError('Please choose a valid .xlsx file only.');
            setMonthlyUploadFile(null);
            return;
        }
        setMonthlyUploadFile(file);
        setMonthlyTruckUploadError('');
    };

    const onMonthlyTruckUpload = async () => {
        if (!monthlyUploadFile) {
            setMonthlyTruckUploadError('Please choose an .xlsx file first.');
            return;
        }
        if (monthlyUploadTruckIds.length === 0) {
            setMonthlyTruckUploadError('Select at least one truck to update.');
            return;
        }

        const existingForMonth = syncHistory.some((log) => {
            const name = String(log?.meta?.originalFileName || '');
            return name.includes('[TRUCK-MONTHLY]') && name.includes(`[MONTH:${monthlyUploadMonth}]`);
        });
        if (existingForMonth) {
            const ok = window.confirm(`A truck-specific update already exists for ${monthlyUploadMonth}. Continue and replace with this upload?`);
            if (!ok) return;
        }

        setMonthlyTruckUploadBusy(true);
        setMonthlyTruckUploadError('');
        try {
            const arrayBuffer = await monthlyUploadFile.arrayBuffer();
            const workbook = XLSX.read(arrayBuffer, { type: 'array' });
            const firstSheetName = workbook.SheetNames?.[0];
            if (!firstSheetName) throw new Error('No worksheet found in the uploaded XLSX file.');

            const worksheet = workbook.Sheets[firstSheetName];
            const rows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
            if (!Array.isArray(rows) || rows.length === 0) {
                throw new Error('Uploaded XLSX file appears empty.');
            }

            const selectedTrucks = trucks.filter((t) => monthlyUploadTruckIds.includes(t._id));
            const selectedTokenSet = new Set();
            selectedTrucks.forEach((t) => getTruckTokens(t).forEach((k) => selectedTokenSet.add(k)));

            const filteredRows = rows.filter((row) => {
                const token = normalizeReg(getTruckRegFromRow(row));
                return token && selectedTokenSet.has(token);
            });

            if (filteredRows.length === 0) {
                throw new Error('No rows matched the selected trucks. Check truck IDs/number plates in the XLSX.');
            }

            const filteredSheet = XLSX.utils.json_to_sheet(filteredRows);
            const csvText = XLSX.utils.sheet_to_csv(filteredSheet, { blankrows: false });
            const csvBlob = new Blob([csvText], { type: 'text/csv' });
            const fileName = `[TRUCK-MONTHLY][MONTH:${monthlyUploadMonth}]_trucks-${selectedTrucks.length}_rows-${filteredRows.length}.csv`;
            const csvFile = new File([csvBlob], fileName, { type: 'text/csv' });

            const fd = new FormData();
            fd.append('file', csvFile);

            const res = await adminSyncAPI.uploadRootCsv(fd);
            setMonthlySyncSummary(res.data?.result?.summary || null);
            setMessage(`Monthly update completed for ${selectedTrucks.length} truck(s) and ${fmtNum(filteredRows.length)} row(s).`);
            if (monthlyUploadRef.current) monthlyUploadRef.current.value = '';
            setMonthlyUploadFile(null);
            await loadMonthlySyncStatus();
        } catch (error) {
            setMonthlyTruckUploadError('Failed to process/upload XLSX: ' + (error.response?.data?.message || error.message));
        } finally {
            setMonthlyTruckUploadBusy(false);
        }
    };

    // ── Create Truck ────────────────────────────────────────────────────
    const createTruck = async (e) => {
        e.preventDefault();
        try {
            setSaving(true);
            setMessage('');

            const normalizeDateInput = (val) => {
                if (!val) return '';
                const raw = String(val).trim();
                let m = raw.match(/^(\d{2})[-/](\d{2})[-/](\d{2,4})$/);
                if (m) {
                    const dd = m[1];
                    const mm = m[2];
                    let yyyy = Number(m[3]);
                    if (yyyy < 100) yyyy += 2000;
                    if (yyyy < 1900) yyyy += 2000;
                    return `${yyyy}-${mm}-${dd}`;
                }
                m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
                if (m) {
                    let yyyy = Number(m[1]);
                    if (yyyy < 100) yyyy += 2000;
                    if (yyyy < 1900) yyyy += 2000;
                    return `${yyyy}-${m[2]}-${m[3]}`;
                }
                return raw;
            };

            const normalizedTruckForm = {
                ...truckForm,
                registrationDate: normalizeDateInput(truckForm.registrationDate),
                insuranceExpiry: normalizeDateInput(truckForm.insuranceExpiry),
                stateTaxPaidDate: normalizeDateInput(truckForm.stateTaxPaidDate),
                centralTaxPaidDate: normalizeDateInput(truckForm.centralTaxPaidDate),
            };

            const fd = new FormData();
            // Text fields
            Object.entries(normalizedTruckForm).forEach(([k, v]) => {
                if (v !== '') fd.append(k, v);
            });
            // File fields
            if (stateTaxPermitRef.current?.files?.[0]) {
                fd.append('stateTaxPermit', stateTaxPermitRef.current.files[0]);
            }
            if (centralTaxPermitRef.current?.files?.[0]) {
                fd.append('centralTaxPermit', centralTaxPermitRef.current.files[0]);
            }
            await trucksAPI.createWithFiles(fd);
            setTruckForm(emptyTruckForm);
            if (stateTaxPermitRef.current)   stateTaxPermitRef.current.value   = '';
            if (centralTaxPermitRef.current) centralTaxPermitRef.current.value = '';
            setMessage('Lorry added successfully.');
            await refreshAll();
        } catch (err) {
            console.error('Create truck failed', err);
            setMessage('Failed to add lorry: ' + (err.response?.data?.message || err.message));
        } finally {
            setSaving(false);
        }
    };

    // ── Clear all trucks ────────────────────────────────────────────────
    const clearAllTrucks = async () => {
        if (!window.confirm('This will permanently delete ALL lorry records. Continue?')) return;
        try {
            setSaving(true);
            await trucksAPI.clearAll();
            setMessage('All lorry records erased.');
            await refreshAll();
        } catch (err) {
            setMessage('Failed to clear: ' + (err.response?.data?.message || err.message));
        } finally {
            setSaving(false);
        }
    };

    const deleteTruckById = async (truckId, label) => {
        if (!window.confirm(`Delete lorry ${label || ''} permanently?`)) return;
        try {
            setSaving(true);
            await trucksAPI.delete(truckId);
            setMessage('Lorry deleted successfully.');
            await refreshAll();
        } catch (err) {
            setMessage('Failed to delete lorry: ' + (err.response?.data?.message || err.message));
        } finally {
            setSaving(false);
        }
    };

    // ── Create Trip ─────────────────────────────────────────────────────
    const createTrip = async (e) => {
        e.preventDefault();
        try {
            setSaving(true);
            setMessage('');
            await routesAPI.plan({
                ...tripForm,
                distance:  Number(tripForm.distance  || 0),
                tollCount: Number(tripForm.tollCount  || 0),
                tollPrice: Number(tripForm.tollPrice  || 0),
                foodCost: Number(tripForm.foodCost || 0),
                tripStartTime: tripForm.tripStartTime ? new Date(tripForm.tripStartTime).toISOString() : null,
                tripEndTime:   tripForm.tripEndTime   ? new Date(tripForm.tripEndTime).toISOString()   : null,
            });
            setTripForm(emptyTripForm);
            // Keep new trips visible in Trip Assignment even if old filters were active.
            setTaTab('active');
            setTaSearch('');
            setTaTruckFilter('all');
            setTaDriverFilter('all');
            setTaStatusFilter('all');
            setMessage('Trip added successfully.');
            await refreshAll();
        } catch (err) {
            setMessage('Failed to add trip: ' + (err.response?.data?.message || err.message));
        } finally {
            setSaving(false);
        }
    };

    const setTripAssignmentField = (trip, field, value) => {
        setTripAssignmentDrafts((prev) => ({
            ...prev,
            [trip._id]: {
                driverId: trip.driverId?._id || trip.driverId || '',
                assistantId: trip.assistantId?._id || trip.assistantId || '',
                tollCount: String(trip.tollCount ?? 0),
                tollPrice: String(trip.tollPrice ?? 0),
                foodCost: String(trip.foodCost ?? 0),
                ...(prev[trip._id] || {}),
                [field]: value,
            },
        }));
    };

    const saveTripAssignment = async (trip) => {
        const draft = tripAssignmentDrafts[trip._id] || {
            driverId: trip.driverId?._id || trip.driverId || '',
            assistantId: trip.assistantId?._id || trip.assistantId || '',
            tollCount: String(trip.tollCount ?? 0),
            tollPrice: String(trip.tollPrice ?? 0),
            foodCost: String(trip.foodCost ?? 0),
        };
        if (!draft.driverId || !draft.assistantId) {
            setMessage('Each trip must have both a driver and an assistant assigned.');
            return;
        }
        try {
            setTripAssignmentSavingId(trip._id);
            setMessage('');
            await routesAPI.update(trip._id, {
                driverId: draft.driverId,
                assistantId: draft.assistantId,
                tollCount: Number(draft.tollCount || 0),
                tollPrice: Number(draft.tollPrice || 0),
                foodCost: Number(draft.foodCost || 0),
            });
            setMessage('Trip assignment and trip costs updated successfully.');
            await refreshAll();
        } catch (err) {
            setMessage('Failed to update trip assignment: ' + (err.response?.data?.message || err.message));
        } finally {
            setTripAssignmentSavingId('');
        }
    };

    const assignMissingTripCrews = async () => {
        const tripsWithoutCrew = trips.filter((trip) => !(trip.driverId && trip.assistantId));
        if (tripsWithoutCrew.length === 0) {
            setMessage('All existing trips already have driver and assistant assignments.');
            return;
        }
        if (drivers.length === 0) {
            setMessage('No drivers available for assignment.');
            return;
        }

        try {
            setTripMissingAssignSaving(true);
            setMessage('');

            const assistantPool = assistantTripCandidates.length > 0 ? assistantTripCandidates : drivers;
            let updates = 0;

            for (let i = 0; i < tripsWithoutCrew.length; i += 1) {
                const trip = tripsWithoutCrew[i];
                const assignedDriver = drivers[i % drivers.length];
                let assignedAssistant = assistantPool[(i + 1) % assistantPool.length];

                if (assistantPool.length > 1 && String(assignedAssistant?._id) === String(assignedDriver?._id)) {
                    assignedAssistant = assistantPool[(i + 2) % assistantPool.length];
                }

                await routesAPI.update(trip._id, {
                    driverId: trip.driverId?._id || trip.driverId || assignedDriver?._id,
                    assistantId: trip.assistantId?._id || trip.assistantId || assignedAssistant?._id || assignedDriver?._id,
                });
                updates += 1;
            }

            setMessage(`Assigned crew for ${updates} existing trip${updates === 1 ? '' : 's'} without complete assignment.`);
            await refreshAll();
        } catch (err) {
            setMessage('Failed to assign missing trip crews: ' + (err.response?.data?.message || err.message));
        } finally {
            setTripMissingAssignSaving(false);
        }
    };

    const assignTripsForAllDrivers = async () => {
        if (trips.length === 0) {
            setMessage('No trips found to assign.');
            return;
        }
        if (drivers.length === 0) {
            setMessage('No drivers available for assignment.');
            return;
        }

        try {
            setTripDriverSpreadSaving(true);
            setMessage('');

            const assistantPool = assistantTripCandidates.length > 0 ? assistantTripCandidates : drivers;
            let updates = 0;

            for (let i = 0; i < trips.length; i += 1) {
                const trip = trips[i];
                const assignedDriver = drivers[i % drivers.length];
                let assignedAssistant = assistantPool[(i + 1) % assistantPool.length];

                if (assistantPool.length > 1 && String(assignedAssistant?._id) === String(assignedDriver?._id)) {
                    assignedAssistant = assistantPool[(i + 2) % assistantPool.length];
                }

                await routesAPI.update(trip._id, {
                    driverId: assignedDriver?._id,
                    assistantId: assignedAssistant?._id || assignedDriver?._id,
                });
                updates += 1;
            }

            setMessage(`Trips assigned across all drivers for ${updates} trip${updates === 1 ? '' : 's'}.`);
            await refreshAll();
        } catch (err) {
            setMessage('Failed to assign trips across all drivers: ' + (err.response?.data?.message || err.message));
        } finally {
            setTripDriverSpreadSaving(false);
        }
    };

    // ── Create User ─────────────────────────────────────────────────────
    const createUser = async (e, role) => {
        e.preventDefault();
        try {
            setSaving(true);
            setMessage('');
            if (!userForm.phone?.trim()) {
                setMessage('Phone number is required for driver/assistant login.');
                return;
            }
            const fd = new FormData();
            Object.entries({ ...userForm, role, password: 'arm' }).forEach(([k, v]) => {
                if (v !== '' && v !== null && v !== undefined) fd.append(k, v);
            });
            if (userPhotoRef.current?.files?.[0]) {
                fd.append('photo', userPhotoRef.current.files[0]);
            }
            await authAPI.adminCreateUserWithPhoto(fd);
            setUserForm(emptyUserForm);
            if (userPhotoRef.current) userPhotoRef.current.value = '';
            setMessage(`${role === 'assistant' ? 'Assistant' : 'Driver'} added successfully. Login password is fixed as "arm".`);
            await refreshAll();
        } catch (err) {
            setMessage('Failed to add user: ' + (err.response?.data?.message || err.message));
        } finally {
            setSaving(false);
        }
    };

    // Compute age from date of birth
    const calcAge = (dob) => {
        if (!dob) return null;
        const diff = Date.now() - new Date(dob).getTime();
        return Math.floor(diff / (365.25 * 24 * 3600 * 1000));
    };

    // ── Field helpers ───────────────────────────────────────────────────
    const tf = (field) => ({
        value: truckForm[field],
        onChange: (e) => setTruckForm((p) => ({ ...p, [field]: e.target.value })),
    });

    // ── UI helpers ──────────────────────────────────────────────────────
    const inputCls = 'w-full px-3 py-2.5 border border-gray-200 rounded-lg text-base caret-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-500';
    const statusColor = (s) => ({
        active:      'bg-green-100 text-green-700',
        inactive:    'bg-gray-100 text-gray-600',
        maintenance: 'bg-yellow-100 text-yellow-700',
    }[s] || 'bg-gray-100 text-gray-600');

    const peopleCard = (title, people) => {
        const accent = title === 'Drivers' ? 'blue' : title === 'Assistants' ? 'purple' : 'gray';
        return (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col h-full">
                <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                    <p className="text-base font-black text-gray-800">{title}</p>
                    <span className="text-xs font-bold bg-white border border-gray-200 text-gray-600 px-2.5 py-1 rounded-full shadow-sm">
                        {people.length} Records
                    </span>
                </div>
                <div className="p-4 space-y-3 max-h-[500px] overflow-auto flex-1 bg-gray-50/20">
                    {people.length === 0
                        ? <p className="text-sm text-gray-400 text-center py-10">No {title.toLowerCase()} records found.</p>
                        : people.map((p) => <PersonCard key={p._id} person={p} accent={accent} />)}
                </div>
            </div>
        );
    };

    // Person detail card (used in directory + inline lists)
    const PersonCard = ({ person: p, accent }) => {
        const ringColor = { blue: 'bg-blue-600', purple: 'bg-indigo-600', gray: 'bg-gray-500' }[accent] || 'bg-gray-500';
        const age = calcAge(p.dateOfBirth);
        const assignedTrips = assignedTripsForUser(p);
        const assignedEarnings = assignedEarningsForUser(p);
        return (
            <div
                className="bg-white border border-gray-100 rounded-xl p-5 cursor-pointer hover:shadow-xl hover:border-blue-200 hover:-translate-y-1 transition-all group"
                onClick={() => navigate(`/people/${p._id}`)}
            >
                <div className="flex items-start gap-4">
                    {/* Avatar / photo */}
                    {p.photoPath ? (
                        <img
                            src={`/api/${p.photoPath}`}
                            alt={p.fullName || p.username}
                            className="w-16 h-16 rounded-2xl object-cover shrink-0 border-2 border-white shadow-md group-hover:scale-105 transition-transform"
                        />
                    ) : (
                        <div className={`w-16 h-16 rounded-2xl ${ringColor} flex items-center justify-center text-white font-black text-2xl shrink-0 shadow-lg`}>
                            {(p.fullName || p.username)?.[0]?.toUpperCase()}
                        </div>
                    )}
                    <div className="flex-1 min-w-0 pt-0.5">
                        <p className="text-base font-black text-gray-900 leading-tight group-hover:text-blue-600 transition-colors uppercase tracking-tight">{p.fullName || p.username}</p>
                        <p className="text-xs font-medium text-gray-400 mt-0.5 truncate">{p.email || 'No email provided'}</p>
                        {(age !== null) && (
                            <div className="flex items-center gap-2 mt-2">
                                <span className="text-[11px] font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded">Age {age} yrs</span>
                                {p.experienceYears > 0 && (
                                    <span className="text-[11px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">{p.experienceYears} yrs exp</span>
                                )}
                            </div>
                        )}
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-widest bg-gray-100 text-gray-500 px-2.5 py-1 rounded-lg border border-gray-200 shrink-0 self-start group-hover:bg-blue-50 group-hover:text-blue-700 group-hover:border-blue-100 transition-colors">{p.role}</span>
                </div>
                
                {/* Detail rows */}
                <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4">
                    {p.phone && (
                        <div className="col-span-1">
                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">Phone</p>
                            <p className="text-sm font-black text-gray-800">{p.phone}</p>
                        </div>
                    )}
                    {p.driverLicenceNumber && (
                        <div>
                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">Licence</p>
                            <p className="text-sm font-black text-gray-800 break-all">{p.driverLicenceNumber}</p>
                        </div>
                    )}
                    {p.dateOfBirth && (
                        <div>
                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">Date of Birth</p>
                            <p className="text-sm font-bold text-gray-700">{fmtDate(p.dateOfBirth)}</p>
                        </div>
                    )}
                    <div>
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">Trip Earnings (Paid)</p>
                        <p className="text-sm font-black text-emerald-600">Rs.{fmtNum(assignedEarnings, 0)}</p>
                    </div>
                    <div>
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">Assigned Trips</p>
                        <p className="text-sm font-black text-blue-600">{assignedTrips.length}</p>
                    </div>
                    <div>
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">Monthly Salary</p>
                        <p className="text-sm font-black text-gray-800">Rs.{fmtNum(p.monthlySalary || 0, 0)}</p>
                    </div>
                    {p.address && (
                        <div className="col-span-2 pt-2 border-t border-gray-50">
                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">Address</p>
                            <p className="text-xs font-bold text-gray-600 leading-relaxed text-safe-wrap">{p.address}</p>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    // Section header pill
    const SectionBadge = ({ color, letter, title, subtitle }) => {
        const colorMap = {
            blue:   { bg: 'bg-blue-600',   text: 'text-white', border: 'border-blue-200',   headerBg: 'bg-blue-50' },
            green:  { bg: 'bg-emerald-600', text: 'text-white', border: 'border-emerald-200', headerBg: 'bg-emerald-50' },
            orange: { bg: 'bg-orange-500',  text: 'text-white', border: 'border-orange-200', headerBg: 'bg-orange-50' },
            purple: { bg: 'bg-purple-600',  text: 'text-white', border: 'border-purple-200', headerBg: 'bg-purple-50' },
        };
        const colors = colorMap[color] || colorMap.blue;
        return (
            <div className={`flex items-center gap-3 px-4 py-3 rounded-t-xl border-b ${colors.border} ${colors.headerBg}`}>
                <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-extrabold ${colors.bg} ${colors.text} shrink-0`}>{letter}</span>
                <div>
                    <p className="text-sm font-bold text-gray-800">{title}</p>
                    {subtitle && <p className="text-[11px] text-gray-500">{subtitle}</p>}
                </div>
            </div>
        );
    };

    // ─────────────────────────────────────────────────────────────────────
    return (
        <div className="animate-fade-in">
            {/* Page header */}
            <div className="mb-5">
                <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">Admin Module</h1>
                <p className="text-sm text-gray-500 mt-0.5">Lorry registration, compliance documents, trips &amp; personnel management.</p>
            </div>

            {/* Nav bar */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-3 mb-5 flex items-center gap-2 overflow-x-auto no-scrollbar">
                {[
                    { value: 'add-trip',       label: 'Add Trip', icon: HiOutlineMap },
                    { value: 'trip-assignment', label: 'Trip Assignment', icon: HiOutlineClipboardList },
                    { value: 'add-truck',      label: 'Add Truck', icon: HiOutlineTruck },
                    { value: 'add-driver',     label: 'Add Driver', icon: HiOutlineUser },
                    { value: 'add-assistant',  label: 'Add Assistant', icon: HiOutlineUsers },
                    { value: 'add-salary',     label: 'Add Salary', icon: HiOutlineCurrencyDollar },
                    { value: 'people',         label: 'Drivers & Assistants', icon: HiOutlineUsers },
                    { value: 'monthly-report', label: 'Monthly Report', icon: HiOutlineDocumentDownload },
                ].map(({ value, label, icon: Icon }) => (
                    <button
                        key={value}
                        onClick={() => { setSection(value); setMessage(''); }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                            section === value
                                ? 'bg-blue-600 text-white shadow'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                    >
                        <span className="inline-flex items-center gap-1.5">
                            <Icon className="text-sm" />
                            {label}
                        </span>
                    </button>
                ))}
                {message && (
                    <div className="w-full mt-2 px-3 py-2 rounded-lg border text-xs font-medium bg-emerald-50 border-emerald-200 text-emerald-700">{message}</div>
                )}
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-16">
                    <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
                </div>
            ) : (
                <>
                    {/* ── Overview ──────────────────────────────────────────────── */}
                    {section === 'overview' && (
                        <div className="space-y-4">
                            {(() => {
                                const todayKey  = new Date().toISOString().slice(0, 10);
                                const monthKey  = new Date().toISOString().slice(0, 7);
                                const todayTrips  = trips.filter((r) => { const d = r.tripStartTime || r.createdAt; return d && new Date(d).toISOString().slice(0, 10) === todayKey; });
                                const monthTrips  = trips.filter((r) => { const d = r.tripStartTime || r.createdAt; return d && new Date(d).toISOString().slice(0, 7) === monthKey; });
                                const activeTrucks = trucks.filter((t) => t.status === 'active');
                                return (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                {[
                                    {
                                        label: 'Active Trucks',
                                        value: activeTrucks.length,
                                        icon: HiOutlineTruck,
                                        color: 'from-emerald-500 to-emerald-600',
                                        desc: `${trucks.length} total lorries registered`,
                                    },
                                    {
                                        label: 'Total Trips',
                                        value: trips.length,
                                        icon: HiOutlineClipboardList,
                                        color: 'from-amber-500 to-amber-600',
                                        desc: `${trips.filter(r => r.status === 'completed').length} completed`,
                                    },
                                    {
                                        label: 'Today\'s Trips',
                                        value: todayTrips.length,
                                        icon: HiOutlineMap,
                                        color: 'from-blue-500 to-blue-600',
                                        desc: `${fmtNum(todayTrips.reduce((s, r) => s + (r.distanceKm || r.distance || 0), 0))} km today`,
                                    },
                                    {
                                        label: 'Monthly Trips',
                                        value: monthTrips.length,
                                        icon: HiOutlineRefresh,
                                        color: 'from-violet-500 to-violet-600',
                                        desc: `${fmtNum(monthTrips.reduce((s, r) => s + (r.distanceKm || r.distance || 0), 0))} km this month`,
                                    },
                                ].map(({ label, value, icon: Icon, color, desc }) => (
                                    <div key={label} className="rounded-2xl overflow-hidden border border-gray-100 shadow-sm transition-all hover:shadow-md">
                                        <div className={`bg-gradient-to-r ${color} px-5 py-4 flex items-center justify-between`}>
                                            <p className="text-3xl font-black text-white">{fmtNum(value)}</p>
                                            <Icon className="text-3xl text-white opacity-80" />
                                        </div>
                                        <div className="px-5 py-3 bg-white">
                                            <p className="text-sm font-bold text-gray-800">{label}</p>
                                            <p className="text-[10px] text-gray-400 font-medium tracking-tight uppercase mt-0.5">{desc}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                                ); })()}

                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                                    <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                                        <p className="text-sm font-extrabold text-gray-800">Card 5: Places Travelled</p>
                                        <span className="text-[11px] font-semibold text-gray-500">Source to destination rows</span>
                                    </div>
                                    <div className="p-3 overflow-x-auto">
                                        <table className="w-full text-xs min-w-140">
                                            <thead>
                                                <tr className="text-left text-gray-500 border-b border-gray-100">
                                                    <th className="py-2">Truck</th>
                                                    <th className="py-2">Route</th>
                                                    <th className="py-2">Distance (km)</th>
                                                    <th className="py-2">Fuel Est/Live</th>
                                                    <th className="py-2">Time Est/Live</th>
                                                    <th className="py-2">Cost Est/Live</th>
                                                    <th className="py-2">Status</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {placesTravelledRows.map((row) => (
                                                    <tr key={row.id} className="border-b border-gray-50 text-gray-700">
                                                        <td className="py-2 font-semibold">{row.truckId}</td>
                                                        <td className="py-2">{row.source} → {row.destination}</td>
                                                        <td className="py-2">{fmtNum(row.distance)}</td>
                                                        <td className="py-2">{fmtNum(row.fuelEst)} / {fmtNum(row.fuelLive)}</td>
                                                        <td className="py-2">{fmtNum(row.timeEst)} / {fmtNum(row.timeLive)}</td>
                                                        <td className="py-2">₹{fmtNum(row.costEst)} / ₹{fmtNum(row.costLive)}</td>
                                                        <td className="py-2">{row.status}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                        {placesTravelledRows.length === 0 && (
                                            <p className="text-xs text-gray-400 text-center py-6">No data</p>
                                        )}
                                    </div>
                                </div>

                                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                                    <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                                        <p className="text-sm font-extrabold text-gray-800">Card 6: Live Tracking</p>
                                        <span className="text-[11px] font-semibold text-gray-500">Running / Ignition ON</span>
                                    </div>
                                    <div className="p-3 overflow-x-auto">
                                        <table className="w-full text-xs min-w-140">
                                            <thead>
                                                <tr className="text-left text-gray-500 border-b border-gray-100">
                                                    <th className="py-2">Truck ID</th>
                                                    <th className="py-2">Speed (km/h)</th>
                                                    <th className="py-2">Fuel %</th>
                                                    <th className="py-2">Status</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {liveTrackingRows.map((row) => (
                                                    <tr key={row.truckId} className="border-b border-gray-50 text-gray-700">
                                                        <td className="py-2 font-semibold">{row.truckId}</td>
                                                        <td className="py-2">{fmtNum(row.speed)}</td>
                                                        <td className="py-2">{fmtNum(row.fuelPercent)}</td>
                                                        <td className="py-2">
                                                            <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-100 text-emerald-700">{row.status}</span>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                        {liveTrackingRows.length === 0 && (
                                            <p className="text-xs text-gray-400 text-center py-6">No data</p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                                    <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
                                        <p className="text-sm font-extrabold text-gray-800">Card 3: Daily Analysis (Today)</p>
                                        <p className="text-[11px] text-gray-500">Trips, distance, fuel and cost</p>
                                    </div>
                                    <div className="p-4 grid grid-cols-2 gap-3 text-xs">
                                        <div className="bg-gray-50 rounded-lg p-3 border border-gray-100"><p className="text-gray-500">Total Trips Today</p><p className="text-base font-extrabold text-gray-800">{fmtNum(todayDaily.trips)}</p></div>
                                        <div className="bg-gray-50 rounded-lg p-3 border border-gray-100"><p className="text-gray-500">Distance Today</p><p className="text-base font-extrabold text-gray-800">{fmtNum(todayDaily.totalDistanceKm)} km</p></div>
                                        <div className="bg-gray-50 rounded-lg p-3 border border-gray-100"><p className="text-gray-500">Fuel Used Today</p><p className="text-base font-extrabold text-gray-800">{fmtNum(todayDaily.totalFuelUsed)}</p></div>
                                        <div className="bg-gray-50 rounded-lg p-3 border border-gray-100"><p className="text-gray-500">Cost Today</p><p className="text-base font-extrabold text-gray-800">₹{fmtNum(todayDaily.totalCostRs)}</p></div>
                                    </div>
                                </div>

                                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                                    <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
                                        <p className="text-sm font-extrabold text-gray-800">Card 4: Monthly Analysis ({fmtMonth(monthlySummary.monthKey)})</p>
                                        <p className="text-[11px] text-gray-500">Trips, distance, fuel and cost</p>
                                    </div>
                                    <div className="p-4 grid grid-cols-2 gap-3 text-xs">
                                        <div className="bg-gray-50 rounded-lg p-3 border border-gray-100"><p className="text-gray-500">Total Trips</p><p className="text-base font-extrabold text-gray-800">{fmtNum(monthlySummary.trips)}</p></div>
                                        <div className="bg-gray-50 rounded-lg p-3 border border-gray-100"><p className="text-gray-500">Distance</p><p className="text-base font-extrabold text-gray-800">{fmtNum(monthlySummary.totalDistanceKm)} km</p></div>
                                        <div className="bg-gray-50 rounded-lg p-3 border border-gray-100"><p className="text-gray-500">Fuel Used</p><p className="text-base font-extrabold text-gray-800">{fmtNum(monthlySummary.totalFuelUsed)}</p></div>
                                        <div className="bg-gray-50 rounded-lg p-3 border border-gray-100"><p className="text-gray-500">Cost</p><p className="text-base font-extrabold text-gray-800">₹{fmtNum(monthlySummary.totalCostRs)}</p></div>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white rounded-2xl border border-red-200 shadow-sm overflow-hidden">
                                <div className="px-5 py-3 bg-red-50 border-b border-red-100">
                                    <p className="text-sm font-extrabold text-red-800">Card 7: Trucks Needing Maintenance</p>
                                    <p className="text-[11px] text-red-600">Below live tracking, based on 60-day inactivity / 10000 km rule</p>
                                </div>
                                <div className="p-3 overflow-x-auto">
                                    <table className="w-full text-xs min-w-140">
                                        <thead>
                                            <tr className="text-left text-gray-500 border-b border-gray-100">
                                                <th className="py-2">Truck ID</th>
                                                <th className="py-2">Last Active Date</th>
                                                <th className="py-2">Days Since Active</th>
                                                <th className="py-2">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {maintenanceDueDetails.map((item) => (
                                                <tr key={item.truckId} className="border-b border-gray-50 text-gray-700">
                                                    <td className="py-2 font-semibold">{item.truckId}</td>
                                                    <td className="py-2">{fmtDate(item.lastActiveDate)}</td>
                                                    <td className="py-2">{item.daysSinceActive === null ? '—' : fmtNum(item.daysSinceActive)}</td>
                                                    <td className="py-2"><span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-red-100 text-red-700">Maintenance Due</span></td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    {maintenanceDueDetails.length === 0 && (
                                        <p className="text-xs text-emerald-600 text-center py-6">No data</p>
                                    )}
                                </div>
                            </div>

                            <p className="text-[11px] text-gray-500 px-1">Source: Root XLSX files • {rawDataError ? 'No data' : `Rows loaded: ${fmtNum(fleetData.length)}`}</p>
                        </div>
                    )}

                    {section === 'monthly-report' && (
                        <div className="max-w-3xl mx-auto">
                            {/* ── Mock Data Status Card ─────────────────────────────── */}
                            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                                <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                                    <div>
                                        <h3 className="text-base font-extrabold text-gray-900">Fleet Data Status</h3>
                                        <p className="text-xs text-gray-500 mt-0.5">Mock dataset is active. You can upload monthly XLSX for selected trucks only.</p>
                                    </div>
                                    <span className="text-xs font-bold px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
                                        ✅ Mock Data Active
                                    </span>
                                </div>

                                <div className="p-6 space-y-5">
                                    <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-3">
                                        <p className="text-sm font-extrabold text-blue-900">Truck-Specific Monthly XLSX Update</p>
                                        <p className="text-[11px] text-blue-700">Upload once per month for selected trucks. Existing month upload can be replaced if needed.</p>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            <div>
                                                <label className="block text-xs font-bold text-blue-900 mb-1">Month</label>
                                                <input
                                                    type="month"
                                                    value={monthlyUploadMonth}
                                                    onChange={(e) => setMonthlyUploadMonth(e.target.value)}
                                                    className="w-full border border-blue-200 rounded-lg px-3 py-2 text-sm bg-white"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-blue-900 mb-1">XLSX File</label>
                                                <input
                                                    ref={monthlyUploadRef}
                                                    type="file"
                                                    accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                                                    onChange={(e) => onMonthlyTruckFilePick(e.target.files?.[0] || null)}
                                                    className="w-full border border-blue-200 rounded-lg px-2 py-1.5 text-xs bg-white"
                                                />
                                            </div>
                                        </div>

                                        <div>
                                            <label className="block text-xs font-bold text-blue-900 mb-1">Select Trucks (specific update)</label>
                                            <div className="max-h-36 overflow-auto border border-blue-200 rounded-lg bg-white p-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                                                {trucks.length === 0 ? (
                                                    <p className="text-xs text-gray-500 px-1">No trucks loaded.</p>
                                                ) : trucks.map((t) => (
                                                    <label key={t._id} className="flex items-center gap-2 text-xs text-gray-700">
                                                        <input
                                                            type="checkbox"
                                                            checked={monthlyUploadTruckIds.includes(t._id)}
                                                            onChange={(e) => {
                                                                if (e.target.checked) {
                                                                    setMonthlyUploadTruckIds((prev) => [...prev, t._id]);
                                                                } else {
                                                                    setMonthlyUploadTruckIds((prev) => prev.filter((id) => id !== t._id));
                                                                }
                                                            }}
                                                        />
                                                        <span className="font-semibold">{t.truckId || '—'}</span>
                                                        <span className="text-gray-400">({t.licensePlate || '—'})</span>
                                                    </label>
                                                ))}
                                            </div>
                                            <p className="text-[11px] text-blue-700 mt-1">Selected: {monthlyUploadTruckIds.length} truck(s)</p>
                                        </div>

                                        <div className="flex flex-wrap items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={onMonthlyTruckUpload}
                                                disabled={monthlyTruckUploadBusy}
                                                className="px-4 py-2 text-xs font-extrabold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                                            >
                                                {monthlyTruckUploadBusy ? 'Uploading...' : 'Upload Monthly XLSX for Selected Trucks'}
                                            </button>
                                            {monthlyUploadFile && (
                                                <span className="text-xs text-gray-600">File: {monthlyUploadFile.name}</span>
                                            )}
                                        </div>

                                        {monthlyTruckUploadError && (
                                            <div className="px-3 py-2 rounded-lg text-xs font-semibold bg-red-50 border border-red-200 text-red-700">
                                                {monthlyTruckUploadError}
                                            </div>
                                        )}
                                    </div>

                                    {/* Fleet breakdown KPIs */}
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                        <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-center">
                                            <p className="text-[11px] text-emerald-700 font-bold uppercase tracking-wide">Online</p>
                                            <p className="text-3xl font-extrabold text-emerald-900 mt-1">4</p>
                                            <p className="text-[10px] text-emerald-600 mt-0.5">trucks on route</p>
                                        </div>
                                        <div className="rounded-xl border border-amber-100 bg-amber-50 p-3 text-center">
                                            <p className="text-[11px] text-amber-700 font-bold uppercase tracking-wide">Maintenance</p>
                                            <p className="text-3xl font-extrabold text-amber-900 mt-1">2</p>
                                            <p className="text-[10px] text-amber-600 mt-0.5">in service bay</p>
                                        </div>
                                        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-center">
                                            <p className="text-[11px] text-gray-600 font-bold uppercase tracking-wide">Offline</p>
                                            <p className="text-3xl font-extrabold text-gray-800 mt-1">4</p>
                                            <p className="text-[10px] text-gray-500 mt-0.5">parked at depot</p>
                                        </div>
                                        <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-center">
                                            <p className="text-[11px] text-blue-700 font-bold uppercase tracking-wide">Telemetry</p>
                                            <p className="text-3xl font-extrabold text-blue-900 mt-1">
                                                {monthlySyncSummary ? fmtNum(monthlySyncSummary.telemetryRowsUpserted ?? monthlySyncSummary.rowsAccepted) : '1,940'}
                                            </p>
                                            <p className="text-[10px] text-blue-600 mt-0.5">GPS records (30 days)</p>
                                        </div>
                                    </div>

                                    {/* Trip & analytics summary */}
                                    <div className="grid grid-cols-3 gap-3">
                                        <div className="rounded-xl border border-purple-100 bg-purple-50 p-3 text-center">
                                            <p className="text-[11px] text-purple-700 font-bold uppercase tracking-wide">Trips</p>
                                            <p className="text-2xl font-extrabold text-purple-900 mt-1">
                                                {monthlySyncSummary ? fmtNum(monthlySyncSummary.tripsUpserted) : '76'}
                                            </p>
                                        </div>
                                        <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-3 text-center">
                                            <p className="text-[11px] text-indigo-700 font-bold uppercase tracking-wide">Alerts</p>
                                            <p className="text-2xl font-extrabold text-indigo-900 mt-1">27</p>
                                        </div>
                                        <div className="rounded-xl border border-rose-100 bg-rose-50 p-3 text-center">
                                            <p className="text-[11px] text-rose-700 font-bold uppercase tracking-wide">Maintenance</p>
                                            <p className="text-2xl font-extrabold text-rose-900 mt-1">22</p>
                                        </div>
                                    </div>

                                    {/* Seed info */}
                                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-xs text-gray-600 space-y-1.5">
                                        <p><span className="font-bold text-gray-800">Data Source:</span> {monthlySyncStatus?.state?.sourceFile || 'Mock Data Seed (no file upload needed)'}</p>
                                        <p><span className="font-bold text-gray-800">Last Seeded:</span> {monthlySyncStatus?.state?.lastRunAt ? new Date(monthlySyncStatus.state.lastRunAt).toLocaleString('en-IN') : '—'}</p>
                                        <p><span className="font-bold text-gray-800">Coverage:</span> Tamil Nadu — NH 44, NH 544, NH 83, NH 48 · 30 days of GPS data</p>
                                        <p className="text-gray-400">All pages — Fleet Management, Fleet Intelligence, Maintenance, Analytics, Live Tracking — read from this seeded dataset.</p>
                                    </div>
                                </div>
                            </div>

                            {/* ── Upload History by Month (Folders) ─────────────── */}
                            {syncHistory.length > 0 && (() => {
                                // Group logs by "YYYY-MM" of startedAt
                                const grouped = {};
                                syncHistory.forEach((log) => {
                                    const d = new Date(log.startedAt);
                                    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                                    const label = d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
                                    if (!grouped[key]) grouped[key] = { key, label, entries: [] };
                                    grouped[key].entries.push(log);
                                });
                                const months = Object.values(grouped).sort((a, b) => b.key.localeCompare(a.key));

                                const statusIcon = (s) => {
                                    if (s === 'success') return '✅';
                                    if (s === 'failed')  return '❌';
                                    if (s === 'no-op')   return '⏭';
                                    if (s === 'running') return '⏳';
                                    return '❓';
                                };
                                const statusColor = (s) => {
                                    if (s === 'success') return 'text-emerald-700 bg-emerald-50 border-emerald-200';
                                    if (s === 'failed')  return 'text-red-700 bg-red-50 border-red-200';
                                    if (s === 'no-op')   return 'text-gray-500 bg-gray-50 border-gray-200';
                                    return 'text-blue-700 bg-blue-50 border-blue-200';
                                };

                                return (
                                    <div className="mt-6">
                                        <h4 className="text-sm font-extrabold text-gray-700 uppercase tracking-wide mb-3">
                                            📁 Upload History by Month
                                        </h4>
                                        <div className="space-y-3">
                                            {months.map(({ key, label, entries }) => {
                                                const isOpen = !!expandedHistoryMonths[key];
                                                return (
                                                    <div key={key} className="rounded-xl border border-gray-200 overflow-hidden">
                                                        {/* Folder header */}
                                                        <button
                                                            type="button"
                                                            onClick={() => setExpandedHistoryMonths((prev) => ({ ...prev, [key]: !prev[key] }))}
                                                            className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
                                                        >
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-lg">{isOpen ? '📂' : '📁'}</span>
                                                                <span className="font-bold text-sm text-gray-800">{label}</span>
                                                                <span className="text-xs text-gray-400 font-medium">{entries.length} upload{entries.length !== 1 ? 's' : ''}</span>
                                                            </div>
                                                            <span className="text-gray-400 text-xs">{isOpen ? '▲ Collapse' : '▼ Expand'}</span>
                                                        </button>

                                                        {/* File list */}
                                                        {isOpen && (
                                                            <div className="divide-y divide-gray-100">
                                                                {entries.map((log, idx) => {
                                                                    const origName = log.meta?.originalFileName || log.meta?.files?.[0]?.file || 'Unknown file';
                                                                    const uploadedAt = new Date(log.startedAt);
                                                                    const finishedAt = log.finishedAt ? new Date(log.finishedAt) : null;
                                                                    const rows = log.meta?.rowsAccepted;
                                                                    const trips = log.meta?.tripsUpserted;
                                                                    const trucks = log.meta?.trucksUpserted;
                                                                    return (
                                                                        <div key={log._id || idx} className="px-4 py-3 bg-white hover:bg-gray-50 transition-colors">
                                                                            <div className="flex items-start justify-between gap-3">
                                                                                <div className="flex items-center gap-2 min-w-0">
                                                                                    <span className="text-base shrink-0">📄</span>
                                                                                    <div className="min-w-0">
                                                                                        <p className="text-sm font-semibold text-gray-800 truncate">{origName}</p>
                                                                                        <p className="text-[11px] text-gray-400 mt-0.5">
                                                                                            Uploaded: {uploadedAt.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                                                            {finishedAt && ` · Finished: ${finishedAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`}
                                                                                        </p>
                                                                                    </div>
                                                                                </div>
                                                                                <span className={`shrink-0 text-xs font-bold px-2 py-0.5 rounded-full border ${statusColor(log.status)}`}>
                                                                                    {statusIcon(log.status)} {log.status}
                                                                                </span>
                                                                            </div>
                                                                            {log.status === 'success' && (rows != null || trips != null) && (
                                                                                <div className="flex gap-4 mt-2 text-[11px] text-gray-500 pl-7">
                                                                                    {rows != null && <span>📊 {fmtNum(rows)} rows</span>}
                                                                                    {trips != null && <span>🗺 {fmtNum(trips)} trips</span>}
                                                                                    {trucks != null && <span>🚚 {fmtNum(trucks)} trucks</span>}
                                                                                </div>
                                                                            )}
                                                                            {log.status === 'failed' && log.message && (
                                                                                <p className="text-[11px] text-red-500 mt-1 pl-7 truncate">{log.message}</p>
                                                                            )}
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                    )}

                    {/* ── Register Lorry ────────────────────────────────────────── */}
                    {section === 'add-truck' && (
                        <div className="max-w-5xl mx-auto">
                            {/* Card header */}
                            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                                <div className="flex items-center justify-between px-6 py-4 bg-gray-50 border-b border-gray-200">
                                    <div>
                                        <h3 className="text-base font-extrabold text-gray-900">Register New Lorry</h3>
                                        <p className="text-xs text-gray-500 mt-0.5">Driver is assigned per trip — no permanent driver on record.</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={clearAllTrucks}
                                        disabled={saving}
                                        className="px-3 py-1.5 text-xs font-bold rounded-lg border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50"
                                    >
                                        <span className="inline-flex items-center gap-1"><HiOutlineTrash /> Erase All Records</span>
                                    </button>
                                </div>

                                <form onSubmit={createTruck} className="p-6 space-y-5">

                                    {/* A: Vehicle Details */}
                                    <div className="rounded-xl border border-blue-200 overflow-hidden">
                                        <SectionBadge color="blue" letter="A" title="Vehicle Details" subtitle="Basic lorry identification and operational parameters" />
                                        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                            <Field label="Number Plate *">
                                                <input className={inputCls} placeholder="TN 24 X 1234" {...tf('licensePlate')} required />
                                                <p className="text-[10px] text-blue-500 mt-1">Vehicle ID is auto-set from number plate</p>
                                            </Field>
                                            <Field label="Date of Registration *">
                                                <input type="date" className={inputCls} {...tf('registrationDate')} required />
                                                <p className="text-[10px] text-blue-500 mt-1">FC &amp; tax dates computed from this</p>
                                            </Field>
                                            <Field label="Status">
                                                <select className={inputCls} {...tf('status')}>
                                                    <option value="active">Active</option>
                                                    <option value="inactive">Inactive</option>
                                                    <option value="maintenance">Under Maintenance</option>
                                                </select>
                                            </Field>
                                            <Field label="Mileage (km/l) *">
                                                <input type="number" min="0" step="0.01" className={inputCls} placeholder="8.5" {...tf('mileage')} required />
                                                <p className="text-[10px] text-gray-400 mt-1">CO₂ emission auto-calculated</p>
                                            </Field>
                                            <Field label="Tank Capacity (Litres) *">
                                                <input type="number" min="1" step="1" className={inputCls} placeholder="300" {...tf('tankCapacity')} required />
                                            </Field>
                                            <Field label="Diesel Cost (₹/Litre) *">
                                                <input type="number" min="0" step="0.01" className={inputCls} placeholder="96.50" {...tf('costPerLitre')} required />
                                            </Field>
                                        </div>
                                    </div>

                                    {/* B: Insurance */}
                                    <div className="rounded-xl border border-emerald-200 overflow-hidden">
                                        <SectionBadge color="green" letter="B" title="Insurance &amp; Documents" subtitle="Policy details and registration certificate" />
                                        <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                                            <Field label="Insurance Policy Number">
                                                <input className={inputCls} placeholder="INS-2024-XXXXXXXX" {...tf('insuranceNumber')} />
                                            </Field>
                                            <Field label="Insurance Expiry Date">
                                                <input type="date" className={inputCls} {...tf('insuranceExpiry')} />
                                            </Field>
                                            <Field label="RC / Tax Document Number">
                                                <input className={inputCls} placeholder="Registration Certificate No." {...tf('taxDocumentNumber')} />
                                            </Field>
                                        </div>
                                    </div>

                                    {/* C: TN State Tax */}
                                    <div className="rounded-xl border border-orange-200 overflow-hidden">
                                        <SectionBadge color="orange" letter="C" title="Tamil Nadu State Road Tax" subtitle="Paid quarterly (every 3 months) to TN Government — upload receipt as Permit" />
                                        <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                                            <Field label="Amount Paid (₹)">
                                                <input type="number" min="0" step="0.01" className={inputCls} placeholder="15000" {...tf('stateTaxAmount')} />
                                            </Field>
                                            <Field label="Date of Payment">
                                                <input type="date" className={inputCls} {...tf('stateTaxPaidDate')} />
                                                <p className="text-[10px] text-orange-500 mt-1">Next due = payment date + 3 months</p>
                                            </Field>
                                            <Field label="Upload TN State Permit (PDF/Image)">
                                                <div className="border-2 border-dashed border-orange-200 rounded-lg p-2 bg-orange-50">
                                                    <input
                                                        type="file"
                                                        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                                                        ref={stateTaxPermitRef}
                                                        className="block w-full text-xs text-gray-600 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:font-bold file:bg-orange-500 file:text-white hover:file:bg-orange-600"
                                                    />
                                                    <p className="text-[10px] text-orange-500 mt-1">Receipt from TN Transport Office</p>
                                                </div>
                                            </Field>
                                        </div>
                                    </div>

                                    {/* D: Central Tax */}
                                    <div className="rounded-xl border border-purple-200 overflow-hidden">
                                        <SectionBadge color="purple" letter="D" title="Central Government Road Tax (National Permit)" subtitle="Paid yearly to Central Government — upload receipt as National Permit" />
                                        <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                                            <Field label="Amount Paid (₹)">
                                                <input type="number" min="0" step="0.01" className={inputCls} placeholder="1500" {...tf('centralTaxAmount')} />
                                            </Field>
                                            <Field label="Date of Payment">
                                                <input type="date" className={inputCls} {...tf('centralTaxPaidDate')} />
                                                <p className="text-[10px] text-purple-500 mt-1">Next due = payment date + 1 year</p>
                                            </Field>
                                            <Field label="Upload National Permit (PDF/Image)">
                                                <div className="border-2 border-dashed border-purple-200 rounded-lg p-2 bg-purple-50">
                                                    <input
                                                        type="file"
                                                        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                                                        ref={centralTaxPermitRef}
                                                        className="block w-full text-xs text-gray-600 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:font-bold file:bg-purple-600 file:text-white hover:file:bg-purple-700"
                                                    />
                                                    <p className="text-[10px] text-purple-500 mt-1">Receipt from National Highway Authority</p>
                                                </div>
                                            </Field>
                                        </div>
                                    </div>

                                    <button
                                        disabled={saving}
                                        className="w-full py-3 text-sm font-extrabold rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white hover:from-emerald-600 hover:to-emerald-700 shadow-md disabled:opacity-60 tracking-wide"
                                    >
                                        <span className="inline-flex items-center gap-1">{saving ? 'Saving Lorry...' : <><HiOutlineSave /> Register Lorry</>}</span>
                                    </button>
                                </form>
                            </div>

                            <div className="mt-5 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                                <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                                    <div>
                                        <h3 className="text-base font-extrabold text-gray-900">All Registered Lorries</h3>
                                        <p className="text-xs text-gray-500 mt-0.5">Edit or delete any lorry from here.</p>
                                    </div>
                                    <span className="text-xs font-bold px-2 py-1 rounded-full bg-gray-100 text-gray-700">
                                        {trucks.length} total
                                    </span>
                                </div>

                                {trucks.length === 0 ? (
                                    <p className="text-xs text-gray-400 text-center py-8">No lorries found.</p>
                                ) : (
                                    <div className="divide-y divide-gray-100">
                                        {trucks.map((t) => (
                                            <div key={t._id} className="px-6 py-3 flex flex-wrap items-center justify-between gap-3 hover:bg-gray-50">
                                                <div className="min-w-0">
                                                    <p className="text-sm font-bold text-gray-800 truncate">{t.licensePlate || t.truckId || '—'}</p>
                                                    <p className="text-[11px] text-gray-500 mt-0.5">
                                                        ID: {t.truckId || '—'} · Status: {t.status || 'active'} · Mileage: {t.fuelEfficiency ?? t.mileage ?? '—'} km/l · Trips: {tripsForTruck(t).length}
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-2 shrink-0">
                                                    <button
                                                        type="button"
                                                        onClick={() => navigate(`/trucks/${t._id}`)}
                                                        className="px-3 py-1.5 text-xs font-bold rounded-lg bg-blue-600 text-white hover:bg-blue-700"
                                                    >
                                                        Edit
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => deleteTruckById(t._id, t.licensePlate || t.truckId)}
                                                        disabled={saving}
                                                        className="px-3 py-1.5 text-xs font-bold rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-60"
                                                    >
                                                        Delete
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ── Lorry Records (Card Grid) ──────────────────────────────── */}
                    {section === 'truck-list' && (
                        <div>
                            {/* Filter bar */}
                            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 mb-4 flex flex-wrap gap-3 items-center">
                                <div className="flex-1 min-w-[220px] relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"><HiOutlineSearch /></span>
                                    <input
                                        type="text"
                                        placeholder="Search by Number Plate, Insurance No…"
                                        value={truckSearch}
                                        onChange={(e) => setTruckSearch(e.target.value)}
                                        className="w-full pl-8 pr-3 py-2.5 border border-gray-200 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-blue-300"
                                    />
                                </div>
                                <select
                                    value={truckStatusFilter}
                                    onChange={(e) => setTruckStatusFilter(e.target.value)}
                                    className="px-3 py-2.5 border border-gray-200 rounded-lg text-base"
                                >
                                    <option value="all">All Status</option>
                                    <option value="active">Active</option>
                                    <option value="inactive">Inactive</option>
                                    <option value="maintenance">Under Maintenance</option>
                                </select>
                                <span className="text-xs font-semibold text-gray-500 bg-gray-100 px-3 py-1.5 rounded-lg">
                                    {filteredTrucks.length} lorry{filteredTrucks.length !== 1 ? 's' : ''}
                                </span>
                                <button
                                    onClick={() => generateAllLorriesReport(filteredTrucks)}
                                    disabled={filteredTrucks.length === 0}
                                    className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40"
                                >
                                    <HiOutlineDocumentDownload className="text-base" /> All Lorries Report
                                </button>
                            </div>

                            {filteredTrucks.length === 0 ? (
                                <div className="text-center py-16 text-sm text-gray-400">
                                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-50 text-blue-600 mb-3"><HiOutlineTruck className="text-2xl" /></div>
                                    No lorry records found. Register lorries from the <strong>Register Lorry</strong> section.
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                                    {filteredTrucks.map((t) => {
                                        const nextFc = t.fcRenewalDates?.[0];
                                        return (
                                            <div
                                                key={t._id}
                                                onClick={() => navigate(`/trucks/${t._id}`)}
                                                className="bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer overflow-hidden"
                                            >
                                                {/* Card top accent */}
                                                <div className={`h-1 w-full ${t.status === 'active' ? 'bg-green-400' : t.status === 'maintenance' ? 'bg-yellow-400' : 'bg-gray-300'}`} />

                                                <div className="p-5">
                                                    {/* Title row */}
                                                    <div className="flex items-start justify-between mb-3">
                                                        <div>
                                                            <p className="text-base font-extrabold text-gray-900 font-mono">{t.licensePlate}</p>
                                                        </div>
                                                        <div className="flex items-center gap-1.5">
                                                            <span className={`px-2.5 py-0.5 text-[11px] font-bold rounded-full capitalize ${statusColor(t.status)}`}>
                                                                {t.status}
                                                            </span>
                                                            <button
                                                                type="button"
                                                                onClick={(e) => { e.stopPropagation(); import('../services/reportGenerator').then(m => m.generateLorryReport(t, tripsForTruck(t))); }}
                                                                className="p-1 rounded text-emerald-600 hover:bg-emerald-50"
                                                                title="Download this lorry's report"
                                                            >
                                                                <HiOutlineDocumentDownload className="text-base" />
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {/* Stats grid */}
                                                    <div className="grid grid-cols-2 gap-2 mb-4">
                                                        {[
                                                            { label: 'Registered', value: fmtDate(t.registrationDate) },
                                                            { label: 'Mileage',    value: `${t.fuelEfficiency ?? '—'} km/l` },
                                                            { label: 'Tank',       value: `${t.tankCapacity ?? '—'} L` },
                                                            { label: 'Diesel',     value: `₹${t.costPerLitre ?? '—'}/l` },
                                                            { label: 'Trips',      value: `${tripsForTruck(t).length} trip${tripsForTruck(t).length !== 1 ? 's' : ''}` },
                                                        ].map(({ label, value }) => (
                                                            <div key={label} className="bg-gray-50 rounded-lg px-3 py-2">
                                                                <p className="text-[10px] text-gray-400 uppercase">{label}</p>
                                                                <p className="text-xs font-bold text-gray-800 mt-0.5">{value}</p>
                                                            </div>
                                                        ))}
                                                    </div>

                                                    {/* Compliance */}
                                                    <div className="border-t border-gray-100 pt-3 space-y-1.5">
                                                        {[
                                                            { label: 'FC Renewal',    date: nextFc },
                                                            { label: 'TN State Tax',  date: t.stateTaxNextDue },
                                                            { label: 'Central Tax',   date: t.centralTaxNextDue },
                                                        ].map(({ label, date }) => (
                                                            <div key={label} className="flex items-center justify-between text-xs">
                                                                <span className="text-gray-500">{label}</span>
                                                                {dueBadge(date) ?? <span className="text-gray-300 text-[10px]">Not set</span>}
                                                            </div>
                                                        ))}
                                                    </div>

                                                    <p className="text-[10px] text-blue-500 mt-3 text-right font-semibold inline-flex items-center gap-1">View full details <HiOutlineArrowRight /></p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Add Trip ──────────────────────────────────────────────── */}
                    {section === 'add-trip' && (
                        <div className="max-w-5xl mx-auto bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                            <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
                                <h3 className="text-base font-extrabold text-gray-900">Add Trip</h3>
                                <p className="text-xs text-gray-500 mt-0.5">Driver and assistant are assigned per trip — not permanently to any lorry.</p>
                            </div>
                            <form onSubmit={createTrip} className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                <Field label="Source *">
                                    <input className={inputCls} placeholder="e.g. Chennai" value={tripForm.source} onChange={(e) => setTripForm((p) => ({ ...p, source: e.target.value }))} required />
                                </Field>
                                <Field label="Destination *">
                                    <input className={inputCls} placeholder="e.g. Coimbatore" value={tripForm.destination} onChange={(e) => setTripForm((p) => ({ ...p, destination: e.target.value }))} required />
                                </Field>
                                <Field label="Select Lorry *">
                                    <select className={inputCls} value={tripForm.truckId} onChange={(e) => setTripForm((p) => ({ ...p, truckId: e.target.value }))} required>
                                        <option value="">-- Select Lorry --</option>
                                        {trucks.map((t) => <option key={t._id} value={t._id}>{t.licensePlate}</option>)}
                                    </select>
                                </Field>
                                <Field label="Assign Driver">
                                    <select className={inputCls} value={tripForm.driverId} onChange={(e) => setTripForm((p) => ({ ...p, driverId: e.target.value }))} required>
                                        <option value="">-- Assign Driver --</option>
                                        {drivers.map((d) => <option key={d._id} value={d._id}>{d.username}</option>)}
                                    </select>
                                </Field>
                                <Field label="Assign Assistant">
                                    <select className={inputCls} value={tripForm.assistantId} onChange={(e) => setTripForm((p) => ({ ...p, assistantId: e.target.value }))} required>
                                        <option value="">-- Assign Assistant (or Driver backup) --</option>
                                        {assistantTripCandidates.map((a) => (
                                            <option key={a._id} value={a._id}>
                                                {a.username} ({a.role})
                                            </option>
                                        ))}
                                    </select>
                                </Field>
                                <Field label="Distance (km)">
                                    <input type="number" min="0" step="0.1" className={inputCls} placeholder="490" value={tripForm.distance} onChange={(e) => setTripForm((p) => ({ ...p, distance: e.target.value }))} />
                                </Field>
                                <Field label="Duration">
                                    <input className={inputCls} placeholder="e.g. 8h 30m" value={tripForm.duration} onChange={(e) => setTripForm((p) => ({ ...p, duration: e.target.value }))} />
                                </Field>
                                <Field label="Status">
                                    <select className={inputCls} value={tripForm.status} onChange={(e) => setTripForm((p) => ({ ...p, status: e.target.value }))}>
                                        <option value="scheduled">Scheduled</option>
                                        <option value="in_transit">In Transit</option>
                                        <option value="completed">Completed</option>
                                        <option value="delayed">Delayed</option>
                                    </select>
                                </Field>
                                <Field label="Toll Count">
                                    <input type="number" min="0" className={inputCls} value={tripForm.tollCount} onChange={(e) => setTripForm((p) => ({ ...p, tollCount: e.target.value }))} />
                                </Field>
                                <Field label="Toll Price (₹ per booth)">
                                    <input type="number" min="0" step="0.01" className={inputCls} value={tripForm.tollPrice} onChange={(e) => setTripForm((p) => ({ ...p, tollPrice: e.target.value }))} />
                                </Field>
                                <Field label="Food Cost (₹)">
                                    <input type="number" min="0" step="0.01" className={inputCls} value={tripForm.foodCost} onChange={(e) => setTripForm((p) => ({ ...p, foodCost: e.target.value }))} />
                                </Field>
                                <Field label="Trip Start">
                                    <input type="datetime-local" className={inputCls} value={tripForm.tripStartTime} onChange={(e) => setTripForm((p) => ({ ...p, tripStartTime: e.target.value }))} />
                                </Field>
                                <Field label="Trip End">
                                    <input type="datetime-local" className={inputCls} value={tripForm.tripEndTime} onChange={(e) => setTripForm((p) => ({ ...p, tripEndTime: e.target.value }))} />
                                </Field>
                                <div className="sm:col-span-2 lg:col-span-4 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800">
                                    <p className="font-bold">Travel estimate based on selected lorry</p>
                                    <p className="mt-1">
                                        Fuel: {tripEstimates.fuelLitres.toFixed(2)} L • Time: {tripEstimates.timeHours.toFixed(2)} h •
                                        Diesel Cost: ₹{tripEstimates.fuelCost.toFixed(2)} • Total (Diesel + Toll + Food): ₹{tripEstimates.totalCost.toFixed(2)}
                                    </p>
                                </div>
                                <div className="sm:col-span-2 lg:col-span-4">
                                    <button disabled={saving} className="w-full py-3 text-sm font-extrabold rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white hover:from-emerald-600 hover:to-emerald-700 shadow-md disabled:opacity-60">
                                        {saving ? 'Saving...' : 'Add Trip'}
                                    </button>
                                </div>
                            </form>

                            {trips.length > 0 && (
                                <div className="px-6 pb-6">
                                    <div className="flex items-center justify-between mb-3">
                                        <p className="text-xs font-bold text-gray-600 uppercase tracking-wide">Recorded Trips ({trips.length})</p>
                                        <button
                                            type="button"
                                            onClick={() => generateAllTripsReport(trips)}
                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
                                        >
                                            <HiOutlineDocumentDownload className="text-base" /> All Trips Report
                                        </button>
                                    </div>
                                    <div className="space-y-2 max-h-72 overflow-auto">
                                        {trips.map((trip) => (
                                            <div key={trip._id} className="bg-gray-50 border border-gray-100 rounded-xl p-3 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-bold text-gray-900">{trip.source} → {trip.destination}</p>
                                                    <p className="text-xs text-gray-500 mt-0.5">
                                                        Lorry: {trip.truckId?.licensePlate || trip.truckId?.truckId || 'N/A'} • {trip.distance || 0} km • Est Fuel: {trip.estimated?.fuelConsumed ?? trip.fuelConsumed ?? 0} L • Est Time: {trip.estimated?.durationText || trip.duration || '-'}
                                                    </p>
                                                    <p className="text-xs text-gray-600 mt-0.5">
                                                        Assigned Driver: <span className="font-semibold text-gray-800">{trip.driverId?.fullName || trip.driverId?.username || 'Unassigned'}</span>
                                                        {' '}• Assistant: <span className="font-semibold text-gray-800">{trip.assistantId?.fullName || trip.assistantId?.username || 'Unassigned'}</span>
                                                    </p>
                                                    <p className="text-xs text-gray-500 mt-0.5">
                                                        Est Cost (Diesel/Toll/Food): ₹{trip.estimated?.fuelCost ?? trip.fuelCost ?? 0} / ₹{trip.estimated?.tollCost ?? trip.tollTotalCost ?? 0} / ₹{trip.estimated?.foodCost ?? trip.foodCost ?? 0}
                                                        {' '}• Total ₹{trip.estimated?.totalCost ?? trip.totalTripCost ?? 0}
                                                    </p>
                                                    <p className="text-xs text-blue-600 mt-0.5">
                                                        Real-time → Fuel: {trip.realtime?.fuelConsumed ?? 0} L, Time: {(trip.realtime?.durationMinutes ?? 0).toFixed(0)} min,
                                                        Cost (Diesel/Toll/Food): ₹{trip.realtime?.fuelCost ?? 0} / ₹{trip.realtime?.tollCost ?? 0} / ₹{trip.realtime?.foodCost ?? 0}
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-2 shrink-0 self-end lg:self-center">
                                                    <span className={`px-2 py-0.5 text-[11px] font-bold rounded-full ${
                                                        trip.status === 'completed' ? 'bg-green-100 text-green-700' :
                                                        trip.status === 'in_transit' ? 'bg-blue-100 text-blue-700' :
                                                        trip.status === 'delayed' ? 'bg-red-100 text-red-700' :
                                                        'bg-gray-100 text-gray-600'
                                                    }`}>{trip.status}</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => generateTripReport(trip)}
                                                        title="Download this trip's report"
                                                        className="p-1.5 rounded-lg bg-white border border-gray-200 text-emerald-600 hover:bg-emerald-50 hover:border-emerald-300"
                                                    >
                                                        <HiOutlineDocumentDownload className="text-base" />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Trip Assignment ─────────────────────────────────────── */}
                    {section === 'trip-assignment' && (
                        <div className="max-w-6xl mx-auto space-y-4">
                            {/* Header + bulk actions */}
                            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                                <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        <h3 className="text-base font-extrabold text-gray-900">Trip Assignment Module</h3>
                                        <p className="text-xs text-gray-500 mt-0.5">
                                            {taActiveTrips.length} active &nbsp;·&nbsp; {taPastTrips.length} past &nbsp;·&nbsp; {trips.length} total trips
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <button
                                            type="button"
                                            onClick={assignMissingTripCrews}
                                            disabled={tripMissingAssignSaving}
                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                                        >
                                            {tripMissingAssignSaving ? 'Assigning…' : 'Auto-assign Missing Crew'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={assignTripsForAllDrivers}
                                            disabled={tripDriverSpreadSaving}
                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60"
                                        >
                                            {tripDriverSpreadSaving ? 'Assigning…' : 'Spread Across All Drivers'}
                                        </button>
                                    </div>
                                </div>

                                {/* Filters */}
                                <div className="px-6 py-3 border-b border-gray-100 flex flex-wrap gap-2 items-center bg-white">
                                    {/* Search */}
                                    <div className="relative flex-1 min-w-40 max-w-xs">
                                        <HiOutlineSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none" />
                                        <input
                                            type="text"
                                            placeholder="Search route, truck, driver…"
                                            value={taSearch}
                                            onChange={(e) => setTaSearch(e.target.value)}
                                            className="w-full pl-7 pr-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-400"
                                        />
                                    </div>
                                    {/* Truck filter */}
                                    <select
                                        value={taTruckFilter}
                                        onChange={(e) => setTaTruckFilter(e.target.value)}
                                        className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 max-w-45"
                                    >
                                        <option value="all">All Trucks</option>
                                        {tripsUniqueTrucks.map(({ id, label }) => (
                                            <option key={id} value={id}>{label}</option>
                                        ))}
                                    </select>
                                    {/* Driver filter */}
                                    <select
                                        value={taDriverFilter}
                                        onChange={(e) => setTaDriverFilter(e.target.value)}
                                        className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 max-w-40"
                                    >
                                        <option value="all">All Drivers</option>
                                        <option value="">Unassigned</option>
                                        {drivers.map((d) => (
                                            <option key={d._id} value={d._id}>{d.fullName || d.username}</option>
                                        ))}
                                    </select>
                                    {/* Status filter */}
                                    <select
                                        value={taStatusFilter}
                                        onChange={(e) => setTaStatusFilter(e.target.value)}
                                        className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-400"
                                    >
                                        <option value="all">All Statuses</option>
                                        <option value="scheduled">Scheduled</option>
                                        <option value="in_transit">In Transit</option>
                                        <option value="completed">Completed</option>
                                        <option value="delayed">Delayed</option>
                                    </select>
                                    {/* Clear filters */}
                                    {(taSearch || taTruckFilter !== 'all' || taDriverFilter !== 'all' || taStatusFilter !== 'all') && (
                                        <button
                                            type="button"
                                            onClick={() => { setTaSearch(''); setTaTruckFilter('all'); setTaDriverFilter('all'); setTaStatusFilter('all'); }}
                                            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200"
                                        >
                                            Clear filters
                                        </button>
                                    )}
                                </div>

                                {/* Tabs */}
                                <div className="px-6 pt-3 flex gap-1 border-b border-gray-100">
                                    {[
                                        { key: 'active', label: 'Active Trips', count: taActiveTrips.length, color: 'blue' },
                                        { key: 'past',   label: 'Past Trips',   count: taPastTrips.length,  color: 'gray' },
                                    ].map(({ key, label, count, color }) => (
                                        <button
                                            key={key}
                                            type="button"
                                            onClick={() => setTaTab(key)}
                                            className={`px-4 py-2 text-xs font-bold rounded-t-lg border-b-2 transition-all ${
                                                taTab === key
                                                    ? 'border-blue-600 text-blue-700 bg-blue-50'
                                                    : 'border-transparent text-gray-500 hover:text-gray-700'
                                            }`}
                                        >
                                            {label}
                                            <span className={`ml-1.5 px-1.5 py-0.5 text-[10px] font-bold rounded-full ${taTab === key ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'}`}>
                                                {count}
                                            </span>
                                        </button>
                                    ))}
                                </div>

                                {/* Trip list */}
                                <div className="p-4">
                                    {taFilteredTrips.length === 0 ? (
                                        <p className="text-xs text-gray-400 text-center py-10">
                                            {trips.length === 0 ? 'No trips found.' : 'No trips match the current filters.'}
                                        </p>
                                    ) : (
                                        <div className="space-y-2 max-h-[62vh] overflow-auto pr-1">
                                            {taFilteredTrips.map((trip) => {
                                                const draft = tripAssignmentDrafts[trip._id] || {};
                                                const selectedDriverId    = draft.driverId    ?? (trip.driverId?._id    || trip.driverId    || '');
                                                const selectedAssistantId = draft.assistantId ?? (trip.assistantId?._id || trip.assistantId || '');
                                                const selectedTollCount   = draft.tollCount   ?? String(trip.tollCount ?? 0);
                                                const selectedTollPrice   = draft.tollPrice   ?? String(trip.tollPrice ?? 0);
                                                const selectedFoodCost    = draft.foodCost    ?? String(trip.foodCost ?? 0);
                                                const truckLabel = tripTruckLabel(trip);
                                                const statusColors = {
                                                    scheduled:  'bg-blue-100 text-blue-700',
                                                    in_transit: 'bg-amber-100 text-amber-700',
                                                    completed:  'bg-emerald-100 text-emerald-700',
                                                    delayed:    'bg-red-100 text-red-700',
                                                };
                                                return (
                                                    <div key={trip._id} className="bg-gray-50 border border-gray-100 rounded-xl p-3 flex flex-col lg:flex-row lg:items-center gap-3">
                                                        {/* Info */}
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <p className="text-sm font-bold text-gray-900 truncate">{trip.source} → {trip.destination}</p>
                                                                <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full shrink-0 ${statusColors[trip.status] || 'bg-gray-100 text-gray-600'}`}>
                                                                    {trip.status || 'scheduled'}
                                                                </span>
                                                            </div>
                                                            <p className="text-xs text-gray-500 mt-0.5">
                                                                🚛 <span className="font-semibold text-gray-700">{truckLabel}</span>
                                                                {' '}· {trip.distanceKm || trip.distance || 0} km
                                                                {trip.tripStartTime && <span> · {new Date(trip.tripStartTime).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>}
                                                            </p>
                                                            <p className="text-xs text-gray-500 mt-0.5">
                                                                Driver: <span className={`font-semibold ${trip.driverId ? 'text-gray-800' : 'text-red-500'}`}>{trip.driverId?.fullName || trip.driverId?.username || 'Unassigned'}</span>
                                                                {' '}· Asst: <span className={`font-semibold ${trip.assistantId ? 'text-gray-800' : 'text-red-500'}`}>{trip.assistantId?.fullName || trip.assistantId?.username || 'Unassigned'}</span>
                                                            </p>
                                                            <p className="text-xs text-gray-500 mt-0.5">
                                                                Current Costs: Toll ₹{fmtNum(Number(trip.tollTotalCost || ((trip.tollCount || 0) * (trip.tollPrice || 0))))} · Food ₹{fmtNum(Number(trip.foodCost || 0))}
                                                            </p>
                                                        </div>
                                                        {/* Selects */}
                                                        <div className="w-full lg:w-110 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 shrink-0">
                                                            <select
                                                                className="w-full px-2.5 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-400"
                                                                value={selectedDriverId}
                                                                onChange={(e) => setTripAssignmentField(trip, 'driverId', e.target.value)}
                                                            >
                                                                <option value="">Assign Driver</option>
                                                                {drivers.map((d) => (
                                                                    <option key={d._id} value={d._id}>{d.fullName || d.username}</option>
                                                                ))}
                                                            </select>
                                                            <select
                                                                className="w-full px-2.5 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-400"
                                                                value={selectedAssistantId}
                                                                onChange={(e) => setTripAssignmentField(trip, 'assistantId', e.target.value)}
                                                            >
                                                                <option value="">Assign Assistant</option>
                                                                {assistantTripCandidates.map((a) => (
                                                                    <option key={a._id} value={a._id}>{a.fullName || a.username} ({a.role})</option>
                                                                ))}
                                                            </select>
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                step="1"
                                                                value={selectedTollCount}
                                                                onChange={(e) => setTripAssignmentField(trip, 'tollCount', e.target.value)}
                                                                placeholder="Toll Count"
                                                                className="w-full px-2.5 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-400"
                                                            />
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                step="0.01"
                                                                value={selectedTollPrice}
                                                                onChange={(e) => setTripAssignmentField(trip, 'tollPrice', e.target.value)}
                                                                placeholder="Toll Price"
                                                                className="w-full px-2.5 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-400"
                                                            />
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                step="0.01"
                                                                value={selectedFoodCost}
                                                                onChange={(e) => setTripAssignmentField(trip, 'foodCost', e.target.value)}
                                                                placeholder="Food Cost"
                                                                className="w-full px-2.5 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-400"
                                                            />
                                                        </div>
                                                        {/* Save */}
                                                        <button
                                                            type="button"
                                                            onClick={() => saveTripAssignment(trip)}
                                                            disabled={tripAssignmentSavingId === trip._id}
                                                            className="shrink-0 self-end lg:self-center px-3 py-2 rounded-lg text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                                                        >
                                                            {tripAssignmentSavingId === trip._id ? 'Saving…' : 'Save'}
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── Add Driver ─────────────────────────────────────────────── */}
                    {section === 'add-driver' && (
                        <div className="max-w-5xl mx-auto">
                            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                                <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
                                    <h3 className="text-base font-extrabold text-gray-900">Add Driver</h3>
                                    <p className="text-xs text-gray-500 mt-0.5">Assigned per trip. Fill in all details for compliance records.</p>
                                </div>

                                <form onSubmit={(e) => createUser(e, 'driver')} className="p-6 space-y-5">

                                    {/* A: Login Credentials */}
                                    <div className="rounded-xl border border-blue-200 overflow-hidden">
                                        <SectionBadge color="blue" letter="A" title="Login Credentials" subtitle="Username and password used to access the driver app" />
                                        <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                                            <Field label="Login Username *">
                                                <input className={inputCls} placeholder="e.g. driver_rajan" value={userForm.username} onChange={(e) => setUserForm((p) => ({ ...p, username: e.target.value }))} required />
                                            </Field>
                                            <Field label="Email Address *">
                                                <input type="email" className={inputCls} placeholder="rajan@example.com" value={userForm.email} onChange={(e) => setUserForm((p) => ({ ...p, email: e.target.value }))} required />
                                            </Field>
                                            <Field label="Login Password (Fixed)">
                                                <input type="text" className={inputCls} value="arm" readOnly />
                                                <p className="text-[10px] text-blue-500 mt-1">All drivers login with common password: arm</p>
                                            </Field>
                                        </div>
                                    </div>

                                    {/* B: Personal Information */}
                                    <div className="rounded-xl border border-emerald-200 overflow-hidden">
                                        <SectionBadge color="green" letter="B" title="Personal Information" subtitle="Full name, photo, date of birth, contact details, address" />
                                        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                            <Field label="Full Name">
                                                <input className={inputCls} placeholder="e.g. Rajankumar S" value={userForm.fullName} onChange={(e) => setUserForm((p) => ({ ...p, fullName: e.target.value }))} />
                                            </Field>
                                            <Field label="Date of Birth">
                                                <input type="date" className={inputCls} value={userForm.dateOfBirth} onChange={(e) => setUserForm((p) => ({ ...p, dateOfBirth: e.target.value }))} />
                                                {userForm.dateOfBirth && (
                                                    <p className="text-[10px] text-emerald-600 mt-1">Age: {calcAge(userForm.dateOfBirth)} years</p>
                                                )}
                                            </Field>
                                            <Field label="Phone Number">
                                                <input className={inputCls} placeholder="+91 98XXXXXXXX" value={userForm.phone} onChange={(e) => setUserForm((p) => ({ ...p, phone: e.target.value }))} required />
                                            </Field>
                                            <Field label="Additional Phone">
                                                <input className={inputCls} placeholder="Alternate number" value={userForm.additionalPhone} onChange={(e) => setUserForm((p) => ({ ...p, additionalPhone: e.target.value }))} />
                                            </Field>
                                            <div className="sm:col-span-2 lg:col-span-3">
                                                <Field label="Address">
                                                    <textarea rows={2} className={inputCls} placeholder="Door No, Street, City, District, Pincode" value={userForm.address} onChange={(e) => setUserForm((p) => ({ ...p, address: e.target.value }))} />
                                                </Field>
                                            </div>
                                            <Field label="Profile Photo">
                                                <div className="border-2 border-dashed border-emerald-200 rounded-lg p-2 bg-emerald-50">
                                                    <input
                                                        type="file"
                                                        accept=".jpg,.jpeg,.png,.webp"
                                                        ref={userPhotoRef}
                                                        className="block w-full text-xs text-gray-600 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:font-bold file:bg-emerald-600 file:text-white hover:file:bg-emerald-700"
                                                    />
                                                    <p className="text-[10px] text-emerald-500 mt-1">JPG / PNG / WebP, max 5 MB</p>
                                                </div>
                                            </Field>
                                        </div>
                                    </div>

                                    {/* C: Professional Details */}
                                    <div className="rounded-xl border border-orange-200 overflow-hidden">
                                        <SectionBadge color="orange" letter="C" title="Professional Details" subtitle="Driving licence, Aadhaar number, experience" />
                                        <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                                            <Field label="Driving Licence Number">
                                                <input className={inputCls} placeholder="TN-2415-XXXXXXXX" value={userForm.driverLicenceNumber} onChange={(e) => setUserForm((p) => ({ ...p, driverLicenceNumber: e.target.value }))} />
                                                <p className="text-[10px] text-orange-500 mt-1">As per RTO-issued licence card</p>
                                            </Field>
                                            <Field label="Aadhaar Number">
                                                <input className={inputCls} placeholder="XXXX XXXX XXXX" maxLength={14} value={userForm.aadharNumber} onChange={(e) => setUserForm((p) => ({ ...p, aadharNumber: e.target.value }))} />
                                                <p className="text-[10px] text-orange-500 mt-1">12-digit UIDAI Aadhaar</p>
                                            </Field>
                                            <Field label="Driving Experience (Years)">
                                                <input type="number" min="0" max="60" step="1" className={inputCls} placeholder="e.g. 8" value={userForm.experienceYears} onChange={(e) => setUserForm((p) => ({ ...p, experienceYears: e.target.value }))} />
                                            </Field>
                                            <Field label="Monthly Salary (Rs)">
                                                <input type="number" min="0" step="1" className={inputCls} placeholder="e.g. 25000" value={userForm.monthlySalary} onChange={(e) => setUserForm((p) => ({ ...p, monthlySalary: e.target.value }))} />
                                            </Field>
                                        </div>
                                    </div>

                                    <button
                                        disabled={saving}
                                        className="w-full py-3 text-sm font-extrabold rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 text-white hover:from-blue-600 hover:to-blue-700 shadow-md disabled:opacity-60 tracking-wide"
                                    >
                                        {saving ? 'Saving...' : 'Add Driver'}
                                    </button>
                                </form>
                            </div>

                            {/* Driver list below form */}
                            {drivers.length > 0 && (
                                <div className="mt-5">
                                    <p className="text-xs font-bold text-gray-600 uppercase tracking-wide mb-3">Registered Drivers ({drivers.length})</p>
                                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                                        {drivers.map((d) => <PersonCard key={d._id} person={d} accent="blue" />)}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Add Assistant ──────────────────────────────────────────── */}
                    {section === 'add-assistant' && (
                        <div className="max-w-5xl mx-auto">
                            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                                <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
                                    <h3 className="text-base font-extrabold text-gray-900">Add Assistant</h3>
                                    <p className="text-xs text-gray-500 mt-0.5">Assigned per trip. Fill in all details for compliance records.</p>
                                </div>

                                <form onSubmit={(e) => createUser(e, 'assistant')} className="p-6 space-y-5">

                                    {/* A: Login Credentials */}
                                    <div className="rounded-xl border border-purple-200 overflow-hidden">
                                        <SectionBadge color="purple" letter="A" title="Login Credentials" subtitle="Username and password used to access the assistant app" />
                                        <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                                            <Field label="Login Username *">
                                                <input className={inputCls} placeholder="e.g. assistant_kumar" value={userForm.username} onChange={(e) => setUserForm((p) => ({ ...p, username: e.target.value }))} required />
                                            </Field>
                                            <Field label="Email Address *">
                                                <input type="email" className={inputCls} placeholder="kumar@example.com" value={userForm.email} onChange={(e) => setUserForm((p) => ({ ...p, email: e.target.value }))} required />
                                            </Field>
                                            <Field label="Login Password (Fixed)">
                                                <input type="text" className={inputCls} value="arm" readOnly />
                                                <p className="text-[10px] text-purple-500 mt-1">All assistants login with common password: arm</p>
                                            </Field>
                                        </div>
                                    </div>

                                    {/* B: Personal Information */}
                                    <div className="rounded-xl border border-blue-200 overflow-hidden">
                                        <SectionBadge color="blue" letter="B" title="Personal Information" subtitle="Full name, photo, date of birth, contact details, address" />
                                        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                            <Field label="Full Name">
                                                <input className={inputCls} placeholder="e.g. Kumaran T" value={userForm.fullName} onChange={(e) => setUserForm((p) => ({ ...p, fullName: e.target.value }))} />
                                            </Field>
                                            <Field label="Date of Birth">
                                                <input type="date" className={inputCls} value={userForm.dateOfBirth} onChange={(e) => setUserForm((p) => ({ ...p, dateOfBirth: e.target.value }))} />
                                                {userForm.dateOfBirth && (
                                                    <p className="text-[10px] text-blue-600 mt-1">Age: {calcAge(userForm.dateOfBirth)} years</p>
                                                )}
                                            </Field>
                                            <Field label="Phone Number">
                                                <input className={inputCls} placeholder="+91 98XXXXXXXX" value={userForm.phone} onChange={(e) => setUserForm((p) => ({ ...p, phone: e.target.value }))} required />
                                            </Field>
                                            <Field label="Additional Phone">
                                                <input className={inputCls} placeholder="Alternate number" value={userForm.additionalPhone} onChange={(e) => setUserForm((p) => ({ ...p, additionalPhone: e.target.value }))} />
                                            </Field>
                                            <div className="sm:col-span-2 lg:col-span-3">
                                                <Field label="Address">
                                                    <textarea rows={2} className={inputCls} placeholder="Door No, Street, City, District, Pincode" value={userForm.address} onChange={(e) => setUserForm((p) => ({ ...p, address: e.target.value }))} />
                                                </Field>
                                            </div>
                                            <Field label="Profile Photo">
                                                <div className="border-2 border-dashed border-blue-200 rounded-lg p-2 bg-blue-50">
                                                    <input
                                                        type="file"
                                                        accept=".jpg,.jpeg,.png,.webp"
                                                        ref={userPhotoRef}
                                                        className="block w-full text-xs text-gray-600 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:font-bold file:bg-blue-600 file:text-white hover:file:bg-blue-700"
                                                    />
                                                    <p className="text-[10px] text-blue-500 mt-1">JPG / PNG / WebP, max 5 MB</p>
                                                </div>
                                            </Field>
                                        </div>
                                    </div>

                                    {/* C: Professional Details */}
                                    <div className="rounded-xl border border-orange-200 overflow-hidden">
                                        <SectionBadge color="orange" letter="C" title="Professional Details" subtitle="Aadhaar number and experience" />
                                        <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                                            <Field label="Aadhaar Number">
                                                <input className={inputCls} placeholder="XXXX XXXX XXXX" maxLength={14} value={userForm.aadharNumber} onChange={(e) => setUserForm((p) => ({ ...p, aadharNumber: e.target.value }))} />
                                                <p className="text-[10px] text-orange-500 mt-1">12-digit UIDAI Aadhaar</p>
                                            </Field>
                                            <Field label="Experience (Years)">
                                                <input type="number" min="0" max="60" step="1" className={inputCls} placeholder="e.g. 3" value={userForm.experienceYears} onChange={(e) => setUserForm((p) => ({ ...p, experienceYears: e.target.value }))} />
                                            </Field>
                                            <Field label="Monthly Salary (Rs)">
                                                <input type="number" min="0" step="1" className={inputCls} placeholder="e.g. 18000" value={userForm.monthlySalary} onChange={(e) => setUserForm((p) => ({ ...p, monthlySalary: e.target.value }))} />
                                            </Field>
                                        </div>
                                    </div>

                                    <button
                                        disabled={saving}
                                        className="w-full py-3 text-sm font-extrabold rounded-xl bg-gradient-to-r from-purple-500 to-purple-600 text-white hover:from-purple-600 hover:to-purple-700 shadow-md disabled:opacity-60 tracking-wide"
                                    >
                                        {saving ? 'Saving...' : 'Add Assistant'}
                                    </button>
                                </form>
                            </div>

                            {/* Assistant list below form */}
                            {assistants.length > 0 && (
                                <div className="mt-5">
                                    <p className="text-xs font-bold text-gray-600 uppercase tracking-wide mb-3">Registered Assistants ({assistants.length})</p>
                                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                                        {assistants.map((a) => <PersonCard key={a._id} person={a} accent="purple" />)}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Add Salary ────────────────────────────────────────────── */}
                    {section === 'add-salary' && (
                        <div className="max-w-5xl mx-auto bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                            <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
                                <h3 className="text-base font-extrabold text-gray-900">Driver & Assistant Pay Assignment</h3>
                                <p className="text-xs text-gray-500 mt-0.5">Assign pay per trip. Driver gets 15%, assistant gets 4% of driver share.</p>
                            </div>

                            <div className="p-6 space-y-5">
                                {message && (
                                    <div className={`px-4 py-2 rounded-lg border text-xs font-medium ${
                                        message.includes('Error') || message.includes('Failed')
                                            ? 'bg-red-50 border-red-200 text-red-700'
                                            : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                                    }`}>
                                        {message}
                                    </div>
                                )}

                                {/* Trip Search Section */}
                                <div className="rounded-xl border border-blue-200 overflow-hidden">
                                    <SectionBadge color="blue" letter="A" title="Search & Filter Trips" subtitle="Find trips by date range, location, or driver" />
                                    <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                                        <Field label="From Date">
                                            <input
                                                type="date"
                                                className={inputCls}
                                                value={tripSearchFilters?.dateFrom || ''}
                                                onChange={(e) => {
                                                    setTripSearchFilters((p) => ({ ...p, dateFrom: e.target.value }));
                                                }}
                                            />
                                        </Field>
                                        <Field label="To Date">
                                            <input
                                                type="date"
                                                className={inputCls}
                                                value={tripSearchFilters?.dateTo || ''}
                                                onChange={(e) => {
                                                    setTripSearchFilters((p) => ({ ...p, dateTo: e.target.value }));
                                                }}
                                            />
                                        </Field>
                                        <Field label="Source Location">
                                            <input
                                                type="text"
                                                className={inputCls}
                                                placeholder="e.g. Chennai"
                                                value={tripSearchFilters?.source || ''}
                                                onChange={(e) => {
                                                    setTripSearchFilters((p) => ({ ...p, source: e.target.value }));
                                                }}
                                            />
                                        </Field>
                                        <Field label="Destination Location">
                                            <input
                                                type="text"
                                                className={inputCls}
                                                placeholder="e.g. Coimbatore"
                                                value={tripSearchFilters?.destination || ''}
                                                onChange={(e) => {
                                                    setTripSearchFilters((p) => ({ ...p, destination: e.target.value }));
                                                }}
                                            />
                                        </Field>
                                        <Field label="Driver">
                                            <select
                                                className={inputCls}
                                                value={tripSearchFilters?.driverId || ''}
                                                onChange={(e) => {
                                                    setTripSearchFilters((p) => ({ ...p, driverId: e.target.value }));
                                                }}
                                            >
                                                <option value="">All Drivers</option>
                                                {drivers.map((d) => <option key={d._id} value={d._id}>{d.username}</option>)}
                                            </select>
                                        </Field>
                                    </div>
                                </div>

                                <div className="rounded-xl border border-green-200 overflow-hidden">
                                    <SectionBadge color="green" letter="B" title="Step 1: Select This Trip" subtitle={`${filteredTripsForSalary.length} valid trip${filteredTripsForSalary.length !== 1 ? 's' : ''} found with full crew`} />
                                    <div className="p-4 max-h-60 overflow-y-auto space-y-2">
                                        {filteredTripsForSalary.length === 0 ? (
                                            <p className="text-xs text-gray-500">No trips found. Adjust your filters.</p>
                                        ) : (
                                            filteredTripsForSalary.slice(0, 20).map((trip) => (
                                                <div
                                                    key={trip._id}
                                                    onClick={() => {
                                                        setSalaryForm((p) => ({
                                                            ...p,
                                                            selectedTripId: trip._id,
                                                            driverId: trip.driverId?._id || '',
                                                            assistantId: trip.assistantId?._id || '',
                                                        }));
                                                    }}
                                                    className={`p-3 rounded-lg cursor-pointer border transition-all ${
                                                        salaryForm.selectedTripId === trip._id
                                                            ? 'border-emerald-500 bg-emerald-50'
                                                            : 'border-gray-200 bg-gray-50 hover:bg-gray-100'
                                                    }`}
                                                >
                                                    <div className="flex items-center justify-between">
                                                        <div>
                                                            <p className="text-[10px] font-bold text-gray-400 mb-1">{fmtDate(trip.tripStartTime || trip.createdAt)}</p>
                                                            <p className="text-xs font-bold text-gray-800">🚛 {tripTruckLabel(trip)} &nbsp;|&nbsp; {trip.source} → {trip.destination}</p>
                                                            <p className="text-[10px] text-gray-600 mt-1">
                                                                Driver: {trip.driverId?.fullName || trip.driverId?.username} &nbsp;·&nbsp; Asst: {trip.assistantId?.fullName || trip.assistantId?.username}
                                                            </p>
                                                        </div>
                                                        {salaryForm.selectedTripId === trip._id && (
                                                            <span className="text-xs font-bold text-emerald-600">✓ Selected</span>
                                                        )}
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>

                                {/* Salary Form */}
                                <div className="rounded-xl border border-orange-200 overflow-hidden">
                                    <SectionBadge color="orange" letter="C" title="Step 2: Enter Pay Details" subtitle="Enter total trip value to calculate shares" />
                                    <div className="p-4 space-y-4">
                                        {salaryForm.selectedTripId && (
                                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                                                <p className="text-xs font-bold text-blue-700 mb-2">Selected Trip Details</p>
                                                {(() => {
                                                    const trip = trips.find((t) => t._id === salaryForm.selectedTripId);
                                                    return trip ? (
                                                        <div className="space-y-1 text-xs text-blue-600">
                                                            <p><span className="font-bold">Route:</span> {trip.source} → {trip.destination}</p>
                                                            <p><span className="font-bold">Driver:</span> {trip.driverId?.username || 'N/A'} | <span className="font-bold">Assistant:</span> {trip.assistantId?.username || 'N/A'}</p>
                                                            <p><span className="font-bold">Date:</span> {fmtDate(trip.tripStartTime || trip.createdAt)}</p>
                                                        </div>
                                                    ) : null;
                                                })()}
                                            </div>
                                        )}
                                        
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                            <Field label="Total Amount Received (₹) *">
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="0.01"
                                                    className={inputCls}
                                                    placeholder="e.g. 5000"
                                                    value={salaryForm.totalAmountReceived || ''}
                                                    onChange={(e) => setSalaryForm((p) => ({ ...p, totalAmountReceived: e.target.value }))}
                                                    required
                                                />
                                            </Field>
                                            <Field label="Salary Date">
                                                <input
                                                    type="date"
                                                    className={inputCls}
                                                    value={salaryForm.salaryDate || new Date().toISOString().split('T')[0]}
                                                    onChange={(e) => setSalaryForm((p) => ({ ...p, salaryDate: e.target.value }))}
                                                />
                                            </Field>
                                            <Field label="Notes">
                                                <input
                                                    type="text"
                                                    className={inputCls}
                                                    placeholder="e.g. Bonus for good performance"
                                                    value={salaryForm.notes || ''}
                                                    onChange={(e) => setSalaryForm((p) => ({ ...p, notes: e.target.value }))}
                                                />
                                            </Field>
                                        </div>

                                        {/* Calculated Shares */}
                                        {salaryForm.totalAmountReceived && (
                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                                <div className="bg-gradient-to-br from-amber-50 to-amber-50 border border-amber-200 rounded-lg p-3">
                                                    <p className="text-[10px] text-amber-600 font-semibold uppercase">Total Amount</p>
                                                    <p className="text-lg font-extrabold text-amber-700 mt-1">₹ {fmtNum(Number(salaryForm.totalAmountReceived).toFixed(2))}</p>
                                                </div>
                                                <div className="bg-gradient-to-br from-emerald-50 to-emerald-50 border border-emerald-200 rounded-lg p-3">
                                                    <p className="text-[10px] text-emerald-600 font-semibold uppercase">Driver Share (15%)</p>
                                                    <p className="text-lg font-extrabold text-emerald-700 mt-1">₹ {fmtNum((Number(salaryForm.totalAmountReceived) * 0.15).toFixed(2))}</p>
                                                </div>
                                                <div className="bg-gradient-to-br from-orange-50 to-orange-50 border border-orange-200 rounded-lg p-3">
                                                    <p className="text-[10px] text-orange-600 font-semibold uppercase">Assistant (4% of driver)</p>
                                                    <p className="text-lg font-extrabold text-orange-700 mt-1">₹ {fmtNum((Number(salaryForm.totalAmountReceived) * 0.15 * 0.04).toFixed(2))}</p>
                                                </div>
                                            </div>
                                        )}

                                        <button
                                            onClick={async () => {
                                                try {
                                                    setSaving(true);
                                                    setMessage('');

                                                    if (!salaryForm.selectedTripId) {
                                                        setMessage('Error: Please select a trip');
                                                        setSaving(false);
                                                        return;
                                                    }

                                                    if (!salaryForm.totalAmountReceived || Number(salaryForm.totalAmountReceived) <= 0) {
                                                        setMessage('Error: Please enter a valid amount');
                                                        setSaving(false);
                                                        return;
                                                    }

                                                    const selectedTrip = trips.find((t) => t._id === salaryForm.selectedTripId);
                                                    if (!selectedTrip) {
                                                        setMessage('Error: Trip not found');
                                                        setSaving(false);
                                                        return;
                                                    }

                                                    const res = await salaryAPI.assignSalary({
                                                        tripId: salaryForm.selectedTripId,
                                                        driverId: selectedTrip.driverId?._id,
                                                        assistantId: selectedTrip.assistantId?._id,
                                                        totalAmountReceived: Number(salaryForm.totalAmountReceived),
                                                        salaryDate: salaryForm.salaryDate || new Date().toISOString().split('T')[0],
                                                        notes: salaryForm.notes,
                                                    });

                                                    setMessage('Salary assigned successfully!');
                                                    if (res.data?.salary) setAssignedSalaries(prev => [res.data.salary, ...prev]);
                                                    setSalaryForm({ selectedTripId: '', driverId: '', assistantId: '', totalAmountReceived: '', salaryDate: new Date().toISOString().split('T')[0], notes: '' });
                                                    setTimeout(() => setMessage(''), 5000);
                                                    refreshAll();
                                                } catch (err) {
                                                    console.error('Failed to assign salary', err);
                                                    setMessage(`Error: ${err.response?.data?.message || 'Failed to assign salary'}`);
                                                } finally {
                                                    setSaving(false);
                                                }
                                            }}
                                            disabled={saving || !salaryForm.selectedTripId || !salaryForm.totalAmountReceived}
                                            className="w-full py-3 text-sm font-extrabold rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white hover:from-emerald-600 hover:to-emerald-700 shadow-md disabled:opacity-60 tracking-wide"
                                        >
                                            {saving ? 'Assigning Salary...' : 'Assign Salary'}
                                        </button>
                                    </div>
                                </div>

                                {/* Assigned Salaries History */}
                                <div className="rounded-xl border border-blue-200 overflow-hidden">
                                    <SectionBadge color="blue" letter="D" title="Already Assigned Pay" subtitle={`Most recent ${assignedSalaries.length} records`} />
                                    <div className="p-4 max-h-80 overflow-y-auto space-y-3">
                                        {assignedSalaries.length === 0 ? (
                                            <p className="text-xs text-gray-500 italic">No salary assignments in history yet.</p>
                                        ) : assignedSalaries.map((s) => (
                                            <div key={s._id} className="p-3 bg-blue-50/50 rounded-xl border border-blue-100 flex items-center justify-between gap-4">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">{fmtDate(s.salaryDate)}</p>
                                                        <span className="w-1 h-1 rounded-full bg-blue-200" />
                                                        <p className="text-[10px] font-bold text-gray-400">Truck: {s.tripId?.truckId?.licensePlate || s.tripId?.registrationNumber || 'N/A'}</p>
                                                    </div>
                                                    <p className="text-xs font-bold text-gray-800 truncate">{s.tripId?.source} → {s.tripId?.destination}</p>
                                                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 pt-1.5 border-t border-blue-100/50">
                                                        <p className="text-[11px] text-gray-600">
                                                            <span className="font-semibold text-gray-900">Driver Share:</span> ₹{s.driverShare?.toLocaleString()}
                                                        </p>
                                                        <p className="text-[11px] text-gray-600">
                                                            <span className="font-semibold text-gray-900">Asst Share:</span> ₹{s.assistantShare?.toLocaleString()}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-[10px] text-gray-400 uppercase font-bold">Trip Value</p>
                                                    <p className="text-sm font-black text-blue-700">₹{s.totalAmountReceived?.toLocaleString()}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── People Directory ───────────────────────────────────────── */}
                    {section === 'people' && (
                        <div>
                            <div className="flex flex-wrap justify-end gap-2 mb-3">
                                <button
                                    type="button"
                                    onClick={() => generateAllDriversReport(drivers)}
                                    disabled={drivers.length === 0}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40"
                                >
                                    <HiOutlineDocumentDownload className="text-base" /> All Drivers Report
                                </button>
                                <button
                                    type="button"
                                    onClick={() => generateAllAssistantsReport(assistants)}
                                    disabled={assistants.length === 0}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-40"
                                >
                                    <HiOutlineDocumentDownload className="text-base" /> All Assistants Report
                                </button>
                                <button
                                    type="button"
                                    onClick={() => generateAllPeopleReport(users.filter(u => u.role === 'driver' || u.role === 'assistant'))}
                                    disabled={users.length === 0}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40"
                                >
                                    <HiOutlineDocumentDownload className="text-base" /> All Personnel Report
                                </button>
                            </div>
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                {peopleCard('Drivers', drivers)}
                                {peopleCard('Assistants', assistants)}
                            </div>

                            <div className="mt-5 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                                <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
                                    <h3 className="text-sm font-extrabold text-gray-800">Drivers &amp; Assistants Payroll and Cost Panel</h3>
                                    <p className="text-xs text-gray-500 mt-0.5">Trip assignment, operational trip cost and monthly salary allocation.</p>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-xs min-w-170">
                                        <thead>
                                            <tr className="text-left text-gray-500 border-b border-gray-100 bg-gray-50">
                                                <th className="py-2 px-3">Name</th>
                                                <th className="py-2 px-3">Role</th>
                                                <th className="py-2 px-3">Phone</th>
                                                <th className="py-2 px-3">Trips Assigned</th>
                                                <th className="py-2 px-3">Trip Cost Assigned</th>
                                                <th className="py-2 px-3">Monthly Salary</th>
                                                <th className="py-2 px-3">Total (Cost + Salary)</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {[...drivers, ...assistants].map((person) => {
                                                const tripCount = assignedTripsForUser(person).length;
                                                const earnings = assignedEarningsForUser(person);
                                                const salary = Number(person.monthlySalary || 0);
                                                const total = earnings + salary;
                                                return (
                                                    <tr key={person._id} className="border-b border-gray-50 text-gray-700 hover:bg-gray-50">
                                                        <td className="py-2 px-3 font-semibold">{person.fullName || person.username}</td>
                                                        <td className="py-2 px-3 capitalize">{person.role}</td>
                                                        <td className="py-2 px-3">{person.phone || '—'}</td>
                                                        <td className="py-2 px-3">{tripCount}</td>
                                                        <td className="py-2 px-3">Rs.{fmtNum(earnings, 0)}</td>
                                                        <td className="py-2 px-3">Rs.{fmtNum(salary, 0)}</td>
                                                        <td className="py-2 px-3 font-bold">Rs.{fmtNum(total, 0)}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default AdminModule;