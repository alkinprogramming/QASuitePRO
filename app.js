(function () {
    const SESSION_KEY = 'qaqc_current_user_id', PAGE_KEY = 'qaqc_last_page';
    const SERVER_PAGE_SIZE = 50; 
    let appData = {
        usuarios: [], proyectos: [], objetivos: [], casos: [], bugs: [],
        ejecuciones: [], capturas: [], registroDiario: [], apis: [], mejoras: [],
        trazabilidad: [], configuracion: { theme: 'dark', activeProject: '' }, comentarios: []
    };
    let currentUser = null, currentPage = 'dashboard', sortConfig = { field: null, dir: 'asc' };
    let searchTerm = '', pageSize = 10, currentPages = {};
    let notifications = [];
    let commandPaletteOpen = false;
    let commandPaletteSelectedIndex = 0;
    let commandPaletteResults = [];
    let loadedCollections = new Set();
    let activeSubscriptions = {};

    const projectRequiredPages = ['casos', 'bugs', 'ejecuciones', 'diario', 'capturas', 'apis', 'trazabilidad', 'informes', 'historico', 'mejoras', 'objetivos'];
    const consultorPages = ['casos', 'bugs', 'ejecuciones', 'capturas', 'apis', 'diario'];

    const cache = {
        data: {},
        timestamps: {},
        ttl: 60000, // 60 segundos de vida útil
        
        get(key) {
            const now = Date.now();
            if (this.timestamps[key] && (now - this.timestamps[key]) < this.ttl) {
                return this.data[key];
            }
            return null; // Cache expirado
        },
        
        set(key, value) {
            this.data[key] = value;
            this.timestamps[key] = Date.now();
        },
        
        invalidate(key) {
            delete this.data[key];
            delete this.timestamps[key];
        },
        
        invalidateAll() {
            this.data = {};
            this.timestamps = {};
        },
        
        invalidateByPrefix(prefix) {
            Object.keys(this.data).forEach(key => {
                if (key.startsWith(prefix)) {
                    this.invalidate(key);
                }
            });
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

    // Suscripción selectiva en tiempo real
    function suscribirseAlTiempoReal() {
        if (!db) return;
        
        // Suscribirse al nodo principal donde se guardan todos los datos
        db.ref("qa_suite_pro_state").on("value", (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                
                // Solo actualizar si hay datos válidos
                if (data && typeof data === 'object') {
                    // Preservar datos existentes si la respuesta está incompleta
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
                        configuracion: data.configuracion || { theme: 'dark', activeProject: '' }
                    };
                    
                    notifications = appData.notificaciones || [];
                    
                    // Actualizar UI si está visible
                    if (currentUser && document.getElementById('appScreen').style.display !== 'none') {
                        renderPage(currentPage);
                        updateNotificationBadge();
                        populateProjectSelector();
                    }
                    
                    console.log("🔄 Datos sincronizados desde Firebase");
                }
            }
            // Si no existe el snapshot, NO hacer nada (no sobrescribir con vacío)
        });
        
        console.log("✅ Suscripción activada para 'qa_suite_pro_state'");
    }


    // ============ DATA MANAGEMENT ============

    async function loadData() {
        try {
            const cloudData = await getFromDB("qa_suite_pro_state");
            if (cloudData) {
                appData = cloudData;
                console.log("✅ Datos cargados de la nube.");
            }
        } catch (e) {
            console.error("Error al cargar de Firebase:", e);
        }
        
        // Asegurar estructura mínima
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
        
        notifications = appData.notificaciones || [];
        applyTheme();
    }

    async function saveData() {
        appData.notificaciones = notifications;
        try {
            await saveToDB("qa_suite_pro_state", appData);
        } catch (error) {
            console.error("Error al guardar en la nube:", error);
            if (typeof toast === 'function') toast("Error al guardar en la nube", "error");
        }
    }

    function getActiveProject() { return appData.configuracion.activeProject || ''; }

    function filterByProject(arr, key = 'proyecto') {
        const ap = getActiveProject();
        if (!arr || !Array.isArray(arr)) return [];

        let result = arr;

        // Filtrar por proyecto activo
        if (ap) {
            result = result.filter(i => (i[key] || i.proyecto) === ap);
        }

        // Si es consultor, SOLO ve sus propios registros
        if (currentUser && currentUser.rol === 'Consultor') {
            result = result.filter(i => i.creadoPor === currentUser.id);
        }

        return result;
    }

    function saveSession(uid) { sessionStorage.setItem(SESSION_KEY, uid); }
    function clearSession() { sessionStorage.removeItem(SESSION_KEY); }
    function saveLastPage(page) { sessionStorage.setItem(PAGE_KEY, page); }
    function getLastPage() { return sessionStorage.getItem(PAGE_KEY) || 'dashboard'; }
    function restoreSession() {
        const uid = sessionStorage.getItem(SESSION_KEY);
        if (uid) {
            const u = appData.usuarios.find(x => x.id == uid);
            if (u) { currentUser = u; currentPage = getLastPage(); showApp(); return true; }
        }
        return false;
    }
    // ============ APP INIT ============
    function showApp() {
        document.getElementById('authScreen').style.display = 'none';
        document.getElementById('appScreen').style.display = 'flex';
        document.getElementById('userDisplay').textContent = currentUser.nombre.split(' ')[0];
        document.getElementById('userAvatar').textContent = currentUser.nombre.split(' ')[0].charAt(0).toUpperCase();
        
        // Ocultar Ajustes si no es admin
        const menuAjustes = document.getElementById('menuAjustes');
        if (menuAjustes && currentUser.rol !== 'Admin') {
            menuAjustes.style.display = 'none';
        }
        
        buildSidebar();
        initApp();
        updateNotificationBadge();
    }
    function buildSidebar() {
        const sidebar = document.getElementById('sidebar');
        const isConsultor = currentUser.rol === 'Consultor';
        const menuItems = [
            {
                section: 'Principal', items: [
                    { page: 'dashboard', icon: '📊', label: 'Dashboard', iconClass: 'icon-dashboard' },
                    { page: 'proyectos', icon: '📁', label: 'Proyectos', iconClass: 'icon-proyectos' },
                    { page: 'objetivos', icon: '🎯', label: 'Objetivos', iconClass: 'icon-objetivos' },
                    { page: 'mejoras', icon: '💡', label: 'Propuestas', iconClass: 'icon-mejoras' },
                    { page: 'usuarios', icon: '👥', label: 'Usuarios', iconClass: 'icon-usuarios' }
                ], adminOnly: true
            },
            {
                section: 'QA Técnico', items: [
                    { page: 'casos', icon: '📋', label: 'Casos de Uso', iconClass: 'icon-casos' },
                    { page: 'bugs', icon: '🐛', label: 'Defectos', iconClass: 'icon-bugs' },
                    { page: 'ejecuciones', icon: '▶️', label: 'Ejecuciones', iconClass: 'icon-ejecuciones' }
                ]
            },
            {
                section: 'Registro', items: [
                    { page: 'diario', icon: '📝', label: 'Registro Diario', iconClass: 'icon-diario' },
                    { page: 'capturas', icon: '📸', label: 'Capturas QA', iconClass: 'icon-capturas' },
                    { page: 'apis', icon: '🔌', label: 'Gestión APIs', iconClass: 'icon-apis' }
                ]
            },
            {
                section: 'Seguimiento', items: [
                    { page: 'trazabilidad', icon: '🔍', label: 'Trazabilidad', iconClass: 'icon-trazabilidad' },
                    { page: 'informes', icon: '📄', label: 'Informes', iconClass: 'icon-informes' },
                    { page: 'historico', icon: '📦', label: 'Histórico', iconClass: 'icon-historico' },
                    { page: 'ajustes', icon: '⚙️', label: 'Ajustes', iconClass: 'icon-ajustes' }
                ], adminOnly: true
            },
            {
                section: 'Gestión', 
                items: [
                    { page: 'permisos', icon: '🔐', label: 'Permisos Consultores', iconClass: 'icon-ajustes' }
                ], 
                adminOnly: true
            }
        ];
        let html = `<div class="sidebar-logo">
                <div class="logo-icon">🛡️</div>
                <span>QA Suite PRO</span>
                </div>`;
        menuItems.forEach(section => {
            if (section.adminOnly && isConsultor) return;
            html += `<div class="sidebar-section-title">${section.section}</div><ul class="nav-list">`;
            section.items.forEach(item => {
                html += `<li class="nav-item" data-page="${item.page}">
                    <div class="nav-icon-wrap ${item.iconClass}">${item.icon}</div>
                    <span class="nav-text">${item.label}</span>
                </li>`;
            });
            html += '</ul>';
        });
        sidebar.innerHTML = html;
    }
    // ============ AUTH ============
    window.showRegister = () => {
        document.getElementById('loginForm').style.display = 'none';
        document.getElementById('registerForm').style.display = 'block';
    };
    window.showLogin = () => {
        document.getElementById('loginForm').style.display = 'block';
        document.getElementById('registerForm').style.display = 'none';
    };
    window.doRegister = () => {
        const n = document.getElementById('regName').value.trim();
        const u = document.getElementById('regUser').value.trim();
        const p = document.getElementById('regPass').value;
        const p2 = document.getElementById('regPass2').value;
        const r = document.getElementById('regRole').value;
        if (!n || !u || !p) return toast('Completa todos los campos', 'error');
        if (p.length < 6) return toast('Mínimo 6 caracteres', 'error');
        if (p !== p2) return toast('Contraseñas no coinciden', 'error');
        if (appData.usuarios.find(x => x.usuario === u)) return toast('Usuario ya existe', 'error');
        appData.usuarios.push({ id: Date.now(), nombre: n, usuario: u, password: p, rol: r });
        saveData();
        toast('Registro exitoso', 'success');
        window.showLogin();
    };
    window.doLogin = () => {
        const u = document.getElementById('loginUser').value.trim();
        const p = document.getElementById('loginPass').value;
        const found = appData.usuarios.find(x => x.usuario === u && x.password === p);
        if (!found) return toast('Credenciales incorrectas', 'error');
        currentUser = found;
        saveSession(found.id);
        currentPage = getLastPage();
        showApp();
        toast(`Bienvenido, ${found.nombre.split(' ')[0]}`, 'success');
    };
    window.handleLogout = () => showConfirmModal('¿Cerrar sesión?', () => {
        currentUser = null;
        clearSession();
        localStorage.removeItem(PAGE_KEY);
        document.getElementById('authScreen').style.display = 'flex';
        document.getElementById('appScreen').style.display = 'none';
    });
    // ============ THEME ============
    function applyTheme() {
        document.body.classList.toggle('light-mode', appData.configuracion.theme === 'light');
        const icon = document.getElementById('themeIcon');
        if (icon) icon.textContent = appData.configuracion.theme === 'dark' ? '🌓' : '☀️';
    }
    window.toggleTheme = () => {
        appData.configuracion.theme = appData.configuracion.theme === 'dark' ? 'light' : 'dark';
        saveData();
        applyTheme();
    };
    // ============ TOAST ============
    function toast(msg, type = 'success') {
        const c = document.getElementById('toastContainer');
        const el = document.createElement('div');
        el.className = `toast toast-${type}`;
        const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
        el.innerHTML = `<span>${icons[type] || ''}</span><span>${msg}</span>`;
        c.appendChild(el);
        setTimeout(() => {
            el.style.animation = 'slideInRight 0.3s ease reverse';
            setTimeout(() => el.remove(), 300);
        }, 3000);
    }
    // ============ SIDEBAR TOGGLE ============
    window.toggleSidebar = () => {
        const sb = document.getElementById('sidebar');
        window.innerWidth <= 768 ? sb.classList.toggle('open') : sb.classList.toggle('collapsed');
    };
    // ============ USER MENU ============
    window.toggleUserMenu = () => {
        document.getElementById('userMenu').classList.toggle('show');
    };
    document.addEventListener('click', (e) => {
        const menu = document.getElementById('userMenu');
        const trigger = document.querySelector('.user-trigger');
        if (menu && trigger && !trigger.contains(e.target) && !menu.contains(e.target)) {
            menu.classList.remove('show');
        }
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
                    <div class="profile-stat">
                    <div class="profile-stat-value">${userCases}</div>
                    <div class="profile-stat-label">Casos</div>
                    </div>
                    <div class="profile-stat">
                    <div class="profile-stat-value">${userBugs}</div>
                    <div class="profile-stat-label">Bugs</div>
                    </div>
                    <div class="profile-stat">
                    <div class="profile-stat-value">${userExecs}</div>
                    <div class="profile-stat-label">Ejecuciones</div>
                    </div>
                </div>
                </div>
                <div class="profile-info">
                <div class="profile-info-item">
                    <span class="profile-info-label">👤 Usuario</span>
                    <span class="profile-info-value">${currentUser.usuario}</span>
                </div>
                <div class="profile-info-item">
                    <span class="profile-info-label">🎭 Rol</span>
                    <span class="profile-info-value">${currentUser.rol}</span>
                </div>
                <div class="profile-info-item">
                    <span class="profile-info-label">🆔 ID</span>
                    <span class="profile-info-value">#${currentUser.id}</span>
                </div>
                <div class="profile-info-item">
                    <span class="profile-info-label">📊 Actividad</span>
                    <span class="profile-info-value">${userTraces} acciones registradas</span>
                </div>
                </div>
                <div style="margin-top:20px; padding-top:20px; border-top:1px solid var(--border);">
                <h4 style="margin-bottom:12px; font-size:0.9rem;">🔐 Cambiar Contraseña</h4>
                <div class="form-group">
                    <input type="password" id="newPass" placeholder="Nueva contraseña (mín. 6 caracteres)">
                </div>
                <button class="btn btn-outline" onclick="changePassword()" style="width:100%;">Actualizar contraseña</button>
                </div>
                <div class="modal-actions">
                <button class="btn btn-outline" onclick="closeModal()">Cerrar</button>
                </div>
            </div>
            </div>`;
        container.innerHTML = html;
        document.addEventListener('keydown', escCloseModal);
    };
    window.changePassword = () => {
        const newPass = document.getElementById('newPass').value;
        if (!newPass || newPass.length < 6) return toast('Mínimo 6 caracteres', 'error');
        const idx = appData.usuarios.findIndex(u => u.id === currentUser.id);
        if (idx >= 0) {
            appData.usuarios[idx].password = newPass;
            currentUser.password = newPass;
            saveData();
            toast('Contraseña actualizada', 'success');
            closeModal();
        }
    };
    // ============ NOTIFICATIONS ============
    window.toggleNotifications = () => {
        document.getElementById('notificationsPanel').classList.toggle('show');
        renderNotifications();
    };
    function updateNotificationBadge() {
        const badge = document.getElementById('notifBadge');
        if (badge) {
            const unread = notifications.filter(n => !n.read).length;
            badge.textContent = unread;
            badge.style.display = unread > 0 ? 'flex' : 'none';
        }
    }
    function renderNotifications() {
        const panel = document.getElementById('notificationsPanel');
        let html = `<div class="notifications-header">
            <span>🔔 Notificaciones</span>
            <button class="btn btn-sm btn-outline" onclick="clearNotifications()">Limpiar</button>
            </div>`;
        if (notifications.length === 0) {
            html += `<div class="notifications-empty">
                <div style="font-size:2rem; margin-bottom:8px;"></div>
                No hay notificaciones
                </div>`;
        } else {
            notifications.slice(-10).reverse().forEach(n => {
                html += `<div class="notification-item" onclick="markNotifRead('${n.id}')">
                    <div class="notification-title">${n.title}</div>
                    <div class="notification-desc">${n.desc}</div>
                    <div class="notification-time">${timeAgo(n.time)}</div>
                </div>`;
            });
        }
        panel.innerHTML = html;
    }
    window.markNotifRead = (id) => {
        const n = notifications.find(x => x.id === id);
        if (n) { n.read = true; saveData(); updateNotificationBadge(); }
    };
    window.clearNotifications = () => {
        notifications = [];
        saveData();
        updateNotificationBadge();
        renderNotifications();
    };
    function addNotification(title, desc) {
        notifications.push({
            id: Date.now().toString(),
            title, desc,
            time: new Date().toISOString(),
            read: false
        });
        if (notifications.length > 50) notifications = notifications.slice(-50);
        saveData();
        updateNotificationBadge();
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
        document.querySelectorAll('.nav-item').forEach(el =>
            el.addEventListener('click', () => navigateTo(el.dataset.page))
        );
        if (currentUser.rol === 'Consultor' && !consultorPages.includes(currentPage)) {
            currentPage = 'casos';
        }
        navigateTo(currentPage);
        document.getElementById('activeProjectSelect').value = getActiveProject();
        updateSidebarDisabledState();
    }
    window.onProjectChange = () => {
        appData.configuracion.activeProject = document.getElementById('activeProjectSelect').value;
        saveData();
        renderPage(currentPage);
        updateSidebarDisabledState();
    };
    function populateProjectSelector() {
        const sel = document.getElementById('activeProjectSelect');
        if (!sel) return;
        
        let projectsToShow = appData.proyectos || [];
        
        // Si es consultor, mostrar solo sus proyectos autorizados
        if (currentUser && currentUser.rol === 'Consultor' && currentUser.proyectosAutorizados && currentUser.proyectosAutorizados.length > 0) {
            projectsToShow = projectsToShow.filter(p => currentUser.proyectosAutorizados.includes(p.id));
        }
        
        sel.innerHTML = '<option value="">Todos los proyectos</option>';
        if (!Array.isArray(projectsToShow) || projectsToShow.length === 0) {
            sel.innerHTML = '<option value="">Sin proyectos disponibles</option>';
            return;
        }
        projectsToShow.forEach(p =>
            sel.innerHTML += `<option value="${p.id}" ${p.id === getActiveProject() ? 'selected' : ''}>${p.nombre || p.id}</option>`
        );
    }

    window.navigateTo = function (page) {
        // 1. Validación de permisos para Consultores
        if (currentUser.rol === 'Consultor' && !consultorPages.includes(page)) {
            toast('No tienes permiso para acceder a esta sección', 'error');
            return;
        }
        
        // 2. Bloquear acceso si no hay proyecto activo (excepto páginas exentas)
        const paginasExentas = ['dashboard', 'proyectos', 'usuarios', 'ajustes', 'permisos'];
        const requiereProyecto = projectRequiredPages.includes(page);
        if (requiereProyecto && !getActiveProject() && !paginasExentas.includes(page)) {
            toast('⚠️ Selecciona un proyecto antes de acceder a esta sección', 'warning');
            if (currentPage !== page) {
                page = 'dashboard';
            } else {
                return;
            }
        }
        
        // 3. Validación adicional para Consultores sin proyectos asignados
        if (currentUser.rol === 'Consultor' && projectRequiredPages.includes(page)) {
            if (!currentUser.proyectosAutorizados || currentUser.proyectosAutorizados.length === 0) {
                toast('No tienes proyectos asignados. Contacta al administrador.', 'error');
                page = 'dashboard';
            }
        }
        
        // 4. Navegación normal
        currentPage = page;
        saveLastPage(page);
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        const activeNav = document.querySelector(`[data-page="${page}"]`);
        if (activeNav) activeNav.classList.add('active');
        renderPage(page);
        
        // 5. Actualizar estado visual del sidebar
        updateSidebarDisabledState();
    };

    function updateSidebarDisabledState() {
        const proyectoActivo = getActiveProject();
        const paginasExentas = ['dashboard', 'proyectos', 'usuarios', 'ajustes'];
        
        document.querySelectorAll('.nav-item').forEach(item => {
            const page = item.dataset.page;
            
            // Si no hay proyecto activo y la página requiere proyecto
            if (!proyectoActivo && projectRequiredPages.includes(page) && !paginasExentas.includes(page)) {
                item.classList.add('disabled');
                item.title = 'Selecciona un proyecto primero';
            } else {
                item.classList.remove('disabled');
                item.removeAttribute('title');
            }
        });
    }

    function renderPage(page) {
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
        }
        content.innerHTML = html;
        bindPageEvents(page);
        const si = content.querySelector('.search-input');
        if (si) { si.focus(); si.setSelectionRange(si.value.length, si.value.length); }
    }
    function bindPageEvents(page) {
        const content = document.getElementById('contentArea');
        content.querySelector('.search-input')?.addEventListener('input', function (e) {
            searchTerm = e.target.value.toLowerCase();
            currentPages[page] = 1;
            renderPage(page);
        });
        content.querySelectorAll('[data-action]').forEach(btn =>
            btn.addEventListener('click', function () {
                handleAction(page, this.dataset.action, this.dataset.id);
            })
        );
        content.querySelectorAll('.pagination button').forEach(b =>
            b.addEventListener('click', function () {
                if (this.dataset.pg) { currentPages[page] = +this.dataset.pg; renderPage(page); }
            })
        );
        content.querySelector('.page-size-select')?.addEventListener('change', function () {
            pageSize = +this.value;
            currentPages[page] = 1;
            renderPage(page);
        });
        content.querySelectorAll('th[data-sort]').forEach(th =>
            th.addEventListener('click', function () {
                const f = this.dataset.sort;
                sortConfig = { field: f, dir: sortConfig.field === f && sortConfig.dir === 'asc' ? 'desc' : 'asc' };
                renderPage(page);
            })
        );
    }

    function renderConsultantPermissions() {
        const consultants = appData.usuarios.filter(u => u.rol === 'Consultor');
        let html = '<h1 class="page-title">🔐 Permisos de Consultores</h1>';
        if (consultants.length === 0) {
            html += '<div class="empty-state"><div class="empty-state-icon"></div><div>No hay consultores registrados</div></div>';
            return html;
        }
        html += '<div class="chart-grid">';
        consultants.forEach(consultant => {
            const projects = consultant.proyectosAutorizados || [];
            const projectNames = projects.map(pid => {
                const p = appData.proyectos.find(proj => proj.id === pid);
                return p ? (p.nombre || p.id) : pid;
            }).join(', ') || 'Ninguno';
            html += `
                <div class="chart-card">
                    <div class="chart-title">👤 ${consultant.nombre}</div>
                    <div style="margin-bottom:12px;"><strong>Usuario:</strong> ${consultant.usuario}</div>
                    <div style="margin-bottom:12px;"><strong>Proyectos autorizados:</strong> ${projects.length}</div>
                    <div style="padding:12px; background:var(--card-alt); border-radius:8px; font-size:0.9rem; min-height:40px;">
                        ${projectNames}
                    </div>
                    <button class="btn btn-outline btn-sm" style="margin-top:12px;" onclick="window.openModal('usuarios', ${consultant.id})">
                        ✏️ Editar Permisos
                    </button>
                </div>
            `;
        });
        html += '</div>';
        return html;
    }

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
            // Convertir id a número si es necesario para comparación estricta, 
            // ya que a veces viene como string desde el HTML
            const idNum = Number(id);
            const idx = arr.findIndex(x => x.id == id || x.id === idNum);

            if (idx >= 0) {
                // Eliminar del array
                arr.splice(idx, 1);

                // Registrar trazabilidad
                addTrace(page, 'Eliminación', id);

                try {
                    // Forzar guardado en Firebase
                    await saveData();

                    // Actualizar selectores si es necesario
                    if (page === 'proyectos' || page === 'usuarios') populateProjectSelector();

                    // Re-renderizar la página actual
                    renderPage(currentPage);

                    toast('Eliminado correctamente', 'warning');
                } catch (error) {
                    console.error("Error al eliminar:", error);
                    toast('Error al eliminar el registro', 'error');
                }
            } else {
                toast('No se encontró el registro para eliminar', 'error');
            }
        });
    }
    function handleVaciar() {
        showConfirmModal('⚠ ¿Deseas eliminar TODOS los datos de Firebase?<br><small>Esta acción no se puede deshacer.</small>', () => {
            appData = {
                usuarios: appData.usuarios, proyectos: [], objetivos: [], casos: [], bugs: [],
                ejecuciones: [], capturas: [], registroDiario: [], apis: [], mejoras: [],
                trazabilidad: [], notificaciones: [],
                configuracion: appData.configuracion
            };
            notifications = [];
            saveData();
            populateProjectSelector();
            navigateTo('dashboard');
            toast('Sistema vaciado', 'warning');
        }, true);
    }
    // ============ MODALS ============
    function showConfirmModal(message, onConfirm, danger = false) {
        const container = document.getElementById('modalContainer');
        const html = `
            <div class="modal-overlay">
            <div class="modal confirm-modal">
                <div class="icon-warning"></div>
                <p style="margin-bottom:20px; font-size:1rem; line-height:1.5; color:var(--text);">${message}</p>
                <div class="modal-actions" style="justify-content:center;">
                <button class="btn btn-outline" id="confirmCancelBtn">Cancelar</button>
                <button class="btn ${danger ? 'btn-danger' : 'btn-accent'}" id="confirmOkBtn">Confirmar</button>
                </div>
            </div>
            </div>`;
        container.innerHTML = html;
        document.getElementById('confirmCancelBtn').addEventListener('click', closeModal);
        document.getElementById('confirmOkBtn').addEventListener('click', () => {
            closeModal();
            if (onConfirm) onConfirm();
        });
        document.addEventListener('keydown', escCloseModal);
    }

    window.openModal = function (page, id, viewOnly = false) {
        const container = document.getElementById('modalContainer');
        let html = `<div class="modal-overlay"><div class="modal">
        <h3>${viewOnly ? '👁️ Detalle' : (id ? '✏️ Editar' : ' Nuevo')}</h3>`;
        html += generateForm(page, id, viewOnly);
        html += `<div class="modal-actions">
        ${!viewOnly ? `<button class="btn btn-accent" onclick="saveModal('${page}','${id || ''}')">💾 Guardar</button>` : ''}
        <button class="btn btn-outline" onclick="closeModal()">Cerrar</button>
        </div></div></div>`;
        container.innerHTML = html;
        if (page === 'capturas' && !viewOnly) {
            const fileInput = document.getElementById('f_archivos');
            if (fileInput) fileInput.addEventListener('change', handleCapturaFiles);
        }
        if (page === 'capturas' && viewOnly) {
            const previewDiv = document.getElementById('archivosPreview');
            if (previewDiv && id) {
                const item = getArrayForPage(page).find(x => x.id == id);
                if (item && item.archivos) {
                    const files = item.archivos.split(',').map(f => f.trim());
                    previewDiv.innerHTML = files.map(f => `<span>🖼️ ${f}</span>`).join('<br>');
                }
            }
        }
        document.addEventListener('keydown', escCloseModal);
    };

    window.closeModal = () => {
        document.getElementById('modalContainer').innerHTML = '';
        document.removeEventListener('keydown', escCloseModal);
    };
    function escCloseModal(e) { if (e.key === 'Escape') closeModal(); }
    function generateForm(page, id, viewOnly) {
        let item = id ? getArrayForPage(page).find(x => x.id == id) : null;
        const d = viewOnly ? 'disabled' : '';
        const projOpts = appData.proyectos.map(p =>
            `<option ${item?.proyecto === p.id ? 'selected' : ''}>${p.id}</option>`
        ).join('');
        // --- Generador de opciones de usuarios ---
        const userOpts = (selectedValue) => {
            let opts = '<option value="">Seleccionar responsable...</option>';
            if (appData.usuarios && appData.usuarios.length > 0) {
                opts += appData.usuarios.map(u =>
                    `<option value="${u.nombre}" ${selectedValue === u.nombre ? 'selected' : ''}>${u.nombre}</option>`
                ).join('');
            }
            return opts;
        };

        window.toggleProjectPermissions = function() {
            const roleSelect = document.getElementById('f_rol');
            const permDiv = document.getElementById('project-permissions');
            if (permDiv && roleSelect) {
                permDiv.style.display = roleSelect.value === 'Consultor' ? 'block' : 'none';
            }
        };
        const getCasosBugsOpts = (selectedValue) => {
            let opts = '<option value="">Ninguno / Seleccionar...</option>';
            if (appData.casos && appData.casos.length > 0) {
                opts += '<optgroup label="Casos de Prueba">';
                appData.casos.forEach(c => {
                    opts += `<option value="${c.id}" ${selectedValue === c.id ? 'selected' : ''}>${c.id} - ${c.titulo}</option>`;
                });
                opts += '</optgroup>';
            }
            if (appData.bugs && appData.bugs.length > 0) {
                opts += '<optgroup label="Bugs / Defectos">';
                appData.bugs.forEach(b => {
                    opts += `<option value="${b.id}" ${selectedValue === b.id ? 'selected' : ''}>${b.id} - ${b.titulo}</option>`;
                });
                opts += '</optgroup>';
            }
            return opts;
        };
        const renderCaptura = (itemId) => {
            if (!itemId) return '';
            const cap = appData.capturas.find(c => c.vinculo === itemId && c.archivos);
            if (cap) {
                return `<div class="form-group" style="margin-top: 15px;">
                <label>📸 Captura QA Vinculada</label>
                    <div style="background: var(--bg2); padding: 15px; border-radius: 8px; border: 1px solid var(--border); text-align: center;">
                        <img src="${cap.archivos}" style="max-height: 250px; max-width: 100%; border-radius: 4px; box-shadow: 0 4px 6px rgba(0,0,0,0.3);">
                        <div style="margin-top: 8px; font-size: 0.85rem; color: var(--text2);">${cap.descripcion || 'Evidencia visual adjunta'} (ID: ${cap.id})</div>
                    </div>
                </div>`;
            }
            return '';
        };
        let h = '';
        switch (page) {
            case 'proyectos':
            h += `<div class="form-group"><label>ID Proyecto</label><input value="${item?.id || 'PROY-' + Date.now()}" ${d} id="f_id"></div>
                <div class="form-group"><label>Nombre *</label><input value="${item?.nombre || ''}" ${d} id="f_nombre"></div>
                <div class="form-group"><label>Código Cliente</label><input value="${item?.codigoCliente || ''}" ${d} id="f_codigoCliente"></div>
                <div class="form-group"><label>Descripción</label><textarea ${d} id="f_descripcion">${item?.descripcion || ''}</textarea></div>
                <div class="form-group"><label>Responsable QA</label><select ${d} id="f_responsable">${userOpts(item?.responsable)}</select></div>
                <div class="form-group"><label>Fecha Inicio</label><input type="date" value="${item?.fechaInicio || ''}" ${d} id="f_fechaInicio"></div>
                <div class="form-group"><label>Fecha Fin</label><input type="date" value="${item?.fechaFin || ''}" ${d} id="f_fechaFin"></div>
                <div class="form-group"><label>Estado</label><select ${d} id="f_estado">
                <option ${item?.estado === 'Planificado' ? 'selected' : ''}>Planificado</option>
                <option ${item?.estado === 'Activo' ? 'selected' : ''}>Activo</option>
                <option ${item?.estado === 'Completado' ? 'selected' : ''}>Completado</option>
                </select></div>
                `;
            break;
            case 'objetivos':
            h += `<div class="form-group"><label>ID</label><input value="${item?.id || 'OBJ-' + Date.now()}" ${d} id="f_id"></div>
                <div class="form-group"><label>Objetivo *</label><input value="${item?.objetivo || ''}" ${d} id="f_objetivo"></div>
                <div class="form-group"><label>Descripción</label><textarea ${d} id="f_descripcion">${item?.descripcion || ''}</textarea></div>
                <div class="form-group"><label>Responsable</label><select ${d} id="f_responsable">${userOpts(item?.responsable)}</select></div>
                <div class="form-group"><label>Fecha Inicio</label><input type="date" value="${item?.fechaInicio || ''}" ${d} id="f_fechaInicio"></div>
                <div class="form-group"><label>Fecha Fin</label><input type="date" value="${item?.fechaFin || ''}" ${d} id="f_fechaFin"></div>
                <div class="form-group"><label>Estado</label><select ${d} id="f_estado">
                <option ${item?.estado === 'Pendiente' ? 'selected' : ''}>Pendiente</option>
                <option ${item?.estado === 'En progreso' ? 'selected' : ''}>En progreso</option>
                <option ${item?.estado === 'Finalizado' ? 'selected' : ''}>Finalizado</option>
                </select></div>
                `;
            break;
            case 'mejoras':
            h += `<div class="form-group"><label>ID</label><input value="${item?.id || 'MEJ-' + Date.now()}" ${d} id="f_id"></div>
                <div class="form-group"><label>Título *</label><input value="${item?.titulo || ''}" ${d} id="f_titulo"></div>
                <div class="form-group"><label>Tipo de Mejora</label><select ${d} id="f_tipo"><option>Mejora UX/UI</option><option>Nueva funcionalidad</option><option>Optimización Técnica</option></select></div>
                <div class="form-group"><label>Descripción</label><textarea ${d} id="f_descripcion">${item?.descripcion || ''}</textarea></div>
                <div class="form-group"><label>Estado</label><select ${d} id="f_estado">
                <option ${item?.estado === 'Pendiente de Revisión' ? 'selected' : ''}>Pendiente de Revisión</option>
                <option ${item?.estado === 'Aprobado' ? 'selected' : ''}>Aprobado</option>
                <option ${item?.estado === 'Descartado' ? 'selected' : ''}>Descartado</option>
                </select></div>
                `;
            break;
            case 'usuarios':
            const isConsultor = item?.rol === 'Consultor';
            const proyectosAutorizados = item?.proyectosAutorizados || [];
            h += `<div class="form-group"><label>ID</label><input value="${item?.id || Date.now()}" ${d} id="f_id" type="number"></div>
                <div class="form-group"><label>Nombre completo *</label><input value="${item?.nombre || ''}" ${d} id="f_nombre"></div>
                <div class="form-group"><label>Usuario *</label><input value="${item?.usuario || ''}" ${d} id="f_usuario"></div>
                <div class="form-group"><label>Contraseña *</label><input type="password" value="${item?.password || ''}" ${d} id="f_password"></div>
                <div class="form-group"><label>Rol</label><select ${d} id="f_rol" onchange="toggleProjectPermissions()"><option ${item?.rol === 'Admin' ? 'selected' : ''}>Admin</option><option ${item?.rol === 'Consultor' ? 'selected' : ''}>Consultor</option></select></div>
                <div class="form-group" id="project-permissions" style="${isConsultor ? '' : 'display:none;'}">
                    <label>📁 Proyectos Autorizados</label>
                    <div class="checkbox-list" style="max-height:200px; overflow-y:auto; border:1px solid var(--border); border-radius:8px; padding:10px;">
                        ${appData.proyectos.length === 0 ? '<div style="color:var(--text2); font-size:0.85rem;">No hay proyectos creados</div>' : 
                        appData.proyectos.map(p => `
                            <label class="checkbox-item" style="display:flex; align-items:center; gap:8px; padding:6px 0;">
                                <input type="checkbox" class="project-perm-cb" value="${p.id}" ${proyectosAutorizados.includes(p.id) ? 'checked' : ''}>
                                <span>${p.nombre || p.id}</span>
                            </label>
                        `).join('')}
                    </div>
                    <small style="color:var(--text2); display:block; margin-top:8px;">Selecciona los proyectos que este consultor podrá ver y gestionar</small>
                </div>`;
                break;            
                case 'casos':
                h += `<div class="form-group"><label>ID Caso</label><input value="${item?.id || 'CASO-' + Date.now()}" ${d} id="f_id"></div>
                <div class="form-group"><label>Proyecto</label><select ${d} id="f_proyecto">${projOpts}</select></div>
                <div class="form-group"><label>Prioridad</label><select ${d} id="f_prioridad">
                <option ${item?.prioridad === 'Crítica' ? 'selected' : ''}>Crítica</option>
                <option ${item?.prioridad === 'Alta' ? 'selected' : ''}>Alta</option>
                <option ${item?.prioridad === 'Media' ? 'selected' : ''}>Media</option>
                <option ${item?.prioridad === 'Baja' ? 'selected' : ''}>Baja</option>
                </select></div>
                <div class="form-group"><label>Título *</label><input value="${item?.titulo || ''}" ${d} id="f_titulo"></div>
                <div class="form-group"><label>Actor</label><input value="${item?.actor || ''}" ${d} id="f_actor"></div>
                <div class="form-group"><label>Descripción del Requisito</label><textarea ${d} id="f_descripcion">${item?.descripcion || ''}</textarea></div>
                <div class="form-group"><label>Flujo de Pasos</label><textarea ${d} id="f_flujo">${item?.flujo || ''}</textarea></div>
                <div class="form-group"><label>Input del Cliente</label><input value="${item?.inputCliente || ''}" ${d} id="f_inputCliente"></div>
                <div class="form-group"><label>Criterios de Aceptación (BDD)</label><textarea ${d} id="f_criterios">${item?.criterios || ''}</textarea></div>
                <div class="form-group"><label>Resultado Esperado</label><textarea ${d} id="f_resultadoEsperado">${item?.resultadoEsperado || ''}</textarea></div>
                <div class="form-group"><label>Estado de Ejecución</label>
                    <select ${d} id="f_estado">
                        <option ${item?.estado === 'Pendiente' ? 'selected' : ''}>Pendiente</option>
                        <option ${item?.estado === 'Pasado' ? 'selected' : ''}>Pasado</option>
                        <option ${item?.estado === 'Fallido' ? 'selected' : ''}>Fallido</option>
                    </select>
                </div>
                `;
                if (id) {
                    h += `<div id="commentsContainer_caso_${id}"></div>`;
                    setTimeout(() => {
                        renderCommentsSection('caso', id);
                    }, 50);
                }
                break;
                case 'bugs':
                h += `<div class="form-group"><label>ID Bug</label><input value="${item?.id || 'BUG-' + Date.now()}" ${d} id="f_id"></div>
                <div class="form-group"><label>Proyecto</label><select ${d} id="f_proyecto">${projOpts}</select></div>
                <div class="form-group"><label>Caso Relacionado</label><input value="${item?.casoRelacionado || ''}" ${d} id="f_casoRelacionado"></div>
                <div class="form-group"><label>Título *</label><input value="${item?.titulo || ''}" ${d} id="f_titulo"></div>
                <div class="form-group"><label>Resumen Técnico</label><textarea ${d} id="f_resumen">${item?.resumen || ''}</textarea></div>
                <div class="form-group"><label>Descripción Detallada</label><textarea ${d} id="f_descripcion">${item?.descripcion || ''}</textarea></div>
                <div class="form-group"><label>Severidad</label><select ${d} id="f_severidad">
                <option ${item?.severidad === 'Bloqueante' ? 'selected' : ''}>Bloqueante</option>
                <option ${item?.severidad === 'Crítica' ? 'selected' : ''}>Crítica</option>
                <option ${item?.severidad === 'Mayor' ? 'selected' : ''}>Mayor</option>
                <option ${item?.severidad === 'Menor' ? 'selected' : ''}>Menor</option>
                </select></div>
                <div class="form-group"><label>Estado</label><select ${d} id="f_estado">
                <option ${item?.estado === 'Abierto' ? 'selected' : ''}>Abierto</option>
                <option ${item?.estado === 'En revisión' ? 'selected' : ''}>En revisión</option>
                <option ${item?.estado === 'Solucionado' ? 'selected' : ''}>Solucionado</option>
                </select></div>
                `;
                if (id) {
                    h += `<div id="commentsContainer_bug_${id}"></div>`;
                    setTimeout(() => {
                        renderCommentsSection('bug', id);
                    }, 50);
                }
                break;
                case 'ejecuciones':
                const casosDisponibles = filterByProject(appData.casos);
                const casosAsociados = item?.casosAsociados ? (() => {
                    try {
                        const parsed = JSON.parse(item.casosAsociados);
                        if (Array.isArray(parsed)) return parsed.map(c => c.id);
                        return (item.casosAsociados || '').split(',').map(s => s.trim()).filter(Boolean);
                    } catch (e) { return []; }
                })() : [];
                h += `<div class="form-group"><label>ID Ejecución</label><input value="${item?.id || 'EJEC-' + Date.now()}" ${d} id="f_id"></div>
                <div class="form-group"><label>Nombre del Ciclo *</label><input value="${item?.nombreCiclo || ''}" ${d} id="f_nombreCiclo"></div>
                <div class="form-group"><label>Proyecto</label><select ${d} id="f_proyecto">${projOpts}</select></div>
                <div class="form-group"><label>Fecha</label><input type="date" value="${item?.fecha || ''}" ${d} id="f_fecha"></div>
                <div class="form-group"><label>Responsable QA</label><select ${d} id="f_responsable">${userOpts(item?.responsable)}</select></div>
                <div class="form-group"><label>📝 Notas Generales del Ciclo</label><textarea ${d} id="f_comentarios" placeholder="Notas sobre el entorno, versión u observaciones...">${item?.comentarios || ''}</textarea></div>
                <div class="form-group"><label>Casos Asociados</label>
                <div class="checkbox-list">
                ${casosDisponibles.length === 0 ? '<div style="color:var(--text2); font-size:0.85rem;">No hay casos disponibles</div>' :
                casosDisponibles.map(c => `
                        <label class="checkbox-item">
                        <input type="checkbox" class="caso-check" value="${c.id}" ${casosAsociados.includes(c.id) ? 'checked' : ''}>
                        <span><b>${c.id}</b> - ${c.titulo}</span>
                        </label>
                    `).join('')}
                    </div>
                </div>`;
                break;
                case 'diario':
                h += `<div class="form-group"><label>ID</label><input value="${item?.id || 'DIA-' + Date.now()}" ${d} id="f_id"></div>
                    <div class="form-group"><label>Colaborador QA</label><select ${d} id="f_colaborador">${userOpts(item?.colaborador || currentUser?.nombre)}</select></div>
                    <div class="form-group"><label>Mes</label><input type="month" value="${item?.mes || ''}" ${d} id="f_mes"></div>
                    <div class="form-group"><label>Fecha de la tarea</label><input type="date" value="${item?.fecha || ''}" ${d} id="f_fecha"></div>
                    <div class="form-group"><label>Descripción de actividad</label><textarea ${d} id="f_descripcion">${item?.descripcion || ''}</textarea></div>
                    <div class="form-group"><label>Horas invertidas</label><input type="number" step="0.5" value="${item?.horas || ''}" ${d} id="f_horas"></div>`;
                break;
                case 'capturas':
                h += `<div class="form-group"><label>ID Captura</label><input value="${item?.id || 'CAP-' + Date.now()}" id="f_id" ${d}></div>
                <div class="form-group"><label>Descripción del Error/Evidencia</label><input value="${item?.descripcion || ''}" id="f_descripcion" ${d}></div>
                <div class="form-group"><label>🔗 ID Caso o Bug Vinculado</label><select id="f_vinculo" ${d}>${getCasosBugsOpts(item?.vinculo)}</select></div>
                <div class="form-group">
                    <label>Subir Imagen</label>
                    <input type="file" id="f_archivos" accept="image/*" onchange="previsualizarCapturaQA(event, 'preview-box')" style="padding: 5px;" ${d}>
                    <div id="preview-box">${item?.archivos ? `<img src="${item.archivos}" style="max-height: 180px; border-radius: 8px; margin-top:10px; box-shadow: 0 4px 6px rgba(0,0,0,0.3);">` : ''}</div>
                    <input type="hidden" id="f_archivos_base64" value="${item?.archivos || ''}">
                </div>`;
                break;
                case 'apis':
                h += `<div class="form-group"><label>ID API</label><input value="${item?.id || 'API-' + Date.now()}" ${d} id="f_id"></div>
                    <div class="form-group"><label>Nombre API</label><input value="${item?.nombre || ''}" ${d} id="f_nombre"></div>
                    <div class="form-group"><label>Endpoint</label><input value="${item?.endpoint || ''}" ${d} id="f_endpoint"></div>
                    <div class="form-group"><label>Método</label><select ${d} id="f_metodo">
                    <option ${item?.metodo === 'GET' ? 'selected' : ''}>GET</option>
                    <option ${item?.metodo === 'POST' ? 'selected' : ''}>POST</option>
                    <option ${item?.metodo === 'PUT' ? 'selected' : ''}>PUT</option>
                    <option ${item?.metodo === 'DELETE' ? 'selected' : ''}>DELETE</option>
                    </select></div>
                    <div class="form-group"><label>Request</label><textarea ${d} id="f_request">${item?.request || ''}</textarea></div>
                    <div class="form-group"><label>Response esperada</label><textarea ${d} id="f_respEsperada">${item?.respEsperada || ''}</textarea></div>
                    <div class="form-group"><label>Estado</label><select ${d} id="f_estado">
                    <option ${item?.estado === 'Correcta' ? 'selected' : ''}>Correcta</option>
                    <option ${item?.estado === 'Error' ? 'selected' : ''}>Error</option>
                    <option ${item?.estado === 'Pendiente' ? 'selected' : ''}>Pendiente</option>
                    </select></div>
                    `;
                    if (id) {
                        h += `<div id="commentsContainer_api_${id}"></div>`;
                        setTimeout(() => {
                            renderCommentsSection('api', id);
                        }, 50);
                    }
                    break;
        }
        return h;
    }
    window.handleCapturaFiles = function (event) {
        const input = event.target;
        const preview = document.getElementById('archivosPreview');
        if (preview) {
            preview.innerHTML = '';
            if (input.files && input.files.length > 0) {
                Array.from(input.files).forEach(file => {
                    if (file.type.startsWith('image/')) {
                        const reader = new FileReader();
                        reader.onload = function (e) {
                            const img = document.createElement('img');
                            img.src = e.target.result;
                            img.className = 'img-thumb';
                            img.title = file.name;
                            preview.appendChild(img);
                        };
                        reader.readAsDataURL(file);
                    } else {
                        const span = document.createElement('span');
                        span.textContent = `📎 ${file.name}`;
                        preview.appendChild(span);
                    }
                });
            } else {
                preview.textContent = 'Ningún archivo seleccionado';
            }
        }
    };
    window.saveModal = function (page, id) {
        const arr = getArrayForPage(page);
        const data = {};
        // 1. Atrapa dinámicamente TODOS los campos del modal que empiecen por "f_" 
        const formElements = document.querySelectorAll('.modal [id^="f_"]');
        formElements.forEach(el => {
            const fieldName = el.id.replace('f_', '');
            data[fieldName] = el.value;
        });

        if (!data.id) return (typeof showToast === 'function' ? showToast('ID requerido', 'error') : toast('ID requerido', 'error'));

        // 2. REQUERIMIENTO CLAVE: Vincular al proyecto activo 
        const modulosConProyecto = ['casos', 'bugs', 'ejecuciones', 'capturas', 'diario', 'apis', 'objetivos', 'mejoras'];
        if (modulosConProyecto.includes(page)) {
            data.proyecto = getActiveProject(); // <-- Aquí forzamos que se guarde en el proyecto actual 
        }

        // 3. Lógica Especial (Ejecuciones Xray y Capturas Base64) 
        if (page === 'ejecuciones') {
            // CORREGIDO: Usar '.caso-check' en lugar de '.exec-case-cb'
            const checked = Array.from(document.querySelectorAll('.caso-check:checked')).map(cb => cb.value);
            let oldCases = [];
            if (id) {
                const existingItem = arr.find(x => x.id == id);
                try { oldCases = JSON.parse(existingItem.casosAsociados || '[]'); } catch (e) { }
            }
            const newCasesData = checked.map(cId => {
                const existing = oldCases.find(oc => oc.id === cId);
                return { id: cId, status: existing ? existing.status : 'Pendiente' };
            });
            data.casosAsociados = JSON.stringify(newCasesData);
        }

        if (page === 'capturas') {
            const base64Input = document.getElementById('f_archivos_base64');
            if (base64Input && base64Input.value) {
                data.archivos = base64Input.value;
            }
        }

        if (page === 'usuarios') {
            const roleSelect = document.getElementById('f_rol');
            if (roleSelect && roleSelect.value === 'Consultor') {
                const authorizedProjects = Array.from(document.querySelectorAll('.project-perm-cb:checked')).map(cb => cb.value);
                data.proyectosAutorizados = authorizedProjects;
            } else {
                data.proyectosAutorizados = [];
            }
        }

        // Marcar quién crea el registro (aislamiento de consultores)
        if (!id) {
            // Solo en creación nueva, no al editar
            data.creadoPor = currentUser.id;
        }

        // 4. Guardar o Actualizar Array 
        if (id) {
            const idx = arr.findIndex(x => x.id == id);
            if (idx >= 0) arr[idx] = { ...arr[idx], ...data };
        } else {
            arr.push(data);
            if (page === 'proyectos') populateProjectSelector();
        }

        saveData();
        closeModal();
        renderPage(currentPage);
        if (typeof showToast === 'function') showToast('Guardado correctamente', 'success');
        else if (typeof toast === 'function') toast('Guardado correctamente', 'success');
    };
    function getArrayForPage(p) {
        return {
            proyectos: appData.proyectos,
            usuarios: appData.usuarios,
            casos: appData.casos,
            bugs: appData.bugs,
            ejecuciones: appData.ejecuciones,
            capturas: appData.capturas,
            apis: appData.apis,
            diario: appData.registroDiario,
            mejoras: appData.mejoras,
            objetivos: appData.objetivos,
            trazabilidad: appData.trazabilidad
        }[p] || [];
    }
    function addTrace(page, event, entity) {
        appData.trazabilidad.push({
            id: Date.now() + Math.random(),
            fechaHora: new Date().toISOString(),
            usuario: currentUser?.usuario || 'sistema',
            proyecto: getActiveProject() || 'General',
            tipoEvento: event,
            descripcion: `${event} en ${page}`,
            entidadAfectada: entity
        });
        if (appData.trazabilidad.length > 500) appData.trazabilidad = appData.trazabilidad.slice(-400);
    }
    // ============ GENERIC TABLE ============
    function renderTable(page, cols, data, rowFn, showActions = true) {
        // Si no hay datos, mostrar mensaje
        if (!data || !Array.isArray(data)) {
            data = [];
        }
        
        // Filtrar por término de búsqueda
        let filtered = searchTerm ? data.filter(i => JSON.stringify(i).toLowerCase().includes(searchTerm)) : data;
        
        // Ordenar si está configurado
        if (sortConfig.field) {
            filtered.sort((a, b) =>
                (a[sortConfig.field] || '').toString().localeCompare((b[sortConfig.field] || '').toString()) *
                (sortConfig.dir === 'asc' ? 1 : -1)
            );
        }
        
        const totalPages = Math.ceil(filtered.length / pageSize) || 1;
        const pg = Math.min(currentPages[page] || 1, totalPages);
        currentPages[page] = pg;
        const paged = filtered.slice((pg - 1) * pageSize, pg * pageSize);
        
        let h = `<div class="table-container"><div class="table-toolbar">
            <input class="search-input" placeholder=" Buscar..." value="${searchTerm}">
            <select class="page-size-select">
            <option ${pageSize === 5 ? 'selected' : ''}>5</option>
            <option ${pageSize === 10 ? 'selected' : ''}>10</option>
            <option ${pageSize === 25 ? 'selected' : ''}>25</option>
            <option ${pageSize === 50 ? 'selected' : ''}>50</option>
            </select>
            <span style="color:var(--text2); font-size:0.85rem;">${filtered.length} resultados</span>
            ${showActions ? `<button class="btn btn-accent btn-sm" data-action="create">➕ Nuevo</button>` : ''}
            </div><div style="overflow-x:auto;"><table><thead><tr>`;
        
        cols.forEach(c => h += `<th data-sort="${c.field}">${c.label} ${sortConfig.field === c.field ? (sortConfig.dir === 'asc' ? '▲' : '▼') : ''}</th>`);
        if (showActions) h += '<th style="width:120px;">Acciones</th>';
        h += '</tr></thead><tbody>';
        
        if (paged.length === 0) {
            h += `<tr><td colspan="${cols.length + (showActions ? 1 : 0)}" style="text-align:center;padding:40px;">
            <div class="empty-state-icon"></div>
            <div style="color:var(--text2);">No hay registros</div>
            </td></tr>`;
        }
        
        // Renderizar solo las filas visibles (mejora de rendimiento)
        paged.forEach(item => {
            h += `<tr>${rowFn(item)}`;
            if (showActions) h += `<td class="actions-cell">
            <button data-action="view" data-id="${item.id}" title="Ver">👁</button>
            <button data-action="edit" data-id="${item.id}" title="Editar">✏️</button>
            <button data-action="delete" data-id="${item.id}" title="Eliminar">🗑️</button>
            </td>`;
            h += `</tr>`;
        });
        
        h += `</tbody></table></div>`;
        
        // Paginación optimizada
        if (totalPages > 1) {
            h += `<div class="pagination">`;
            if (pg > 1) {
                h += `<button data-pg="${pg - 1}">◀ Anterior</button>`;
            }
            for (let i = 1; i <= totalPages; i++) {
                if (i === 1 || i === totalPages || (i >= pg - 2 && i <= pg + 2)) {
                    h += `<button data-pg="${i}" class="${i === pg ? 'active-page-btn' : ''}">${i}</button>`;
                } else if (i === pg - 3 || i === pg + 3) {
                    h += `<button disabled style="opacity:0.5;">...</button>`;
                }
            }
            if (pg < totalPages) {
                h += `<button data-pg="${pg + 1}">Siguiente ▶</button>`;
            }
            h += `</div>`;
        }
        
        return h + '</div>';
    }



    const itemsPerPage = 10; // Límite de elementos por página
    function generarPaginador(totalItems, currentPage, funcionCambioPagina) {
        const totalPages = Math.ceil(totalItems / itemsPerPage);
        let htmlPaginador = '<div class="pagination" style="display: flex; gap: 8px; justify-content: center; margin-top: 20px;">';
        if (totalPages > 1) {
            for (let i = 1; i <= totalPages; i++) {
                const activeStyle = (i === currentPage)
                    ? 'background: var(--accent-blue); color: white; border-color: var(--accent-blue);'
                    : 'background: var(--card-bg); color: var(--text-main);';
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
        if (ap) result = result.filter(i => (i[key] || i.proyecto) === ap);
        // Admin ve TODO, consultor solo lo suyo
        if (currentUser && currentUser.rol === 'Consultor') {
            result = result.filter(i => i.creadoPor === currentUser.id);
        }
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
        let h = `<h1 class="page-title">📊 Dashboard</h1>
            <p class="page-subtitle">Resumen general del proyecto activo</p>
            <div class="kpi-grid">
            <div class="kpi-card">
            <div class="kpi-icon">📁</div>
            <div class="kpi-value">${proysActivos}</div>
            <div class="kpi-label">Proyectos Activos</div>
            </div>
            <div class="kpi-card">
            <div class="kpi-icon">📋</div>
            <div class="kpi-value">${casos.length}</div>
            <div class="kpi-label">Casos de Uso</div>
            <div class="kpi-trend up">✅ ${casosPasados} pasados</div>
            </div>
            <div class="kpi-card">
            <div class="kpi-icon">🐛</div>
            <div class="kpi-value">${bugsAbiertos}</div>
            <div class="kpi-label">Bugs Abiertos</div>
            <div class="kpi-trend ${bugsAbiertos > 5 ? 'down' : 'up'}">${bugsSolucionados} solucionados</div>
            </div>
            <div class="kpi-card">
            <div class="kpi-icon">🎯</div>
            <div class="kpi-value">${cobertura}%</div>
            <div class="kpi-label">Cobertura</div>
            <div class="kpi-trend up">Casos ejecutados</div>
            </div>
            <div class="kpi-card">
            <div class="kpi-icon">⚡</div>
            <div class="kpi-value">${tasaDefectos}%</div>
            <div class="kpi-label">Tasa Defectos</div>
            <div class="kpi-trend ${tasaDefectos > 30 ? 'down' : 'up'}">Bugs/Casos</div>
            </div>
            <div class="kpi-card">
            <div class="kpi-icon">🔌</div>
            <div class="kpi-value">${apisOk}/${apis.length}</div>
            <div class="kpi-label">APIs OK</div>
            <div class="kpi-trend up">Endpoints</div>
            </div>
            </div>`;
        h += `<div class="chart-grid">
${renderBarChart('Estado de Casos', [
            { label: 'Pasados', value: casosPasados, color: '#10b981' },
            { label: 'Fallidos', value: casosFallidos, color: '#ef4444' },
            { label: 'Pendientes', value: casos.length - casosPasados - casosFallidos, color: '#94a3b8' }
        ])}
${renderDonutChart('Severidad Bugs', [
            { label: 'Bloqueante', value: bugs.filter(b => b.severidad === 'Bloqueante').length, color: '#ef4444' },
            { label: 'Crítica', value: bugs.filter(b => b.severidad === 'Crítica').length, color: '#f59e0b' },
            { label: 'Mayor', value: bugs.filter(b => b.severidad === 'Mayor').length, color: '#3b82f6' },
            { label: 'Menor', value: bugs.filter(b => b.severidad === 'Menor').length, color: '#10b981' }
        ])}
</div><br>`;
        const recentTraces = appData.trazabilidad.slice(-5).reverse();
        if (recentTraces.length > 0) {
            h += `<div class="chart-card">
                <div class="chart-title">🕐 Actividad Reciente</div>
                <div style="display:flex; flex-direction:column; gap:10px;">`;
            recentTraces.forEach(t => {
                h += `<div style="display:flex; justify-content:space-between; padding:10px 14px; background:var(--card-alt); border-radius:8px; border:1px solid var(--border);">
                    <div>
                    <div style="font-weight:600; font-size:0.88rem;">${t.tipoEvento}</div>
                    <div style="font-size:0.78rem; color:var(--text2);">${t.descripcion} · ${t.entidadAfectada}</div>
                    </div>
                    <div style="font-size:0.75rem; color:var(--text2);">${timeAgo(t.fechaHora)}</div>
                </div>`;
            });
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
            bars += `<rect x="${x}" y="${160 - height}" width="50" height="${height}" fill="${d.color}" rx="4"/>
                <text x="${x + 25}" y="${155 - height}" text-anchor="middle" fill="var(--text)" font-size="12" font-weight="700">${d.value}</text>
                <text x="${x + 25}" y="180" text-anchor="middle" fill="var(--text2)" font-size="10">${d.label}</text>`;
        });
        return `<div class="chart-card">
            <div class="chart-title">📊 ${title}</div>
            <svg class="chart-svg" viewBox="0 0 320 200">
            <line x1="30" y1="160" x2="300" y2="160" stroke="var(--border)" stroke-width="1"/>
            ${bars}
            </svg>
            <div style="text-align:center; font-size:0.8rem; color:var(--text2); margin-top:8px;">Total: ${total}</div>
            </div>`;
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
        data.forEach(d => {
            legend += `<div style="display:flex; align-items:center; gap:8px; font-size:0.8rem;">
                <div style="width:12px; height:12px; background:${d.color}; border-radius:3px;"></div>
                <span>${d.label}: <b>${d.value}</b></span>
                </div>`;
        });
        return `<div class="chart-card">
            <div class="chart-title">🍩 ${title}</div>
            <div style="display:flex; align-items:center; gap:20px; flex-wrap:wrap;">
            <svg class="chart-svg" viewBox="0 0 200 200" style="max-width:180px;">
                ${paths}
                <text x="100" y="100" text-anchor="middle" fill="var(--text)" font-size="20" font-weight="700">${total}</text>
                <text x="100" y="118" text-anchor="middle" fill="var(--text2)" font-size="10">Total</text>
            </svg>
            <div style="display:flex; flex-direction:column; gap:6px;">${legend}</div>
            </div>
            </div>`;
    }
    // ============ PAGES ============
    function renderProyectos() {
        const cols = [{ label: 'ID', field: 'id' }, { label: 'Nombre', field: 'nombre' }, { label: 'Cliente', field: 'codigoCliente' }, { label: 'Responsable', field: 'responsable' }, { label: 'Inicio', field: 'fechaInicio' }, { label: 'Fin', field: 'fechaFin' }, { label: 'Estado', field: 'estado' }];
        return '<h1 class="page-title">📁 Proyectos</h1>' + renderTable('proyectos', cols, appData.proyectos, i =>
            `<td><code>${i.id}</code></td><td><b>${i.nombre || ''}</b></td><td>${i.codigoCliente || '-'}</td><td>${i.responsable || '-'}</td><td>${i.fechaInicio || '-'}</td><td>${i.fechaFin || '-'}</td><td><span class="badge ${i.estado === 'Activo' ? 'badge-success' : i.estado === 'Completado' ? 'badge-info' : 'badge-warning'}">${i.estado || 'Planificado'}</span></td>`
        );
    }
    function renderObjetivos() {
        const data = filterByProject(appData.objetivos);
        const cols = [{ label: 'ID' }, { label: 'Objetivo' }, { label: 'Responsable' }, { label: 'Inicio' }, { label: 'Fin' }, { label: 'Estado' }];
        return '<h1 class="page-title">🎯 Objetivos</h1>' +
            renderTable('objetivos', cols, data, i => `<td>${i.id}</td><td>${i.objetivo || ''}</td><td>${i.responsable || '-'}</td><td>${i.fechaInicio || '-'}</td><td>${i.fechaFin || '-'}</td><td><span class="badge ${i.estado === 'Finalizado' ? 'badge-success' : i.estado === 'En progreso' ? 'badge-info' : 'badge-warning'}">${i.estado || 'Pendiente'}</span></td>`);
    }
    function renderMejoras() {
        const data = filterByProject(appData.mejoras);
        const cols = [{ label: 'ID' }, { label: 'Título' }, { label: 'Tipo' }, { label: 'Estado' }];
        return '<h1 class="page-title">💡 Propuestas</h1>' +
            renderTable('mejoras', cols, data, i => `<td>${i.id}</td><td>${i.titulo || ''}</td><td>${i.tipo || '-'}</td><td><span class="badge ${i.estado === 'Aprobado' ? 'badge-success' : i.estado === 'Descartado' ? 'badge-danger' : 'badge-warning'}">${i.estado || 'Pendiente'}</span></td>`);
    }
    function renderUsuarios() {
        const cols = [{ label: 'ID', field: 'id' }, { label: 'Nombre', field: 'nombre' }, { label: 'Usuario', field: 'usuario' }, { label: 'Rol', field: 'rol' }];
        return '<h1 class="page-title">👥 Gestión de Usuarios</h1>' + renderTable('usuarios', cols, appData.usuarios, i =>
            `<td><code>${i.id}</code></td><td><b>${i.nombre || ''}</b></td><td>${i.usuario || ''}</td><td><span class="badge badge-info">${i.rol || 'Consultor'}</span></td>`
        );
    }
    function renderCasos() {
        const data = filterByProject(appData.casos);
        const cols = [{ label: 'ID', field: 'id' }, { label: 'Título', field: 'titulo' }, { label: 'Prioridad', field: 'prioridad' }, { label: 'Actor', field: 'actor' }, { label: 'Estado', field: 'estado' }];
        return '<h1 class="page-title">📋 Casos de Uso</h1>' + renderTable('casos', cols, data, i =>
            `<td><code>${i.id}</code></td><td><b>${i.titulo || ''}</b></td><td><span class="badge ${i.prioridad === 'Crítica' ? 'badge-danger' : i.prioridad === 'Alta' ? 'badge-warning' : 'badge-info'}">${i.prioridad || 'Media'}</span></td><td>${i.actor || '-'}</td><td><span class="badge ${i.estado === 'Pasado' ? 'badge-success' : i.estado === 'Fallido' ? 'badge-danger' : 'badge-neutral'}">${i.estado || 'Pendiente'}</span></td>`
        );
    }
    function renderDiario() {
        // Ahora filtramos por el proyecto activo
        const data = filterByProject(appData.registroDiario);
        const cols = [{ label: 'ID' }, { label: 'Colaborador' }, { label: 'Fecha' }, { label: 'Horas' }];
        const total = data.reduce((s, i) => s + (+i.horas || 0), 0);
        return '<h1 class="page-title">📝 Registro Diario</h1>' +
            renderTable('diario', cols, data, i => `<td>${i.id}</td><td>${i.colaborador || '-'}</td><td>${i.fecha || '-'}</td><td>${i.horas || '0'}h</td>`) +
            `<div class="kpi-card" style="margin-top:20px; max-width: 250px;"><div class="kpi-value">${total}h</div><div class="kpi-label">Total Horas Proyecto</div></div>`;
    }
    function renderCapturas() {
        const data = filterByProject(appData.capturas);
        const cols = [{ label: 'ID' }, { label: 'Descripción' }, { label: 'Vinculo' }, { label: 'Evidencia Visual' }];
        return '<h1 class="page-title">📸 Capturas QA</h1>' + renderTable('capturas', cols, data, i => {
            // Si hay una imagen guardada, la renderizamos. Si le hacen clic, se abre en grande.
            const imgHtml = i.archivos && i.archivos.startsWith('data:image')
                ? `<img src="${i.archivos}" style="height: 50px; border-radius: 6px; cursor: pointer; border: 1px solid var(--border);" onclick="window.open('${i.archivos}')">`
                : '<span style="color:var(--text2); font-size:0.8rem;">Sin imagen</span>';
            return `<td>${i.id}</td><td><b>${i.descripcion || '-'}</b></td><td><span class="badge badge-info">${i.vinculo || '-'}</span></td><td>${imgHtml}</td>`;
        });
    }
    function renderApis() {
        const data = filterByProject(appData.apis);
        const cols = [{ label: 'ID' }, { label: 'Nombre' }, { label: 'Endpoint' }, { label: 'Método' }, { label: 'Estado' }];
        return '<h1 class="page-title">🔌 APIs</h1>' +
            renderTable('apis', cols, data, i => `<td>${i.id}</td><td>${i.nombre || '-'}</td><td>${i.endpoint || '-'}</td><td>${i.metodo || 'GET'}</td><td><span class="badge ${i.estado === 'Correcta' ? 'badge-success' : i.estado === 'Error' ? 'badge-danger' : 'badge-warning'}">${i.estado || 'Pendiente'}</span></td>`);
    }
    function renderTrazabilidad() {
        const cols = [{ label: 'Fecha', field: 'fechaHora' }, { label: 'Usuario', field: 'usuario' }, { label: 'Proyecto', field: 'proyecto' }, { label: 'Evento', field: 'tipoEvento' }, { label: 'Descripción', field: 'descripcion' }, { label: 'Entidad', field: 'entidadAfectada' }];
        return '<h1 class="page-title">🔍 Trazabilidad</h1>' + '<button class="btn" style="background: var(--danger);" onclick="clearLogs()">🗑️ Limpiar Historial</button>' + renderTable('trazabilidad', cols, appData.trazabilidad.slice().reverse(), i =>
            `<td>${new Date(i.fechaHora).toLocaleString()}</td><td>${i.usuario || '-'}</td><td>${i.proyecto || '-'}</td><td><span class="badge badge-info">${i.tipoEvento || ''}</span></td><td>${i.descripcion || ''}</td><td><code>${i.entidadAfectada || '-'}</code></td>`, false
        );
    }
    // Función para borrar los logs de trazabilidad
    window.clearLogs = function () {
        if (confirm('⚠️ ¿Estás seguro de que quieres borrar todos los logs de trazabilidad? Esta acción no se puede deshacer.')) {
            // Limpiamos el array de trazabilidad
            appData.trazabilidad = [];
            // Guardamos los cambios en Firebase
            saveData();
            // Recargamos la página para que la tabla se vea vacía
            renderPage('trazabilidad');
            toast('Logs eliminados correctamente', 'success');
            addNotification('🗑️ Historial borrado', 'Se han eliminado todos los registros de trazabilidad');
        }
    };
    function renderBugs() {
        const data = filterByProject(appData.bugs).filter(b => b.estado !== 'Solucionado');
        const cols = [{ label: 'ID', field: 'id' }, { label: 'Título', field: 'titulo' }, { label: 'Severidad', field: 'severidad' }, { label: 'Caso', field: 'casoRelacionado' }, { label: 'Estado', field: 'estado' }];
        return '<h1 class="page-title">🐛 Bugs Activos</h1>' + renderTable('bugs', cols, data, i =>
            `<td><code>${i.id}</code></td><td><b>${i.titulo}</b></td><td><span class="badge ${i.severidad === 'Bloqueante' ? 'badge-danger' : i.severidad === 'Crítica' ? 'badge-warning' : 'badge-info'}">${i.severidad}</span></td><td><code>${i.casoRelacionado || '-'}</code></td><td><span class="badge ${i.estado === 'Abierto' ? 'badge-danger' : 'badge-warning'}">${i.estado}</span></td>`
        );
    }
    function renderHistorico() {
        const data = filterByProject(appData.bugs).filter(b => b.estado === 'Solucionado');
        const cols = [{ label: 'ID Bug', field: 'id' }, { label: 'Título', field: 'titulo' }, { label: 'Severidad', field: 'severidad' }, { label: 'Resolución', field: 'estado' }];
        return '<h1 class="page-title">📦 Histórico de Calidad</h1>' + renderTable('historico', cols, data, i =>
            `<td><code>${i.id}</code></td><td><b>${i.titulo}</b></td><td><span class="badge badge-neutral">${i.severidad}</span></td><td><span class="badge badge-success">✅ Solucionado</span></td>`, false
        );
    }
    function renderEjecuciones() {
        const data = filterByProject(appData.ejecuciones);
        let html = `<h1 class="page-title">▶️ Test Execution (Xray View)</h1>
            <p class="page-subtitle">Gestiona ciclos de prueba con matriz de ejecución estilo Xray</p>
            <button class="btn btn-accent" data-action="create" style="margin-bottom:20px;">➕ Nuevo Test Plan</button>`;
        if (data.length === 0) {
            html += `<div class="empty-state">
            <div class="empty-state-icon">📭</div>
            <div class="empty-state-title">No hay Test Plans</div>
            <div class="empty-state-desc">Crea un nuevo plan de pruebas para comenzar</div>
            </div>`;
            return html;
        }
        html += '<div class="xray-container">';
        data.forEach(tp => {
            let casos = [];
            try { casos = JSON.parse(tp.casosAsociados || '[]'); } catch (e) { }
            const stats = {
                Passed: casos.filter(c => c.status === 'Passed').length,
                Failed: casos.filter(c => c.status === 'Failed').length,
                'In Progress': casos.filter(c => c.status === 'In Progress').length,
                Blocked: casos.filter(c => c.status === 'Blocked').length,
                Pendiente: casos.filter(c => c.status === 'Pendiente' || !c.status).length
            };
            const total = casos.length || 1;
            const progressPct = ((stats.Passed + stats.Failed + stats.Blocked) / total) * 100;
            html += `<div class="xray-plan-card">
                <div class="xray-plan-header">
                    <div>
                    <div class="xray-plan-title">
                        <span class="badge badge-info">📝 ${tp.id}</span>
                        ${tp.nombreCiclo}
                    </div>
                    <div class="xray-plan-meta">
                        <span>📅 ${tp.fecha || 'Sin fecha'}</span>
                        <span>👤 ${tp.responsable || 'Sin asignar'}</span>
                        <span>📋 ${casos.length} casos</span>
                    </div>
                    </div>
                    <div class="actions-cell">
                    <button data-action="edit" data-id="${tp.id}" title="Editar">✏️</button>
                    <button data-action="delete" data-id="${tp.id}" title="Eliminar">️🗑️</button>
                    </div>
                </div>
                <div class="xray-progress">
                    <div class="xray-progress-bar">
                    <div class="xray-progress-segment passed" style="width:${(stats.Passed / total) * 100}%"></div>
                    <div class="xray-progress-segment failed" style="width:${(stats.Failed / total) * 100}%"></div>
                    <div class="xray-progress-segment progress" style="width:${(stats['In Progress'] / total) * 100}%"></div>
                    <div class="xray-progress-segment blocked" style="width:${(stats.Blocked / total) * 100}%"></div>
                    <div class="xray-progress-segment pending" style="width:${(stats.Pendiente / total) * 100}%"></div>
                    </div>
                    <div style="font-weight:700; color:var(--accent2); min-width:50px;">${Math.round(progressPct)}%</div>
                </div>
                <div class="xray-progress-stats">
                    <div class="xray-stat"><div class="xray-stat-dot" style="background:#10b981;"></div>Pasados: ${stats.Passed}</div>
                    <div class="xray-stat"><div class="xray-stat-dot" style="background:#ef4444;"></div>Fallidos: ${stats.Failed}</div>
                    <div class="xray-stat"><div class="xray-stat-dot" style="background:#3b82f6;"></div>En progreso: ${stats['In Progress']}</div>
                    <div class="xray-stat"><div class="xray-stat-dot" style="background:#f59e0b;"></div>Bloqueados: ${stats.Blocked}</div>
                    <div class="xray-stat"><div class="xray-stat-dot" style="background:#94a3b8;"></div>Pendientes: ${stats.Pendiente}</div>
                </div>
                <div class="xray-matrix" style="margin-top:16px;">
                    <div class="xray-matrix-header">
                    <div>Caso de Uso</div>
                    <div>Prioridad</div>
                    <div>Actor</div>
                    <div>Estado</div>
                    </div>`;
            if (casos.length === 0) {
                html += `<div style="padding:30px; text-align:center; color:var(--text2);">Sin casos vinculados</div>`;
            } else {
                casos.forEach(c => {
                    const caseRef = filterByProject(appData.casos).find(tc => tc.id === c.id);
                    const title = caseRef ? caseRef.titulo : '(Eliminado)';
                    const prioridad = caseRef?.prioridad || '-';
                    const actor = caseRef?.actor || '-';
                    const statusClass = {
                        'Passed': 'status-passed',
                        'Failed': 'status-failed',
                        'In Progress': 'status-progress',
                        'Blocked': 'status-blocked',
                        'Pendiente': 'status-pending'
                    }[c.status] || 'status-pending';
                    html += `<div class="xray-matrix-row" onclick="showCaseDetail('${c.id}', '${tp.id}')" style="cursor:pointer;">
                        <div>
                            <div class="xray-case-id">${c.id}</div>
                            <div class="xray-case-title">${title}</div>
                        </div>
                        <div class="xray-priority">
                            <span class="badge ${prioridad === 'Crítica' ? 'badge-danger' : prioridad === 'Alta' ? 'badge-warning' : 'badge-info'}">${prioridad}</span>
                        </div>
                        <div style="color:var(--text2); font-size:0.85rem;">${actor}</div>
                        <div onclick="event.stopPropagation();">
                            <select class="status-select ${statusClass}" data-tpid="${tp.id}" data-cid="${c.id}" onchange="updateXrayStatus(this)">
                                <option value="Pendiente" ${c.status === 'Pendiente' || !c.status ? 'selected' : ''}>⏳ Pendiente</option>
                                <option value="In Progress" ${c.status === 'In Progress' ? 'selected' : ''}>🔄 In Progress</option>
                                <option value="Passed" ${c.status === 'Passed' ? 'selected' : ''}>✅ Passed</option>
                                <option value="Failed" ${c.status === 'Failed' ? 'selected' : ''}>❌ Failed</option>
                                <option value="Blocked" ${c.status === 'Blocked' ? 'selected' : ''}>🚫 Blocked</option>
                            </select>
                        </div>
                    </div>`;
                });
            }
            html += `</div></div>`;
        });
        html += '</div>';
        return html;
    }

    window.showCaseDetail = function (caseId, execId) {
        const caseRef = appData.casos.find(c => c.id === caseId);
        const execRef = appData.ejecuciones.find(e => e.id === execId);

        if (!caseRef) {
            toast('Caso de uso no encontrado', 'error');
            return;
        }

        const container = document.getElementById('modalContainer');
        const html = `
            <div class="modal-overlay">
            <div class="modal" style="max-width:900px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                    <h3 style="margin:0;">📋 ${caseRef.id} - ${caseRef.titulo}</h3>
                    <button class="btn btn-sm btn-outline" onclick="closeCaseDetail()">✕ Cerrar</button>
                </div>
                
                <div style="background:var(--card-alt); padding:15px; border-radius:8px; margin-bottom:20px;">
                    <label style="font-size:0.85rem; color:var(--text2); display:block; margin-bottom:8px;">📝 DESCRIPCIÓN DEL REQUISITO</label>
                    <div style="font-size:0.95rem; line-height:1.6; color:var(--text);">
                        ${caseRef.descripcion || '<span style="color:var(--text2);">Sin descripción</span>'}
                    </div>
                </div>
                
                <div style="display:flex; gap:10px; margin-bottom:20px;">
                    <button class="btn btn-accent" onclick="showCaseTab('flujo')" id="tab-flujo" style="flex:1;">
                        🔄 Flujo de Pasos
                    </button>
                    <button class="btn btn-outline" onclick="showCaseTab('bdd')" id="tab-bdd" style="flex:1;">
                        🎯 Criterios BDD
                    </button>
                </div>
                
                <div id="content-flujo" style="display:block;">
                    <div class="form-group">
                        <label>📋 FLUJO DE PASOS</label>
                        <div style="background:var(--card-alt); padding:15px; border-radius:8px; white-space:pre-wrap; line-height:1.6;">
                            ${caseRef.flujo || '<span style="color:var(--text2);">Sin flujo definido</span>'}
                        </div>
                    </div>
                    <div class="form-group">
                        <label>️ INPUT DEL CLIENTE</label>
                        <div style="background:var(--card-alt); padding:15px; border-radius:8px; white-space:pre-wrap; line-height:1.6;">
                            ${caseRef.inputCliente || '<span style="color:var(--text2);">Sin input definido</span>'}
                        </div>
                    </div>
                    <div class="form-group">
                        <label>✅ RESULTADO ESPERADO</label>
                        <div style="background:var(--card-alt); padding:15px; border-radius:8px; white-space:pre-wrap; line-height:1.6;">
                            ${caseRef.resultadoEsperado || '<span style="color:var(--text2);">Sin resultado definido</span>'}
                        </div>
                    </div>
                </div>
                
                <div id="content-bdd" style="display:none;">
                    <div class="form-group">
                        <label>🎯 CRITERIOS DE ACEPTACIÓN (BDD)</label>
                        <div style="background:var(--card-alt); padding:15px; border-radius:8px; white-space:pre-wrap; line-height:1.6; font-family:monospace; font-size:0.9rem;">
                            ${caseRef.criterios || '<span style="color:var(--text2);">Sin criterios BDD definidos</span>'}
                        </div>
                    </div>
                </div>
                
                ${caseRef.comentarios ? `
                <div class="form-group" style="margin-top:20px;">
                    <label>💬 COMENTARIOS / RESULTADO OBTENIDO</label>
                    <div style="background:var(--card-alt); padding:15px; border-radius:8px; white-space:pre-wrap; line-height:1.6;">
                        ${caseRef.comentarios}
                    </div>
                </div>` : ''}
                
                <div style="margin-top:20px; padding-top:20px; border-top:1px solid var(--border); display:flex; gap:10px;">
                    <button class="btn btn-outline" onclick="closeCaseDetail()">Cerrar</button>
                </div>
            </div>
            </div>
        `;

        container.innerHTML = html;
        document.addEventListener('keydown', escCloseModal);
    };

    window.closeCaseDetail = function () {
        document.getElementById('modalContainer').innerHTML = '';
        document.removeEventListener('keydown', escCloseModal);
    };

    window.showCaseTab = function (tab) {
        const flujoContent = document.getElementById('content-flujo');
        const bddContent = document.getElementById('content-bdd');
        const flujoBtn = document.getElementById('tab-flujo');
        const bddBtn = document.getElementById('tab-bdd');

        if (tab === 'flujo') {
            flujoContent.style.display = 'block';
            bddContent.style.display = 'none';
            flujoBtn.className = 'btn btn-accent';
            bddBtn.className = 'btn btn-outline';
        } else {
            flujoContent.style.display = 'none';
            bddContent.style.display = 'block';
            flujoBtn.className = 'btn btn-outline';
            bddBtn.className = 'btn btn-accent';
        }
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

                    selectEl.className = 'status-select status-' + {
                        'Passed': 'passed', 'Failed': 'failed', 'In Progress': 'progress',
                        'Blocked': 'blocked', 'Pendiente': 'pending'
                    }[newStatus];

                    saveData();
                    toast(`Estado actualizado: ${newStatus}`, 'success');

                    // Si el estado es Failed o Blocked, abrir modal para crear bug
                    if (newStatus === 'Failed' || newStatus === 'Blocked') {
                        setTimeout(() => openBugFromExecution(cId, tpId, newStatus), 300);
                    }

                    setTimeout(() => renderPage(currentPage), 500);
                }
            } catch (e) { }
        }
    };

    window.openBugFromExecution = function (caseId, execId, status) {
        const caseRef = appData.casos.find(c => c.id === caseId);
        const execRef = appData.ejecuciones.find(e => e.id === execId);

        if (!caseRef) {
            toast('Caso de uso no encontrado', 'error');
            return;
        }

        const container = document.getElementById('modalContainer');
        const bugId = 'BUG-' + Date.now();

        const html = `
        <div class="modal-overlay">
            <div class="modal" style="max-width:700px;">

                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                    <h3 style="margin:0;">🐛 Crear Bug desde Ejecución</h3>
                    <button class="btn btn-sm btn-outline" onclick="closeBugModal()">✕ Cerrar</button>
                </div>
                
                <div style="background:var(--card-alt); padding:15px; border-radius:8px; margin-bottom:20px; border-left:4px solid var(--danger);">
                    <div style="font-size:0.85rem; color:var(--text2); margin-bottom:8px;">ℹ️ Bug generado automáticamente desde:</div>
                    <div style="font-size:0.9rem;">
                        <strong>Ejecución:</strong> ${execRef?.id || execId} - ${execRef?.nombreCiclo || ''}<br>
                        <strong>Caso:</strong> ${caseRef.id} - ${caseRef.titulo}<br>
                        <strong>Estado:</strong> <span style="color:var(--danger); font-weight:600;">${status}</span>
                    </div>
                </div>
                
                <div class="form-group">
                    <label>ID Bug</label>
                    <input value="${bugId}" id="f_bug_id" readonly style="background:var(--bg2);">
                </div>
                
                <div class="form-group">
                    <label>Título *</label>
                    <input value="Fallo en ${caseRef.id}: ${caseRef.titulo}" id="f_bug_titulo">
                </div>
                
                <div class="form-group">
                    <label>Caso Relacionado</label>
                    <input value="${caseRef.id}" id="f_bug_casoRelacionado" readonly style="background:var(--bg2);">
                </div>
                
                <div class="form-group">
                    <label>Severidad</label>
                    <select id="f_bug_severidad">
                        <option>Bloqueante</option>
                        <option selected>Crítica</option>
                        <option>Mayor</option>
                        <option>Menor</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Resumen Técnico</label>
                    <textarea id="f_bug_resumen" placeholder="Describe brevemente el fallo...">El caso de prueba ${caseRef.id} ha fallado durante la ejecución ${execRef?.id || ''}. Estado: ${status}</textarea>
                </div>
                <div class="form-group">
                    <label>Descripción Detallada</label>
                    <textarea id="f_bug_descripcion" rows="5" placeholder="Pasos para reproducir, entorno, etc.">Caso de uso: ${caseRef.id} - ${caseRef.titulo} Ejecución: ${execRef?.id || ''} - ${execRef?.nombreCiclo || ''} Resultado esperado: ${caseRef.resultadoEsperado || 'No definido'} Estado obtenido: ${status}</textarea>
                </div>
                <div class="form-group">
                    <label>Estado</label>
                    <select id="f_bug_estado">
                        <option selected>Abierto</option>
                        <option>En revisión</option>
                    </select>
                </div>
                <div class="modal-actions" style="margin-top:20px;">
                    <button class="btn btn-accent" onclick="saveBugFromExecution('${bugId}', '${caseRef.id}', '${execId}', '${status}')">💾 Guardar Bug</button>
                    <button class="btn btn-outline" onclick="closeBugModal()">Cancelar</button>
                </div>
            </div>
        </div>`;

        container.innerHTML = html;
        document.addEventListener('keydown', escCloseModal);
    };

    // Función para guardar el bug creado desde ejecución
    window.saveBugFromExecution = function (bugId, caseId, execId, status) {
        const titulo = document.getElementById('f_bug_titulo').value.trim();
        const casoRelacionado = document.getElementById('f_bug_casoRelacionado').value;
        const severidad = document.getElementById('f_bug_severidad').value;
        const resumen = document.getElementById('f_bug_resumen').value;
        const descripcion = document.getElementById('f_bug_descripcion').value;
        const estado = document.getElementById('f_bug_estado').value;

        if (!titulo) {
            toast('El título es obligatorio', 'error');
            return;
        }

        const bug = {
            id: bugId,
            proyecto: getActiveProject(),
            casoRelacionado: casoRelacionado,
            titulo: titulo,
            resumen: resumen,
            descripcion: descripcion,
            severidad: severidad,
            estado: estado,
            comentarios: `Bug generado automáticamente desde ejecución ${execId} con estado ${status}`,
            fechaCreacion: new Date().toISOString()
        };

        appData.bugs.push(bug);
        addTrace('bugs', 'Creación automática', bugId);
        saveData();
        closeBugModal();
        renderPage(currentPage);
        toast('Bug creado correctamente', 'success');
        addNotification(' Bug creado', `Bug ${bugId} generado desde ejecución fallida`);
    };

    // Función para cerrar el modal de bug
    window.closeBugModal = function () {
        document.getElementById('modalContainer').innerHTML = '';
        document.removeEventListener('keydown', escCloseModal);
    };


    function renderInformes() {
        return `<h1 class="page-title">📄 Informes de Seguimiento</h1>
        <p class="page-subtitle">Genera informes profesionales en formato Word con métricas y gráficos</p>
        <div class="chart-grid">
        <div class="chart-card">
        <div class="chart-title">📊 Informe Ejecutivo</div>
        <p style="color:var(--text2); margin-bottom:16px; font-size:0.9rem;">
        Incluye resumen ejecutivo, métricas clave, casos de uso, defectos y ejecuciones.
        </p>
        <button class="btn btn-accent" data-action="downloadDocx">📥 Descargar Informe .docx</button>
        </div>
        <div class="chart-card">
        <div class="chart-title">📋 Contenido del Informe</div>
        <ul style="list-style:none; display:flex; flex-direction:column; gap:8px;">
        <li style="padding:8px 12px; background:var(--card-alt); border-radius:8px; font-size:0.85rem;">✅ Portada profesional</li>
        <li style="padding:8px 12px; background:var(--card-alt); border-radius:8px; font-size:0.85rem;">✅ Resumen ejecutivo</li>
        <li style="padding:8px 12px; background:var(--card-alt); border-radius:8px; font-size:0.85rem;">✅ Métricas y KPIs</li>
        <li style="padding:8px 12px; background:var(--card-alt); border-radius:8px; font-size:0.85rem;">✅ Detalle de casos de uso</li>
        <li style="padding:8px 12px; background:var(--card-alt); border-radius:8px; font-size:0.85rem;">✅ Registro de defectos</li>
        <li style="padding:8px 12px; background:var(--card-alt); border-radius:8px; font-size:0.85rem;">✅ Ejecuciones de pruebas</li>
        <li style="padding:8px 12px; background:var(--card-alt); border-radius:8px; font-size:0.85rem;">✅ Conclusiones</li>
        </ul>
        </div>
        </div>`;
    }
    function renderAjustes() {
        return `<h1 class="page-title">⚙️ Ajustes</h1>
        <div class="chart-grid">
        <div class="chart-card">
        <div class="chart-title">💾 Datos</div>
        <div style="display:flex; flex-direction:column; gap:10px;">
        <button class="btn btn-outline" data-action="export">Exportar JSON</button>
        <button class="btn btn-outline" onclick="document.getElementById('importFileInput').click()">📥 Importar JSON</button>
        <input type="file" id="importFileInput" accept=".json" hidden onchange="importData(this)">
        <button class="btn btn-danger" data-action="vaciar">⚠️ Vaciar Sistema</button>
        </div>
        </div>
        <div class="chart-card">
        <div class="chart-title">⌨️ Atajos de Teclado</div>
        <div style="display:flex; flex-direction:column; gap:8px; font-size:0.85rem;">
        <div style="display:flex; justify-content:space-between;"> <span>Búsqueda global</span> <kbd>Ctrl + K</kbd> </div>
        <div style="display:flex; justify-content:space-between;"> <span>Cerrar modal</span> <kbd>Esc</kbd> </div>
        <div style="display:flex; justify-content:space-between;"> <span>Cambiar tema</span> <kbd>Ctrl + T</kbd> </div>
        </div>
        </div>
        </div>
        <div class="help-cards" style="margin-top:20px;">
        ${['Selecciona un proyecto activo', 'Crea Casos de Uso', 'Registra incidencias', 'Ejecuta ciclos de prueba', 'Adjunta evidencias', 'Consulta Trazabilidad', 'Genera informes', 'Exporta/Importa datos'].map((t, i) =>
            `<div class="help-card"><div class="help-num">${i + 1}</div><div>${t}</div></div>`
        ).join('')}
        </div>`;
    }
    // ============ INFORME DOCX PROFESIONAL ============
    function downloadDocx() {
        const proyecto = getActiveProject() ? appData.proyectos.find(p => p.id === getActiveProject()) : null;
        const casos = filterByProject(appData.casos);
        const bugs = filterByProject(appData.bugs);
        const ejecuciones = filterByProject(appData.ejecuciones);
        // --- NUEVO: Extraemos los datos de las APIs ---
        const apis = filterByProject(appData.apis);
        const casosPasados = casos.filter(c => c.estado === 'Pasado').length;
        const casosFallidos = casos.filter(c => c.estado === 'Fallido').length;
        const cobertura = casos.length > 0 ? Math.round((casosPasados / casos.length) * 100) : 0;
        const bugsAbiertos = bugs.filter(b => b.estado !== 'Solucionado').length;
        const bugsSolucionados = bugs.filter(b => b.estado === 'Solucionado').length;
        // --- NUEVO: Calculamos métricas de APIs ---
        const apisCorrectas = apis.filter(a => a.estado === 'Correcta').length;
        const html = `
        <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
        <head><meta charset="UTF-8"><title>Informe QA</title>
        <style>
            @page { size: A4; margin: 2cm; }
            body { font-family: 'Calibri', Arial, sans-serif; color: #1e293b; line-height: 1.6; }
            .cover { text-align: center; padding: 80px 40px; border-bottom: 4px solid #3b82f6; margin-bottom: 40px; }
            .cover-logo { font-size: 72px; margin-bottom: 20px; }
            .cover h1 { font-size: 36px; color: #0f172a; margin: 10px 0; font-weight: 700; }
            .cover h2 { font-size: 20px; color: #64748b; font-weight: 400; margin: 8px 0; }
            .cover-meta { margin-top: 40px; font-size: 14px; color: #64748b; }
            .cover-meta div { margin: 6px 0; }
            h1.section { color: #0f172a; font-size: 24px; border-bottom: 2px solid #3b82f6; padding-bottom: 8px; margin-top: 40px; }
            h2 { color: #1e40af; font-size: 18px; margin-top: 24px; }
            p { font-size: 12px; margin: 8px 0; }
            table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 11px; }
            th { background: #1e293b; color: white; padding: 10px 8px; text-align: left; font-weight: 600; }
            td { border: 1px solid #e2e8f0; padding: 8px; }
            tr:nth-child(even) td { background: #f8fafc; }
            .badge { padding: 3px 8px; border-radius: 10px; font-size: 10px; font-weight: 600; display: inline-block; }
            .passed { background: #d1fae5; color: #065f46; }
            .failed { background: #fee2e2; color: #991b1b; }
            .pendiente { background: #fef3c7; color: #92400e; }
            .abierto { background: #fee2e2; color: #991b1b; }
            .solucionado { background: #d1fae5; color: #065f46; }
            .kpi-box { display: inline-block; padding: 16px 24px; margin: 8px; background: #f1f5f9; border-radius: 8px; border-left: 4px solid #3b82f6; min-width: 140px; }
            .kpi-value { font-size: 28px; font-weight: 700; color: #0f172a; }
            .kpi-label { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
            .summary-grid { display: flex; flex-wrap: wrap; gap: 10px; margin: 20px 0; }
            .conclusion { background: #eff6ff; border-left: 4px solid #3b82f6; padding: 16px; margin: 20px 0; border-radius: 4px; }
            .footer { margin-top: 60px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 10px; color: #94a3b8; text-align: center; }
        </style></head>
        <body>
        <div class="cover">
            <div class="cover-logo">🛡️</div>
            <h1>Informe de Aseguramiento de Calidad</h1>
            <h2>Quality Assurance / Quality Control</h2>
            <div class="cover-meta">
            <div><strong>Proyecto:</strong> ${proyecto?.nombre || 'Todos los proyectos'}</div>
            <div><strong>Cliente:</strong> ${proyecto?.codigoCliente || 'N/A'}</div>
            <div><strong>Responsable QA:</strong> ${proyecto?.responsable || currentUser?.nombre || 'N/A'}</div>
            <div><strong>Fecha de emisión:</strong> ${new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
            <div><strong>Versión:</strong> 1.0</div>
            </div>
        </div>
        <h1 class="section">1. Resumen Ejecutivo</h1>
        <p>El presente documento recoge los resultados de las actividades de aseguramiento de calidad realizadas sobre el proyecto <strong>${proyecto?.nombre || 'en curso'}</strong>. Se detallan los casos de prueba ejecutados, los defectos identificados, la validación de APIs y el estado general de calidad del producto.</p>
        <div class="summary-grid">
            <div class="kpi-box">
            <div class="kpi-value">${casos.length}</div>
            <div class="kpi-label">Casos Totales</div>
            </div>
            <div class="kpi-box">
            <div class="kpi-value">${cobertura}%</div>
            <div class="kpi-label">Cobertura</div>
            </div>
            <div class="kpi-box">
            <div class="kpi-value">${bugs.length}</div>
            <div class="kpi-label">Defectos</div>
            </div>
            <div class="kpi-box">
            <div class="kpi-value">${apis.length}</div>
            <div class="kpi-label">APIs Evaluadas</div>
            </div>
        </div>
        <h1 class="section">2. Métricas de Calidad</h1>
        <table>
            <tr><th>Indicador</th><th>Valor</th><th>Estado</th></tr>
            <tr><td>Cobertura de pruebas</td><td>${cobertura}%</td><td><span class="badge ${cobertura >= 80 ? 'passed' : cobertura >= 50 ? 'pendiente' : 'failed'}">${cobertura >= 80 ? 'Óptimo' : cobertura >= 50 ? 'Mejorable' : 'Crítico'}</span></td></tr>
            <tr><td>Casos ejecutados</td><td>${casosPasados + casosFallidos} / ${casos.length}</td><td>-</td></tr>
            <tr><td>Tasa de defectos</td><td>${casos.length > 0 ? Math.round((bugs.length / casos.length) * 100) : 0}%</td><td>-</td></tr>
            <tr><td>Bugs abiertos</td><td>${bugsAbiertos}</td><td><span class="badge ${bugsAbiertos === 0 ? 'passed' : 'failed'}">${bugsAbiertos === 0 ? 'Sin incidencias' : 'Requiere atención'}</span></td></tr>
            <tr><td>APIs correctas</td><td>${apisCorrectas} / ${apis.length}</td><td><span class="badge ${apis.length > 0 && apisCorrectas === apis.length ? 'passed' : apis.length === 0 ? 'pendiente' : 'failed'}">${apis.length > 0 && apisCorrectas === apis.length ? '100% OK' : apis.length === 0 ? 'N/A' : 'Errores detectados'}</span></td></tr>
        </table>
        <h1 class="section">3. Casos de Uso</h1>
        <p>Se han definido <strong>${casos.length}</strong> casos de prueba, de los cuales <strong>${casosPasados}</strong> han sido ejecutados satisfactoriamente y <strong>${casosFallidos}</strong> han presentado fallos.</p>
        <table>
            <tr><th>ID</th><th>Título</th><th>Prioridad</th><th>Actor</th><th>Estado</th></tr>
            ${casos.map(c => `<tr>
            <td>${c.id}</td>
            <td>${c.titulo || ''}</td>
            <td>${c.prioridad || 'Media'}</td>
            <td>${c.actor || '-'}</td>
            <td><span class="badge ${c.estado === 'Pasado' ? 'passed' : c.estado === 'Fallido' ? 'failed' : 'pendiente'}">${c.estado || 'Pendiente'}</span></td>
            </tr>`).join('')}
        </table>
        <h1 class="section">4. Defectos Detectados</h1>
        <p>Se han registrado <strong>${bugs.length}</strong> defectos durante las pruebas. De estos, <strong>${bugsSolucionados}</strong> han sido resueltos y <strong>${bugsAbiertos}</strong> permanecen abiertos.</p>
        <table>
            <tr><th>ID</th><th>Título</th><th>Severidad</th><th>Caso</th><th>Estado</th></tr>
            ${bugs.map(b => `<tr>
            <td>${b.id}</td>
            <td>${b.titulo || ''}</td>
            <td>${b.severidad || 'Menor'}</td>
            <td>${b.casoRelacionado || '-'}</td>
            <td><span class="badge ${b.estado === 'Solucionado' ? 'solucionado' : 'abierto'}">${b.estado || 'Abierto'}</span></td>
            </tr>`).join('')}
        </table>
        <h1 class="section">5. Ejecuciones de Pruebas</h1>
        <p>Se han realizado <strong>${ejecuciones.length}</strong> ciclos de ejecución de pruebas.</p>
        <table>
            <tr><th>ID</th><th>Ciclo</th><th>Fecha</th><th>Responsable</th><th>Casos</th></tr>
            ${ejecuciones.map(e => {
            let casosCount = 0;
            try { casosCount = JSON.parse(e.casosAsociados || '[]').length; } catch (err) { }
            return `<tr>
                <td>${e.id}</td>
                <td>${e.nombreCiclo || ''}</td>
                <td>${e.fecha || '-'}</td>
                <td>${e.responsable || '-'}</td>
                <td>${casosCount}</td>
            </tr>`;
        }).join('')}
        </table>
        <h1 class="section">6. Gestión de APIs</h1>
        <p>Se han validado <strong>${apis.length}</strong> endpoints/APIs, encontrando <strong>${apisCorrectas}</strong> con respuesta correcta.</p>
        <table>
            <tr><th>ID API</th><th>Nombre</th><th>Método</th><th>Endpoint</th><th>Estado</th></tr>
            ${apis.map(a => `<tr>
            <td>${a.id}</td>
            <td>${a.nombre || ''}</td>
            <td><strong>${a.metodo || 'GET'}</strong></td>
            <td>${a.endpoint || '-'}</td>
            <td><span class="badge ${a.estado === 'Correcta' ? 'passed' : a.estado === 'Error' ? 'failed' : 'pendiente'}">${a.estado || 'Pendiente'}</span></td>
            </tr>`).join('')}
        </table>
        <h1 class="section">7. Conclusiones y Recomendaciones</h1>
        <div class="conclusion">
            <p><strong>Estado general de calidad:</strong> ${cobertura >= 80 && bugsAbiertos === 0 ? '✅ <strong>Óptimo</strong> - El producto cumple con los estándares de calidad establecidos.' :
                cobertura >= 50 ? '⚠️ <strong>Mejorable</strong> - Se recomienda incrementar la cobertura de pruebas y resolver los defectos pendientes.' :
                    '🚨 <strong>Crítico</strong> - Se requiere atención inmediata. La cobertura de pruebas es insuficiente y hay defectos abiertos.'
            }</p>
            <p style="margin-top:12px;"><strong>Recomendaciones:</strong></p>
            <ul style="margin-left:20px;">
            ${bugsAbiertos > 0 ? '<li>Priorizar la resolución de los ' + bugsAbiertos + ' defectos abiertos.</li>' : ''}
            ${apis.length > 0 && apisCorrectas < apis.length ? `<li>Revisar los ${apis.length - apisCorrectas} endpoints que han reportado error o siguen pendientes de validación.</li>` : ''}
            ${cobertura < 80 ? '<li>Incrementar la cobertura de pruebas hasta alcanzar al menos el 80%.</li>' : ''}
            <li>Continuar con el seguimiento diario de las métricas de calidad.</li>
            <li>Documentar todas las evidencias de prueba para auditorías futuras.</li>
            </ul>
        </div>
        <div class="footer">
            <p>Informe generado por QA Suite PRO · ${new Date().toLocaleString('es-ES')}</p>
            <p>Este documento es confidencial y para uso interno del equipo de calidad.</p>
        </div>
        </body></html>`;
        const blob = new Blob(['\ufeff' + html], { type: 'application/msword' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `Informe_QA_${proyecto?.nombre || 'General'}_${new Date().toISOString().split('T')[0]}.doc`;
        a.click();
        URL.revokeObjectURL(a.href);
        toast('📄 Informe profesional descargado', 'success');
        addNotification(' Informe generado', 'Se ha descargado un nuevo informe de calidad');
    }
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
                
                // Validar que sea un archivo válido
                if (!data.usuarios && !data.casos && !data.proyectos) {
                    return toast('Archivo JSON inválido: no contiene datos de QA Suite', 'error');
                }
                
                if (confirm('¿Sobrescribir datos actuales en FIREBASE?\n\nEsta acción no se puede deshacer.')) {
                    // Fusionar datos importados con la estructura actual
                    appData = {
                        usuarios: data.usuarios || appData.usuarios || [],
                        proyectos: data.proyectos || appData.proyectos || [],
                        objetivos: data.objetivos || appData.objetivos || [],
                        casos: data.casos || appData.casos || [],
                        bugs: data.bugs || appData.bugs || [],
                        ejecuciones: data.ejecuciones || appData.ejecuciones || [],
                        capturas: data.capturas || appData.capturas || [],
                        registroDiario: data.registroDiario || appData.registroDiario || [],
                        apis: data.apis || appData.apis || [],
                        mejoras: data.mejoras || appData.mejoras || [],
                        trazabilidad: data.trazabilidad || appData.trazabilidad || [],
                        comentarios: data.comentarios || appData.comentarios || [],
                        notificaciones: data.notificaciones || [],
                        configuracion: data.configuracion || appData.configuracion || { theme: 'dark', activeProject: '' }
                    };
                    
                    notifications = appData.notificaciones || [];
                    
                    // Guardar en Firebase
                    saveData().then(() => {
                        populateProjectSelector();
                        navigateTo('dashboard');
                        toast('📥 Datos importados correctamente', 'success');
                        updateNotificationBadge();
                    }).catch(err => {
                        console.error('Error al guardar datos importados:', err);
                        toast('Error al guardar en Firebase', 'error');
                    });
                }
            } catch (ex) {
                console.error('Error al procesar archivo:', ex);
                toast('Archivo JSON inválido o corrupto', 'error');
            }
        };
        reader.onerror = () => {
            toast('Error al leer el archivo', 'error');
        };
        reader.readAsText(file);
        input.value = '';
    };

    // ============ KEYBOARD SHORTCUTS ============
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'k') {
            e.preventDefault();
            const si = document.querySelector('.search-input');
            if (si) si.focus();
        }
        if (e.ctrlKey && e.key === 't') {
            e.preventDefault();
            toggleTheme();
        }
    });
    // Evitar cierre de modales al clicar en el overlay
    window.addEventListener('click', function (event) {
        if (event.target.classList.contains('modal-overlay')) {
            // Al interceptar el clic y no llamar a ninguna función de cierre,
            // obligamos a usar los botones explícitos de "Cerrar" o "Cancelar".
            event.stopPropagation();
        }
    });
    window.previsualizarCapturaQA = function (event, containerId) {
        const file = event.target.files[0];
        const container = document.getElementById(containerId);
        const hiddenInput = document.getElementById('f_archivos_base64'); // Input oculto para guardar la data
        if (file && file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = function (e) {
                const base64Data = e.target.result;
                // Mostramos la miniatura en el modal
                container.innerHTML = `<img src="${base64Data}" style="max-width: 100%; max-height: 180px; border-radius: 8px; border: 1px solid var(--border); margin-top: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.3);">`;
                // Guardamos la cadena base64 en el input oculto
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

        const newComment = {
            id: Date.now(),
            entityType: entityType, // Ej: 'caso', 'bug', 'ejecucion', 'api'
            entityId: entityId,
            texto: text,
            creadoPor: currentUser.id,
            nombreAutor: currentUser.nombre,
            fecha: new Date().toISOString()
        };

        appData.comentarios.push(newComment);
        saveData();
        
        // Opcional: Registrar en trazabilidad
        // registrarTrazabilidad(`Comentó en ${entityType} #${entityId}`);

        input.value = '';
        renderCommentsSection(entityType, entityId); // Refrescar la vista
        toast('Comentario añadido', 'success');
    };

    window.renderCommentsSection = (entityType, entityId) => {
        const container = document.getElementById(`commentsContainer_${entityType}_${entityId}`);
        if (!container) return;
        
        const comentarios = appData.comentarios.filter(c => c.entityType === entityType && c.entityId == entityId);
        let html = `<div class="comments-list" style="margin-top: 15px; max-height: 250px; overflow-y: auto; padding-right: 5px;">`;
        
        if(comentarios.length === 0) {
            html += `<p style="color: var(--text2); font-size: 0.9rem; text-align: center; padding: 15px 0;">No hay comentarios aún.</p>`;
        } else {
            comentarios.forEach(c => {
                const isOwner = currentUser.rol === 'Admin' || c.creadoPor == currentUser.id;
                //const dateStr = new Date(c.fecha).toLocaleString();
                const dateStr = new Date(c.fecha).toLocaleString('es-ES', {
                    timeZone: 'Europe/Madrid', // O tu zona horaria local
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false
                });
                html += `
                <div class="comment-item" style="background: var(--bg); padding: 12px; border-radius: 8px; margin-bottom: 10px; border: 1px solid var(--border);">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px; align-items: center;">
                        <strong style="font-size: 0.85rem; color: var(--accent);"><span style="font-size: 1rem;">💬</span> ${c.nombreAutor}</strong>
                        <span style="font-size: 0.75rem; color: var(--text2);">${dateStr}</span>
                    </div>
                    <div style="font-size: 0.9rem; color: var(--text); line-height: 1.4;">
                        ${c.texto}
                    </div>
                    ${isOwner ? `<button onclick="deleteComment(${c.id}, '${entityType}', '${entityId}')" style="background: none; border: none; color: var(--danger); font-size: 0.8rem; cursor: pointer; margin-top: 8px; padding: 0; opacity: 0.8;">Eliminar</button>` : ''}
                </div>`;
            });
        }
        html += `</div>`;
        
        html += `
        <div class="comment-input-area" style="display: flex; gap: 10px; margin-top: 15px; border-top: 1px solid var(--border); padding-top: 15px;">
            <input type="text" id="commentInput_${entityType}_${entityId}" placeholder="Escribe un comentario..." class="form-control" style="flex: 1; padding: 10px 15px; border-radius: 8px; border: 1px solid var(--border); background: var(--input-bg); color: var(--text);" onkeypress="if(event.key==='Enter') addComment('${entityType}', '${entityId}')">
            <button class="btn btn-outline" onclick="addComment('${entityType}', '${entityId}')">Enviar</button>
        </div>`;
        container.innerHTML = html;
    };

    window.deleteComment = (id, entityType, entityId) => {
        showConfirmModal('¿Estás seguro de eliminar este comentario?', () => {
            appData.comentarios = appData.comentarios.filter(c => String(c.id) !== String(id));
            saveData();
            renderCommentsSection(entityType, entityId);
            toast('Comentario eliminado', 'success');
        });
    };

    window.openCommandPalette = function() {
        const palette = document.getElementById('commandPalette');
        const input = document.getElementById('commandPaletteInput');
        
        if (palette) {
            palette.style.display = 'flex';
            input.value = '';
            input.focus();
            commandPaletteOpen = true;
            commandPaletteSelectedIndex = 0;
            commandPaletteResults = [];
            renderCommandPaletteResults([]);
        }
    };
    
    window.closeCommandPalette = function() {
        const palette = document.getElementById('commandPalette');
        if (palette) {
            palette.style.display = 'none';
            commandPaletteOpen = false;
            commandPaletteResults = [];
        }
    };
    
    window.toggleCommandPalette = function() {
        if (commandPaletteOpen) {
            closeCommandPalette();
        } else {
            openCommandPalette();
        }
    };

    function searchGlobal(query) {
        if (!query || query.length < 2) return [];
        
        const results = [];
        const q = query.toLowerCase();
        const ap = getActiveProject();
        
        // Buscar en Casos
        appData.casos.forEach(caso => {
            if (!ap || caso.proyecto === ap) {
                if (caso.id.toLowerCase().includes(q) || 
                    (caso.titulo && caso.titulo.toLowerCase().includes(q)) ||
                    (caso.actor && caso.actor.toLowerCase().includes(q))) {
                    results.push({
                        type: 'casos',
                        icon: '📋',
                        title: caso.titulo || caso.id,
                        subtitle: `${caso.id} ${caso.actor ? '· ' + caso.actor : ''}`,
                        badge: caso.prioridad || 'Media',
                        badgeClass: caso.prioridad === 'Crítica' ? 'badge-danger' : 
                                    caso.prioridad === 'Alta' ? 'badge-warning' : 'badge-info',
                        id: caso.id,
                        page: 'casos'
                    });
                }
            }
        });
        
        // Buscar en Bugs
        appData.bugs.forEach(bug => {
            if (!ap || bug.proyecto === ap) {
                if (bug.id.toLowerCase().includes(q) || 
                    (bug.titulo && bug.titulo.toLowerCase().includes(q)) ||
                    (bug.casoRelacionado && bug.casoRelacionado.toLowerCase().includes(q))) {
                    results.push({
                        type: 'bugs',
                        icon: '🐛',
                        title: bug.titulo || bug.id,
                        subtitle: `${bug.id} · ${bug.severidad || 'Menor'}`,
                        badge: bug.estado || 'Abierto',
                        badgeClass: bug.estado === 'Solucionado' ? 'badge-success' : 'badge-danger',
                        id: bug.id,
                        page: 'bugs'
                    });
                }
            }
        });
        
        // Buscar en Ejecuciones
        appData.ejecuciones.forEach(exec => {
            if (!ap || exec.proyecto === ap) {
                if (exec.id.toLowerCase().includes(q) || 
                    (exec.nombreCiclo && exec.nombreCiclo.toLowerCase().includes(q))) {
                    let casosCount = 0;
                    try { casosCount = JSON.parse(exec.casosAsociados || '[]').length; } catch(e) {}
                    
                    results.push({
                        type: 'ejecuciones',
                        icon: '▶️',
                        title: exec.nombreCiclo || exec.id,
                        subtitle: `${exec.id} · ${casosCount} casos`,
                        badge: exec.fecha || '',
                        badgeClass: 'badge-neutral',
                        id: exec.id,
                        page: 'ejecuciones'
                    });
                }
            }
        });
        
        // Buscar en APIs
        appData.apis.forEach(api => {
            if (!ap || api.proyecto === ap) {
                if (api.id.toLowerCase().includes(q) || 
                    (api.nombre && api.nombre.toLowerCase().includes(q)) ||
                    (api.endpoint && api.endpoint.toLowerCase().includes(q))) {
                    results.push({
                        type: 'apis',
                        icon: '🔌',
                        title: api.nombre || api.id,
                        subtitle: `${api.id} · ${api.metodo || 'GET'} ${api.endpoint || ''}`,
                        badge: api.estado || 'Pendiente',
                        badgeClass: api.estado === 'Correcta' ? 'badge-success' : 
                                    api.estado === 'Error' ? 'badge-danger' : 'badge-warning',
                        id: api.id,
                        page: 'apis'
                    });
                }
            }
        });
        
        // Buscar en Proyectos
        appData.proyectos.forEach(proj => {
            if (proj.id.toLowerCase().includes(q) || 
                (proj.nombre && proj.nombre.toLowerCase().includes(q)) ||
                (proj.codigoCliente && proj.codigoCliente.toLowerCase().includes(q))) {
                results.push({
                    type: 'proyectos',
                    icon: '',
                    title: proj.nombre || proj.id,
                    subtitle: `${proj.id} ${proj.codigoCliente ? '· ' + proj.codigoCliente : ''}`,
                    badge: proj.estado || 'Planificado',
                    badgeClass: proj.estado === 'Activo' ? 'badge-success' : 
                                proj.estado === 'Completado' ? 'badge-info' : 'badge-warning',
                    id: proj.id,
                    page: 'proyectos'
                });
            }
        });
        
        // Buscar en Objetivos
        appData.objetivos.forEach(obj => {
            if (!ap || obj.proyecto === ap) {
                if (obj.id.toLowerCase().includes(q) || 
                    (obj.objetivo && obj.objetivo.toLowerCase().includes(q))) {
                    results.push({
                        type: 'objetivos',
                        icon: '🎯',
                        title: obj.objetivo || obj.id,
                        subtitle: `${obj.id} · ${obj.responsable || 'Sin responsable'}`,
                        badge: obj.estado || 'Pendiente',
                        badgeClass: obj.estado === 'Finalizado' ? 'badge-success' : 
                                    obj.estado === 'En progreso' ? 'badge-info' : 'badge-warning',
                        id: obj.id,
                        page: 'objetivos'
                    });
                }
            }
        });
        
        return results.slice(0, 50); // Limitar a 50 resultados
    }
    
    function renderCommandPaletteResults(results) {
        const container = document.getElementById('commandPaletteResults');
        if (!container) return;
        
        if (results.length === 0) {
            container.innerHTML = `
                <div class="command-palette-empty">
                    <div class="command-palette-empty-icon">🔍</div>
                    <div>No se encontraron resultados</div>
                </div>
            `;
            return;
        }
        
        // Agrupar por tipo
        const grouped = {};
        results.forEach(r => {
            if (!grouped[r.type]) grouped[r.type] = [];
            grouped[r.type].push(r);
        });
        
        let html = '';
        const typeLabels = {
            'casos': { icon: '📋', label: 'Casos de Uso' },
            'bugs': { icon: '🐛', label: 'Bugs / Defectos' },
            'ejecuciones': { icon: '▶️', label: 'Ejecuciones' },
            'apis': { icon: '🔌', label: 'APIs' },
            'proyectos': { icon: '📁', label: 'Proyectos' },
            'objetivos': { icon: '🎯', label: 'Objetivos' }
        };
        
        let globalIndex = 0;
        Object.keys(grouped).forEach(type => {
            const label = typeLabels[type] || { icon: '📄', label: type };
            html += `<div class="command-palette-category">
                <div class="command-palette-category-title">
                    <span>${label.icon}</span>
                    <span>${label.label}</span>
                    <span style="margin-left: auto; opacity: 0.6;">${grouped[type].length}</span>
                </div>`;
            
            grouped[type].forEach(item => {
                const isSelected = globalIndex === commandPaletteSelectedIndex;
                html += `
                    <div class="command-palette-item ${isSelected ? 'selected' : ''}" 
                            data-index="${globalIndex}" 
                            data-id="${item.id}" 
                            data-page="${item.page}">
                        <div class="command-palette-item-icon cp-${item.type}">${item.icon}</div>
                        <div class="command-palette-item-content">
                            <div class="command-palette-item-title">${highlightText(item.title, document.getElementById('commandPaletteInput').value)}</div>
                            <div class="command-palette-item-subtitle">${highlightText(item.subtitle, document.getElementById('commandPaletteInput').value)}</div>
                        </div>
                        <span class="command-palette-item-badge ${item.badgeClass || 'badge-neutral'}">${item.badge}</span>
                    </div>
                `;
                globalIndex++;
            });
            
            html += '</div>';
        });
        
        container.innerHTML = html;
        
        // Agregar event listeners
        container.querySelectorAll('.command-palette-item').forEach(item => {
            item.addEventListener('click', () => {
                selectCommandPaletteItem(item);
            });
        });
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
        
        // Navegar a la página y abrir el elemento
        if (page && id) {
            navigateTo(page);
            setTimeout(() => {
                openModal(page, id);
            }, 300);
        }
    }
    
    function navigateCommandPalette(direction) {
        const items = document.querySelectorAll('.command-palette-item');
        if (items.length === 0) return;
        
        items.forEach(item => item.classList.remove('selected'));
        
        if (direction === 'up') {
            commandPaletteSelectedIndex = (commandPaletteSelectedIndex - 1 + items.length) % items.length;
        } else {
            commandPaletteSelectedIndex = (commandPaletteSelectedIndex + 1) % items.length;
        }
        
        const selectedItem = items[commandPaletteSelectedIndex];
        if (selectedItem) {
            selectedItem.classList.add('selected');
            selectedItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }
    
    // Event listeners para Command Palette
    document.addEventListener('keydown', (e) => {
        // Ctrl+K para abrir/cerrar
        if (e.ctrlKey && e.key === 'k') {
            e.preventDefault();
            toggleCommandPalette();
        }
        
        // Si la palette está abierta
        if (commandPaletteOpen) {
            const input = document.getElementById('commandPaletteInput');
            
            // Escape para cerrar
            if (e.key === 'Escape') {
                e.preventDefault();
                closeCommandPalette();
            }
            
            // Flechas para navegar
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                navigateCommandPalette('down');
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                navigateCommandPalette('up');
            }
            
            // Enter para seleccionar
            if (e.key === 'Enter' && input) {
                e.preventDefault();
                const selectedItem = document.querySelector('.command-palette-item.selected');
                if (selectedItem) {
                    selectCommandPaletteItem(selectedItem);
                }
            }
            
            // Búsqueda en tiempo real
            if (input && e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
                setTimeout(() => {
                    const query = input.value;
                    commandPaletteResults = searchGlobal(query);
                    commandPaletteSelectedIndex = 0;
                    renderCommandPaletteResults(commandPaletteResults);
                }, 10);
            }
        }
    });
    
    // Input handler para búsqueda en tiempo real
    document.addEventListener('input', (e) => {
        if (commandPaletteOpen && e.target.id === 'commandPaletteInput') {
            const query = e.target.value;
            commandPaletteResults = searchGlobal(query);
            commandPaletteSelectedIndex = 0;
            renderCommandPaletteResults(commandPaletteResults);
        }
    });

    // ============ INIT ============
    async function init() {
        // 1. Cargar datos desde Firebase
        await loadData();
        
        // 2. Suscribirse a cambios en tiempo real (UNA SOLA VEZ)
        suscribirseAlTiempoReal();
        
        // 3. Crear datos base si no existen usuarios
        if (!appData.usuarios || appData.usuarios.length === 0) {
            appData.usuarios = [{ id: 1, nombre: 'Admin Sistema', usuario: 'admin', password: 'password', rol: 'Admin' }];
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
            console.log("✅ Datos base creados");
        }
        
        // 4. Restaurar sesión
        if (!restoreSession()) {
            document.getElementById('authScreen').style.display = 'flex';
            document.getElementById('appScreen').style.display = 'none';
        }
        
        // 5. Event listener para login con Enter
        const loginPassInput = document.getElementById('loginPass');
        if (loginPassInput) loginPassInput.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
        
        // 6. Asegurar que todos los usuarios tengan proyectosAutorizados
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
        
        // 7. Asegurar que todos los registros tengan creadoPor
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
    }


    init();
})();
