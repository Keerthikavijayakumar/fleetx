import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { authAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
    HiOutlineUser,
    HiOutlineCalendar,
    HiOutlinePhone,
    HiOutlineMail,
    HiOutlineLocationMarker,
    HiOutlineIdentification,
    HiOutlineBadgeCheck,
    HiOutlineKey,
    HiOutlineArrowLeft,
    HiOutlineExclamationCircle,
    HiOutlineCheck,
    HiOutlineDocumentDownload,
} from 'react-icons/hi';
import { generatePersonReport } from '../services/reportGenerator';

// ─── Helpers ────────────────────────────────────────────────────────────────
const fmtDate = (d) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
};

const calcAge = (dob) => {
    if (!dob) return null;
    return Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 3600 * 1000));
};

// ─── Stat box ────────────────────────────────────────────────────────────────
const Stat = ({ label, value, icon: Icon }) => (
    <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
        <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1 inline-flex items-center gap-1"><Icon /> {label}</p>
        <p className="text-sm font-extrabold text-gray-800 wrap-break-word">{value || '—'}</p>
    </div>
);

// ─── Section wrapper ─────────────────────────────────────────────────────────
const Section = ({ title, color = 'blue', children }) => {
    const styles = {
        blue:   { border: 'border-blue-200',   header: 'bg-blue-50',   dot: 'bg-blue-500' },
        green:  { border: 'border-emerald-200', header: 'bg-emerald-50',dot: 'bg-emerald-500' },
        orange: { border: 'border-orange-200',  header: 'bg-orange-50', dot: 'bg-orange-500' },
        purple: { border: 'border-purple-200',  header: 'bg-purple-50', dot: 'bg-purple-500' },
    }[color];
    return (
        <div className={`rounded-2xl border ${styles.border} overflow-hidden`}>
            <div className={`flex items-center gap-2 px-5 py-3 ${styles.header} border-b ${styles.border}`}>
                <span className={`w-2.5 h-2.5 rounded-full ${styles.dot} shrink-0`} />
                <p className="text-sm font-extrabold text-gray-800">{title}</p>
            </div>
            <div className="p-5">{children}</div>
        </div>
    );
};

// ─── Component ───────────────────────────────────────────────────────────────
const PersonDetail = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin';
    const [person, setPerson] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [isEditing, setIsEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [actionMessage, setActionMessage] = useState('');
    const [generatingReport, setGeneratingReport] = useState(false);
    const photoRef = useRef(null);
    const [editForm, setEditForm] = useState({
        username: '',
        email: '',
        password: '',
        fullName: '',
        dateOfBirth: '',
        phone: '',
        additionalPhone: '',
        address: '',
        driverLicenceNumber: '',
        aadharNumber: '',
        experienceYears: '',
        monthlySalary: '',
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

    const mapPersonToForm = (p) => ({
        username: p.username || '',
        email: p.email || '',
        password: '',
        fullName: p.fullName || '',
        dateOfBirth: toDateInput(p.dateOfBirth),
        phone: p.phone || '',
        additionalPhone: p.additionalPhone || '',
        address: p.address || '',
        driverLicenceNumber: p.driverLicenceNumber || '',
        aadharNumber: p.aadharNumber || '',
        experienceYears: p.experienceYears ?? '',
        monthlySalary: p.monthlySalary ?? '',
    });

    useEffect(() => {
        authAPI.adminGetUser(id)
            .then((res) => {
                setPerson(res.data.user);
                setEditForm(mapPersonToForm(res.data.user));
            })
            .catch(() => setError('Could not load person details.'))
            .finally(() => setLoading(false));
    }, [id]);

    const ef = (field) => ({
        value: editForm[field],
        onChange: (e) => setEditForm((prev) => ({ ...prev, [field]: e.target.value })),
    });

    const savePersonEdits = async (e) => {
        e.preventDefault();
        try {
            setSaving(true);
            setActionMessage('');

            const fd = new FormData();
            Object.entries(editForm).forEach(([k, v]) => {
                if (k === 'password' && !v) return;
                fd.append(k, v ?? '');
            });
            if (photoRef.current?.files?.[0]) {
                fd.append('photo', photoRef.current.files[0]);
            }

            const res = await authAPI.adminUpdateUserWithPhoto(id, fd);
            const updated = res.data.user;
            setPerson(updated);
            setEditForm(mapPersonToForm(updated));
            if (photoRef.current) photoRef.current.value = '';
            setIsEditing(false);
            setActionMessage('Record updated successfully.');
        } catch (err) {
            setActionMessage('Failed to update record: ' + (err.response?.data?.message || err.message));
        } finally {
            setSaving(false);
        }
    };

    const deletePerson = async () => {
        if (!window.confirm('Delete this record permanently?')) return;
        try {
            setDeleting(true);
            await authAPI.adminDeleteUser(id);
            navigate('/admin');
        } catch (err) {
            setActionMessage('Failed to delete record: ' + (err.response?.data?.message || err.message));
        } finally {
            setDeleting(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-24">
                <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
            </div>
        );
    }

    if (error || !person) {
        return (
            <div className="text-center py-24">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-50 text-red-500 mb-3"><HiOutlineExclamationCircle className="text-2xl" /></div>
                <p className="text-sm text-gray-500">{error || 'Person not found.'}</p>
                <button onClick={() => navigate(-1)} className="mt-4 px-4 py-2 text-xs font-bold rounded-lg bg-gray-100 hover:bg-gray-200 inline-flex items-center gap-1"><HiOutlineArrowLeft /> Go Back</button>
            </div>
        );
    }

    const age = calcAge(person.dateOfBirth);
    const isDriver = person.role === 'driver';
    const accentColor = isDriver ? 'blue' : person.role === 'assistant' ? 'purple' : 'green';
    const avatarBg   = isDriver ? 'bg-blue-600' : person.role === 'assistant' ? 'bg-purple-600' : 'bg-emerald-600';
    const badgeCls   = isDriver
        ? 'bg-blue-100 text-blue-700'
        : person.role === 'assistant'
            ? 'bg-purple-100 text-purple-700'
            : 'bg-emerald-100 text-emerald-700';

    return (
        <div className="animate-fade-in max-w-4xl mx-auto">
            {/* Back */}
            <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-gray-800 mb-5 transition-colors">
                <HiOutlineArrowLeft /> Back
            </button>

            <div className="mb-4 flex flex-wrap items-center gap-2">
                {isAdmin && (
                    <>
                        <button
                            type="button"
                            onClick={() => {
                                setIsEditing((prev) => !prev);
                                setActionMessage('');
                                setEditForm(mapPersonToForm(person));
                            }}
                            className="px-3 py-1.5 text-xs font-bold rounded-lg bg-blue-600 text-white hover:bg-blue-700"
                        >
                            {isEditing ? 'Cancel Edit' : 'Edit Record'}
                        </button>
                        <button
                            type="button"
                            onClick={deletePerson}
                            disabled={deleting}
                            className="px-3 py-1.5 text-xs font-bold rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-60"
                        >
                            {deleting ? 'Deleting...' : 'Delete Record'}
                        </button>
                    </>
                )}
                <button
                    type="button"
                    onClick={async () => {
                        setGeneratingReport(true);
                        try { await generatePersonReport(person); } finally { setGeneratingReport(false); }
                    }}
                    disabled={generatingReport}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                    <HiOutlineDocumentDownload className="text-base" />
                    {generatingReport ? 'Generating PDF...' : 'Download Report'}
                </button>
                {actionMessage && <span className="text-xs font-semibold text-gray-600">{actionMessage}</span>}
            </div>

            {isAdmin && isEditing && (
                <form onSubmit={savePersonEdits} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 mb-5">
                    <h2 className="text-sm font-bold text-gray-700 mb-4 border-b pb-2">Edit Person Record</h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                        <label>
                            <p className="text-gray-500 mb-1">Username</p>
                            <input className="w-full border border-gray-200 rounded-lg px-3 py-2" {...ef('username')} required />
                        </label>
                        <label>
                            <p className="text-gray-500 mb-1">Email</p>
                            <input type="email" className="w-full border border-gray-200 rounded-lg px-3 py-2" {...ef('email')} required />
                        </label>
                        <label>
                            <p className="text-gray-500 mb-1">New Password (Optional)</p>
                            <input type="password" className="w-full border border-gray-200 rounded-lg px-3 py-2" {...ef('password')} />
                        </label>
                        <label>
                            <p className="text-gray-500 mb-1">Full Name</p>
                            <input className="w-full border border-gray-200 rounded-lg px-3 py-2" {...ef('fullName')} />
                        </label>
                        <label>
                            <p className="text-gray-500 mb-1">Date of Birth</p>
                            <input type="date" className="w-full border border-gray-200 rounded-lg px-3 py-2" {...ef('dateOfBirth')} />
                        </label>
                        <label>
                            <p className="text-gray-500 mb-1">Phone</p>
                            <input className="w-full border border-gray-200 rounded-lg px-3 py-2" {...ef('phone')} />
                        </label>
                        <label>
                            <p className="text-gray-500 mb-1">Additional Phone</p>
                            <input className="w-full border border-gray-200 rounded-lg px-3 py-2" {...ef('additionalPhone')} />
                        </label>
                        <label>
                            <p className="text-gray-500 mb-1">Driving Licence Number</p>
                            <input className="w-full border border-gray-200 rounded-lg px-3 py-2" {...ef('driverLicenceNumber')} />
                        </label>
                        <label>
                            <p className="text-gray-500 mb-1">Aadhaar Number</p>
                            <input className="w-full border border-gray-200 rounded-lg px-3 py-2" {...ef('aadharNumber')} />
                        </label>
                        <label>
                            <p className="text-gray-500 mb-1">Experience (Years)</p>
                            <input type="number" min="0" step="1" className="w-full border border-gray-200 rounded-lg px-3 py-2" {...ef('experienceYears')} />
                        </label>
                        <label>
                            <p className="text-gray-500 mb-1">Monthly Salary (Rs)</p>
                            <input type="number" min="0" step="1" className="w-full border border-gray-200 rounded-lg px-3 py-2" {...ef('monthlySalary')} />
                        </label>
                        <label className="md:col-span-2">
                            <p className="text-gray-500 mb-1">Address</p>
                            <input className="w-full border border-gray-200 rounded-lg px-3 py-2" {...ef('address')} />
                        </label>
                        <label>
                            <p className="text-gray-500 mb-1">Replace Profile Photo</p>
                            <input type="file" accept=".jpg,.jpeg,.png,.webp" ref={photoRef} className="w-full border border-gray-200 rounded-lg px-2 py-1.5" />
                        </label>
                    </div>
                    <button
                        type="submit"
                        disabled={saving}
                        className="mt-4 px-4 py-2 text-xs font-bold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
                    >
                        {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                </form>
            )}

            {/* Hero card */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden mb-5">
                {/* Accent top strip */}
                <div className={`h-2 w-full ${isDriver ? 'bg-linear-to-r from-blue-400 to-blue-600' : person.role === 'assistant' ? 'bg-linear-to-r from-purple-400 to-purple-600' : 'bg-linear-to-r from-emerald-400 to-emerald-600'}`} />

                <div className="p-6 flex flex-col sm:flex-row items-start sm:items-center gap-5">
                    {/* Avatar / photo */}
                    {person.photoPath ? (
                        <img
                            src={`/api/${person.photoPath}`}
                            alt={person.fullName || person.username}
                            className="w-24 h-24 rounded-2xl object-cover border-4 border-white shadow-lg shrink-0"
                        />
                    ) : (
                        <div className={`w-24 h-24 rounded-2xl ${avatarBg} flex items-center justify-center text-white font-black text-4xl shrink-0 shadow-lg`}>
                            {(person.fullName || person.username)?.[0]?.toUpperCase()}
                        </div>
                    )}

                    <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                            <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">
                                {person.fullName || person.username}
                            </h1>
                            <span className={`px-2.5 py-0.5 text-xs font-bold rounded-full capitalize ${badgeCls}`}>
                                {person.role}
                            </span>
                        </div>
                        <p className="text-sm text-gray-500">@{person.username}</p>
                        <p className="text-sm text-gray-500 text-safe-wrap">{person.email}</p>

                        {/* Quick stats row */}
                        <div className="flex flex-wrap gap-4 mt-3">
                            {age !== null && (
                                <div className="text-center">
                                    <p className="text-xl font-extrabold text-gray-800">{age}</p>
                                    <p className="text-[10px] text-gray-400">Years Old</p>
                                </div>
                            )}
                            {person.experienceYears > 0 && (
                                <div className="text-center">
                                    <p className="text-xl font-extrabold text-gray-800">{person.experienceYears}</p>
                                    <p className="text-[10px] text-gray-400">Yrs Exp.</p>
                                </div>
                            )}
                            <div className="text-center">
                                <p className="text-xl font-extrabold text-gray-800">Rs.{Number(person.monthlySalary || 0).toLocaleString()}</p>
                                <p className="text-[10px] text-gray-400">Monthly Salary</p>
                            </div>
                            <div className="text-center">
                                <p className="text-xl font-extrabold text-gray-800">{fmtDate(person.createdAt).split(' ')[2]}</p>
                                <p className="text-[10px] text-gray-400">Year Joined</p>
                            </div>
                        </div>
                    </div>

                    {/* Join date */}
                    <div className="text-right shrink-0">
                        <p className="text-[10px] text-gray-400 uppercase tracking-wide">Joined</p>
                        <p className="text-sm font-bold text-gray-700">{fmtDate(person.createdAt)}</p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Personal information */}
                <Section title="Personal Information" color={accentColor}>
                    <div className="grid grid-cols-2 gap-3">
                        <Stat label="Full Name"    value={person.fullName} icon={HiOutlineUser} />
                        <Stat label="Date of Birth" value={fmtDate(person.dateOfBirth)} icon={HiOutlineCalendar} />
                        <Stat label="Age"          value={age !== null ? `${age} years` : null} icon={HiOutlineCalendar} />
                        <Stat label="Phone"        value={person.phone} icon={HiOutlinePhone} />
                        <Stat label="Alt. Phone"   value={person.additionalPhone} icon={HiOutlinePhone} />
                        <Stat label="Login Email"  value={person.email} icon={HiOutlineMail} />
                    </div>
                    {person.address && (
                        <div className="mt-3 bg-gray-50 rounded-xl p-4 border border-gray-100">
                            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1 inline-flex items-center gap-1"><HiOutlineLocationMarker /> Address</p>
                            <p className="text-sm font-semibold text-gray-800 leading-relaxed text-safe-wrap">{person.address}</p>
                        </div>
                    )}
                </Section>

                {/* Professional & compliance */}
                <Section title="Professional Details" color="orange">
                    <div className="grid grid-cols-2 gap-3">
                        {isDriver && (
                            <div className="col-span-2 bg-gray-50 rounded-xl p-4 border border-gray-100">
                                <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1 inline-flex items-center gap-1"><HiOutlineIdentification /> Driving Licence</p>
                                <p className="text-base font-extrabold text-gray-800 tracking-widest">
                                    {person.driverLicenceNumber || '—'}
                                </p>
                                <p className="text-[10px] text-orange-500 mt-1">As per RTO-issued licence card</p>
                            </div>
                        )}
                        <div className={`${isDriver ? '' : 'col-span-2'} bg-gray-50 rounded-xl p-4 border border-gray-100`}>
                            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1 inline-flex items-center gap-1"><HiOutlineIdentification /> Aadhaar Number</p>
                            <p className="text-sm font-extrabold text-gray-800 tracking-widest">
                                {person.aadharNumber
                                    ? '●●●● ●●●● ' + person.aadharNumber.replace(/\s/g, '').slice(-4)
                                    : '—'}
                            </p>
                            <p className="text-[10px] text-orange-500 mt-1">Last 4 digits shown</p>
                        </div>
                        <Stat label="Experience" value={person.experienceYears > 0 ? `${person.experienceYears} years` : null} icon={HiOutlineBadgeCheck} />
                        <Stat label="Monthly Salary" value={`Rs.${Number(person.monthlySalary || 0).toLocaleString()}`} icon={HiOutlineBadgeCheck} />
                        <Stat label="Role"       value={person.role} icon={HiOutlineBadgeCheck} />
                    </div>
                </Section>

                {/* Login credentials info */}
                <Section title="Login Access" color="green">
                    <div className="grid grid-cols-1 gap-3">
                        <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
                            <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-600 mb-2 inline-flex items-center gap-1"><HiOutlineKey /> Can Sign In With</p>
                            <div className="space-y-1.5">
                                <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                                    <span className="text-emerald-500"><HiOutlineCheck /></span> Email: <span className="font-mono text-gray-600 text-safe-wrap">{person.email}</span>
                                </div>
                                {person.phone && (
                                    <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                                        <span className="text-emerald-500"><HiOutlineCheck /></span> Phone: <span className="font-mono text-gray-600">{person.phone}</span>
                                    </div>
                                )}
                            </div>
                            <p className="text-[10px] text-emerald-600 mt-2">For driver/assistant accounts, login password is fixed as arm.</p>
                        </div>
                        <Stat label="Username (Login ID)" value={person.username} icon={HiOutlineKey} />
                    </div>
                </Section>

                <Section title="Uploaded Records" color="purple">
                    <div className="space-y-3">
                        <div className="bg-purple-50 border border-purple-100 rounded-xl p-4">
                            <p className="text-[10px] font-bold uppercase tracking-wide text-purple-600 mb-2">Profile Photo Upload</p>
                            {person.photoPath ? (
                                <div className="flex flex-wrap items-center gap-3">
                                    <img src={`/api/${person.photoPath}`} alt={person.fullName || person.username} className="w-20 h-20 rounded-lg object-cover border border-purple-200" />
                                    <a
                                        href={`/api/${person.photoPath}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="px-3 py-1.5 text-xs font-bold rounded-lg bg-purple-600 text-white hover:bg-purple-700"
                                    >
                                        View Full Photo
                                    </a>
                                </div>
                            ) : (
                                <p className="text-xs text-gray-500">No photo uploaded for this record.</p>
                            )}
                        </div>
                    </div>
                </Section>
            </div>
        </div>
    );
};

export default PersonDetail;
