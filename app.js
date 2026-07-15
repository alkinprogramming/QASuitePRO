(function () {
    const SESSION_KEY = 'qaqc_current_user_id', PAGE_KEY = 'qaqc_last_page';
    const SERVER_PAGE_SIZE = 50;
    let appData = {
        usuarios: [], proyectos: [], objetivos: [], casos: [], bugs: [],
        ejecuciones: [], capturas: [], registroDiario: [], apis: [], mejoras: [],
        trazabilidad: [], configuracion: { theme: 'dark', activeProject: '' },
        comentarios: [], requisitos: []
    };
    let currentUser = null, currentPage = 'dashboard', sortConfig = { field: null, dir: 'asc' };
    let searchTerm = '', pageSize = 10, currentPages = {};
    let notifications = [];
    let commandPaletteOpen = false;
    let commandPaletteSelectedIndex = 0;
    let commandPaletteResults = [];
    let loadedCollections = new Set();
    let activeSubscriptions = {};
    let captureTooltip = null;
    let tooltipListenersAttached = false;
    let currentAnalisisRequisitoId = null;
    const projectRequiredPages = ['casos', 'bugs', 'ejecuciones', 'diario', 'capturas', 'apis', 'trazabilidad', 'informes', 'historico', 'mejoras', 'objetivos', 'ia', 'requisitos'];
    const consultorPages = ['casos', 'bugs', 'ejecuciones', 'capturas', 'apis', 'diario', 'manual', 'requisitos', 'mejoras', 'Dashboard', 'objetivos', 'ia'];
    const cache = {
        data: {},
        timestamps: {},
        ttl: 60000,
        get(key) {
            const now = Date.now();
            if (this.timestamps[key] && (now - this.timestamps[key]) < this.ttl) return this.data[key];
            return null;
        },
        set(key, value) { this.data[key] = value; this.timestamps[key] = Date.now(); },
        invalidate(key) { delete this.data[key]; delete this.timestamps[key]; },
        invalidateAll() { this.data = {}; this.timestamps = {}; },
        invalidateByPrefix(prefix) {
            Object.keys(this.data).forEach(key => { if (key.startsWith(prefix)) this.invalidate(key); });
        }
    };

    // ============ CONFIGURACIÓN FIREBASE ============
    const firebaseConfig = {
        apiKey: "AIzaSyCds1_P24fAz7MGEK9ar_bwsXItmGAGSPo",
        authDomain: "qasuitepro.firebaseapp.com",
        databaseURL: "https://qasuitepro-default-rtdb.firebaseio.com",
        projectId: "qasuitepro",
        storageBucket: "qasuitepro.firebasestorage.app",
        messagingSenderId: "130949566584",
        appId: "1:130949566584:web:20223e1e9fe2a433389d8d",
        measurementId: "G-N701VXE7FF"
    };
    if (typeof firebase !== 'undefined' && !firebase.apps.length) {
        try { firebase.initializeApp(firebaseConfig); } catch (error) { console.error("Error Firebase:", error); }
    }
    const db = typeof firebase !== 'undefined' ? firebase.database() : null;
    if (db) {
        db.ref(".info/connected").on("value", (snap) => {
            if (snap.val() === true) console.info("🔗 Sincronización en tiempo real establecida.");
            else console.warn("⚠️ Desconectado de la nube.");
        });
    }
    function saveToDB(key, data) {
        if (!db) return Promise.reject("DB no inicializada");
        return db.ref(key).set(data);
    }
    function getFromDB(key) {
        if (!db) return Promise.resolve(undefined);
        return db.ref(key).once('value').then(snap => snap.val() !== null ? snap.val() : undefined);
    }

    function suscribirseAlTiempoReal() {
        if (!db) return;
        db.ref("qa_suite_pro_state").on("value", (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                if (data && typeof data === 'object') {
                    appData = {
                        usuarios: Array.isArray(data.usuarios) ? data.usuarios : (appData.usuarios || []),
                        proyectos: Array.isArray(data.proyectos) ? data.proyectos : (appData.proyectos || []),
                        objetivos: Array.isArray(data.objetivos) ? data.objetivos : (appData.objetivos || []),
                        casos: Array.isArray(data.casos) ? data.casos : (appData.casos || []),
                        bugs: Array.isArray(data.bugs) ? data.bugs : (appData.bugs || []),
                        ejecuciones: Array.isArray(data.ejecuciones) ? data.ejecuciones : (appData.ejecuciones || []),
                        capturas: Array.isArray(data.capturas) ? data.capturas : (appData.capturas || []),
                        registroDiario: Array.isArray(data.registroDiario) ? data.registroDiario : (appData.registroDiario || []),
                        apis: Array.isArray(data.apis) ? data.apis : (appData.apis || []),
                        mejoras: Array.isArray(data.mejoras) ? data.mejoras : (appData.mejoras || []),
                        trazabilidad: Array.isArray(data.trazabilidad) ? data.trazabilidad : (appData.trazabilidad || []),
                        comentarios: Array.isArray(data.comentarios) ? data.comentarios : (appData.comentarios || []),
                        notificaciones: Array.isArray(data.notificaciones) ? data.notificaciones : [],
                        configuracion: data.configuracion || { theme: 'dark', activeProject: '' },
                        requisitos: Array.isArray(data.requisitos) ? data.requisitos : (appData.requisitos || []),
                        ia: Array.isArray(data.ia) ? data.ia : (appData.ia || []),
                    };
                    notifications = appData.notificaciones || [];
                    if (currentUser && document.getElementById('appScreen').style.display !== 'none') {
                        renderPage(currentPage);
                        updateNotificationBadge();
                        populateProjectSelector();
                    }
                    // console.log("🔄 Datos sincronizados desde Firebase");
                }
            }
        });
        // console.log("✅ Suscripción activada para 'qa_suite_pro_state'");
    }

    // ============ DATA MANAGEMENT ============
    async function loadData() {
        try {
            const cloudData = await getFromDB("qa_suite_pro_state");
            if (cloudData) { appData = cloudData; // console.log("✅ Datos cargados de la nube.");
            }
        } catch (e) { console.error("Error al cargar de Firebase:", e); }
        if (!Array.isArray(appData.trazabilidad)) appData.trazabilidad = [];
        if (!Array.isArray(appData.mejoras)) appData.mejoras = [];
        if (!Array.isArray(appData.apis)) appData.apis = [];
        if (!Array.isArray(appData.capturas)) appData.capturas = [];
        if (!Array.isArray(appData.notificaciones)) appData.notificaciones = [];
        if (!Array.isArray(appData.usuarios)) appData.usuarios = [];
        if (!Array.isArray(appData.proyectos)) appData.proyectos = [];
        if (!Array.isArray(appData.objetivos)) appData.objetivos = [];
        if (!Array.isArray(appData.casos)) appData.casos = [];
        if (!Array.isArray(appData.bugs)) appData.bugs = [];
        if (!Array.isArray(appData.ejecuciones)) appData.ejecuciones = [];
        if (!Array.isArray(appData.registroDiario)) appData.registroDiario = [];
        if (!Array.isArray(appData.comentarios)) appData.comentarios = [];
        if (!appData.configuracion) appData.configuracion = { theme: 'dark', activeProject: '' };
        if (!Array.isArray(appData.requisitos)) appData.requisitos = [];
        notifications = appData.notificaciones || [];
        applyTheme();
    }

    async function saveData() {
        appData.notificaciones = notifications;
        try { await saveToDB("qa_suite_pro_state", appData); } 
        catch (error) {
            console.error("Error al guardar en la nube:", error);
            if (typeof toast === 'function') toast("Error al guardar en la nube", "error");
        }
    }

    function getActiveProject() { return appData.configuracion.activeProject || ''; }
    function filterByProject(arr, key = 'proyecto') {
        const ap = getActiveProject();
        if (!arr || !Array.isArray(arr)) return [];
        let result = arr;
        if (currentUser && currentUser.rol === 'Consultor') {
            const authProjects = currentUser.proyectosAutorizados || [];
            if (authProjects.length === 0) return [];
            result = result.filter(i => authProjects.includes(i.proyecto));
        }
        if (ap) result = result.filter(i => (i[key] || i.proyecto) === ap);
        return result;
    }

    function saveSession(uid) { sessionStorage.setItem(SESSION_KEY, uid); }
    function clearSession() { sessionStorage.removeItem(SESSION_KEY); }
    function saveLastPage(page) { sessionStorage.setItem(PAGE_KEY, page); }
    function getLastPage() { return sessionStorage.getItem(PAGE_KEY) || 'dashboard'; }
    function restoreSession() {
        const uid = sessionStorage.getItem(SESSION_KEY);
        if (uid) {
            const u = appData.usuarios.find(x => String(x.id) === String(uid));
            if (u) {
                currentUser = u;
                currentPage = getLastPage();
                return true;
            }
        }
        return false;
    }

    // ============ MÓDULO IA & MACHINE LEARNING ============
    function calcularSimilitud(texto1, texto2) {
        if (!texto1 || !texto2) return 0;
        const t1 = texto1.toLowerCase().trim();
        const t2 = texto2.toLowerCase().trim();
        if (t1 === t2) return 100;
        if (t1.length === 0 || t2.length === 0) return 0;
        const matrix = [];
        for (let i = 0; i <= t1.length; i++) matrix[i] = [i];
        for (let j = 0; j <= t2.length; j++) matrix[0][j] = j;
        for (let i = 1; i <= t1.length; i++) {
            for (let j = 1; j <= t2.length; j++) {
                const cost = t1[i - 1] === t2[j - 1] ? 0 : 1;
                matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost);
            }
        }
        const distancia = matrix[t1.length][t2.length];
        const maxLen = Math.max(t1.length, t2.length);
        return Math.round(((maxLen - distancia) / maxLen) * 100);
    }

    function detectarBugsDuplicados(bugNuevo, bugsExistentes, umbral = 70) {
        const duplicados = [];
        bugsExistentes.forEach(bug => {
            const similitudTitulo = calcularSimilitud(bugNuevo.titulo, bug.titulo);
            const similitudDesc = calcularSimilitud(bugNuevo.descripcion || '', bug.descripcion || '');
            const similitudResumen = calcularSimilitud(bugNuevo.resumen || '', bug.resumen || '');
            const similitudTotal = (similitudTitulo * 0.5) + (similitudDesc * 0.3) + (similitudResumen * 0.2);
            if (similitudTotal >= umbral) {
                duplicados.push({ bug: bug, similitud: Math.round(similitudTotal), detalles: { titulo: similitudTitulo, descripcion: similitudDesc, resumen: similitudResumen } });
            }
        });
        duplicados.sort((a, b) => b.similitud - a.similitud);
        return duplicados;
    }

    function clasificarSeveridadAutomatica(titulo, descripcion, resumen) {
        const textoCompleto = `${titulo} ${descripcion || ''} ${resumen || ''}`.toLowerCase();
        const patrones = {
            'Bloqueante': ['bloqueo', 'bloquea', 'crash', 'caída', 'caida', 'no funciona', 'imposible', 'no se puede', 'error crítico', 'pantalla blanca', 'no carga', 'no abre', 'no inicia', 'sistema caído', 'down', 'data loss', 'pérdida de datos', 'corrupción'],
            'Crítica': ['crítico', 'critico', 'grave', 'urgente', 'no se puede continuar', 'funcionalidad principal', 'login', 'autenticación', 'pagos', 'transacción', 'seguridad', 'vulnerabilidad'],
            'Mayor': ['error', 'fallo', 'incorrecto', 'no muestra', 'no actualiza', 'lento', 'rendimiento', 'timeout', 'no responde', 'mala experiencia', 'usabilidad'],
            'Menor': ['typo', 'ortografía', 'color', 'estilo', 'css', 'diseño', 'alineación', 'margen', 'icono', 'mejora', 'sugerencia', 'opcional', 'cosmético', 'visual']
        };
        const puntuaciones = {};
        Object.keys(patrones).forEach(severidad => {
            puntuaciones[severidad] = 0;
            patrones[severidad].forEach(palabra => { if (textoCompleto.includes(palabra)) puntuaciones[severidad] += 1; });
        });
        let severidadDetectada = 'Menor';
        let maxPuntuacion = 0;
        Object.keys(puntuaciones).forEach(severidad => {
            if (puntuaciones[severidad] > maxPuntuacion) { maxPuntuacion = puntuaciones[severidad]; severidadDetectada = severidad; }
        });
        if (maxPuntuacion === 0) {
            if (/(no\s+\w+ar|no\s+puede|no\s+funciona)/i.test(textoCompleto)) severidadDetectada = 'Mayor';
            if (textoCompleto.length < 30) severidadDetectada = 'Menor';
        }
        return { severidad: severidadDetectada, confianza: Math.min(maxPuntuacion * 25, 95), palabrasClave: patrones[severidadDetectada].filter(p => textoCompleto.includes(p)) };
    }

    function predecirDefectos(casos, bugs, ejecuciones) {
        const analisis = { modulosAltoRiesgo: [], tendenciaDefectos: 0, prediccionProximoCiclo: 0, factoresRiesgo: [] };
        const bugsPorModulo = {};
        bugs.forEach(bug => {
            const modulo = bug.casoRelacionado || 'Sin módulo';
            if (!bugsPorModulo[modulo]) bugsPorModulo[modulo] = { total: 0, criticos: 0 };
            bugsPorModulo[modulo].total++;
            if (bug.severidad === 'Bloqueante' || bug.severidad === 'Crítica') bugsPorModulo[modulo].criticos++;
        });
        Object.keys(bugsPorModulo).forEach(modulo => {
            const data = bugsPorModulo[modulo];
            const ratioCriticos = data.criticos / data.total;
            if (data.total >= 3 || ratioCriticos >= 0.5) {
                analisis.modulosAltoRiesgo.push({ modulo: modulo, totalBugs: data.total, bugsCriticos: data.criticos, ratioCriticos: Math.round(ratioCriticos * 100), nivelRiesgo: ratioCriticos >= 0.7 ? 'Muy Alto' : ratioCriticos >= 0.5 ? 'Alto' : 'Medio' });
            }
        });
        const ciclosOrdenados = ejecuciones.sort((a, b) => new Date(b.fecha) - new Date(a.fecha)).slice(0, 5);
        if (ciclosOrdenados.length >= 2) {
            const bugsRecientes = ciclosOrdenados.slice(0, 2).reduce((sum, ciclo) => { let casos = []; try { casos = JSON.parse(ciclo.casosAsociados || '[]'); } catch (e) {} return sum + casos.filter(c => c.status === 'Failed').length; }, 0);
            const bugsAnteriores = ciclosOrdenados.slice(2, 4).reduce((sum, ciclo) => { let casos = []; try { casos = JSON.parse(ciclo.casosAsociados || '[]'); } catch (e) {} return sum + casos.filter(c => c.status === 'Failed').length; }, 0);
            if (bugsAnteriores > 0) analisis.tendenciaDefectos = Math.round(((bugsRecientes - bugsAnteriores) / bugsAnteriores) * 100);
            const promedioReciente = bugsRecientes / 2;
            analisis.prediccionProximoCiclo = Math.round(promedioReciente * (1 + (analisis.tendenciaDefectos / 100)));
        }
        const ratioBugsCasos = casos.length > 0 ? (bugs.length / casos.length) : 0;
        if (ratioBugsCasos > 0.3) analisis.factoresRiesgo.push({ tipo: 'Alta densidad de defectos', descripcion: `${Math.round(ratioBugsCasos * 100)}% de casos generan bugs`, nivel: 'Alto' });
        const bugsAbiertos = bugs.filter(b => b.estado !== 'Solucionado').length;
        if (bugsAbiertos > 10) analisis.factoresRiesgo.push({ tipo: 'Acumulación de bugs', descripcion: `${bugsAbiertos} bugs sin resolver`, nivel: 'Alto' });
        return analisis;
    }

    function sugerirCasosPrueba(requisito, casosExistentes, bugsExistentes) {
        const sugerencias = [];
        const casosDelRequisito = casosExistentes.filter(c => c.requisito === requisito.id);
        const bugsDelRequisito = bugsExistentes.filter(b => { const casoRelacionado = casosExistentes.find(c => c.id === b.casoRelacionado); return casoRelacionado && casoRelacionado.requisito === requisito.id; });
        if (casosDelRequisito.length === 0) sugerencias.push({ titulo: `Caso de prueba básico para ${requisito.titulo}`, descripcion: `Verificar funcionalidad principal del requisito ${requisito.id}`, prioridad: 'Alta', razon: 'Primer caso para este requisito', tipo: 'Funcional' });
        if (bugsDelRequisito.filter(b => b.severidad === 'Crítica' || b.severidad === 'Bloqueante').length > 0) sugerencias.push({ titulo: `Pruebas de estrés para ${requisito.titulo}`, descripcion: 'Verificar comportamiento con datos límite y condiciones extremas', prioridad: 'Alta', razon: 'Se han detectado bugs críticos en este módulo', tipo: 'No Funcional' });
        if (bugsDelRequisito.length >= 3) sugerencias.push({ titulo: `Validación de manejo de errores - ${requisito.titulo}`, descripcion: 'Verificar que el sistema maneja correctamente las excepciones', prioridad: 'Media', razon: `Alta densidad de defectos (${bugsDelRequisito.length} bugs)`, tipo: 'Funcional' });
        const bugsSolucionados = bugsDelRequisito.filter(b => b.estado === 'Solucionado');
        if (bugsSolucionados.length > 0) sugerencias.push({ titulo: `Pruebas de regresión - ${requisito.titulo}`, descripcion: `Verificar que los ${bugsSolucionados.length} bugs solucionados no se han reintroducido`, prioridad: 'Media', razon: 'Bugs solucionados requieren validación de regresión', tipo: 'Regresión' });
        if (/login|autentic|usuario|contraseña|seguridad|datos/i.test(requisito.titulo)) sugerencias.push({ titulo: `Pruebas de seguridad - ${requisito.titulo}`, descripcion: 'Verificar autenticación, autorización y protección de datos', prioridad: 'Alta', razon: 'Requisito relacionado con seguridad', tipo: 'Seguridad' });
        if (/api|endpoint|consulta|búsqueda|carga/i.test(requisito.titulo)) sugerencias.push({ titulo: `Pruebas de rendimiento - ${requisito.titulo}`, descripcion: 'Verificar tiempos de respuesta y comportamiento bajo carga', prioridad: 'Media', razon: 'Requisito relacionado con rendimiento', tipo: 'Rendimiento' });
        return sugerencias;
    }

    function analizarCoberturaInteligente(requisitos, casos, bugs) {
        return requisitos.map(req => {
            const casosReq = casos.filter(c => c.requisito === req.id);
            const bugsReq = bugs.filter(b => { const caso = casos.find(c => c.id === b.casoRelacionado); return caso && caso.requisito === req.id; });
            const casosPasados = casosReq.filter(c => c.estado === 'Pasado').length;
            const cobertura = casosReq.length > 0 ? (casosPasados / casosReq.length) * 100 : 0;
            let scoreCalidad = cobertura;
            if (bugsReq.length > 0) scoreCalidad -= ((bugsReq.length / Math.max(casosReq.length, 1)) * 20);
            scoreCalidad = Math.max(0, Math.min(100, scoreCalidad));
            return { requisito: req, casosTotales: casosReq.length, cobertura: Math.round(cobertura), bugsTotales: bugsReq.length, scoreCalidad: Math.round(scoreCalidad), nivelRiesgo: scoreCalidad < 50 ? 'Alto' : scoreCalidad < 75 ? 'Medio' : 'Bajo' };
        }).sort((a, b) => a.scoreCalidad - b.scoreCalidad);
    }

    // ============ GESTIÓN DE DOCUMENTOS E IA ============
    window.handleDocumentoUpload = function(input) {
        const file = input.files[0];
        if (!file) return;
        const validTypes = ['text/plain', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
        if (!validTypes.includes(file.type) && !file.name.match(/\.(txt|pdf|doc|docx)$/i)) { toast('❌ Formato no válido. Usa TXT, PDF o DOCX', 'error'); input.value = ''; return; }
        if (file.size > 5 * 1024 * 1024) { toast('❌ El archivo es demasiado grande. Máximo 5MB', 'error'); input.value = ''; return; }
        const reader = new FileReader();
        reader.onload = function(e) {
            const base64 = e.target.result;
            sessionStorage.setItem('temp_documento_' + getActiveProject(), JSON.stringify({ contenido: base64, nombre: file.name, tipo: file.type }));
            toast('Documento cargado. Guarda el requisito para procesarlo.', 'success');
            const container = input.closest('.form-group');
            const preview = document.createElement('div');
            preview.id = 'documento-preview';
            preview.style.cssText = 'margin-top:12px; padding:12px; background:var(--bg); border-radius:8px; display:flex; align-items:center; justify-content:space-between;';
            preview.innerHTML = `<div style="display:flex; align-items:center; gap:10px;"><span style="font-size:1.5rem;">📄</span><div><div style="font-weight:600; font-size:0.9rem;">Documento adjunto</div><div style="font-size:0.75rem; color:var(--text2);">${file.name}</div></div></div><button type="button" class="btn btn-sm btn-outline" onclick="eliminarDocumentoPreview()">🗑️</button>`;
            const existing = container.querySelector('#documento-preview');
            if (existing) existing.remove();
            container.appendChild(preview);
            setTimeout(() => { const analizarBtn = document.querySelector('#btn-analizar-ia'); if (analizarBtn) analizarBtn.style.display = 'block'; }, 100);
        };
        reader.readAsDataURL(file);
    };

    // ✅ MANTENER ESTA (usa el modal personalizado)
    window.eliminarDocumento = function() {
        const id = new URLSearchParams(window.location.search).get('id') || document.querySelector('[data-action="edit"][data-id]')?.dataset.id;
        let docName = 'este documento adjunto';
        
        if (id) {
            const req = appData.requisitos.find(r => r.id === id);
            if (req && req.nombreDocumento) {
                docName = `el documento <strong style="color:var(--accent);">"${req.nombreDocumento}"</strong>`;
            }
        }
        
        showConfirmModal(
            `<div style="text-align: center; padding: 10px 0;">
                <div class="icon-warning" style="font-size: 3.5rem; margin-bottom: 15px;">📄❌</div>
                <h3 style="margin: 0 0 12px 0; color: var(--text); font-size: 1.3rem;">Eliminar Documento</h3>
                <p style="color: var(--text2); font-size: 0.95rem; line-height: 1.6; margin: 0;">
                    ¿Estás seguro de que deseas eliminar ${docName}?<br>
                    <small style="color: var(--warning); font-weight: 600;">️ El requisito no será eliminado, solo se desvinculará el archivo.</small>
                </p>
            </div>`, 
            () => {
                if (id) {
                    const req = appData.requisitos.find(r => r.id === id);
                    if (req) { 
                        delete req.documento; 
                        delete req.nombreDocumento; 
                        delete req.tipoDocumento;
                        saveData(); 
                        closeModal();
                        renderPage('requisitos'); 
                        toast('Documento eliminado correctamente', 'info'); 
                    }
                }
            }, 
            true
        );
    };

    function extraerCasosDeTexto(texto) {
        const casos = [];
        const lines = texto.split(/\n+/);
        let currentCase = null;
        const patterns = {
            casoInicio: /(caso|escenario|prueba|test|tc)\s*(\d+|de|:|-)?/i,
            titulo: /^(?:\d+[\.\)]\s*)?(?:caso|escenario|prueba|test|tc)?\s*[:.-]?\s*(.+?)(?=\n|$)/i,
            actor: /(actor|usuario|rol|perfil|quien)\s*[:.-]?\s*(.+?)(?=\n|$)/i,
            precondicion: /(precondicion|pre-condicion|requisito previo|condicion inicial|dado que)\s*[:.-]?\s*(.+?)(?=\n|$)/i,
            paso: /(?:paso|step)\s*(\d+)|^\s*[-•*]\s*(.+)/gi,
            resultado: /(resultado|esperado|entonces|then|se espera)\s*[:.-]?\s*(.+?)(?=\n|$)/i,
            prioridad: /(prioridad|priority)\s*[:.-]?\s*(alta|media|baja|critica|urgente)/i
        };
        lines.forEach((line, index) => {
            const trimmed = line.trim();
            if (!trimmed) return;
            if (patterns.casoInicio.test(trimmed)) {
                if (currentCase) casos.push(currentCase);
                currentCase = { id: 'AUTO-' + (casos.length + 1), titulo: trimmed.replace(patterns.casoInicio, '').trim().substring(0, 100), descripcion: '', actor: 'Usuario', precondicion: '', pasos: [], resultado: '', prioridad: 'Media', confianza: 85 };
            } else if (currentCase) {
                const actorMatch = trimmed.match(patterns.actor); if (actorMatch) currentCase.actor = actorMatch[2].trim();
                const precondMatch = trimmed.match(patterns.precondicion); if (precondMatch) currentCase.precondicion = precondMatch[2].trim();
                const pasoMatch = trimmed.match(patterns.paso);
                if (pasoMatch) currentCase.pasos.push(trimmed.replace(/^(paso|step)\s*\d+[:.-]?\s*/i, '').trim());
                else if (/^[-•*]/.test(trimmed) && trimmed.length > 10) currentCase.pasos.push(trimmed.replace(/^[-•*]\s*/, '').trim());
                const resultMatch = trimmed.match(patterns.resultado); if (resultMatch) currentCase.resultado = resultMatch[2].trim();
                const priorityMatch = trimmed.match(patterns.prioridad);
                if (priorityMatch) { const prio = priorityMatch[2].toLowerCase(); currentCase.prioridad = prio === 'alta' || prio === 'critica' || prio === 'urgente' ? 'Alta' : prio === 'baja' ? 'Baja' : 'Media'; }
                if (!actorMatch && !precondMatch && !pasoMatch && !resultMatch && !priorityMatch) currentCase.descripcion += trimmed + ' ';
            }
        });
        if (currentCase) casos.push(currentCase);
        if (casos.length === 0) {
            const funcionalidades = texto.match(/(?:debe|puede|permite|permitir|realizar|ejecutar|mostrar|validar|verificar)\s+[^.]+/gi) || [];
            funcionalidades.slice(0, 5).forEach((func, idx) => {
                casos.push({ id: 'AUTO-' + (idx + 1), titulo: func.trim().substring(0, 80), descripcion: func.trim(), actor: 'Usuario', precondicion: '', pasos: ['Ejecutar la funcionalidad'], resultado: 'Sistema responde correctamente', prioridad: 'Media', confianza: 60 });
            });
        }
        return casos;
    }




    // ============ EXTRACCIÓN DE TEXTO DE DOCUMENTOS (VERSIÓN UNIFICADA) ============
    window.extraerTextoDeDocumento = function(base64, tipo) {
        try {
            // Validación de entrada
            if (!base64 || typeof base64 !== 'string') {
                console.warn('⚠️ base64 no es válido:', typeof base64);
                return '';
            }
            if (!tipo || typeof tipo !== 'string') {
                console.warn('⚠️ tipo no es válido:', typeof tipo);
                return '';
            }

            // Texto plano con soporte UTF-8
            if (tipo.includes('text/plain') || base64.includes('data:text/plain')) {
                try {
                    // Decodificar base64 a UTF-8 correctamente
                    const binaryString = atob(base64.split(',')[1]);
                    const bytes = new Uint8Array(binaryString.length);
                    for (let i = 0; i < binaryString.length; i++) {
                        bytes[i] = binaryString.charCodeAt(i);
                    }
                    return new TextDecoder('utf-8').decode(bytes);
                } catch (e) {
                    console.error('Error al decodificar texto:', e);
                    return '';
                }
            }

            // PDF - Usando PDF.js
            if (tipo.includes('application/pdf') || base64.includes('data:application/pdf')) {
                // Verificar que pdfjsLib esté cargado
                if (typeof pdfjsLib === 'undefined') {
                    console.error('❌ PDF.js no está cargado. Añade el script en index.html');
                    return 'ERROR: La librería PDF.js no está cargada. Contacta con el administrador.';
                }

                // PDF.js es asíncrono, pero necesitamos devolver el texto sincrónicamente
                // Usamos un truco: devolvemos un string placeholder y usamos una variable global
                // para almacenar el resultado cuando esté listo
                // console.log('📄 Iniciando extracción de PDF...');
                
                // Para mantener compatibilidad con el código actual, devolvemos un string
                // y usamos un callback o promise para el resultado real
                return new Promise(async (resolve, reject) => {
                    try {
                        const loadingTask = pdfjsLib.getDocument(base64);
                        const pdf = await loadingTask.promise;
                        let fullText = '';
                        
                        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
                            const page = await pdf.getPage(pageNum);
                            const textContent = await page.getTextContent();
                            const pageText = textContent.items.map(item => item.str).join(' ');
                            fullText += pageText + '\n';
                        }
                        
                        //console.log(`✅ PDF extraído: ${fullText.length} caracteres de ${pdf.numPages} páginas`);
                        resolve(fullText);
                    } catch (error) {
                        console.error(' Error al extraer texto del PDF:', error);
                        reject(error);
                    }
                });
            }

            // Word - Placeholder
            if (tipo.includes('application/vnd.openxmlformats') || base64.includes('data:application/vnd.openxmlformats')) {
                return "Documento Word cargado. Para extracción real de texto, integra la librería mammoth.js";
            }

            return "Formato de documento no soportado: " + tipo;
        } catch (error) {
            console.error("Error al extraer texto:", error);
            return "Error al procesar el documento: " + error.message;
        }
    };

    function mostrarModalRevisionCasos(casos, docData) {
        const container = document.getElementById('modalContainer');
        container.innerHTML = `
            <div class="modal-overlay">
                <div class="modal" style="max-width: 1000px; max-height: 90vh; overflow-y: auto;">
                    <h3>🤖 Casos de Uso Generados por IA</h3>
                    <p style="color: var(--text2); margin-bottom: 20px;">Se han detectado <strong>${casos.length} casos de uso</strong> en el documento "${docData.nombre}". Revisa y selecciona los que desees crear.</p>
                    <div style="max-height: 60vh; overflow-y: auto; margin-bottom: 20px;">
                        ${casos.map((caso, idx) => `
                            <div class="ia-case-card" style="padding: 16px; background: var(--card-alt); border-radius: 8px; margin-bottom: 12px; border-left: 4px solid ${caso.confianza >= 80 ? 'var(--success)' : caso.confianza >= 60 ? 'var(--warning)' : 'var(--info)'};">
                                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
                                    <label style="display: flex; align-items: center; gap: 10px; cursor: pointer; flex: 1;">
                                        <input type="checkbox" class="case-select" value="${idx}" checked style="width: 20px; height: 20px; cursor: pointer;">
                                        <div style="flex: 1;">
                                            <div style="font-weight: 600; color: var(--accent);">${caso.titulo}</div>
                                            <div style="font-size: 0.8rem; color: var(--text2); margin-top: 4px;">👤 ${caso.actor} · 🎯 ${caso.prioridad} · 📊 ${caso.confianza}% confianza</div>
                                        </div>
                                    </label>
                                </div>
                                ${caso.precondicion ? `<div style="font-size: 0.85rem; margin: 8px 0; padding: 8px; background: var(--bg); border-radius: 6px;"><strong>Precondición:</strong> ${caso.precondicion}</div>` : ''}
                                ${caso.pasos.length > 0 ? `<div style="font-size: 0.85rem; margin: 8px 0;"><strong>Pasos:</strong><ol style="margin: 8px 0; padding-left: 20px;">${caso.pasos.map(p => `<li>${p}</li>`).join('')}</ol></div>` : ''}
                                ${caso.resultado ? `<div style="font-size: 0.85rem; margin: 8px 0; padding: 8px; background: rgba(16, 185, 129, 0.1); border-radius: 6px;"><strong>Resultado esperado:</strong> ${caso.resultado}</div>` : ''}
                            </div>
                        `).join('')}
                    </div>
                    <div style="display: flex; gap: 10px; flex-wrap: wrap; align-items: center; padding: 16px; background: var(--bg); border-radius: 8px; margin-bottom: 20px;">
                        <button class="btn btn-accent" onclick="crearCasosSeleccionadosIA(${casos.length})">✅ Crear Casos Seleccionados</button>
                        <button class="btn btn-outline" onclick="selectAllCases(true)">Seleccionar todos</button>
                        <button class="btn btn-outline" onclick="selectAllCases(false)">Deseleccionar todos</button>
                        <button class="btn btn-outline" onclick="closeModal()">Cancelar</button>
                    </div>
                    <div style="font-size: 0.8rem; color: var(--text2); padding: 12px; background: rgba(139, 92, 246, 0.1); border-radius: 8px;">💡 <strong>Consejo:</strong> Los casos con mayor porcentaje de confianza tienen más probabilidad de ser correctos. Revisa especialmente los que están por debajo del 70%.</div>
                </div>
            </div>`;
    }

    window.verDetalleCasoIA = function(idx) { toast('Vista detallada del caso ' + (idx + 1), 'info'); };
    window.selectAllCases = function(selectAll) { document.querySelectorAll('.case-select').forEach(cb => { cb.checked = selectAll; }); };

    window.crearCasosSeleccionadosIA = async function(totalCasos) {
        // 1. Validar selección
        const selected = Array.from(document.querySelectorAll('.case-select:checked')).map(cb => parseInt(cb.value));
        if (selected.length === 0) { 
            toast('Selecciona al menos un caso para crear', 'warning'); 
            return; 
        }
        
        // 2. Obtener el ID del requisito de forma robusta (usando 'let' para permitir reasignación)
        let reqId = currentAnalisisRequisitoId || document.getElementById('f_id')?.value;
        
        if (!reqId) {
            const modalIdInput = document.querySelector('.modal #f_id');
            if (modalIdInput) reqId = modalIdInput.value;
        }
        
        if (!reqId) {
            reqId = new URLSearchParams(window.location.search).get('id');
        }
        
        if (!reqId) { 
            toast('Error: No se encontró el ID del requisito. Cierra el modal y analiza desde el requisito.', 'error'); 
            return; 
        }

        // 3. Obtener el documento temporal
        const activeProject = getActiveProject();
        const tempDocStr = sessionStorage.getItem('temp_documento_' + activeProject);
        
        if (!tempDocStr) { 
            toast('Error: Documento no encontrado. Sube el documento nuevamente.', 'error'); 
            return; 
        }
        
        const docData = JSON.parse(tempDocStr);
        
        // 4. Extraer texto del documento (await maneja tanto texto plano como la Promesa de PDFs)
        let texto = '';
        try {
            toast('Procesando documento...', 'info');
            texto = await extraerTextoDeDocumento(docData.contenido, docData.tipo);
        } catch (err) {
            console.error('Error al extraer texto:', err);
            toast('Error al procesar el documento: ' + err.message, 'error');
            return;
        }

        if (!texto || typeof texto !== 'string' || texto.length < 10) {
            toast('No se pudo extraer texto legible del documento.', 'warning');
            return;
        }

        // 5. Procesar y crear los casos
        procesarYCrearCasos(texto, docData, selected, reqId);
    };

    // Función auxiliar separada para mantener el código limpio y evitar anidamientos
    function procesarYCrearCasos(texto, docData, selected, reqId) {
        const casosSugeridos = extraerCasosDeTexto(texto);
        
        let creados = 0;
        selected.forEach(idx => {
            if (idx < casosSugeridos.length) {
                const casoData = casosSugeridos[idx];
                const newCase = { 
                    id: casoData.id, 
                    requisito: reqId, 
                    titulo: casoData.titulo, 
                    descripcion: casoData.descripcion, 
                    actor: casoData.actor, 
                    precondicion: casoData.precondicion, 
                    flujo: casoData.pasos.join('\n'), 
                    resultadoEsperado: casoData.resultado, 
                    prioridad: casoData.prioridad, 
                    estado: 'Pendiente', 
                    proyecto: getActiveProject(), 
                    generadoPorIA: true, 
                    confianzaIA: casoData.confianza 
                };
                appData.casos.push(newCase);
                creados++;
            }
        });
        
        saveData(); 
        closeModal(); 
        sessionStorage.removeItem('temp_documento_' + getActiveProject());
        currentAnalisisRequisitoId = null; // Limpiar variable global para el próximo uso
        
        toast(`✅ Se han creado ${creados} casos de uso automáticamente`, 'success');
        setTimeout(() => { renderPage('casos'); }, 1000);
    }

    window.analizarAPIsDeDocumento = function() {
        const tempDoc = sessionStorage.getItem('temp_documento_' + getActiveProject());
        if (!tempDoc) { toast('Error: No hay documento cargado', 'error'); return; }
        const docData = JSON.parse(tempDoc);
        const texto = extraerTextoDeDocumento(docData.contenido, docData.tipo);
        const apisSugeridas = extraerAPIsDeTexto(texto);
        if (apisSugeridas.length === 0) { toast('Warning: No se pudieron extraer APIs del documento', 'warning'); return; }
        mostrarModalRevisionAPIs(apisSugeridas, docData);
    };

    function extraerAPIsDeTexto(texto) {
        const apis = [];
        const lines = texto.split(/\n+/);
        let currentAPI = null;
        const patterns = {
            endpoint: /(GET|POST|PUT|DELETE|PATCH)\s+([\/\w-]+)/i,
            nombre: /(?:endpoint|api|recurso|servicio)\s*[:.-]?\s*(.+?)(?=\n|$)/i,
            descripcion: /(?:descripcion|description|descripcion)\s*[:.-]?\s*(.+?)(?=\n|$)/i,
            request: /(?:request|body|parametros|params)\s*[:.-]?\s*(.+?)(?=\n|$)/i,
            response: /(?:response|respuesta|response)\s*[:.-]?\s*(.+?)(?=\n|$)/i
        };
        lines.forEach((line, index) => {
            const trimmed = line.trim();
            if (!trimmed) return;
            const endpointMatch = trimmed.match(patterns.endpoint);
            if (endpointMatch) {
                if (currentAPI) apis.push(currentAPI);
                currentAPI = { id: 'API-AUTO-' + (apis.length + 1), metodo: endpointMatch[1].toUpperCase(), endpoint: endpointMatch[2], nombre: `API ${endpointMatch[1].toUpperCase()} ${endpointMatch[2]}`, descripcion: '', request: '', responseEsperada: '', estado: 'Pendiente', confianza: 80 };
            } else if (currentAPI) {
                const nombreMatch = trimmed.match(patterns.nombre); if (nombreMatch) currentAPI.nombre = nombreMatch[1].trim();
                const descMatch = trimmed.match(patterns.descripcion); if (descMatch) currentAPI.descripcion = descMatch[1].trim();
                const requestMatch = trimmed.match(patterns.request); if (requestMatch) currentAPI.request = requestMatch[1].trim();
                const responseMatch = trimmed.match(patterns.response); if (responseMatch) currentAPI.responseEsperada = responseMatch[1].trim();
            }
        });
        if (currentAPI) apis.push(currentAPI);
        return apis;
    }

    function mostrarModalRevisionAPIs(apis, docData) {
        const container = document.getElementById('modalContainer');
        container.innerHTML = `
            <div class="modal-overlay">
                <div class="modal" style="max-width: 1000px; max-height: 90vh; overflow-y: auto;">
                    <h3> APIs Generadas por IA</h3>
                    <p style="color: var(--text2); margin-bottom: 20px;">Se han detectado <strong>${apis.length} APIs/endpoints</strong> en el documento "${docData.nombre}".</p>
                    <div style="max-height: 60vh; overflow-y: auto; margin-bottom: 20px;">
                        ${apis.map((api, idx) => `
                            <div class="ia-case-card" style="padding: 16px; background: var(--card-alt); border-radius: 8px; margin-bottom: 12px; border-left: 4px solid var(--accent2);">
                                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
                                    <label style="display: flex; align-items: center; gap: 10px; cursor: pointer; flex: 1;">
                                        <input type="checkbox" class="api-select" value="${idx}" checked style="width: 20px; height: 20px; cursor: pointer;">
                                        <div style="flex: 1;">
                                            <div style="font-weight: 600; color: var(--accent);"><span class="badge badge-info">${api.metodo}</span> ${api.endpoint}</div>
                                            <div style="font-size: 0.8rem; color: var(--text2); margin-top: 4px;">${api.nombre}</div>
                                        </div>
                                    </label>
                                </div>
                                ${api.descripcion ? `<div style="font-size: 0.85rem; margin: 8px 0; padding: 8px; background: var(--bg); border-radius: 6px;"><strong>Descripción:</strong> ${api.descripcion}</div>` : ''}
                            </div>
                        `).join('')}
                    </div>
                    <div style="display: flex; gap: 10px; flex-wrap: wrap; align-items: center; padding: 16px; background: var(--bg); border-radius: 8px; margin-bottom: 20px;">
                        <button class="btn btn-accent" onclick="crearAPIsSeleccionadasIA(${apis.length})">✅ Crear ${apis.length} APIs Seleccionadas</button>
                        <button class="btn btn-outline" onclick="selectAllAPIs(true)">Seleccionar todas</button>
                        <button class="btn btn-outline" onclick="selectAllAPIs(false)">Deseleccionar todas</button>
                        <button class="btn btn-outline" onclick="closeModal()">Cancelar</button>
                    </div>
                </div>
            </div>`;
    }

    window.selectAllAPIs = function(selectAll) { document.querySelectorAll('.api-select').forEach(cb => { cb.checked = selectAll; }); };
    
    window.crearAPIsSeleccionadasIA = function(totalAPIs) {
        const selected = Array.from(document.querySelectorAll('.api-select:checked')).map(cb => parseInt(cb.value));
        if (selected.length === 0) { toast('Warning: Selecciona al menos una API para crear', 'warning'); return; }
        const tempDoc = sessionStorage.getItem('temp_documento_' + getActiveProject());
        const docData = JSON.parse(tempDoc);
        const apisSugeridas = extraerAPIsDeTexto(extraerTextoDeDocumento(docData.contenido, docData.tipo));
        let creadas = 0;
        selected.forEach(idx => {
            const apiData = apisSugeridas[idx];
            const newAPI = { id: apiData.id, nombre: apiData.nombre, endpoint: apiData.endpoint, metodo: apiData.metodo, request: apiData.request, respEsperada: apiData.responseEsperada, descripcion: apiData.descripcion, estado: 'Pendiente', proyecto: getActiveProject(), generadoPorIA: true };
            appData.apis.push(newAPI);
            creadas++;
        });
        saveData(); closeModal(); sessionStorage.removeItem('temp_documento_' + getActiveProject());
        toast(`✅ Se han creado ${creadas} APIs automáticamente`, 'success');
        setTimeout(() => { renderPage('apis'); }, 1000);
    };

    // ============ APP INIT ============
    function showApp() {
        document.getElementById('authScreen').style.display = 'none';
        document.getElementById('appScreen').style.display = 'flex';
        document.getElementById('userDisplay').textContent = currentUser.nombre.split(' ')[0];
        document.getElementById('userAvatar').textContent = currentUser.nombre.split(' ')[0].charAt(0).toUpperCase();
        const menuAjustes = document.getElementById('menuAjustes');
        if (menuAjustes && currentUser.rol !== 'Admin') menuAjustes.style.display = 'none';
        buildSidebar();
        if (currentUser.rol === 'Consultor') {
            const authProjects = currentUser.proyectosAutorizados || [];
            if (authProjects.length === 1) { appData.configuracion.activeProject = authProjects[0]; saveData(); } 
            else if (authProjects.length > 1) {
                const currentActive = getActiveProject();
                if (!currentActive || !authProjects.includes(currentActive)) { appData.configuracion.activeProject = ''; saveData(); }
            }
        }
        initApp(); updateNotificationBadge();
        if (currentUser.rol === 'Consultor') {
            const authProjects = currentUser.proyectosAutorizados || [];
            if (authProjects.length === 0) showNoProjectAccessModal();
        }
    }

    function showNoProjectAccessModal() {
        const container = document.getElementById('modalContainer');
        container.innerHTML = `
            <div class="modal-overlay" style="background: rgba(0, 0, 0, 0.85); backdrop-filter: blur(10px);">
                <div class="modal" style="max-width: 500px; text-align: center; border-top: 5px solid var(--danger);">
                    <div style="font-size: 4rem; margin-bottom: 20px;">🔒</div>
                    <h2 style="color: var(--danger); margin-bottom: 15px; font-size: 1.5rem;">Acceso Restringido</h2>
                    <p style="color: var(--text2); font-size: 1rem; line-height: 1.6; margin-bottom: 30px;">Tu cuenta ha sido creada correctamente, pero actualmente <strong>no tienes ningún proyecto asignado</strong>.<br><br>Por favor, <strong>contacta con el administrador</strong> para que te asigne los proyectos a los que puedes acceder y poder comenzar a trabajar.</p>
                    <button class="btn btn-danger" onclick="handleLogout(true)" style="width: 100%; justify-content: center; padding: 14px; font-size: 1rem;">🚪 Cerrar Sesión</button>
                </div>
            </div>`;
    }

    function buildSidebar() {
        const sidebar = document.getElementById('sidebar');
        const isConsultor = currentUser.rol === 'Consultor';
        const menuItems = [
            { section: 'Principal', items: [{ page: 'proyectos', icon: '📁', label: 'Proyectos', iconClass: 'icon-proyectos' }, { page: 'informes', icon: '📄', label: 'Informes', iconClass: 'icon-informes' }, { page: 'usuarios', icon: '👥', label: 'Usuarios', iconClass: 'icon-usuarios' }], adminOnly: true },
            { section: 'QA Técnico', items: [{ page: 'dashboard', icon: '📊', label: 'Dashboard', iconClass: 'icon-dashboard' }, { page: 'casos', icon: '📋', label: 'Casos de Uso', iconClass: 'icon-casos' }, { page: 'bugs', icon: '🐛', label: 'Defectos', iconClass: 'icon-bugs' }, { page: 'ejecuciones', icon: '▶️', label: 'Ejecuciones', iconClass: 'icon-ejecuciones' }, { page: 'requisitos', icon: '📑', label: 'Requisitos', iconClass: 'icon-requisitos' }, { page: 'mejoras', icon: '💡', label: 'Propuestas', iconClass: 'icon-mejoras' }, { page: 'objetivos', icon: '🎯', label: 'Objetivos', iconClass: 'icon-objetivos' }, { page: 'ia', icon: '🤖', label: 'IA & Analytics', iconClass: 'icon-ia' }] },
            { section: 'Registro', items: [{ page: 'diario', icon: '📝', label: 'Registro Diario', iconClass: 'icon-diario' }, { page: 'capturas', icon: '📸', label: 'Capturas QA', iconClass: 'icon-capturas' }, { page: 'apis', icon: '🔌', label: 'Gestión APIs', iconClass: 'icon-apis' }] },
            { section: 'Seguimiento', items: [{ page: 'trazabilidad', icon: '🔍', label: 'Trazabilidad', iconClass: 'icon-trazabilidad' }, { page: 'historico', icon: '📦', label: 'Histórico', iconClass: 'icon-historico' }, { page: 'ajustes', icon: '⚙️', label: 'Ajustes', iconClass: 'icon-ajustes' }, { page: 'manual', icon: '📖', label: 'Manual de Usuario', iconClass: 'icon-manual' }], adminOnly: true },
            { section: 'Gestión', items: [{ page: 'permisos', icon: '🔐', label: 'Permisos Consultores', iconClass: 'icon-ajustes' }], adminOnly: true }
        ];
        let html = `<div class="sidebar-logo"><div class="logo-icon">🛡️</div><span>QA Suite PRO</span></div>`;
        menuItems.forEach(section => {
            if (section.adminOnly && isConsultor) return;
            html += `<div class="sidebar-section-title">${section.section}</div><ul class="nav-list">`;
            section.items.forEach(item => { html += `<li class="nav-item" data-page="${item.page}"><div class="nav-icon-wrap ${item.iconClass}">${item.icon}</div><span class="nav-text">${item.label}</span></li>`; });
            html += '</ul>';
        });
        sidebar.innerHTML = html;
    }

    // ============ AUTH ============
    window.showRegister = () => { document.getElementById('loginForm').style.display = 'none'; document.getElementById('registerForm').style.display = 'block'; };
    window.showLogin = () => { document.getElementById('loginForm').style.display = 'block'; document.getElementById('registerForm').style.display = 'none'; };
    
    window.doRegister = () => {
        const n = document.getElementById('regName').value.trim();
        const u = document.getElementById('regUser').value.trim();
        const p = document.getElementById('regPass').value;
        const p2 = document.getElementById('regPass2').value;
        const rolInicial = 'Consultor';
        if (!n || !u || !p) return toast('Completa todos los campos', 'error');
        if (p.length < 6) return toast('Mínimo 6 caracteres', 'error');
        if (p !== p2) return toast('Contraseñas no coinciden', 'error');
        if (appData.usuarios.find(x => x.usuario === u)) return toast('Usuario ya existe', 'error');
        appData.usuarios.push({ id: Date.now(), nombre: n, usuario: u, password: p, rol: rolInicial, proyectosAutorizados: [] });
        saveData(); toast('Registro exitoso. Un admin debe activar tu rol.', 'success'); window.showLogin();
    };

    window.doLogin = () => {
        const u = document.getElementById('loginUser').value.trim();
        const p = document.getElementById('loginPass').value;
        const found = appData.usuarios.find(x => x.usuario === u && x.password === p);
        
        if (!found) return toast('Credenciales incorrectas', 'error');
        
        currentUser = found;
        saveSession(found.id);  // ✅ Esto guarda la sesión
        currentPage = getLastPage();
        showApp();
        toast(`Bienvenido, ${found.nombre.split(' ')[0]}`, 'success');
    };

    // Busca handleLogout() y asegúrate de que use sessionStorage en lugar de localStorage:
    window.handleLogout = (forceLogout = false) => {
        if (forceLogout) {
            currentUser = null;
            clearSession();
            sessionStorage.removeItem(PAGE_KEY); // Cambiado de localStorage a sessionStorage
            document.getElementById('authScreen').style.display = 'flex';
            document.getElementById('appScreen').style.display = 'none';
            document.getElementById('modalContainer').innerHTML = '';
            toast('Sesión cerrada', 'info');
        } else {
            showConfirmModal('¿Cerrar sesión?', () => {
                currentUser = null;
                clearSession();
                sessionStorage.removeItem(PAGE_KEY); // Cambiado de localStorage a sessionStorage
                document.getElementById('authScreen').style.display = 'flex';
                document.getElementById('appScreen').style.display = 'none';
            });
        }
    };

    // ============ THEME ============
    function applyTheme() {
        document.body.classList.toggle('light-mode', appData.configuracion.theme === 'light');
        const icon = document.getElementById('themeIcon');
        if (icon) icon.textContent = appData.configuracion.theme === 'dark' ? '🌓' : '☀️';
    }
    window.toggleTheme = () => { appData.configuracion.theme = appData.configuracion.theme === 'dark' ? 'light' : 'dark'; saveData(); applyTheme(); };

    // ============ TOAST ============
    function toast(msg, type = 'success') {
        const c = document.getElementById('toastContainer');
        const el = document.createElement('div');
        el.className = `toast toast-${type}`;
        const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
        el.innerHTML = `<span>${icons[type] || ''}</span><span>${msg}</span>`;
        c.appendChild(el);
        setTimeout(() => { el.style.animation = 'slideInRight 0.3s ease reverse'; setTimeout(() => el.remove(), 300); }, 3000);
    }

    // ============ SIDEBAR TOGGLE ============
    window.toggleSidebar = () => { const sb = document.getElementById('sidebar'); window.innerWidth <= 768 ? sb.classList.toggle('open') : sb.classList.toggle('collapsed'); };

    // ============ USER MENU ============
    window.toggleUserMenu = () => { document.getElementById('userMenu').classList.toggle('show'); };
    document.addEventListener('click', (e) => {
        const menu = document.getElementById('userMenu');
        const trigger = document.querySelector('.user-trigger');
        if (menu && trigger && !trigger.contains(e.target) && !menu.contains(e.target)) menu.classList.remove('show');
    });

    // ============ PROFILE MODAL ============
    window.openProfile = () => {
        document.getElementById('userMenu').classList.remove('show');
        const container = document.getElementById('modalContainer');
        const userBugs = appData.bugs.filter(b => true).length;
        const userCases = appData.casos.length;
        const userExecs = appData.ejecuciones.length;
        const userTraces = appData.trazabilidad.filter(t => t.usuario === currentUser.usuario).length;
        const html = `
            <div class="modal-overlay">
                <div class="modal profile-modal">
                    <div class="profile-header">
                        <div class="profile-avatar">${currentUser.nombre.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}</div>
                        <div class="profile-name">${currentUser.nombre}</div>
                        <div class="profile-role">${currentUser.rol}</div>
                        <div class="profile-stats">
                            <div class="profile-stat"><div class="profile-stat-value">${userCases}</div><div class="profile-stat-label">Casos</div></div>
                            <div class="profile-stat"><div class="profile-stat-value">${userBugs}</div><div class="profile-stat-label">Bugs</div></div>
                            <div class="profile-stat"><div class="profile-stat-value">${userExecs}</div><div class="profile-stat-label">Ejecuciones</div></div>
                        </div>
                    </div>
                    <div class="profile-info">
                        <div class="profile-info-item"><span class="profile-info-label">👤 Usuario</span><span class="profile-info-value">${currentUser.usuario}</span></div>
                        <div class="profile-info-item"><span class="profile-info-label">🎭 Rol</span><span class="profile-info-value">${currentUser.rol}</span></div>
                        <div class="profile-info-item"><span class="profile-info-label">🆔 ID</span><span class="profile-info-value">#${currentUser.id}</span></div>
                        <div class="profile-info-item"><span class="profile-info-label">📊 Actividad</span><span class="profile-info-value">${userTraces} acciones registradas</span></div>
                    </div>
                    <div style="margin-top:20px; padding-top:20px; border-top:1px solid var(--border);">
                        <h4 style="margin-bottom:12px; font-size:0.9rem;">🔐 Cambiar Contraseña</h4>
                        <div class="form-group"><input type="password" id="newPass" placeholder="Nueva contraseña (mín. 6 caracteres)"></div>
                        <button class="btn btn-outline" onclick="changePassword()" style="width:100%;">Actualizar contraseña</button>
                    </div>
                    <div class="modal-actions"><button class="btn btn-outline" onclick="closeModal()">Cerrar</button></div>
                </div>
            </div>`;
        container.innerHTML = html;
        document.addEventListener('keydown', escCloseModal);
    };

    window.changePassword = () => {
        const newPass = document.getElementById('newPass').value;
        if (!newPass || newPass.length < 6) return toast('Mínimo 6 caracteres', 'error');
        const idx = appData.usuarios.findIndex(u => u.id === currentUser.id);
        if (idx >= 0) { appData.usuarios[idx].password = newPass; currentUser.password = newPass; saveData(); toast('Contraseña actualizada', 'success'); closeModal(); }
    };

    // ============ NOTIFICATIONS ============
    window.toggleNotifications = () => { document.getElementById('notificationsPanel').classList.toggle('show'); renderNotifications(); };
    function updateNotificationBadge() {
        const badge = document.getElementById('notifBadge');
        if (badge) { const unread = notifications.filter(n => !n.read).length; badge.textContent = unread; badge.style.display = unread > 0 ? 'flex' : 'none'; }
    }
    function renderNotifications() {
        const panel = document.getElementById('notificationsPanel');
        let html = `<div class="notifications-header"><span>🔔 Notificaciones</span><button class="btn btn-sm btn-outline" onclick="clearNotifications()">Limpiar</button></div>`;
        if (notifications.length === 0) { html += `<div class="notifications-empty"><div style="font-size:2rem; margin-bottom:8px;"></div>No hay notificaciones</div>`; } 
        else {
            notifications.slice(-10).reverse().forEach(n => { html += `<div class="notification-item" onclick="markNotifRead('${n.id}')"><div class="notification-title">${n.title}</div><div class="notification-desc">${n.desc}</div><div class="notification-time">${timeAgo(n.time)}</div></div>`; });
        }
        panel.innerHTML = html;
    }
    window.markNotifRead = (id) => { const n = notifications.find(x => x.id === id); if (n) { n.read = true; saveData(); updateNotificationBadge(); } };
    window.clearNotifications = () => { notifications = []; saveData(); updateNotificationBadge(); renderNotifications(); };
    function addNotification(title, desc) {
        notifications.push({ id: Date.now().toString(), title, desc, time: new Date().toISOString(), read: false });
        if (notifications.length > 50) notifications = notifications.slice(-50);
        saveData(); updateNotificationBadge();
    }
    function timeAgo(dateStr) {
        const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
        if (diff < 60) return 'Hace un momento';
        if (diff < 3600) return `Hace ${Math.floor(diff / 60)} min`;
        if (diff < 86400) return `Hace ${Math.floor(diff / 3600)} h`;
        return `Hace ${Math.floor(diff / 86400)} días`;
    }

    // ============ APP INIT ============
    function initApp() {
        populateProjectSelector();
        document.querySelectorAll('.nav-item').forEach(el => el.addEventListener('click', () => navigateTo(el.dataset.page)));
        if (currentUser.rol === 'Consultor' && !consultorPages.includes(currentPage)) currentPage = 'casos';
        navigateTo(currentPage);
        document.getElementById('activeProjectSelect').value = getActiveProject();
        updateSidebarDisabledState();
        updatePageTitle(currentPage);
    }

    window.onProjectChange = () => {
        const sel = document.getElementById('activeProjectSelect');
        if (sel && sel.disabled) return;
        appData.configuracion.activeProject = sel.value;
        saveData(); renderPage(currentPage); updateSidebarDisabledState();
    };

    function populateProjectSelector() {
        const sel = document.getElementById('activeProjectSelect');
        if (!sel) return;
        let projectsToShow = appData.proyectos || [];
        const isConsultor = currentUser && currentUser.rol === 'Consultor';
        const authProjects = isConsultor ? (currentUser.proyectosAutorizados || []) : [];
        if (isConsultor && authProjects.length > 0) projectsToShow = projectsToShow.filter(p => authProjects.includes(p.id));
        if (!Array.isArray(projectsToShow) || projectsToShow.length === 0) { sel.innerHTML = '<option value="">Sin proyectos disponibles</option>'; sel.disabled = true; return; }
        if (isConsultor && projectsToShow.length === 1) {
            const singleProject = projectsToShow[0];
            sel.innerHTML = `<option value="${singleProject.id}" selected>🔒 ${singleProject.nombre || singleProject.id}</option>`;
            sel.disabled = true; sel.title = 'Proyecto asignado por el administrador';
            appData.configuracion.activeProject = singleProject.id; return;
        }
        sel.disabled = false; sel.title = '';
        let html = '<option value="">Todos los proyectos</option>';
        projectsToShow.forEach(p => { html += `<option value="${p.id}" ${p.id === getActiveProject() ? 'selected' : ''}>${p.nombre || p.id}</option>`; });
        sel.innerHTML = html;
        if (isConsultor && projectsToShow.length > 1 && !getActiveProject()) sel.value = '';
    }

    window.navigateTo = (page) => {
        if (currentUser.rol === 'Consultor' && !consultorPages.includes(page) && page !== 'dashboard') { toast('Acceso denegado', 'error'); return; }
        const ap = getActiveProject();
        if (projectRequiredPages.includes(page) && !ap) { toast('Selecciona un proyecto activo primero', 'warning'); return; }
        if (currentUser.rol === 'Consultor' && currentUser.proyectosAutorizados) {
            if (!currentUser.proyectosAutorizados.includes(ap) && ap) { toast('No tienes acceso a los datos de este proyecto', 'error'); page = 'dashboard'; }
        }
        currentPage = page; saveLastPage(page);
        document.querySelectorAll('.sidebar-item, .nav-item').forEach(item => { item.classList.remove('active'); });
        const activeItem = document.querySelector(`[data-page="${page}"]`) || document.querySelector(`.sidebar-item[onclick="navigateTo('${page}')"]`);
        if (activeItem) activeItem.classList.add('active');
        renderPage(page); updatePageTitle(page);
        if (window.innerWidth <= 768) document.getElementById('sidebar').classList.remove('open');
    };

    function updatePageTitle(page) {
        const pageTitles = {
            'dashboard': { icon: '📊', title: 'Dashboard' }, 'proyectos': { icon: '📁', title: 'Proyectos' }, 'objetivos': { icon: '🎯', title: 'Objetivos' },
            'mejoras': { icon: '💡', title: 'Propuestas de Mejora' }, 'usuarios': { icon: '👥', title: 'Gestión de Usuarios' }, 'casos': { icon: '📋', title: 'Casos de Uso' },
            'bugs': { icon: '🐛', title: 'Defectos' }, 'ejecuciones': { icon: '▶️', title: 'Ejecuciones de Pruebas' }, 'requisitos': { icon: '📑', title: 'Requisitos' },
            'diario': { icon: '📝', title: 'Registro Diario' }, 'capturas': { icon: '📸', title: 'Capturas QA' }, 'apis': { icon: '🔌', title: 'Gestión APIs' },
            'trazabilidad': { icon: '🔍', title: 'Trazabilidad' }, 'informes': { icon: '📄', title: 'Informes' }, 'historico': { icon: '📦', title: 'Histórico' },
            'ajustes': { icon: '⚙️', title: 'Ajustes' }, 'permisos': { icon: '', title: 'Permisos Consultores' }, 'manual': { icon: '', title: 'Manual de Usuario' },
            'ia': { icon: '', title: 'IA & Machine Learning' }
        };
        const titleData = pageTitles[page] || { icon: '📄', title: page };
        const iconEl = document.getElementById('pageTitleIcon');
        const textEl = document.getElementById('pageTitleText');
        if (iconEl) iconEl.textContent = titleData.icon;
        if (textEl) textEl.textContent = titleData.title;
    }

    function updateSidebarDisabledState() {
        const proyectoActivo = getActiveProject();
        const paginasExentas = ['dashboard', 'proyectos', 'usuarios', 'ajustes', 'manual'];
        document.querySelectorAll('.nav-item').forEach(item => {
            const page = item.dataset.page;
            if (!proyectoActivo && projectRequiredPages.includes(page) && !paginasExentas.includes(page)) { item.classList.add('disabled'); item.title = 'Selecciona un proyecto primero'; } 
            else { item.classList.remove('disabled'); item.removeAttribute('title'); }
        });
    }

    window.renderPage = function(page) {
        const content = document.getElementById('contentArea');
        let html = '';
        switch (page) {
            case 'dashboard': html = renderDashboard(); break;
            case 'proyectos': html = renderProyectos(); break;
            case 'objetivos': html = renderObjetivos(); break;
            case 'mejoras': html = renderMejoras(); break;
            case 'usuarios': html = renderUsuarios(); break;
            case 'casos': html = renderCasos(); break;
            case 'bugs': html = renderBugs(); break;
            case 'ejecuciones': html = renderEjecuciones(); break;
            case 'diario': html = renderDiario(); break;
            case 'capturas': html = renderCapturas(); break;
            case 'apis': html = renderApis(); break;
            case 'trazabilidad': html = renderTrazabilidad(); break;
            case 'informes': html = renderInformes(); break;
            case 'historico': html = renderHistorico(); break;
            case 'ajustes': html = renderAjustes(); break;
            case 'permisos': html = renderConsultantPermissions(); break;
            case 'manual': html = renderManual(); break;
            case 'requisitos': html = renderRequisitos(); break;
            case 'ia': html = renderIA(); break;
        }
        content.innerHTML = html;
        bindPageEvents(page);
        const si = content.querySelector('.search-input');
        if (si) { si.focus(); si.setSelectionRange(si.value.length, si.value.length); }
    };

    window.clearFilters = function(page) {
        searchTerm = '';
        const searchInput = document.querySelector('.search-input');
        if (searchInput) searchInput.value = '';
        document.querySelectorAll('[id^="filter_"]').forEach(select => { select.value = ''; });
        renderPage(page);
    };

    function bindPageEvents(page) {
        const content = document.getElementById('contentArea');
        content.querySelector('.search-input')?.addEventListener('input', function (e) { searchTerm = e.target.value.toLowerCase(); currentPages[page] = 1; renderPage(page); });
        content.querySelectorAll('[data-action]').forEach(btn => btn.addEventListener('click', function () { handleAction(page, this.dataset.action, this.dataset.id); }));
        content.querySelectorAll('.pagination button').forEach(b => b.addEventListener('click', function () { if (this.dataset.pg) { currentPages[page] = +this.dataset.pg; renderPage(page); } }));
        content.querySelector('.page-size-select')?.addEventListener('change', function () { pageSize = +this.value; currentPages[page] = 1; renderPage(page); });
        content.querySelectorAll('th[data-sort]').forEach(th => th.addEventListener('click', function () { const f = this.dataset.sort; sortConfig = { field: f, dir: sortConfig.field === f && sortConfig.dir === 'asc' ? 'desc' : 'asc' }; renderPage(page); }));
        initCaptureTooltip();
    }

    function renderConsultantPermissions() {
        const consultants = appData.usuarios.filter(u => u.rol === 'Consultor');
        let html = '<h1 class="page-title">🔐 Permisos de Consultores</h1>';
        if (consultants.length === 0) { html += '<div class="empty-state"><div class="empty-state-icon"></div><div>No hay consultores registrados</div></div>'; return html; }
        html += '<div class="chart-grid">';
        consultants.forEach(consultant => {
            const projects = consultant.proyectosAutorizados || [];
            const projectNames = projects.map(pid => { const p = appData.proyectos.find(proj => proj.id === pid); return p ? (p.nombre || p.id) : pid; }).join(', ') || 'Ninguno';
            html += `<div class="chart-card"><div class="chart-title">👤 ${consultant.nombre}</div><div style="margin-bottom:12px;"><strong>Usuario:</strong> ${consultant.usuario}</div><div style="margin-bottom:12px;"><strong>Proyectos autorizados:</strong> ${projects.length}</div><div style="padding:12px; background:var(--card-alt); border-radius:8px; font-size:0.9rem; min-height:40px;">${projectNames}</div><button class="btn btn-outline btn-sm" style="margin-top:12px;" onclick="window.openModal('usuarios', ${consultant.id})">✏️ Editar Permisos</button></div>`;
        });
        html += '</div>';
        return html;
    }

    function renderManual() {
        const html = `
            <div class="manual-container" style="max-width: 1100px; margin: 0 auto; padding-bottom: 60px; animation: fadeIn 0.3s ease;">
                
                <!-- CABECERA DEL MANUAL -->
                <div style="background: linear-gradient(135deg, var(--accent), var(--accent2)); padding: 40px; border-radius: 16px; margin-bottom: 30px; color: #fff; box-shadow: 0 10px 30px rgba(59, 130, 246, 0.3);">
                    <div style="display:flex; align-items:center; gap:20px; margin-bottom:15px;">
                        <div style="font-size:4rem;">📖</div>
                        <div>
                            <h1 style="margin:0; font-size:2.2rem; font-weight:800;">Manual de Usuario</h1>
                            <p style="margin:4px 0 0 0; font-size:1.1rem; opacity:0.95;">Guía oficial completa de QA Suite PRO</p>
                        </div>
                    </div>
                    <p style="margin:0; font-size:0.95rem; line-height:1.6; opacity:0.95;">
                        Bienvenido al sistema de gestión de calidad más completo del mercado. Este manual te guiará paso a paso para aprovechar al máximo todas las funcionalidades: desde la creación de casos de uso hasta la firma digital de releases y el análisis con IA.
                    </p>
                    <div style="display:flex; gap:10px; margin-top:20px; flex-wrap:wrap;">
                        <span style="background:rgba(255,255,255,0.2); padding:6px 14px; border-radius:20px; font-size:0.8rem; font-weight:600;">📅 Versión 2.0</span>
                        <span style="background:rgba(255,255,255,0.2); padding:6px 14px; border-radius:20px; font-size:0.8rem; font-weight:600;">⏱️ Lectura: 15 min</span>
                        <span style="background:rgba(255,255,255,0.2); padding:6px 14px; border-radius:20px; font-size:0.8rem; font-weight:600;">🎯 Nivel: Todos</span>
                    </div>
                </div>

                <!-- ÍNDICE RÁPIDO -->
                <div class="chart-card" style="margin-bottom:30px; border-left:4px solid var(--accent);">
                    <div class="chart-title" style="color:var(--accent);">📑 Índice de Contenidos</div>
                    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:10px;">
                        <a href="#sec1" style="padding:10px 14px; background:var(--card-alt); border-radius:8px; text-decoration:none; color:var(--text); font-size:0.88rem; transition:0.2s; border:1px solid var(--border);" onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border)'">1. 🔄 Flujo de Trabajo QA</a>
                        <a href="#sec2" style="padding:10px 14px; background:var(--card-alt); border-radius:8px; text-decoration:none; color:var(--text); font-size:0.88rem; transition:0.2s; border:1px solid var(--border);" onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border)'">2. 📋 Módulos Principales</a>
                        <a href="#sec3" style="padding:10px 14px; background:var(--card-alt); border-radius:8px; text-decoration:none; color:var(--text); font-size:0.88rem; transition:0.2s; border:1px solid var(--border);" onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border)'">3. ⌨️ Atajos de Teclado</a>
                        <a href="#sec4" style="padding:10px 14px; background:var(--card-alt); border-radius:8px; text-decoration:none; color:var(--text); font-size:0.88rem; transition:0.2s; border:1px solid var(--border);" onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border)'">4. 🛡️ Roles y Permisos</a>
                        <a href="#sec5" style="padding:10px 14px; background:var(--card-alt); border-radius:8px; text-decoration:none; color:var(--text); font-size:0.88rem; transition:0.2s; border:1px solid var(--border);" onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border)'">5. 🤖 Inteligencia Artificial</a>
                        <a href="#sec6" style="padding:10px 14px; background:var(--card-alt); border-radius:8px; text-decoration:none; color:var(--text); font-size:0.88rem; transition:0.2s; border:1px solid var(--border);" onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border)'">6. ✍️ Firma Digital & PDF</a>
                        <a href="#sec7" style="padding:10px 14px; background:var(--card-alt); border-radius:8px; text-decoration:none; color:var(--text); font-size:0.88rem; transition:0.2s; border:1px solid var(--border);" onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border)'">7. 📊 Informes y Exportación</a>
                        <a href="#sec8" style="padding:10px 14px; background:var(--card-alt); border-radius:8px; text-decoration:none; color:var(--text); font-size:0.88rem; transition:0.2s; border:1px solid var(--border);" onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border)'">8. ❓ Preguntas Frecuentes</a>
                    </div>
                </div>

                <!-- SECCIÓN 1: FLUJO DE TRABAJO -->
                <div id="sec1" class="chart-card" style="margin-bottom:25px;">
                    <div class="chart-title" style="color: var(--accent); font-size:1.3rem;"><span style="font-size:1.5rem;">🔄</span> 1. Flujo de Trabajo (El Ciclo QA Completo)</div>
                    <p style="color: var(--text2); line-height: 1.6; margin-bottom: 15px; font-size: 0.95rem;">
                        QA Suite PRO está diseñado para mantener una <strong>trazabilidad completa</strong> siguiendo el estándar <strong>ISTQB</strong> y emulando el flujo de herramientas enterprise como <strong>JIRA + Xray + Zephyr</strong>.
                    </p>
                    <div style="background: var(--bg2); padding: 20px; border-radius: 10px; border: 1px dashed var(--border);">
                        <ol style="color: var(--text); line-height: 2; margin-left: 20px; font-size: 0.95rem;">
                            <li><strong>📁 Elegir Proyecto:</strong> Selecciona el proyecto activo en el desplegable superior. Todo lo que crees quedará vinculado a él.</li>
                            <li><strong>📑 Definir Requisitos:</strong> Crea los requisitos funcionales del proyecto. Puedes adjuntar documentos (PDF/DOCX/TXT) para que la IA los analice.</li>
                            <li><strong>📋 Crear Casos de Prueba:</strong> Define qué se va a probar. Cada caso se vincula a un requisito. Incluye: Actor, Pasos, Input, Criterios BDD y Resultado Esperado.</li>
                            <li><strong>▶️ Ejecutar (Ciclo Xray):</strong> Agrupa los casos en un <em>Test Plan</em> o ciclo de ejecución. Marca cada caso como <span style="color:var(--success); font-weight:600;">Passed</span>, <span style="color:var(--danger); font-weight:600;">Failed</span>, <span style="color:var(--warning); font-weight:600;">Blocked</span> o <span style="color:var(--info); font-weight:600;">In Progress</span>.</li>
                            <li><strong>🐛 Reportar Defectos:</strong> Si un caso falla, el sistema te ofrece crear automáticamente un Bug vinculado al caso y al ciclo de ejecución.</li>
                            <li><strong>📸 Adjuntar Evidencias:</strong> Sube capturas de pantalla vinculadas a casos, bugs o APIs como evidencia visual.</li>
                            <li><strong>🔌 Validar APIs:</strong> Registra endpoints, métodos, status codes reales y tiempos de respuesta (ideal para Postman).</li>
                            <li><strong>✍️ Firmar Release:</strong> Cuando el ciclo está completo, fírmalo digitalmente con tu contraseña para aprobar el paso a producción.</li>
                            <li><strong>📄 Generar Certificado PDF:</strong> Obtén un certificado profesional firmado con hash único para auditorías.</li>
                        </ol>
                    </div>
                </div>

                <!-- SECCIÓN 2: MÓDULOS PRINCIPALES -->
                <div id="sec2" class="chart-card" style="margin-bottom:25px;">
                    <div class="chart-title" style="color: var(--accent); font-size:1.3rem;"><span style="font-size:1.5rem;">📋</span> 2. Módulos Principales</div>
                    
                    <!-- Sub-sección: Dashboard -->
                    <div style="background: var(--card-alt); padding:18px; border-radius:10px; margin-bottom:12px; border-left:4px solid var(--accent);">
                        <h4 style="margin:0 0 10px 0; color:var(--accent);">📊 Dashboard</h4>
                        <p style="color:var(--text2); font-size:0.9rem; line-height:1.6; margin:0;">
                            Vista general con KPIs en tiempo real: casos totales, bugs abiertos, cobertura de pruebas, tasa de defectos y estado de APIs. Incluye gráficos de barras y donuts SVG generados dinámicamente.
                        </p>
                    </div>

                    <!-- Sub-sección: Casos de Uso -->
                    <div style="background: var(--card-alt); padding:18px; border-radius:10px; margin-bottom:12px; border-left:4px solid var(--accent);">
                        <h4 style="margin:0 0 10px 0; color:var(--accent);">📋 Casos de Uso</h4>
                        <p style="color:var(--text2); font-size:0.9rem; line-height:1.6; margin:0 0 10px 0;">
                            Módulo central donde defines las pruebas. Cada caso tiene: ID único, requisito asociado, prioridad, actor, descripción, flujo de pasos, input del cliente, criterios BDD y resultado esperado.
                        </p>
                        <div style="background:var(--bg); padding:10px; border-radius:6px; font-size:0.85rem;">
                            <strong>💡 Tip:</strong> Usa los filtros superiores para ver casos por estado (Pendiente/Pasado/Fallido) o prioridad.
                        </div>
                    </div>

                    <!-- Sub-sección: Defectos -->
                    <div style="background: var(--card-alt); padding:18px; border-radius:10px; margin-bottom:12px; border-left:4px solid var(--danger);">
                        <h4 style="margin:0 0 10px 0; color:var(--danger);">🐛 Defectos (Bugs)</h4>
                        <p style="color:var(--text2); font-size:0.9rem; line-height:1.6; margin:0 0 10px 0;">
                            Registra todos los fallos detectados. Cada bug tiene: severidad (Bloqueante/Crítica/Mayor/Menor), caso relacionado, resumen técnico y descripción detallada.
                        </p>
                        <div style="background:var(--bg); padding:10px; border-radius:6px; font-size:0.85rem;">
                            <strong>🤖 IA:</strong> Al crear un bug, el sistema detecta automáticamente posibles duplicados usando el algoritmo de <strong>Levenshtein Distance</strong>. También puedes clasificar la severidad automáticamente con un clic.
                        </div>
                    </div>

                    <!-- Sub-sección: Ejecuciones -->
                    <div style="background: var(--card-alt); padding:18px; border-radius:10px; margin-bottom:12px; border-left:4px solid var(--success);">
                        <h4 style="margin:0 0 10px 0; color:var(--success);">▶️ Ejecuciones (Vista Xray)</h4>
                        <p style="color:var(--text2); font-size:0.9rem; line-height:1.6; margin:0 0 10px 0;">
                            Gestiona ciclos de prueba estilo <strong>Xray/Jira</strong>. Al crear un Test Plan, selecciona un requisito y el sistema cargará automáticamente todos sus casos asociados. Cada caso puede marcarse con 5 estados:
                        </p>
                        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(140px, 1fr)); gap:8px; margin-top:10px;">
                            <span style="padding:6px 10px; background:rgba(100,116,139,0.15); color:#94a3b8; border-radius:6px; font-size:0.8rem; font-weight:600; text-align:center;">⏳ Pendiente</span>
                            <span style="padding:6px 10px; background:rgba(59,130,246,0.15); color:#3b82f6; border-radius:6px; font-size:0.8rem; font-weight:600; text-align:center;">🔄 In Progress</span>
                            <span style="padding:6px 10px; background:rgba(16,185,129,0.15); color:#10b981; border-radius:6px; font-size:0.8rem; font-weight:600; text-align:center;">✅ Passed</span>
                            <span style="padding:6px 10px; background:rgba(239,68,68,0.15); color:#ef4444; border-radius:6px; font-size:0.8rem; font-weight:600; text-align:center;">❌ Failed</span>
                            <span style="padding:6px 10px; background:rgba(245,158,11,0.15); color:#f59e0b; border-radius:6px; font-size:0.8rem; font-weight:600; text-align:center;">🚫 Blocked</span>
                        </div>
                    </div>

                    <!-- Sub-sección: Requisitos -->
                    <div style="background: var(--card-alt); padding:18px; border-radius:10px; margin-bottom:12px; border-left:4px solid var(--accent3);">
                        <h4 style="margin:0 0 10px 0; color:var(--accent3);">📑 Requisitos</h4>
                        <p style="color:var(--text2); font-size:0.9rem; line-height:1.6; margin:0 0 10px 0;">
                            Define los requisitos funcionales, no funcionales o técnicos del proyecto. Puedes adjuntar documentos (PDF, DOCX, TXT) y usar la IA para generar casos de prueba automáticamente a partir de ellos.
                        </p>
                    </div>

                    <!-- Sub-sección: APIs -->
                    <div style="background: var(--card-alt); padding:18px; border-radius:10px; margin-bottom:12px; border-left:4px solid var(--accent2);">
                        <h4 style="margin:0 0 10px 0; color:var(--accent2);">🔌 Gestión de APIs</h4>
                        <p style="color:var(--text2); font-size:0.9rem; line-height:1.6; margin:0 0 10px 0;">
                            Módulo independiente para pruebas de backend. Registra: endpoint, método HTTP (GET/POST/PUT/DELETE), request, respuesta esperada, status code real, tiempo de respuesta y fecha de ejecución.
                        </p>
                        <div style="background:var(--bg); padding:10px; border-radius:6px; font-size:0.85rem;">
                            <strong>💡 Tip:</strong> Copia el JSON de respuesta desde Postman y pégalo en "Response Real". El sistema lo comparará con la respuesta esperada y validará automáticamente el estado.
                        </p>
                    </div>

                    <!-- Sub-sección: Capturas QA -->
                    <div style="background: var(--card-alt); padding:18px; border-radius:10px; margin-bottom:12px; border-left:4px solid #a78bfa;">
                        <h4 style="margin:0 0 10px 0; color:#a78bfa;">📸 Capturas QA</h4>
                        <p style="color:var(--text2); font-size:0.9rem; line-height:1.6; margin:0 0 10px 0;">
                            Sube evidencias visuales (capturas de pantalla) y vincúlalas a casos, bugs o APIs. Las imágenes se almacenan en Base64 y se muestran como miniaturas en las tablas. Al pasar el ratón por una fila con captura, aparecerá un tooltip con la imagen completa.
                        </p>
                    </div>

                    <!-- Sub-sección: Diario -->
                    <div style="background: var(--card-alt); padding:18px; border-radius:10px; margin-bottom:12px; border-left:4px solid #fbbf24;">
                        <h4 style="margin:0 0 10px 0; color:#fbbf24;">📝 Registro Diario</h4>
                        <p style="color:var(--text2); font-size:0.9rem; line-height:1.6; margin:0;">
                            Lleva un control de las horas invertidas por cada colaborador QA en el proyecto activo. Útil para métricas de productividad y facturación.
                        </p>
                    </div>

                    <!-- Sub-sección: Trazabilidad -->
                    <div style="background: var(--card-alt); padding:18px; border-radius:10px; margin-bottom:12px; border-left:4px solid #818cf8;">
                        <h4 style="margin:0 0 10px 0; color:#818cf8;">🔍 Trazabilidad</h4>
                        <p style="color:var(--text2); font-size:0.9rem; line-height:1.6; margin:0;">
                            Auditoría completa de todas las acciones del sistema: quién hizo qué, cuándo y en qué proyecto. Los logs se guardan automáticamente y pueden limpiarse desde el módulo.
                        </p>
                    </div>
                </div>

                <!-- SECCIÓN 3: ATAJOS DE TECLADO -->
                <div id="sec3" class="chart-card" style="margin-bottom:25px;">
                    <div class="chart-title" style="color: var(--accent); font-size:1.3rem;"><span style="font-size:1.5rem;">⌨️</span> 3. Atajos de Teclado</div>
                    <p style="color: var(--text2); line-height: 1.6; margin-bottom: 15px; font-size: 0.95rem;">
                        Acelera tu trabajo con estos atajos disponibles en toda la aplicación:
                    </p>
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                        <div style="background: var(--bg2); padding: 15px; border-radius: 8px; border: 1px solid var(--border);">
                            <div style="display:flex; justify-content:space-between; color: var(--text2); font-size: 0.9rem; align-items:center;">
                                <span>🔍 Buscador Global (Command Palette)</span>
                                <kbd style="background: var(--input-bg); padding: 4px 10px; border-radius: 4px; border: 1px solid var(--border); font-weight: 600; color: var(--text);">Ctrl + K</kbd>
                            </div>
                            <p style="font-size:0.8rem; color:var(--text2); margin:8px 0 0 0;">Busca en todos los módulos al instante. Navega con ↑↓ y selecciona con Enter.</p>
                        </div>
                        <div style="background: var(--bg2); padding: 15px; border-radius: 8px; border: 1px solid var(--border);">
                            <div style="display:flex; justify-content:space-between; color: var(--text2); font-size: 0.9rem; align-items:center;">
                                <span>🌓 Alternar Tema Visual</span>
                                <kbd style="background: var(--input-bg); padding: 4px 10px; border-radius: 4px; border: 1px solid var(--border); font-weight: 600; color: var(--text);">Ctrl + T</kbd>
                            </div>
                            <p style="font-size:0.8rem; color:var(--text2); margin:8px 0 0 0;">Cambia entre modo oscuro y modo claro "Eye-Care".</p>
                        </div>
                        <div style="background: var(--bg2); padding: 15px; border-radius: 8px; border: 1px solid var(--border);">
                            <div style="display:flex; justify-content:space-between; color: var(--text2); font-size: 0.9rem; align-items:center;">
                                <span>✖ Cerrar Modal</span>
                                <kbd style="background: var(--input-bg); padding: 4px 10px; border-radius: 4px; border: 1px solid var(--border); font-weight: 600; color: var(--text);">Esc</kbd>
                            </div>
                            <p style="font-size:0.8rem; color:var(--text2); margin:8px 0 0 0;">Cierra cualquier modal abierto rápidamente.</p>
                        </div>
                        <div style="background: var(--bg2); padding: 15px; border-radius: 8px; border: 1px solid var(--border);">
                            <div style="display:flex; justify-content:space-between; color: var(--text2); font-size: 0.9rem; align-items:center;">
                                <span>↵ Login Rápido</span>
                                <kbd style="background: var(--input-bg); padding: 4px 10px; border-radius: 4px; border: 1px solid var(--border); font-weight: 600; color: var(--text);">Enter</kbd>
                            </div>
                            <p style="font-size:0.8rem; color:var(--text2); margin:8px 0 0 0;">En la pantalla de login, presiona Enter para iniciar sesión.</p>
                        </div>
                    </div>
                </div>

                <!-- SECCIÓN 4: ROLES Y PERMISOS -->
                <div id="sec4" class="chart-card" style="margin-bottom:25px;">
                    <div class="chart-title" style="color: var(--accent); font-size:1.3rem;"><span style="font-size:1.5rem;">🛡️</span> 4. Roles y Permisos</div>
                    <p style="color: var(--text2); line-height: 1.6; margin-bottom: 15px; font-size: 0.95rem;">
                        QA Suite PRO implementa un sistema <strong>RBAC (Role-Based Access Control)</strong> con dos roles principales:
                    </p>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px;">
                        <div style="background: var(--card-alt); padding:18px; border-radius:10px; border-top:4px solid var(--danger);">
                            <h4 style="margin:0 0 10px 0; color:var(--danger);">👑 Admin</h4>
                            <ul style="color: var(--text2); line-height: 1.8; margin: 0; padding-left: 20px; font-size: 0.9rem;">
                                <li>Control total del sistema</li>
                                <li>Crear y gestionar proyectos</li>
                                <li>Administrar usuarios y roles</li>
                                <li>Asignar proyectos a consultores</li>
                                <li>Acceso a todos los módulos</li>
                                <li>Vaciar sistema y gestionar logs</li>
                            </ul>
                        </div>
                        <div style="background: var(--card-alt); padding:18px; border-radius:10px; border-top:4px solid var(--accent);">
                            <h4 style="margin:0 0 10px 0; color:var(--accent);">👤 Consultor</h4>
                            <ul style="color: var(--text2); line-height: 1.8; margin: 0; padding-left: 20px; font-size: 0.9rem;">
                                <li>Entorno aislado y seguro</li>
                                <li>Solo ve proyectos asignados por Admin</li>
                                <li>Si tiene 1 proyecto, el selector se bloquea</li>
                                <li>Acceso a módulos técnicos (casos, bugs, ejecuciones, APIs)</li>
                                <li>No puede ver configuración global</li>
                                <li>Registro automático como "creador" de sus registros</li>
                            </ul>
                        </div>
                    </div>
                    <div style="background: rgba(245, 158, 11, 0.1); padding:12px; border-radius:8px; border-left:4px solid var(--warning); margin-top:15px; font-size:0.88rem; color:var(--text2);">
                        <strong>⚠️ Importante:</strong> Los nuevos usuarios se registran automáticamente como <strong>Consultor</strong>. Un administrador debe asignarles proyectos desde el módulo <strong>Permisos Consultores</strong> o editando el usuario.
                    </div>
                </div>

                <!-- SECCIÓN 5: IA -->
                <div id="sec5" class="chart-card" style="margin-bottom:25px;">
                    <div class="chart-title" style="color: var(--accent); font-size:1.3rem;"><span style="font-size:1.5rem;">🤖</span> 5. Inteligencia Artificial</div>
                    <p style="color: var(--text2); line-height: 1.6; margin-bottom: 15px; font-size: 0.95rem;">
                        QA Suite PRO integra un motor de IA basado en algoritmos de <strong>Machine Learning</strong> y <strong>NLP básico</strong> para automatizar tareas repetitivas:
                    </p>
                    
                    <div style="display:grid; grid-template-columns:1fr; gap:12px;">
                        <div style="background: var(--card-alt); padding:15px; border-radius:10px; border-left:4px solid var(--accent);">
                            <h4 style="margin:0 0 8px 0; color:var(--accent);">🔍 Detección de Bugs Duplicados</h4>
                            <p style="color:var(--text2); font-size:0.88rem; margin:0; line-height:1.5;">
                                Al crear un bug, el sistema compara título, descripción y resumen con los existentes usando <strong>Distancia de Levenshtein</strong>. Si la similitud supera el 70%, te alerta con posibles duplicados.
                            </p>
                        </div>
                        <div style="background: var(--card-alt); padding:15px; border-radius:10px; border-left:4px solid var(--accent2);">
                            <h4 style="margin:0 0 8px 0; color:var(--accent2);">🎯 Clasificación Automática de Severidad</h4>
                            <p style="color:var(--text2); font-size:0.88rem; margin:0; line-height:1.5;">
                                Motor de reglas basado en palabras clave que detecta automáticamente si un bug es Bloqueante, Crítico, Mayor o Menor. Incluye indicador de confianza (%).
                            </p>
                        </div>
                        <div style="background: var(--card-alt); padding:15px; border-radius:10px; border-left:4px solid var(--accent3);">
                            <h4 style="margin:0 0 8px 0; color:var(--accent3);">📄 Extracción de Casos desde Documentos</h4>
                            <p style="color:var(--text2); font-size:0.88rem; margin:0; line-height:1.5;">
                                Sube un PDF, DOCX o TXT a un requisito y la IA analizará el texto buscando patrones (Actor, Precondición, Pasos, Resultado) para generar casos de prueba automáticamente. Revisa y selecciona los que quieras crear.
                            </p>
                        </div>
                        <div style="background: var(--card-alt); padding:15px; border-radius:10px; border-left:4px solid var(--warning);">
                            <h4 style="margin:0 0 8px 0; color:var(--warning);">📈 Predicción de Defectos</h4>
                            <p style="color:var(--text2); font-size:0.88rem; margin:0; line-height:1.5;">
                                Analiza el histórico de ejecuciones para predecir cuántos bugs podrían aparecer en el próximo ciclo y detectar módulos de alto riesgo basándose en la densidad de defectos.
                            </p>
                        </div>
                        <div style="background: var(--card-alt); padding:15px; border-radius:10px; border-left:4px solid var(--success);">
                            <h4 style="margin:0 0 8px 0; color:var(--success);">💡 Sugerencias Inteligentes de Casos</h4>
                            <p style="color:var(--text2); font-size:0.88rem; margin:0; line-height:1.5;">
                                Analiza requisitos y bugs existentes para sugerir nuevos casos de prueba (estrés, regresión, seguridad, rendimiento) con prioridad y justificación automática.
                            </p>
                        </div>
                    </div>
                </div>

                <!-- SECCIÓN 6: FIRMA DIGITAL -->
                <div id="sec6" class="chart-card" style="margin-bottom:25px;">
                    <div class="chart-title" style="color: var(--accent); font-size:1.3rem;"><span style="font-size:1.5rem;">✍️</span> 6. Firma Digital y Certificados PDF</div>
                    <p style="color: var(--text2); line-height: 1.6; margin-bottom: 15px; font-size: 0.95rem;">
                        Cuando un ciclo de pruebas está completo, puedes <strong>firmarlo digitalmente</strong> para aprobar el release a producción. El proceso es el siguiente:
                    </p>
                    <ol style="color: var(--text); line-height: 2; margin-left: 20px; font-size: 0.95rem;">
                        <li>Ve al módulo <strong>Ejecuciones</strong> y localiza el Test Plan completado.</li>
                        <li>Haz clic en <strong>"✍️ Firmar"</strong> en la cabecera del ciclo.</li>
                        <li>Confirma tu identidad ingresando tu <strong>contraseña</strong> (seguridad adicional).</li>
                        <li>Añade observaciones de release (opcional).</li>
                        <li>El sistema generará automáticamente un <strong>certificado PDF profesional</strong> en una nueva pestaña.</li>
                        <li>Usa <kbd>Ctrl + P</kbd> (o <kbd>Cmd + P</kbd>) para guardarlo como PDF.</li>
                    </ol>
                    <div style="background: rgba(16, 185, 129, 0.1); padding:12px; border-radius:8px; border-left:4px solid var(--success); margin-top:15px; font-size:0.88rem; color:var(--text2);">
                        <strong>✅ El certificado incluye:</strong> Datos del proyecto, cliente, ciclo, fecha de emisión, métricas (casos evaluados, exitosos, fallidos, tasa de éxito), observaciones, firma del QA Lead y un <strong>hash único</strong> para validación.
                    </div>
                </div>

                <!-- SECCIÓN 7: INFORMES -->
                <div id="sec7" class="chart-card" style="margin-bottom:25px;">
                    <div class="chart-title" style="color: var(--accent); font-size:1.3rem;"><span style="font-size:1.5rem;">📊</span> 7. Informes y Exportación</div>
                    <p style="color: var(--text2); line-height: 1.6; margin-bottom: 15px; font-size: 0.95rem;">
                        QA Suite PRO permite generar informes profesionales y exportar datos en múltiples formatos:
                    </p>
                    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:12px;">
                        <div style="background: var(--card-alt); padding:15px; border-radius:8px; text-align:center;">
                            <div style="font-size:2rem; margin-bottom:8px;">📄</div>
                            <h5 style="margin:0 0 6px 0;">Informe Ejecutivo (.doc)</h5>
                            <p style="color:var(--text2); font-size:0.8rem; margin:0;">Word completo con portada, métricas, casos, bugs, ejecuciones, APIs y conclusiones.</p>
                        </div>
                        <div style="background: var(--card-alt); padding:15px; border-radius:8px; text-align:center;">
                            <div style="font-size:2rem; margin-bottom:8px;">📋</div>
                            <h5 style="margin:0 0 6px 0;">Casos a Excel (.xlsx)</h5>
                            <p style="color:var(--text2); font-size:0.8rem; margin:0;">Exporta todos los casos del proyecto activo con todos sus campos.</p>
                        </div>
                        <div style="background: var(--card-alt); padding:15px; border-radius:8px; text-align:center;">
                            <div style="font-size:2rem; margin-bottom:8px;">🐛</div>
                            <h5 style="margin:0 0 6px 0;">Ejecuciones y Bugs (.doc)</h5>
                            <p style="color:var(--text2); font-size:0.8rem; margin:0;">Informe detallado de ciclos y defectos con análisis de severidad.</p>
                        </div>
                        <div style="background: var(--card-alt); padding:15px; border-radius:8px; text-align:center;">
                            <div style="font-size:2rem; margin-bottom:8px;">🔌</div>
                            <h5 style="margin:0 0 6px 0;">Gestión de APIs (.doc)</h5>
                            <p style="color:var(--text2); font-size:0.8rem; margin:0;">Informe completo de endpoints, métodos y análisis por estado.</p>
                        </div>
                        <div style="background: var(--card-alt); padding:15px; border-radius:8px; text-align:center;">
                            <div style="font-size:2rem; margin-bottom:8px;">📊</div>
                            <h5 style="margin:0 0 6px 0;">Comparativa de Ejecuciones</h5>
                            <p style="color:var(--text2); font-size:0.8rem; margin:0;">Compara dos ciclos para ver diferencias en cobertura y cambios de estado.</p>
                        </div>
                        <div style="background: var(--card-alt); padding:15px; border-radius:8px; text-align:center;">
                            <div style="font-size:2rem; margin-bottom:8px;">💾</div>
                            <h5 style="margin:0 0 6px 0;">Backup JSON</h5>
                            <p style="color:var(--text2); font-size:0.8rem; margin:0;">Exporta/importa todos los datos del sistema para backup o migración.</p>
                        </div>
                    </div>
                </div>

                <!-- SECCIÓN 8: FAQ -->
                <div id="sec8" class="chart-card" style="margin-bottom:25px;">
                    <div class="chart-title" style="color: var(--accent); font-size:1.3rem;"><span style="font-size:1.5rem;">❓</span> 8. Preguntas Frecuentes (FAQ)</div>
                    
                    <div style="display:flex; flex-direction:column; gap:10px;">
                        <details style="background: var(--card-alt); padding:15px; border-radius:8px; border:1px solid var(--border); cursor:pointer;">
                            <summary style="font-weight:600; color:var(--text); font-size:0.95rem;">¿Cómo recupero mi contraseña si la olvido?</summary>
                            <p style="color:var(--text2); font-size:0.88rem; line-height:1.6; margin:10px 0 0 0;">
                                Actualmente, solo un <strong>administrador</strong> puede restablecerla editando tu usuario desde el módulo <strong>Usuarios</strong>. En futuras versiones se implementará recuperación por email.
                            </p>
                        </details>
                        <details style="background: var(--card-alt); padding:15px; border-radius:8px; border:1px solid var(--border); cursor:pointer;">
                            <summary style="font-weight:600; color:var(--text); font-size:0.95rem;">¿Los datos se guardan en la nube?</summary>
                            <p style="color:var(--text2); font-size:0.88rem; line-height:1.6; margin:10px 0 0 0;">
                                <strong>Sí.</strong> QA Suite PRO usa <strong>Firebase Realtime Database</strong> para sincronización en tiempo real. Todos los cambios se guardan automáticamente y están disponibles en cualquier dispositivo.
                            </p>
                        </details>
                        <details style="background: var(--card-alt); padding:15px; border-radius:8px; border:1px solid var(--border); cursor:pointer;">
                            <summary style="font-weight:600; color:var(--text); font-size:0.95rem;">¿Puedo trabajar sin conexión a internet?</summary>
                            <p style="color:var(--text2); font-size:0.88rem; line-height:1.6; margin:10px 0 0 0;">
                                <strong>No.</strong> La aplicación requiere conexión a Firebase para funcionar. Sin embargo, los cambios se sincronizan automáticamente cuando recuperas la conexión.
                            </p>
                        </details>
                        <details style="background: var(--card-alt); padding:15px; border-radius:8px; border:1px solid var(--border); cursor:pointer;">
                            <summary style="font-weight:600; color:var(--text); font-size:0.95rem;">¿Qué tamaño máximo tienen las capturas de pantalla?</summary>
                            <p style="color:var(--text2); font-size:0.88rem; line-height:1.6; margin:10px 0 0 0;">
                                Las imágenes se almacenan en Base64 dentro de Firebase. Se recomienda usar imágenes <strong>menores a 1MB</strong> para no saturar la base de datos. Los documentos tienen un límite de <strong>5MB</strong>.
                            </p>
                        </details>
                        <details style="background: var(--card-alt); padding:15px; border-radius:8px; border:1px solid var(--border); cursor:pointer;">
                            <summary style="font-weight:600; color:var(--text); font-size:0.95rem;">¿Cómo funciona la firma digital?</summary>
                            <p style="color:var(--text2); font-size:0.88rem; line-height:1.6; margin:10px 0 0 0;">
                                La firma requiere tu <strong>contraseña</strong> como autenticación. El sistema registra tu nombre, fecha y observaciones, y genera un <strong>hash único</strong> en el certificado PDF para garantizar la integridad del documento.
                            </p>
                        </details>
                        <details style="background: var(--card-alt); padding:15px; border-radius:8px; border:1px solid var(--border); cursor:pointer;">
                            <summary style="font-weight:600; color:var(--text); font-size:0.95rem;">¿Puedo exportar todos los datos de un proyecto?</summary>
                            <p style="color:var(--text2); font-size:0.88rem; line-height:1.6; margin:10px 0 0 0;">
                                <strong>Sí.</strong> Desde <strong>Ajustes</strong> puedes exportar un backup completo en JSON o usar los informes específicos (.doc/.xlsx) para obtener datos filtrados por proyecto activo.
                            </p>
                        </details>
                        <details style="background: var(--card-alt); padding:15px; border-radius:8px; border:1px solid var(--border); cursor:pointer;">
                            <summary style="font-weight:600; color:var(--text); font-size:0.95rem;">¿Qué es el "Command Palette" (Ctrl+K)?</summary>
                            <p style="color:var(--text2); font-size:0.88rem; line-height:1.6; margin:10px 0 0 0;">
                                Es un <strong>buscador global inteligente</strong> estilo VS Code/Linear. Busca en todos los módulos (casos, bugs, APIs, proyectos, objetivos) al mismo tiempo. Navega con flechas y selecciona con Enter para ir directamente al elemento.
                            </p>
                        </details>
                    </div>
                </div>

                <!-- SECCIÓN 9: TIPS Y MEJORES PRÁCTICAS -->
                <div class="chart-card" style="margin-bottom:25px; background: linear-gradient(135deg, rgba(59, 130, 246, 0.05), rgba(20, 184, 166, 0.05));">
                    <div class="chart-title" style="color: var(--accent); font-size:1.3rem;"><span style="font-size:1.5rem;">💡</span> 9. Tips y Mejores Prácticas</div>
                    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:15px;">
                        <div style="background: var(--card-alt); padding:15px; border-radius:8px;">
                            <h5 style="margin:0 0 8px 0; color:var(--accent);">🎯 Nomenclatura Clara</h5>
                            <p style="color:var(--text2); font-size:0.85rem; line-height:1.5; margin:0;">Usa IDs descriptivos (RF-001, CASO-001, BUG-001) y títulos que indiquen claramente qué se está probando.</p>
                        </div>
                        <div style="background: var(--card-alt); padding:15px; border-radius:8px;">
                            <h5 style="margin:0 0 8px 0; color:var(--accent2);">📸 Siempre con Evidencia</h5>
                            <p style="color:var(--text2); font-size:0.85rem; line-height:1.5; margin:0;">Adjunta capturas a cada bug o API con error. Facilita la reproducción y resolución por parte del equipo de desarrollo.</p>
                        </div>
                        <div style="background: var(--card-alt); padding:15px; border-radius:8px;">
                            <h5 style="margin:0 0 8px 0; color:var(--accent3);">🔄 Revisiones Regulares</h5>
                            <p style="color:var(--text2); font-size:0.85rem; line-height:1.5; margin:0;">Usa la IA para detectar duplicados y clasificar severidad al menos una vez por semana.</p>
                        </div>
                        <div style="background: var(--card-alt); padding:15px; border-radius:8px;">
                            <h5 style="margin:0 0 8px 0; color:var(--warning);">📊 Métricas Semanales</h5>
                            <p style="color:var(--text2); font-size:0.85rem; line-height:1.5; margin:0;">Revisa el Dashboard semanalmente para identificar tendencias y módulos de alto riesgo antes de que escalen.</p>
                        </div>
                        <div style="background: var(--card-alt); padding:15px; border-radius:8px;">
                            <h5 style="margin:0 0 8px 0; color:var(--success);">💾 Backups Mensuales</h5>
                            <p style="color:var(--text2); font-size:0.85rem; line-height:1.5; margin:0;">Exporta un backup JSON mensual desde Ajustes como precaución adicional a la sincronización de Firebase.</p>
                        </div>
                        <div style="background: var(--card-alt); padding:15px; border-radius:8px;">
                            <h5 style="margin:0 0 8px 0; color:var(--danger);">✍️ Firma Solo Cuando Proceda</h5>
                            <p style="color:var(--text2); font-size:0.85rem; line-height:1.5; margin:0;">Nunca firmes un ciclo con bugs bloqueantes abiertos. Usa las observaciones de release para documentar riesgos asumidos.</p>
                        </div>
                    </div>
                </div>

                <!-- PIE DE PÁGINA -->
                <div style="text-align:center; padding:30px 20px; color:var(--text2); font-size:0.85rem; border-top:1px solid var(--border);">
                    <p style="margin:0 0 8px 0;"><strong>🛡️ QA Suite PRO</strong> · Gestión integral de calidad</p>
                    <p style="margin:0;">¿Necesitas ayuda adicional? Contacta con el administrador del sistema.</p>
                    <p style="margin:8px 0 0 0; font-size:0.75rem; opacity:0.7;">Documento generado automáticamente · Versión 2.0</p>
                </div>
            </div>
        `;
        return html;
    }
    function renderRequisitos() {
        const data = filterByProject(appData.requisitos);
        const cols = [{ label: 'ID', field: 'id' }, { label: 'Título', field: 'titulo' }, { label: 'Descripción', field: 'descripcion' }, { label: 'Tipo', field: 'tipo' }, { label: 'Casos', field: 'casos' }, { label: 'APIs', field: 'apis' }, { label: 'Documentos', field: 'documento' }];
        return '<h1 class="page-title">📑 Requisitos</h1>' + renderTable('requisitos', cols, data, i => {
            const casosCount = appData.casos.filter(c => c.requisito === i.id).length;
            const apisCount = appData.apis.filter(a => a.requisito === i.id).length;
            const hasDoc = i.documento ? '📄' : '';
            return `<td><code>${i.id}</code></td><td><b>${i.titulo || ''}</b></td><td>${i.descripcion || '-'}</td><td><span class="badge badge-info">${i.tipo || 'Funcional'}</span></td><td><span class="badge badge-purple">${casosCount} casos</span></td><td><span class="badge badge-purple">${apisCount} APIs</span></td><td>${hasDoc ? '<span class="badge badge-success" title="Documento adjunto">📄</span>' : '<span style="color:var(--text2);">-</span>'}</td>`;
        }, true, 'requisito');
    }

    document.addEventListener('DOMContentLoaded', () => {
        const uploadZone = document.querySelector('.document-upload-zone');
        if (uploadZone) {
            ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => { uploadZone.addEventListener(eventName, preventDefaults, false); });
            function preventDefaults(e) { e.preventDefault(); e.stopPropagation(); }
            ['dragenter', 'dragover'].forEach(eventName => { uploadZone.addEventListener(eventName, () => { uploadZone.classList.add('dragover'); }, false); });
            ['dragleave', 'drop'].forEach(eventName => { uploadZone.addEventListener(eventName, () => { uploadZone.classList.remove('dragover'); }, false); });
            uploadZone.addEventListener('drop', (e) => { const dt = e.dataTransfer; const files = dt.files; const input = document.getElementById('f_documento'); input.files = files; handleDocumentoUpload(input); }, false);
        }
    });

    function renderVistaPorRequisito() {
        const requisitos = filterByProject(appData.requisitos);
        let html = '<h1 class="page-title">📊 Cobertura por Requisito</h1>';
        if (requisitos.length === 0) { html += '<div class="empty-state"><div class="empty-state-icon">📭</div><div>No hay requisitos creados</div></div>'; return html; }
        html += '<div class="chart-grid">';
        requisitos.forEach(req => {
            const casos = appData.casos.filter(c => c.requisito === req.id);
            const apis = appData.apis.filter(a => a.requisito === req.id);
            const casosPasados = casos.filter(c => c.estado === 'Pasado').length;
            const casosFallidos = casos.filter(c => c.estado === 'Fallido').length;
            const apisCorrectas = apis.filter(a => a.estado === 'Correcta').length;
            html += `<div class="chart-card"><div class="chart-title">📋 ${req.id} - ${req.titulo}</div><div style="color:var(--text2); font-size:0.85rem; margin-bottom:15px;">${req.descripcion || 'Sin descripción'}</div><div style="display:flex; gap:10px; margin-bottom:15px;"><span class="badge badge-info">${casos.length} Casos</span><span class="badge badge-purple">${apis.length} APIs</span></div>`;
            if (casos.length > 0) {
                html += `<div style="margin-bottom:12px;"><div style="display:flex; justify-content:space-between; font-size:0.8rem; margin-bottom:5px;"><span>Cobertura Casos</span><span>${casos.length > 0 ? Math.round((casosPasados / casos.length) * 100) : 0}%</span></div><div style="height:6px; background:var(--bg2); border-radius:3px; overflow:hidden;"><div style="width:${casos.length > 0 ? (casosPasados / casos.length) * 100 : 0}%; height:100%; background:var(--success);"></div></div><div style="font-size:0.75rem; color:var(--text2); margin-top:4px;">✅ ${casosPasados} pasados | ❌ ${casosFallidos} fallidos</div></div>`;
            } else { html += '<div style="color:var(--text2); font-size:0.85rem;">Sin casos asociados</div>'; }
            if (apis.length > 0) {
                html += `<div><div style="display:flex; justify-content:space-between; font-size:0.8rem; margin-bottom:5px;"><span>APIs Funcionales</span><span>${apis.length > 0 ? Math.round((apisCorrectas / apis.length) * 100) : 0}%</span></div><div style="height:6px; background:var(--bg2); border-radius:3px; overflow:hidden;"><div style="width:${apis.length > 0 ? (apisCorrectas / apis.length) * 100 : 0}%; height:100%; background:var(--accent2);"></div></div><div style="font-size:0.75rem; color:var(--text2); margin-top:4px;">✅ ${apisCorrectas} correctas | ❌ ${apis.length - apisCorrectas} con error</div></div>`;
            } else { html += '<div style="color:var(--text2); font-size:0.85rem;">Sin APIs asociadas</div>'; }
            html += `<button class="btn btn-outline btn-sm" style="margin-top:15px; width:100%;" onclick="navigateTo('casos'); document.querySelector('.search-input').value='${req.id}'; searchTerm='${req.id}'; renderPage('casos');">🔍 Ver Casos de este Requisito</button></div>`;
        });
        html += '</div>';
        return html;
    }

    function renderIA() {
        const casos = filterByProject(appData.casos);
        const bugs = filterByProject(appData.bugs);
        const ejecuciones = filterByProject(appData.ejecuciones);
        const requisitos = filterByProject(appData.requisitos);
        const prediccion = predecirDefectos(casos, bugs, ejecuciones);
        const coberturaIA = analizarCoberturaInteligente(requisitos, casos, bugs);
        let html = `<h1 class="page-title"> IA & Machine Learning</h1><p class="page-subtitle">Análisis inteligente y predicciones basadas en datos históricos</p><div class="kpi-grid" style="margin-bottom: 30px;"><div class="kpi-card"><div class="kpi-icon">🎯</div><div class="kpi-value">${prediccion.modulosAltoRiesgo.length}</div><div class="kpi-label">Módulos Alto Riesgo</div></div><div class="kpi-card"><div class="kpi-icon">📈</div><div class="kpi-value">${prediccion.tendenciaDefectos > 0 ? '+' : ''}${prediccion.tendenciaDefectos}%</div><div class="kpi-label">Tendencia Defectos</div></div><div class="kpi-card"><div class="kpi-icon"></div><div class="kpi-value">${prediccion.prediccionProximoCiclo}</div><div class="kpi-label">Predicción Próximo Ciclo</div></div><div class="kpi-card"><div class="kpi-icon">⚠️</div><div class="kpi-value">${prediccion.factoresRiesgo.length}</div><div class="kpi-label">Factores de Riesgo</div></div></div><div class="chart-grid"><div class="chart-card"><div class="chart-title">🚨 Módulos de Alto Riesgo</div>`;
        if (prediccion.modulosAltoRiesgo.length === 0) { html += '<p style="color: var(--text2); text-align: center; padding: 20px;">No se han detectado módulos de alto riesgo</p>'; } 
        else {
            html += prediccion.modulosAltoRiesgo.map(m => `<div style="padding: 12px; background: var(--card-alt); border-radius: 8px; margin-bottom: 10px; border-left: 4px solid ${m.nivelRiesgo === 'Muy Alto' ? 'var(--danger)' : m.nivelRiesgo === 'Alto' ? 'var(--warning)' : 'var(--info)'};"><div style="font-weight: 600; margin-bottom: 6px;">${m.modulo}</div><div style="font-size: 0.85rem; color: var(--text2);">${m.totalBugs} bugs (${m.bugsCriticos} críticos) · Riesgo: ${m.nivelRiesgo}</div><div style="margin-top: 8px; height: 6px; background: var(--bg); border-radius: 3px; overflow: hidden;"><div style="width: ${m.ratioCriticos}%; height: 100%; background: ${m.nivelRiesgo === 'Muy Alto' ? 'var(--danger)' : m.nivelRiesgo === 'Alto' ? 'var(--warning)' : 'var(--info)'};"></div></div></div>`).join('');
        }
        html += `</div><div class="chart-card"><div class="chart-title">️ Factores de Riesgo Detectados</div>`;
        if (prediccion.factoresRiesgo.length === 0) { html += '<p style="color: var(--success); text-align: center; padding: 20px;">✅ No se han detectado factores de riesgo significativos</p>'; } 
        else {
            html += prediccion.factoresRiesgo.map(f => `<div style="padding: 12px; background: var(--card-alt); border-radius: 8px; margin-bottom: 10px; display: flex; align-items: center; gap: 12px;"><div style="width: 40px; height: 40px; border-radius: 50%; background: ${f.nivel === 'Alto' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)'}; display: flex; align-items: center; justify-content: center; font-size: 1.2rem;">${f.nivel === 'Alto' ? '' : '🟡'}</div><div style="flex: 1;"><div style="font-weight: 600; font-size: 0.9rem;">${f.tipo}</div><div style="font-size: 0.8rem; color: var(--text2);">${f.descripcion}</div></div></div>`).join('');
        }
        html += `</div></div><h2 style="margin-top: 30px; margin-bottom: 15px; font-size: 1.3rem;">📊 Análisis de Cobertura Inteligente</h2><div class="chart-grid">`;
        html += coberturaIA.slice(0, 6).map(a => `<div class="chart-card"><div class="chart-title">📋 ${a.requisito.titulo}</div><div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 15px;"><div style="text-align: center; padding: 10px; background: var(--card-alt); border-radius: 8px;"><div style="font-size: 1.5rem; font-weight: 700; color: var(--accent);">${a.cobertura}%</div><div style="font-size: 0.75rem; color: var(--text2);">Cobertura</div></div><div style="text-align: center; padding: 10px; background: var(--card-alt); border-radius: 8px;"><div style="font-size: 1.5rem; font-weight: 700; color: ${a.scoreCalidad >= 75 ? 'var(--success)' : a.scoreCalidad >= 50 ? 'var(--warning)' : 'var(--danger)'};">${a.scoreCalidad}</div><div style="font-size: 0.75rem; color: var(--text2);">Score Calidad</div></div></div><div style="font-size: 0.85rem; color: var(--text2); margin-bottom: 10px;">${a.casosTotales} casos · ${a.bugsTotales} bugs</div><div style="display: flex; gap: 8px; flex-wrap: wrap;"><span class="badge ${a.nivelRiesgo === 'Alto' ? 'badge-danger' : a.nivelRiesgo === 'Medio' ? 'badge-warning' : 'badge-success'}">Riesgo: ${a.nivelRiesgo}</span></div></div>`).join('');
        html += `</div><h2 style="margin-top: 30px; margin-bottom: 15px; font-size: 1.3rem;">🛠️ Herramientas de IA</h2><div class="chart-grid"><div class="chart-card" style="cursor: pointer;" onclick="analizarDuplicadosIA()"><div class="chart-title">🔍 Analizar Bugs Duplicados</div><p style="color: var(--text2); font-size: 0.9rem;">Detectar bugs similares que podrían ser duplicados</p><button class="btn btn-accent" style="width: 100%; margin-top: 10px;">Ejecutar Análisis</button></div><div class="chart-card" style="cursor: pointer;" onclick="generarSugerenciasIA()"><div class="chart-title">💡 Generar Sugerencias de Casos</div><p style="color: var(--text2); font-size: 0.9rem;">Sugerencias automáticas basadas en requisitos y bugs</p><button class="btn btn-accent" style="width: 100%; margin-top: 10px;">Generar Sugerencias</button></div><div class="chart-card" style="cursor: pointer;" onclick="clasificarSeveridadIA()"><div class="chart-title">🎯 Clasificar Severidad Automática</div><p style="color: var(--text2); font-size: 0.9rem;">Clasificación inteligente de bugs existentes</p><button class="btn btn-accent" style="width: 100%; margin-top: 10px;">Clasificar Bugs</button></div><div class="chart-card" style="cursor: pointer;" onclick="generarGuiaPalabrasClavePDF()"><div class="chart-title">📄 Guía de Palabras Clave (PDF)</div><p style="color: var(--text2); font-size: 0.9rem;">Descarga el diccionario de patrones que usa la IA para leer tus documentos</p><button class="btn btn-accent" style="width: 100%; margin-top: 10px;">Descargar PDF</button></div></div>`;
        return html;
    }

    window.analizarDuplicadosIA = function() {
        const bugs = filterByProject(appData.bugs);
        const duplicados = [];
        for (let i = 0; i < bugs.length; i++) {
            for (let j = i + 1; j < bugs.length; j++) {
                const similitud = calcularSimilitud(bugs[i].titulo, bugs[j].titulo);
                if (similitud >= 70) duplicados.push({ bug1: bugs[i], bug2: bugs[j], similitud: similitud });
            }
        }
        const container = document.getElementById('modalContainer');
        let innerHtml = `<div class="modal-overlay"><div class="modal" style="max-width: 900px;"><h3>🔍 Análisis de Bugs Duplicados</h3><p style="color: var(--text2); margin-bottom: 20px;">Se han analizado ${bugs.length} bugs y se han detectado ${duplicados.length} posibles duplicados</p>`;
        if (duplicados.length === 0) { innerHtml += '<div style="text-align: center; padding: 40px; color: var(--success);"><div style="font-size: 3rem; margin-bottom: 10px;">✅</div><p>No se han detectado bugs duplicados</p></div>'; } 
        else {
            innerHtml += `<div style="max-height: 500px; overflow-y: auto;">${duplicados.map((d, idx) => `<div style="padding: 15px; background: var(--card-alt); border-radius: 8px; margin-bottom: 12px; border-left: 4px solid ${d.similitud >= 90 ? 'var(--danger)' : 'var(--warning)'};"><div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;"><strong style="color: var(--accent);">Duplicado #${idx + 1}</strong><span class="badge ${d.similitud >= 90 ? 'badge-danger' : 'badge-warning'}">${d.similitud}% similar</span></div><div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;"><div><div style="font-size: 0.75rem; color: var(--text2); margin-bottom: 4px;">Bug 1</div><div style="font-weight: 600;">${d.bug1.titulo}</div><div style="font-size: 0.8rem; color: var(--text2); margin-top: 4px;">${d.bug1.id}</div></div><div><div style="font-size: 0.75rem; color: var(--text2); margin-bottom: 4px;">Bug 2</div><div style="font-weight: 600;">${d.bug2.titulo}</div><div style="font-size: 0.8rem; color: var(--text2); margin-top: 4px;">${d.bug2.id}</div></div></div></div>`).join('')}</div>`;
        }
        innerHtml += `<div class="modal-actions"><button class="btn btn-outline" onclick="closeModal()">Cerrar</button></div></div></div>`;
        container.innerHTML = innerHtml;
    };

    window.generarSugerenciasIA = function() {
        const requisitos = filterByProject(appData.requisitos);
        const casos = filterByProject(appData.casos);
        const bugs = filterByProject(appData.bugs);
        const todasSugerencias = [];
        requisitos.forEach(req => { const sugerencias = sugerirCasosPrueba(req, casos, bugs); sugerencias.forEach(s => { todasSugerencias.push({ ...s, requisito: req }); }); });
        const container = document.getElementById('modalContainer');
        let innerHtml = `<div class="modal-overlay"><div class="modal" style="max-width: 900px;"><h3>💡 Sugerencias de Casos de Prueba</h3><p style="color: var(--text2); margin-bottom: 20px;">Se han generado ${todasSugerencias.length} sugerencias basadas en análisis de requisitos y bugs</p>`;
        if (todasSugerencias.length === 0) { innerHtml += '<div style="text-align: center; padding: 40px; color: var(--text2);"><div style="font-size: 3rem; margin-bottom: 10px;">📝</div><p>No hay sugerencias disponibles. Crea más requisitos y bugs para obtener sugerencias.</p></div>'; } 
        else {
            innerHtml += `<div style="max-height: 500px; overflow-y: auto;">${todasSugerencias.map((s, idx) => `<div style="padding: 15px; background: var(--card-alt); border-radius: 8px; margin-bottom: 12px;"><div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;"><strong style="color: var(--accent);">Sugerencia #${idx + 1}</strong><span class="badge ${s.prioridad === 'Alta' ? 'badge-danger' : s.prioridad === 'Media' ? 'badge-warning' : 'badge-info'}">${s.prioridad}</span></div><div style="font-weight: 600; margin-bottom: 6px;">${s.titulo}</div><div style="font-size: 0.85rem; color: var(--text2); margin-bottom: 8px;">${s.descripcion}</div><div style="display: flex; gap: 8px; flex-wrap: wrap;"><span class="badge badge-purple">${s.requisito.id}</span><span class="badge badge-info">${s.tipo}</span><span style="font-size: 0.75rem; color: var(--text2);">💡 ${s.razon}</span></div><button class="btn btn-sm btn-accent" style="margin-top: 10px;" onclick="crearCasoDesdeSugerencia('${s.requisito.id}', '${s.titulo.replace(/'/g, "\\'")}', '${s.descripcion.replace(/'/g, "\\'")}', '${s.prioridad}')"> Crear Caso</button></div>`).join('')}</div>`;
        }
        innerHtml += `<div class="modal-actions"><button class="btn btn-outline" onclick="closeModal()">Cerrar</button></div></div></div>`;
        container.innerHTML = innerHtml;
    };

    window.crearCasoDesdeSugerencia = function(requisitoId, titulo, descripcion, prioridad) {
        closeModal(); openModal('casos');
        setTimeout(() => {
            document.getElementById('f_titulo').value = titulo;
            document.getElementById('f_descripcion').value = descripcion;
            document.getElementById('f_prioridad').value = prioridad;
            document.getElementById('f_requisito').value = requisitoId;
        }, 100);
    };

    window.clasificarSeveridadIA = function() {
        const bugs = filterByProject(appData.bugs).filter(b => !b.severidad || b.severidad === 'Menor');
        if (bugs.length === 0) { toast('No hay bugs sin clasificar o todos ya tienen severidad asignada', 'info'); return; }
        let clasificados = 0;
        bugs.forEach(bug => { const clasificacion = clasificarSeveridadAutomatica(bug.titulo, bug.descripcion, bug.resumen); if (clasificacion.confianza >= 50) { bug.severidad = clasificacion.severidad; bug.severidadIA = true; clasificados++; } });
        saveData(); renderPage('ia'); toast(`Se han clasificado ${clasificados} bugs automáticamente`, 'success');
    };

    function handleAction(page, action, id) {
        if (action === 'create') openModal(page);
        else if (action === 'edit') openModal(page, id);
        else if (action === 'view') openModal(page, id, true);
        else if (action === 'delete') handleDelete(page, id);
        else if (action === 'export') exportData();
        else if (action === 'import') document.getElementById('importFileInput')?.click();
        else if (action === 'vaciar') handleVaciar();
        else if (action === 'downloadDocx') downloadDocx();
    }

    function handleDelete(page, id) {
        showConfirmModal('¿Eliminar permanentemente este registro?', async () => {
            const arr = getArrayForPage(page);
            const idNum = Number(id);
            const idx = arr.findIndex(x => x.id == id || x.id === idNum);
            if (idx >= 0) {
                arr.splice(idx, 1); addTrace(page, 'Eliminación', id);
                try {
                    await saveData();
                    if (page === 'proyectos' || page === 'usuarios') populateProjectSelector();
                    renderPage(currentPage); toast('Eliminado correctamente', 'warning');
                } catch (error) { console.error("Error al eliminar:", error); toast('Error al eliminar el registro', 'error'); }
            } else { toast('No se encontró el registro para eliminar', 'error'); }
        });
    }

    function handleVaciar() {
        showConfirmModal('⚠ ¿Deseas eliminar TODOS los datos de Firebase?<br><small>Esta acción no se puede deshacer.</small>', () => {
            appData = { usuarios: appData.usuarios, proyectos: [], objetivos: [], casos: [], bugs: [], ejecuciones: [], capturas: [], registroDiario: [], apis: [], mejoras: [], trazabilidad: [], notificaciones: [], configuracion: appData.configuracion };
            notifications = []; saveData(); populateProjectSelector(); navigateTo('dashboard'); toast('Sistema vaciado', 'warning');
        }, true);
    }

    // ============ MODALS ============
    function showConfirmModal(message, onConfirm, danger = false, showCancel = true) {
        const container = document.getElementById('modalContainer');
        const html = `<div class="modal-overlay"><div class="modal confirm-modal"><div class="icon-warning"></div><p style="margin-bottom:20px; font-size:1rem; line-height:1.5; color:var(--text);">${message}</p><div class="modal-actions" style="justify-content:center;">${showCancel ? `<button class="btn btn-outline" id="confirmCancelBtn">Cancelar</button>` : ''}<button class="btn ${danger ? 'btn-danger' : 'btn-accent'}" id="confirmOkBtn">Confirmar</button></div></div></div>`;
        container.innerHTML = html;
        const okBtn = document.getElementById('confirmOkBtn');
        okBtn.addEventListener('click', () => { closeModal(); if (onConfirm) onConfirm(); });
        if (showCancel) { const cancelBtn = document.getElementById('confirmCancelBtn'); cancelBtn.addEventListener('click', closeModal); }
        document.addEventListener('keydown', escCloseModal);
    }

    window.openModal = function (page, id, viewOnly = false) {
        const container = document.getElementById('modalContainer');
        let html = `<div class="modal-overlay"><div class="modal"><h3>${viewOnly ? '👁️ Detalle' : (id ? '✏️ Editar' : ' Nuevo')}</h3>`;
        html += generateForm(page, id, viewOnly);
        html += `<div class="modal-actions">${!viewOnly ? `<button class="btn btn-accent" onclick="saveModal('${page}','${id || ''}')">💾 Guardar</button>` : ''}<button class="btn btn-outline" onclick="closeModal()">Cerrar</button></div></div></div>`;
        container.innerHTML = html;
        if (page === 'capturas' && !viewOnly) { const fileInput = document.getElementById('f_archivos'); if (fileInput) fileInput.addEventListener('change', handleCapturaFiles); }
        if (page === 'capturas' && viewOnly) {
            const previewDiv = document.getElementById('archivosPreview');
            if (previewDiv && id) {
                const item = getArrayForPage(page).find(x => x.id == id);
                if (item && item.archivos) { const files = item.archivos.split(',').map(f => f.trim()); previewDiv.innerHTML = files.map(f => `<span>🖼️ ${f}</span>`).join('<br>'); }
            }
        }
        document.addEventListener('keydown', escCloseModal);
    };

    window.closeModal = () => { document.getElementById('modalContainer').innerHTML = ''; document.removeEventListener('keydown', escCloseModal); };
    function escCloseModal(e) {
        if (e.key === 'Escape') {
            const container = document.getElementById('modalContainer');
            if (container.innerHTML.includes('handleLogout()') && container.innerHTML.includes('Acceso Restringido')) return;
            closeModal();
        }
    }

    function generateForm(page, id, viewOnly) {
        let item = id ? getArrayForPage(page).find(x => x.id == id) : null;
        const d = viewOnly ? 'disabled' : '';
        const projOpts = appData.proyectos.map(p => `<option ${item?.proyecto === p.id ? 'selected' : ''}>${p.id}</option>`).join('');
        const userOpts = (selectedValue) => {
            let opts = '<option value="">Seleccionar responsable...</option>';
            if (appData.usuarios && appData.usuarios.length > 0) opts += appData.usuarios.map(u => `<option value="${u.nombre}" ${selectedValue === u.nombre ? 'selected' : ''}>${u.nombre}</option>`).join('');
            return opts;
        };
        window.toggleProjectPermissions = function () {
            const roleSelect = document.getElementById('f_rol');
            const permDiv = document.getElementById('project-permissions');
            if (permDiv && roleSelect) permDiv.style.display = roleSelect.value === 'Consultor' ? 'block' : 'none';
        };
        const getCasosBugsOpts = (selectedValue) => {
            let opts = '<option value="">Ninguno / Seleccionar...</option>';
            if (appData.casos && appData.casos.length > 0) {
                opts += '<optgroup label="Casos de Prueba">';
                appData.casos.forEach(c => { opts += `<option value="${c.id}" ${selectedValue === c.id ? 'selected' : ''}>${c.id} - ${c.titulo}</option>`; });
                opts += '</optgroup>';
            }
            if (appData.bugs && appData.bugs.length > 0) {
                opts += '<optgroup label="Bugs / Defectos">';
                appData.bugs.forEach(b => { opts += `<option value="${b.id}" ${selectedValue === b.id ? 'selected' : ''}>${b.id} - ${b.titulo}</option>`; });
                opts += '</optgroup>';
            }
            return opts;
        };
        const renderCaptura = (itemId) => {
            if (!itemId) return '';
            const cap = appData.capturas.find(c => c.vinculo === itemId && c.archivos);
            if (cap) return `<div class="form-group" style="margin-top: 15px;"><label>📸 Captura QA Vinculada</label><div style="background: var(--bg2); padding: 15px; border-radius: 8px; border: 1px solid var(--border); text-align: center;"><img src="${cap.archivos}" style="max-height: 250px; max-width: 100%; border-radius: 4px; box-shadow: 0 4px 6px rgba(0,0,0,0.3);"><div style="margin-top: 8px; font-size: 0.85rem; color: var(--text2);">${cap.descripcion || 'Evidencia visual adjunta'} (ID: ${cap.id})</div></div></div>`;
            return '';
        };
        let h = '';
        switch (page) {
            case 'proyectos':
                h += `<div class="form-group"><label>ID Proyecto</label><input value="${item?.id || 'PROY-' + Date.now()}" ${d} id="f_id"></div><div class="form-group"><label>Nombre *</label><input value="${item?.nombre || ''}" ${d} id="f_nombre"></div><div class="form-group"><label>Código Cliente</label><input value="${item?.codigoCliente || ''}" ${d} id="f_codigoCliente"></div><div class="form-group"><label>Descripción</label><textarea ${d} id="f_descripcion">${item?.descripcion || ''}</textarea></div><div class="form-group"><label>Responsable QA</label><select ${d} id="f_responsable">${userOpts(item?.responsable)}</select></div><div class="form-group"><label>Fecha Inicio</label><input type="date" value="${item?.fechaInicio || ''}" ${d} id="f_fechaInicio"></div><div class="form-group"><label>Fecha Fin</label><input type="date" value="${item?.fechaFin || ''}" ${d} id="f_fechaFin"></div><div class="form-group"><label>Estado</label><select ${d} id="f_estado"><option ${item?.estado === 'Planificado' ? 'selected' : ''}>Planificado</option><option ${item?.estado === 'Activo' ? 'selected' : ''}>Activo</option><option ${item?.estado === 'Completado' ? 'selected' : ''}>Completado</option></select></div>`;
                break;
            case 'objetivos':
                h += `<div class="form-group"><label>ID</label><input value="${item?.id || 'OBJ-' + Date.now()}" ${d} id="f_id"></div><div class="form-group"><label>Objetivo *</label><input value="${item?.objetivo || ''}" ${d} id="f_objetivo"></div><div class="form-group"><label>Descripción</label><textarea ${d} id="f_descripcion">${item?.descripcion || ''}</textarea></div><div class="form-group"><label>Responsable</label><select ${d} id="f_responsable">${userOpts(item?.responsable)}</select></div><div class="form-group"><label>Fecha Inicio</label><input type="date" value="${item?.fechaInicio || ''}" ${d} id="f_fechaInicio"></div><div class="form-group"><label>Fecha Fin</label><input type="date" value="${item?.fechaFin || ''}" ${d} id="f_fechaFin"></div><div class="form-group"><label>Estado</label><select ${d} id="f_estado"><option ${item?.estado === 'Pendiente' ? 'selected' : ''}>Pendiente</option><option ${item?.estado === 'En progreso' ? 'selected' : ''}>En progreso</option><option ${item?.estado === 'Finalizado' ? 'selected' : ''}>Finalizado</option></select></div>`;
                break;
            case 'mejoras':
                const categoriasMejora = ['Proceso QA', 'Herramientas', 'Automatización', 'Formación', 'Documentación', 'Infraestructura', 'Metodología', 'Otro'];
                const impactos = ['Alto', 'Medio', 'Bajo'];
                const estadosMejora = ['Propuesta', 'En evaluación', 'Aprobada', 'En implementación', 'Implementada', 'Descartada'];
                h += `<div class="form-group"><label>ID</label><input value="${item?.id || 'MEJ-' + Date.now()}" ${d} id="f_id"></div><div class="form-group"><label>Título de la Mejora *</label><input value="${item?.titulo || ''}" ${d} id="f_titulo" placeholder="Ej: Implementar tests automatizados con Cypress"></div><div class="form-group"><label>Categoría</label><select ${d} id="f_categoria">${categoriasMejora.map(c => `<option ${item?.categoria === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div><div class="form-group"><label>Descripción detallada</label><textarea ${d} id="f_descripcion" rows="4" placeholder="Describe la mejora, el problema actual y la solución propuesta...">${item?.descripcion || ''}</textarea></div><div class="form-group"><label>Beneficio esperado</label><textarea ${d} id="f_beneficio" rows="2" placeholder="¿Qué aporta esta mejora al equipo QA?">${item?.beneficio || ''}</textarea></div><div style="display:grid; grid-template-columns: 1fr 1fr; gap:15px;"><div class="form-group"><label>Prioridad</label><select ${d} id="f_prioridad"><option ${item?.prioridad === 'Alta' ? 'selected' : ''}>Alta</option><option ${item?.prioridad === 'Media' ? 'selected' : ''}>Media</option><option ${item?.prioridad === 'Baja' ? 'selected' : ''}>Baja</option></select></div><div class="form-group"><label>Impacto estimado</label><select ${d} id="f_impacto">${impactos.map(i => `<option ${item?.impacto === i ? 'selected' : ''}>${i}</option>`).join('')}</select></div></div><div class="form-group"><label>Estado</label><select ${d} id="f_estado">${estadosMejora.map(e => `<option ${item?.estado === e ? 'selected' : ''}>${e}</option>`).join('')}</select></div><div style="display:grid; grid-template-columns: 1fr 1fr; gap:15px;"><div class="form-group"><label>Responsable de implementación</label><select ${d} id="f_responsable"><option value="">Sin asignar...</option>${appData.usuarios.map(u => `<option value="${u.nombre}" ${item?.responsable === u.nombre ? 'selected' : ''}>${u.nombre}</option>`).join('')}</select></div><div class="form-group"><label>Fecha objetivo</label><input type="date" value="${item?.fechaObjetivo || ''}" ${d} id="f_fechaObjetivo"></div></div><div class="form-group"><label>Notas / Comentarios adicionales</label><textarea ${d} id="f_notas" rows="2">${item?.notas || ''}</textarea></div>`;
                if (id) { h += `<div id="commentsContainer_mejora_${id}"></div>`; setTimeout(() => { renderCommentsSection('mejora', id); }, 50); }
                break;
            case 'usuarios':
                const isConsultor = item?.rol === 'Consultor';
                const proyectosAutorizados = item?.proyectosAutorizados || [];
                h += `<div class="form-group"><label>ID</label><input value="${item?.id || Date.now()}" ${d} id="f_id" type="number"></div><div class="form-group"><label>Nombre completo *</label><input value="${item?.nombre || ''}" ${d} id="f_nombre"></div><div class="form-group"><label>Usuario *</label><input value="${item?.usuario || ''}" ${d} id="f_usuario"></div><div class="form-group"><label>Contraseña *</label><input type="password" value="${item?.password || ''}" ${d} id="f_password"></div><div class="form-group"><label>Rol</label><select ${d} id="f_rol" onchange="toggleProjectPermissions()"><option ${item?.rol === 'Admin' ? 'selected' : ''}>Admin</option><option ${item?.rol === 'Consultor' ? 'selected' : ''}>Consultor</option></select></div><div class="form-group" id="project-permissions" style="${isConsultor ? '' : 'display:none;'}"><label>📁 Proyectos Autorizados</label><div class="checkbox-list" style="max-height:200px; overflow-y:auto; border:1px solid var(--border); border-radius:8px; padding:10px;">${appData.proyectos.length === 0 ? '<div style="color:var(--text2); font-size:0.85rem;">No hay proyectos creados</div>' : appData.proyectos.map(p => `<label class="checkbox-item" style="display:flex; align-items:center; gap:8px; padding:6px 0;"><input type="checkbox" class="project-perm-cb" value="${p.id}" ${proyectosAutorizados.includes(p.id) ? 'checked' : ''}><span>${p.nombre || p.id}</span></label>`).join('')}</div><small style="color:var(--text2); display:block; margin-top:8px;">Selecciona los proyectos que este consultor podrá ver y gestionar</small></div>`;
                break;
            case 'casos':
                h += `<div class="form-group"><label>ID Caso</label><input value="${item?.id || 'CASO-' + Date.now()}" ${d} id="f_id"></div><div class="form-group"><label>Proyecto</label><select ${d} id="f_proyecto">${projOpts}</select></div><div class="form-group"><label> Requisito Asociado</label><select ${d} id="f_requisito"><option value="">Sin requisito...</option>${appData.requisitos.filter(r => !r.proyecto || r.proyecto === getActiveProject()).map(r => `<option value="${r.id}" ${item?.requisito === r.id ? 'selected' : ''}>${r.id} - ${r.titulo}</option>`).join('')}</select></div><div class="form-group"><label>Prioridad</label><select ${d} id="f_prioridad"><option ${item?.prioridad === 'Crítica' ? 'selected' : ''}>Crítica</option><option ${item?.prioridad === 'Alta' ? 'selected' : ''}>Alta</option><option ${item?.prioridad === 'Media' ? 'selected' : ''}>Media</option><option ${item?.prioridad === 'Baja' ? 'selected' : ''}>Baja</option></select></div><div class="form-group"><label>Título *</label><input value="${item?.titulo || ''}" ${d} id="f_titulo"></div><div class="form-group"><label>Actor</label><input value="${item?.actor || ''}" ${d} id="f_actor"></div><div class="form-group"><label>Descripción del Requisito</label><textarea ${d} id="f_descripcion">${item?.descripcion || ''}</textarea></div><div class="form-group"><label>Flujo de Pasos</label><textarea ${d} id="f_flujo">${item?.flujo || ''}</textarea></div><div class="form-group"><label>Input del Cliente</label><input value="${item?.inputCliente || ''}" ${d} id="f_inputCliente"></div><div class="form-group"><label>Criterios de Aceptación (BDD)</label><textarea ${d} id="f_criterios">${item?.criterios || ''}</textarea></div><div class="form-group"><label>Resultado Esperado</label><textarea ${d} id="f_resultadoEsperado">${item?.resultadoEsperado || ''}</textarea></div><div class="form-group"><label>Estado de Ejecución</label><select ${d} id="f_estado"><option ${item?.estado === 'Pendiente' ? 'selected' : ''}>Pendiente</option><option ${item?.estado === 'Pasado' ? 'selected' : ''}>Pasado</option><option ${item?.estado === 'Fallido' ? 'selected' : ''}>Fallido</option></select></div>`;
                if (id) {
                    const captura = appData.capturas.find(c => c.vinculo === id && c.archivos);
                    if (captura) h += `<div class="detail-capture-container"><div class="detail-capture-label">📸 Captura QA Vinculada</div><img src="${captura.archivos}" alt="Captura QA" onclick="window.open('${captura.archivos}', '_blank')" title="Click para ver en tamaño completo"><div style="margin-top:10px; font-size:0.8rem; color:var(--text2);">${captura.descripcion || 'Sin descripción'}</div></div>`;
                    h += `<div id="commentsContainer_caso_${id}"></div>`;
                    setTimeout(() => { renderCommentsSection('caso', id); }, 50);
                }
                break;
            case 'bugs':
                h += `<div class="form-group"><label>ID Bug</label><input value="${item?.id || 'BUG-' + Date.now()}" ${d} id="f_id"></div><div class="form-group"><label>Proyecto</label><select ${d} id="f_proyecto">${projOpts}</select></div><div class="form-group"><label>Caso Relacionado</label><input value="${item?.casoRelacionado || ''}" ${d} id="f_casoRelacionado"></div><div class="form-group"><label>Título *</label><input value="${item?.titulo || ''}" ${d} id="f_titulo"></div><div class="form-group"><label>Resumen Técnico</label><textarea ${d} id="f_resumen">${item?.resumen || ''}</textarea></div><div class="form-group"><label>Descripción Detallada</label><textarea ${d} id="f_descripcion">${item?.descripcion || ''}</textarea></div><div class="form-group"><label>Severidad</label><select ${d} id="f_severidad"><option ${item?.severidad === 'Bloqueante' ? 'selected' : ''}>Bloqueante</option><option ${item?.severidad === 'Crítica' ? 'selected' : ''}>Crítica</option><option ${item?.severidad === 'Mayor' ? 'selected' : ''}>Mayor</option><option ${item?.severidad === 'Menor' ? 'selected' : ''}>Menor</option></select></div><button type="button" class="btn btn-sm btn-outline" onclick="autoClasificarSeveridad()" style="margin-top: 8px;">🤖 Clasificar Automáticamente</button><div class="form-group"><label>Estado</label><select ${d} id="f_estado"><option ${item?.estado === 'Abierto' ? 'selected' : ''}>Abierto</option><option ${item?.estado === 'En revisión' ? 'selected' : ''}>En revisión</option><option ${item?.estado === 'Solucionado' ? 'selected' : ''}>Solucionado</option></select></div>`;
                if (id) {
                    const captura = appData.capturas.find(c => c.vinculo === id && c.archivos);
                    if (captura) h += `<div class="detail-capture-container"><div class="detail-capture-label">📸 Captura QA Vinculada</div><img src="${captura.archivos}" alt="Captura QA" onclick="window.open('${captura.archivos}', '_blank')" title="Click para ver en tamaño completo"><div style="margin-top:10px; font-size:0.8rem; color:var(--text2);">${captura.descripcion || 'Sin descripción'}</div></div>`;
                    h += `<div id="commentsContainer_bug_${id}"></div>`;
                    setTimeout(() => { renderCommentsSection('bug', id); }, 50);
                }
                if (!id) {
                    h += `<div id="ia-duplicados-container" style="margin-top: 20px;"></div>`;
                    h += `<script>setTimeout(() => { const tituloInput = document.getElementById('f_titulo'); const descInput = document.getElementById('f_descripcion'); const resumenInput = document.getElementById('f_resumen'); function verificarDuplicados() { const bugNuevo = { titulo: tituloInput?.value || '', descripcion: descInput?.value || '', resumen: resumenInput?.value || '' }; if (bugNuevo.titulo.length < 5) return; const duplicados = detectarBugsDuplicados(bugNuevo, appData.bugs.filter(b => b.estado !== 'Solucionado'), 70); const container = document.getElementById('ia-duplicados-container'); if (duplicados.length > 0) { container.innerHTML = \`<div style="padding: 15px; background: rgba(245, 158, 11, 0.1); border-radius: 8px; border-left: 4px solid var(--warning);"><div style="font-weight: 600; color: var(--warning); margin-bottom: 10px;">️ Posibles bugs duplicados detectados</div>\${duplicados.slice(0, 3).map(d => \`<div style="padding: 8px; background: var(--card-alt); border-radius: 6px; margin-bottom: 6px; font-size: 0.85rem;"><div style="display: flex; justify-content: space-between;"><strong>\${d.bug.titulo}</strong><span class="badge badge-warning">\${d.similitud}%</span></div></div>\`).join('')}</div>\`; } else { container.innerHTML = ''; } } tituloInput?.addEventListener('input', verificarDuplicados); descInput?.addEventListener('input', verificarDuplicados); resumenInput?.addEventListener('input', verificarDuplicados); }, 100);</script>`;
                }
                break;
            case 'ejecuciones':
                const requisitosDisponibles = appData.requisitos.filter(r => !r.proyecto || r.proyecto === getActiveProject());
                const casosAsociados = item?.casosAsociados ? (() => { try { const parsed = JSON.parse(item.casosAsociados); if (Array.isArray(parsed)) return parsed.map(c => c.id); return (item.casosAsociados || '').split(',').map(s => s.trim()).filter(Boolean); } catch (e) { return []; } })() : [];
                h += `<div class="form-group"><label>ID Ejecución</label><input value="${item?.id || 'EJEC-' + Date.now()}" ${d} id="f_id"></div><div class="form-group"><label>Nombre del Ciclo *</label><input value="${item?.nombreCiclo || ''}" ${d} id="f_nombreCiclo"></div><div class="form-group"><label>Proyecto</label><select ${d} id="f_proyecto">${projOpts}</select></div><div class="form-group"><label>Fecha</label><input type="date" value="${item?.fecha || ''}" ${d} id="f_fecha"></div><div class="form-group"><label>Responsable QA</label><select ${d} id="f_responsable">${userOpts(item?.responsable)}</select></div><div class="form-group"><label>📋 Requisito (Grupo de Casos)</label><select ${d} id="f_requisito" onchange="cargarCasosDeRequisito()"><option value="">Seleccionar requisito...</option>${requisitosDisponibles.map(r => `<option value="${r.id}" ${item?.requisito === r.id ? 'selected' : ''}>${r.id} - ${r.titulo}</option>`).join('')}</select><small style="color:var(--text2); display:block; margin-top:6px;">Al seleccionar un requisito, se incluirán automáticamente todos sus casos asociados</small></div><div class="form-group"><label>📝 Casos Incluidos (Automático)</label><div class="checkbox-list" id="casosContainer" style="max-height:250px;">${casosAsociados.length === 0 ? '<div style="color:var(--text2); font-size:0.85rem;">Selecciona un requisito para cargar los casos</div>' : casosAsociados.map(cId => { const caso = appData.casos.find(c => c.id === cId); return caso ? `<label class="checkbox-item"><input type="checkbox" class="caso-check" value="${cId}" checked disabled><span><b>${cId}</b> - ${caso.titulo}</span></label>` : ''; }).join('')}</div></div><div class="form-group"><label>📝 Notas Generales del Ciclo</label><textarea ${d} id="f_comentarios" placeholder="Notas sobre el entorno, versión u observaciones...">${item?.comentarios || ''}</textarea></div>`;
                break;
            case 'diario':
                h += `<div class="form-group"><label>ID</label><input value="${item?.id || 'DIA-' + Date.now()}" ${d} id="f_id"></div><div class="form-group"><label>Colaborador QA</label><select ${d} id="f_colaborador">${userOpts(item?.colaborador || currentUser?.nombre)}</select></div><div class="form-group"><label>Mes</label><input type="month" value="${item?.mes || ''}" ${d} id="f_mes"></div><div class="form-group"><label>Fecha de la tarea</label><input type="date" value="${item?.fecha || ''}" ${d} id="f_fecha"></div><div class="form-group"><label>Descripción de actividad</label><textarea ${d} id="f_descripcion">${item?.descripcion || ''}</textarea></div><div class="form-group"><label>Horas invertidas</label><input type="number" step="0.5" value="${item?.horas || ''}" ${d} id="f_horas"></div>`;
                break;
            case 'capturas':
                const getCasosBugsApisOpts = (selectedValue) => {
                    let opts = '<option value="">Ninguno / Seleccionar...</option>';
                    if (appData.casos && appData.casos.length > 0) { opts += '<optgroup label="📋 Casos de Prueba">'; appData.casos.forEach(c => { opts += `<option value="caso_${c.id}" ${selectedValue === 'caso_' + c.id ? 'selected' : ''}>${c.id} - ${c.titulo}</option>`; }); opts += '</optgroup>'; }
                    if (appData.bugs && appData.bugs.length > 0) { opts += '<optgroup label="🐛 Bugs / Defectos">'; appData.bugs.forEach(b => { opts += `<option value="bug_${b.id}" ${selectedValue === 'bug_' + b.id ? 'selected' : ''}>${b.id} - ${b.titulo}</option>`; }); opts += '</optgroup>'; }
                    if (appData.apis && appData.apis.length > 0) { opts += '<optgroup label=" APIs">'; appData.apis.forEach(api => { opts += `<option value="api_${api.id}" ${selectedValue === 'api_' + api.id ? 'selected' : ''}>${api.id} - ${api.nombre || api.endpoint}</option>`; }); opts += '</optgroup>'; }
                    return opts;
                };
                h += `<div class="form-group"><label>ID Captura</label><input value="${item?.id || 'CAP-' + Date.now()}" id="f_id" ${d}></div><div class="form-group"><label>Descripción de la Evidencia</label><input value="${item?.descripcion || ''}" id="f_descripcion" ${d} placeholder="Ej: Error 500 en endpoint /api/users"></div><div class="form-group"><label>🔗 Vincular con</label><select id="f_vinculo" ${d}>${getCasosBugsApisOpts(item?.vinculo)}</select><small style="color:var(--text2); display:block; margin-top:6px;">Puedes vincular esta captura a un Caso, Bug o API</small></div><div class="form-group"><label>Subir Imagen</label><input type="file" id="f_archivos" accept="image/*" onchange="previsualizarCapturaQA(event, 'preview-box')" style="padding: 5px;" ${d}><div id="preview-box">${item?.archivos ? `<img src="${item.archivos}" style="max-height: 180px; border-radius: 8px; margin-top:10px; box-shadow: 0 4px 6px rgba(0,0,0,0.3);">` : ''}</div><input type="hidden" id="f_archivos_base64" value="${item?.archivos || ''}"></div>`;
                break;
            case 'apis':
                let fechaEjecucionVal = '';
                if (item?.fechaEjecucion) {
                    const str = String(item.fechaEjecucion);
                    if (str.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/)) { fechaEjecucionVal = str.slice(0, 16); } 
                    else { const d = new Date(str); if (!isNaN(d.getTime())) { const offset = d.getTimezoneOffset() * 60000; fechaEjecucionVal = new Date(d.getTime() - offset).toISOString().slice(0, 16); } }
                }
                h += `<div class="form-group"><label>ID API</label><input value="${item?.id || 'API-' + Date.now()}" ${d} id="f_id"></div><div class="form-group"><label>Nombre API</label><input value="${item?.nombre || ''}" ${d} id="f_nombre"></div><div class="form-group"><label>📋 Requisito Asociado</label><select ${d} id="f_requisito"><option value="">Sin requisito...</option>${appData.requisitos.filter(r => !r.proyecto || r.proyecto === getActiveProject()).map(r => `<option value="${r.id}" ${item?.requisito === r.id ? 'selected' : ''}>${r.id} - ${r.titulo}</option>`).join('')}</select></div><div style="display:grid; grid-template-columns: 1fr 1fr; gap:15px;"><div class="form-group"><label>Endpoint</label><input value="${item?.endpoint || ''}" ${d} id="f_endpoint"></div><div class="form-group"><label>Método</label><select ${d} id="f_metodo"><option ${item?.metodo === 'GET' ? 'selected' : ''}>GET</option><option ${item?.metodo === 'POST' ? 'selected' : ''}>POST</option><option ${item?.metodo === 'PUT' ? 'selected' : ''}>PUT</option><option ${item?.metodo === 'DELETE' ? 'selected' : ''}>DELETE</option></select></div></div><div class="form-group"><label>Request (Body / Params)</label><textarea ${d} id="f_request" rows="3">${item?.request || ''}</textarea></div><div class="form-group"><label>Response Esperada (JSON)</label><textarea ${d} id="f_respEsperada" rows="3">${item?.respEsperada || ''}</textarea></div><hr style="border-color: var(--border); margin: 20px 0;"><h4 style="color: var(--accent2); margin-bottom: 15px;">📝 Evidencia de Ejecución (Postman)</h4><div style="display:grid; grid-template-columns: 1fr 1fr; gap: 15px;"><div class="form-group"><label>Status Code Real</label><input type="number" value="${item?.statusCode || ''}" ${d} id="f_statusCode" placeholder="Ej: 200, 404, 500"></div><div class="form-group"><label>Tiempo de Respuesta (ms)</label><input type="number" value="${item?.tiempoRespuesta || ''}" ${d} id="f_tiempoRespuesta" placeholder="Ej: 145"></div></div><div class="form-group"><label>Response Real (Copiar desde Postman)</label><textarea ${d} id="f_responseReal" rows="5" placeholder='Pega aquí el JSON de respuesta de Postman...'>${item?.responseReal || ''}</textarea></div><div class="form-group"><label>Fecha de Ejecución</label><input type="datetime-local" value="${fechaEjecucionVal}" ${d} id="f_fechaEjecucion"></div><div class="form-group" style="margin-top:15px;"><label>Estado Final</label><select ${d} id="f_estado"><option ${item?.estado === 'Correcta' ? 'selected' : ''}>Correcta</option><option ${item?.estado === 'Error' ? 'selected' : ''}>Error</option><option ${item?.estado === 'Pendiente' ? 'selected' : ''}>Pendiente</option></select></div>`;
                if (id) {
                    h += `<div id="commentsContainer_api_${id}"></div>`;
                    setTimeout(() => { renderCommentsSection('api', id); }, 50);
                    const apiCapturas = appData.capturas.filter(c => c.vinculo === 'api_' + id);
                    if (apiCapturas.length > 0) {
                        h += `<div class="form-group" style="margin-top:20px;"><label> Capturas QA Vinculadas (${apiCapturas.length})</label><div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap:12px; margin-top:10px;">`;
                        apiCapturas.forEach(cap => { h += `<div style="position:relative; background:var(--bg2); border-radius:8px; overflow:hidden; border:1px solid var(--border);"><img src="${cap.archivos}" style="width:100%; height:120px; object-fit:cover; cursor:pointer;" onclick="window.open('${cap.archivos}', '_blank')"><div style="padding:8px; font-size:0.75rem; color:var(--text2);">${cap.descripcion || 'Sin descripción'}</div><button onclick="window.openModal('capturas', '${cap.id}')" style="position:absolute; top:5px; right:5px; background:rgba(0,0,0,0.7); border:none; color:#fff; width:28px; height:28px; border-radius:50%; cursor:pointer;">👁️</button></div>`; });
                        h += `</div></div>`;
                    }
                }
                break;
            case 'requisitos':
                h += `<div class="form-group"><label>ID Requisito</label><input value="${item?.id || 'REQ-' + Date.now()}" ${d} id="f_id"></div><div class="form-group"><label>Proyecto</label><select ${d} id="f_proyecto">${projOpts}</select></div><div class="form-group"><label>Título del Requisito *</label><input value="${item?.titulo || ''}" ${d} id="f_titulo" placeholder="Ej: RF-001: Gestión de Usuarios"></div><div class="form-group"><label>Descripción</label><textarea ${d} id="f_descripcion" rows="3" placeholder="Descripción detallada del requisito funcional...">${item?.descripcion || ''}</textarea></div><div class="form-group"><label>Tipo</label><select ${d} id="f_tipo"><option ${item?.tipo === 'Funcional' ? 'selected' : ''}>Funcional</option><option ${item?.tipo === 'No Funcional' ? 'selected' : ''}>No Funcional</option><option ${item?.tipo === 'Técnico' ? 'selected' : ''}>Técnico</option></select></div><div class="form-group"><label>Prioridad</label><select ${d} id="f_prioridad"><option ${item?.prioridad === 'Alta' ? 'selected' : ''}>Alta</option><option ${item?.prioridad === 'Media' ? 'selected' : ''}>Media</option><option ${item?.prioridad === 'Baja' ? 'selected' : ''}>Baja</option></select></div><div class="form-group" style="margin-top:20px; padding:20px; background:var(--card-alt); border-radius:12px; border:2px dashed var(--border);"><label style="color:var(--accent); font-weight:600;"> Documentos del Requisito</label><p style="font-size:0.85rem; color:var(--text2); margin:8px 0;">Sube documentos (PDF, DOCX, TXT) para que la IA genere casos de uso automáticamente</p><input type="file" id="f_documento" accept=".txt,.pdf,.doc,.docx" ${d} style="width:100%; padding:12px; background:var(--bg); border:2px dashed var(--border); border-radius:8px; cursor:pointer;" onchange="handleDocumentoUpload(this)">`;
                if (item?.documento) {
                    h += `<div style="margin-top:12px; padding:12px; background:var(--bg); border-radius:8px; display:flex; align-items:center; justify-content:space-between;"><div style="display:flex; align-items:center; gap:10px;"><span style="font-size:1.5rem;">📄</span><div><div style="font-weight:600; font-size:0.9rem;">Documento adjunto</div><div style="font-size:0.75rem; color:var(--text2);">${item.nombreDocumento || 'documento'}</div></div></div><button type="button" class="btn btn-sm btn-outline" onclick="eliminarDocumento()" ${d === 'disabled' ? 'style="display:none"' : ''}>🗑️</button></div>`;
                }
                h += `</div>`;
                if (item?.documento) { h += `<div class="form-group" style="margin-top:15px;"><button type="button" class="btn btn-accent" style="width:100%;" onclick="analizarDocumentoIA()">🤖 Analizar con IA y Generar Casos</button></div>`; }
                h += ``;
                break;
        }
        return h;
    }

    window.autoClasificarSeveridad = function() {
        const titulo = document.getElementById('f_titulo')?.value || '';
        const descripcion = document.getElementById('f_descripcion')?.value || '';
        const resumen = document.getElementById('f_resumen')?.value || '';
        if (!titulo) { toast('Escribe un título primero', 'warning'); return; }
        const clasificacion = clasificarSeveridadAutomatica(titulo, descripcion, resumen);
        document.getElementById('f_severidad').value = clasificacion.severidad;
        toast(` Severidad clasificada: ${clasificacion.severidad} (${clasificacion.confianza}% confianza)`, 'success');
    };

    window.cargarCasosDeRequisito = function () {
        const requisitoId = document.getElementById('f_requisito').value;
        const container = document.getElementById('casosContainer');
        if (!requisitoId) { container.innerHTML = '<div style="color:var(--text2); font-size:0.85rem;">Selecciona un requisito para cargar los casos</div>'; return; }
        const casosDelRequisito = appData.casos.filter(c => c.requisito === requisitoId && (!getActiveProject() || c.proyecto === getActiveProject()));
        if (casosDelRequisito.length === 0) { container.innerHTML = '<div style="color:var(--warning); font-size:0.85rem;">⚠️ No hay casos asociados a este requisito</div>'; return; }
        container.innerHTML = casosDelRequisito.map(c => `<label class="checkbox-item"><input type="checkbox" class="caso-check" value="${c.id}" checked disabled><span><b>${c.id}</b> - ${c.titulo}</span></label>`).join('');
        toast(`✅ Se han cargado ${casosDelRequisito.length} casos del requisito`, 'success');
    };

    window.validarEvidenciaApi = function () {
        const esperadaStr = document.getElementById('f_respEsperada').value.trim();
        const realStr = document.getElementById('f_responseReal').value.trim();
        const statusInput = document.getElementById('f_statusCode');
        const estadoSelect = document.getElementById('f_estado');
        if (!realStr) return toast('Pega primero la respuesta real de Postman', 'warning');
        try {
            const esperada = esperadaStr ? JSON.parse(esperadaStr) : null;
            const real = JSON.parse(realStr);
            let esCorrecta = false;
            if (!esperada) { esCorrecta = statusInput.value && parseInt(statusInput.value) < 400; } 
            else { esCorrecta = Object.keys(esperada).every(key => { return JSON.stringify(esperada[key]) === JSON.stringify(real[key]); }); }
            if (esCorrecta) { estadoSelect.value = 'Correcta'; toast('✅ Evidencia válida: La respuesta coincide con lo esperado', 'success'); } 
            else { estadoSelect.value = 'Error'; toast('❌ Evidencia inválida: La respuesta real difiere de la esperada', 'error'); }
            if (statusInput.value) { const code = parseInt(statusInput.value); if (code >= 500) { estadoSelect.value = 'Error'; toast('⚠️ Status Code 5xx detectado. Marcado como Error.', 'warning'); } }
        } catch (e) { toast('Error al parsear los JSON. Asegúrate de que el Response Real sea un JSON válido.', 'error'); }
    };

    window.handleCapturaFiles = function (event) {
        const input = event.target;
        const preview = document.getElementById('archivosPreview');
        if (preview) {
            preview.innerHTML = '';
            if (input.files && input.files.length > 0) {
                Array.from(input.files).forEach(file => {
                    if (file.type.startsWith('image/')) {
                        const reader = new FileReader();
                        reader.onload = function (e) { const img = document.createElement('img'); img.src = e.target.result; img.className = 'img-thumb'; img.title = file.name; preview.appendChild(img); };
                        reader.readAsDataURL(file);
                    } else { const span = document.createElement('span'); span.textContent = `📎 ${file.name}`; preview.appendChild(span); }
                });
            } else { preview.textContent = 'Ningún archivo seleccionado'; }
        }
    };

    window.saveModal = function (page, id) {
        const arr = getArrayForPage(page);
        const data = {};
        const formElements = document.querySelectorAll('.modal [id^="f_"]');
        formElements.forEach(el => { const fieldName = el.id.replace('f_', ''); data[fieldName] = el.value; });
        if (!data.id) return (typeof showToast === 'function' ? showToast('ID requerido', 'error') : toast('ID requerido', 'error'));
        const modulosConProyecto = ['casos', 'bugs', 'ejecuciones', 'capturas', 'diario', 'apis', 'objetivos', 'mejoras', 'requisitos'];
        if (modulosConProyecto.includes(page)) data.proyecto = getActiveProject();
        if (page === 'ejecuciones') {
            const requisitoId = document.getElementById('f_requisito').value;
            const casosDelRequisito = appData.casos.filter(c => c.requisito === requisitoId && (!getActiveProject() || c.proyecto === getActiveProject()));
            const newCasesData = casosDelRequisito.map(c => ({ id: c.id, status: 'Pendiente' }));
            data.casosAsociados = JSON.stringify(newCasesData);
            data.requisito = requisitoId;
        }
        if (page === 'capturas') { const base64Input = document.getElementById('f_archivos_base64'); if (base64Input && base64Input.value) data.archivos = base64Input.value; }
        if (page === 'usuarios') {
            const roleSelect = document.getElementById('f_rol');
            if (roleSelect && roleSelect.value === 'Consultor') { const authorizedProjects = Array.from(document.querySelectorAll('.project-perm-cb:checked')).map(cb => cb.value); data.proyectosAutorizados = authorizedProjects; } 
            else { data.proyectosAutorizados = []; }
        }
        if (page === 'requisitos') {
            const tempDoc = sessionStorage.getItem('temp_documento_' + getActiveProject());
            if (tempDoc) {
                const docData = JSON.parse(tempDoc);
                data.documento = docData.contenido; data.nombreDocumento = docData.nombre; data.tipoDocumento = docData.tipo; data.fechaDocumento = new Date().toISOString();
                sessionStorage.removeItem('temp_documento_' + getActiveProject());
            }
        }
        if (!id) data.creadoPor = currentUser.id;
        if (id) { const idx = arr.findIndex(x => x.id == id); if (idx >= 0) arr[idx] = { ...arr[idx], ...data }; } 
        else { arr.push(data); if (page === 'proyectos' || page === 'requisitos') populateProjectSelector(); }
        saveData(); closeModal(); renderPage(currentPage);
        if (typeof showToast === 'function') showToast('Guardado correctamente', 'success');
        else if (typeof toast === 'function') toast('Guardado correctamente', 'success');
    };

    function getArrayForPage(p) {
        return {
            proyectos: appData.proyectos, requisitos: appData.requisitos, usuarios: appData.usuarios, casos: appData.casos, bugs: appData.bugs,
            ejecuciones: appData.ejecuciones, capturas: appData.capturas, apis: appData.apis, diario: appData.registroDiario, mejoras: appData.mejoras,
            objetivos: appData.objetivos, trazabilidad: appData.trazabilidad
        }[p] || [];
    }

    function addTrace(page, event, entity) {
        appData.trazabilidad.push({ id: Date.now() + Math.random(), fechaHora: new Date().toISOString(), usuario: currentUser?.usuario || 'sistema', proyecto: getActiveProject() || 'General', tipoEvento: event, descripcion: `${event} en ${page}`, entidadAfectada: entity });
        if (appData.trazabilidad.length > 500) appData.trazabilidad = appData.trazabilidad.slice(-400);
    }

    // ============ GENERIC TABLE ============
    function renderTable(page, cols, data, rowFn, showActions = true, entityType = null) {
        if (!data || !Array.isArray(data)) data = [];
        let filtered = searchTerm ? data.filter(i => JSON.stringify(i).toLowerCase().includes(searchTerm)) : data;
        if (sortConfig.field) {
            filtered.sort((a, b) => {
                let valA = a[sortConfig.field]; let valB = b[sortConfig.field];
                if (valA == null || valA === '') valA = ''; if (valB == null || valB === '') valB = '';
                const numA = parseFloat(valA); const numB = parseFloat(valB);
                if (!isNaN(numA) && !isNaN(numB) && valA !== '' && valB !== '') return (numA - numB) * (sortConfig.dir === 'asc' ? 1 : -1);
                const dateA = new Date(valA); const dateB = new Date(valB);
                if (!isNaN(dateA.getTime()) && !isNaN(dateB.getTime())) return (dateA - dateB) * (sortConfig.dir === 'asc' ? 1 : -1);
                const strA = String(valA).toLowerCase(); const strB = String(valB).toLowerCase();
                return strA.localeCompare(strB, 'es', { sensitivity: 'base' }) * (sortConfig.dir === 'asc' ? 1 : -1);
            });
        }
        const totalPages = Math.ceil(filtered.length / pageSize) || 1;
        const pg = Math.min(currentPages[page] || 1, totalPages);
        currentPages[page] = pg;
        const paged = filtered.slice((pg - 1) * pageSize, pg * pageSize);
        let h = `<div class="table-container"><div class="table-toolbar"><input class="search-input" placeholder="🔍 Buscar..." value="${searchTerm}"><select class="page-size-select"><option ${pageSize === 5 ? 'selected' : ''}>5</option><option ${pageSize === 10 ? 'selected' : ''}>10</option><option ${pageSize === 25 ? 'selected' : ''}>25</option><option ${pageSize === 50 ? 'selected' : ''}>50</option></select><span style="color:var(--text2); font-size:0.85rem;">${filtered.length} resultados</span>${showActions ? `<button class="btn btn-accent btn-sm" data-action="create">➕ Nuevo</button>` : ''}</div><div style="overflow-x:auto;"><table><thead><tr>`;
        cols.forEach(c => { if (c.field) { h += `<th data-sort="${c.field}" style="cursor:pointer;">${c.label} ${sortConfig.field === c.field ? (sortConfig.dir === 'asc' ? '▲' : '▼') : ''}</th>`; } else { h += `<th>${c.label}</th>`; } });
        if (showActions) h += '<th style="width:120px;">Acciones</th>';
        h += '</tr></thead><tbody>';
        if (paged.length === 0) { h += `<tr><td colspan="${cols.length + (showActions ? 1 : 0)}" style="text-align:center;padding:40px;"><div class="empty-state-icon">📭</div><div style="color:var(--text2);">No hay registros</div></td></tr>`; }
        paged.forEach(item => {
            h += `<tr data-entity-type="${entityType || ''}" data-entity-id="${item.id}">${rowFn(item)}`;
            if (showActions) h += `<td class="actions-cell"><button data-action="view" data-id="${item.id}" title="Ver">👁</button><button data-action="edit" data-id="${item.id}" title="Editar">✏️</button><button data-action="delete" data-id="${item.id}" title="Eliminar">🗑️</button></td>`;
            h += `</tr>`;
        });
        h += `</tbody></table></div>`;
        if (totalPages > 1) {
            h += `<div class="pagination">`;
            if (pg > 1) h += `<button data-pg="${pg - 1}">◀ Anterior</button>`;
            for (let i = 1; i <= totalPages; i++) {
                if (i === 1 || i === totalPages || (i >= pg - 2 && i <= pg + 2)) h += `<button data-pg="${i}" class="${i === pg ? 'active-page-btn' : ''}">${i}</button>`;
                else if (i === pg - 3 || i === pg + 3) h += `<button disabled style="opacity:0.5;">...</button>`;
            }
            if (pg < totalPages) h += `<button data-pg="${pg + 1}">Siguiente ▶</button>`;
            h += `</div>`;
        }
        return h + '</div>';
    }

    function initCaptureTooltip() {
        // Evitar crear múltiples tooltips
        if (document.querySelector('.qa-capture-tooltip')) return;
        
        const tooltip = document.createElement('div');
        tooltip.className = 'qa-capture-tooltip';
        document.body.appendChild(tooltip);
        
        let isTooltipVisible = false;
        
        document.addEventListener('mouseover', (e) => {
            const row = e.target.closest('tr[data-entity-type]');
            if (!row) {
                if (isTooltipVisible) {
                    tooltip.classList.remove('visible');
                    isTooltipVisible = false;
                }
                return;
            }
            
            const entityType = row.dataset.entityType;
            const entityId = row.dataset.entityId;
            if (!entityType || !entityId) return;
            
            let captura = null;
            if (entityType === 'caso') captura = appData.capturas.find(c => c.vinculo === 'caso_' + entityId && c.archivos);
            else if (entityType === 'bug') captura = appData.capturas.find(c => c.vinculo === 'bug_' + entityId && c.archivos);
            else if (entityType === 'api') captura = appData.capturas.find(c => c.vinculo === 'api_' + entityId && c.archivos);
            
            if (!captura) {
                if (isTooltipVisible) {
                    tooltip.classList.remove('visible');
                    isTooltipVisible = false;
                }
                return;
            }
            
            tooltip.innerHTML = `
                <div class="tooltip-label">📸 Captura QA Vinculada</div>
                <img src="${captura.archivos}" alt="Captura">
                <div style="font-size:0.75rem; color:var(--text2); margin-top:5px; word-break: break-word;">${captura.descripcion || ''}</div>
            `;
            tooltip.classList.add('visible');
            isTooltipVisible = true;
        });
        
        document.addEventListener('mousemove', (e) => {
            if (!isTooltipVisible) return;
            
            const tooltipRect = tooltip.getBoundingClientRect();
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;
            
            // Calcular posición ideal (15px a la derecha y abajo del cursor)
            let x = e.clientX + 15;
            let y = e.clientY + 15;
            
            // Si se sale por la derecha, mostrar a la izquierda del cursor
            if (x + tooltipRect.width > viewportWidth - 20) {
                x = e.clientX - tooltipRect.width - 15;
            }
            
            // Si se sale por abajo, mostrar arriba del cursor
            if (y + tooltipRect.height > viewportHeight - 20) {
                y = e.clientY - tooltipRect.height - 15;
            }
            
            // Asegurar que no se salga por la izquierda o arriba
            x = Math.max(10, x);
            y = Math.max(10, y);
            
            tooltip.style.left = x + 'px';
            tooltip.style.top = y + 'px';
        });
        
        document.addEventListener('mouseout', (e) => {
            const row = e.target.closest('tr[data-entity-type]');
            const relatedRow = e.relatedTarget ? e.relatedTarget.closest('tr[data-entity-type]') : null;
            
            if (row && !relatedRow) {
                tooltip.classList.remove('visible');
                isTooltipVisible = false;
            }
        });
    }

    const itemsPerPage = 10;
    function generarPaginador(totalItems, currentPage, funcionCambioPagina) {
        const totalPages = Math.ceil(totalItems / itemsPerPage);
        let htmlPaginador = '<div class="pagination" style="display: flex; gap: 8px; justify-content: center; margin-top: 20px;">';
        if (totalPages > 1) {
            for (let i = 1; i <= totalPages; i++) {
                const activeStyle = (i === currentPage) ? 'background: var(--accent-blue); color: white; border-color: var(--accent-blue);' : 'background: var(--card-bg); color: var(--text-main);';
                htmlPaginador += `<button style="padding: 6px 12px; border-radius: 6px; border: 1px solid var(--card-border); cursor: pointer; ${activeStyle}" onclick="${funcionCambioPagina}(${i})">${i}</button>`;
            }
        }
        htmlPaginador += '</div>';
        return htmlPaginador;
    }

    function getVisibleData(arr, key = 'proyecto') {
        const ap = getActiveProject();
        if (!arr || !Array.isArray(arr)) return [];
        let result = arr;
        if (currentUser && currentUser.rol === 'Consultor') { const authProjects = currentUser.proyectosAutorizados || []; if (authProjects.length === 0) return []; result = result.filter(i => authProjects.includes(i.proyecto)); }
        if (ap) result = result.filter(i => (i[key] || i.proyecto) === ap);
        return result;
    }

    // ============ DASHBOARD ============
    function renderDashboard() {
        const casos = getVisibleData(appData.casos);
        const bugs = getVisibleData(appData.bugs);
        const ejecuciones = getVisibleData(appData.ejecuciones);
        const apis = getVisibleData(appData.apis);
        const proysActivos = (appData.proyectos || []).filter(p => p.estado === 'Activo').length;
        const casosPasados = casos.filter(c => c.estado === 'Pasado').length;
        const casosFallidos = casos.filter(c => c.estado === 'Fallido').length;
        const bugsAbiertos = bugs.filter(b => b.estado !== 'Solucionado').length;
        const bugsSolucionados = bugs.filter(b => b.estado === 'Solucionado').length;
        const apisOk = apis.filter(a => a.estado === 'Correcta').length;
        const cobertura = casos.length > 0 ? Math.round((casosPasados / casos.length) * 100) : 0;
        const tasaDefectos = casos.length > 0 ? Math.round((bugs.length / casos.length) * 100) : 0;
        let h = `<h1 class="page-title">📊 Dashboard</h1><p class="page-subtitle">Resumen general del proyecto activo</p><div class="kpi-grid"><div class="kpi-card"><div class="kpi-icon">📁</div><div class="kpi-value">${proysActivos}</div><div class="kpi-label">Proyectos Activos</div></div><div class="kpi-card"><div class="kpi-icon">📋</div><div class="kpi-value">${casos.length}</div><div class="kpi-label">Casos de Uso</div><div class="kpi-trend up">✅ ${casosPasados} pasados</div></div><div class="kpi-card"><div class="kpi-icon">🐛</div><div class="kpi-value">${bugsAbiertos}</div><div class="kpi-label">Bugs Abiertos</div><div class="kpi-trend ${bugsAbiertos > 5 ? 'down' : 'up'}">${bugsSolucionados} solucionados</div></div><div class="kpi-card"><div class="kpi-icon">🎯</div><div class="kpi-value">${cobertura}%</div><div class="kpi-label">Cobertura</div><div class="kpi-trend up">Casos ejecutados</div></div><div class="kpi-card"><div class="kpi-icon">⚡</div><div class="kpi-value">${tasaDefectos}%</div><div class="kpi-label">Tasa Defectos</div><div class="kpi-trend ${tasaDefectos > 30 ? 'down' : 'up'}">Bugs/Casos</div></div><div class="kpi-card"><div class="kpi-icon">🔌</div><div class="kpi-value">${apisOk}/${apis.length}</div><div class="kpi-label">APIs OK</div><div class="kpi-trend up">Endpoints</div></div></div>`;
        h += `<div class="chart-grid">${renderBarChart('Estado de Casos', [{ label: 'Pasados', value: casosPasados, color: '#10b981' }, { label: 'Fallidos', value: casosFallidos, color: '#ef4444' }, { label: 'Pendientes', value: casos.length - casosPasados - casosFallidos, color: '#94a3b8' }])}${renderDonutChart('Severidad Bugs', [{ label: 'Bloqueante', value: bugs.filter(b => b.severidad === 'Bloqueante').length, color: '#ef4444' }, { label: 'Crítica', value: bugs.filter(b => b.severidad === 'Crítica').length, color: '#f59e0b' }, { label: 'Mayor', value: bugs.filter(b => b.severidad === 'Mayor').length, color: '#3b82f6' }, { label: 'Menor', value: bugs.filter(b => b.severidad === 'Menor').length, color: '#10b981' }])}</div><br>`;
        const recentTraces = appData.trazabilidad.slice(-5).reverse();
        if (recentTraces.length > 0) {
            h += `<div class="chart-card"><div class="chart-title">🕐 Actividad Reciente</div><div style="display:flex; flex-direction:column; gap:10px;">`;
            recentTraces.forEach(t => { h += `<div style="display:flex; justify-content:space-between; padding:10px 14px; background:var(--card-alt); border-radius:8px; border:1px solid var(--border);"><div><div style="font-weight:600; font-size:0.88rem;">${t.tipoEvento}</div><div style="font-size:0.78rem; color:var(--text2);">${t.descripcion} · ${t.entidadAfectada}</div></div><div style="font-size:0.75rem; color:var(--text2);">${timeAgo(t.fechaHora)}</div></div>`; });
            h += `</div></div>`;
        }
        return h;
    }

    function renderBarChart(title, data) {
        const max = Math.max(...data.map(d => d.value), 1);
        const total = data.reduce((s, d) => s + d.value, 0);
        let bars = '';
        data.forEach((d, i) => {
            const height = (d.value / max) * 120;
            const x = 40 + i * 80;
            bars += `<rect x="${x}" y="${160 - height}" width="50" height="${height}" fill="${d.color}" rx="4"/><text x="${x + 25}" y="${155 - height}" text-anchor="middle" fill="var(--text)" font-size="12" font-weight="700">${d.value}</text><text x="${x + 25}" y="180" text-anchor="middle" fill="var(--text2)" font-size="10">${d.label}</text>`;
        });
        return `<div class="chart-card"><div class="chart-title">📊 ${title}</div><svg class="chart-svg" viewBox="0 0 320 200"><line x1="30" y1="160" x2="300" y2="160" stroke="var(--border)" stroke-width="1"/>${bars}</svg><div style="text-align:center; font-size:0.8rem; color:var(--text2); margin-top:8px;">Total: ${total}</div></div>`;
    }

    function renderDonutChart(title, data) {
        const total = data.reduce((s, d) => s + d.value, 0) || 1;
        let paths = '';
        let angle = -90;
        const cx = 100, cy = 100, r = 70, rInner = 40;
        data.forEach(d => {
            const pct = d.value / total;
            const endAngle = angle + pct * 360;
            const startRad = angle * Math.PI / 180;
            const endRad = endAngle * Math.PI / 180;
            const largeArc = pct > 0.5 ? 1 : 0;
            const x1 = cx + r * Math.cos(startRad);
            const y1 = cy + r * Math.sin(startRad);
            const x2 = cx + r * Math.cos(endRad);
            const y2 = cy + r * Math.sin(endRad);
            const x3 = cx + rInner * Math.cos(endRad);
            const y3 = cy + rInner * Math.sin(endRad);
            const x4 = cx + rInner * Math.cos(startRad);
            const y4 = cy + rInner * Math.sin(startRad);
            paths += `<path d="M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} L ${x3} ${y3} A ${rInner} ${rInner} 0 ${largeArc} 0 ${x4} ${y4} Z" fill="${d.color}"/>`;
            angle = endAngle;
        });
        let legend = '';
        data.forEach(d => { legend += `<div style="display:flex; align-items:center; gap:8px; font-size:0.8rem;"><div style="width:12px; height:12px; background:${d.color}; border-radius:3px;"></div><span>${d.label}: <b>${d.value}</b></span></div>`; });
        return `<div class="chart-card"><div class="chart-title">🍩 ${title}</div><div style="display:flex; align-items:center; gap:20px; flex-wrap:wrap;"><svg class="chart-svg" viewBox="0 0 200 200" style="max-width:180px;">${paths}<text x="100" y="100" text-anchor="middle" fill="var(--text)" font-size="20" font-weight="700">${total}</text><text x="100" y="118" text-anchor="middle" fill="var(--text2)" font-size="10">Total</text></svg><div style="display:flex; flex-direction:column; gap:6px;">${legend}</div></div></div>`;
    }

    // ============ PAGES ============
    function renderProyectos() {
        const cols = [{ label: 'ID', field: 'id' }, { label: 'Nombre', field: 'nombre' }, { label: 'Cliente', field: ' codigoCliente' }, { label: 'Responsable', field: 'responsable' }, { label: 'Inicio', field: 'fechaInicio' }, { label: 'Fin', field: 'fechaFin' }, { label: 'Estado', field: 'estado' }];
        return '<h1 class="page-title">📁 Proyectos</h1>' + renderTable('proyectos', cols, appData.proyectos, i => `<td><code>${i.id}</code></td><td><b>${i.nombre || ''}</b></td><td>${i.codigoCliente || '-'}</td><td>${i.responsable || '-'}</td><td>${i.fechaInicio || '-'}</td><td>${i.fechaFin || '-'}</td><td><span class="badge ${i.estado === 'Activo' ? 'badge-success' : i.estado === 'Completado' ? 'badge-info' : 'badge-warning'}">${i.estado || 'Planificado'}</span></td>`);
    }

    function renderObjetivos() {
        const data = filterByProject(appData.objetivos);
        const cols = [{ label: 'ID' }, { label: 'Objetivo' }, { label: 'Responsable' }, { label: 'Inic io' }, { label: 'Fin' }, { label: 'Estado' }];
        return '<h1 class="page-title">🎯 Objetivos</h1>' + renderTable('objetivos', cols, data, i => `<td>${i.id}</td><td>${i.objetivo || ''}</td><td>${i.responsable || '-'}</td><td>${i.fechaInicio || '-'}</td><td>${i.fechaFin || '-'}</td><td><span class="badge ${i.estado === 'Finalizado' ? 'badge-success' : i.estado === 'En progreso' ? 'badge-info' : 'badge-warning'}">${i.estado || 'Pendiente'}</span></td>`);
    }

    function renderMejoras() {
        const data = filterByProject(appData.mejoras);
        const cols = [{ label: 'ID', field: 'id' }, { label: 'Título', field: 'titulo' }, { label: 'Catego ría', field: 'categoria' }, { label: 'Prioridad', field: 'prioridad' }, { label: 'Estado', field: 'estado' }, { label: 'Responsable', field: 'responsable' }];
        return '<h1 class="page-title">💡 Mejoras para el Equipo QA</h1><p class="page-subtitle">Propuestas de mejora para optimizar procesos, herramientas y metodología QA</p>' + renderTable('mejoras', cols, data, i => {
            const estadoClass = { 'Propuesta': 'badge-info', 'En evaluación': 'badge-warning', 'Aprobada': 'badge-purple', 'En implementación': 'badge-info', 'Implementada': 'badge-success ', 'Descartada': 'badge-neutral' }[i.estado] || 'badge-neutral';
            const prioridadClass = { 'Alta': 'badge-danger', 'Media': 'badge-warning', 'Baja': 'badge-info' }[i.prioridad] || 'badge-info';
            return `<td><code>${i.id}</code></td><td><b>${i.titulo || ''}</b></td><td><span class="badge badge-purple">${i.categoria || 'Otro'}</span></td><td><span class="badge ${prioridadClass}">${i.prioridad || 'Media'}</span></td><td><span class="badge ${estadoClass}">${i.estado || 'Propuesta'}</span></td><td>${i.responsable || '<span style="color:var(--text2);">Sin asignar</span>'}</td>`;
        });
    }

    function renderUsuarios() {
        const cols = [{ label: 'ID', field: 'id' }, { label: 'Nombre', field: 'nombre' }, { label: 'Usuario', field: 'usuario' }, { label: 'Rol', field: 'rol' }];
        return '<h1 class="page-title">👥 Gestión de Usuarios</h1>' + renderTable('usuarios', cols, appData.usuarios, i => `<td><code>${i.id}</code></td><td><b>${i.nombre || ''}</b></td><td>${i.usuario || ''}</td><td><span class="badge badge-info">${i.rol || 'Consultor'}</span></td>`);
    }

    function renderCasos() {
        let data = filterByProject(appData.casos);
        const estadoFilter = document.getElementById('filter_caso_estado')?.value || '';
        const prioridadFilter = document.getElementById('filter_caso_prioridad')?.value || '';
        if (estadoFilter) data = data.filter(i => i.estado === estadoFilter);
        if (prioridadFilter) data = data.filter(i => i.prioridad === prioridadFilter);
        const cols = [{ label: 'ID', field: 'id' }, { label: 'Requisito', field: 'requisito' }, { label: 'Título', field: 'titulo' }, { label: 'Prioridad', field: 'prioridad' }, { label: 'Actor', field: 'actor' }, { label: 'Estado', field: 'estado' }];
        let html = '<h1 class="page-title">📋 Casos de Uso</h1>';
        html += `<div style="display:flex; gap:10px; margin-bottom:20px; flex-wrap:wrap;"><select id="filter_caso_estado" onchange="renderPage('casos')" style="padding:8px 12px; border-radius:8px; background:var(--input); color:var(--text); border:1px solid var(--border);"><option value="">Todos los Estados</option><option value="Pendiente" ${estadoFilter === 'Pendiente' ? 'selected' : ''}>Pendiente</option><option value="Pasado" ${estadoFilter === 'Pasado' ? 'selected' : ''}>Pasado</option><option value="Fallido" ${estadoFilter === 'Fallido' ? 'selected' : ''}>Fallido</option></select><select id="filter_caso_prioridad" onchange="renderPage('casos')" style="padding:8px 12px; border-radius:8px; background:var(--input); color:var(--text); border:1px solid var(--border);"><option value="">Todas las Prioridades</option><option value="Crítica" ${prioridadFilter === 'Crítica' ? 'selected' : ''}>Crítica</option><option value="Alta" ${prioridadFilter === 'Alta' ? 'selected' : ''}>Alta</option><option value="Media" ${prioridadFilter === 'Media' ? 'selected' : ''}>Media</option><option value="Baja" ${prioridadFilter === 'Baja' ? 'selected' : ''}>Baja</option></select><button class="btn btn-outline btn-sm" onclick="clearFilters('casos')">🔄 Limpiar Filtros y Búsqueda</button></div>`;
        html += renderTable('casos', cols, data, i => {
            const req = appData.requisitos.find(r => r.id === i.requisito);
            const captura = appData.capturas.find(c => c.vinculo === i.id && c.archivos);
            const hasCapture = captura ? 'has-capture-indicator' : '';
            return `<td class="${hasCapture}"><code>${i.id}</code></td><td>${req ? `<span class="badge badge-purple" title="${req.titulo}">${i.requisito}</span>` : '<span style="color:var(--text2);">-</span>'}</td><td><b>${i.titulo || ''}</b></td><td><span class="badge ${i.prioridad === 'Crítica' ? 'badge-danger' : i.prioridad === 'Alta' ? 'badge-warning' : 'badge-info'}">${i.prioridad || 'Media'}</span></td><td>${i.actor || '-'}</td><td><span class="badge ${i.estado === 'Pasado' ? 'badge-success' : i.estado === 'Fallido' ? 'badge-danger' : 'badge-neutral'}">${i.estado || 'Pendiente'}</span></td>`;
        }, true, 'caso');
        return html;
    }

    function renderDiario() {
        const data = filterByProject(appData.registroDiario);
        const cols = [{ label: 'ID' }, { label: 'Colaborador' }, { label: 'Fecha' }, { label: 'Horas' }];
        const total = data.reduce((s, i) => s + (+i.horas || 0), 0);
        return '<h1 class="page-title">📝 Registro Diario</h1>' + renderTable('diario', cols, data, i => `<td>${i.id}</td><td>${i.colaborador || '-'}</td><td>${i.fecha || '-'}</td><td>${i.horas || '0'}h</td>`) + `<div class="kpi-card" style="margin-top:20px; max-width: 250px;"><div class="kpi-value">${total}h</div><div class="kpi-label">Total Horas Proyecto</div></div>`;
    }

    function renderCapturas() {
        const data = filterByProject(appData.capturas);
        const cols = [{ label: 'ID', field: 'id' }, { label: 'Descripción', field: 'descripcion' }, { label: 'Vínculo', field: 'vinculo' }, { label: 'Evidencia Visual', field: 'archivos' }];
        return '<h1 class="page-title">📸 Capturas QA</h1>' + renderTable('capturas', cols, data, i => {
            let vinculoHtml = '<span style="color:var(--text2);">Sin vincular</span>';
            if (i.vinculo) {
                if (i.vinculo.startsWith('caso_')) { const casoId = i.vinculo.replace('caso_', ''); const caso = appData.casos.find(c => c.id === casoId); vinculoHtml = `<span class="badge badge-info">📋 ${casoId}</span>`; } 
                else if (i.vinculo.startsWith('bug_')) { const bugId = i.vinculo.replace('bug_', ''); const bug = appData.bugs.find(b => b.id === bugId); vinculoHtml = `<span class="badge badge-danger">🐛 ${bugId}</span>`; } 
                else if (i.vinculo.startsWith('api_')) { const apiId = i.vinculo.replace('api_', ''); const api = appData.apis.find(a => a.id === apiId); vinculoHtml = `<span class="badge badge-purple">🔌 ${apiId}</span>`; }
            }
            const imgHtml = i.archivos && i.archivos.startsWith('data:image') ? `<img src="${i.archivos}" style="height: 50px; border-radius: 6px; cursor: pointer; border: 1px solid var(--border);" onclick="window.open('${i.archivos}', '_blank')" title="Click para ver en grande">` : '<span style="color:var(--text2); font-size:0.8rem;">Sin imagen</span>';
            return `<td><code>${i.id}</code></td><td><b>${i.descripcion || '-'}</b></td><td>${vinculoHtml}</td><td>${imgHtml}</td>`;
        }, true, 'captura');
    }

    function renderApis() {
        let data = filterByProject(appData.apis);
        const metodoFilter = document.getElementById('filter_api_metodo')?.value || '';
        const estadoFilter = document.getElementById('filter_api_estado')?.value || '';
        if (metodoFilter) data = data.filter(i => i.metodo === metodoFilter);
        if (estadoFilter) data = data.filter(i => i.estado === estadoFilter);
        const cols = [{ label: 'ID', field: 'id' }, { label: 'Requisito', field: 'requisito' }, { label: 'Nombre', field: 'nombre' }, { label: 'Endpoint', field: 'endpoint' }, { label: 'Método', field: 'metodo' }, { label: 'Status', field: 'statusCode' }, { label: 'Latencia', field: 'tiempoRespuesta' }, { label: 'Fecha Ejec.', field: 'fechaEjecucion' }, { label: 'Estado', field: 'estado' }];
        let html = '<h1 class="page-title">🔌 APIs (Evidencias Postman)</h1>';
        html += `<div style="display:flex; gap:10px; margin-bottom:20px; flex-wrap:wrap;"><select id="filter_api_metodo" onchange="renderPage('apis')" style="padding:8px 12px; border-radius:8px; background:var(--input); color:var(--text); border:1px solid var(--border);"><option value="">Todos los Métodos</option><option value="GET" ${metodoFilter === 'GET' ? 'selected' : ''}>GET</option><option value="POST" ${metodoFilter === 'POST' ? 'selected' : ''}>POST</option><option value="PUT" ${metodoFilter === 'PUT' ? 'selected' : ''}>PUT</option><option value="DELETE" ${metodoFilter === 'DELETE' ? 'selected' : ''}>DELETE</option></select><select id="filter_api_estado" onchange="renderPage('apis')" style="padding:8px 12px; border-radius:8px; background:var(--input); color:var(--text); border:1px solid var(--border);"><option value="">Todos los Estados</option><option value="Correcta" ${estadoFilter === 'Correcta' ? 'selected' : ''}>Correcta</option><option value="Error" ${estadoFilter === 'Error' ? 'selected' : ''}>Error</option><option value="Pendiente" ${estadoFilter === 'Pendiente' ? 'selected' : ''}>Pendiente</option></select><button class="btn btn-outline btn-sm" onclick="clearFilters('apis')">🔄 Limpiar Filtros</button></div>`;
        html += renderTable('apis', cols, data, i => {
            const req = appData.requisitos.find(r => r.id === i.requisito);
            const captura = appData.capturas.find(c => c.vinculo === 'api_' + i.id && c.archivos);
            const hasCapture = captura ? 'has-capture-indicator' : '';
            const statusBadge = i.statusCode ? `<span class="badge ${i.statusCode < 400 ? 'badge-success' : 'badge-danger'}">${i.statusCode}</span>` : '<span style="color:var(--text2);">-</span>';
            const latency = i.tiempoRespuesta ? `<span style="font-weight:600; color:${i.tiempoRespuesta < 500 ? 'var(--success)' : 'var(--warning)'};">${i.tiempoRespuesta} ms</span>` : '-';
            const fechaExec = i.fechaEjecucion ? new Date(i.fechaEjecucion).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '<span style="color:var(--text2);">-</span>';
            return `<td class="${hasCapture}"><code>${i.id}</code></td><td>${req ? `<span class="badge badge-purple" title="${req.titulo}">${i.requisito}</span>` : '<span style="color:var(--text2);">-</span>'}</td><td><b>${i.nombre || '-'}</b></td><td style="font-family:monospace; font-size:0.8rem; max-width:200px; overflow:hidden; text-overflow:ellipsis;">${i.endpoint || '-'}</td><td><span class="badge badge-info">${i.metodo || 'GET'}</span></td><td>${statusBadge}</td><td>${latency}</td><td style="font-size:0.8rem; white-space:nowrap;">${fechaExec}</td><td><span class="badge ${i.estado === 'Correcta' ? 'badge-success' : i.estado === 'Error' ? 'badge-danger' : 'badge-warning'}">${i.estado || 'Pendiente'}</span></td>`;
        }, true, 'api');
        return html;
    }

    function renderTrazabilidad() {
        const cols = [{ label: 'Fecha', field: 'fechaHora' }, { label: 'Usuario', field: 'usuario' }, { label: 'Proyecto', field: 'proyecto' }, { label: 'Evento', field: 'tipoEvento' }, { label: 'Descripción', field: 'descripcion' }, { label: 'Entidad', field: 'entidadAfectada' }];
        return '<h1 class="page-title">🔍 Trazabilidad</h1>' + '<button class="btn" style="background: var(--danger);" onclick="clearLogs()">🗑️ Limpiar Historial</button>' + renderTable('trazabilidad', cols, appData.trazabilidad.slice().reverse(), i => `<td>${new Date(i.fechaHora).toLocaleString()}</td><td>${i.usuario || '-'}</td><td>${i.proyecto || '-'}</td><td><span class="badge badge-info">${i.tipoEvento || ''}</span></td><td>${i.descripcion || ''}</td><td><code>${i.entidadAfectada || '-'}</code></td>`, false);
    }

    window.clearLogs = function () {
        showConfirmModal(
            `<div style="text-align: center; padding: 10px 0;">
                <div class="icon-warning" style="font-size: 4rem; margin-bottom: 15px; animation: shake 0.6s ease-in-out;">⚠️</div>
                <h3 style="margin: 0 0 12px 0; color: var(--danger); font-size: 1.3rem;">Purgar Historial de Trazabilidad</h3>
                <p style="color: var(--text2); font-size: 0.95rem; line-height: 1.6; margin: 0;">
                    Esta acción eliminará <strong>permanentemente</strong> todos los registros de auditoría y logs del sistema.<br>
                    <span style="color: var(--danger); font-weight: 600;">🚨 Esta acción es irreversible y no se puede deshacer.</span>
                </p>
            </div>`, 
            () => {
                appData.trazabilidad = []; 
                saveData(); 
                renderPage('trazabilidad'); 
                toast('Historial de trazabilidad eliminado', 'success'); 
                addNotification('🗑️ Historial borrado', 'Se han eliminado todos los registros de trazabilidad');
            }, 
            true // danger = true
        );
    };

    function renderBugs() {
        let data = filterByProject(appData.bugs).filter(b => b.estado !== 'Solucionado');
        const severidadFilter = document.getElementById('filter_bug_sev')?.value || '';
        const estadoBugFilter = document.getElementById('filter_bug_estado')?.value || '';
        if (severidadFilter) data = data.filter(i => i.severidad === severidadFilter);
        if (estadoBugFilter) data = data.filter(i => i.estado === estadoBugFilter);
        const cols = [{ label: 'ID', field: 'id' }, { label: 'Título', field: 'titulo' }, { label: 'Severidad', field: 'severidad' }, { label: 'Caso', field: 'casoRelacionado' }, { label: 'Estado', field: 'estado' }];
        let html = '<h1 class="page-title">🐛 Bugs Activos</h1>';
        html += `<div style="display:flex; gap:10px; margin-bottom:20px; flex-wrap:wrap;"><select id="filter_bug_sev" onchange="renderPage('bugs')" style="padding:8px 12px; border-radius:8px; background:var(--input); color:var(--text); border:1px solid var(--border);"><option value="">Todas las Severidades</option><option value="Bloqueante" ${severidadFilter === 'Bloqueante' ? 'selected' : ''}>Bloqueante</option><option value="Crítica" ${severidadFilter === 'Crítica' ? 'selected' : ''}>Crítica</option><option value="Mayor" ${severidadFilter === 'Mayor' ? 'selected' : ''}>Mayor</option><option value="Menor" ${severidadFilter === 'Menor' ? 'selected' : ''}>Menor</option></select><select id="filter_bug_estado" onchange="renderPage('bugs')" style="padding:8px 12px; border-radius:8px; background:var(--input); color:var(--text); border:1px solid var(--border);"><option value="">Todos los Estados</option><option value="Abierto" ${estadoBugFilter === 'Abierto' ? 'selected' : ''}>Abierto</option><option value="En revisión" ${estadoBugFilter === 'En revisión' ? 'selected' : ''}>En revisión</option></select><button class="btn btn-outline btn-sm" onclick="clearFilters('bugs')">🔄 Limpiar Filtros y Búsqueda</button></div>`;
        html += renderTable('bugs', cols, data, i => {
            const captura = appData.capturas.find(c => c.vinculo === i.id && c.archivos);
            const hasCapture = captura ? 'has-capture-indicator' : '';
            return `<td class="${hasCapture}"><code>${i.id}</code></td><td><b>${i.titulo}</b></td><td><span class="badge ${i.severidad === 'Bloqueante' ? 'badge-danger' : i.severidad === 'Crítica' ? 'badge-warning' : 'badge-info'}">${i.severidad}</span></td><td><code>${i.casoRelacionado || '-'}</code></td><td><span class="badge ${i.estado === 'Abierto' ? 'badge-danger' : 'badge-warning'}">${i.estado}</span></td>`;
        }, true, 'bug');
        return html;
    }

    function renderHistorico() {
        const data = filterByProject(appData.bugs).filter(b => b.estado === 'Solucionado');
        const cols = [{ label: 'ID Bug', field: 'id' }, { label: 'Título', field: 'titulo' }, { label: 'Severidad', field: 'severidad' }, { label: 'Resolución', field: 'estado' }];
        return '<h1 class="page-title">📦 Histórico de Calidad</h1>' + renderTable('historico', cols, data, i => `<td><code>${i.id}</code></td><td><b>${i.titulo}</b></td><td><span class="badge badge-neutral">${i.severidad}</span></td><td><span class="badge badge-success">✅ Solucionado</span></td>`, false);
    }

    function renderEjecuciones() {
        let data = filterByProject(appData.ejecuciones);
        const tieneFallos = document.getElementById('filter_exec_fallos')?.value || '';
        if (tieneFallos === 'si') { data = data.filter(tp => { try { const casos = JSON.parse(tp.casosAsociados || '[]'); return casos.some(c => c.status === 'Failed' || c.status === 'Blocked'); } catch (e) { return false; } }); } 
        else if (tieneFallos === 'no') { data = data.filter(tp => { try { const casos = JSON.parse(tp.casosAsociados || '[]'); return !casos.some(c => c.status === 'Failed' || c.status === 'Blocked'); } catch (e) { return true; } }); }
        let html = `<h1 class="page-title">▶️ Test Execution (Xray View)</h1><p class="page-subtitle">Gestiona ciclos de prueba con matriz de ejecución estilo Xray</p><div style="margin-bottom:20px;"><select id="filter_exec_fallos" onchange="renderPage('ejecuciones')" style="padding:8px 12px; border-radius:8px; background:var(--input); color:var(--text); border:1px solid var(--border);"><option value="">Mostrar todos los Test Plans</option><option value="si" ${tieneFallos === 'si' ? 'selected' : ''}>⚠️ Solo con Fallos/Bloqueos</option><option value="no" ${tieneFallos === 'no' ? 'selected' : ''}>✅ Solo sin Fallos</option></select></div><button class="btn btn-accent" data-action="create" style="margin-bottom:20px;">➕ Nuevo Test Plan</button>`;
        if (data.length === 0) { html += `<div class="empty-state"><div class="empty-state-icon">📭</div><div class="empty-state-title">No hay Test Plans</div><div class="empty-state-desc">Crea un nuevo plan de pruebas para comenzar</div></div>`; return html; }
        html += '<div class="xray-container">';
        data.forEach(tp => {
            let casos = []; try { casos = JSON.parse(tp.casosAsociados || '[]'); } catch (e) { }
            const stats = { Passed: casos.filter(c => c.status === 'Passed').length, Failed: casos.filter(c => c.status === 'Failed').length, 'In Progress': casos.filter(c => c.status === 'In Progress').length, Blocked: casos.filter(c => c.status === 'Blocked').length, Pendiente: casos.filter(c => c.status === 'Pendiente' || !c.status).length };
            const total = casos.length || 1;
            const progressPct = ((stats.Passed + stats.Failed + stats.Blocked) / total) * 100;
            html += `<div class="xray-plan-card"><div class="xray-plan-header"><div><div class="xray-plan-title"><span class="badge badge-info">📝 ${tp.id}</span>${tp.nombreCiclo}${tp.requisito ? `<span class="badge badge-purple" style="margin-left:10px;"> ${tp.requisito}</span>` : ''}</div><div class="xray-plan-meta"><span>📅 ${tp.fecha || 'Sin fecha'}</span><span>👤 ${tp.responsable || 'Sin asignar'}</span><span>📋 ${casos.length} casos</span></div></div><div class="actions-cell" style="gap: 8px; align-items: center;"><button data-action="edit" data-id="${tp.id}" title="Editar">✏️</button><button data-action="delete" data-id="${tp.id}" title="Eliminar">🗑️</button>${tp.estadoCiclo === 'Firmado' ? `<span class="badge badge-success" style="font-size:0.7rem; padding:4px 8px;">✅ Firmado</span><button class="btn btn-sm btn-outline" onclick="generarCertificadoPDF('${tp.id}')" title="Ver/Descargar Certificado">📄</button>` : `<button class="btn btn-sm btn-accent" onclick="abrirModalFirma('${tp.id}')" title="Firmar y Aprobar Release">✍️ Firmar</button>`}</div></div><div class="xray-progress"><div class="xray-progress-bar"><div class="xray-progress-segment passed" style="width:${(stats.Passed / total) * 100}%"></div><div class="xray-progress-segment failed" style="width:${(stats.Failed / total) * 100}%"></div><div class="xray-progress-segment progress" style="width:${(stats['In Progress'] / total) * 100}%"></div><div class="xray-progress-segment blocked" style="width:${(stats.Blocked / total) * 100}%"></div><div class="xray-progress-segment pending" style="width:${(stats.Pendiente / total) * 100}%"></div></div><div style="font-weight:700; color:var(--accent2); min-width:50px;">${Math.round(progressPct)}%</div></div><div class="xray-progress-stats"><div class="xray-stat"><div class="xray-stat-dot" style="background:#10b981;"></div>Pasados: ${stats.Passed}</div><div class="xray-stat"><div class="xray-stat-dot" style="background:#ef4444;"></div>Fallidos: ${stats.Failed}</div><div class="xray-stat"><div class="xray-stat-dot" style="background:#3b82f6;"></div>En progreso: ${stats['In Progress']}</div><div class="xray-stat"><div class="xray-stat-dot" style="background:#f59e0b;"></div>Bloqueados: ${stats.Blocked}</div><div class="xray-stat"><div class="xray-stat-dot" style="background:#94a3b8;"></div>Pendientes: ${stats.Pendiente}</div></div><div class="xray-matrix" style="margin-top:16px;"><div class="xray-matrix-header"><div>Caso de Uso</div><div>Prioridad</div><div>Actor</div><div>Estado</div></div>`;
            if (casos.length === 0) { html += `<div style="padding:30px; text-align:center; color:var(--text2);">Sin casos vinculados</div>`; } 
            else {
                casos.forEach(c => {
                    const caseRef = filterByProject(appData.casos).find(tc => tc.id === c.id);
                    const title = caseRef ? caseRef.titulo : '(Eliminado)';
                    const prioridad = caseRef?.prioridad || '-';
                    const actor = caseRef?.actor || '-';
                    const statusClass = { 'Passed': 'status-passed', 'Failed': 'status-failed', 'In Progress': 'status-progress', 'Blocked': 'status-blocked', 'Pendiente': 'status-pending' }[c.status] || 'status-pending';
                    html += `<div class="xray-matrix-row" onclick="showCaseDetail('${c.id}', '${tp.id}')" style="cursor:pointer;"><div><div class="xray-case-id">${c.id}</div><div class="xray-case-title">${title}</div></div><div class="xray-priority"><span class="badge ${prioridad === 'Crítica' ? 'badge-danger' : prioridad === 'Alta' ? 'badge-warning' : 'badge-info'}">${prioridad}</span></div><div style="color:var(--text2); font-size:0.85rem;">${actor}</div><div onclick="event.stopPropagation();"><select class="status-select ${statusClass}" data-tpid="${tp.id}" data-cid="${c.id}" onchange="updateXrayStatus(this)"><option value="Pendiente" ${c.status === 'Pendiente' || !c.status ? 'selected' : ''}>⏳ Pendiente</option><option value="In Progress" ${c.status === 'In Progress' ? 'selected' : ''}>🔄 In Progress</option><option value="Passed" ${c.status === 'Passed' ? 'selected' : ''}>✅ Passed</option><option value="Failed" ${c.status === 'Failed' ? 'selected' : ''}>❌ Failed</option><option value="Blocked" ${c.status === 'Blocked' ? 'selected' : ''}>🚫 Blocked</option></select></div></div>`;
                });
            }
            html += `</div></div>`;
        });
        html += '</div>';
        return html;
    }

    // ============ FIRMA DIGITAL Y CERTIFICADO PDF ============
    window.abrirModalFirma = function (execId) {
        const exec = appData.ejecuciones.find(e => e.id === execId);
        if (!exec) return;
        const container = document.getElementById('modalContainer');
        const html = `<div class="modal-overlay"><div class="modal" style="max-width: 500px;"><h3>✍️ Firma Digital de Ciclo de Pruebas</h3><p style="color:var(--text2); font-size:0.9rem; margin-bottom:20px;">Al firmar este ciclo, certificas que las pruebas han sido completadas y apruebas el paso a producción (Release) del proyecto.</p><div class="form-group"><label>Nombre del QA Lead (Firmante)</label><input type="text" id="firma_nombre" value="${currentUser.nombre}" readonly style="background:var(--bg2);"></div><div class="form-group"><label>Fecha de Aprobación</label><input type="text" id="firma_fecha" value="${new Date().toLocaleString('es-ES')}" readonly style="background:var(--bg2);"></div><div class="form-group"><label>Comentario / Observaciones de Release</label><textarea id="firma_comentario" rows="3" placeholder="Ej: Aprobado para release v1.2. Sin bugs bloqueantes."></textarea></div><div class="form-group"><label>🔐 Confirmar con Contraseña (Seguridad)</label><input type="password" id="firma_pass" placeholder="Ingresa tu contraseña para firmar"></div><div class="modal-actions"><button class="btn btn-outline" onclick="closeModal()">Cancelar</button><button class="btn btn-accent" onclick="confirmarFirma('${execId}')">✍️ Firmar y Generar PDF</button></div></div></div>`;
        container.innerHTML = html;
    };

    window.confirmarFirma = function (execId) {
        const pass = document.getElementById('firma_pass').value;
        if (pass !== currentUser.password) return toast('Contraseña incorrecta. La firma digital requiere autenticación.', 'error');
        const nombre = document.getElementById('firma_nombre').value;
        const comentario = document.getElementById('firma_comentario').value;
        const exec = appData.ejecuciones.find(e => e.id === execId);
        if (exec) {
            exec.estadoCiclo = 'Firmado'; exec.aprobadoPor = nombre; exec.fechaAprobacion = new Date().toISOString(); exec.comentarioAprobacion = comentario;
            saveData(); closeModal(); renderPage(currentPage); toast('Ciclo firmado correctamente. Generando certificado...', 'success');
            generarCertificadoPDF(execId);
        }
    };

    window.generarCertificadoPDF = function (execId) {
        const exec = appData.ejecuciones.find(e => e.id === execId);
        if (!exec) return toast('Ejecución no encontrada', 'error');
        const proyecto = appData.proyectos.find(p => p.id === exec.proyecto) || { nombre: 'General', codigoCliente: 'N/A' };
        let casos = [];
        try { casos = typeof exec.casosAsociados === 'string' ? JSON.parse(exec.casosAsociados) : (exec.casosAsociados || []); } catch (e) { console.warn("Error al parsear casosAsociados", e); casos = []; }
        const totalCasos = casos.length;
        const pasados = casos.filter(c => c.status === 'Passed').length;
        const fallidos = casos.filter(c => c.status === 'Failed').length;
        const cobertura = totalCasos > 0 ? Math.round((pasados / totalCasos) * 100) : 0;
        const hashCert = btoa(exec.id + (exec.fechaAprobacion || Date.now())).substring(0, 16);
        const htmlContent = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Certificado de Calidad - ${exec.nombreCiclo}</title><style>@page { size: A4; margin: 0; }body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background: #f8fafc; color: #0f172a; margin: 0; padding: 0; }.certificate { width: 210mm; min-height: 297mm; background: #fff; padding: 40px; box-sizing: border-box; position: relative; }.border-inner { border: 2px solid #3b82f6; padding: 30px; height: 100%; box-sizing: border-box; }.header { text-align: center; border-bottom: 3px solid #3b82f6; padding-bottom: 20px; margin-bottom: 30px; }.logo { font-size: 48px; margin-bottom: 10px; }h1 { font-size: 32px; color: #1e40af; margin: 0; text-transform: uppercase; letter-spacing: 2px; }h2 { font-size: 18px; color: #64748b; margin: 5px 0 0 0; font-weight: 400; }.content { margin-top: 40px; line-height: 1.6; font-size: 14px; }.details-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin: 30px 0; }.detail-box { background: #f1f5f9; padding: 15px; border-radius: 8px; border-left: 4px solid #3b82f6; }.detail-label { font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 700; }.detail-value { font-size: 16px; font-weight: 600; color: #0f172a; margin-top: 4px; }.metrics { display: flex; justify-content: space-around; margin: 40px 0; text-align: center; }.metric { padding: 20px; }.metric-value { font-size: 36px; font-weight: 800; color: #10b981; }.metric-value.failed { color: #ef4444; }.metric-label { font-size: 12px; color: #64748b; text-transform: uppercase; margin-top: 5px; }.statement { background: #eff6ff; padding: 20px; border-radius: 8px; margin: 30px 0; font-style: italic; color: #1e40af; text-align: center; font-size: 16px; border: 1px dashed #93c5fd; }.signature-area { margin-top: 60px; display: flex; justify-content: space-between; align-items: flex-end; }.signature-box { text-align: center; width: 40%; }.signature-line { border-top: 2px solid #0f172a; margin-bottom: 10px; }.signature-name { font-weight: 700; font-size: 16px; }.signature-role { font-size: 12px; color: #64748b; }.seal { position: absolute; bottom: 100px; right: 80px; width: 120px; height: 120px; border: 4px double #10b981; border-radius: 50%; display: flex; flex-direction: column; align-items: center; justify-content: center; transform: rotate(-15deg); opacity: 0.8; background: rgba(16, 185, 129, 0.05); }.seal-text { font-size: 14px; font-weight: 800; color: #10b981; text-transform: uppercase; }.seal-date { font-size: 10px; color: #64748b; margin-top: 5px; text-align: center; }.footer { position: absolute; bottom: 30px; left: 40px; right: 40px; text-align: center; font-size: 10px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 10px; }@media print { body { background: #fff; } .no-print { display: none; } }</style></head><body><div class="no-print" style="background: #fef3c7; padding: 15px; text-align: center; font-family: sans-serif; color: #92400e; border-bottom: 2px solid #f59e0b;">🖨️ <strong>Selecciona "Guardar como PDF"</strong> en la ventana de impresión de tu navegador y elige dónde guardarlo.</div><div class="certificate"><div class="border-inner"><div class="header"><div class="logo">🛡️</div><h1>Certificado de Calidad</h1><h2>Quality Assurance / Release Approval</h2></div><div class="content"><p>Por medio del presente documento, se certifica que el ciclo de pruebas de aseguramiento de calidad (QA) correspondiente al proyecto <strong>${proyecto.nombre}</strong> ha sido ejecutado, validado y aprobado según los estándares de calidad establecidos.</p><div class="details-grid"><div class="detail-box"><div class="detail-label">Proyecto</div><div class="detail-value">${proyecto.nombre}</div></div><div class="detail-box"><div class="detail-label">Cliente</div><div class="detail-value">${proyecto.codigoCliente || 'N/A'}</div></div><div class="detail-box"><div class="detail-label">Ciclo de Pruebas</div><div class="detail-value">${exec.nombreCiclo}</div></div><div class="detail-box"><div class="detail-label">Fecha de Emisión</div><div class="detail-value">${exec.fechaAprobacion ? new Date(exec.fechaAprobacion).toLocaleString('es-ES') : 'N/A'}</div></div></div><div class="metrics"><div class="metric"><div class="metric-value">${totalCasos}</div><div class="metric-label">Casos Evaluados</div></div><div class="metric"><div class="metric-value">${pasados}</div><div class="metric-label">Casos Exitosos</div></div><div class="metric"><div class="metric-value failed">${fallidos}</div><div class="metric-label">Casos Fallidos</div></div><div class="metric"><div class="metric-value">${cobertura}%</div><div class="metric-label">Tasa de Éxito</div></div></div><div class="statement">"Se declara que el software ha superado las pruebas de calidad y es apto para su despliegue en el entorno de producción, salvo las observaciones detalladas en el informe de bugs."</div><p><strong>Observaciones de Release:</strong><br>${exec.comentarioAprobacion || 'Sin observaciones adicionales. Aprobación estándar.'}</p><div class="signature-area"><div class="signature-box"><div class="signature-line"></div><div class="signature-name">${exec.aprobadoPor || 'N/A'}</div><div class="signature-role">QA Lead / Release Manager</div></div></div></div><div class="seal"><div class="seal-text">QA<br>Aprobado</div><div class="seal-date">${exec.fechaAprobacion ? new Date(exec.fechaAprobacion).toLocaleDateString('es-ES') : ''}</div></div><div class="footer">Certificado generado electrónicamente por QA Suite PRO · ID Ciclo: ${exec.id} · Hash: ${hashCert}</div></div></div></body></html>`;
        const printWindow = window.open('', '_blank');
        if (!printWindow) return toast('⚠️ El navegador bloqueó la ventana emergente. Por favor, permítela para generar el PDF.', 'warning');
        printWindow.document.write(htmlContent);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => { try { printWindow.print(); } catch (e) { console.error("Error al imprimir:", e); toast('Usa Ctrl+P (o Cmd+P) en la nueva pestaña para guardar el PDF.', 'info'); } }, 500);
    };

    window.showCaseDetail = function (caseId, execId) {
        const caseRef = appData.casos.find(c => c.id === caseId);
        const execRef = appData.ejecuciones.find(e => e.id === execId);
        if (!caseRef) { toast('Caso de uso no encontrado', 'error'); return; }
        const container = document.getElementById('modalContainer');
        const html = `<div class="modal-overlay"><div class="modal" style="max-width:900px;"><div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;"><h3 style="margin:0;">📋 ${caseRef.id} - ${caseRef.titulo}</h3><button class="btn btn-sm btn-outline" onclick="closeCaseDetail()">✕ Cerrar</button></div><div style="background:var(--card-alt); padding:15px; border-radius:8px; margin-bottom:20px;"><label style="font-size:0.85rem; color:var(--text2); display:block; margin-bottom:8px;">📝 DESCRIPCIÓN DEL REQUISITO</label><div style="font-size:0.95rem; line-height:1.6; color:var(--text);">${caseRef.descripcion || '<span style="color:var(--text2);">Sin descripción</span>'}</div></div><div style="display:flex; gap:10px; margin-bottom:20px;"><button class="btn btn-accent" onclick="showCaseTab('flujo')" id="tab-flujo" style="flex:1;">🔄 Flujo de Pasos</button><button class="btn btn-outline" onclick="showCaseTab('bdd')" id="tab-bdd" style="flex:1;">🎯 Criterios BDD</button></div><div id="content-flujo" style="display:block;"><div class="form-group"><label>📋 FLUJO DE PASOS</label><div style="background:var(--card-alt); padding:15px; border-radius:8px; white-space:pre-wrap; line-height:1.6;">${caseRef.flujo || '<span style="color:var(--text2);">Sin flujo definido</span>'}</div></div><div class="form-group"><label>️ INPUT DEL CLIENTE</label><div style="background:var(--card-alt); padding:15px; border-radius:8px; white-space:pre-wrap; line-height:1.6;">${caseRef.inputCliente || '<span style="color:var(--text2);">Sin input definido</span>'}</div></div><div class="form-group"><label>✅ RESULTADO ESPERADO</label><div style="background:var(--card-alt); padding:15px; border-radius:8px; white-space:pre-wrap; line-height:1.6;">${caseRef.resultadoEsperado || '<span style="color:var(--text2);">Sin resultado definido</span>'}</div></div></div><div id="content-bdd" style="display:none;"><div class="form-group"><label>🎯 CRITERIOS DE ACEPTACIÓN (BDD)</label><div style="background:var(--card-alt); padding:15px; border-radius:8px; white-space:pre-wrap; line-height:1.6; font-family:monospace; font-size:0.9rem;">${caseRef.criterios || '<span style="color:var(--text2);">Sin criterios BDD definidos</span>'}</div></div></div>${caseRef.comentarios ? `<div class="form-group" style="margin-top:20px;"><label>💬 COMENTARIOS / RESULTADO OBTENIDO</label><div style="background:var(--card-alt); padding:15px; border-radius:8px; white-space:pre-wrap; line-height:1.6;">${caseRef.comentarios}</div></div>` : ''}<div style="margin-top:20px; padding-top:20px; border-top:1px solid var(--border); display:flex; gap:10px;"><button class="btn btn-outline" onclick="closeCaseDetail()">Cerrar</button></div></div></div>`;
        container.innerHTML = html;
        document.addEventListener('keydown', escCloseModal);
    };

    window.closeCaseDetail = function () { document.getElementById('modalContainer').innerHTML = ''; document.removeEventListener('keydown', escCloseModal); };
    window.showCaseTab = function (tab) {
        const flujoContent = document.getElementById('content-flujo');
        const bddContent = document.getElementById('content-bdd');
        const flujoBtn = document.getElementById('tab-flujo');
        const bddBtn = document.getElementById('tab-bdd');
        if (tab === 'flujo') { flujoContent.style.display = 'block'; bddContent.style.display = 'none'; flujoBtn.className = 'btn btn-accent'; bddBtn.className = 'btn btn-outline'; } 
        else { flujoContent.style.display = 'none'; bddContent.style.display = 'block'; flujoBtn.className = 'btn btn-outline'; bddBtn.className = 'btn btn-accent'; }
    };

    window.updateXrayStatus = function (selectEl) {
        const tpId = selectEl.dataset.tpid;
        const cId = selectEl.dataset.cid;
        const newStatus = selectEl.value;
        const tp = appData.ejecuciones.find(e => e.id === tpId);
        if (tp) {
            try {
                let casos = JSON.parse(tp.casosAsociados);
                const caso = casos.find(c => c.id === cId);
                if (caso) {
                    caso.status = newStatus;
                    tp.casosAsociados = JSON.stringify(casos);
                    selectEl.className = 'status-select status-' + { 'Passed': 'passed', 'Failed': 'failed', 'In Progress': 'progress', 'Blocked': 'blocked', 'Pendiente': 'pending' }[newStatus];
                    saveData(); toast(`Estado actualizado: ${newStatus}`, 'success');
                    if (newStatus === 'Failed' || newStatus === 'Blocked') setTimeout(() => openBugFromExecution(cId, tpId, newStatus), 300);
                    setTimeout(() => renderPage(currentPage), 500);
                }
            } catch (e) { }
        }
    };

    window.openBugFromExecution = function (caseId, execId, status) {
        const caseRef = appData.casos.find(c => c.id === caseId);
        const execRef = appData.ejecuciones.find(e => e.id === execId);
        if (!caseRef) { toast('Caso de uso no encontrado', 'error'); return; }
        const container = document.getElementById('modalContainer');
        const bugId = 'BUG-' + Date.now();
        const html = `<div class="modal-overlay"><div class="modal" style="max-width:700px;"><div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;"><h3 style="margin:0;">🐛 Crear Bug desde Ejecución</h3><button class="btn btn-sm btn-outline" onclick="closeBugModal()">✕ Cerrar</button></div><div style="background:var(--card-alt); padding:15px; border-radius:8px; margin-bottom:20px; border-left:4px solid var(--danger);"><div style="font-size:0.85rem; color:var(--text2); margin-bottom:8px;">ℹ️ Bug generado automáticamente desde:</div><div style="font-size:0.9rem;"><strong>Ejecución:</strong> ${execRef?.id || execId} - ${execRef?.nombreCiclo || ''}<br><strong>Caso:</strong> ${caseRef.id} - ${caseRef.titulo}<br><strong>Estado:</strong> <span style="color:var(--danger); font-weight:600;">${status}</span></div></div><div class="form-group"><label>ID Bug</label><input value="${bugId}" id="f_bug_id" readonly style="background:var(--bg2);"></div><div class="form-group"><label>Título *</label><input value="Fallo en ${caseRef.id}: ${caseRef.titulo}" id="f_bug_titulo"></div><div class="form-group"><label>Caso Relacionado</label><input value="${caseRef.id}" id="f_bug_casoRelacionado" readonly style="background:var(--bg2);"></div><div class="form-group"><label>Severidad</label><select id="f_bug_severidad"><option>Bloqueante</option><option selected>Crítica</option><option>Mayor</option><option>Menor</option></select></div><div class="form-group"><label>Resumen Técnico</label><textarea id="f_bug_resumen" placeholder="Describe brevemente el fallo...">El caso de prueba ${caseRef.id} ha fallado durante la ejecución ${execRef?.id || ''}. Estado: ${status}</textarea></div><div class="form-group"><label>Descripción Detallada</label><textarea id="f_bug_descripcion" rows="5" placeholder="Pasos para reproducir, entorno, etc.">Caso de uso: ${caseRef.id} - ${caseRef.titulo} Ejecución: ${execRef?.id || ''} - ${execRef?.nombreCiclo || ''} Resultado esperado: ${caseRef.resultadoEsperado || 'No definido'} Estado obtenido: ${status}</textarea></div><div class="form-group"><label>Estado</label><select id="f_bug_estado"><option selected>Abierto</option><option>En revisión</option></select></div><div class="modal-actions" style="margin-top:20px;"><button class="btn btn-accent" onclick="saveBugFromExecution('${bugId}', '${caseRef.id}', '${execId}', '${status}')">💾 Guardar Bug</button><button class="btn btn-outline" onclick="closeBugModal()">Cancelar</button></div></div></div>`;
        container.innerHTML = html;
        document.addEventListener('keydown', escCloseModal);
    };

    window.saveBugFromExecution = function (bugId, caseId, execId, status) {
        const titulo = document.getElementById('f_bug_titulo').value.trim();
        const casoRelacionado = document.getElementById('f_bug_casoRelacionado').value;
        const severidad = document.getElementById('f_bug_severidad').value;
        const resumen = document.getElementById('f_bug_resumen').value;
        const descripcion = document.getElementById('f_bug_descripcion').value;
        const estado = document.getElementById('f_bug_estado').value;
        if (!titulo) { toast('El título es obligatorio', 'error'); return; }
        const bug = { id: bugId, proyecto: getActiveProject(), casoRelacionado: casoRelacionado, titulo: titulo, resumen: resumen, descripcion: descripcion, severidad: severidad, estado: estado, comentarios: `Bug generado automáticamente desde ejecución ${execId} con estado ${status}`, fechaCreacion: new Date().toISOString() };
        appData.bugs.push(bug); addTrace('bugs', 'Creación automática', bugId); saveData(); closeBugModal(); renderPage(currentPage); toast('Bug creado correctamente', 'success'); addNotification(' Bug creado', `Bug ${bugId} generado desde ejecución fallida`);
    };

    window.closeBugModal = function () { document.getElementById('modalContainer').innerHTML = ''; document.removeEventListener('keydown', escCloseModal); };

    function renderInformes() {
        const ejecuciones = filterByProject(appData.ejecuciones);
        const casos = filterByProject(appData.casos);
        const bugs = filterByProject(appData.bugs);
        const apis = filterByProject(appData.apis);
        let html = `<h1 class="page-title"> Informes y Exportación</h1><p class="page-subtitle">Genera informes profesionales y exporta datos en diferentes formatos</p><div class="chart-grid"><div class="chart-card"><div class="chart-title">📊 Informe Ejecutivo Completo</div><p style="color:var(--text2); margin-bottom:16px; font-size:0.9rem;">Informe completo en Word con todos los módulos: casos, bugs, ejecuciones y APIs.</p><button class="btn btn-accent" onclick="downloadDocx()">📥 Descargar Informe .docx</button></div><div class="chart-card"><div class="chart-title">📋 Exportar Casos de Prueba</div><p style="color:var(--text2); margin-bottom:16px; font-size:0.9rem;">Exporta todos los casos de uso del proyecto activo a formato Excel (.xlsx).</p><button class="btn btn-accent" onclick="exportCasosToExcel()"> Exportar Casos .xlsx</button></div><div class="chart-card"><div class="chart-title"> Informe Ejecuciones y Bugs</div><p style="color:var(--text2); margin-bottom:16px; font-size:0.9rem;">Informe detallado de ciclos de prueba y defectos detectados en formato Word.</p><button class="btn btn-accent" onclick="downloadEjecucionesBugsDoc()">📥 Descargar Informe .doc</button></div><div class="chart-card"><div class="chart-title">🔌 Informe Gestión APIs</div><p style="color:var(--text2); margin-bottom:16px; font-size:0.9rem;">Informe completo de endpoints, métodos y estados de las APIs evaluadas.</p><button class="btn btn-accent" onclick="downloadApisDoc()">📥 Descargar Informe .doc</button></div><div class="chart-card" style="grid-column: span 2;"><div class="chart-title"> Comparativa de Ejecuciones</div><p style="color:var(--text2); margin-bottom:16px; font-size:0.9rem;">Compara dos ciclos de prueba para ver diferencias en resultados y cobertura.</p><div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;"><select id="compExec1" style="flex:1; min-width:200px; padding:10px; border-radius:8px; border:1px solid var(--border); background:var(--input); color:var(--text);"><option value="">Seleccionar Ejecución 1...</option>${ejecuciones.map(e => `<option value="${e.id}">${e.id} - ${e.nombreCiclo}</option>`).join('')}</select><span style="font-size:1.2rem; font-weight:bold;">VS</span><select id="compExec2" style="flex:1; min-width:200px; padding:10px; border-radius:8px; border:1px solid var(--border); background:var(--input); color:var(--text);"><option value="">Seleccionar Ejecución 2...</option>${ejecuciones.map(e => `<option value="${e.id}">${e.id} - ${e.nombreCiclo}</option>`).join('')}</select><button class="btn btn-accent" onclick="compararEjecuciones()">🔍 Comparar</button></div><div id="comparativaResult" style="margin-top:20px;"></div></div></div><div class="chart-grid" style="margin-top:20px;"><div class="chart-card"><div class="chart-title">📋 Contenido del Informe Ejecutivo</div><ul style="list-style:none; display:flex; flex-direction:column; gap:8px;"><li style="padding:8px 12px; background:var(--card-alt); border-radius:8px; font-size:0.85rem;">✅ Portada profesional</li><li style="padding:8px 12px; background:var(--card-alt); border-radius:8px; font-size:0.85rem;">✅ Resumen ejecutivo</li><li style="padding:8px 12px; background:var(--card-alt); border-radius:8px; font-size:0.85rem;">✅ Métricas y KPIs</li><li style="padding:8px 12px; background:var(--card-alt); border-radius:8px; font-size:0.85rem;">✅ Detalle de casos de uso</li><li style="padding:8px 12px; background:var(--card-alt); border-radius:8px; font-size:0.85rem;">✅ Registro de defectos</li><li style="padding:8px 12px; background:var(--card-alt); border-radius:8px; font-size:0.85rem;">✅ Ejecuciones de pruebas</li><li style="padding:8px 12px; background:var(--card-alt); border-radius:8px; font-size:0.85rem;">✅ Gestión de APIs</li><li style="padding:8px 12px; background:var(--card-alt); border-radius:8px; font-size:0.85rem;">✅ Conclusiones</li></ul></div></div>`;
        return html;
    }

    function renderAjustes() {
        return `<h1 class="page-title">⚙️ Ajustes</h1><div class="chart-grid"><div class="chart-card"><div class="chart-title">💾 Datos</div><div style="display:flex; flex-direction:column; gap:10px;"><button class="btn btn-outline" data-action="export">Exportar JSON</button><button class="btn btn-outline" onclick="document.getElementById('importFileInput').click()">📥 Importar JSON</button><input type="file" id="importFileInput" accept=".json" hidden onchange="importData(this)"><button class="btn btn-danger" data-action="vaciar">⚠️ Vaciar Sistema</button></div></div><div class="chart-card"><div class="chart-title">⌨️ Atajos de Teclado</div><div style="display:flex; flex-direction:column; gap:8px; font-size:0.85rem;"><div style="display:flex; justify-content:space-between;"> <span>Búsqueda global</span> <kbd>Ctrl + K</kbd> </div><div style="display:flex; justify-content:space-between;"> <span>Cerrar modal</span> <kbd>Esc</kbd> </div><div style="display:flex; justify-content:space-between;"> <span>Cambiar tema</span> <kbd>Ctrl + T</kbd> </div></div></div></div><div class="help-cards" style="margin-top:20px;"></div>`;
    }

    // ============ INFORME DOCX PROFESIONAL ============
    window.downloadDocx = function () {
        const proyecto = getActiveProject() ? appData.proyectos.find(p => p.id === getActiveProject()) : null;
        const casos = filterByProject(appData.casos);
        const bugs = filterByProject(appData.bugs);
        const ejecuciones = filterByProject(appData.ejecuciones);
        const apis = filterByProject(appData.apis);
        const casosPasados = casos.filter(c => c.estado === 'Pasado').length;
        const casosFallidos = casos.filter(c => c.estado === 'Fallido').length;
        const cobertura = casos.length > 0 ? Math.round((casosPasados / casos.length) * 100) : 0;
        const bugsAbiertos = bugs.filter(b => b.estado !== 'Solucionado').length;
        const bugsSolucionados = bugs.filter(b => b.estado === 'Solucionado').length;
        const apisCorrectas = apis.filter(a => a.estado === 'Correcta').length;
        const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="UTF-8"><title>Informe QA</title><style>@page { size: A4; margin: 2cm; }body { font-family: 'Calibri', Arial, sans-serif; color: #1e293b; line-height: 1.6; }.cover { text-align: center; padding: 80px 40px; border-bottom: 4px solid #3b82f6; margin-bottom: 40px; }.cover-logo { font-size: 72px; margin-bottom: 20px; }.cover h1 { font-size: 36px; color: #0f172a; margin: 10px 0; font-weight: 700; }.cover h2 { font-size: 20px; color: #64748b; font-weight: 400; margin: 8px 0; }.cover-meta { margin-top: 40px; font-size: 14px; color: #64748b; }.cover-meta div { margin: 6px 0; }h1.section { color: #0f172a; font-size: 24px; border-bottom: 2px solid #3b82f6; padding-bottom: 8px; margin-top: 40px; }h2 { color: #1e40af; font-size: 18px; margin-top: 24px; }p { font-size: 12px; margin: 8px 0; }table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 11px; }th { background: #1e293b; color: white; padding: 10px 8px; text-align: left; font-weight: 600; }td { border: 1px solid #e2e8f0; padding: 8px; }tr:nth-child(even) td { background: #f8fafc; }.badge { padding: 3px 8px; border-radius: 10px; font-size: 10px; font-weight: 600; display: inline-block; }.passed { background: #d1fae5; color: #065f46; }.failed { background: #fee2e2; color: #991b1b; }.pendiente { background: #fef3c7; color: #92400e; }.abierto { background: #fee2e2; color: #991b1b; }.solucionado { background: #d1fae5; color: #065f46; }.kpi-box { display: inline-block; padding: 16px 24px; margin: 8px; background: #f1f5f9; border-radius: 8px; border-left: 4px solid #3b82f6; min-width: 140px; }.kpi-value { font-size: 28px; font-weight: 700; color: #0f172a; }.kpi-label { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }.summary-grid { display: flex; flex-wrap: wrap; gap: 10px; margin: 20px 0; }.conclusion { background: #eff6ff; border-left: 4px solid #3b82f6; padding: 16px; margin: 20px 0; border-radius: 4px; }.footer { margin-top: 60px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 10px; color: #94a3b8; text-align: center; }</style></head><body><div class="cover"><div class="cover-logo">🛡️</div><h1>Informe de Aseguramiento de Calidad</h1><h2>Quality Assurance / Quality Control</h2><div class="cover-meta"><div><strong>Proyecto:</strong> ${proyecto?.nombre || 'Todos los proyectos'}</div><div><strong>Cliente:</strong> ${proyecto?.codigoCliente || 'N/A'}</div><div><strong>Responsable QA:</strong> ${proyecto?.responsable || currentUser?.nombre || 'N/A'}</div><div><strong>Fecha de emisión:</strong> ${new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })}</div><div><strong>Versión:</strong> 1.0</div></div></div><h1 class="section">1. Resumen Ejecutivo</h1><p>El presente documento recoge los resultados de las actividades de aseguramiento de calidad realizadas sobre el proyecto <strong>${proyecto?.nombre || 'en curso'}</strong>. Se detallan los casos de prueba ejecutados, los defectos identificados, la validación de APIs y el estado general de calidad del producto.</p><div class="summary-grid"><div class="kpi-box"><div class="kpi-value">${casos.length}</div><div class="kpi-label">Casos Totales</div></div><div class="kpi-box"><div class="kpi-value">${cobertura}%</div><div class="kpi-label">Cobertura</div></div><div class="kpi-box"><div class="kpi-value">${bugs.length}</div><div class="kpi-label">Defectos</div></div><div class="kpi-box"><div class="kpi-value">${apis.length}</div><div class="kpi-label">APIs Evaluadas</div></div></div><h1 class="section">2. Métricas de Calidad</h1><table><tr><th>Indicador</th><th>Valor</th><th>Estado</th></tr><tr><td>Cobertura de pruebas</td><td>${cobertura}%</td><td><span class="badge ${cobertura >= 80 ? 'passed' : cobertura >= 50 ? 'pendiente' : 'failed'}">${cobertura >= 80 ? 'Óptimo' : cobertura >= 50 ? 'Mejorable' : 'Crítico'}</span></td></tr><tr><td>Casos ejecutados</td><td>${casosPasados + casosFallidos} / ${casos.length}</td><td>-</td></tr><tr><td>Tasa de defectos</td><td>${casos.length > 0 ? Math.round((bugs.length / casos.length) * 100) : 0}%</td><td>-</td></tr><tr><td>Bugs abiertos</td><td>${bugsAbiertos}</td><td><span class="badge ${bugsAbiertos === 0 ? 'passed' : 'failed'}">${bugsAbiertos === 0 ? 'Sin incidencias' : 'Requiere atención'}</span></td></tr><tr><td>APIs correctas</td><td>${apisCorrectas} / ${apis.length}</td><td><span class="badge ${apis.length > 0 && apisCorrectas === apis.length ? 'passed' : apis.length === 0 ? 'pendiente' : 'failed'}">${apis.length > 0 && apisCorrectas === apis.length ? '100% OK' : apis.length === 0 ? 'N/A' : 'Errores detectados'}</span></td></tr></table><h1 class="section">3. Casos de Uso</h1><p>Se han definido <strong>${casos.length}</strong> casos de prueba, de los cuales <strong>${casosPasados}</strong> han sido ejecutados satisfactoriamente y <strong>${casosFallidos}</strong> han presentado fallos.</p><table><tr><th>ID</th><th>Título</th><th>Prioridad</th><th>Actor</th><th>Estado</th></tr>${casos.map(c => `<tr><td>${c.id}</td><td>${c.titulo || ''}</td><td>${c.prioridad || 'Media'}</td><td>${c.actor || '-'}</td><td><span class="badge ${c.estado === 'Pasado' ? 'passed' : c.estado === 'Fallido' ? 'failed' : 'pendiente'}">${c.estado || 'Pendiente'}</span></td></tr>`).join('')}</table><h1 class="section">4. Defectos Detectados</h1><p>Se han registrado <strong>${bugs.length}</strong> defectos durante las pruebas. De estos, <strong>${bugsSolucionados}</strong> han sido resueltos y <strong>${bugsAbiertos}</strong> permanecen abiertos.</p><table><tr><th>ID</th><th>Título</th><th>Severidad</th><th>Caso</th><th>Estado</th></tr>${bugs.map(b => `<tr><td>${b.id}</td><td>${b.titulo || ''}</td><td>${b.severidad || 'Menor'}</td><td>${b.casoRelacionado || '-'}</td><td><span class="badge ${b.estado === 'Solucionado' ? 'solucionado' : 'abierto'}">${b.estado || 'Abierto'}</span></td></tr>`).join('')}</table><h1 class="section">5. Ejecuciones de Pruebas</h1><p>Se han realizado <strong>${ejecuciones.length}</strong> ciclos de ejecución de pruebas.</p><table><tr><th>ID</th><th>Ciclo</th><th>Fecha</th><th>Responsable</th><th>Casos</th></tr>${ejecuciones.map(e => { let casosCount = 0; try { casosCount = JSON.parse(e.casosAsociados || '[]').length; } catch (err) { } return `<tr><td>${e.id}</td><td>${e.nombreCiclo || ''}</td><td>${e.fecha || '-'}</td><td>${e.responsable || '-'}</td><td>${casosCount}</td></tr>`; }).join('')}</table><h1 class="section">6. Gestión de APIs</h1><p>Se han validado <strong>${apis.length}</strong> endpoints/APIs, encontrando <strong>${apisCorrectas}</strong> con respuesta correcta.</p><table><tr><th>ID API</th><th>Nombre</th><th>Método</th><th>Endpoint</th><th>Estado</th></tr>${apis.map(a => `<tr><td>${a.id}</td><td>${a.nombre || ''}</td><td><strong>${a.metodo || 'GET'}</strong></td><td>${a.endpoint || '-'}</td><td><span class="badge ${a.estado === 'Correcta' ? 'passed' : a.estado === 'Error' ? 'failed' : 'pendiente'}">${a.estado || 'Pendiente'}</span></td></tr>`).join('')}</table><h1 class="section">7. Conclusiones y Recomendaciones</h1><div class="conclusion"><p><strong>Estado general de calidad:</strong> ${cobertura >= 80 && bugsAbiertos === 0 ? '✅ <strong>Óptimo</strong> - El producto cumple con los estándares de calidad establecidos.' : cobertura >= 50 ? '⚠️ <strong>Mejorable</strong> - Se recomienda incrementar la cobertura de pruebas y resolver los defectos pendientes.' : '🚨 <strong>Crítico</strong> - Se requiere atención inmediata. La cobertura de pruebas es insuficiente y hay defectos abiertos.'}</p><p style="margin-top:12px;"><strong>Recomendaciones:</strong></p><ul style="margin-left:20px;">${bugsAbiertos > 0 ? '<li>Priorizar la resolución de los ' + bugsAbiertos + ' defectos abiertos.</li>' : ''}${apis.length > 0 && apisCorrectas < apis.length ? `<li>Revisar los ${apis.length - apisCorrectas} endpoints que han reportado error o siguen pendientes de validación.</li>` : ''}${cobertura < 80 ? '<li>Incrementar la cobertura de pruebas hasta alcanzar al menos el 80%.</li>' : ''}<li>Continuar con el seguimiento diario de las métricas de calidad.</li><li>Documentar todas las evidencias de prueba para auditorías futuras.</li></ul></div><div class="footer"><p>Informe generado por QA Suite PRO · ${new Date().toLocaleString('es-ES')}</p><p>Este documento es confidencial y para uso interno del equipo de calidad.</p></div></body></html>`;
        const blob = new Blob(['\ufeff' + html], { type: 'application/msword' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `Informe_QA_${proyecto?.nombre || 'General'}_${new Date().toISOString().split('T')[0]}.doc`;
        a.click();
        URL.revokeObjectURL(a.href);
        toast('📄 Informe profesional descargado', 'success');
        addNotification(' Informe generado', 'Se ha descargado un nuevo informe de calidad');
    };

    function exportData() {
        const blob = new Blob([JSON.stringify(appData, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `backup_qa_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        toast('📤 Datos exportados', 'success');
    }

    window.importData = function (input) {
        const file = input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = e => {
            try {
                const data = JSON.parse(e.target.result);
                if (!data.usuarios && !data.casos && !data.proyectos) return toast('Archivo JSON inválido: no contiene datos de QA Suite', 'error');
                if (confirm('¿Sobrescribir datos actuales en FIREBASE?\n\nEsta acción no se puede deshacer.')) {
                    appData = { usuarios: data.usuarios || appData.usuarios || [], proyectos: data.proyectos || appData.proyectos || [], objetivos: data.objetivos || appData.objetivos || [], casos: data.casos || appData.casos || [], bugs: data.bugs || appData.bugs || [], ejecuciones: data.ejecuciones || appData.ejecuciones || [], capturas: data.capturas || appData.capturas || [], registroDiario: data.registroDiario || appData.registroDiario || [], apis: data.apis || appData.apis || [], mejoras: data.mejoras || appData.mejoras || [], trazabilidad: data.trazabilidad || appData.trazabilidad || [], comentarios: data.comentarios || appData.comentarios || [], notificaciones: data.notificaciones || [], configuracion: data.configuracion || appData.configuracion || { theme: 'dark', activeProject: '' } };
                    notifications = appData.notificaciones || [];
                    saveData().then(() => { populateProjectSelector(); navigateTo('dashboard'); toast('📥 Datos importados correctamente', 'success'); updateNotificationBadge(); }).catch(err => { console.error('Error al guardar datos importados:', err); toast('Error al guardar en Firebase', 'error'); });
                }
            } catch (ex) { console.error('Error al procesar archivo:', ex); toast('Archivo JSON inválido o corrupto', 'error'); }
        };
        reader.onerror = () => { toast('Error al leer el archivo', 'error'); };
        reader.readAsText(file);
        input.value = '';
    };

    // ============ KEYBOARD SHORTCUTS ============
    document.addEventListener('keydown', (e) => {
        // Ctrl + K: Command Palette
        if (e.ctrlKey && (e.key === 'k' || e.key === 'K')) {
            e.preventDefault();
            e.stopPropagation();
            if (typeof toggleCommandPalette === 'function') {
                toggleCommandPalette();
            }
            return;
        }
        
        // Ctrl + T: Cambiar tema (DEBE ir ANTES que otros handlers)
        if (e.ctrlKey && (e.key === 'q' || e.key === 'Q')) {
            e.preventDefault();
            e.stopPropagation();
            if (typeof toggleTheme === 'function') {
                toggleTheme();
                console.log('🎨 Tema cambiado con Ctrl+K');
            } else {
                console.error('❌ toggleTheme no está definido');
            }
            return;
        }
        
        // Command Palette navigation
        if (commandPaletteOpen) {
            const input = document.getElementById('commandPaletteInput');
            if (e.key === 'Escape') {
                e.preventDefault();
                closeCommandPalette();
            }
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                navigateCommandPalette('down');
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                navigateCommandPalette('up');
            }
            if (e.key === 'Enter' && input) {
                e.preventDefault();
                const selectedItem = document.querySelector('.command-palette-item.selected');
                if (selectedItem) selectCommandPaletteItem(selectedItem);
            }
        }
    });

    window.addEventListener('click', function (event) {
        if (event.target.classList.contains('modal-overlay')) event.stopPropagation();
    });

    window.previsualizarCapturaQA = function (event, containerId) {
        const file = event.target.files[0];
        const container = document.getElementById(containerId);
        const hiddenInput = document.getElementById('f_archivos_base64');
        if (file && file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = function (e) {
                const base64Data = e.target.result;
                container.innerHTML = `<img src="${base64Data}" style="max-width: 100%; max-height: 180px; border-radius: 8px; border: 1px solid var(--border); margin-top: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.3);">`;
                if (hiddenInput) hiddenInput.value = base64Data;
            };
            reader.readAsDataURL(file);
        }
    };

    // ============ SISTEMA DE COMENTARIOS ============
    window.addComment = (entityType, entityId) => {
        const input = document.getElementById(`commentInput_${entityType}_${entityId}`);
        const text = input.value.trim();
        if (!text) return toast('El comentario no puede estar vacío', 'warning');
        const newComment = { id: Date.now(), entityType: entityType, entityId: entityId, texto: text, creadoPor: currentUser.id, nombreAutor: currentUser.nombre, fecha: new Date().toISOString() };
        appData.comentarios.push(newComment); saveData(); input.value = ''; renderCommentsSection(entityType, entityId); toast('Comentario añadido', 'success');
    };

    window.renderCommentsSection = (entityType, entityId) => {
        const container = document.getElementById(`commentsContainer_${entityType}_${entityId}`);
        if (!container) return;
        const comentarios = appData.comentarios.filter(c => c.entityType === entityType && c.entityId == entityId);
        let html = `<div class="comments-list" style="margin-top: 15px; max-height: 250px; overflow-y: auto; padding-right: 5px;">`;
        if (comentarios.length === 0) { html += `<p style="color: var(--text2); font-size: 0.9rem; text-align: center; padding: 15px 0;">No hay comentarios aún.</p>`; } 
        else {
            comentarios.forEach(c => {
                const isOwner = currentUser.rol === 'Admin' || c.creadoPor == currentUser.id;
                const dateStr = new Date(c.fecha).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
                html += `<div class="comment-item" style="background: var(--bg); padding: 12px; border-radius: 8px; margin-bottom: 10px; border: 1px solid var(--border);"><div style="display: flex; justify-content: space-between; margin-bottom: 8px; align-items: center;"><strong style="font-size: 0.85rem; color: var(--accent);"><span style="font-size: 1rem;">💬</span> ${c.nombreAutor}</strong><span style="font-size: 0.75rem; color: var(--text2);">${dateStr}</span></div><div style="font-size: 0.9rem; color: var(--text); line-height: 1.4;">${c.texto}</div>${isOwner ? `<button onclick="deleteComment(${c.id}, '${entityType}', '${entityId}')" style="background: none; border: none; color: var(--danger); font-size: 0.8rem; cursor: pointer; margin-top: 8px; padding: 0; opacity: 0.8;">Eliminar</button>` : ''}</div>`;
            });
        }
        html += `</div><div class="comment-input-area" style="display: flex; gap: 10px; margin-top: 15px; border-top: 1px solid var(--border); padding-top: 15px;"><input type="text" id="commentInput_${entityType}_${entityId}" placeholder="Escribe un comentario..." class="form-control" style="flex: 1; padding: 10px 15px; border-radius: 8px; border: 1px solid var(--border); background: var(--input-bg); color: var(--text);" onkeypress="if(event.key==='Enter') addComment('${entityType}', '${entityId}')"><button class="btn btn-outline" onclick="addComment('${entityType}', '${entityId}')">Enviar</button></div>`;
        container.innerHTML = html;
    };

    window.deleteComment = (id, entityType, entityId) => {
        showConfirmModal('¿Estás seguro de eliminar este comentario?', () => { appData.comentarios = appData.comentarios.filter(c => String(c.id) !== String(id)); saveData(); renderCommentsSection(entityType, entityId); toast('Comentario eliminado', 'success'); });
    };

    window.openCommandPalette = function () {
        const palette = document.getElementById('commandPalette');
        const input = document.getElementById('commandPaletteInput');
        if (palette) { palette.style.display = 'flex'; input.value = ''; input.focus(); commandPaletteOpen = true; commandPaletteSelectedIndex = 0; commandPaletteResults = []; renderCommandPaletteResults([]); }
    };

    window.closeCommandPalette = function () {
        const palette = document.getElementById('commandPalette');
        if (palette) { palette.style.display = 'none'; commandPaletteOpen = false; commandPaletteResults = []; }
    };

    window.toggleCommandPalette = function () { if (commandPaletteOpen) closeCommandPalette(); else openCommandPalette(); };

    function searchGlobal(query) {
        if (!query || query.length < 2) return [];
        const results = [];
        const q = query.toLowerCase();
        const ap = getActiveProject();
        appData.casos.forEach(caso => { if (!ap || caso.proyecto === ap) { if (caso.id.toLowerCase().includes(q) || (caso.titulo && caso.titulo.toLowerCase().includes(q)) || (caso.actor && caso.actor.toLowerCase().includes(q))) { results.push({ type: 'casos', icon: '📋', title: caso.titulo || caso.id, subtitle: `${caso.id} ${caso.actor ? '· ' + caso.actor : ''}`, badge: caso.prioridad || 'Media', badgeClass: caso.prioridad === 'Crítica' ? 'badge-danger' : caso.prioridad === 'Alta' ? 'badge-warning' : 'badge-info', id: caso.id, page: 'casos' }); } } });
        appData.bugs.forEach(bug => { if (!ap || bug.proyecto === ap) { if (bug.id.toLowerCase().includes(q) || (bug.titulo && bug.titulo.toLowerCase().includes(q)) || (bug.casoRelacionado && bug.casoRelacionado.toLowerCase().includes(q))) { results.push({ type: 'bugs', icon: '🐛', title: bug.titulo || bug.id, subtitle: `${bug.id} · ${bug.severidad || 'Menor'}`, badge: bug.estado || 'Abierto', badgeClass: bug.estado === 'Solucionado' ? 'badge-success' : 'badge-danger', id: bug.id, page: 'bugs' }); } } });
        appData.ejecuciones.forEach(exec => { if (!ap || exec.proyecto === ap) { if (exec.id.toLowerCase().includes(q) || (exec.nombreCiclo && exec.nombreCiclo.toLowerCase().includes(q))) { let casosCount = 0; try { casosCount = JSON.parse(exec.casosAsociados || '[]').length; } catch (e) { } results.push({ type: 'ejecuciones', icon: '▶️', title: exec.nombreCiclo || exec.id, subtitle: `${exec.id} · ${casosCount} casos`, badge: exec.fecha || '', badgeClass: 'badge-neutral', id: exec.id, page: 'ejecuciones' }); } } });
        appData.apis.forEach(api => { if (!ap || api.proyecto === ap) { if (api.id.toLowerCase().includes(q) || (api.nombre && api.nombre.toLowerCase().includes(q)) || (api.endpoint && api.endpoint.toLowerCase().includes(q))) { results.push({ type: 'apis', icon: '🔌', title: api.nombre || api.id, subtitle: `${api.id} · ${api.metodo || 'GET'} ${api.endpoint || ''}`, badge: api.estado || 'Pendiente', badgeClass: api.estado === 'Correcta' ? 'badge-success' : api.estado === 'Error' ? 'badge-danger' : 'badge-warning', id: api.id, page: 'apis' }); } } });
        appData.proyectos.forEach(proj => { if (proj.id.toLowerCase().includes(q) || (proj.nombre && proj.nombre.toLowerCase().includes(q)) || (proj.codigoCliente && proj.codigoCliente.toLowerCase().includes(q))) { results.push({ type: 'proyectos', icon: '', title: proj.nombre || proj.id, subtitle: `${proj.id} ${proj.codigoCliente ? '· ' + proj.codigoCliente : ''}`, badge: proj.estado || 'Planificado', badgeClass: proj.estado === 'Activo' ? 'badge-success' : proj.estado === 'Completado' ? 'badge-info' : 'badge-warning', id: proj.id, page: 'proyectos' }); } });
        appData.objetivos.forEach(obj => { if (!ap || obj.proyecto === ap) { if (obj.id.toLowerCase().includes(q) || (obj.objetivo && obj.objetivo.toLowerCase().includes(q))) { results.push({ type: 'objetivos', icon: '🎯', title: obj.objetivo || obj.id, subtitle: `${obj.id} · ${obj.responsable || 'Sin responsable'}`, badge: obj.estado || 'Pendiente', badgeClass: obj.estado === 'Finalizado' ? 'badge-success' : obj.estado === 'En progreso' ? 'badge-info' : 'badge-warning', id: obj.id, page: 'objetivos' }); } } });
        return results.slice(0, 50);
    }

    function renderCommandPaletteResults(results) {
        const container = document.getElementById('commandPaletteResults');
        if (!container) return;
        if (results.length === 0) { container.innerHTML = `<div class="command-palette-empty"><div class="command-palette-empty-icon">🔍</div><div>No se encontraron resultados</div></div>`; return; }
        const grouped = {};
        results.forEach(r => { if (!grouped[r.type]) grouped[r.type] = []; grouped[r.type].push(r); });
        let html = '';
        const typeLabels = { 'casos': { icon: '📋', label: 'Casos de Uso' }, 'bugs': { icon: '🐛', label: 'Bugs / Defectos' }, 'ejecuciones': { icon: '▶️', label: 'Ejecuciones' }, 'apis': { icon: '🔌', label: 'APIs' }, 'proyectos': { icon: '📁', label: 'Proyectos' }, 'objetivos': { icon: '🎯', label: 'Objetivos' } };
        let globalIndex = 0;
        Object.keys(grouped).forEach(type => {
            const label = typeLabels[type] || { icon: '📄', label: type };
            html += `<div class="command-palette-category"><div class="command-palette-category-title"><span>${label.icon}</span><span>${label.label}</span><span style="margin-left: auto; opacity: 0.6;">${grouped[type].length}</span></div>`;
            grouped[type].forEach(item => {
                const isSelected = globalIndex === commandPaletteSelectedIndex;
                html += `<div class="command-palette-item ${isSelected ? 'selected' : ''}" data-index="${globalIndex}" data-id="${item.id}" data-page="${item.page}"><div class="command-palette-item-icon cp-${item.type}">${item.icon}</div><div class="command-palette-item-content"><div class="command-palette-item-title">${highlightText(item.title, document.getElementById('commandPaletteInput').value)}</div><div class="command-palette-item-subtitle">${highlightText(item.subtitle, document.getElementById('commandPaletteInput').value)}</div></div><span class="command-palette-item-badge ${item.badgeClass || 'badge-neutral'}">${item.badge}</span></div>`;
                globalIndex++;
            });
            html += '</div>';
        });
        container.innerHTML = html;
        container.querySelectorAll('.command-palette-item').forEach(item => { item.addEventListener('click', () => { selectCommandPaletteItem(item); }); });
    }

    function highlightText(text, query) {
        if (!query || query.length < 2) return text;
        const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        return text.replace(regex, '<mark style="background: rgba(59, 130, 246, 0.3); color: inherit; padding: 0 2px; border-radius: 2px;">$1</mark>');
    }

    function selectCommandPaletteItem(item) {
        const id = item.dataset.id;
        const page = item.dataset.page;
        closeCommandPalette();
        if (page && id) { navigateTo(page); setTimeout(() => { openModal(page, id); }, 300); }
    }

    function navigateCommandPalette(direction) {
        const items = document.querySelectorAll('.command-palette-item');
        if (items.length === 0) return;
        items.forEach(item => item.classList.remove('selected'));
        if (direction === 'up') commandPaletteSelectedIndex = (commandPaletteSelectedIndex - 1 + items.length) % items.length;
        else commandPaletteSelectedIndex = (commandPaletteSelectedIndex + 1) % items.length;
        const selectedItem = items[commandPaletteSelectedIndex];
        if (selectedItem) { selectedItem.classList.add('selected'); selectedItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
    }

    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'k') { e.preventDefault(); toggleCommandPalette(); }
        if (commandPaletteOpen) {
            const input = document.getElementById('commandPaletteInput');
            if (e.key === 'Escape') { e.preventDefault(); closeCommandPalette(); }
            if (e.key === 'ArrowDown') { e.preventDefault(); navigateCommandPalette('down'); }
            if (e.key === 'ArrowUp') { e.preventDefault(); navigateCommandPalette('up'); }
            if (e.key === 'Enter' && input) { e.preventDefault(); const selectedItem = document.querySelector('.command-palette-item.selected'); if (selectedItem) selectCommandPaletteItem(selectedItem); }
            if (input && e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) { setTimeout(() => { const query = input.value; commandPaletteResults = searchGlobal(query); commandPaletteSelectedIndex = 0; renderCommandPaletteResults(commandPaletteResults); }, 10); }
        }
    });

    document.addEventListener('input', (e) => {
        if (commandPaletteOpen && e.target.id === 'commandPaletteInput') { const query = e.target.value; commandPaletteResults = searchGlobal(query); commandPaletteSelectedIndex = 0; renderCommandPaletteResults(commandPaletteResults); }
    });

    // console.log('XLSX cargado:', typeof XLSX);
    // console.log('Versión:', XLSX ? XLSX.version : 'No disponible');

    // ============ EXPORTAR CASOS A EXCEL ============
    window.exportCasosToExcel = function () {
        if (typeof XLSX === 'undefined') return toast('❌ Error: Librería Excel no cargada. Recarga la página.', 'error');
        let casos = filterByProject(appData.casos);
        const ap = getActiveProject();
        const proyecto = ap ? appData.proyectos.find(p => p.id === ap) : null;
        if (!casos || casos.length === 0) return toast(ap ? '⚠️ No hay casos para el proyecto seleccionado' : '⚠️ Selecciona un proyecto activo o no hay casos registrados', 'warning');
        // console.log(`📦 Preparando exportación de ${casos.length} casos...`);
        const data = casos.map(c => ({ 'ID': c.id || '', 'Requisito': c.requisito || '', 'Título': c.titulo || '', 'Prioridad': c.prioridad || 'Media', 'Actor': c.actor || '', 'Descripción': c.descripcion || '', 'Flujo de Pasos': c.flujo || '', 'Input Cliente': c.inputCliente || '', 'Criterios BDD': c.criterios || '', 'Resultado Esperado': c.resultadoEsperado || '', 'Estado': c.estado || 'Pendiente', 'Proyecto': c.proyecto || '', 'Creado Por': c.creadoPor ? (appData.usuarios.find(u => u.id === c.creadoPor)?.nombre || 'Sistema') : 'Sistema' }));
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(data);
        ws['!cols'] = [{ wch: 15 }, { wch: 15 }, { wch: 40 }, { wch: 12 }, { wch: 20 }, { wch: 50 }, { wch: 50 }, { wch: 30 }, { wch: 50 }, { wch: 50 }, { wch: 15 }, { wch: 20 }, { wch: 20 }];
        XLSX.utils.book_append_sheet(wb, ws, 'Casos de Prueba');
        const fileName = `Casos_${proyecto?.nombre || 'General'}_${new Date().toISOString().split('T')[0]}.xlsx`;
        XLSX.writeFile(wb, fileName);
        toast(`📥 ${data.length} casos exportados correctamente`, 'success');
        addNotification('📊 Exportación', `Se exportaron ${data.length} casos a Excel`);
    };

    // ============ INFORME DE EJECUCIONES Y BUGS ============
    window.downloadEjecucionesBugsDoc = function () {
        const proyecto = getActiveProject() ? appData.proyectos.find(p => p.id === getActiveProject()) : null;
        const ejecuciones = filterByProject(appData.ejecuciones);
        const bugs = filterByProject(appData.bugs);
        const casos = filterByProject(appData.casos);
        const bugsAbiertos = bugs.filter(b => b.estado !== 'Solucionado').length;
        const bugsSolucionados = bugs.filter(b => b.estado === 'Solucionado').length;
        let html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="UTF-8"><title>Informe Ejecuciones y Bugs</title><style>@page { size: A4; margin: 2cm; }body { font-family: 'Calibri', Arial, sans-serif; color: #1e293b; line-height: 1.6; }.cover { text-align: center; padding: 80px 40px; border-bottom: 4px solid #ef4444; margin-bottom: 40px; }.cover-logo { font-size: 72px; margin-bottom: 20px; }.cover h1 { font-size: 36px; color: #0f172a; margin: 10px 0; font-weight: 700; }.cover h2 { font-size: 20px; color: #64748b; font-weight: 400; margin: 8px 0; }.cover-meta { margin-top: 40px; font-size: 14px; color: #64748b; }.cover-meta div { margin: 6px 0; }h1.section { color: #0f172a; font-size: 24px; border-bottom: 2px solid #ef4444; padding-bottom: 8px; margin-top: 40px; }h2 { color: #1e40af; font-size: 18px; margin-top: 24px; }p { font-size: 12px; margin: 8px 0; }table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 11px; }th { background: #1e293b; color: white; padding: 10px 8px; text-align: left; font-weight: 600; }td { border: 1px solid #e2e8f0; padding: 8px; }tr:nth-child(even) td { background: #f8fafc; }.badge { padding: 3px 8px; border-radius: 10px; font-size: 10px; font-weight: 600; display: inline-block; }.passed { background: #d1fae5; color: #065f46; }.failed { background: #fee2e2; color: #991b1b; }.pending { background: #fef3c7; color: #92400e; }.abierto { background: #fee2e2; color: #991b1b; }.solucionado { background: #d1fae5; color: #065f46; }.kpi-box { display: inline-block; padding: 16px 24px; margin: 8px; background: #f1f5f9; border-radius: 8px; border-left: 4px solid #ef4444; min-width: 140px; }.kpi-value { font-size: 28px; font-weight: 700; color: #0f172a; }.kpi-label { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }.summary-grid { display: flex; flex-wrap: wrap; gap: 10px; margin: 20px 0; }.footer { margin-top: 60px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 10px; color: #94a3b8; text-align: center; }</style></head><body><div class="cover"><div class="cover-logo">🐛</div><h1>Informe de Ejecuciones y Defectos</h1><h2>Quality Assurance - Test Results & Bug Tracking</h2><div class="cover-meta"><div><strong>Proyecto:</strong> ${proyecto?.nombre || 'Todos los proyectos'}</div><div><strong>Cliente:</strong> ${proyecto?.codigoCliente || 'N/A'}</div><div><strong>Responsable QA:</strong> ${proyecto?.responsable || currentUser?.nombre || 'N/A'}</div><div><strong>Fecha de emisión:</strong> ${new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })}</div><div><strong>Versión:</strong> 1.0</div></div></div><h1 class="section">1. Resumen Ejecutivo</h1><p>Este informe detalla los resultados de las ejecuciones de pruebas y los defectos identificados durante el proceso de aseguramiento de calidad del proyecto <strong>${proyecto?.nombre || 'en curso'}</strong>.</p><div class="summary-grid"><div class="kpi-box"><div class="kpi-value">${ejecuciones.length}</div><div class="kpi-label">Ciclos de Prueba</div></div><div class="kpi-box"><div class="kpi-value">${bugs.length}</div><div class="kpi-label">Total Defectos</div></div><div class="kpi-box"><div class="kpi-value">${bugsAbiertos}</div><div class="kpi-label">Bugs Abiertos</div></div><div class="kpi-box"><div class="kpi-value">${bugsSolucionados}</div><div class="kpi-label">Bugs Solucionados</div></div></div><h1 class="section">2. Ciclos de Ejecución</h1><p>Se han realizado <strong>${ejecuciones.length}</strong> ciclos de ejecución de pruebas.</p><table><tr><th>ID</th><th>Ciclo</th><th>Fecha</th><th>Responsable</th><th>Casos</th></tr>${ejecuciones.map(e => { let casosCount = 0; try { casosCount = JSON.parse(e.casosAsociados || '[]').length; } catch (err) { } return `<tr><td>${e.id}</td><td>${e.nombreCiclo || ''}</td><td>${e.fecha || '-'}</td><td>${e.responsable || '-'}</td><td>${casosCount}</td></tr>`; }).join('')}</table><h1 class="section">3. Defectos Detectados</h1><p>Se han registrado <strong>${bugs.length}</strong> defectos durante las pruebas. De estos, <strong>${bugsSolucionados}</strong> han sido resueltos y <strong>${bugsAbiertos}</strong> permanecen abiertos.</p><table><tr><th>ID</th><th>Título</th><th>Severidad</th><th>Caso</th><th>Estado</th></tr>${bugs.map(b => `<tr><td>${b.id}</td><td>${b.titulo || ''}</td><td>${b.severidad || 'Menor'}</td><td>${b.casoRelacionado || '-'}</td><td><span class="badge ${b.estado === 'Solucionado' ? 'solucionado' : 'abierto'}">${b.estado || 'Abierto'}</span></td></tr>`).join('')}</table><h1 class="section">4. Análisis de Severidad</h1><table><tr><th>Severidad</th><th>Cantidad</th><th>Porcentaje</th></tr>${['Bloqueante', 'Crítica', 'Mayor', 'Menor'].map(sev => { const count = bugs.filter(b => b.severidad === sev).length; const pct = bugs.length > 0 ? Math.round((count / bugs.length) * 100) : 0; return `<tr><td>${sev}</td><td>${count}</td><td>${pct}%</td></tr>`; }).join('')}</table><div class="footer"><p>Informe generado por QA Suite PRO · ${new Date().toLocaleString('es-ES')}</p><p>Este documento es confidencial y para uso interno del equipo de calidad.</p></div></body></html>`;
        const blob = new Blob(['\ufeff' + html], { type: 'application/msword' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `Informe_Ejecuciones_Bugs_${proyecto?.nombre || 'General'}_${new Date().toISOString().split('T')[0]}.doc`;
        a.click();
        URL.revokeObjectURL(a.href);
        toast('📄 Informe de Ejecuciones y Bugs descargado', 'success');
        addNotification(' Informe generado', 'Se ha descargado el informe de ejecuciones y bugs');
    };

    // ============ INFORME DE APIs ============
    window.downloadApisDoc = function () {
        const proyecto = getActiveProject() ? appData.proyectos.find(p => p.id === getActiveProject()) : null;
        const apis = filterByProject(appData.apis);
        const apisCorrectas = apis.filter(a => a.estado === 'Correcta').length;
        const apisError = apis.filter(a => a.estado === 'Error').length;
        const apisPendientes = apis.filter(a => a.estado === 'Pendiente').length;
        let html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="UTF-8"><title>Informe Gestión APIs</title><style>@page { size: A4; margin: 2cm; }body { font-family: 'Calibri', Arial, sans-serif; color: #1e293b; line-height: 1.6; }.cover { text-align: center; padding: 80px 40px; border-bottom: 4px solid #14b8a6; margin-bottom: 40px; }.cover-logo { font-size: 72px; margin-bottom: 20px; }.cover h1 { font-size: 36px; color: #0f172a; margin: 10px 0; font-weight: 700; }.cover h2 { font-size: 20px; color: #64748b; font-weight: 400; margin: 8px 0; }.cover-meta { margin-top: 40px; font-size: 14px; color: #64748b; }.cover-meta div { margin: 6px 0; }h1.section { color: #0f172a; font-size: 24px; border-bottom: 2px solid #14b8a6; padding-bottom: 8px; margin-top: 40px; }h2 { color: #1e40af; font-size: 18px; margin-top: 24px; }p { font-size: 12px; margin: 8px 0; }table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 11px; }th { background: #1e293b; color: white; padding: 10px 8px; text-align: left; font-weight: 600; }td { border: 1px solid #e2e8f0; padding: 8px; }tr:nth-child(even) td { background: #f8fafc; }.badge { padding: 3px 8px; border-radius: 10px; font-size: 10px; font-weight: 600; display: inline-block; }.passed { background: #d1fae5; color: #065f46; }.failed { background: #fee2e2; color: #991b1b; }.pending { background: #fef3c7; color: #92400e; }.kpi-box { display: inline-block; padding: 16px 24px; margin: 8px; background: #f1f5f9; border-radius: 8px; border-left: 4px solid #14b8a6; min-width: 140px; }.kpi-value { font-size: 28px; font-weight: 700; color: #0f172a; }.kpi-label { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }.summary-grid { display: flex; flex-wrap: wrap; gap: 10px; margin: 20px 0; }.footer { margin-top: 60px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 10px; color: #94a3b8; text-align: center; }</style></head><body><div class="cover"><div class="cover-logo">🔌</div><h1>Informe de Gestión de APIs</h1><h2>API Testing & Validation Report</h2><div class="cover-meta"><div><strong>Proyecto:</strong> ${proyecto?.nombre || 'Todos los proyectos'}</div><div><strong>Cliente:</strong> ${proyecto?.codigoCliente || 'N/A'}</div><div><strong>Responsable QA:</strong> ${proyecto?.responsable || currentUser?.nombre || 'N/A'}</div><div><strong>Fecha de emisión:</strong> ${new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })}</div><div><strong>Versión:</strong> 1.0</div></div></div><h1 class="section">1. Resumen Ejecutivo</h1><p>Este informe detalla el estado de las APIs evaluadas durante el proceso de aseguramiento de calidad del proyecto <strong>${proyecto?.nombre || 'en curso'}</strong>.</p><div class="summary-grid"><div class="kpi-box"><div class="kpi-value">${apis.length}</div><div class="kpi-label">Total APIs</div></div><div class="kpi-box"><div class="kpi-value">${apisCorrectas}</div><div class="kpi-label">APIs Correctas</div></div><div class="kpi-box"><div class="kpi-value">${apisError}</div><div class="kpi-label">APIs con Error</div></div><div class="kpi-box"><div class="kpi-value">${apisPendientes}</div><div class="kpi-label">APIs Pendientes</div></div></div><h1 class="section">2. Detalle de APIs y Evidencias</h1><table><tr><th>ID API</th><th>Nombre</th><th>Método</th><th>Status</th><th>Tiempo</th><th>Estado</th></tr>${apis.map(a => `<tr><td>${a.id}</td><td>${a.nombre || ''}</td><td><strong>${a.metodo || 'GET'}</strong></td><td>${a.statusCode || 'N/A'}</td><td>${a.tiempoRespuesta ? a.tiempoRespuesta + ' ms' : 'N/A'}</td><td><span class="badge ${a.estado === 'Correcta' ? 'passed' : a.estado === 'Error' ? 'failed' : 'pending'}">${a.estado || 'Pendiente'}</span></td></tr>`).join('')}</table><h1 class="section">3. Análisis por Método</h1><table><tr><th>Método HTTP</th><th>Cantidad</th><th>Porcentaje</th></tr>${['GET', 'POST', 'PUT', 'DELETE'].map(method => { const count = apis.filter(a => a.metodo === method).length; const pct = apis.length > 0 ? Math.round((count / apis.length) * 100) : 0; return `<tr><td>${method}</td><td>${count}</td><td>${pct}%</td></tr>`; }).join('')}</table><h1 class="section">4. Análisis por Estado</h1><table><tr><th>Estado</th><th>Cantidad</th><th>Porcentaje</th></tr>${['Correcta', 'Error', 'Pendiente'].map(status => { const count = apis.filter(a => a.estado === status).length; const pct = apis.length > 0 ? Math.round((count / apis.length) * 100) : 0; return `<tr><td>${status}</td><td>${count}</td><td>${pct}%</td></tr>`; }).join('')}</table><div class="footer"><p>Informe generado por QA Suite PRO · ${new Date().toLocaleString('es-ES')}</p><p>Este documento es confidencial y para uso interno del equipo de calidad.</p></div></body></html>`;
        const blob = new Blob(['\ufeff' + html], { type: 'application/msword' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `Informe_APIs_${proyecto?.nombre || 'General'}_${new Date().toISOString().split('T')[0]}.doc`;
        a.click();
        URL.revokeObjectURL(a.href);
        toast(' Informe de APIs descargado', 'success');
        addNotification('📊 Informe generado', 'Se ha descargado el informe de APIs');
    };

    // ============ COMPARATIVA DE EJECUCIONES ============
    window.compararEjecuciones = function () {
        const exec1Id = document.getElementById('compExec1').value;
        const exec2Id = document.getElementById('compExec2').value;
        const resultDiv = document.getElementById('comparativaResult');
        if (!exec1Id || !exec2Id) return toast('Selecciona dos ejecuciones para comparar', 'warning');
        if (exec1Id === exec2Id) return toast('Selecciona dos ejecuciones diferentes', 'warning');
        const exec1 = appData.ejecuciones.find(e => e.id === exec1Id);
        const exec2 = appData.ejecuciones.find(e => e.id === exec2Id);
        if (!exec1 || !exec2) return toast('Ejecuciones no encontradas', 'error');
        let casos1 = []; let casos2 = [];
        try { casos1 = JSON.parse(exec1.casosAsociados || '[]'); } catch (e) { }
        try { casos2 = JSON.parse(exec2.casosAsociados || '[]'); } catch (e) { }
        const stats1 = { Passed: casos1.filter(c => c.status === 'Passed').length, Failed: casos1.filter(c => c.status === 'Failed').length, 'In Progress': casos1.filter(c => c.status === 'In Progress').length, Blocked: casos1.filter(c => c.status === 'Blocked').length, Pendiente: casos1.filter(c => c.status === 'Pendiente' || !c.status).length, Total: casos1.length };
        const stats2 = { Passed: casos2.filter(c => c.status === 'Passed').length, Failed: casos2.filter(c => c.status === 'Failed').length, 'In Progress': casos2.filter(c => c.status === 'In Progress').length, Blocked: casos2.filter(c => c.status === 'Blocked').length, Pendiente: casos2.filter(c => c.status === 'Pendiente' || !c.status).length, Total: casos2.length };
        const pct1 = stats1.Total > 0 ? Math.round((stats1.Passed / stats1.Total) * 100) : 0;
        const pct2 = stats2.Total > 0 ? Math.round((stats2.Passed / stats2.Total) * 100) : 0;
        const casos1Ids = new Set(casos1.map(c => c.id));
        const casos2Ids = new Set(casos2.map(c => c.id));
        const soloEn1 = [...casos1Ids].filter(id => !casos2Ids.has(id));
        const soloEn2 = [...casos2Ids].filter(id => !casos1Ids.has(id));
        const enAmbas = [...casos1Ids].filter(id => casos2Ids.has(id));
        const cambios = [];
        enAmbas.forEach(casoId => {
            const caso1 = casos1.find(c => c.id === casoId);
            const caso2 = casos2.find(c => c.id === casoId);
            if (caso1.status !== caso2.status) cambios.push({ id: casoId, titulo: appData.casos.find(c => c.id === casoId)?.titulo || 'Caso eliminado', status1: caso1.status || 'Pendiente', status2: caso2.status || 'Pendiente' });
        });
        let html = `<div style="background:var(--card-alt); padding:20px; border-radius:12px; border:1px solid var(--border);"><h3 style="margin-top:0; color:var(--accent);">📊 Comparativa: ${exec1.nombreCiclo} vs ${exec2.nombreCiclo}</h3><div style="display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-bottom:20px;"><div style="padding:15px; background:var(--bg); border-radius:8px; border-left:4px solid var(--accent);"><div style="font-weight:700; margin-bottom:10px;">${exec1.nombreCiclo}</div><div style="font-size:0.85rem; color:var(--text2);"> ${exec1.fecha || 'Sin fecha'}</div><div style="font-size:0.85rem; color:var(--text2);">📋 ${casos1.length} casos</div><div style="font-size:1.2rem; font-weight:700; color:var(--success); margin-top:10px;">${pct1}% aprobados</div></div><div style="padding:15px; background:var(--bg); border-radius:8px; border-left:4px solid var(--accent2);"><div style="font-weight:700; margin-bottom:10px;">${exec2.nombreCiclo}</div><div style="font-size:0.85rem; color:var(--text2);">📅 ${exec2.fecha || 'Sin fecha'}</div><div style="font-size:0.85rem; color:var(--text2);"> ${casos2.length} casos</div><div style="font-size:1.2rem; font-weight:700; color:var(--success); margin-top:10px;">${pct2}% aprobados</div></div></div><h4 style="margin:15px 0 10px; color:var(--text);">📈 Estadísticas Comparadas</h4><table style="width:100%; border-collapse:collapse; font-size:0.85rem;"><thead><tr style="background:var(--bg);"><th style="padding:10px; text-align:left; border-bottom:1px solid var(--border);">Estado</th><th style="padding:10px; text-align:center; border-bottom:1px solid var(--border);">${exec1.nombreCiclo}</th><th style="padding:10px; text-align:center; border-bottom:1px solid var(--border);">${exec2.nombreCiclo}</th><th style="padding:10px; text-align:center; border-bottom:1px solid var(--border);">Diferencia</th></tr></thead><tbody>${['Passed', 'Failed', 'In Progress', 'Blocked', 'Pendiente'].map(status => { const diff = stats2[status] - stats1[status]; const diffColor = diff > 0 ? 'var(--success)' : diff < 0 ? 'var(--danger)' : 'var(--text2)'; return `<tr><td style="padding:10px; border-bottom:1px solid var(--border);">${status}</td><td style="padding:10px; text-align:center; border-bottom:1px solid var(--border);">${stats1[status]}</td><td style="padding:10px; text-align:center; border-bottom:1px solid var(--border);">${stats2[status]}</td><td style="padding:10px; text-align:center; border-bottom:1px solid var(--border); color:${diffColor}; font-weight:700;">${diff > 0 ? '+' : ''}${diff}</td></tr>`; }).join('')}</tbody></table>`;
        if (cambios.length > 0) { html += `<h4 style="margin:20px 0 10px; color:var(--text);">🔄 Cambios de Estado (${cambios.length})</h4><table style="width:100%; border-collapse:collapse; font-size:0.85rem;"><thead><tr style="background:var(--bg);"><th style="padding:10px; text-align:left; border-bottom:1px solid var(--border);">Caso</th><th style="padding:10px; text-align:center; border-bottom:1px solid var(--border);">Estado Anterior</th><th style="padding:10px; text-align:center; border-bottom:1px solid var(--border);">Estado Nuevo</th></tr></thead><tbody>${cambios.map(c => `<tr><td style="padding:10px; border-bottom:1px solid var(--border);"><code>${c.id}</code> - ${c.titulo}</td><td style="padding:10px; text-align:center; border-bottom:1px solid var(--border);">${c.status1}</td><td style="padding:10px; text-align:center; border-bottom:1px solid var(--border);">${c.status2}</td></tr>`).join('')}</tbody></table>`; } 
        else { html += '<p style="color:var(--text2); margin-top:15px;">✅ No hay cambios de estado entre las ejecuciones</p>'; }
        if (soloEn1.length > 0) html += `<p style="color:var(--warning); margin-top:15px;">⚠️ ${soloEn1.length} caso(s) solo en ${exec1.nombreCiclo}</p>`;
        if (soloEn2.length > 0) html += `<p style="color:var(--warning); margin-top:15px;">⚠️ ${soloEn2.length} caso(s) solo en ${exec2.nombreCiclo}</p>`;
        html += `</div>`;
        resultDiv.innerHTML = html;
        toast('📊 Comparativa generada', 'success');
    };

    // ============ GENERAR PDF: GUÍA DE PALABRAS CLAVE PARA IA (CORREGIDA) ============
    window.generarGuiaPalabrasClavePDF = function () {
        const fechaEmision = new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });
        
        // Mostrar indicador de carga
        toast('📄 Generando documento PDF...', 'info');
        
        const htmlContent = `<!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Guía de Palabras Clave - Motor IA QA Suite PRO</title>
        <style>
            @page { size: A4; margin: 1.5cm; }
            * { box-sizing: border-box; }
            body { 
                font-family: Arial, Helvetica, sans-serif; 
                background: #fff; 
                color: #1e293b; 
                margin: 0; 
                padding: 0; 
                font-size: 11px; 
                line-height: 1.5; 
            }
            .document { 
                width: 210mm; 
                min-height: 297mm; 
                background: #fff; 
                padding: 20px 25px; 
                box-sizing: border-box; 
                position: relative; 
            }
            .header { 
                text-align: center; 
                border-bottom: 3px solid #3b82f6; 
                padding-bottom: 12px; 
                margin-bottom: 20px; 
            }
            .logo { font-size: 36px; margin-bottom: 5px; }
            h1 { font-size: 20px; color: #1e40af; margin: 0; text-transform: uppercase; letter-spacing: 1px; }
            h2 { font-size: 14px; color: #64748b; margin: 5px 0 0 0; font-weight: 400; }
            .meta { font-size: 9px; color: #94a3b8; margin-top: 8px; }
            
            .section { margin-bottom: 16px; page-break-inside: avoid; }
            .section-title { 
                font-size: 12px; 
                font-weight: 700; 
                color: #0f172a; 
                border-left: 4px solid #3b82f6; 
                padding-left: 8px; 
                margin-bottom: 8px; 
                text-transform: uppercase; 
            }
            .section p { margin: 0 0 8px 0; font-size: 10px; color: #475569; }
            
            .keyword-container { display: flex; flex-wrap: wrap; gap: 4px; }
            .keyword { 
                display: inline-block; 
                background: #eff6ff; 
                color: #1e40af; 
                padding: 2px 8px; 
                border-radius: 10px; 
                font-weight: 600; 
                font-size: 9px; 
                border: 1px solid #bfdbfe; 
            }
            .verb { background: #f0fdf4; color: #166534; border-color: #bbf7d0; }
            
            .warning-box { 
                background: #fef3c7; 
                color: #92400e; 
                padding: 8px 12px; 
                border-radius: 6px; 
                border-left: 4px solid #f59e0b; 
                font-size: 10px; 
                margin-top: 12px; 
            }
            .tip-box { 
                background: #ecfdf5; 
                color: #065f46; 
                padding: 8px 12px; 
                border-radius: 6px; 
                border-left: 4px solid #10b981; 
                font-size: 10px; 
                margin-top: 10px; 
            }
            
            .footer { 
                position: absolute; 
                bottom: 15px; 
                left: 25px; 
                right: 25px; 
                text-align: center; 
                font-size: 8px; 
                color: #94a3b8; 
                border-top: 1px solid #e2e8f0; 
                padding-top: 8px; 
            }
            
            .no-print { 
                background: #fef3c7; 
                padding: 12px; 
                text-align: center; 
                font-family: Arial, sans-serif; 
                color: #92400e; 
                border-bottom: 2px solid #f59e0b; 
                font-size: 13px;
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                z-index: 9999;
            }
            
            @media print { 
                body { background: #fff; } 
                .no-print { display: none !important; } 
                .document { box-shadow: none; padding: 0; }
            }
        </style>
    </head>
    <body>
        <div class="no-print">️ <strong>Selecciona "Guardar como PDF"</strong> en la ventana de impresión. <button onclick="window.print()" style="padding:6px 16px; background:#3b82f6; color:#fff; border:none; border-radius:6px; cursor:pointer; margin-left:10px; font-size:12px;">Imprimir ahora</button></div>
        <div style="height:50px;"></div>
        <div class="document">
            <div class="header">
                <div class="logo">🤖</div>
                <h1>Diccionario del Motor de IA</h1>
                <h2>Palabras Clave para Generación Automática de Casos de Uso</h2>
                <div class="meta">QA Suite PRO · Documento generado el ${fechaEmision}</div>
            </div>

            <div class="section">
                <div class="section-title">1. Identificación del Caso (Inicio)</div>
                <p>El motor busca estas palabras al inicio de una línea para detectar que comienza un nuevo caso de prueba.</p>
                <div class="keyword-container">
                    <span class="keyword">caso</span>
                    <span class="keyword">escenario</span>
                    <span class="keyword">prueba</span>
                    <span class="keyword">test</span>
                    <span class="keyword">tc</span>
                </div>
            </div>

            <div class="section">
                <div class="section-title">2. Actores y Roles</div>
                <p>Palabras que ayudan a la IA a identificar quién interactúa con el sistema.</p>
                <div class="keyword-container">
                    <span class="keyword">actor</span>
                    <span class="keyword">usuario</span>
                    <span class="keyword">rol</span>
                    <span class="keyword">perfil</span>
                    <span class="keyword">quien</span>
                </div>
            </div>

            <div class="section">
                <div class="section-title">3. Precondiciones</div>
                <p>Indicadores de estado inicial o requisitos previos antes de ejecutar el flujo.</p>
                <div class="keyword-container">
                    <span class="keyword">precondicion</span>
                    <span class="keyword">pre-condicion</span>
                    <span class="keyword">requisito previo</span>
                    <span class="keyword">condicion inicial</span>
                    <span class="keyword">dado que</span>
                </div>
            </div>

            <div class="section">
                <div class="section-title">4. Pasos y Flujo de Ejecución</div>
                <p>El motor detecta pasos numerados o viñetas para construir el flujo de acciones.</p>
                <div class="keyword-container">
                    <span class="keyword">paso</span>
                    <span class="keyword">step</span>
                    <span class="keyword">- (viñeta)</span>
                    <span class="keyword">• (viñeta)</span>
                    <span class="keyword">* (viñeta)</span>
                </div>
            </div>

            <div class="section">
                <div class="section-title">5. Resultados Esperados</div>
                <p>Palabras clave para extraer el comportamiento esperado del sistema tras ejecutar los pasos.</p>
                <div class="keyword-container">
                    <span class="keyword">resultado</span>
                    <span class="keyword">esperado</span>
                    <span class="keyword">entonces</span>
                    <span class="keyword">then</span>
                    <span class="keyword">se espera</span>
                </div>
            </div>

            <div class="section">
                <div class="section-title">6. Prioridad y Severidad</div>
                <p>Si el documento incluye estos términos, la IA asignará automáticamente la prioridad al caso.</p>
                <div class="keyword-container">
                    <span class="keyword">prioridad</span>
                    <span class="keyword">priority</span>
                    <span class="keyword">alta</span>
                    <span class="keyword">media</span>
                    <span class="keyword">baja</span>
                    <span class="keyword">critica</span>
                    <span class="keyword">urgente</span>
                </div>
            </div>

            <div class="section">
                <div class="section-title">7. Verbos de Acción (Detección de Funcionalidades)</div>
                <p>Si el documento no tiene estructura formal, la IA busca estos verbos para extraer funcionalidades y crear casos básicos.</p>
                <div class="keyword-container">
                    <span class="keyword verb">debe</span>
                    <span class="keyword verb">puede</span>
                    <span class="keyword verb">permite</span>
                    <span class="keyword verb">permitir</span>
                    <span class="keyword verb">realizar</span>
                    <span class="keyword verb">ejecutar</span>
                    <span class="keyword verb">mostrar</span>
                    <span class="keyword verb">validar</span>
                    <span class="keyword verb">verificar</span>
                </div>
            </div>

            <div class="warning-box">
                <strong>⚠️ Nota sobre el nivel de confianza:</strong> La IA asigna un porcentaje de confianza (60% - 85%) según la claridad con la que se usen estas palabras. Para obtener un &gt;80% de confianza, se recomienda estructurar el documento usando los encabezados: <em>Actor, Precondición, Pasos y Resultado Esperado</em>.
            </div>

            <div class="tip-box">
                <strong>💡 Tip para Redactores de Requisitos:</strong> Utilice viñetas (<code>-</code> o <code>*</code>) para los pasos y separe claramente el "Resultado Esperado" con un salto de línea. Esto reduce drásticamente los falsos positivos en la extracción automática.
            </div>

            <div class="footer">
                Documento de referencia técnica · Motor NLP QA Suite PRO · Versión 2.0
            </div>
        </div>
    </body>
    </html>`;

        // Abrir ventana nueva
        const printWindow = window.open('', '_blank', 'width=900,height=700,scrollbars=yes,resizable=yes');
        if (!printWindow) {
            toast('️ El navegador bloqueó la ventana emergente. Permítela para generar el PDF.', 'warning');
            return;
        }
        
        // Escribir el contenido HTML
        printWindow.document.open();
        printWindow.document.write(htmlContent);
        printWindow.document.close();
        
        // Esperar a que el documento termine de cargarse completamente
        printWindow.onload = function() {
            // console.log('✅ Documento cargado completamente');
            // Dar un poco más de tiempo para que los estilos se rendericen
            setTimeout(() => {
                try {
                    printWindow.focus();
                    printWindow.print();
                } catch (e) {
                    // console.error('Error al imprimir:', e);
                    toast('Usa Ctrl+P (o Cmd+P) en la nueva pestaña para guardar el PDF.', 'info');
                }
            }, 800); // Aumentado de 500ms a 800ms
        };
        
        // Fallback por si onload no se dispara
        setTimeout(() => {
            if (printWindow && !printWindow.closed) {
                try {
                    printWindow.focus();
                    // Solo imprimir si no se ha impreso ya
                    if (printWindow.document.readyState === 'complete') {
                        printWindow.print();
                    }
                } catch (e) {
                    // Silenciar errores si la ventana ya se cerró
                }
            }
        }, 2000);
        
        // toast(' Guía de Palabras Clave generada', 'success');
        addNotification('🤖 Guía IA generada', 'Se ha abierto el diccionario de palabras clave para casos de uso');
    };

    // ============ IA REAL CON GEMINI API ============

    // 1. Función para obtener la API Key (se guarda en localStorage)
    async function getGeminiApiKey() {
        let key = localStorage.getItem('qa_gemini_api_key');
        if (!key) {
            key = prompt("🤖 Para usar la IA real, necesitas una API Key de Google Gemini (es GRATUITA).\n\n1. Ve a: https://aistudio.google.com/app/apikey\n2. Crea tu API Key y pégala aquí:\n\n(Introduce tu API Key):");
            if (key) {
                localStorage.setItem('qa_gemini_api_key', key.trim());
            } else {
                return null;
            }
        }
        return key;
    }

    // 2. Función que llama a la IA real
    async function generarCasosConLLM(texto, apiKey) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`;
        
        // Prompt diseñado para que la IA entienda semántica y devuelva JSON puro
        const systemPrompt = `Eres un QA Lead experto en aseguramiento de calidad. 
        A continuación se te proporciona el texto extraído de un documento funcional. 
        Tu tarea es ANALIZAR EL TEXTO, ENTENDER LAS FUNCIONALIDADES DESCRITAS (sin importar el formato, viñetas o palabras clave usadas en el documento) y generar una lista de Casos de Prueba estructurados.
        
        Devuelve ÚNICAMENTE un array JSON válido, sin markdown, sin texto adicional, con esta estructura exacta:
        [
        {
            "titulo": "Título claro y descriptivo del caso",
            "descripcion": "Objetivo o descripción del caso",
            "actor": "Actor principal (Usuario, Admin, Sistema)",
            "precondicion": "Requisitos previos o estado inicial",
            "pasos": ["Paso 1", "Paso 2", "Paso 3"],
            "resultado": "Resultado esperado tras ejecutar los pasos",
            "prioridad": "Alta | Media | Baja"
        }
        ]
        
        Texto del documento:
        """${texto.substring(0, 30000)}"""`; // Limitamos a 30k caracteres para evitar límites de tokens

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: systemPrompt }] }],
                generationConfig: {
                    responseMimeType: "application/json", // Fuerza a la IA a devolver JSON válido
                    temperature: 0.2 // Baja temperatura para mayor precisión y estructura
                }
            })
        });

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error?.message || 'Error en la API de Gemini. Verifica tu Key.');
        }

        const data = await response.json();
        const jsonStr = data.candidates[0].content.parts[0].text;
        return JSON.parse(jsonStr);
    }

    // 3. Reemplazo de la función principal de análisis
    window.analizarDocumentoIA = async function() {
        console.log('🔍 Iniciando análisis con IA Real...');
        const reqId = document.getElementById('f_id')?.value;
        currentAnalisisRequisitoId = reqId;
        
        let tempDoc = sessionStorage.getItem('temp_documento_' + getActiveProject());
        let docData;
        
        if (tempDoc) { 
            docData = JSON.parse(tempDoc); 
        } else {
            if (!reqId) { toast('Error: No se encuentra el ID del requisito', 'error'); return; }
            const req = appData.requisitos.find(r => r.id === reqId);
            if (!req || !req.documento) { toast('No hay documento cargado. Sube un PDF, DOCX o TXT primero.', 'error'); return; }
            docData = { contenido: req.documento, nombre: req.nombreDocumento || 'documento.pdf', tipo: req.tipoDocumento || 'application/pdf' };
        }

        // 1. Obtener API Key
        const apiKey = await getGeminiApiKey();
        if (!apiKey) { toast('Se requiere API Key para usar la IA', 'error'); return; }

        try {
            // 2. Extraer texto (usando tu función existente de PDF.js / TXT)
            toast('📄 Extrayendo texto del documento...', 'info');
            const texto = await extraerTextoDeDocumento(docData.contenido, docData.tipo);
            
            if (!texto || texto.length < 50) { 
                toast('El documento parece estar vacío o no es legible.', 'warning'); 
                return; 
            }

            // 3. Llamar a la IA Real
            toast('🤖 La IA está leyendo y entendiendo el documento...', 'info');
            const casosIA = await generarCasosConLLM(texto, apiKey);

            if (!casosIA || !Array.isArray(casosIA) || casosIA.length === 0) { 
                toast('⚠️ La IA no pudo extraer casos de este documento.', 'warning'); 
                return; 
            }

            // 4. Mapear al formato que espera tu modal de revisión manual
            const casosSugeridos = casosIA.map((c, idx) => ({
                id: 'IA-' + (idx + 1),
                titulo: c.titulo || 'Caso sin título',
                descripcion: c.descripcion || '',
                actor: c.actor || 'Usuario',
                precondicion: c.precondicion || '',
                pasos: Array.isArray(c.pasos) ? c.pasos : [],
                resultado: c.resultado || '',
                prioridad: c.prioridad || 'Media',
                confianza: 95 // Al ser IA real, le damos alta confianza
            }));

            console.log(`✅ ${casosSugeridos.length} casos generados por IA Real.`);
            
            // 5. Mostrar modal para revisión manual
            mostrarModalRevisionCasos(casosSugeridos, docData);
        } catch (error) { 
            console.error('Error al analizar documento:', error);
            if (error.message.includes('API key not valid')) {
                localStorage.removeItem('qa_gemini_api_key'); // Borramos la key mala
                toast('API Key inválida o con restricciones. Se ha borrado. Vuelve a intentar y usa una clave de Google AI Studio sin espacios.', 'error');
            } else if (error.message.includes('API')) {
                localStorage.removeItem('qa_gemini_api_key');
                toast('Error de API. Verifica tu clave.', 'error');
            } else {
                toast('Error al procesar con IA: ' + error.message, 'error'); 
            }
        }
    };


    // ============ INIT ============
    async function init() {
        // console.log('🚀 Iniciando aplicación...');
        
        // Ocultar ambas pantallas inicialmente
        document.getElementById('authScreen').style.display = 'none';
        document.getElementById('appScreen').style.display = 'none';
        
        // 1. Cargar datos desde Firebase PRIMERO
        await loadData();
        // console.log('✅ Datos cargados:', appData.usuarios.length, 'usuarios');
        
        // 2. Suscribirse a cambios en tiempo real
        suscribirseAlTiempoReal();
        
        // 3. Crear datos base si no existen usuarios
        if (!appData.usuarios || appData.usuarios.length === 0) {
            // console.log(' Creando usuario admin por defecto...');
            appData.usuarios = [{ 
                id: 1, 
                nombre: 'Admin Sistema', 
                usuario: 'admin', 
                password: 'password', 
                rol: 'Admin',
                proyectosAutorizados: []
            }];
            appData.proyectos = appData.proyectos || [];
            appData.objetivos = appData.objetivos || [];
            appData.casos = appData.casos || [];
            appData.bugs = appData.bugs || [];
            appData.capturas = appData.capturas || [];
            appData.apis = appData.apis || [];
            appData.mejoras = appData.mejoras || [];
            appData.ejecuciones = appData.ejecuciones || [];
            appData.registroDiario = appData.registroDiario || [];
            appData.trazabilidad = appData.trazabilidad || [];
            appData.comentarios = appData.comentarios || [];
            appData.notificaciones = [];
            appData.configuracion = appData.configuracion || { theme: 'dark', activeProject: '' };
            await saveData();
        }
        
        // 4. Asegurar que todos los usuarios tengan proyectosAutorizados
        if (appData.usuarios && appData.usuarios.length > 0) {
            let changed = false;
            appData.usuarios.forEach(u => {
                if (!u.proyectosAutorizados) {
                    u.proyectosAutorizados = u.rol === 'Admin' ? [] : [];
                    changed = true;
                }
            });
            if (changed) await saveData();
        }
        
        // 5. Asegurar que todos los registros tengan creadoPor
        const dataArrays = ['casos', 'bugs', 'ejecuciones', 'capturas', 'apis', 'registroDiario'];
        let needsSave = false;
        dataArrays.forEach(key => {
            if (appData[key] && Array.isArray(appData[key])) {
                appData[key].forEach(item => {
                    if (!item.creadoPor) {
                        item.creadoPor = 1;
                        needsSave = true;
                    }
                });
            }
        });
        if (needsSave) await saveData();
        
        // 6. Restaurar sesión ANTES de mostrar cualquier pantalla
        const uid = sessionStorage.getItem(SESSION_KEY);
        // console.log(' UID encontrado:', uid);
        
        if (uid) {
            const u = appData.usuarios.find(x => String(x.id) === String(uid));
            if (u) {
                // console.log('✅ Restaurando sesión para:', u.nombre);
                currentUser = u;
                currentPage = getLastPage();
                showApp(); // Esto mostrará la app directamente
                return; // Importante: salir aquí para no mostrar el login
            } else {
                // console.log('❌ Usuario no encontrado en appData.usuarios');
            }
        }
        
        // 7. Si no hay sesión válida, mostrar login
        // console.log('⚠️ No hay sesión guardada, mostrando login');
        showLoginScreen();
        
        // 8. Event listener para login con Enter
        const loginPassInput = document.getElementById('loginPass');
        if (loginPassInput) {
            loginPassInput.addEventListener('keydown', e => { 
                if (e.key === 'Enter') doLogin(); 
            });
        }
    }

    // Función auxiliar para mostrar la pantalla de login
    function showLoginScreen() {
        // console.log('🔐 Mostrando pantalla de login');
        document.getElementById('authScreen').style.display = 'flex';
        document.getElementById('appScreen').style.display = 'none';
    }

    init();
})();
