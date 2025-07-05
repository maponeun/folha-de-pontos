import React, { useState, useEffect, useCallback } from 'react';
import { LucideClock, LucideCalendar, LucideUser, LucideFileText, LucideBriefcase, LucideRoute, LucideDownload, LucideSave, LucideXCircle, LucideCheckCircle, LucideAlertTriangle } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc, onSnapshot } from 'firebase/firestore';
import { getAuth, onAuthStateChanged, signInAnonymously, signInWithCustomToken } from 'firebase/auth';

// Import the functions you need from the SDKs you need
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyA7QmxkTh4_Py_GgN3BHkPVjk_pP8WK54I",
  authDomain: "folha-de-ponto-individual.firebaseapp.com",
  projectId: "folha-de-ponto-individual",
  storageBucket: "folha-de-ponto-individual.firebasestorage.app",
  messagingSenderId: "445138363449",
  appId: "1:445138363449:web:bd22f2874aa1093dfb19e8"
};

// --- Firebase Initialization ---
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// --- Constants ---
const siteLogo = "https://upload.wikimedia.org/wikipedia/commons/4/48/Bras%C3%A3o_de_Caruaru.png";
const pdfLogoUrl = "https://upload.wikimedia.org/wikipedia/commons/4/48/Bras%C3%A3o_de_Caruaru.png";


// --- Helper Functions ---
const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
const getWeekday = (year, month, day) => {
    const date = new Date(year, month, day);
    return date.toLocaleDateString('pt-BR', { weekday: 'long' }).replace(/^\w/, c => c.toUpperCase());
};
const formatTime = (date) => date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

// --- Main App Component ---
export default function App() {
    // --- State Management ---
    const [userId, setUserId] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [scriptsLoaded, setScriptsLoaded] = useState(false);
    const [notification, setNotification] = useState({ show: false, message: '', type: 'info' });

    const [serverName, setServerName] = useState('');
    const [cpf, setCpf] = useState('');
    const [role, setRole] = useState('');
    const [route, setRoute] = useState('Regular');
    
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

    const [timeEntries, setTimeEntries] = useState([]);
    
    const docId = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;

    // --- Notification Effect ---
    useEffect(() => {
        if (notification.show) {
            const timer = setTimeout(() => {
                setNotification({ show: false, message: '', type: 'info' });
            }, 5000);
            return () => clearTimeout(timer);
        }
    }, [notification]);

    // --- Load PDF Generation Scripts (Sequentially) ---
    useEffect(() => {
        if (window.jspdf && window.jspdf.jsPDF.autoTable) {
            setScriptsLoaded(true);
            return;
        }

        const jspdfScript = document.createElement('script');
        jspdfScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
        jspdfScript.async = true;

        jspdfScript.onload = () => {
            const autotableScript = document.createElement('script');
            autotableScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js';
            autotableScript.async = true;
            
            autotableScript.onload = () => {
                setScriptsLoaded(true);
            };
            
            document.body.appendChild(autotableScript);
        };

        document.body.appendChild(jspdfScript);

        return () => {
            const existingJspdf = document.querySelector('script[src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"]');
            const existingAutotable = document.querySelector('script[src="https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js"]');
            if (existingJspdf) document.body.removeChild(existingJspdf);
            if (existingAutotable) document.body.removeChild(existingAutotable);
        };
    }, []);
    
  // --- Authentication Effect ---
useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
        if (user) {
            setUserId(user.uid);
        } else {
            try {
                await signInAnonymously(auth);
            } catch (error) {
                console.error("Error during sign-in:", error);
            }
        }
        setIsAuthReady(true);
    });
    return () => unsubscribe();
}, []);

    const createInitialTimeEntries = (year, month) => {
        const daysInMonth = getDaysInMonth(year, month);
        const entries = [];
        for (let day = 1; day <= daysInMonth; day++) {
            entries.push({
                day: day,
                weekday: getWeekday(year, month, day),
                morning1Start: '', morning1End: '', morning2Start: '', morning2End: '',
                afternoon1Start: '', afternoon1End: '', afternoon2Start: '', afternoon2End: '',
                status: '',
            });
        }
        return entries;
    };

   // --- Data Loading ---
useEffect(() => {
    if (!isAuthReady || !userId) return;

    setIsLoading(true);
    const docRef = doc(db, `artifacts/${firebaseConfig.appId}/users/${userId}/timesheets`, docId);

    const unsubscribe = onSnapshot(docRef, (docSnap) => {
        let newEntries = createInitialTimeEntries(selectedYear, selectedMonth);
        if (docSnap.exists()) {
            const data = docSnap.data();
            setServerName(data.serverName || '');
            setCpf(data.cpf || '');
            setRole(data.role || '');
            setRoute(data.route || 'Regular');
            try {
                const parsedEntries = JSON.parse(data.timeEntries || '[]');
                if (Array.isArray(parsedEntries) && parsedEntries.length > 0) {
                    const savedEntriesMap = new Map(parsedEntries.map(e => [e.day, e]));
                    newEntries = newEntries.map(entry => savedEntriesMap.has(entry.day) ? { ...entry, ...savedEntriesMap.get(entry.day) } : entry);
                }
            } catch (e) { console.error("Error parsing time entries:", e); }
        } else {
            setServerName(''); setCpf(''); setRole(''); setRoute('Regular');
        }
        setTimeEntries(newEntries);
        setIsLoading(false);
    }, (error) => {
        console.error("Error with snapshot listener:", error);
        setIsLoading(false);
    });

    return () => unsubscribe();
}, [selectedMonth, selectedYear, isAuthReady, userId, firebaseConfig.appId, docId]);


    // --- Event Handlers ---
    const handleTimeChange = (index, period, value) => {
        const updatedEntries = [...timeEntries];
        updatedEntries[index][period] = value;
        setTimeEntries(updatedEntries);
    };
    
    const handleStatusChange = (index, value) => {
        const updatedEntries = [...timeEntries];
        updatedEntries[index].status = value;
        setTimeEntries(updatedEntries);
    };

    const handleClockClick = (index, period) => handleTimeChange(index, period, formatTime(new Date()));

    const handleCpfChange = (e) => {
        let value = e.target.value.replace(/\D/g, '');
        value = value.replace(/(\d{3})(\d)/, '$1.$2');
        value = value.replace(/(\d{3})(\d)/, '$1.$2');
        value = value.replace(/(\d{3})(\d{1,2})$/, '$1-$2');
        setCpf(value.slice(0, 14));
    };

// --- Manual Save Function ---
const handleSave = async () => {
    if (!isAuthReady || !userId) {
        setNotification({ show: true, message: 'Autenticação pendente. Tente novamente.', type: 'warn' });
        return;
    }
    
    const docRef = doc(db, `artifacts/${firebaseConfig.appId}/users/${userId}/timesheets`, docId);
    const dataToSave = { serverName, cpf, role, route, timeEntries: JSON.stringify(timeEntries || []) };
    
    try {
        await setDoc(docRef, dataToSave, { merge: true });
        setNotification({ show: true, message: 'Dados salvos com sucesso!', type: 'success' });
    } catch (error) {
        console.error("Error saving data: ", error);
        setNotification({ show: true, message: 'Erro ao salvar os dados.', type: 'error' });
    }
};


    // --- PDF Generation ---
    const generatePdf = () => {
        if (!scriptsLoaded || !window.jspdf) {
            setNotification({ show: true, message: 'Recursos para gerar PDF ainda estão carregando. Tente novamente.', type: 'warn' });
            return;
        }

        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.src = pdfLogoUrl;

        img.onload = () => {
            try {
                const { jsPDF } = window.jspdf;
                const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
                const pageHeight = doc.internal.pageSize.getHeight();
                const pageWidth = doc.internal.pageSize.getWidth();
                
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                const dataURL = canvas.toDataURL('image/png');

                // --- PDF Header ---
                doc.addImage(dataURL, 'PNG', 10, 8, 22, 22);
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(10);
                doc.text('SECRETARIA DE EDUCAÇÃO E ESPORTES | GERÊNCIA GERAL DE TRANSPORTE', pageWidth / 2, 15, { align: 'center' });
                doc.setFontSize(12);
                doc.text('FOLHA DE PONTO INDIVIDUAL', pageWidth / 2, 22, { align: 'center' });

                // --- PDF User Info ---
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(9);
                const infoY = 38;
                doc.text(`Servidor: ${serverName}`, 38, infoY);
                doc.text(`CPF: ${cpf}`, 110, infoY);
                doc.text(`Rota: ${route}`, 160, infoY);
                doc.text(`Cargo: ${role}`, 38, infoY + 6);
                doc.text(`Mês: ${months[selectedMonth]}`, 110, infoY + 6);
                doc.text(`Ano: ${selectedYear}`, 160, infoY + 6);

                // --- PDF Table ---
                const tableBody = timeEntries.map(entry => {
                    const isWeekend = ['Sábado', 'Domingo'].includes(entry.weekday);
                    const isFullDayOff = ['Feriado', 'Ponto Facultativo', 'Folga', 'Falta', 'Atestado Médico', 'Recesso Escolar', 'Férias'].includes(entry.status);
                    const rowStyle = (isWeekend || isFullDayOff) ? { fillColor: '#f0f0f0' } : {};
                    
                    if (isWeekend || isFullDayOff) {
                        return [
                            { content: `${entry.day}, ${entry.weekday}`, styles: { fontStyle: 'bold', ...rowStyle } },
                            { content: entry.status || entry.weekday, colSpan: 8, styles: { halign: 'center', fontStyle: 'italic', textColor: '#555', ...rowStyle } }
                        ];
                    }
                    return [
                        { content: `${entry.day}, ${entry.weekday}`, styles: rowStyle },
                        { content: entry.morning1Start, styles: rowStyle }, { content: entry.morning1End, styles: rowStyle },
                        { content: entry.morning2Start, styles: rowStyle }, { content: entry.morning2End, styles: rowStyle },
                        { content: entry.afternoon1Start, styles: rowStyle }, { content: entry.afternoon1End, styles: rowStyle },
                        { content: entry.afternoon2Start, styles: rowStyle }, { content: entry.afternoon2End, styles: rowStyle },
                    ];
                });

                doc.autoTable({
                    startY: infoY + 12,
                    head: [
                        [
                            { content: 'Dia', rowSpan: 2, styles: { valign: 'middle', halign: 'center' } },
                            { content: 'Manhã', colSpan: 4, styles: { halign: 'center' } },
                            { content: 'Tarde', colSpan: 4, styles: { halign: 'center' } },
                        ],
                        ['Início', 'Fim', 'Início', 'Fim', 'Início', 'Fim', 'Início', 'Fim']
                    ],
                    body: tableBody,
                    theme: 'grid',
                    headStyles: {
                        fillColor: [22, 101, 52],
                        textColor: [255, 255, 255],
                        fontStyle: 'bold',
                        halign: 'center',
                        fontSize: 7,
                    },
                    styles: {
                        fontSize: 7.5,
                        cellPadding: 1.6,
                        halign: 'center',
                        lineWidth: 0.1,
                        lineColor: [128, 128, 128]
                    },
                    columnStyles: {
                        0: { halign: 'left', cellWidth: 30, fontStyle: 'bold' },
                    },
                    didDrawPage: (data) => {
                        // --- PDF Footer ---
                        const signatureY = pageHeight - 28;
                        doc.line(20, signatureY, 90, signatureY);
                        doc.text('Assinatura do Servidor', 55, signatureY + 4, { align: 'center' });

                        doc.line(pageWidth - 90, signatureY, pageWidth - 20, signatureY);
                        doc.text('Assinatura do Responsável pelo Setor', pageWidth - 55, signatureY + 4, { align: 'center' });

                        const footerY = pageHeight - 18;
                        doc.setFillColor(22, 101, 52);
                        doc.rect(0, footerY, pageWidth, 18, 'F');
                        
                        doc.setFontSize(9);
                        doc.setTextColor(255, 255, 255);
                        doc.setFont('helvetica', 'bold');
                        doc.text('SECRETARIA DE EDUCAÇÃO E ESPORTE', pageWidth / 2, footerY + 7, { align: 'center' });
                        
                        doc.setFont('helvetica', 'normal');
                        doc.setFontSize(8);
                        doc.text('Avenida Cícero José Dutra, Petrópolis, Caruaru - PE - CEP 55030-580', pageWidth / 2, footerY + 12, { align: 'center' });
                    },
                    margin: { top: 30, bottom: 30 }
                });
                
                const nameParts = serverName.trim().split(/\s+/);
                const firstName = nameParts[0] || '';
                const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : '';
                const formattedName = `${firstName}_${lastName}`.replace(/_$/, '');
                const fileName = `Ponto_${formattedName || 'Servidor'}_${months[selectedMonth]}_${selectedYear}.pdf`;

                doc.save(fileName);
                setNotification({ show: true, message: 'PDF gerado com sucesso!', type: 'success' });

            } catch (error) {
                 console.error("PDF Generation Error:", error);
                 setNotification({ show: true, message: 'Erro ao gerar PDF. Verifique o console.', type: 'error' });
            }
        };

        img.onerror = () => {
             setNotification({ show: true, message: 'Não foi possível carregar a imagem do logotipo para o PDF.', type: 'error' });
        };
    };

    const months = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
    const currentYear = new Date().getFullYear();
    const years = Array.from({ length: 10 }, (_, i) => currentYear - 5 + i);

    const NotificationComponent = () => {
        if (!notification.show) return null;
        const colors = {
            info: 'bg-blue-500',
            success: 'bg-green-500',
            warn: 'bg-yellow-500',
            error: 'bg-red-500',
        };
        const Icon = {
            info: LucideAlertTriangle,
            success: LucideCheckCircle,
            warn: LucideAlertTriangle,
            error: LucideXCircle,
        }[notification.type];

        return (
            <div className={`fixed top-5 right-5 ${colors[notification.type]} text-white py-2 px-4 rounded-lg shadow-lg flex items-center z-50`}>
                <Icon className="mr-2" />
                {notification.message}
            </div>
        );
    };

    return (
        <div className="bg-gray-50 min-h-screen font-sans text-gray-800">
            <NotificationComponent />
            <header className="bg-green-700 p-4 shadow-md">
                 <div className="container mx-auto flex flex-col sm:flex-row items-center justify-between">
                    <div className="flex items-center mb-4 sm:mb-0">
                        <img src={siteLogo} alt="Brasão da Prefeitura de Caruaru" className="h-16 w-auto mr-4" />
                        <div className="flex flex-col justify-center">
                            <h1 className="text-white text-lg font-semibold">Secretaria de Educação e Esportes</h1>
                            <h2 className="text-green-200 text-sm">Gerência Geral do Transporte</h2>
                            <h3 className="text-white font-bold text-xl mt-1">Folha de Ponto Individual</h3>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                         <button onClick={handleSave} disabled={isLoading} className="bg-blue-500 text-white font-bold py-2 px-4 rounded-lg shadow-md hover:bg-blue-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center">
                            <LucideSave size={18} className="mr-2"/> Salvar
                        </button>
                         <button onClick={generatePdf} disabled={!scriptsLoaded || isLoading} className="bg-white text-green-700 font-bold py-2 px-4 rounded-lg shadow-md hover:bg-green-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center">
                            <LucideDownload size={18} className="mr-2"/> Gerar PDF
                        </button>
                    </div>
                </div>
            </header>

            <main className="container mx-auto p-4 md:p-6">
                <div className="bg-green-50/50 border border-green-200 p-6 rounded-xl shadow-sm mb-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                        <div className="flex flex-col">
                            <label className="text-sm font-medium text-gray-600 mb-1 flex items-center"><LucideUser size={14} className="mr-2"/>Servidor</label>
                            <input type="text" value={serverName} onChange={(e) => setServerName(e.target.value)} placeholder="Nome completo" className="p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"/>
                        </div>
                         <div className="flex flex-col">
                            <label className="text-sm font-medium text-gray-600 mb-1 flex items-center"><LucideFileText size={14} className="mr-2"/>CPF</label>
                            <input type="text" value={cpf} onChange={handleCpfChange} placeholder="000.000.000-00" className="p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"/>
                        </div>
                        <div className="flex flex-col">
                            <label className="text-sm font-medium text-gray-600 mb-1 flex items-center"><LucideBriefcase size={14} className="mr-2"/>Cargo</label>
                            <input type="text" value={role} onChange={(e) => setRole(e.target.value)} placeholder="Cargo do servidor" className="p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"/>
                        </div>
                        <div className="flex flex-col">
                            <label className="text-sm font-medium text-gray-600 mb-1 flex items-center"><LucideRoute size={14} className="mr-2"/>Rota</label>
                            <select value={route} onChange={(e) => setRoute(e.target.value)} className="p-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-green-500">
                                <option>Regular</option>
                                <option>Integral</option>
                                <option>Regular + Integral</option>
                                <option>Outro</option>
                            </select>
                        </div>
                        <div className="flex flex-col">
                            <label className="text-sm font-medium text-gray-600 mb-1 flex items-center"><LucideCalendar size={14} className="mr-2"/>Mês</label>
                            <select value={selectedMonth} onChange={(e) => setSelectedMonth(parseInt(e.target.value))} className="p-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-green-500">
                                {months.map((month, index) => <option key={index} value={index}>{month}</option>)}
                            </select>
                        </div>
                        <div className="flex flex-col">
                            <label className="text-sm font-medium text-gray-600 mb-1 flex items-center"><LucideCalendar size={14} className="mr-2"/>Ano</label>
                            <select value={selectedYear} onChange={(e) => setSelectedYear(parseInt(e.target.value))} className="p-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-green-500">
                                {years.map(year => <option key={year} value={year}>{year}</option>)}
                            </select>
                        </div>
                    </div>
                </div>

                {/* Desktop Table */}
                <div className="hidden md:block bg-white p-2 sm:p-4 rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
                    <table className="w-full min-w-[1200px]">
                        <thead>
                            <tr className="border-b-2 border-gray-200">
                                <th rowSpan="2" className="p-3 text-left font-semibold text-gray-600 w-40 align-middle">Dia</th>
                                <th colSpan="4" className="p-3 text-center font-semibold text-gray-600">Manhã</th>
                                <th colSpan="4" className="p-3 text-center font-semibold text-gray-600">Tarde</th>
                                <th rowSpan="2" className="p-3 text-center font-semibold text-gray-600 w-48 align-middle">Status</th>
                            </tr>
                            <tr className="border-b border-gray-200 bg-gray-50 text-sm text-gray-500 font-medium">
                                <th className="p-2 text-center">Início</th><th className="p-2 text-center">Fim</th><th className="p-2 text-center">Início</th><th className="p-2 text-center">Fim</th>
                                <th className="p-2 text-center">Início</th><th className="p-2 text-center">Fim</th><th className="p-2 text-center">Início</th><th className="p-2 text-center">Fim</th>
                            </tr>
                        </thead>
                        <tbody>
                            {timeEntries.map((entry, index) => {
                                const isWeekend = ['Sábado', 'Domingo'].includes(entry.weekday);
                                const isFullDayOff = ['Feriado', 'Ponto Facultativo', 'Folga', 'Falta', 'Atestado Médico', 'Recesso Escolar', 'Férias'].includes(entry.status);
                                const isWorkDisabled = isWeekend || isFullDayOff;

                                return (
                                <tr key={`desktop-${entry.day}`} className={`border-b border-gray-100 last:border-b-0 transition-colors ${isWorkDisabled ? 'bg-gray-100' : 'hover:bg-green-50/30'}`}>
                                    <td className="p-3"><div className="font-bold">{String(entry.day).padStart(2, '0')}</div><div className="text-xs text-gray-500">{entry.weekday}</div></td>
                                    
                                    {isWorkDisabled ? (
                                        <td colSpan="8" className="p-2 text-center text-gray-500 font-semibold italic">{entry.status || entry.weekday}</td>
                                    ) : (
                                        ['morning1Start', 'morning1End', 'morning2Start', 'morning2End', 'afternoon1Start', 'afternoon1End', 'afternoon2Start', 'afternoon2End'].map((period) => (
                                            <td key={period} className="p-2 text-center">
                                                <div className="flex items-center justify-center">
                                                    <input type="time" value={entry[period] || ''} onChange={(e) => handleTimeChange(index, period, e.target.value)} className="w-24 p-1 border border-gray-300 rounded-md text-center bg-white focus:ring-1 focus:ring-green-500"/>
                                                    <button onClick={() => handleClockClick(index, period)} className="ml-2 text-gray-400 hover:text-green-600" title="Preencher hora atual"><LucideClock size={18} /></button>
                                                </div>
                                            </td>
                                        ))
                                    )}

                                    <td className="p-2 text-center">
                                        {!isWeekend && (
                                            <select value={entry.status} onChange={(e) => handleStatusChange(index, e.target.value)} className="w-full p-2 border border-gray-300 rounded-md bg-white focus:ring-1 focus:ring-green-500 text-sm">
                                                <option value=""></option>
                                                <option value="Feriado">Feriado</option>
                                                <option value="Ponto Facultativo">Ponto Facultativo</option>
                                                <option value="Folga">Folga</option>
                                                <option value="Falta">Falta</option>
                                                <option value="Atestado Médico">Atestado Médico</option>
                                                <option value="Recesso Escolar">Recesso Escolar</option>
                                                <option value="Férias">Férias</option>
                                                <option value="Presença Parcial">Presença Parcial</option>
                                            </select>
                                        )}
                                    </td>
                                </tr>
                            )})}
                        </tbody>
                    </table>
                </div>

                {/* Mobile Card View */}
                <div className="md:hidden space-y-4">
                    {timeEntries.map((entry, index) => {
                         const isWeekend = ['Sábado', 'Domingo'].includes(entry.weekday);
                         const isFullDayOff = ['Feriado', 'Ponto Facultativo', 'Folga', 'Falta', 'Atestado Médico', 'Recesso Escolar', 'Férias'].includes(entry.status);
                         const isWorkDisabled = isWeekend || isFullDayOff;
                        return (
                        <div key={`mobile-${entry.day}`} className={`bg-white p-4 rounded-xl shadow-sm border ${isWorkDisabled ? 'bg-gray-100' : 'border-gray-200'}`}>
                            <div className="flex justify-between items-center mb-4">
                                <div>
                                    <p className="font-bold text-lg">{String(entry.day).padStart(2, '0')}</p>
                                    <p className="text-sm text-gray-500">{entry.weekday}</p>
                                </div>
                                 {!isWeekend && (
                                    <select value={entry.status} onChange={(e) => handleStatusChange(index, e.target.value)} className="w-1/2 p-2 border border-gray-300 rounded-md bg-white focus:ring-1 focus:ring-green-500 text-sm">
                                        <option value=""></option>
                                        <option value="Feriado">Feriado</option>
                                        <option value="Ponto Facultativo">Ponto Facultativo</option>
                                        <option value="Folga">Folga</option>
                                        <option value="Falta">Falta</option>
                                        <option value="Atestado Médico">Atestado Médico</option>
                                        <option value="Recesso Escolar">Recesso Escolar</option>
                                        <option value="Férias">Férias</option>
                                        <option value="Presença Parcial">Presença Parcial</option>
                                    </select>
                                )}
                            </div>
                            {isWorkDisabled ? (
                                <p className="text-center text-gray-500 font-semibold italic">{entry.status || entry.weekday}</p>
                            ) : (
                                <div className="grid grid-cols-2 gap-4">
                                    {['morning1Start', 'morning1End', 'morning2Start', 'morning2End', 'afternoon1Start', 'afternoon1End', 'afternoon2Start', 'afternoon2End'].map((period, pIndex) => (
                                        <div key={period}>
                                            <label className="text-xs text-gray-500">
                                                {Math.floor(pIndex / 2) < 2 ? 'Manhã' : 'Tarde'} {pIndex % 2 === 0 ? 'Início' : 'Fim'}
                                            </label>
                                            <div className="flex items-center">
                                                <input type="time" value={entry[period] || ''} onChange={(e) => handleTimeChange(index, period, e.target.value)} className="w-full p-1 border border-gray-300 rounded-md text-center bg-white focus:ring-1 focus:ring-green-500"/>
                                                <button onClick={() => handleClockClick(index, period)} className="ml-2 text-gray-400 hover:text-green-600" title="Preencher hora atual"><LucideClock size={18} /></button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )})}
                </div>

                <footer className="text-center mt-6 text-sm text-gray-500">
                    <p>ID de Usuário: {userId || 'N/A'}</p>
                    <p>App de Folha de Ponto &copy; {new Date().getFullYear()}</p>
                </footer>
            </main>
        </div>
    );
}
