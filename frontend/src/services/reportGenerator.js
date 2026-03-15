/**
 * ARM Fleet Management — PDF Report Generator
 * Uses jsPDF + jspdf-autotable to produce professional A4 reports
 * with company letterhead matching the ARM Entreprenaurs header.
 */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ─── Company constants (from letterhead) ─────────────────────────────────────
const COMPANY = {
    name:    'ARM Entreprenaurs',
    address: '13 A, E B COLONY, BHARATHIPURAM, DHARMAPURI, TAMIL NADU, 630705',
    phone:   '9443515667',
    email:   'arunkumartransport.d@gmail.com',
    gstin:   '33AIVPA2477Q1ZM',
};

// ─── Shared formatting helpers ────────────────────────────────────────────────
const fmt = (d) => {
    if (!d) return '—';
    try {
        return new Date(d).toLocaleDateString('en-IN', {
            day: '2-digit', month: '2-digit', year: 'numeric',
        });
    } catch { return '—'; }
};

const fmtDateTime = (d) => {
    if (!d) return '—';
    try {
        return new Date(d).toLocaleString('en-IN', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit', hour12: true,
        });
    } catch { return '—'; }
};

const daysUntil = (d) => {
    if (!d) return null;
    return Math.ceil((new Date(d) - new Date()) / 86400000);
};

const complianceStatus = (d) => {
    const days = daysUntil(d);
    if (days === null) return { text: 'Not Set',                    color: [140, 140, 140] };
    if (days < 0)      return { text: `OVERDUE (${Math.abs(days)}d ago)`, color: [200, 30,  30]  };
    if (days <= 30)    return { text: `Due in ${days}d`,             color: [200, 110, 0]   };
    return               { text: `Due in ${days}d`,             color: [30,  140, 30]  };
};

/** Try to load an image URL as a base-64 data URL. Returns null on failure or for non-image types. */
async function toDataURL(url) {
    if (!url) return null;
    try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const ct = res.headers.get('content-type') || '';
        if (ct.includes('pdf') || ct.includes('word') || ct.includes('msword')) return null;
        if (!ct.startsWith('image/')) return null;
        const blob = await res.blob();
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload  = () => resolve(reader.result);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
        });
    } catch {
        return null;
    }
}

// ─── Letterhead ───────────────────────────────────────────────────────────────
/**
 * Draws the ARM Entreprenaurs letterhead at the top of the current page.
 * Returns the Y position to start document body content.
 */
function drawLetterhead(doc, reportTitle) {
    const w = doc.internal.pageSize.getWidth();

    // ── Row 1: Ph (left) | GSTIN (right) ──
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(60, 60, 60);
    doc.text(`Ph : ${COMPANY.phone}`, 15, 17);
    doc.text(`GSTIN : ${COMPANY.gstin}`, w - 15, 17, { align: 'right' });

    // ── Row 2: Mail (left) ──
    doc.text(`Mail : ${COMPANY.email}`, 15, 23);

    // ── Company name (centred, bold) ──
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(10, 10, 10);
    doc.text(COMPANY.name, w / 2, 34, { align: 'center' });

    // ── Address (centred, small) ──
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text(COMPANY.address, w / 2, 40, { align: 'center' });

    // ── Divider ──
    doc.setDrawColor(160, 160, 160);
    doc.setLineWidth(0.5);
    doc.line(15, 44, w - 15, 44);

    // ── Date (right) ──
    const now = new Date();
    const dateStr = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`;
    doc.setFontSize(9);
    doc.setTextColor(60, 60, 60);
    doc.text(`DATE : ${dateStr}`, w - 15, 51, { align: 'right' });

    // ── Report title (left) ──
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(20, 40, 110);
    doc.text(reportTitle, 15, 51);

    // ── Second light divider ──
    doc.setDrawColor(210, 210, 210);
    doc.setLineWidth(0.2);
    doc.line(15, 55, w - 15, 55);

    return 64; // body starts here
}

/** Draws a shaded section header row and returns the next Y position. */
function sectionHeader(doc, text, y) {
    const w = doc.internal.pageSize.getWidth();
    doc.setFillColor(232, 236, 252);
    doc.rect(15, y - 5, w - 30, 9, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(25, 45, 120);
    doc.text(text, 18, y + 1);
    return y + 11;
}

/** Draws per-page footer with page count and system attribution. */
function addFooters(doc) {
    const w = doc.internal.pageSize.getWidth();
    const h = doc.internal.pageSize.getHeight();
    const total = doc.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setTextColor(160, 160, 160);
        doc.text(
            `Page ${i} of ${total}   |   ARM Fleet Management System — Confidential`,
            w / 2, h - 8, { align: 'center' }
        );
        doc.setDrawColor(210, 210, 210);
        doc.setLineWidth(0.2);
        doc.line(15, h - 12, w - 15, h - 12);
    }
}

const TABLE_HEAD = { fillColor: [45, 65, 160], textColor: 255, fontStyle: 'bold', fontSize: 8 };
const TABLE_ALT  = [248, 249, 253];

// ─────────────────────────────────────────────────────────────────────────────
// 1. INDIVIDUAL LORRY REPORT
// ─────────────────────────────────────────────────────────────────────────────
export async function generateLorryReport(truck, trips = []) {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const w = doc.internal.pageSize.getWidth();
    let y = drawLetterhead(doc, `Lorry Report — ${truck.licensePlate}`);

    // A. Vehicle Details
    y = sectionHeader(doc, 'A.  VEHICLE DETAILS', y);
    autoTable(doc, {
        startY: y, margin: { left: 15, right: 15 },
        head: [['Field', 'Value', 'Field', 'Value']],
        body: [
            ['Vehicle ID',        truck.truckId        || '—', 'Number Plate',   truck.licensePlate      || '—'],
            ['Registration Date', fmt(truck.registrationDate),  'Status',         (truck.status || '—').toUpperCase()],
            ['Mileage',           `${truck.fuelEfficiency || '—'} km/l`, 'Tank Capacity', `${truck.tankCapacity || '—'} L`],
            ['Diesel Cost',       `Rs.${truck.costPerLitre || '—'}/L`,   'CO2 Emission',  `${truck.emissionFactor || '—'} kg/L`],
        ],
        styles: { fontSize: 8.5, cellPadding: 3 },
        headStyles: TABLE_HEAD,
        columnStyles: { 0: { fontStyle: 'bold', fillColor: TABLE_ALT }, 2: { fontStyle: 'bold', fillColor: TABLE_ALT } },
    });
    y = doc.lastAutoTable.finalY + 7;

    // B. Insurance & Documents
    y = sectionHeader(doc, 'B.  INSURANCE & DOCUMENTS', y);
    autoTable(doc, {
        startY: y, margin: { left: 15, right: 15 },
        head: [['Field', 'Value']],
        body: [
            ['Insurance Policy No.',      truck.insuranceNumber  || '—'],
            ['Insurance Expiry Date',      fmt(truck.insuranceExpiry)],
            ['RC / Tax Document No.',      truck.taxDocumentNumber || '—'],
            ['TN State Permit',            truck.stateTaxPermitPath    ? `Uploaded: ${truck.stateTaxPermitPath}`    : 'Not Uploaded'],
            ['National Permit (Central)',  truck.centralTaxPermitPath  ? `Uploaded: ${truck.centralTaxPermitPath}`  : 'Not Uploaded'],
        ],
        styles: { fontSize: 8.5, cellPadding: 3 },
        headStyles: TABLE_HEAD,
        columnStyles: { 0: { fontStyle: 'bold', fillColor: TABLE_ALT, cellWidth: 62 } },
    });
    y = doc.lastAutoTable.finalY + 7;

    // C. Road Tax Compliance
    y = sectionHeader(doc, 'C.  ROAD TAX COMPLIANCE', y);
    const stSt = complianceStatus(truck.stateTaxNextDue);
    const ctSt = complianceStatus(truck.centralTaxNextDue);
    autoTable(doc, {
        startY: y, margin: { left: 15, right: 15 },
        head: [['Tax Type', 'Amount Paid', 'Last Payment', 'Next Due', 'Status']],
        body: [
            [
                'TN State Road Tax (Quarterly)',
                truck.stateTaxAmount ? `Rs.${Number(truck.stateTaxAmount).toLocaleString('en-IN')}` : '—',
                fmt(truck.stateTaxPaidDate),
                fmt(truck.stateTaxNextDue),
                stSt.text,
            ],
            [
                'Central Government Tax (Annual)',
                truck.centralTaxAmount ? `Rs.${Number(truck.centralTaxAmount).toLocaleString('en-IN')}` : '—',
                fmt(truck.centralTaxPaidDate),
                fmt(truck.centralTaxNextDue),
                ctSt.text,
            ],
        ],
        styles: { fontSize: 8.5, cellPadding: 3 },
        headStyles: TABLE_HEAD,
        columnStyles: { 0: { fontStyle: 'bold', fillColor: TABLE_ALT } },
        didParseCell: (data) => {
            if (data.section === 'body' && data.column.index === 4) {
                const st = data.row.index === 0 ? stSt : ctSt;
                data.cell.styles.textColor = st.color;
                data.cell.styles.fontStyle = 'bold';
            }
        },
    });
    y = doc.lastAutoTable.finalY + 7;

    // D. FC Renewal Schedule
    if (truck.fcRenewalDates?.length) {
        y = sectionHeader(doc, 'D.  FC (FITNESS CERTIFICATE) RENEWAL SCHEDULE', y);
        const fcLabels = ['6 months', '12 months', '18 months', '24 months'];
        autoTable(doc, {
            startY: y, margin: { left: 15, right: 15 },
            head: [['Renewal Checkpoint', 'Due Date', 'Status']],
            body: truck.fcRenewalDates.map((d, i) => {
                const s = complianceStatus(d);
                return [`FC Renewal ${i + 1}  (${fcLabels[i] || ''})`, fmt(d), s.text];
            }),
            styles: { fontSize: 8.5, cellPadding: 3 },
            headStyles: TABLE_HEAD,
            columnStyles: { 0: { fontStyle: 'bold', fillColor: TABLE_ALT } },
            didParseCell: (data) => {
                if (data.section === 'body' && data.column.index === 2) {
                    const s = complianceStatus(truck.fcRenewalDates[data.row.index]);
                    data.cell.styles.textColor = s.color;
                    data.cell.styles.fontStyle = 'bold';
                }
            },
        });
        y = doc.lastAutoTable.finalY + 7;
    }

    // E. Trip History
    if (trips.length > 0) {
        if (y > 220) { doc.addPage(); y = drawLetterhead(doc, `Lorry Report — ${truck.licensePlate} (cont.)`); }
        y = sectionHeader(doc, `E.  TRIP HISTORY  (${trips.length} trip${trips.length !== 1 ? 's' : ''})`, y);
        autoTable(doc, {
            startY: y, margin: { left: 15, right: 15 },
            head: [['Source', 'Destination', 'Driver', 'Assistant', 'Distance', 'Toll', 'Total Cost', 'Status', 'Start Date']],
            body: trips.map((t) => [
                t.source || '—',
                t.destination || '—',
                t.driverId?.username || t.driverId || '—',
                t.assistantId?.username || t.assistantId || '—',
                `${t.distance || 0} km`,
                t.tollCount ? `${t.tollCount}×Rs.${t.tollPrice}` : '—',
                t.totalTripCost ? `Rs.${Number(t.totalTripCost).toLocaleString('en-IN')}` : '—',
                (t.status || '—').replace('_', ' ').toUpperCase(),
                fmt(t.tripStartTime || t.createdAt),
            ]),
            styles: { fontSize: 7.5, cellPadding: 2.5 },
            headStyles: TABLE_HEAD,
            didParseCell: (data) => {
                if (data.section === 'body' && data.column.index === 7) {
                    const s = data.cell.text[0];
                    if (s.includes('COMPLETED')) data.cell.styles.textColor = [20, 130, 20];
                    else if (s.includes('TRANSIT')) data.cell.styles.textColor = [20, 80, 200];
                    else if (s.includes('DELAYED')) data.cell.styles.textColor = [200, 30, 30];
                }
            },
        });
        y = doc.lastAutoTable.finalY + 7;
    }

    // F. Embedded permit images (skip PDFs)
    const permitItems = [
        truck.stateTaxPermitPath   && { url: truck.stateTaxPermitPath,   label: 'TN State Tax Permit' },
        truck.centralTaxPermitPath && { url: truck.centralTaxPermitPath, label: 'Central National Permit' },
    ].filter(Boolean);

    for (const { url, label } of permitItems) {
        const dataURL = await toDataURL(url);
        if (!dataURL) continue;
        if (y > 190) { doc.addPage(); y = drawLetterhead(doc, `Lorry Report — ${truck.licensePlate} (cont.)`); }
        y = sectionHeader(doc, `UPLOADED DOCUMENT — ${label}`, y);
        try {
            const imgMaxW = w - 30;
            const imgH    = 85;
            doc.addImage(dataURL, 15, y, imgMaxW, imgH, undefined, 'FAST');
            doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.3);
            doc.rect(15, y, imgMaxW, imgH);
            y += imgH + 7;
        } catch { /* image could not be embedded — skip gracefully */ }
    }

    addFooters(doc);
    doc.save(`Lorry_Report_${(truck.licensePlate || 'unknown').replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. ALL LORRIES FLEET REPORT
// ─────────────────────────────────────────────────────────────────────────────
export function generateAllLorriesReport(trucks) {
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
    const w = doc.internal.pageSize.getWidth();
    let y = drawLetterhead(doc, `Fleet Overview Report   (${trucks.length} Lorries)`);

    y = sectionHeader(doc, `ALL LORRIES — FLEET REGISTER`, y);
    autoTable(doc, {
        startY: y, margin: { left: 12, right: 12 },
        head: [['#', 'Number Plate', 'Reg. Date', 'Status', 'Mileage', 'Tank', 'Ins. Expiry', 'TN Tax Due', 'TN Status', 'Central Due', 'Central Status', 'Insurance No.']],
        body: trucks.map((t, i) => {
            const sts = complianceStatus(t.stateTaxNextDue);
            const cts = complianceStatus(t.centralTaxNextDue);
            return [
                i + 1,
                t.licensePlate || '—',
                fmt(t.registrationDate),
                (t.status || '—').toUpperCase(),
                `${t.fuelEfficiency || '—'} km/l`,
                `${t.tankCapacity || '—'} L`,
                fmt(t.insuranceExpiry),
                fmt(t.stateTaxNextDue),
                sts.text,
                fmt(t.centralTaxNextDue),
                cts.text,
                t.insuranceNumber || '—',
            ];
        }),
        styles: { fontSize: 7, cellPadding: 2.2 },
        headStyles: TABLE_HEAD,
        columnStyles: { 0: { cellWidth: 8 }, 1: { fontStyle: 'bold' } },
        didParseCell: (data) => {
            if (data.section !== 'body') return;
            const t = trucks[data.row.index];
            if (!t) return;
            if (data.column.index === 3) {
                if (t.status === 'active') data.cell.styles.textColor = [20, 130, 20];
                else if (t.status === 'maintenance') data.cell.styles.textColor = [180, 100, 0];
                else data.cell.styles.textColor = [100, 100, 100];
                data.cell.styles.fontStyle = 'bold';
            }
            if (data.column.index === 8) {
                const s = complianceStatus(t.stateTaxNextDue);
                data.cell.styles.textColor = s.color;
            }
            if (data.column.index === 10) {
                const s = complianceStatus(t.centralTaxNextDue);
                data.cell.styles.textColor = s.color;
            }
        },
        alternateRowStyles: { fillColor: [250, 251, 255] },
    });

    addFooters(doc);
    doc.save(`All_Lorries_Report_${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. INDIVIDUAL PERSON REPORT (Driver / Assistant)
// ─────────────────────────────────────────────────────────────────────────────
export async function generatePersonReport(person) {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const w = doc.internal.pageSize.getWidth();
    const roleLabel = person.role === 'driver' ? 'Driver' : person.role === 'assistant' ? 'Assistant' : 'Staff';
    let y = drawLetterhead(doc, `${roleLabel} Report — ${person.fullName || person.username}`);

    // Attempt to embed profile photo (top-right)
    let photoEmbedded = false;
    if (person.photoPath) {
        const dataURL = await toDataURL(`/api/${person.photoPath}`);
        if (dataURL) {
            try {
                const photoX = w - 55;
                const photoY = y + 10;
                doc.addImage(dataURL, photoX, photoY, 38, 38, undefined, 'FAST');
                doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.3);
                doc.rect(photoX, photoY, 38, 38);
                doc.setFontSize(7); doc.setTextColor(140, 140, 140);
                doc.text('Profile Photo', photoX + 19, photoY + 41, { align: 'center' });
                photoEmbedded = true;
            } catch { /* skip */ }
        }
    }

    const rightMargin = photoEmbedded ? 62 : 15;

    // A. Personal Information
    y = sectionHeader(doc, 'A.  PERSONAL INFORMATION', y);
    autoTable(doc, {
        startY: y, margin: { left: 15, right: rightMargin },
        head: [['Field', 'Value']],
        body: [
            ['Full Name',     person.fullName       || '—'],
            ['Username',      person.username        || '—'],
            ['Role',          (person.role || '—').toUpperCase()],
            ['Date of Birth', fmt(person.dateOfBirth)],
            ['Age',           person.dateOfBirth
                ? `${Math.floor((Date.now() - new Date(person.dateOfBirth).getTime()) / (365.25 * 24 * 3600 * 1000))} years`
                : '—'],
            ['Phone',         person.phone           || '—'],
            ['Alt. Phone',    person.additionalPhone || '—'],
            ['Email',         person.email           || '—'],
            ['Address',       person.address         || '—'],
            ['Joined On',     fmt(person.createdAt)],
        ],
        styles: { fontSize: 8.5, cellPadding: 3 },
        headStyles: TABLE_HEAD,
        columnStyles: { 0: { fontStyle: 'bold', fillColor: TABLE_ALT, cellWidth: 55 } },
    });
    y = doc.lastAutoTable.finalY + 7;
    if (photoEmbedded && y < 105) y = 105; // don't overlap photo

    // B. Professional Details
    y = sectionHeader(doc, 'B.  PROFESSIONAL DETAILS', y);
    const maskedAadhaar = person.aadharNumber
        ? `**** **** ${person.aadharNumber.replace(/\s/g, '').slice(-4)}`
        : '—';
    const profRows = [];
    if (person.role === 'driver') {
        profRows.push(['Driving Licence No.', person.driverLicenceNumber || '—']);
    }
    profRows.push(
        ['Aadhaar Number',  maskedAadhaar],
        ['Experience',      person.experienceYears ? `${person.experienceYears} years` : '—'],
    );
    autoTable(doc, {
        startY: y, margin: { left: 15, right: 15 },
        head: [['Field', 'Value']],
        body: profRows,
        styles: { fontSize: 8.5, cellPadding: 3 },
        headStyles: TABLE_HEAD,
        columnStyles: { 0: { fontStyle: 'bold', fillColor: TABLE_ALT, cellWidth: 55 } },
    });
    y = doc.lastAutoTable.finalY + 7;

    // C. Contact Details (dedicated section for clarity)
    // Move to next page when there isn't enough space to keep this section readable.
    if (y > doc.internal.pageSize.getHeight() - 65) {
        doc.addPage();
        y = 20;
    }
    y = sectionHeader(doc, 'C.  CONTACT DETAILS', y);
    autoTable(doc, {
        startY: y, margin: { left: 15, right: 15 },
        head: [['Field', 'Value']],
        body: [
            ['Primary Phone', person.phone || '—'],
            ['Alt. Phone', person.additionalPhone || '—'],
            ['Email Address', person.email || '—'],
            ['Username', person.username || '—'],
            ['Address', person.address || '—'],
            ['Joined On', fmt(person.createdAt)],
        ],
        styles: { fontSize: 8.5, cellPadding: 3, valign: 'middle' },
        headStyles: TABLE_HEAD,
        columnStyles: {
            0: { fontStyle: 'bold', fillColor: TABLE_ALT, cellWidth: 55 },
            1: { cellWidth: 'auto' },
        },
        rowPageBreak: 'avoid',
    });
    y = doc.lastAutoTable.finalY + 7;

    addFooters(doc);
    doc.save(`${roleLabel}_Report_${(person.fullName || person.username || 'unknown').replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. PERSONNEL REPORTS (All / Drivers only / Assistants only)
// ─────────────────────────────────────────────────────────────────────────────
function _buildPeopleTable(doc, people, title, y) {
    y = sectionHeader(doc, title, y);
    autoTable(doc, {
        startY: y, margin: { left: 12, right: 12 },
        head: [['#', 'Full Name', 'Role', 'Phone', 'Alt. Phone', 'Email', 'D.O.B', 'Age', 'Licence No.', 'Aadhaar (last 4)', 'Exp.', 'Address', 'Joined']],
        body: people.map((p, i) => {
            const age = p.dateOfBirth
                ? Math.floor((Date.now() - new Date(p.dateOfBirth).getTime()) / (365.25 * 24 * 3600 * 1000))
                : '—';
            const aadhaar = p.aadharNumber
                ? `**** ${p.aadharNumber.replace(/\s/g, '').slice(-4)}`
                : '—';
            return [
                i + 1,
                p.fullName          || p.username || '—',
                (p.role || '—').toUpperCase(),
                p.phone             || '—',
                p.additionalPhone   || '—',
                p.email             || '—',
                fmt(p.dateOfBirth),
                age,
                p.driverLicenceNumber || '—',
                aadhaar,
                p.experienceYears ? `${p.experienceYears} yrs` : '—',
                p.address           || '—',
                fmt(p.createdAt),
            ];
        }),
        styles: { fontSize: 6.8, cellPadding: 2 },
        headStyles: TABLE_HEAD,
        columnStyles: {
            0: { cellWidth: 7 },
            1: { fontStyle: 'bold', cellWidth: 28 },
            2: { cellWidth: 18 },
            11: { cellWidth: 30 },
        },
        didParseCell: (data) => {
            if (data.section === 'body' && data.column.index === 2) {
                const role = data.cell.text[0];
                if (role === 'DRIVER')    data.cell.styles.textColor = [20, 80, 200];
                else if (role === 'ASSISTANT') data.cell.styles.textColor = [120, 20, 180];
                data.cell.styles.fontStyle = 'bold';
            }
        },
        alternateRowStyles: { fillColor: [250, 251, 255] },
    });
    return doc.lastAutoTable.finalY + 7;
}

export function generateAllPeopleReport(people) {
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
    let y = drawLetterhead(doc, `Personnel Directory Report   (${people.length} Records)`);
    _buildPeopleTable(doc, people, 'ALL PERSONNEL — DRIVER & ASSISTANT REGISTER', y);
    addFooters(doc);
    doc.save(`Personnel_Report_${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function generateAllDriversReport(drivers) {
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
    let y = drawLetterhead(doc, `All Drivers Report   (${drivers.length} Drivers)`);
    _buildPeopleTable(doc, drivers, 'DRIVER REGISTER — PROFESSIONAL & CONTACT DETAILS', y);
    addFooters(doc);
    doc.save(`All_Drivers_Report_${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function generateAllAssistantsReport(assistants) {
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
    let y = drawLetterhead(doc, `All Assistants Report   (${assistants.length} Assistants)`);
    _buildPeopleTable(doc, assistants, 'ASSISTANT REGISTER — PROFESSIONAL & CONTACT DETAILS', y);
    addFooters(doc);
    doc.save(`All_Assistants_Report_${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. ALL TRIPS REPORT
// ─────────────────────────────────────────────────────────────────────────────
export function generateAllTripsReport(trips) {
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
    const w = doc.internal.pageSize.getWidth();
    let y = drawLetterhead(doc, `Trip Register Report   (${trips.length} Trips)`);

    y = sectionHeader(doc, `COMPLETE TRIP REGISTER`, y);
    autoTable(doc, {
        startY: y, margin: { left: 12, right: 12 },
        head: [['#', 'Source', 'Destination', 'Lorry', 'Driver', 'Assistant', 'Dist.', 'Est.Fuel', 'Est.Cost', 'Real Fuel', 'Real Cost', 'Toll', 'Food', 'Total', 'Status', 'Start Date']],
        body: trips.map((t, i) => [
            i + 1,
            t.source || '—',
            t.destination || '—',
            t.truckId?.licensePlate || t.truckId?.truckId || '—',
            t.driverId?.username   || '—',
            t.assistantId?.username || '—',
            `${t.distance || 0}km`,
            `${(t.estimated?.fuelConsumed ?? t.fuelConsumed ?? 0).toFixed(1)}L`,
            `Rs.${(t.estimated?.fuelCost ?? 0).toFixed(0)}`,
            `${(t.realtime?.fuelConsumed ?? 0).toFixed(1)}L`,
            `Rs.${(t.realtime?.fuelCost ?? 0).toFixed(0)}`,
            t.tollCount ? `${t.tollCount}×Rs.${t.tollPrice}` : '—',
            t.foodCost  ? `Rs.${t.foodCost}` : '—',
            t.totalTripCost ? `Rs.${Number(t.totalTripCost).toLocaleString('en-IN')}` : '—',
            (t.status || '—').replace('_', ' ').toUpperCase(),
            fmt(t.tripStartTime || t.createdAt),
        ]),
        styles: { fontSize: 6.5, cellPadding: 2 },
        headStyles: TABLE_HEAD,
        columnStyles: { 0: { cellWidth: 7 } },
        didParseCell: (data) => {
            if (data.section === 'body' && data.column.index === 14) {
                const s = data.cell.text[0];
                if (s.includes('COMPLETED'))     data.cell.styles.textColor = [20, 130, 20];
                else if (s.includes('TRANSIT'))  data.cell.styles.textColor = [20, 80, 200];
                else if (s.includes('DELAYED'))  data.cell.styles.textColor = [200, 30, 30];
            }
        },
        alternateRowStyles: { fillColor: [250, 251, 255] },
    });

    addFooters(doc);
    doc.save(`All_Trips_Report_${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. INDIVIDUAL TRIP REPORT
// ─────────────────────────────────────────────────────────────────────────────
export function generateTripReport(trip) {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const w = doc.internal.pageSize.getWidth();
    let y = drawLetterhead(doc, `Trip Report — ${trip.source || '?'} → ${trip.destination || '?'}`);

    // A. Trip Overview
    y = sectionHeader(doc, 'A.  TRIP OVERVIEW', y);
    autoTable(doc, {
        startY: y, margin: { left: 15, right: 15 },
        head: [['Field', 'Value', 'Field', 'Value']],
        body: [
            ['Source',      trip.source       || '—', 'Destination',     trip.destination    || '—'],
            ['Lorry',       trip.truckId?.licensePlate || trip.truckId?.truckId || '—',
             'Status',      (trip.status || '—').replace('_', ' ').toUpperCase()],
            ['Driver',      trip.driverId?.username    || trip.driverId    || '—',
             'Assistant',   trip.assistantId?.username || trip.assistantId || '—'],
            ['Distance',    `${trip.distance || 0} km`,
             'Est. Duration', trip.estimated?.durationText || trip.duration || '—'],
            ['Trip Start',  fmtDateTime(trip.tripStartTime), 'Trip End', fmtDateTime(trip.tripEndTime)],
        ],
        styles: { fontSize: 8.5, cellPadding: 3 },
        headStyles: TABLE_HEAD,
        columnStyles: { 0: { fontStyle: 'bold', fillColor: TABLE_ALT }, 2: { fontStyle: 'bold', fillColor: TABLE_ALT } },
    });
    y = doc.lastAutoTable.finalY + 7;

    // B. Cost Breakdown
    y = sectionHeader(doc, 'B.  COST BREAKDOWN  (Estimated vs. Actual)', y);
    autoTable(doc, {
        startY: y, margin: { left: 15, right: 15 },
        head: [['Cost Category', 'Estimated', 'Actual (Realtime)']],
        body: [
            ['Fuel Consumed',
             `${(trip.estimated?.fuelConsumed ?? trip.fuelConsumed ?? 0).toFixed(2)} L`,
             `${(trip.realtime?.fuelConsumed ?? 0).toFixed(2)} L`],
            ['Fuel Cost',
             `Rs. ${(trip.estimated?.fuelCost ?? 0).toFixed(2)}`,
             `Rs. ${(trip.realtime?.fuelCost ?? 0).toFixed(2)}`],
            ['Toll Cost',
             trip.tollCount ? `${trip.tollCount} booths × Rs.${trip.tollPrice} = Rs.${((trip.estimated?.tollCost ?? trip.tollTotalCost ?? 0)).toFixed(2)}` : '—',
             `Rs. ${(trip.realtime?.tollCost ?? 0).toFixed(2)}`],
            ['Food Cost',
             `Rs. ${(trip.estimated?.foodCost ?? trip.foodCost ?? 0).toFixed(2)}`,
             `Rs. ${(trip.realtime?.foodCost ?? 0).toFixed(2)}`],
            ['TOTAL TRIP COST',
             `Rs. ${(trip.estimated?.totalCost ?? 0).toFixed(2)}`,
             `Rs. ${Number(trip.totalTripCost ?? 0).toLocaleString('en-IN')}`],
        ],
        styles: { fontSize: 8.5, cellPadding: 3 },
        headStyles: TABLE_HEAD,
        columnStyles: { 0: { fontStyle: 'bold', fillColor: TABLE_ALT, cellWidth: 65 } },
        didParseCell: (data) => {
            if (data.section === 'body' && data.row.index === 4) {
                data.cell.styles.fontStyle = 'bold';
                data.cell.styles.fillColor = [240, 244, 255];
                data.cell.styles.textColor = [20, 40, 120];
            }
        },
    });

    addFooters(doc);
    const src = (trip.source       || 'trip').replace(/\s+/g, '_');
    const dst = (trip.destination  || '').replace(/\s+/g, '_');
    doc.save(`Trip_Report_${src}_to_${dst}_${new Date().toISOString().slice(0, 10)}.pdf`);
}
