/* ============================================================
   SUPABASE CONNECTION
   ============================================================ */
const SUPABASE_URL = "https://iwfwiptyxivwskiwgqli.supabase.co";
const SUPABASE_KEY = "sb_publishable_h_W5SMVPfV71725u5v4Ajw_tl9-qP5w";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* ============================================================================================
   STATE — everything lives in memory for this prototype (no real cloud DB / auth in this demo)
   ============================================================================================ */
const CATS = ["Apparel","Footwear","Electronics","Beauty","Home","Dining"];
const THUMB = {Apparel:"👕",Footwear:"👟",Electronics:"🎧",Beauty:"💄",Home:"🛋️",Dining:"☕"};
const THUMB_BG = {Apparel:"#FBEFE1",Footwear:"#E7F0EC",Electronics:"#E9EEF6",Beauty:"#FBE7EF",Home:"#F3EFE3",Dining:"#F0E7DB"};
async function loadTransactions() {

  const { data, error } = await supabaseClient
    .from("transactions")
    .select(`
      *,
      transaction_items (*)
    `)
    .order("date", { ascending: false });

  if (error) {
    console.error(error);
    toast("Could not load transactions.", "⚠");
    return;
  }

  transactions = data.map(t => ({
    id: t.id,
    customerId: t.customer_id,
    customerName: t.customer_name,
    items: t.transaction_items.map(item => ({
      name: item.name,
      qty: item.qty,
      price: Number(item.price),
      discount: Number(item.discount),
      category: item.category,
      productId: item.product_id
    })),
    subtotal: Number(t.subtotal),
    discount: Number(t.discount),
    vat: Number(t.vat),
    total: Number(t.total),
    cost: Number(t.cost),
    profit: Number(t.profit),
    method: t.method,
    status: t.status,
    location: t.location,
    date: t.date,
    cashGiven: t.cash_given,
    change: t.change
  }));
}


let state = {
  currentUser:null, // {role, id, name, email, phone, address, username}
  loginRole:"user",
  adminTab:"overview",
  userTab:"home",
  productSearch:"",
  productCatFilter:"All",
  txFilter:"All",
  feedbackFilter:"All",
  salesRange:"month",
  pendingReceipt:null,
};

let nextProductId = 1;
let nextCustomerId = 1;

function mkProduct(name,cat,cost,price,stock,discount,store){
  return {id:nextProductId++,name,category:cat,description:`${name} — a Rizza Court favorite from our ${cat.toLowerCase()} collection.`,cost,price,stock,discount,store,status:"Enabled",dateAdded:"2026-01-15",image:null};
}
function mkCustomer(name,email,phone,address,regDate,password){
  return {id:nextCustomerId++, name,email,phone,address,status:"Active",regDate,username:name.split(" ")[0].toLowerCase(),password:password||"clarissadelposo"};
}

let products = [];
async function loadProducts() {
  const { data, error } = await supabaseClient
    .from("products")
    .select("*")
    .order("id");

  if (error) {
    console.error("Error loading products:", error);
    toast("Could not load products.", "⚠");
    return;
  }

  products = data.map(p => ({
    id: p.id,
    name: p.name,
    category: p.category,
    description: p.description || "",
    cost: Number(p.cost),
    price: Number(p.price),
    stock: Number(p.stock),
    discount: Number(p.discount),
    store: p.store || "",
    status: p.status,
    dateAdded: p.date_added,
    image: p.image || null
  }));
}
let customers = [];

/* Product Reviews — customers leave a star rating + comment on a product;
   shown when anyone (admin or customer) clicks a product's image. */
let productReviews = [];
async function loadReviews(){
  const { data, error } = await supabaseClient
    .from("product_reviews")
    .select("*")
    .order("created_at", { ascending: false });

  if(error){
    console.error("Error loading reviews:", error);
    return;
  }

  productReviews = (data || []).map(r => ({
    id: r.id,
    productId: r.product_id,
    customerId: r.customer_id,
    customerName: r.customer_name || "Customer",
    rating: Number(r.rating) || 0,
    comment: r.comment || "",
    createdAt: r.created_at
  }));
}
function starString(rating){
  const r = Math.max(0, Math.min(5, Math.round(rating)));
  return "★".repeat(r) + "☆".repeat(5-r);
}

async function loadCustomers(){
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("*")
    .eq("role", "user")
    .order("created_at", { ascending: false });

  if(error){
    console.error("Error loading customers:", error);
    toast("Could not load customers.", "⚠");
    return;
  }

  customers = (data || []).map(c => ({
    id: c.id,
    name: c.name || "",
    email: c.email || "",
    phone: c.phone || "",
    address: c.address || "",
    status: c.status || "Active",
    regDate: c.created_at || null,
    username: c.username || ""
  }));
}

let locations = [];
async function loadLocations() {
  const { data, error } = await supabaseClient
    .from("locations")
    .select("*")
    .order("id");

  if (error) {
    console.error("Error loading locations:", error);
    toast("Could not load locations.", "⚠");
    return;
  }

  locations = data.map(l => ({
    id: l.id,
    branch: l.branch,
    mall: l.mall || "Rizza Court",
    address: l.address || "",
    city: l.city || "",
    province: l.province || "",
    contact: l.contact || "",
    hours: l.hours || "",
    desc: l.description || l.desc || ""
  }));
}

let discounts = [];
async function loadDiscounts() {
  const { data, error } = await supabaseClient
    .from("discounts")
    .select("*")
    .order("id");

  if (error) {
    console.error("Error loading discounts:", error);
    return;
  }

  discounts = data.map(d => ({
    id: d.id,
    name: d.name,
    pct: Number(d.pct),
    scope: d.scope,
    start: d.start_date,
    end: d.end_date,
    active: d.active
  }));
}

let transactions = []; // built up as users check out; seeded below
let nextTxId = 1;
let cart = []; // {productId, qty}

/* Customer Service / Feedback.
   IMPORTANT: "visible only to admins" must be enforced server-side with
   Supabase Row Level Security on the `feedback` table — this client code
   simply selects "*" and trusts RLS to filter rows:
     - customers can SELECT/INSERT only rows where customer_id = auth.uid()
     - admins can SELECT/UPDATE all rows (checked via their profiles.role)
   Without those policies in place, any signed-in user could read every
   row through the browser console regardless of what the UI shows. */
let feedbackList = [];
async function loadFeedback(){
  const { data, error } = await supabaseClient
    .from("feedback")
    .select("*")
    .order("created_at", { ascending: false });

  if(error){
    console.error("Error loading feedback:", error);
    return;
  }

  feedbackList = (data || []).map(f => ({
    id: f.id,
    customerId: f.customer_id,
    customerName: f.customer_name || "",
    customerEmail: f.customer_email || "",
    subject: f.subject || "",
    message: f.message || "",
    status: f.status || "New",
    createdAt: f.created_at
  }));
}

/* Red notification dot on the admin sidebar's Customer Service icon.
   "Seen" is tracked by timestamp (not by feedback status) so the dot
   reflects *new arrivals since the admin last opened the tab*, separate
   from whether the admin has marked items Resolved. */
function getFeedbackSeenAt(){
  try { return localStorage.getItem("rizza_admin_feedback_seen_at") || "1970-01-01T00:00:00.000Z"; }
  catch(err){ return "1970-01-01T00:00:00.000Z"; }
}
function markFeedbackSeenNow(){
  try { localStorage.setItem("rizza_admin_feedback_seen_at", new Date().toISOString()); } catch(err){}
  updateFeedbackNotifyDot();
}
function updateFeedbackNotifyDot(){
  const dot = document.getElementById("fbNotifyDot");
  if(!dot) return;
  const isAdmin = state.currentUser?.role === "admin";
  const seenAt = new Date(getFeedbackSeenAt());
  const hasUnseen = isAdmin && feedbackList.some(f => f.createdAt && new Date(f.createdAt) > seenAt);
  dot.classList.toggle("visible", hasUnseen);
}




function buildTransaction(customer,items,method,status,date,cashGiven){
  let subtotal=0, discountTotal=0;
  items.forEach(it=>{
    const lineBase = it.product.price*it.qty;
    const lineDiscount = lineBase*(it.product.discount/100);
    subtotal += lineBase; discountTotal += lineDiscount;
  });
  const afterDiscount = subtotal - discountTotal;
  const vat = afterDiscount*0.12;
  const total = afterDiscount + vat;
  let cost=0; items.forEach(it=>cost+=it.product.cost*it.qty);
  const profit = afterDiscount - cost;
  const hasCash = method==="Cash" && typeof cashGiven==="number" && cashGiven>0;
  return {
    id: `TXN-${String(nextTxId++).padStart(5,"0")}`,
    customerId: customer.id, customerName: customer.name,
    items: items.map(it=>({name:it.product.name,qty:it.qty,price:it.product.price,discount:it.product.discount,category:it.product.category})),
    subtotal, discount:discountTotal, vat, total, cost, profit,
    method, status, location: locations[Math.floor(Math.random()*locations.length)].branch,
    date: date.toISOString(),
    cashGiven: hasCash ? cashGiven : null,
    change: hasCash ? Math.max(0,cashGiven-total) : null,
  };
}

let sessionReady = false;
// True while the user is in the middle of the "reset password" link flow
// (Supabase's PASSWORD_RECOVERY auth event) — used to stop restoreSession()
// from routing them into the app instead of the "set new password" screen.
let inPasswordRecovery = false;

/* ============================================================================================
   NAVIGATION
   ============================================================================================ */
function toast(msg,icon="✓"){
  const wrap = document.getElementById("toastWrap");
  const el = document.createElement("div");
  el.className="toast"; el.innerHTML = `<span>${icon}</span><span>${msg}</span>`;
  wrap.appendChild(el);
  setTimeout(()=>{ el.style.opacity="0"; el.style.transition="opacity .3s"; setTimeout(()=>el.remove(),300); },2600);
}

const MARKETING_PAGES = ["landing","about","locations","contact"];
function gotoPage(pageId){
  document.querySelectorAll(".page").forEach(p=>p.classList.add("hidden"));
  const target = document.getElementById("page-"+pageId);
  if(target) target.classList.remove("hidden");
  const site = document.getElementById("site");
  if(site) site.classList.toggle("hidden", !MARKETING_PAGES.includes(pageId));

  // The mobile hamburger toggle only controls the admin/user app sidebar,
  // so only show it while one of those app pages is active.
  const isAppPage = pageId === "app-admin" || pageId === "app-user";
  document.getElementById("sidebarToggle")?.classList.toggle("is-hidden", !isAppPage);
  if(!isAppPage) closeMobileSidebar();

  window.scrollTo(0,0);
  document.querySelectorAll(".nav-link").forEach(a=>a.classList.remove("active"));
  const navLink = document.querySelector(`.nav-link[data-goto="${pageId}"]`);
  if(navLink) navLink.classList.add("active");

  // Remember the last page so a browser refresh does not send the user
  // back to the login/landing page. Explicit logout clears this state.
  if(pageId !== "login") {
    try { localStorage.setItem("rizza_last_page", pageId); } catch(err) {}
  }
}

/* Ends the Supabase session so a refresh after logout does NOT restore
   the account. onAuthStateChange("SIGNED_OUT") clears state.currentUser
   and the cached tab/page keys; we still navigate immediately so the UI
   doesn't wait on that async event to feel responsive. */
async function performLogout(){
  try {
    await supabaseClient.auth.signOut();
  } catch(err) {
    console.error("Logout error:", err);
  }
  state.currentUser = null;
  try {
    localStorage.removeItem("rizza_last_page");
    localStorage.removeItem("rizza_admin_tab");
    localStorage.removeItem("rizza_user_tab");
  } catch(err) {}
  gotoPage("landing");
  toast("You've been logged out.","👋");
}

/* ============================================================
   RESPONSIVE / MOBILE NAV
   ============================================================ */
function closeMobileSidebar(){
  document.getElementById("adminSidebar")?.classList.remove("open");
  document.getElementById("userSidebar")?.classList.remove("open");
  document.getElementById("sidebarOverlay")?.classList.remove("visible");
  document.getElementById("sidebarToggle")?.setAttribute("aria-expanded","false");
}
function toggleMobileSidebar(){
  // Toggle whichever app sidebar is currently visible.
  const sidebar = document.querySelector("#page-app-admin:not(.hidden) #adminSidebar, #page-app-user:not(.hidden) #userSidebar");
  if(!sidebar) return;
  const willOpen = !sidebar.classList.contains("open");
  sidebar.classList.toggle("open", willOpen);
  document.getElementById("sidebarOverlay")?.classList.toggle("visible", willOpen);
  document.getElementById("sidebarToggle")?.setAttribute("aria-expanded", String(willOpen));
}
document.getElementById("sidebarToggle")?.addEventListener("click", toggleMobileSidebar);
document.getElementById("sidebarOverlay")?.addEventListener("click", closeMobileSidebar);

function closeMobileNav(){
  document.getElementById("navLinks")?.classList.remove("open");
  document.getElementById("navMenuToggle")?.setAttribute("aria-expanded","false");
}
document.getElementById("navMenuToggle")?.addEventListener("click", ()=>{
  const nav = document.getElementById("navLinks");
  const willOpen = !nav.classList.contains("open");
  nav.classList.toggle("open", willOpen);
  document.getElementById("navMenuToggle").setAttribute("aria-expanded", String(willOpen));
});

// Collapse mobile menus once the viewport is wide enough that they render
// as a normal sidebar/top nav again, so no leftover "open" state lingers.
window.addEventListener("resize", ()=>{
  if(window.innerWidth > 980){ closeMobileSidebar(); closeMobileNav(); }
});

document.addEventListener("click",(e)=>{
  const logoutEl = e.target.closest("[data-logout]");
  if(logoutEl){
    e.preventDefault();
    closeMobileSidebar();
    closeMobileNav();
    performLogout();
    return;
  }
  const gotoEl = e.target.closest("[data-goto]");
  if(gotoEl){
    e.preventDefault();
    closeMobileNav();
    const dest = gotoEl.getAttribute("data-goto");
    if(dest==="app-user"){
      const tab = gotoEl.getAttribute("data-user-tab");
      if(!state.currentUser || state.currentUser.role!=="user"){
        toast("Please sign in or sign up to view our products.","🔒");
        gotoPage("login");
        selectLoginRole("user");
        return;
      }
      gotoPage("app-user");
      if(tab) setUserTab(tab);
    } else {
      gotoPage(dest);
    }
  }
  const adminTabEl = e.target.closest("[data-admin-tab]");
  if(adminTabEl){ setAdminTab(adminTabEl.getAttribute("data-admin-tab")); closeMobileSidebar(); }
  const userTabEl = e.target.closest("[data-user-tab]");
  if(userTabEl && !gotoEl){ setUserTab(userTabEl.getAttribute("data-user-tab")); closeMobileSidebar(); }
});

/* ---------- Login role pick ---------- */
function selectLoginRole(role){
  state.loginRole = role;
  document.getElementById("rolePickUser").classList.toggle("selected",role==="user");
  document.getElementById("rolePickAdmin").classList.toggle("selected",role==="admin");
  document.getElementById("loginSubmitBtn").textContent = role==="admin" ? "Login as Admin" : "Login as Customer";
}

/* Supabase Auth only signs in with an email, so when the person types a
   username instead we look up the matching profile's email first and
   sign in with that behind the scenes. A value containing "@" is treated
   as an email and used as-is. Returns null if no matching account exists. */
async function resolveLoginEmail(identifier){
  if(identifier.includes("@")) return identifier;

  const { data, error } = await supabaseClient
    .from("profiles")
    .select("email")
    .ilike("username", identifier)
    .maybeSingle();

  if(error || !data || !data.email){
    console.error(error || "No profile found for username:", identifier);
    return null;
  }
  return data.email;
}

document.getElementById("loginForm").addEventListener("submit",async (e)=>{
  e.preventDefault();
  const identifier = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;

  const email = await resolveLoginEmail(identifier);
  if(!email){
    toast("Incorrect username or password.","⚠");
    return;
  }

  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

  if(error){
    console.error(error);
    toast("Incorrect username or password.","⚠");
    return;
  }

  const user = data.user;
  const { data: profile, error: profileError } = await supabaseClient
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if(profileError){
    console.error(profileError);
    await supabaseClient.auth.signOut();
    toast("Could not load your account profile.","⚠");
    return;
  }

  if(profile.status === "Disabled"){
    await supabaseClient.auth.signOut();
    toast("This account has been disabled. Contact support.","⚠");
    return;
  }

  state.currentUser = {
    role: profile.role,
    id: profile.id,
    name: profile.name || "",
    email: user.email || "",
    phone: profile.phone || "",
    address: profile.address || "",
    username: profile.username || "",
    regDate: profile.created_at || null,
    status: profile.status
  };

  if(state.loginRole === "admin" && profile.role !== "admin"){
    await supabaseClient.auth.signOut();
    state.currentUser = null;
    toast("This account does not have administrator access.","⚠");
    return;
  }

  if(state.loginRole === "user" && profile.role === "admin"){
    await supabaseClient.auth.signOut();
    state.currentUser = null;
    toast("Please use the Admin login.","⚠");
    return;
  }

  toast(`Welcome back, ${state.currentUser.name.split(" ")[0] || "User"}!`);
  gotoPage(profile.role === "admin" ? "app-admin" : "app-user");
  if(profile.role === "admin") setAdminTab("overview");
  else setUserTab("home");
  e.target.reset();
});

document.getElementById("signupForm").addEventListener("submit", async (e) => {

  e.preventDefault();

  const name = document.getElementById("suName").value.trim();
  const username = document.getElementById("suUsername").value.trim();
  const email = document.getElementById("suEmail").value.trim();
  const phone = document.getElementById("suPhone").value.trim();
  const address = document.getElementById("suAddress").value.trim();

  const password = document.getElementById("suPassword").value;
  const confirmPassword = document.getElementById("suConfirm").value;

  if (password !== confirmPassword) {
    toast("Passwords don't match — try again.", "⚠");
    return;
  }

  const { data, error } = await supabaseClient.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: name,
        display_name: name,
        username,
        phone,
        address
      }
    }
  });

  if (error) {
    console.error(error);
    toast(error.message, "⚠");
    return;
  }

  // The matching row in public.profiles is created automatically, server-side,
  // by the handle_new_user database trigger the moment the auth user is
  // created — this avoids relying on a browser session that doesn't exist yet
  // when "Confirm email" is enabled, which used to cause a false
  // "profile setup failed" error even though signup succeeded.

  if (!data.session) {
    toast("Account created! Check your email to confirm, then log in.");
  } else {
    toast("Account created! Please log in.");
  }

  e.target.reset();

  gotoPage("login");
  selectLoginRole("user");
});

document.getElementById("forgotPasswordLink").addEventListener("click",async (e)=>{
  e.preventDefault();
  const identifier = document.getElementById("loginEmail").value.trim();
  if(!identifier){ toast("Enter your username or email above first, then click here.","⚠"); return; }
  const email = await resolveLoginEmail(identifier);
  if(!email){ toast("We couldn't find an account for that username or email.","⚠"); return; }

  const btn = e.target;
  btn.style.pointerEvents = "none";

  // Supabase emails the customer a secure link back to this same page.
  // We tag our own marker onto the redirect URL (passwordReset=1) instead
  // of relying only on Supabase's PASSWORD_RECOVERY auth event or its
  // type=recovery hash param — those aren't always fired/present in time
  // (depends on PKCE vs. implicit flow), which was letting restoreSession()
  // treat the recovery session as a normal login and jump to the dashboard.
  const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + window.location.pathname + "?passwordReset=1"
  });

  btn.style.pointerEvents = "";

  if(error){
    console.error("Password reset request failed:", error);
    toast("Could not send the reset email. Please try again.","⚠");
    return;
  }

  toast(`Password reset instructions sent to ${email}.`);
});

/* Strips the recovery hash/query params out of the address bar once the
   flow is done, so a page refresh afterward doesn't re-trigger the
   "set new password" screen (and doesn't leave a used recovery token
   sitting visibly in the URL/browser history). */
function clearRecoveryUrlParams(){
  try { window.history.replaceState(null, "", window.location.pathname); } catch(err) {}
}

document.getElementById("resetPasswordForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const newPassword = document.getElementById("resetNewPassword").value;
  const confirmPassword = document.getElementById("resetConfirmPassword").value;

  if(newPassword.length < 6){ toast("Password must be at least 6 characters.","⚠"); return; }
  if(newPassword !== confirmPassword){ toast("Passwords don't match — try again.","⚠"); return; }

  const { error } = await supabaseClient.auth.updateUser({ password: newPassword });

  if(error){
    console.error("Password update failed:", error);
    toast("Could not update your password. Please try again.","⚠");
    return;
  }

  inPasswordRecovery = false;
  await supabaseClient.auth.signOut();
  clearRecoveryUrlParams();
  e.target.reset();
  toast("Password updated! Please log in with your new password.");
  gotoPage("login");
  selectLoginRole("user");
});

document.getElementById("cancelResetLink").addEventListener("click", async (e) => {
  e.preventDefault();
  inPasswordRecovery = false;
  await supabaseClient.auth.signOut();
  clearRecoveryUrlParams();
  gotoPage("landing");
});


document.getElementById("contactForm").addEventListener("submit",(e)=>{
  e.preventDefault();
  toast("Message sent — we'll reply within 1 business day.");
  e.target.reset();
});

/* ============================================================================================
   HELPERS
   ============================================================================================ */
function peso(n){ return "₱" + n.toLocaleString("en-PH",{minimumFractionDigits:2,maximumFractionDigits:2}); }
function fmtDate(d){ return new Date(d).toLocaleDateString("en-PH",{month:"short",day:"numeric",year:"numeric"}); }
function daysAgo(n){ const d=new Date(); d.setDate(d.getDate()-n); return d; }
function withinRange(dateStr,range){
  const d = new Date(dateStr); const now = new Date();
  const diffDays = (now-d)/(1000*3600*24);
  if(range==="today") return diffDays<1;
  if(range==="week") return diffDays<7;
  if(range==="month") return diffDays<30;
  if(range==="year") return diffDays<365;
  return true;
}
function discountStatus(d){
  const now=new Date(); const end=new Date(d.end); const start=new Date(d.start);
  if(!d.active) return "Expired";
  if(now>end) return "Expired";
  if(now<start) return "Pending";
  return "Active";
}
function activeDiscounts(){ return discounts.filter(d=>discountStatus(d)==="Active"); }
function effectivePrice(p){ return p.price * (1 - p.discount/100); }

/* ============================================================================================
   ADMIN APP RENDERING
   ============================================================================================ */
function setAdminTab(tab){
  state.adminTab = tab;
  try {
    localStorage.setItem("rizza_admin_tab", tab);
    if(state.currentUser?.role === "admin") {
      localStorage.setItem("rizza_last_page", "app-admin");
    }
  } catch(err) {}
  document.querySelectorAll('#page-app-admin .side-link').forEach(l=>l.classList.remove("active"));
  const link = document.querySelector(`#page-app-admin [data-admin-tab="${tab}"]`);
  if(link) link.classList.add("active");
  renderAdminMain();
  if(tab === "feedback") markFeedbackSeenNow();
}

function renderAdminMain(){
  const main = document.getElementById("adminMain");
  const renderers = {
    overview: renderAdminOverview,
    products: renderAdminProducts,
    customers: renderAdminCustomers,
    feedback: renderAdminFeedback,
    transactions: renderAdminTransactions,
    sales: renderAdminSales,
    profits: renderAdminProfits,
    discounts: renderAdminDiscounts,
    locations: renderAdminLocations,
    settings: renderAdminSettings,
    account: renderAdminAccount,
  };
  main.innerHTML = "";
  (renderers[state.adminTab] || renderAdminOverview)(main);
}

function topbar(title,sub,actionsHtml=""){
  return `<div class="app-topbar"><div><h2>${title}</h2><div class="sub">${sub}</div></div><div class="topbar-actions">${actionsHtml}</div></div>`;
}

function renderAdminOverview(main){
  const totalSales = transactions.filter(t=>t.status==="Completed").reduce((s,t)=>s+t.total,0);
  const totalProfit = transactions.filter(t=>t.status==="Completed").reduce((s,t)=>s+t.profit,0);
  const lowStock = products.filter(p=>p.stock<=8).length;
  main.innerHTML = "";

  const kpis = document.createElement("div"); kpis.className="kpi-grid";
  kpis.innerHTML = [
    ["Total Sales",peso(totalSales),"+8.2% vs last month","up"],
    ["Total Profit",peso(totalProfit),"+5.1% vs last month","up"],
    ["Total Products",products.length,`${lowStock} low stock`,lowStock>0?"down":"flat"],
    ["Total Customers",customers.length,"+1 this week","up"],
    ["Total Transactions",transactions.length,`${transactions.filter(t=>t.status==="Pending").length} pending`,"flat"],
    ["Low Stock Items",lowStock,"restock recommended",lowStock>0?"down":"flat"],
    ["Active Discounts",activeDiscounts().length,`${discounts.length} total`,"flat"],
  ].map(([lbl,val,delta,dir])=>`<div class="kpi-card"><div class="accent"></div><div class="lbl">${lbl}</div><div class="val">${val}</div><div class="delta ${dir}">${delta}</div></div>`).join("");
  main.appendChild(kpis);

  const chartRow = document.createElement("div"); chartRow.className="chart-row";
  chartRow.innerHTML = `
    <div class="panel">
      <div class="panel-head"><h3>Sales Overview</h3><div class="filter-chips" id="ovSalesRange">
        ${["today","week","month","year"].map(r=>`<div class="chip ${r==='month'?'active':''}" data-range="${r}">${r[0].toUpperCase()+r.slice(1)}</div>`).join("")}
      </div></div>
      <canvas id="ovSalesChart" height="110"></canvas>
    </div>
    <div class="panel">
      <div class="panel-head"><h3>Product Categories</h3><span class="sub">by revenue share</span></div>
      <canvas id="ovCatChart" height="150"></canvas>
    </div>`;
  main.appendChild(chartRow);

  const bottomRow = document.createElement("div"); bottomRow.className="chart-row";
  bottomRow.innerHTML = `
    <div class="panel">
      <div class="panel-head"><h3>Best-Selling Products</h3><span class="sub">by units sold</span></div>
      <table><thead><tr><th>Product</th><th>Category</th><th>Units</th><th>Revenue</th></tr></thead><tbody id="bestSellersBody"></tbody></table>
    </div>
    <div class="panel">
      <div class="panel-head"><h3>Customer Activity</h3><span class="sub">purchases per customer</span></div>
      <canvas id="custActivityChart" height="150"></canvas>
    </div>`;
  main.appendChild(bottomRow);

  drawSalesChart("ovSalesChart","month");
  drawCategoryChart("ovCatChart");
  drawCustomerActivityChart("custActivityChart");
  renderBestSellers();

  main.querySelectorAll("#ovSalesRange .chip").forEach(chip=>{
    chip.addEventListener("click",()=>{
      main.querySelectorAll("#ovSalesRange .chip").forEach(c=>c.classList.remove("active"));
      chip.classList.add("active");
      drawSalesChart("ovSalesChart",chip.dataset.range);
    });
  });
}

function renderBestSellers(){
  const tbody = document.getElementById("bestSellersBody");
  if(!tbody) return;
  const unitsByProduct = {};
  transactions.filter(t=>t.status==="Completed").forEach(t=>t.items.forEach(it=>{
    unitsByProduct[it.name] = unitsByProduct[it.name] || {units:0,revenue:0,category:it.category};
    unitsByProduct[it.name].units += it.qty;
    unitsByProduct[it.name].revenue += it.qty*it.price*(1-it.discount/100);
  }));
  const rows = Object.entries(unitsByProduct).sort((a,b)=>b[1].units-a[1].units).slice(0,6);
  tbody.innerHTML = rows.map(([name,d])=>`<tr><td>${name}</td><td>${d.category}</td><td>${d.units}</td><td class="mono">${peso(d.revenue)}</td></tr>`).join("") || `<tr><td colspan="4" style="color:var(--muted);">No sales yet.</td></tr>`;
}

let chartInstances = {};
function destroyChart(id){ if(chartInstances[id]){ chartInstances[id].destroy(); delete chartInstances[id]; } }
function chartsReady(canvasId){
  if(typeof Chart!=="undefined") return true;
  const ctx = document.getElementById(canvasId);
  if(ctx && ctx.parentElement) ctx.parentElement.innerHTML = `<p style="color:var(--muted);font-size:13px;padding:20px 0;">Charts couldn't load (the Chart.js script didn't reach this browser). The rest of the dashboard still works.</p>`;
  return false;
}

function salesSeriesForRange(range){
  let buckets, labels;
  if(range==="today"){ labels=["9am","12pm","3pm","6pm","9pm"]; buckets=labels.map(()=>0); }
  else if(range==="week"){ labels=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]; buckets=labels.map(()=>0); }
  else if(range==="year"){ labels=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug"]; buckets=labels.map(()=>0); }
  else { labels=["Wk 1","Wk 2","Wk 3","Wk 4"]; buckets=labels.map(()=>0); }
  const completed = transactions.filter(t=>t.status==="Completed");
  completed.forEach(t=>{
    const d = new Date(t.date);
    const daysDiff = Math.floor((new Date()-d)/(1000*3600*24));
    let idx;
    if(range==="today") idx = daysDiff<1 ? Math.min(4,Math.floor(Math.random()*5)) : -1;
    else if(range==="week") idx = daysDiff<7 ? (6-daysDiff) : -1;
    else if(range==="year") idx = daysDiff<240 ? Math.min(7,Math.floor(daysDiff/30)) : -1;
    else idx = daysDiff<30 ? Math.min(3,Math.floor(daysDiff/7)) : -1;
    if(idx>=0 && idx<buckets.length) buckets[idx]+=t.total;
  });
  return {labels,data:buckets};
}

function drawSalesChart(canvasId,range){
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId); if(!ctx) return;
  if(!chartsReady(canvasId)) return;
  const {labels,data} = salesSeriesForRange(range);
  chartInstances[canvasId] = new Chart(ctx,{
    type:"line",
    data:{labels,datasets:[{label:"Sales",data,borderColor:"#C9A227",backgroundColor:"rgba(201,162,39,0.12)",fill:true,tension:0.35,pointRadius:3,pointBackgroundColor:"#12213D"}]},
    options:{plugins:{legend:{display:false}},scales:{y:{ticks:{callback:v=>"₱"+v/1000+"k"},grid:{color:"#F0EDE4"}},x:{grid:{display:false}}}}
  });
}

function drawCategoryChart(canvasId){
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId); if(!ctx) return;
  if(!chartsReady(canvasId)) return;
  const byCat = {};
  transactions.filter(t=>t.status==="Completed").forEach(t=>t.items.forEach(it=>{
    byCat[it.category]=(byCat[it.category]||0)+it.qty*it.price*(1-it.discount/100);
  }));
  const labels = Object.keys(byCat).length?Object.keys(byCat):CATS;
  const data = labels.map(l=>byCat[l]||1);
  chartInstances[canvasId] = new Chart(ctx,{
    type:"doughnut",
    data:{labels,datasets:[{data,backgroundColor:["#C9A227","#2D5A4A","#12213D","#D9503E","#E7CD7A","#6B7280"]}]},
    options:{plugins:{legend:{position:"bottom",labels:{boxWidth:10,font:{size:11}}}}}
  });
}

function drawCustomerActivityChart(canvasId){
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId); if(!ctx) return;
  if(!chartsReady(canvasId)) return;
  const byCust = {};
  transactions.forEach(t=>{ byCust[t.customerName]=(byCust[t.customerName]||0)+1; });
  chartInstances[canvasId] = new Chart(ctx,{
    type:"bar",
    data:{labels:Object.keys(byCust),datasets:[{label:"Purchases",data:Object.values(byCust),backgroundColor:"#2D5A4A",borderRadius:6}]},
    options:{plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,ticks:{stepSize:1},grid:{color:"#F0EDE4"}},x:{grid:{display:false}}}}
  });
}

/* ---------- Products ---------- */
function renderAdminProducts(main){
  main.innerHTML = topbar("Products","Full control over the product catalog.",
    `<div class="search-box"><input id="prodSearchInput" placeholder="Search products..." value="${state.productSearch}"></div>
     <button class="btn btn-primary btn-sm" onclick="openProductModal()">➕ Add Product</button>`);

  const panel = document.createElement("div"); panel.className="panel";
  const chips = document.createElement("div"); chips.className="filter-chips"; chips.style.marginBottom="16px";
  chips.innerHTML = ["All",...CATS].map(c=>`<div class="chip ${state.productCatFilter===c?'active':''}" data-cat="${c}">${c}</div>`).join("");
  panel.appendChild(chips);

  const grid = document.createElement("div"); grid.className="prod-grid"; grid.id="adminProdGrid";
  panel.appendChild(grid);
  main.appendChild(panel);
  renderAdminProductGrid();

  document.getElementById("prodSearchInput").addEventListener("input",(e)=>{ state.productSearch=e.target.value; renderAdminProductGrid(); });
  chips.querySelectorAll(".chip").forEach(chip=>chip.addEventListener("click",()=>{ state.productCatFilter=chip.dataset.cat; renderAdminProducts(main); }));
}

function renderAdminProductGrid(){
  const grid = document.getElementById("adminProdGrid"); if(!grid) return;
  let list = products.filter(p=>
    (state.productCatFilter==="All"||p.category===state.productCatFilter) &&
    p.name.toLowerCase().includes(state.productSearch.toLowerCase())
  );
  if(list.length===0){ grid.innerHTML = emptyState("📦","No products found","Try a different search or category."); return; }
  grid.innerHTML = list.map(p=>`
    <div class="prod-card">
      <div class="prod-thumb" style="${p.image?"":`background:${THUMB_BG[p.category]};`}" onclick="openProductPreview(${p.id})" title="View image & reviews">
        ${p.discount>0?`<span class="disc-tag">-${p.discount}%</span>`:""}
        ${p.image?`<img src="${p.image}" alt="${p.name}">`:THUMB[p.category]}
      </div>
      <div class="prod-body">
        <div class="cat">${p.category} · ${p.store}</div>
        <h4>${p.name}</h4>
        <div class="desc">${p.description||""}</div>
        <div class="stock">${p.stock<=8?`<span style="color:var(--coral);">Low stock: ${p.stock}</span>`:`Stock: ${p.stock}`} · <span class="status-pill status-${p.status}">${p.status}</span></div>
        <div class="price-row">
          <div class="price">${p.discount>0?`<span class="old">${peso(p.price)}</span>`:""}${peso(effectivePrice(p))}</div>
          <div class="row-actions">
            <button class="icon-btn" title="Edit" onclick="openProductModal(${p.id})">✏️</button>
            <button class="icon-btn" title="Delete" onclick="deleteProduct(${p.id})">🗑️</button>
          </div>
        </div>
        <div class="helper" style="margin-top:6px;">Est. profit: <strong class="mono">${peso(p.price-p.cost)}</strong>/unit</div>
      </div>
    </div>`).join("");
}

function openProductModal(id){
  const editing = id ? products.find(p=>p.id===id) : null;
  const pmImageData = editing ? (editing.image||null) : null;
  const modal = buildModal(editing?"Edit Product":"Add Product",`
    <div class="field"><label>Product Name</label><input id="pmName" value="${editing?editing.name:""}"></div>
    <div class="field-row">
      <div class="field"><label>Category</label><select id="pmCategory">${CATS.map(c=>`<option ${editing&&editing.category===c?"selected":""}>${c}</option>`).join("")}</select></div>
      <div class="field"><label>Branch</label><select id="pmStore">${locations.map(l=>`<option ${editing&&editing.store===l.branch.split(" — ")[1]?"selected":""}>Store ${l.id}</option>`).join("")}</select></div>
    </div>
    <div class="field">
      <label>Image URL</label>
      <input type="text" id="pmImageUrl" placeholder="https://example.com/image.jpg" value="${pmImageData?pmImageData:""}">
      <div class="img-upload-preview" id="pmImagePreview">${pmImageData?`<img src="${pmImageData}" alt="">`:`<span>No image URL yet</span>`}</div>
    </div>
    <div class="field"><label>Description</label><textarea id="pmDesc" rows="2">${editing?editing.description:""}</textarea></div>
    <div class="field-row">
      <div class="field"><label>Cost Price (₱)</label><input id="pmCost" type="number" value="${editing?editing.cost:""}"></div>
      <div class="field"><label>Selling Price (₱)</label><input id="pmPrice" type="number" value="${editing?editing.price:""}"></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Stock Quantity</label><input id="pmStock" type="number" value="${editing?editing.stock:""}"></div>
      <div class="field"><label>Discount (%)</label><input id="pmDiscount" type="number" value="${editing?editing.discount:0}"></div>
    </div>
    <div class="field"><label>Status</label><select id="pmStatus"><option ${!editing||editing.status==="Enabled"?"selected":""}>Enabled</option><option ${editing&&editing.status==="Disabled"?"selected":""}>Disabled</option></select></div>
  `,async ()=>{
    const name=document.getElementById("pmName").value.trim();
    const cost=+document.getElementById("pmCost").value||0;
    const price=+document.getElementById("pmPrice").value||0;
    if(!name||price<=0){ toast("Please fill in a product name and price.","⚠"); return false; }
    const data = {
      name, category:document.getElementById("pmCategory").value,
      description:document.getElementById("pmDesc").value,
      image: document.getElementById("pmImageUrl").value.trim()||null,
      cost, price,
      stock:+document.getElementById("pmStock").value||0,
      discount:+document.getElementById("pmDiscount").value||0,
      store:document.getElementById("pmStore").value,
      status:document.getElementById("pmStatus").value,
    };
    if (editing) {

  const { data: updated, error } = await supabaseClient
    .from("products")
    .update({
      name: data.name,
      category: data.category,
      description: data.description,
      image: data.image,
      cost: data.cost,
      price: data.price,
      stock: data.stock,
      discount: data.discount,
      store: data.store,
      status: data.status
    })
    .eq("id", editing.id)
    .select()
    .single();

  if (error) {
    console.error(error);
    toast("Failed to update product.", "⚠");
    return false;
  }

  Object.assign(editing, {
    id: updated.id,
    name: updated.name,
    category: updated.category,
    description: updated.description,
    image: updated.image || null,
    cost: Number(updated.cost),
    price: Number(updated.price),
    stock: Number(updated.stock),
    discount: Number(updated.discount),
    store: updated.store,
    status: updated.status,
    dateAdded: updated.date_added
  });

  toast("Product updated.");

} else {

  const { data: created, error } = await supabaseClient
    .from("products")
    .insert({
      name: data.name,
      category: data.category,
      description: data.description,
      image: data.image,
      cost: data.cost,
      price: data.price,
      stock: data.stock,
      discount: data.discount,
      store: data.store,
      status: data.status
    })
    .select()
    .single();

  if (error) {
    console.error(error);
    toast("Failed to add product.", "⚠");
    return false;
  }

  products.push({
    id: created.id,
    name: created.name,
    category: created.category,
    description: created.description,
    image: created.image || null,
    cost: Number(created.cost),
    price: Number(created.price),
    stock: Number(created.stock),
    discount: Number(created.discount),
    store: created.store,
    status: created.status,
    dateAdded: created.date_added
  });

  toast("Product added.");
}

renderAdminProductGrid();
return true;
  });
  document.getElementById("pmImageUrl").addEventListener("input",(e)=>{
    const url = e.target.value.trim();
    const preview = document.getElementById("pmImagePreview");
    if(!preview) return;
    preview.innerHTML = url ? `<img src="${url}" alt="" onerror="this.parentElement.innerHTML='<span>Couldn&#39;t load that image URL</span>'">` : `<span>No image URL yet</span>`;
  });
}

async function deleteProduct(id) {

  if (!confirm("Delete this product? This cannot be undone.")) {
    return;
  }

  const { error } = await supabaseClient
    .from("products")
    .delete()
    .eq("id", id);

  if (error) {
    console.error(error);
    toast("Failed to delete product.", "⚠");
    return;
  }

  products = products.filter(p => p.id !== id);

  toast("Product deleted.");
  renderAdminProductGrid();
}

/* ---------- Product Preview (image + reviews) ----------
   Opened by clicking a product's image, from either the admin grid or
   the customer shop. Shows the full (uncropped) image, all reviews,
   and — for signed-in customers — a form to leave a new review. */
function openProductPreview(id){
  const p = products.find(x=>x.id===id);
  if(!p) return;
  const isAdmin = state.currentUser?.role === "admin";
  const isCustomer = state.currentUser?.role === "user";
  const reviews = productReviews.filter(r=>r.productId===id);
  const avg = reviews.length ? reviews.reduce((s,r)=>s+r.rating,0)/reviews.length : 0;

  buildModal(p.name,`
    <div class="review-modal-img" style="${p.image?"":`background:${THUMB_BG[p.category]};`}">
      ${p.image?`<img src="${p.image}" alt="${p.name}">`:THUMB[p.category]}
    </div>
    <div class="cat" style="margin-bottom:4px;">${p.category}${p.store?` · ${p.store}`:""}</div>
    <div class="price" style="font-family:'IBM Plex Mono',monospace;font-weight:700;font-size:16px;margin-bottom:8px;">${peso(effectivePrice(p))}</div>
    <p style="font-size:13.5px;color:var(--muted);line-height:1.5;margin-bottom:14px;">${p.description||""}</p>

    <div class="review-summary">
      <span class="stars">${starString(avg)}</span>
      <span class="avg">${reviews.length?avg.toFixed(1):"—"}</span>
      <span class="count">(${reviews.length} review${reviews.length===1?"":"s"})</span>
    </div>

    <div class="review-list">
      ${reviews.length ? reviews.map(r=>`
        <div class="review-item">
          <div class="review-head">
            <strong>${r.customerName}</strong>
            <span class="stars small">${starString(r.rating)}</span>
          </div>
          <div class="review-date">${fmtDate(r.createdAt)}${isAdmin?` · <a href="#" onclick="deleteReview('${r.id}',${p.id});return false;" style="color:var(--coral);">Delete</a>`:""}</div>
          ${r.comment?`<p>${r.comment}</p>`:""}
        </div>`).join("") : `<div style="font-size:13px;color:var(--muted);padding:8px 0;">No reviews yet${isCustomer?" — be the first to leave one.":"."}</div>`}
    </div>

    ${isCustomer ? `
    <div class="write-review">
      <div class="field">
        <label>Leave a review</label>
        <div class="star-picker" id="reviewStarPicker">
          ${[1,2,3,4,5].map(n=>`<span class="star-pick" data-val="${n}">★</span>`).join("")}
        </div>
        <textarea id="reviewComment" rows="2" placeholder="What did you think of this product?"></textarea>
      </div>
      <button class="btn btn-primary btn-sm" id="submitReviewBtn">Submit Review</button>
    </div>` : ""}
  `, null, "Close");

  if(isCustomer){
    let selectedRating = 0;
    const picker = document.getElementById("reviewStarPicker");
    const stars = picker.querySelectorAll(".star-pick");
    stars.forEach(star=>{
      star.addEventListener("click",()=>{
        selectedRating = +star.dataset.val;
        stars.forEach(s=>s.classList.toggle("active", +s.dataset.val<=selectedRating));
      });
    });
    document.getElementById("submitReviewBtn").addEventListener("click",()=>submitProductReview(p.id, selectedRating));
  }
}

async function submitProductReview(productId, rating){
  if(!rating){ toast("Please pick a star rating.","⚠"); return; }
  const comment = document.getElementById("reviewComment").value.trim();
  const btn = document.getElementById("submitReviewBtn");
  btn.disabled = true;

  const { data, error } = await supabaseClient
    .from("product_reviews")
    .insert({
      product_id: productId,
      customer_id: state.currentUser.id,
      customer_name: state.currentUser.name,
      rating,
      comment
    })
    .select()
    .single();

  if(error){
    console.error("Failed to submit review:", error);
    toast("Could not submit your review. Please try again.","⚠");
    btn.disabled = false;
    return;
  }

  productReviews.unshift({
    id: data.id,
    productId: data.product_id,
    customerId: data.customer_id,
    customerName: data.customer_name || "",
    rating: Number(data.rating)||0,
    comment: data.comment || "",
    createdAt: data.created_at
  });

  toast("Thanks for your review!");
  openProductPreview(productId);
}

async function deleteReview(id, productId){
  if(!confirm("Delete this review? This cannot be undone.")) return;

  const { error } = await supabaseClient
    .from("product_reviews")
    .delete()
    .eq("id", id);

  if(error){
    console.error("Failed to delete review:", error);
    toast("Failed to delete review.","⚠");
    return;
  }

  productReviews = productReviews.filter(r=>String(r.id)!==String(id));
  toast("Review deleted.");
  openProductPreview(productId);
}

/* ---------- Customers ---------- */
function renderAdminCustomers(main){
  main.innerHTML = topbar("Customers","View and manage every registered customer.",
    `<div class="search-box"><input id="custSearchInput" placeholder="Search customers..."></div>`);
  const panel = document.createElement("div"); panel.className="panel";
  panel.innerHTML = `<table><thead><tr><th>Customer</th><th>Contact</th><th>Status</th><th>Joined</th><th>Total Spend</th><th>Orders</th><th></th></tr></thead><tbody id="custTableBody"></tbody></table>`;
  main.appendChild(panel);
  renderCustomerTable();
  document.getElementById("custSearchInput").addEventListener("input",(e)=>renderCustomerTable(e.target.value));
}

function renderCustomerTable(filterText=""){
  const tbody = document.getElementById("custTableBody"); if(!tbody) return;
  const list = customers.filter(c=>c.name.toLowerCase().includes(filterText.toLowerCase())||c.email.toLowerCase().includes(filterText.toLowerCase()));
  if(list.length===0){ tbody.innerHTML = `<tr><td colspan="7">${emptyState("👥","No customers found","")}</td></tr>`; return; }
  tbody.innerHTML = list.map(c=>{
    const custTx = transactions.filter(t=>t.customerId===c.id);
    const spend = custTx.filter(t=>t.status==="Completed").reduce((s,t)=>s+t.total,0);
    return `<tr>
      <td><strong>${c.name}</strong><br><span style="color:var(--muted);font-size:12px;">${c.address}</span></td>
      <td>${c.email}<br><span style="color:var(--muted);font-size:12px;">${c.phone}</span></td>
      <td><span class="status-pill status-Active">${c.status}</span></td>
      <td>${fmtDate(c.regDate)}</td>
      <td class="mono">${peso(spend)}</td>
      <td>${custTx.length}</td>
      <td><div class="row-actions">
        <button class="icon-btn" title="View" onclick="viewCustomer('${c.id}')">👁️</button>
        <button class="icon-btn" title="Toggle status" onclick="toggleCustomerStatus('${c.id}')">⇄</button>
        <button class="icon-btn" title="Delete" onclick="deleteCustomer('${c.id}')">🗑️</button>
      </div></td>
    </tr>`;
  }).join("");
}

function viewCustomer(id){
  const c = customers.find(x=>x.id===id);
  const custTx = transactions.filter(t=>t.customerId===id);
  buildModal(`${c.name}`,`
    <p class="helper">${c.email} · ${c.phone}</p>
    <p class="helper">${c.address} · Joined ${fmtDate(c.regDate)}</p>
    <h4 style="margin-top:18px;font-size:14px;">Purchase history</h4>
    <table style="margin-top:10px;"><thead><tr><th>Txn</th><th>Total</th><th>Status</th></tr></thead>
    <tbody>${custTx.map(t=>`<tr><td class="mono">${t.id}</td><td class="mono">${peso(t.total)}</td><td><span class="status-pill status-${t.status}">${t.status}</span></td></tr>`).join("")||'<tr><td colspan="3" style="color:var(--muted);">No purchases yet.</td></tr>'}</tbody></table>
  `,null,"Close");
}
async function toggleCustomerStatus(id){
  const c = customers.find(x=>x.id===id);
  if(!c) return;
  const newStatus = c.status==="Active" ? "Disabled" : "Active";

  const { data, error } = await supabaseClient
    .from("profiles")
    .update({ status: newStatus })
    .eq("id", id)
    .select()
    .single();

  if(error){
    console.error("Failed to update customer status:", error);
    toast("Failed to update customer status.", "⚠");
    return;
  }

  c.status = data.status;
  toast(`Customer marked ${c.status}.`);
  renderCustomerTable();
}

async function deleteCustomer(id){
  if(!confirm("Remove this customer account? This deletes their profile record (their login will need to be removed separately from Supabase Auth).")) return;

  const { error } = await supabaseClient
    .from("profiles")
    .delete()
    .eq("id", id);

  if(error){
    console.error("Failed to delete customer:", error);
    toast("Failed to remove customer.", "⚠");
    return;
  }

  customers = customers.filter(c=>c.id!==id);
  toast("Customer removed.");
  renderCustomerTable();
}

/* ---------- Customer Service (feedback) ----------
   Only admins see this tab in the sidebar, and the `feedback` Supabase
   table should have Row Level Security so only admins can SELECT/UPDATE
   every row — see the note above loadFeedback(). */
function renderAdminFeedback(main){
  main.innerHTML = topbar("Customer Service","Feedback submitted by customers — visible only to admins.");
  const panel = document.createElement("div"); panel.className="panel";
  const chips = document.createElement("div"); chips.className="filter-chips"; chips.style.marginBottom="16px";
  chips.innerHTML = ["All","New","Resolved"].map(s=>`<div class="chip ${state.feedbackFilter===s?'active':''}" data-fb="${s}">${s}</div>`).join("");
  panel.appendChild(chips);
  const tableWrap = document.createElement("div");
  tableWrap.innerHTML = `<table><thead><tr><th>Customer</th><th>Subject</th><th>Message</th><th>Date</th><th>Status</th><th></th></tr></thead><tbody id="fbTableBody"></tbody></table>`;
  panel.appendChild(tableWrap);
  main.appendChild(panel);
  renderFeedbackTable();
  chips.querySelectorAll(".chip").forEach(chip=>chip.addEventListener("click",()=>{ state.feedbackFilter=chip.dataset.fb; renderAdminFeedback(main); }));
}
function renderFeedbackTable(){
  const tbody = document.getElementById("fbTableBody"); if(!tbody) return;
  let list = [...feedbackList];
  if(state.feedbackFilter!=="All") list = list.filter(f=>f.status===state.feedbackFilter);
  if(list.length===0){ tbody.innerHTML = `<tr><td colspan="6">${emptyState("💬","No feedback","No feedback matches this filter.")}</td></tr>`; return; }
  tbody.innerHTML = list.map(f=>`
    <tr>
      <td><strong>${f.customerName||"Unknown"}</strong><br><span style="color:var(--muted);font-size:12px;">${f.customerEmail}</span></td>
      <td>${f.subject||"—"}</td>
      <td class="feedback-msg-preview">${f.message}</td>
      <td>${fmtDate(f.createdAt)}</td>
      <td><span class="status-pill status-${f.status}">${f.status}</span></td>
      <td><div class="row-actions">
        <button class="icon-btn" title="View" onclick="viewFeedback('${f.id}')">👁️</button>
      </div></td>
    </tr>`).join("");
}
function viewFeedback(id){
  const f = feedbackList.find(x=>String(x.id)===String(id));
  if(!f) return;
  buildModal(`Feedback from ${f.customerName||"Customer"}`,`
    <p class="helper">${f.customerEmail} · ${fmtDate(f.createdAt)}</p>
    ${f.subject?`<p style="margin-top:10px;"><strong>${f.subject}</strong></p>`:""}
    <p style="margin-top:10px;white-space:pre-wrap;line-height:1.6;">${f.message}</p>
    <div style="margin-top:18px;">
      <span class="status-pill status-${f.status}">${f.status}</span>
    </div>
  `, null, "Close").querySelector(".modal-close-row").insertAdjacentHTML("afterbegin",
    `<button class="btn btn-outline btn-sm" id="fbToggleStatusBtn" style="margin-right:auto;">${f.status==="Resolved"?"Mark as New":"Mark as Resolved"}</button>`
  );
  document.getElementById("fbToggleStatusBtn").addEventListener("click", async ()=>{
    await setFeedbackStatus(f.id, f.status==="Resolved"?"New":"Resolved");
    document.querySelector(".modal-overlay")?.remove();
  });
}
async function setFeedbackStatus(id,status){
  const { data, error } = await supabaseClient
    .from("feedback")
    .update({ status })
    .eq("id", id)
    .select()
    .single();

  if(error){
    console.error("Failed to update feedback status:", error);
    toast("Failed to update feedback status.", "⚠");
    return;
  }

  const f = feedbackList.find(x=>String(x.id)===String(id));
  if(f) f.status = data.status;
  toast(`Feedback marked ${data.status}.`);
  renderFeedbackTable();
}

/* ---------- Transactions ---------- */
function renderAdminTransactions(main){
  main.innerHTML = topbar("Transactions","Every transaction across all branches.");
  const panel = document.createElement("div"); panel.className="panel";
  const chips = document.createElement("div"); chips.className="filter-chips"; chips.style.marginBottom="16px";
  chips.innerHTML = ["All","Pending","Completed","Cancelled","Refunded"].map(s=>`<div class="chip ${state.txFilter===s?'active':''}" data-tx="${s}">${s}</div>`).join("");
  panel.appendChild(chips);
  const tableWrap = document.createElement("div");
  tableWrap.innerHTML = `<table><thead><tr><th>Txn ID</th><th>Customer</th><th>Items</th><th>Location</th><th>Total</th><th>Date</th><th>Status</th></tr></thead><tbody id="txTableBody"></tbody></table>`;
  panel.appendChild(tableWrap);
  main.appendChild(panel);
  renderTxTable();
  chips.querySelectorAll(".chip").forEach(chip=>chip.addEventListener("click",()=>{ state.txFilter=chip.dataset.tx; renderAdminTransactions(main); }));
}
function renderTxTable(){
  const tbody = document.getElementById("txTableBody"); if(!tbody) return;
  let list = [...transactions].reverse();
  if(state.txFilter!=="All") list = list.filter(t=>t.status===state.txFilter);
  if(list.length===0){ tbody.innerHTML = `<tr><td colspan="7">${emptyState("🧾","No transactions","No transactions match this filter.")}</td></tr>`; return; }
  tbody.innerHTML = list.map(t=>`
    <tr onclick="viewTransaction('${t.id}')" style="cursor:pointer;">
      <td class="mono">${t.id}</td>
      <td>${t.customerName}</td>
      <td>${t.items.reduce((s,i)=>s+i.qty,0)} item(s)</td>
      <td>${t.location}</td>
      <td class="mono">${peso(t.total)}</td>
      <td>${fmtDate(t.date)}</td>
      <td><span class="status-pill status-${t.status}">${t.status}</span></td>
    </tr>`).join("");
}
function viewTransaction(id){
  const t = transactions.find(x=>x.id===id);
  buildModal(`Transaction ${t.id}`,receiptHtml(t),null,"Close");
}

/* ---------- Sales ---------- */
function renderAdminSales(main){
  const completed = transactions.filter(t=>t.status==="Completed");
  const totalSales = completed.reduce((s,t)=>s+t.total,0);
  main.innerHTML = topbar("Sales Management","Revenue across products, categories, customers and branches.");
  const kpis = document.createElement("div"); kpis.className="kpi-grid";
  kpis.innerHTML = [
    ["Total Sales",peso(totalSales)],
    ["Today's Sales",peso(completed.filter(t=>withinRange(t.date,"today")).reduce((s,t)=>s+t.total,0))],
    ["This Week",peso(completed.filter(t=>withinRange(t.date,"week")).reduce((s,t)=>s+t.total,0))],
    ["This Month",peso(completed.filter(t=>withinRange(t.date,"month")).reduce((s,t)=>s+t.total,0))],
  ].map(([l,v])=>`<div class="kpi-card"><div class="accent"></div><div class="lbl">${l}</div><div class="val">${v}</div></div>`).join("");
  main.appendChild(kpis);

  const panel = document.createElement("div"); panel.className="panel";
  panel.innerHTML = `<div class="panel-head"><h3>Sales by location</h3></div><canvas id="salesByLocation" height="90"></canvas>`;
  main.appendChild(panel);

  const table = document.createElement("div"); table.className="panel";
  table.innerHTML = `<div class="panel-head"><h3>Sales detail</h3><span class="sub">${completed.length} completed sales</span></div>
    <table><thead><tr><th>Txn</th><th>Customer</th><th>Product(s)</th><th>Qty</th><th>Total</th><th>Date</th></tr></thead><tbody>
    ${completed.slice().reverse().slice(0,10).map(t=>`<tr><td class="mono">${t.id}</td><td>${t.customerName}</td><td>${t.items.map(i=>i.name).join(", ")}</td><td>${t.items.reduce((s,i)=>s+i.qty,0)}</td><td class="mono">${peso(t.total)}</td><td>${fmtDate(t.date)}</td></tr>`).join("")}
    </tbody></table>`;
  main.appendChild(table);

  const byLoc = {};
  completed.forEach(t=>{ byLoc[t.location]=(byLoc[t.location]||0)+t.total; });
  destroyChart("salesByLocation");
  if(!chartsReady("salesByLocation")) return;
  chartInstances["salesByLocation"] = new Chart(document.getElementById("salesByLocation"),{
    type:"bar",
    data:{labels:Object.keys(byLoc),datasets:[{label:"Sales",data:Object.values(byLoc),backgroundColor:"#C9A227",borderRadius:6}]},
    options:{indexAxis:'y',plugins:{legend:{display:false}},scales:{x:{ticks:{callback:v=>"₱"+v/1000+"k"},grid:{color:"#F0EDE4"}}}}
  });
}

/* ---------- Profits ---------- */
function renderAdminProfits(main){
  const completed = transactions.filter(t=>t.status==="Completed");
  const revenue = completed.reduce((s,t)=>s+t.subtotal-t.discount,0);
  const cost = completed.reduce((s,t)=>s+t.cost,0);
  const profit = completed.reduce((s,t)=>s+t.profit,0);
  const margin = revenue>0 ? (profit/revenue*100).toFixed(1) : "0.0";
  main.innerHTML = topbar("Profit Management","Revenue minus product cost, tracked over time.");
  const kpis = document.createElement("div"); kpis.className="kpi-grid";
  kpis.innerHTML = [
    ["Total Revenue",peso(revenue)],["Total Product Cost",peso(cost)],
    ["Total Profit",peso(profit)],["Profit Margin",margin+"%"],
  ].map(([l,v])=>`<div class="kpi-card"><div class="accent"></div><div class="lbl">${l}</div><div class="val">${v}</div></div>`).join("");
  main.appendChild(kpis);

  const panel = document.createElement("div"); panel.className="panel";
  panel.innerHTML = `<div class="panel-head"><h3>Profit trend</h3><span class="sub">last 4 weeks</span></div><canvas id="profitTrend" height="100"></canvas>`;
  main.appendChild(panel);

  const byCat = document.createElement("div"); byCat.className="panel";
  byCat.innerHTML = `<div class="panel-head"><h3>Profit by category</h3></div><table><thead><tr><th>Category</th><th>Revenue</th><th>Cost</th><th>Profit</th><th>Margin</th></tr></thead><tbody id="profitByCatBody"></tbody></table>`;
  main.appendChild(byCat);

  const catStats = {};
  completed.forEach(t=>t.items.forEach(it=>{
    const rev = it.qty*it.price*(1-it.discount/100);
    const prod = products.find(p=>p.name===it.name);
    const costEach = prod?prod.cost:it.price*0.55;
    catStats[it.category] = catStats[it.category]||{rev:0,cost:0};
    catStats[it.category].rev += rev;
    catStats[it.category].cost += costEach*it.qty;
  }));
  document.getElementById("profitByCatBody").innerHTML = Object.entries(catStats).map(([cat,d])=>{
    const p = d.rev-d.cost; const m = d.rev>0?(p/d.rev*100).toFixed(1):"0.0";
    return `<tr><td>${cat}</td><td class="mono">${peso(d.rev)}</td><td class="mono">${peso(d.cost)}</td><td class="mono">${peso(p)}</td><td class="mono">${m}%</td></tr>`;
  }).join("") || `<tr><td colspan="5" style="color:var(--muted);">No sales recorded yet.</td></tr>`;

  const weeks=["Wk 1","Wk 2","Wk 3","Wk 4"]; const weekProfits=[0,0,0,0];
  completed.forEach(t=>{
    const diffDays=(new Date()-new Date(t.date))/(1000*3600*24);
    const idx = Math.min(3,Math.floor(diffDays/7));
    weekProfits[3-idx]+=t.profit;
  });
  destroyChart("profitTrend");
  if(!chartsReady("profitTrend")) return;
  chartInstances["profitTrend"] = new Chart(document.getElementById("profitTrend"),{
    type:"bar",
    data:{labels:weeks,datasets:[{label:"Profit",data:weekProfits,backgroundColor:"#2D5A4A",borderRadius:6}]},
    options:{plugins:{legend:{display:false}},scales:{y:{ticks:{callback:v=>"₱"+v/1000+"k"},grid:{color:"#F0EDE4"}},x:{grid:{display:false}}}}
  });
}

/* ---------- Discounts ---------- */
function renderAdminDiscounts(main){
  main.innerHTML = topbar("Discount Management","Create and manage every promotion mall-wide.",
    `<button class="btn btn-primary btn-sm" onclick="openDiscountModal()">➕ Add Discount</button>`);
  const panel = document.createElement("div"); panel.className="panel";
  panel.innerHTML = `<table><thead><tr><th>Promotion</th><th>Scope</th><th>Amount</th><th>Start</th><th>End</th><th>Status</th><th></th></tr></thead><tbody id="discTableBody"></tbody></table>`;
  main.appendChild(panel);
  renderDiscountTable();
}
function renderDiscountTable(){
  const tbody = document.getElementById("discTableBody"); if(!tbody) return;
  tbody.innerHTML = discounts.map(d=>`
    <tr>
      <td><strong>${d.name}</strong></td>
      <td>${d.scope}</td>
      <td class="mono">${d.pct}% OFF</td>
      <td>${fmtDate(d.start)}</td>
      <td>${fmtDate(d.end)}</td>
      <td><span class="status-pill status-${discountStatus(d)}">${discountStatus(d)}</span></td>
      <td><div class="row-actions">
        <button class="icon-btn" title="Edit" onclick="openDiscountModal(${d.id})">✏️</button>
        <button class="icon-btn" title="${d.active?'Deactivate':'Activate'}" onclick="toggleDiscount(${d.id})">⇄</button>
        <button class="icon-btn" title="Delete" onclick="deleteDiscount(${d.id})">🗑️</button>
      </div></td>
    </tr>`).join("");
}
function openDiscountModal(id){
  const editing = id ? discounts.find(d=>d.id===id) : null;
  buildModal(editing ? "Edit Discount" : "Add Discount", `
    <div class="field"><label>Promotion Name</label><input id="dmName" value="${editing?editing.name:""}" placeholder="e.g. Flash Sale"></div>
    <div class="field-row">
      <div class="field"><label>Discount %</label><input id="dmPct" type="number" min="0" max="100" value="${editing?editing.pct:10}"></div>
      <div class="field"><label>Scope</label><select id="dmScope"><option ${editing&&editing.scope==="Storewide"?"selected":""}>Storewide</option>${CATS.map(c=>`<option ${editing&&editing.scope===c?"selected":""}>${c}</option>`).join("")}</select></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Start Date</label><input id="dmStart" type="date" value="${editing?editing.start:new Date().toISOString().slice(0,10)}"></div>
      <div class="field"><label>Expiration Date</label><input id="dmEnd" type="date" value="${editing?editing.end:""}"></div>
    </div>
  `, async ()=>{
    const name=document.getElementById("dmName").value.trim();
    const pct=Math.max(0,Math.min(100,+document.getElementById("dmPct").value||0));
    const scope=document.getElementById("dmScope").value;
    const start=document.getElementById("dmStart").value;
    const end=document.getElementById("dmEnd").value;
    if(!name||!start||!end){ toast("Please complete the promotion details.","⚠"); return false; }
    if(new Date(end)<new Date(start)){ toast("Expiration date cannot be before the start date.","⚠"); return false; }

    const payload={name,pct,scope,start_date:start,end_date:end,active:true};
    let result;
    if(editing){
      result=await supabaseClient.from("discounts").update(payload).eq("id",editing.id).select().single();
    } else {
      result=await supabaseClient.from("discounts").insert(payload).select().single();
    }
    if(result.error){ console.error("Discount save error:",result.error); toast(`Failed to save discount: ${result.error.message}`,"⚠"); return false; }

    const d=result.data;
    const mapped={id:d.id,name:d.name,pct:Number(d.pct),scope:d.scope,start:d.start_date,end:d.end_date,active:d.active};
    if(editing) Object.assign(editing,mapped); else discounts.push(mapped);
    toast(editing?"Promotion updated successfully.":"Promotion created successfully.");
    renderDiscountTable();
    return true;
  });
}

async function toggleDiscount(id){
  const d=discounts.find(x=>x.id===id); if(!d) return;
  const {data,error}=await supabaseClient.from("discounts").update({active:!d.active}).eq("id",id).select().single();
  if(error){ console.error(error); toast("Failed to update promotion.","⚠"); return; }
  d.active=data.active;
  renderDiscountTable();
  toast(`Promotion ${d.active?"activated":"deactivated"}.`);
}

async function deleteDiscount(id){
  if(!confirm("Delete this promotion?")) return;
  const {error}=await supabaseClient.from("discounts").delete().eq("id",id);
  if(error){ console.error(error); toast("Failed to delete promotion.","⚠"); return; }
  discounts=discounts.filter(d=>d.id!==id);
  renderDiscountTable();
  toast("Promotion deleted.");
}

/* ---------- Locations ---------- */
function renderAdminLocations(main){
  main.innerHTML = topbar("Location Management","Every mall branch and its details.",
    `<button class="btn btn-primary btn-sm" onclick="openLocationModal()">➕ Add Location</button>`);
  const grid = document.createElement("div"); grid.className="card-grid"; grid.id="locGrid";
  main.appendChild(grid);
  renderLocationGrid();
}
function renderLocationGrid(){
  const grid = document.getElementById("locGrid"); if(!grid) return;
  grid.innerHTML = locations.map(l=>`
    <div class="branch-card">
      <h4>${l.branch}</h4>
      <span class="badge">${l.hours}</span>
      <dl>
        <div>${l.address}, ${l.city}, ${l.province}</div>
        <div>${l.contact}</div>
        <div>${l.desc}</div>
      </dl>
      <div class="row-actions" style="margin-top:14px;">
        <button class="btn btn-ghost btn-sm" onclick="openLocationModal(${l.id})">✏️ Edit</button>
        <button class="btn btn-danger btn-sm" onclick="deleteLocation(${l.id})">🗑️ Delete</button>
      </div>
    </div>`).join("");
}
function openLocationModal(id){
  const editing = id ? locations.find(l=>l.id===id) : null;
  buildModal(editing ? "Edit Location" : "Add Location", `
    <div class="field"><label>Branch Name</label><input id="lmBranch" value="${editing?editing.branch:""}"></div>
    <div class="field"><label>Complete Address</label><input id="lmAddress" value="${editing?editing.address:""}"></div>
    <div class="field-row">
      <div class="field"><label>City</label><input id="lmCity" value="${editing?editing.city:""}"></div>
      <div class="field"><label>Province</label><input id="lmProvince" value="${editing?editing.province:""}"></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Contact Number</label><input id="lmContact" value="${editing?editing.contact:""}"></div>
      <div class="field"><label>Opening Hours</label><input id="lmHours" value="${editing?editing.hours:"9:00 AM – 9:00 PM"}"></div>
    </div>
    <div class="field"><label>Store Description</label><textarea id="lmDesc" rows="2">${editing?editing.desc:""}</textarea></div>
  `, async ()=>{
    const branch=document.getElementById("lmBranch").value.trim();
    if(!branch){ toast("Please name the branch.","⚠"); return false; }
    const payload={
      branch,
      mall:"Rizza Court",
      address:document.getElementById("lmAddress").value.trim(),
      city:document.getElementById("lmCity").value.trim(),
      province:document.getElementById("lmProvince").value.trim(),
      contact:document.getElementById("lmContact").value.trim(),
      hours:document.getElementById("lmHours").value.trim(),
      description:document.getElementById("lmDesc").value.trim()
    };
    let result;
    if(editing){
      result=await supabaseClient.from("locations").update(payload).eq("id",editing.id).select().single();
    } else {
      result=await supabaseClient.from("locations").insert(payload).select().single();
    }
    if(result.error){ console.error("Location save error:",result.error); toast(`Failed to save location: ${result.error.message}`,"⚠"); return false; }
    const l=result.data;
    const mapped={id:l.id,branch:l.branch,mall:l.mall||"Rizza Court",address:l.address||"",city:l.city||"",province:l.province||"",contact:l.contact||"",hours:l.hours||"",desc:l.description||""};
    if(editing) Object.assign(editing,mapped); else locations.push(mapped);
    toast(editing?"Location updated successfully.":"Location added successfully.");
    renderLocationGrid(); renderPublicLocations();
    return true;
  });
}

async function deleteLocation(id){
  if(!confirm("Delete this location?")) return;
  const {error}=await supabaseClient.from("locations").delete().eq("id",id);
  if(error){ console.error(error); toast("Failed to delete location.","⚠"); return; }
  locations=locations.filter(l=>l.id!==id);
  renderLocationGrid(); renderPublicLocations();
  toast("Location deleted.");
}

/* ---------- Settings & Admin Account ---------- */
function renderAdminSettings(main){
  main.innerHTML = topbar("Settings","System-wide preferences for this demo environment.");
  const panel = document.createElement("div"); panel.className="panel";
  panel.innerHTML = `
    <div class="field"><label>Mall Name</label><input value="Rizza Court"></div>
    <div class="field"><label>Default Currency</label><select><option>PHP (₱)</option><option>USD ($)</option></select></div>
    <div class="field"><label>VAT / Tax Rate</label><input value="12%"></div>
    <button class="btn btn-dark" onclick="toast('Settings saved.')">Save Settings</button>
  `;
  main.appendChild(panel);
}
function renderAdminAccount(main){
  const a = state.currentUser||{name:"Court Admin",email:"admin@rizzacourt.example"};
  main.innerHTML = topbar("Admin Account","Your administrator profile.");
  const panel = document.createElement("div"); panel.className="panel"; panel.style.maxWidth="480px";
  panel.innerHTML = `
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:20px;">
      <div class="avatar" style="width:52px;height:52px;font-size:18px;">${a.name.split(" ").map(w=>w[0]).join("").slice(0,2)}</div>
      <div><strong>${a.name}</strong><br><span style="color:var(--muted);font-size:13px;">${a.email}</span></div>
    </div>
    <div class="field"><label>Full Name</label><input id="admName" value="${a.name}"></div>
    <div class="field"><label>Email</label><input id="admEmail" value="${a.email}"></div>
    <button class="btn btn-dark" onclick="saveAdminAccount()">Save Changes</button>
  `;
  main.appendChild(panel);

  const pwPanel = document.createElement("div"); pwPanel.className="panel"; pwPanel.style.maxWidth="480px"; pwPanel.style.marginTop="22px";
  pwPanel.innerHTML = `
    <div class="panel-head"><h3>Change Password</h3><span class="sub">Update the password for this admin account.</span></div>
    <div class="field"><label>New Password</label><input type="password" id="admPwNew" placeholder="••••••••" minlength="6"></div>
    <div class="field"><label>Confirm New Password</label><input type="password" id="admPwConfirm" placeholder="••••••••" minlength="6"></div>
    <button class="btn btn-outline" onclick="changeOwnPassword('admPwNew','admPwConfirm')">Update Password</button>
  `;
  main.appendChild(pwPanel);
}
async function saveAdminAccount(){
  const u = state.currentUser;
  if(!u || !u.id){
    toast("You are not signed in.","⚠");
    return;
  }

  const name = document.getElementById("admName").value.trim();
  const email = document.getElementById("admEmail").value.trim();

  if(!name || !email){
    toast("Name and email are required.","⚠");
    return;
  }

  const { error: profileError } = await supabaseClient
    .from("profiles")
    .update({ name })
    .eq("id", u.id);

  if(profileError){
    console.error(profileError);
    toast("Failed to save admin profile.","⚠");
    return;
  }

  if(email !== u.email){
    const { error: authError } = await supabaseClient.auth.updateUser({ email });
    if(authError){
      console.error(authError);
      toast("Name saved, but the email could not be updated.","⚠");
      return;
    }
    toast("Profile saved. Check your new email to confirm the email change.");
  } else {
    toast("Admin profile saved successfully.");
  }

  u.name = name;
  u.email = email;
  renderAdminAccount(document.getElementById("adminMain"));
}

/* Shared by both the admin and customer account pages — updates the
   password of whichever account is currently signed in. This is the
   "I know my current password, I just want a new one" flow, separate
   from the emailed reset-link flow used for "I forgot my password". */
async function changeOwnPassword(newPwFieldId, confirmPwFieldId){
  const newPwField = document.getElementById(newPwFieldId);
  const confirmPwField = document.getElementById(confirmPwFieldId);
  const newPassword = newPwField.value;
  const confirmPassword = confirmPwField.value;

  if(newPassword.length < 6){ toast("Password must be at least 6 characters.","⚠"); return; }
  if(newPassword !== confirmPassword){ toast("Passwords don't match — try again.","⚠"); return; }

  const { error } = await supabaseClient.auth.updateUser({ password: newPassword });

  if(error){
    console.error("Password change failed:", error);
    toast("Could not update your password. Please try again.","⚠");
    return;
  }

  newPwField.value = "";
  confirmPwField.value = "";
  toast("Password updated successfully.");
}

/* ============================================================================================
   USER APP RENDERING
   ============================================================================================ */
function setUserTab(tab){
  state.userTab = tab;
  try { localStorage.setItem("rizza_user_tab", tab); } catch(err) {}
  document.querySelectorAll('#page-app-user .side-link').forEach(l=>l.classList.remove("active"));
  const link = document.querySelector(`#page-app-user [data-user-tab="${tab}"]`);
  if(link) link.classList.add("active");
  renderUserMain();
  updateCartBadge();
}

function renderUserMain(){
  const main = document.getElementById("userMain");
  const u = state.currentUser;
  document.getElementById("userSideName").textContent = u ? `Signed in as ${u.name.split(" ")[0]}` : "";
  const renderers = {
    home: renderUserHome, shop: renderUserShop, discounts: renderUserDiscounts,
    cart: renderUserCart, checkout: renderUserCheckout, receipt: renderUserReceiptPage,
    transactions: renderUserTransactions, account: renderUserAccount,
    locations: renderUserLocations, contact: renderUserContactTab, feedback: renderUserFeedbackTab,
  };
  main.innerHTML = "";
  (renderers[state.userTab]||renderUserHome)(main);
}

function updateCartBadge(){
  const badge = document.getElementById("cartCountBadge");
  const count = cart.reduce((s,c)=>s+c.qty,0);
  badge.textContent = count>0?count:"";
}

function renderUserHome(main){
  const u = state.currentUser||{name:"Guest"};
  main.innerHTML = "";
  const banner = document.createElement("div"); banner.className="promo-banner";
  const topDiscount = activeDiscounts()[0];
  banner.innerHTML = `<div><div class="tagline">🔥 Limited Time Only</div><h3>${topDiscount?`Get ${topDiscount.pct}% OFF ${topDiscount.scope}`:"New arrivals every week"}</h3><p>${topDiscount?`Valid until ${fmtDate(topDiscount.end)}.`:"Explore fresh drops across every category."}</p></div><button class="btn btn-primary" data-user-tab="discounts">View Promotions</button>`;
  main.appendChild(banner);

  const sections = [
    ["Featured Products", products.slice(0,4)],
    ["New Products", products.slice(-4)],
    ["Popular Products", [...products].sort((a,b)=>b.stock<a.stock?1:-1).slice(0,4)],
  ];
  sections.forEach(([title,list])=>{
    const panel = document.createElement("div"); panel.className="panel";
    panel.innerHTML = `<div class="panel-head"><h3>${title}</h3><a href="#" data-user-tab="shop" style="font-size:12.5px;color:var(--gold);">See all →</a></div>`;
    const grid = document.createElement("div"); grid.className="prod-grid";
    grid.innerHTML = list.map(p=>userProductCard(p)).join("");
    panel.appendChild(grid);
    main.appendChild(panel);
  });
}

function userProductCard(p){
  return `<div class="prod-card">
    <div class="prod-thumb" style="${p.image?"":`background:${THUMB_BG[p.category]};`}" onclick="openProductPreview(${p.id})" title="View image & reviews">${p.discount>0?`<span class="disc-tag">-${p.discount}%</span>`:""}${p.image?`<img src="${p.image}" alt="${p.name}">`:THUMB[p.category]}</div>
    <div class="prod-body">
      <div class="cat">${p.category}</div>
      <h4>${p.name}</h4>
      <div class="desc">${p.description||""}</div>
      <div class="stock">${p.stock<=8&&p.stock>0?`<span style="color:var(--coral);">Only ${p.stock} left</span>`:p.stock===0?`<span style="color:var(--coral);">Out of stock</span>`:`In stock`}</div>
      <div class="price-row">
        <div class="price">${p.discount>0?`<span class="old">${peso(p.price)}</span>`:""}${peso(effectivePrice(p))}</div>
        <button class="btn btn-primary btn-sm" ${p.stock===0?"disabled":""} onclick="addToCart(${p.id})">Add</button>
      </div>
    </div>
  </div>`;
}

function renderUserShop(main){
  main.innerHTML = `<div class="app-topbar"><div><h2>Shop</h2><div class="sub">Browse everything Rizza Court has to offer.</div></div>
    <div class="topbar-actions"><div class="search-box"><input id="shopSearch" placeholder="Search products..." value="${state.productSearch}"></div></div></div>`;
  const chips = document.createElement("div"); chips.className="filter-chips"; chips.style.marginBottom="18px";
  chips.innerHTML = ["All",...CATS].map(c=>`<div class="chip ${state.productCatFilter===c?'active':''}" data-shopcat="${c}">${c}</div>`).join("");
  main.appendChild(chips);
  const grid = document.createElement("div"); grid.className="prod-grid"; grid.id="shopGrid";
  main.appendChild(grid);
  renderShopGrid();
  document.getElementById("shopSearch").addEventListener("input",e=>{ state.productSearch=e.target.value; renderShopGrid(); });
  chips.querySelectorAll(".chip").forEach(chip=>chip.addEventListener("click",()=>{ state.productCatFilter=chip.dataset.shopcat; renderUserShop(main); }));
}
function renderShopGrid(){
  const grid = document.getElementById("shopGrid"); if(!grid) return;
  const list = products.filter(p=>p.status==="Enabled" && (state.productCatFilter==="All"||p.category===state.productCatFilter) && p.name.toLowerCase().includes(state.productSearch.toLowerCase()));
  grid.innerHTML = list.length ? list.map(p=>userProductCard(p)).join("") : emptyState("🔍","No products found","Try a different search or category.");
}

function addToCart(id){
  const line = cart.find(c=>c.productId===id);
  const prod = products.find(p=>p.id===id);
  if(!prod||prod.stock<=0){ toast("That item is out of stock.","⚠"); return; }
  if(line) line.qty = Math.min(line.qty+1,prod.stock);
  else cart.push({productId:id,qty:1});
  toast(`${prod.name} added to cart.`);
  updateCartBadge();
}

function renderUserDiscounts(main){
  main.innerHTML = `<div class="app-topbar"><div><h2>Discounts</h2><div class="sub">Everything currently on promotion.</div></div></div>`;
  const grid = document.createElement("div"); grid.className="promo-grid";
  const list = activeDiscounts();
  grid.innerHTML = list.length ? list.map(d=>`
    <div class="promo-card">
      <span class="badge">🔥 Limited Time</span>
      <h4>${d.name}</h4>
      <div class="pct">${d.pct}% OFF</div>
      <div class="meta">${d.scope}<br>Valid ${fmtDate(d.start)} – ${fmtDate(d.end)}<br>Terms: while stocks last, cannot be combined with other offers.</div>
    </div>`).join("") : emptyState("🏷️","No active promotions","Check back soon for new deals.");
  main.appendChild(grid);
}

function renderUserCart(main){
  main.innerHTML = `<div class="app-topbar"><div><h2>Cart</h2><div class="sub">Review items before checkout.</div></div></div>`;
  if(cart.length===0){ main.innerHTML += emptyState("🛒","Your cart is empty","Add something from the Shop to get started."); return; }
  const wrap = document.createElement("div"); wrap.className="split-panel";
  const left = document.createElement("div"); left.className="panel";
  left.innerHTML = cart.map(line=>{
    const p = products.find(x=>x.id===line.productId);
    if(!p) return "";
    return `<div class="cart-line">
      <div class="thumb" style="${p.image?"":`background:${THUMB_BG[p.category]};`}">${p.image?`<img src="${p.image}" alt="${p.name}">`:THUMB[p.category]}</div>
      <div><strong>${p.name}</strong><br><span style="color:var(--muted);font-size:12px;">${p.category}${p.discount>0?` · ${p.discount}% off`:""}</span></div>
      <div class="qty-ctrl"><button onclick="changeQty(${p.id},-1)">−</button><span>${line.qty}</span><button onclick="changeQty(${p.id},1)">+</button></div>
      <div class="mono">${peso(effectivePrice(p))}</div>
      <div class="mono"><strong>${peso(effectivePrice(p)*line.qty)}</strong></div>
      <button class="icon-btn" onclick="removeFromCart(${p.id})">✕</button>
    </div>`;
  }).join("");
  wrap.appendChild(left);

  const totals = cartTotals();
  const right = document.createElement("div"); right.className="summary-box";
  right.innerHTML = `
    <h4 style="margin-bottom:14px;">Order Summary</h4>
    <div class="summary-line"><span>Subtotal</span><span class="mono">${peso(totals.subtotal)}</span></div>
    <div class="summary-line"><span>Discount</span><span class="mono">− ${peso(totals.discount)}</span></div>
    <div class="summary-line"><span>VAT (12%)</span><span class="mono">${peso(totals.vat)}</span></div>
    <div class="summary-line total"><span>Total</span><span>${peso(totals.total)}</span></div>
    <button class="btn btn-primary btn-block" style="margin-top:16px;" data-user-tab="checkout">Checkout →</button>
  `;
  wrap.appendChild(right);
  main.appendChild(wrap);
}
function changeQty(productId,delta){
  const line = cart.find(c=>c.productId===productId);
  const prod = products.find(p=>p.id===productId);
  if(!line) return;
  line.qty += delta;
  if(line.qty<=0){ cart = cart.filter(c=>c.productId!==productId); }
  else line.qty = Math.min(line.qty,prod.stock);
  renderUserMain(); updateCartBadge();
}
function removeFromCart(productId){ cart = cart.filter(c=>c.productId!==productId); renderUserMain(); updateCartBadge(); toast("Item removed from cart."); }

function cartTotals(){
  let subtotal=0, discount=0;
  cart.forEach(line=>{
    const p = products.find(x=>x.id===line.productId); if(!p) return;
    subtotal += p.price*line.qty;
    discount += p.price*line.qty*(p.discount/100);
  });
  const afterDiscount = subtotal-discount;
  const vat = afterDiscount*0.12;
  return {subtotal,discount,vat,total:afterDiscount+vat};
}

function renderUserCheckout(main){
  if(cart.length===0){ main.innerHTML = `<div class="app-topbar"><div><h2>Checkout</h2></div></div>` + emptyState("🛒","Your cart is empty","Add items to your cart before checking out."); return; }
  const totals = cartTotals();
  main.innerHTML = `<div class="app-topbar"><div><h2>Checkout</h2><div class="sub">Confirm your order and payment method.</div></div></div>`;
  const wrap = document.createElement("div"); wrap.className="split-panel";
  const left = document.createElement("div"); left.className="panel";
  left.innerHTML = `<div class="panel-head"><h3>Order Summary</h3></div>
    <table><thead><tr><th>Product</th><th>Qty</th><th>Subtotal</th></tr></thead><tbody>
    ${cart.map(line=>{ const p=products.find(x=>x.id===line.productId); return `<tr><td>${p.name}</td><td>${line.qty}</td><td class="mono">${peso(effectivePrice(p)*line.qty)}</td></tr>`; }).join("")}
    </tbody></table>
    <div class="field" style="margin-top:20px;"><label>Payment Method</label>
      <select id="payMethod"><option>Cash</option><option>Card</option><option>E-Wallet</option></select>
    </div>
    <div class="field" id="cashGivenField"><label>Amount Given (₱)</label><input id="cashGivenInput" type="number" min="0" step="1" placeholder="e.g. ${Math.ceil(totals.total/100)*100}">
      <div class="helper" id="changeHelper">Enter the cash the customer handed over to see change due.</div>
    </div>`;
  wrap.appendChild(left);

  const right = document.createElement("div"); right.className="summary-box";
  right.innerHTML = `
    <h4 style="margin-bottom:14px;">Total Due</h4>
    <div class="summary-line"><span>Subtotal</span><span class="mono">${peso(totals.subtotal)}</span></div>
    <div class="summary-line"><span>Discount</span><span class="mono">− ${peso(totals.discount)}</span></div>
    <div class="summary-line"><span>VAT (12%)</span><span class="mono">${peso(totals.vat)}</span></div>
    <div class="summary-line total"><span>Final Total</span><span>${peso(totals.total)}</span></div>
    <button class="btn btn-primary btn-block" style="margin-top:16px;" onclick="placeOrder()">Place Order</button>
  `;
  wrap.appendChild(right);
  main.appendChild(wrap);

  const methodSelect = document.getElementById("payMethod");
  const cashField = document.getElementById("cashGivenField");
  const cashInput = document.getElementById("cashGivenInput");
  const changeHelper = document.getElementById("changeHelper");
  function syncCashField(){
    const isCash = methodSelect.value==="Cash";
    cashField.style.display = isCash ? "block" : "none";
  }
  function syncChangeHelper(){
    const given = +cashInput.value || 0;
    if(given<=0){ changeHelper.textContent = "Enter the cash the customer handed over to see change due."; changeHelper.style.color="var(--muted)"; return; }
    const change = given - totals.total;
    if(change<0){ changeHelper.textContent = `Short by ${peso(Math.abs(change))}.`; changeHelper.style.color="var(--coral)"; }
    else { changeHelper.textContent = `Change due: ${peso(change)}`; changeHelper.style.color="var(--green)"; }
  }
  methodSelect.addEventListener("change",syncCashField);
  cashInput.addEventListener("input",syncChangeHelper);
  syncCashField();
}

async function placeOrder(){
  if(!state.currentUser?.id){ toast("Please sign in before checking out.","⚠"); return; }
  if(!cart.length){ toast("Your cart is empty.","⚠"); return; }

  const method = document.getElementById("payMethod")?.value || "Cash";
  const totals = cartTotals();
  let cashGiven = null;
  if(method==="Cash"){
    cashGiven = +document.getElementById("cashGivenInput")?.value || 0;
    if(cashGiven<=0){ toast("Enter the amount of cash given.","⚠"); return; }
    if(cashGiven<totals.total){ toast("Cash given is less than the total due.","⚠"); return; }
  }

  const items = cart.map(line=>({product:products.find(p=>p.id===line.productId),qty:line.qty}));
  if(items.some(it=>!it.product)){ toast("One or more products are no longer available.","⚠"); return; }
  if(items.some(it=>it.qty>it.product.stock)){ toast("Some items no longer have enough stock.","⚠"); await loadProducts(); renderUserMain(); return; }

  const location = locations[0]?.branch || "Main Branch";
  const txId = `TXN-${Date.now()}-${Math.random().toString(36).slice(2,7).toUpperCase()}`;
  const date = new Date().toISOString();
  let cost=0;
  items.forEach(it=>cost += it.product.cost*it.qty);
  const afterDiscount = totals.subtotal-totals.discount;
  const profit = afterDiscount-cost;
  const change = method==="Cash" ? cashGiven-totals.total : null;

  const transactionRow={
    id:txId,
    customer_id:state.currentUser.id,
    customer_name:state.currentUser.name,
    subtotal:totals.subtotal,
    discount:totals.discount,
    vat:totals.vat,
    total:totals.total,
    cost,
    profit,
    method,
    status:"Completed",
    location,
    date,
    cash_given:cashGiven,
    change
  };

  const {data:createdTx,error:txError}=await supabaseClient
    .from("transactions").insert(transactionRow).select().single();
  if(txError){ console.error("Transaction save error:",txError); toast(`Checkout failed: ${txError.message}`,"⚠"); return; }

  const itemRows=items.map(it=>({
    transaction_id:createdTx.id,
    product_id:it.product.id,
    name:it.product.name,
    qty:it.qty,
    price:it.product.price,
    discount:it.product.discount,
    category:it.product.category
  }));
  const {error:itemError}=await supabaseClient.from("transaction_items").insert(itemRows);
  if(itemError){
    console.error("Transaction items error:",itemError);
    await supabaseClient.from("transactions").delete().eq("id",createdTx.id);
    toast(`Checkout failed while saving items: ${itemError.message}`,"⚠");
    return;
  }

  for(const it of items){
    const newStock=Math.max(0,it.product.stock-it.qty);
    const {error:stockError}=await supabaseClient.from("products").update({stock:newStock}).eq("id",it.product.id);
    if(stockError){
      console.error("Stock update error:",stockError);
      toast("Order saved, but stock update failed. Please check the product stock.","⚠");
    }
  }

  const tx={
    id:createdTx.id,
    customerId:createdTx.customer_id,
    customerName:createdTx.customer_name,
    items:items.map(it=>({name:it.product.name,qty:it.qty,price:it.product.price,discount:it.product.discount,category:it.product.category,productId:it.product.id})),
    subtotal:Number(createdTx.subtotal),discount:Number(createdTx.discount),vat:Number(createdTx.vat),total:Number(createdTx.total),cost:Number(createdTx.cost),profit:Number(createdTx.profit),
    method:createdTx.method,status:createdTx.status,location:createdTx.location,date:createdTx.date,cashGiven:createdTx.cash_given,change:createdTx.change
  };

  transactions.unshift(tx);
  await loadProducts();
  cart=[];
  state.pendingReceipt=tx;
  updateCartBadge();
  toast("Order placed! Here's your receipt.");
  setUserTab("receipt");
}

function renderUserReceiptPage(main){
  const t = state.pendingReceipt || [...transactions].reverse().find(t=>t.customerId===(state.currentUser&&state.currentUser.id));
  main.innerHTML = `<div class="app-topbar"><div><h2>Order Confirmed</h2><div class="sub">Thank you for shopping with us.</div></div></div>`;
  if(!t){ main.innerHTML += emptyState("🧾","No recent order","Your receipt will appear here after checkout."); return; }
  const box = document.createElement("div");
  box.innerHTML = receiptHtml(t) + `<div style="text-align:center;margin-top:20px;display:flex;gap:10px;justify-content:center;">
    <button class="btn btn-ghost btn-sm" onclick="window.print()">🖨️ Print Receipt</button>
    <button class="btn btn-dark btn-sm" data-user-tab="transactions">View My Transactions</button>
  </div>`;
  main.appendChild(box);
}

function receiptHtml(t){
  const hasCash = t.method==="Cash" && typeof t.cashGiven==="number" && t.cashGiven>0;
  return `<div class="receipt">
    <h3>RIZZA COURT</h3>
    <div class="center">${t.location}</div>
    <div class="center">${new Date(t.date).toLocaleString("en-PH")}</div>
    <hr>
    <div class="r-line"><span>Txn ID</span><span>${t.id}</span></div>
    <div class="r-line"><span>Customer</span><span>${t.customerName}</span></div>
    <hr>
    ${t.items.map(i=>`<div class="r-line"><span>${i.name} × ${i.qty}</span><span>${peso(i.price*i.qty*(1-i.discount/100))}</span></div>`).join("")}
    <hr>
    <div class="r-line"><span>Subtotal</span><span>${peso(t.subtotal)}</span></div>
    <div class="r-line"><span>Discount</span><span>− ${peso(t.discount)}</span></div>
    <div class="r-line"><span>VAT (12%)</span><span>${peso(t.vat)}</span></div>
    <div class="r-line" style="font-weight:700;"><span>TOTAL</span><span>${peso(t.total)}</span></div>
    <hr>
    <div class="r-line"><span>Payment</span><span>${t.method}</span></div>
    ${hasCash?`<div class="r-line"><span>Cash Given</span><span>${peso(t.cashGiven)}</span></div>
    <div class="r-line" style="font-weight:700;"><span>Change</span><span>${peso(t.change)}</span></div>`:""}
    <div class="r-line"><span>Status</span><span>${t.status}</span></div>
    <hr>
    <div class="center" style="margin-top:10px;">Thank you for shopping with us! ❤️</div>

  </div>`;
}

function renderUserTransactions(main){
  main.innerHTML = `<div class="app-topbar"><div><h2>My Transactions</h2><div class="sub">Only your own purchases are shown here.</div></div></div>`;
  const mine = transactions.filter(t=>t.customerId===(state.currentUser&&state.currentUser.id)).reverse();
  if(mine.length===0){ main.innerHTML += emptyState("🧾","No transactions yet","Your purchases will show up here."); return; }
  const panel = document.createElement("div"); panel.className="panel";
  panel.innerHTML = `<table><thead><tr><th>Txn ID</th><th>Products</th><th>Total</th><th>Payment</th><th>Date</th><th>Status</th></tr></thead><tbody>
    ${mine.map(t=>`<tr style="cursor:pointer;" onclick="viewMyReceipt('${t.id}')">
      <td class="mono">${t.id}</td><td>${t.items.map(i=>i.name).join(", ")}</td><td class="mono">${peso(t.total)}</td><td>${t.method}</td><td>${fmtDate(t.date)}</td>
      <td><span class="status-pill status-${t.status}">${t.status}</span></td></tr>`).join("")}
  </tbody></table>`;
  main.appendChild(panel);
}
function viewMyReceipt(id){
  const t = transactions.find(x=>x.id===id);
  buildModal(`Receipt — ${t.id}`,receiptHtml(t),null,"Close");
}

function renderUserAccount(main){
  const u = state.currentUser;
  main.innerHTML = `<div class="app-topbar"><div><h2>My Account</h2><div class="sub">Manage your personal information.</div></div></div>`;
  const panel = document.createElement("div"); panel.className="panel"; panel.style.maxWidth="480px";
  panel.innerHTML = `
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:20px;">
      <div class="avatar" style="width:56px;height:56px;font-size:19px;">${u.name.split(" ").map(w=>w[0]).join("").slice(0,2)}</div>
      <div><strong>${u.name}</strong><br><span style="color:var(--muted);font-size:13px;">Member since ${fmtDate(u.regDate||"2026-01-01")}</span></div>
    </div>
    <div class="field"><label>Full Name</label><input value="${u.name}" disabled></div>
    <div class="field"><label>Email</label><input value="${u.email}" disabled></div>
    <div class="field"><label>Phone Number</label><input id="accPhone" value="${u.phone||""}"></div>
    <div class="field"><label>Address</label><input id="accAddress" value="${u.address||""}"></div>
    <button class="btn btn-dark" onclick="saveUserAccount()">Save Changes</button>
    <p class="helper" style="margin-top:14px;">Your full name can't be changed here — contact support if it needs updating. You also can't edit sales records, product info, or other customers' data from here.</p>
  `;
  main.appendChild(panel);

  const pwPanel = document.createElement("div"); pwPanel.className="panel"; pwPanel.style.maxWidth="480px"; pwPanel.style.marginTop="22px";
  pwPanel.innerHTML = `
    <div class="panel-head"><h3>Change Password</h3><span class="sub">Update the password for your account.</span></div>
    <div class="field"><label>New Password</label><input type="password" id="accPwNew" placeholder="••••••••" minlength="6"></div>
    <div class="field"><label>Confirm New Password</label><input type="password" id="accPwConfirm" placeholder="••••••••" minlength="6"></div>
    <button class="btn btn-outline" onclick="changeOwnPassword('accPwNew','accPwConfirm')">Update Password</button>
  `;
  main.appendChild(pwPanel);
}
async function saveUserAccount(){
  const u = state.currentUser;
  if(!u || !u.id){
    toast("You are not signed in.","⚠");
    return;
  }

  const phone = document.getElementById("accPhone").value.trim();
  const address = document.getElementById("accAddress").value.trim();

  const { data: updatedProfile, error } = await supabaseClient
    .from("profiles")
    .update({ phone, address })
    .eq("id", u.id)
    .select("*")
    .single();

  if(error){
    console.error(error);
    toast("Failed to save your profile.","⚠");
    return;
  }

  u.phone = updatedProfile.phone || "";
  u.address = updatedProfile.address || "";

  const custRecord = customers.find(c=>c.id===u.id);
  if(custRecord){
    custRecord.phone = u.phone;
    custRecord.address = u.address;
  }

  toast("Account saved successfully.");
  renderUserMain();
}

function renderUserLocations(main){
  main.innerHTML = `<div class="app-topbar"><div><h2>Locations</h2><div class="sub">Find a Rizza Court branch near you.</div></div></div>`;
  const grid = document.createElement("div"); grid.className="card-grid";
  grid.innerHTML = locations.map(l=>`<div class="branch-card"><h4>${l.branch}</h4><span class="badge">${l.hours}</span><dl><div>${l.address}, ${l.city}</div><div>${l.contact}</div><div>${l.desc}</div></dl></div>`).join("");
  main.appendChild(grid);
}
function renderUserContactTab(main){
  main.innerHTML = `<div class="app-topbar"><div><h2>Contact</h2><div class="sub">We're here to help.</div></div></div>`;
  const panel = document.createElement("div"); panel.className="form-card"; panel.style.maxWidth="480px";
  panel.innerHTML = `
    <div class="field"><label>Full Name</label><input value="${state.currentUser.name}"></div>
    <div class="field"><label>Email</label><input value="${state.currentUser.email}"></div>
    <div class="field"><label>Message</label><textarea rows="4" placeholder="How can we help?"></textarea></div>
    <button class="btn btn-dark btn-block" onclick="toast('Message sent — we will reply soon.')">Send Message</button>
  `;
  main.appendChild(panel);
}

/* Customer Service (feedback). A customer's own submissions are shown
   here; Row Level Security on the `feedback` table keeps every other
   customer's feedback invisible to them, and keeps this list (and the
   admin's full list) both enforced on the server, not just hidden by UI. */
function renderUserFeedbackTab(main){
  main.innerHTML = `<div class="app-topbar"><div><h2>Customer Service</h2><div class="sub">Send feedback or a concern straight to our admin team.</div></div></div>`;

  const formPanel = document.createElement("div"); formPanel.className="form-card"; formPanel.style.maxWidth="560px";
  formPanel.innerHTML = `
    <div class="field"><label>Subject</label><input id="fbSubject" placeholder="e.g. Issue with a recent order"></div>
    <div class="field"><label>Message</label><textarea id="fbMessage" rows="5" placeholder="Tell us what's on your mind..." required></textarea></div>
    <button class="btn btn-dark btn-block" id="fbSubmitBtn">Send to Admin</button>
  `;
  main.appendChild(formPanel);
  document.getElementById("fbSubmitBtn").addEventListener("click", submitFeedback);

  const historyPanel = document.createElement("div"); historyPanel.className="panel"; historyPanel.style.marginTop="22px";
  const mine = feedbackList.filter(f=>f.customerId===state.currentUser.id);
  historyPanel.innerHTML = `<div class="panel-head"><h3>Your past messages</h3><span class="sub">${mine.length} submitted</span></div>` +
    (mine.length===0
      ? emptyState("💬","No messages yet","Anything you send will show up here.")
      : mine.map(f=>`
        <div style="padding:14px 0;border-bottom:1px solid var(--border);">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
            <strong>${f.subject||"(No subject)"}</strong>
            <span class="status-pill status-${f.status}">${f.status}</span>
          </div>
          <p style="margin-top:6px;color:var(--muted);font-size:13.5px;white-space:pre-wrap;">${f.message}</p>
          <div style="margin-top:6px;font-size:12px;color:var(--muted);">${fmtDate(f.createdAt)}</div>
        </div>`).join(""));
  main.appendChild(historyPanel);
}

async function submitFeedback(){
  const subject = document.getElementById("fbSubject").value.trim();
  const message = document.getElementById("fbMessage").value.trim();

  if(!message){ toast("Please write a message before sending.","⚠"); return; }

  const btn = document.getElementById("fbSubmitBtn");
  btn.disabled = true;

  const { data, error } = await supabaseClient
    .from("feedback")
    .insert({
      customer_id: state.currentUser.id,
      customer_name: state.currentUser.name,
      customer_email: state.currentUser.email,
      subject,
      message,
      status: "New"
    })
    .select()
    .single();

  btn.disabled = false;

  if(error){
    console.error("Failed to submit feedback:", error);
    toast("Could not send your message. Please try again.","⚠");
    return;
  }

  feedbackList.unshift({
    id: data.id,
    customerId: data.customer_id,
    customerName: data.customer_name || "",
    customerEmail: data.customer_email || "",
    subject: data.subject || "",
    message: data.message || "",
    status: data.status || "New",
    createdAt: data.created_at
  });

  toast("Message sent to our admin team!");
  renderUserFeedbackTab(document.getElementById("userMain"));
}

/* ============================================================================================
   SHARED UI: modal, empty state, public locations
   ============================================================================================ */
function buildModal(title,bodyHtml,onSave,cancelLabel="Cancel"){
  const existing = document.querySelector(".modal-overlay"); if(existing) existing.remove();
  const overlay = document.createElement("div"); overlay.className="modal-overlay";
  overlay.innerHTML = `<div class="modal-box"><h3>${title}</h3><div>${bodyHtml}</div>
    <div class="modal-close-row">
      <button class="btn btn-ghost btn-sm" id="modalCancelBtn">${cancelLabel}</button>
      ${onSave?`<button class="btn btn-primary btn-sm" id="modalSaveBtn">Save</button>`:""}
    </div></div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener("click",(e)=>{ if(e.target===overlay) overlay.remove(); });
  document.getElementById("modalCancelBtn").addEventListener("click",()=>overlay.remove());
  if(onSave){
    document.getElementById("modalSaveBtn").addEventListener("click", async ()=>{
      const btn=document.getElementById("modalSaveBtn");
      btn.disabled=true;
      try {
        const result=await onSave();
        if(result!==false) overlay.remove();
      } catch(err) {
        console.error("Modal save error:",err);
        toast("Something went wrong while saving.","⚠");
      } finally {
        if(document.body.contains(btn)) btn.disabled=false;
      }
    });
  }
  return overlay;
}
function emptyState(icon,title,sub){
  return `<div class="empty-state"><div class="em">${icon}</div><h4>${title}</h4><p>${sub}</p></div>`;
}
function renderPublicLocations(){
  const grid = document.getElementById("publicLocationsGrid"); if(!grid) return;
  grid.innerHTML = locations.map(l=>`<div class="branch-card"><h4>${l.branch}</h4><span class="badge">${l.hours}</span><dl><div>${l.address}, ${l.city}, ${l.province}</div><div>${l.contact}</div><div>${l.desc}</div></dl></div>`).join("");
}
renderPublicLocations();

/* ============================================================================================
   DARK MODE
   ============================================================================================ */
function applyTheme(isDark){
  document.documentElement.classList.toggle("dark",isDark);
  const icon = isDark ? "☀️" : "🌙";
  const navBtn = document.getElementById("themeToggleNav");
  if(navBtn) navBtn.textContent = icon;
  ["themeToggleAdmin","themeToggleUser"].forEach(id=>{
    const btn = document.getElementById(id); if(!btn) return;
    const span = btn.querySelector("span");
    btn.firstChild.textContent = icon+" ";
    if(span) span.textContent = isDark ? "Light Mode" : "Dark Mode";
  });
}
function toggleTheme(){
  let isDark;
  try{
    isDark = !document.documentElement.classList.contains("dark");
    localStorage.setItem("rizzaCourtDarkMode", isDark ? "1" : "0");
  }catch(e){ isDark = !document.documentElement.classList.contains("dark"); }
  applyTheme(isDark);
}
["themeToggleNav","themeToggleAdmin","themeToggleUser"].forEach(id=>{
  const btn = document.getElementById(id);
  if(btn) btn.addEventListener("click",toggleTheme);
});
(function initTheme(){
  let saved = null;
  try{ saved = localStorage.getItem("rizzaCourtDarkMode"); }catch(e){}
  if(saved==="1") applyTheme(true);
})();

function startRealtime() {

  supabaseClient
    .channel("products-realtime")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "products"
      },
      async () => {
        console.log("Products changed. Reloading...");
        await loadProducts();

        if (state.adminTab === "products") {
          renderAdminMain();
        }

        if (state.userTab === "shop") {
          renderUserMain();
        }
      }
    )
    .subscribe();


  supabaseClient
    .channel("profiles-realtime")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "profiles"
      },
      async () => {
        console.log("Profiles changed. Reloading customers...");
        await loadCustomers();

        if (state.adminTab === "customers" || state.adminTab === "overview") {
          renderAdminMain();
          setAdminTab(state.adminTab);
        }
      }
    )
    .subscribe();


  supabaseClient
    .channel("transactions-realtime")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "transactions"
      },
      async () => {
        console.log("Transactions changed.");

        await loadTransactions();

        if (state.adminTab === "overview") {
          renderAdminMain();
        }

        if (state.adminTab === "transactions") {
          renderAdminMain();
        }

        if (state.adminTab === "sales") {
          renderAdminMain();
        }

        if (state.adminTab === "profits") {
          renderAdminMain();
        }
      }
    )
    .subscribe();
  supabaseClient
    .channel("feedback-realtime")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "feedback"
      },
      async (payload) => {
        console.log("Feedback changed. Reloading...");
        await loadFeedback();

        if (payload.eventType === "INSERT" && state.currentUser?.role === "admin") {
          if (state.adminTab !== "feedback") {
            toast(`New feedback from ${payload.new?.customer_name || "a customer"}.`, "💬");
          }
        }

        updateFeedbackNotifyDot();

        if (state.adminTab === "feedback") {
          renderAdminMain();
        }
        if (state.userTab === "feedback") {
          renderUserMain();
        }
      }
    )
    .subscribe();

  supabaseClient
    .channel("product_reviews-realtime")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "product_reviews"
      },
      async () => {
        console.log("Product reviews changed. Reloading...");
        await loadReviews();
        // Preview modal content is rebuilt fresh each time it's opened,
        // so we just refresh the underlying data here rather than
        // yanking any currently-open modal out from under the user.
      }
    )
    .subscribe();
}

/* ============================================================
   SESSION + PROFILE PERSISTENCE
   Restores the signed-in admin/customer after page refresh.
   ============================================================ */
async function restoreSession(){
  if(inPasswordRecovery){ sessionReady = true; return; }

  const { data: { session }, error } = await supabaseClient.auth.getSession();

  if(error){
    console.error("Session restore error:", error);
    sessionReady = true;
    gotoPage("landing");
    return;
  }

  if(!session?.user){
    state.currentUser = null;
    sessionReady = true;
    gotoPage("landing");
    return;
  }

  const { data: profile, error: profileError } = await supabaseClient
    .from("profiles")
    .select("*")
    .eq("id", session.user.id)
    .single();

  if(profileError || !profile){
    console.error("Profile restore error:", profileError);
    state.currentUser = null;
    sessionReady = true;
    gotoPage("landing");
    return;
  }

  if(profile.status === "Disabled"){
    await supabaseClient.auth.signOut();
    state.currentUser = null;
    sessionReady = true;
    gotoPage("landing");
    return;
  }

  state.currentUser = {
    role: profile.role,
    id: profile.id,
    name: profile.name || "",
    email: session.user.email || "",
    phone: profile.phone || "",
    address: profile.address || "",
    username: profile.username || "",
    regDate: profile.created_at || null,
    status: profile.status
  };

  let savedTab = null;
  try {
    savedTab = localStorage.getItem(
      profile.role === "admin" ? "rizza_admin_tab" : "rizza_user_tab"
    );
  } catch(err) {}

  sessionReady = true;

  // IMPORTANT: restore the authenticated app BEFORE rendering the UI.
  // This prevents the initial landing/login page from winning a race on refresh.
  if(profile.role === "admin"){
    state.adminTab = savedTab || "overview";
    gotoPage("app-admin");
    renderAdminMain();
    setAdminTab(state.adminTab);
  } else {
    state.userTab = savedTab || "home";
    gotoPage("app-user");
    renderUserMain();
    setUserTab(state.userTab);
  }
}

supabaseClient.auth.onAuthStateChange(async (event, session) => {
  if(event === "PASSWORD_RECOVERY"){
    // Fires once the user clicks the reset link in their email and lands
    // back here with a temporary recovery session. Send them straight to
    // the "set new password" screen instead of the normal app/login flow.
    inPasswordRecovery = true;
    gotoPage("reset-password");
    return;
  }

  if(event === "SIGNED_OUT"){
    state.currentUser = null;
    try {
      localStorage.removeItem("rizza_last_page");
      localStorage.removeItem("rizza_admin_tab");
      localStorage.removeItem("rizza_user_tab");
    } catch(err) {}
    // Only redirect if we're not already on a public page — this listener
    // can fire after performLogout() already navigated us to landing.
    const inApp = !document.getElementById("page-app-admin")?.classList.contains("hidden")
               || !document.getElementById("page-app-user")?.classList.contains("hidden");
    if(inApp) gotoPage("landing");
    return;
  }

  if((event === "SIGNED_IN" || event === "USER_UPDATED") && session?.user){
    // Session is restored separately; this keeps the in-memory profile current.
    const { data: profile } = await supabaseClient
      .from("profiles")
      .select("*")
      .eq("id", session.user.id)
      .single();

    if(profile){
      state.currentUser = {
        role: profile.role,
        id: profile.id,
        name: profile.name || "",
        email: session.user.email || "",
        phone: profile.phone || "",
        address: profile.address || "",
        username: profile.username || "",
        regDate: profile.created_at || null,
        status: profile.status
      };
    }
  }
});

/* Detect a Supabase password-recovery redirect ourselves, synchronously,
   before restoreSession() ever runs. This is the primary mechanism —
   the PASSWORD_RECOVERY auth event above is kept only as a backup, since
   it isn't reliably fired in time (or at all, depending on flow type)
   to win the race against restoreSession() seeing a valid session and
   sending the user straight to the dashboard. */
(function detectPasswordRecoveryRedirect(){
  const hash = window.location.hash || "";
  const search = window.location.search || "";
  const isRecovery = hash.includes("type=recovery") || search.includes("type=recovery") || search.includes("passwordReset=1");
  if(isRecovery){
    inPasswordRecovery = true;
    gotoPage("reset-password");
  }
})();

async function initializeOnlineData(){
  // Restore Supabase authentication first. The UI must not decide the initial
  // page until we know whether a session exists.
  await restoreSession();

  await Promise.all([
    loadProducts(),
    loadCustomers(),
    loadLocations(),
    loadDiscounts(),
    loadTransactions(),
    loadFeedback(),
    loadReviews()
  ]);

  // Re-render the already-restored section after online data arrives.
  if(state.currentUser?.role === "admin"){
    renderAdminMain();
    setAdminTab(state.adminTab);
    updateFeedbackNotifyDot();
  } else if(state.currentUser?.role === "user"){
    renderUserMain();
    setUserTab(state.userTab);
  }

  startRealtime();
  console.log("Rizza Court online data initialized.");
}

initializeOnlineData();