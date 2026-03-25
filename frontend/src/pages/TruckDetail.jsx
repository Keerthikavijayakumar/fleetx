import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { routesAPI, trucksAPI, telemetryAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { HiOutlineArrowLeft, HiOutlineDocumentText, HiOutlineDocumentDownload, HiChevronDown, HiChevronUp } from 'react-icons/hi';
import { generateLorryReport } from '../services/reportGenerator';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
const fmtDate = (d) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-IN', {
        day: '2-digit', month: '2-digit', year: 'numeric',
    });
};

const fmtDateTime = (d) => {
    if (!d) return '—';
    return new Date(d).toLocaleString('en-IN', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: true,
    });
};

const daysUntil = (d) => {
    if (!d) return null;
    return Math.ceil((new Date(d) - new Date()) / 86400000);
};

const FcBadge = ({ date, label }) => {
    const days = daysUntil(date);
    let cls = 'bg-green-100 text-green-700';
    let tag = `In ${days}d`;
    if (days === null) { cls = 'bg-gray-100 text-gray-500'; tag = '—'; }
    else if (days < 0)  { cls = 'bg-red-100 text-red-700';    tag = 'Overdue'; }
    else if (days <= 30){ cls = 'bg-yellow-100 text-yellow-700'; tag = `In ${days}d`; }

    return (
        <div className={`flex items-center justify-between px-3 py-2 rounded-lg ${cls} text-xs`}>
            <span className="font-semibold">{label}</span>
            <span>{fmtDate(date)} — <strong>{tag}</strong></span>
        </div>
    );
};

const ComplianceRow = ({ label, date, amount, permitPath }) => {
    const days = daysUntil(date);
    let color = 'text-green-600';
    let status = 'On Track';
    if (days === null) { color = 'text-gray-400'; status = 'Not Set'; }
    else if (days < 0)  { color = 'text-red-600';   status = 'OVERDUE'; }
    else if (days <= 30){ color = 'text-yellow-600'; status = `Due in ${days} days`; }
    else { status = `Due in ${days} days`; }

    return (
        <div className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
            <div>
                <p className="text-sm font-semibold text-gray-800">{label}</p>
                <p className="text-xs text-gray-500">Next due: {fmtDate(date)}  {amount ? `• ₹${Number(amount).toLocaleString('en-IN')}` : ''}</p>
            </div>
            <div className="flex items-center gap-2">
                <span className={`text-xs font-bold ${color}`}>{status}</span>
                {permitPath && (
                    <a
                        href={permitPath}
                        target="_blank"
                        rel="noreferrer"
                        className="px-2 py-1 text-[10px] font-bold rounded bg-blue-100 text-blue-700 hover:bg-blue-200"
                    >
                        View Permit
                    </a>
                )}
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
const TruckDetail = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin';

    const [truck, setTruck]   = useState(null);
    const [trips, setTrips]   = useState([]);
    const [stitchedTrips, setStitchedTrips] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expandedMaster, setExpandedMaster] = useState({});
    const [error,   setError]   = useState('');
    const [isEditing, setIsEditing] = useState(false);
    const [savingEdit, setSavingEdit] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [editMessage, setEditMessage] = useState('');
    const [generatingReport, setGeneratingReport] = useState(false);

    const downloadReport = async () => {
        try {
            setGeneratingReport(true);
            await generateLorryReport(truck, trips);
        } finally {
            setGeneratingReport(false);
        }
    };
    const stateTaxPermitRef = useRef(null);
    const centralTaxPermitRef = useRef(null);
    const [editForm, setEditForm] = useState({
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
    });

    const toDateInput = (d) => {
        if (!d) return '';
        const dt = new Date(d);
        if (Number.isNaN(dt.getTime())) return '';
        const year = dt.getFullYear();
        const month = String(dt.getMonth() + 1).padStart(2, '0');
        const day = String(dt.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const mapTruckToForm = (t) => ({
        licensePlate: t.licensePlate || '',
        registrationDate: toDateInput(t.registrationDate),
        status: t.status || 'active',
        mileage: t.fuelEfficiency ?? '',
        tankCapacity: t.tankCapacity ?? '',
        costPerLitre: t.costPerLitre ?? '',
        insuranceNumber: t.insuranceNumber || '',
        insuranceExpiry: toDateInput(t.insuranceExpiry),
        taxDocumentNumber: t.taxDocumentNumber || '',
        stateTaxAmount: t.stateTaxAmount ?? '',
        stateTaxPaidDate: toDateInput(t.stateTaxPaidDate),
        centralTaxAmount: t.centralTaxAmount ?? '',
        centralTaxPaidDate: toDateInput(t.centralTaxPaidDate),
    });

    useEffect(() => {
        const load = async () => {
            try {
                setLoading(true);
                const [truckRes, tripsRes] = await Promise.all([
                    trucksAPI.getById(id),
                    routesAPI.getAll(),
                ]);
                const truckData = truckRes.data;
                setTruck(truckData);
                setEditForm(mapTruckToForm(truckData));

                const all = tripsRes.data || [];
                const truckStrId   = truckData?.truckId   || '';
                const truckPlate   = truckData?.licensePlate || '';
                const normalize    = (s) => String(s || '').replace(/\s+/g, '').toUpperCase();
                
                const filteredTrips = all.filter((trip) => {
                    const tid = trip.truckId?._id || trip.truckId;
                    if (tid && String(tid) === String(id)) return true;
                    const reg = trip.registrationNumber || '';
                    if (!reg) return false;
                    const normReg = normalize(reg);
                    return (
                        normReg === normalize(truckStrId) ||
                        normReg === normalize(truckPlate)
                    );
                });
                setTrips(filteredTrips);

                // Fetch Stitched Trips
                try {
                    const stitchedRes = await telemetryAPI.stitchedTrips({ registrationNumber: truckPlate || truckStrId });
                    setStitchedTrips(stitchedRes.data || []);
                } catch (err) {
                    console.error('Failed to load stitched trips:', err);
                }
            } catch (err) {
                setError('Failed to load lorry details.');
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [id]);

    const ef = (field) => ({
        value: editForm[field],
        onChange: (e) => setEditForm((prev) => ({ ...prev, [field]: e.target.value })),
    });

    const saveTruckEdits = async (e) => {
        e.preventDefault();
        try {
            setSavingEdit(true);
            setEditMessage('');
            const fd = new FormData();
            Object.entries(editForm).forEach(([k, v]) => fd.append(k, v ?? ''));
            if (stateTaxPermitRef.current?.files?.[0]) {
                fd.append('stateTaxPermit', stateTaxPermitRef.current.files[0]);
            }
            if (centralTaxPermitRef.current?.files?.[0]) {
                fd.append('centralTaxPermit', centralTaxPermitRef.current.files[0]);
            }

            const res = await trucksAPI.updateWithFiles(id, fd);
            const updated = res.data?.truck || res.data;
            setTruck(updated);
            setEditForm(mapTruckToForm(updated));
            setIsEditing(false);
            if (stateTaxPermitRef.current) stateTaxPermitRef.current.value = '';
            if (centralTaxPermitRef.current) centralTaxPermitRef.current.value = '';
            setEditMessage('Lorry record updated successfully.');
        } catch (err) {
            setEditMessage('Failed to update lorry: ' + (err.response?.data?.message || err.message));
        } finally {
            setSavingEdit(false);
        }
    };

    const deleteTruckRecord = async () => {
        if (!window.confirm('Delete this lorry record permanently?')) return;
        try {
            setDeleting(true);
            await trucksAPI.delete(id);
            navigate('/admin');
        } catch (err) {
            setEditMessage('Failed to delete lorry: ' + (err.response?.data?.message || err.message));
        } finally {
            setDeleting(false);
        }
    };

    const statusColor = (s) => ({
        active:      'bg-green-100 text-green-700',
        inactive:    'bg-gray-200 text-gray-600',
        maintenance: 'bg-yellow-100 text-yellow-700',
    }[s] || 'bg-gray-100 text-gray-600');

    const tripStatusColor = (s) => ({
        completed:  'bg-green-100 text-green-700',
        in_transit: 'bg-blue-100 text-blue-700',
        delayed:    'bg-red-100 text-red-700',
        scheduled:  'bg-gray-100 text-gray-600',
    }[s] || 'bg-gray-100 text-gray-600');

    // Summarise FC renewals
    const fcDates = useMemo(() => {
        if (!truck?.fcRenewalDates?.length) return [];
        return truck.fcRenewalDates.map((d, i) => ({
            label: `FC Renewal ${i + 1} (${['6 months', '12 months', '18 months', '24 months'][i] || 'unknown'})`,
            date: d,
        }));
    }, [truck]);

    if (loading) return <div className="animate-fade-in p-8 text-sm text-gray-500">Loading lorry details…</div>;
    if (error)   return <div className="animate-fade-in p-8 text-sm text-red-500">{error}</div>;
    if (!truck)  return null;

    return (
        <div className="animate-fade-in max-w-5xl mx-auto">
            {/* Back button */}
            <button
                onClick={() => navigate(-1)}
                className="mb-5 text-xs font-bold text-blue-600 hover:underline flex items-center gap-1"
            >
                <HiOutlineArrowLeft /> Back to Admin
            </button>

            <div className="mb-4 flex flex-wrap items-center gap-2">
                {isAdmin && (
                    <>
                        <button
                            type="button"
                            onClick={() => {
                                setIsEditing((prev) => !prev);
                                setEditMessage('');
                                setEditForm(mapTruckToForm(truck));
                            }}
                            className="px-3 py-1.5 text-xs font-bold rounded-lg bg-blue-600 text-white hover:bg-blue-700"
                        >
                            {isEditing ? 'Cancel Edit' : 'Edit Lorry'}
                        </button>
                        <button
                            type="button"
                            onClick={deleteTruckRecord}
                            disabled={deleting}
                            className="px-3 py-1.5 text-xs font-bold rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-60"
                        >
                            {deleting ? 'Deleting...' : 'Delete Lorry'}
                        </button>
                    </>
                )}
                <button
                    type="button"
                    onClick={downloadReport}
                    disabled={generatingReport}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                    <HiOutlineDocumentDownload className="text-base" />
                    {generatingReport ? 'Generating PDF...' : 'Download Report'}
                </button>
                {editMessage && <span className="text-xs font-semibold text-gray-600">{editMessage}</span>}
            </div>

            {isAdmin && isEditing && (
                <form onSubmit={saveTruckEdits} className="card p-5 mb-5">
                    <h2 className="text-sm font-bold text-gray-700 mb-4 border-b pb-2">Edit Lorry Record</h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                        <label>
                            <p className="text-gray-500 mb-1">Number Plate</p>
                            <input className="w-full border border-gray-200 rounded-lg px-3 py-2" {...ef('licensePlate')} required />
                        </label>
                        <label>
                            <p className="text-gray-500 mb-1">Registration Date</p>
                            <input type="date" className="w-full border border-gray-200 rounded-lg px-3 py-2" {...ef('registrationDate')} required />
                        </label>
                        <label>
                            <p className="text-gray-500 mb-1">Status</p>
                            <select className="w-full border border-gray-200 rounded-lg px-3 py-2" {...ef('status')}>
                                <option value="active">Active</option>
                                <option value="inactive">Inactive</option>
                                <option value="maintenance">Under Maintenance</option>
                            </select>
                        </label>
                        <label>
                            <p className="text-gray-500 mb-1">Mileage (km/l)</p>
                            <input type="number" step="0.01" min="0" className="w-full border border-gray-200 rounded-lg px-3 py-2" {...ef('mileage')} />
                        </label>
                        <label>
                            <p className="text-gray-500 mb-1">Tank Capacity (L)</p>
                            <input type="number" step="1" min="0" className="w-full border border-gray-200 rounded-lg px-3 py-2" {...ef('tankCapacity')} />
                        </label>
                        <label>
                            <p className="text-gray-500 mb-1">Diesel Cost (₹/L)</p>
                            <input type="number" step="0.01" min="0" className="w-full border border-gray-200 rounded-lg px-3 py-2" {...ef('costPerLitre')} />
                        </label>
                        <label>
                            <p className="text-gray-500 mb-1">Insurance No.</p>
                            <input className="w-full border border-gray-200 rounded-lg px-3 py-2" {...ef('insuranceNumber')} />
                        </label>
                        <label>
                            <p className="text-gray-500 mb-1">Insurance Expiry</p>
                            <input type="date" className="w-full border border-gray-200 rounded-lg px-3 py-2" {...ef('insuranceExpiry')} />
                        </label>
                        <label>
                            <p className="text-gray-500 mb-1">RC / Tax Document No.</p>
                            <input className="w-full border border-gray-200 rounded-lg px-3 py-2" {...ef('taxDocumentNumber')} />
                        </label>
                        <label>
                            <p className="text-gray-500 mb-1">TN State Tax Amount</p>
                            <input type="number" step="0.01" min="0" className="w-full border border-gray-200 rounded-lg px-3 py-2" {...ef('stateTaxAmount')} />
                        </label>
                        <label>
                            <p className="text-gray-500 mb-1">TN State Tax Paid Date</p>
                            <input type="date" className="w-full border border-gray-200 rounded-lg px-3 py-2" {...ef('stateTaxPaidDate')} />
                        </label>
                        <label>
                            <p className="text-gray-500 mb-1">Central Tax Amount</p>
                            <input type="number" step="0.01" min="0" className="w-full border border-gray-200 rounded-lg px-3 py-2" {...ef('centralTaxAmount')} />
                        </label>
                        <label>
                            <p className="text-gray-500 mb-1">Central Tax Paid Date</p>
                            <input type="date" className="w-full border border-gray-200 rounded-lg px-3 py-2" {...ef('centralTaxPaidDate')} />
                        </label>
                        <label>
                            <p className="text-gray-500 mb-1">Replace TN Permit</p>
                            <input type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" ref={stateTaxPermitRef} className="w-full border border-gray-200 rounded-lg px-2 py-1.5" />
                        </label>
                        <label>
                            <p className="text-gray-500 mb-1">Replace National Permit</p>
                            <input type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" ref={centralTaxPermitRef} className="w-full border border-gray-200 rounded-lg px-2 py-1.5" />
                        </label>
                    </div>
                    <button
                        type="submit"
                        disabled={savingEdit}
                        className="mt-4 px-4 py-2 text-xs font-bold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
                    >
                        {savingEdit ? 'Saving...' : 'Save Changes'}
                    </button>
                </form>
            )}

            {/* ── Header Card ─────────────────────────────────────────── */}
            <div className="card p-6 mb-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-extrabold text-gray-900">{truck.truckId}</h1>
                        <p className="text-sm font-mono text-gray-500 mt-0.5">{truck.licensePlate}</p>
                        <p className="text-xs text-gray-400 mt-1">Registered on {fmtDate(truck.registrationDate)}</p>
                    </div>
                    <span className={`px-3 py-1 text-sm font-bold rounded-full ${statusColor(truck.status)}`}>
                        {truck.status?.toUpperCase()}
                    </span>
                </div>

                <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                        { label: 'Mileage',      value: `${truck.fuelEfficiency} km/l` },
                        { label: 'Tank Capacity', value: `${truck.tankCapacity} Litres` },
                        { label: 'Diesel Cost',   value: `₹${truck.costPerLitre}/litre` },
                        { label: 'CO₂ Emission',  value: `${truck.emissionFactor} kg/l` },
                    ].map(({ label, value }) => (
                        <div key={label} className="bg-gray-50 rounded-xl p-3">
                            <p className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</p>
                            <p className="text-sm font-bold text-gray-900 mt-0.5">{value}</p>
                        </div>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
                {/* ── Insurance & Documents ─────────────────────────── */}
                <div className="card p-5">
                    <h2 className="text-sm font-bold text-gray-700 mb-3 border-b pb-2">Insurance &amp; Documents</h2>
                    <dl className="space-y-2 text-xs">
                        {[
                            { label: 'Insurance Policy No.', value: truck.insuranceNumber || '—' },
                            { label: 'Insurance Expiry',     value: fmtDate(truck.insuranceExpiry) },
                            { label: 'RC / Tax Document No.',value: truck.taxDocumentNumber || '—' },
                        ].map(({ label, value }) => (
                            <div key={label} className="flex justify-between">
                                <span className="text-gray-500">{label}</span>
                                <span className="font-semibold text-gray-800">{value}</span>
                            </div>
                        ))}
                    </dl>
                    <div className="mt-4 pt-3 border-t border-gray-100 space-y-2 text-xs">
                        <p className="font-bold text-gray-700">Uploaded Documents</p>
                        <div className="flex flex-wrap gap-2">
                            {truck.stateTaxPermitPath ? (
                                <a href={truck.stateTaxPermitPath} target="_blank" rel="noreferrer" className="px-2 py-1 rounded bg-orange-100 text-orange-700 font-semibold">TN Permit</a>
                            ) : (
                                <span className="px-2 py-1 rounded bg-gray-100 text-gray-500">TN Permit: Not uploaded</span>
                            )}
                            {truck.centralTaxPermitPath ? (
                                <a href={truck.centralTaxPermitPath} target="_blank" rel="noreferrer" className="px-2 py-1 rounded bg-purple-100 text-purple-700 font-semibold">National Permit</a>
                            ) : (
                                <span className="px-2 py-1 rounded bg-gray-100 text-gray-500">National Permit: Not uploaded</span>
                            )}
                        </div>
                    </div>
                </div>

                {/* ── FC Renewal Schedule ───────────────────────────── */}
                <div className="card p-5">
                    <h2 className="text-sm font-bold text-gray-700 mb-3 border-b pb-2">
                        FC (Fitness Certificate) Renewal Schedule
                        <span className="ml-2 text-[10px] font-normal text-gray-400">New lorry: twice/year for 2 years</span>
                    </h2>
                    {fcDates.length === 0
                        ? <p className="text-xs text-gray-400">No FC renewal dates computed yet.</p>
                        : <div className="space-y-2">
                            {fcDates.map(({ label, date }) => (
                                <FcBadge key={label} date={date} label={label} />
                            ))}
                        </div>
                    }
                </div>
            </div>

            {/* ── Tax Compliance ─────────────────────────────────────── */}
            <div className="card p-5 mb-5">
                <h2 className="text-sm font-bold text-gray-700 mb-4 border-b pb-2">Road Tax Compliance</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* TN State Tax */}
                    <div className="border border-orange-100 rounded-xl p-4 bg-orange-50">
                        <p className="text-xs font-bold text-orange-700 uppercase tracking-widest mb-3">
                            Tamil Nadu State Road Tax
                            <span className="ml-2 font-normal text-orange-500">(Quarterly)</span>
                        </p>
                        <ComplianceRow
                            label="Next Payment Due"
                            date={truck.stateTaxNextDue}
                            amount={truck.stateTaxAmount}
                            permitPath={truck.stateTaxPermitPath}
                        />
                        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                            <div>
                                <p className="text-orange-500">Amount Paid</p>
                                <p className="font-bold text-gray-800">₹{Number(truck.stateTaxAmount || 0).toLocaleString('en-IN')}</p>
                            </div>
                            <div>
                                <p className="text-orange-500">Last Paid Date</p>
                                <p className="font-bold text-gray-800">{fmtDate(truck.stateTaxPaidDate)}</p>
                            </div>
                        </div>
                        {truck.stateTaxPermitPath && (
                            <a
                                href={truck.stateTaxPermitPath}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-3 block text-center py-1.5 text-xs font-bold rounded-lg bg-orange-200 text-orange-800 hover:bg-orange-300"
                            >
                                <span className="inline-flex items-center gap-1"><HiOutlineDocumentText /> View / Download TN Permit</span>
                            </a>
                        )}
                    </div>

                    {/* Central Govt Tax */}
                    <div className="border border-purple-100 rounded-xl p-4 bg-purple-50">
                        <p className="text-xs font-bold text-purple-700 uppercase tracking-widest mb-3">
                            Central Government Road Tax
                            <span className="ml-2 font-normal text-purple-500">(Annual)</span>
                        </p>
                        <ComplianceRow
                            label="Next Payment Due"
                            date={truck.centralTaxNextDue}
                            amount={truck.centralTaxAmount}
                            permitPath={truck.centralTaxPermitPath}
                        />
                        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                            <div>
                                <p className="text-purple-500">Amount Paid</p>
                                <p className="font-bold text-gray-800">₹{Number(truck.centralTaxAmount || 0).toLocaleString('en-IN')}</p>
                            </div>
                            <div>
                                <p className="text-purple-500">Last Paid Date</p>
                                <p className="font-bold text-gray-800">{fmtDate(truck.centralTaxPaidDate)}</p>
                            </div>
                        </div>
                        {truck.centralTaxPermitPath && (
                            <a
                                href={truck.centralTaxPermitPath}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-3 block text-center py-1.5 text-xs font-bold rounded-lg bg-purple-200 text-purple-800 hover:bg-purple-300"
                            >
                                <span className="inline-flex items-center gap-1"><HiOutlineDocumentText /> View / Download National Permit</span>
                            </a>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Stitched Trips (Complete KM Run) ─────────────────────────── */}
            <div className="card p-5 mb-5 bg-blue-50/30 border-blue-100">
                <h2 className="text-sm font-bold text-blue-800 mb-3 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
                    Complete Trip Analysis (Master Trips)
                </h2>
                {stitchedTrips.length === 0 ? (
                    <p className="text-xs text-gray-400 py-4 text-center">No complete trip data available yet.</p>
                ) : (
                    <div className="space-y-3">
                        {stitchedTrips.map((mt) => (
                            <div key={mt.masterTripId} className="bg-white border border-blue-100 rounded-xl overflow-hidden shadow-sm">
                                <div className="p-4 flex flex-wrap items-center justify-between gap-4">
                                    <div className="flex-1 min-w-[200px]">
                                        <p className="text-[10px] font-bold text-blue-500 uppercase tracking-widest mb-1">Trip Journey</p>
                                        <p className="text-sm font-bold text-gray-900 line-clamp-1">{mt.source} → {mt.destination}</p>
                                        <p className="text-xs text-gray-500 mt-1">{fmtDate(mt.startTime)} to {fmtDate(mt.endTime)}</p>
                                    </div>
                                    <div className="flex gap-4 text-center">
                                        <div>
                                            <p className="text-[10px] text-gray-400 uppercase">Total KM</p>
                                            <p className="text-sm font-extrabold text-blue-600">{Number(mt.totalDistanceKm).toFixed(1)} km</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-gray-400 uppercase">Segments</p>
                                            <p className="text-sm font-extrabold text-gray-700">{mt.segments?.length || 0}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-gray-400 uppercase">Duration</p>
                                            <p className="text-sm font-extrabold text-gray-700">{Math.floor(mt.durationMinutes / 60)}h {mt.durationMinutes % 60}m</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setExpandedMaster(prev => ({ ...prev, [mt.masterTripId]: !prev[mt.masterTripId] }))}
                                        className="p-2 hover:bg-blue-50 rounded-full transition-colors"
                                    >
                                        {expandedMaster[mt.masterTripId] ? <HiChevronUp className="text-blue-500" /> : <HiChevronDown className="text-blue-500" />}
                                    </button>
                                </div>
                                
                                {expandedMaster[mt.masterTripId] && (
                                    <div className="px-4 pb-4 border-t border-blue-50 bg-blue-50/20">
                                        <p className="text-[10px] font-bold text-gray-400 uppercase mt-3 mb-2">Individual Segments</p>
                                        <div className="space-y-2">
                                            {mt.segments.map((seg, sIdx) => (
                                                <div key={seg._id} className="flex items-center justify-between p-2 bg-white rounded-lg text-[11px] border border-blue-50/50">
                                                    <div className="flex items-center gap-3">
                                                        <span className="w-5 h-5 flex items-center justify-center bg-gray-100 rounded-full text-[9px] font-bold text-gray-500">{sIdx + 1}</span>
                                                        <span className="font-semibold text-gray-700">{seg.source} → {seg.destination}</span>
                                                    </div>
                                                    <div className="flex gap-4">
                                                        <span className="text-gray-500">{fmtDateTime(seg.tripStartTime)}</span>
                                                        <span className="font-bold text-blue-500">{seg.distance} km</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* ── Trip History (Raw Segments) ──────────────────────────────────────────── */}
            <div className="card p-5 mb-8">
                <h2 className="text-sm font-bold text-gray-700 mb-3 border-b pb-2">
                    Recent Activity (All Segments)
                </h2>
                {trips.length === 0 ? (
                    <p className="text-xs text-gray-400 py-4 text-center">No trips recorded for this lorry yet.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="bg-gray-50 text-left">
                                    {['Source', 'Destination', 'Driver', 'Assistant', 'Distance', 'Toll', 'Total Cost', 'Start', 'End', 'Status'].map((h) => (
                                        <th key={h} className="px-3 py-2 text-[11px] font-bold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {trips.map((trip) => (
                                    <tr key={trip._id} className="border-t border-gray-50 hover:bg-gray-50">
                                        <td className="px-3 py-2 font-medium">{trip.source}</td>
                                        <td className="px-3 py-2">{trip.destination}</td>
                                        <td className="px-3 py-2">{trip.driverId?.username || '—'}</td>
                                        <td className="px-3 py-2">{trip.assistantId?.username || '—'}</td>
                                        <td className="px-3 py-2">{trip.distance || '—'} km</td>
                                        <td className="px-3 py-2">
                                            {trip.tollCount ? `${trip.tollCount} × ₹${trip.tollPrice}` : '—'}
                                        </td>
                                        <td className="px-3 py-2 font-semibold">
                                            {trip.totalTripCost ? `₹${Number(trip.totalTripCost).toLocaleString('en-IN')}` : '—'}
                                        </td>
                                        <td className="px-3 py-2 whitespace-nowrap">{fmtDateTime(trip.tripStartTime)}</td>
                                        <td className="px-3 py-2 whitespace-nowrap">{fmtDateTime(trip.tripEndTime)}</td>
                                        <td className="px-3 py-2">
                                            <span className={`px-2 py-0.5 rounded-full font-bold ${tripStatusColor(trip.status)}`}>
                                                {trip.status}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default TruckDetail;
