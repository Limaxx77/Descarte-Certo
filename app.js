// ===========================
// DESCARTE CERTO — app.js
// Apenas dados reais via PostgreSQL/API
// ===========================

const API_URL = "https://descartecertoreciclagem.onrender.com";

const CATEGORIES = [
  { value: "papelao", label: "Papelão", emoji: "📦" },
  { value: "aluminio", label: "Alumínio", emoji: "🥤" },
  { value: "plastico", label: "Plástico", emoji: "♻️" },
  { value: "vidro", label: "Vidro", emoji: "🍶" },
  { value: "ferro", label: "Ferro", emoji: "⚙️" },
  { value: "cobre", label: "Cobre", emoji: "🔌" },
  { value: "oleo", label: "Óleo Usado", emoji: "🛢️" },
  { value: "eletronico", label: "Eletrônicos", emoji: "💻" },
  { value: "outro", label: "Outro", emoji: "📋" }
];

const Storage = {
  getUser: () => {
    try { return JSON.parse(localStorage.getItem("dc_user")) || null; } catch { return null; }
  },
  setUser: (u) => localStorage.setItem("dc_user", JSON.stringify(u)),
  clearUser: () => {
    localStorage.removeItem("dc_user");
    localStorage.removeItem("token");
  },
  getFavorites: () => {
    try { return JSON.parse(localStorage.getItem("dc_favorites")) || []; } catch { return []; }
  },
  setFavorites: (f) => localStorage.setItem("dc_favorites", JSON.stringify(f)),
  toggleFavorite: (id) => {
    const favs = Storage.getFavorites();
    const idx = favs.indexOf(id);
    if (idx === -1) favs.push(id);
    else favs.splice(idx, 1);
    Storage.setFavorites(favs);
    return idx === -1;
  }
};

function getToken() {
  return localStorage.getItem("token");
}

function showFormError(elementId, message) {
  const el = document.getElementById(elementId);
  if (el) {
    el.style.display = "block";
    el.textContent = message;
  } else {
    alert(message);
  }
}

function hideFormError(elementId) {
  const el = document.getElementById(elementId);
  if (el) {
    el.style.display = "none";
    el.textContent = "";
  }
}

function getCategoryEmoji(cat) {
  const found = CATEGORIES.find(c => c.value === cat);
  return found ? found.emoji : "📋";
}

function getCategoryLabel(cat) {
  const found = CATEGORIES.find(c => c.value === cat);
  return found ? found.label : cat || "Outro";
}

function formatPrice(price) {
  const value = Number(price || 0);
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function showToast(msg = "Sucesso!") {
  let toast = document.querySelector(".success-toast");

  if (!toast) {
    toast = document.createElement("div");
    toast.className = "success-toast";
    document.body.appendChild(toast);
  }

  toast.innerHTML = `<span>✓</span> ${msg}`;
  toast.classList.add("show");

  setTimeout(() => toast.classList.remove("show"), 3200);
}

function logout() {
  Storage.clearUser();
  window.location.href = "login.html";
}

function requireAuth() {
  const user = Storage.getUser();
  if (!user || !getToken()) {
    window.location.href = "login.html";
    return null;
  }
  return user;
}

function initSidebar() {
  const user = requireAuth();
  if (!user) return;

  const nameEl = document.getElementById("sidebar-user-name");
  const roleEl = document.getElementById("sidebar-user-role");
  const avEl = document.getElementById("sidebar-avatar");
  const topBarName = document.getElementById("topbar-user-name");
  const topBarAv = document.getElementById("topbar-avatar");

  if (nameEl) nameEl.textContent = user.name || "Usuário";
  if (roleEl) roleEl.textContent = user.role || "Membro";
  if (avEl) avEl.textContent = (user.name || "U").charAt(0).toUpperCase();
  if (topBarName) topBarName.textContent = user.name || "Usuário";
  if (topBarAv) topBarAv.textContent = (user.name || "U").charAt(0).toUpperCase();

  document.querySelectorAll(".logout-btn").forEach(btn => {
    btn.addEventListener("click", logout);
  });

  const toggleBtn = document.getElementById("sidebar-toggle");
  const sidebar = document.getElementById("app-sidebar");
  const overlay = document.getElementById("sidebar-overlay");

  if (toggleBtn && sidebar) {
    toggleBtn.addEventListener("click", () => {
      sidebar.classList.toggle("open");
      if (overlay) overlay.classList.toggle("show");
    });
  }

  if (overlay) {
    overlay.addEventListener("click", () => {
      if (sidebar) sidebar.classList.remove("open");
      overlay.classList.remove("show");
    });
  }

  const current = window.location.pathname.split("/").pop();
  document.querySelectorAll(".nav-item[data-page]").forEach(item => {
    if (item.dataset.page === current) item.classList.add("active");
  });
}

function initPublicNav() {
  const hamburger = document.getElementById("hamburger");
  const navLinks = document.getElementById("nav-links");

  if (hamburger && navLinks) {
    hamburger.addEventListener("click", () => {
      navLinks.classList.toggle("hidden");
      navLinks.style.display = navLinks.style.display === "flex" ? "none" : "flex";
    });
  }
}

async function apiFetch(path, options = {}) {
  const headers = {
    ...(options.headers || {}),
  };

  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = headers["Content-Type"] || "application/json";
  }

  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Erro na requisição");
  }

  return data;
}

async function handleRegister() {
  const name = document.getElementById("cad-name")?.value.trim();
  const email = document.getElementById("cad-email")?.value.trim();
  const phone = document.getElementById("cad-phone")?.value.trim();
  const password = document.getElementById("cad-password")?.value;
  const password2 = document.getElementById("cad-password2")?.value;
  const terms = document.getElementById("cad-terms");

  hideFormError("cadastro-error");

  if (!name || !email || !phone || !password) {
    showFormError("cadastro-error", "Preencha nome, email, WhatsApp e senha.");
    return;
  }

  const cleanPhone = phone.replace(/\D/g, "");
  if (cleanPhone.length < 10) {
    showFormError("cadastro-error", "Informe um WhatsApp válido com DDD.");
    return;
  }

  if (password.length < 6) {
    showFormError("cadastro-error", "Senha deve ter pelo menos 6 caracteres.");
    return;
  }

  if (password !== password2) {
    showFormError("cadastro-error", "As senhas não coincidem.");
    return;
  }

  if (terms && !terms.checked) {
    showFormError("cadastro-error", "Aceite os termos para continuar.");
    return;
  }

  try {
    const data = await apiFetch("/api/register", {
      method: "POST",
      body: JSON.stringify({ name, email, password, phone: cleanPhone }),
    });

    localStorage.setItem("token", data.token);
    Storage.setUser(data.user);
    window.location.href = "dashboard.html";
  } catch (err) {
    showFormError("cadastro-error", err.message);
  }
}

async function handleLogin() {
  const email = document.getElementById("login-email")?.value.trim();
  const password = document.getElementById("login-password")?.value;

  hideFormError("login-error");

  if (!email || !password) {
    showFormError("login-error", "Preencha email e senha.");
    return;
  }

  try {
    const data = await apiFetch("/api/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });

    localStorage.setItem("token", data.token);
    Storage.setUser(data.user);
    window.location.href = "dashboard.html";
  } catch (err) {
    showFormError("login-error", err.message);
  }
}

async function loadMe() {
  const data = await apiFetch("/api/me");
  Storage.setUser(data);
  return data;
}

async function loadProducts() {
  return await apiFetch("/api/products");
}

async function createProduct(payload) {
  return await apiFetch("/api/products", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

async function loadCollectionPoints() {
  return await apiFetch("/api/collection-points");
}

async function createCollectionPoint(payload) {
  return await apiFetch("/api/collection-points", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

function openWhatsApp(phone, productName = "") {
  const cleanPhone = String(phone || "").replace(/\D/g, "");

  if (!cleanPhone) {
    alert("Este vendedor ainda não possui WhatsApp cadastrado.");
    return;
  }

  const finalPhone = cleanPhone.startsWith("55") ? cleanPhone : `55${cleanPhone}`;
  const message = productName
    ? `Olá! Tenho interesse no produto: ${productName}. Podemos conversar?`
    : "Olá! Tenho interesse em um anúncio do Descarte Certo. Podemos conversar?";

  window.open(`https://wa.me/${finalPhone}?text=${encodeURIComponent(message)}`, "_blank");
}

window.DC = {
  API_URL,
  CATEGORIES,
  Storage,
  getToken,
  apiFetch,
  handleLogin,
  handleRegister,
  logout,
  requireAuth,
  initSidebar,
  initPublicNav,
  loadMe,
  loadProducts,
  createProduct,
  loadCollectionPoints,
  createCollectionPoint,
  openWhatsApp,
  showToast,
  formatPrice,
  getCategoryEmoji,
  getCategoryLabel,
  toggleFavorite: Storage.toggleFavorite,
};
