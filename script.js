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
  salesRange:"month",
  pendingReceipt:null,
};

let nextProductId = 1;
let nextCustomerId = 1;

function mkProduct(name,cat,cost,price,stock,discount,store){
  return {id:nextProductId++,name,category:cat,description:`${name} — a Rizza Court favorite from our ${cat.toLowerCase()} collection.`,cost,price,stock,discount,store,status:"Enabled",dateAdded:"2026-01-15"};
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
    dateAdded: p.date_added
  }));
}
let customers = [];

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

  locations = data;
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

document.addEventListener("click",(e)=>{
  const gotoEl = e.target.closest("[data-goto]");
  if(gotoEl){
    e.preventDefault();
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
  if(adminTabEl){ setAdminTab(adminTabEl.getAttribute("data-admin-tab")); }
  const userTabEl = e.target.closest("[data-user-tab]");
  if(userTabEl && !gotoEl){ setUserTab(userTabEl.getAttribute("data-user-tab")); }
});

/* ---------- Login role pick ---------- */
function selectLoginRole(role){
  state.loginRole = role;
  document.getElementById("rolePickUser").classList.toggle("selected",role==="user");
  document.getElementById("rolePickAdmin").classList.toggle("selected",role==="admin");
  document.getElementById("loginSubmitBtn").textContent = role==="admin" ? "Login as Admin" : "Login as Customer";
}

document.getElementById("loginForm").addEventListener("submit",async (e)=>{
  e.preventDefault();
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;

  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

  if(error){
    console.error(error);
    toast("Incorrect email or password.","⚠");
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
    password
  });

  if (error) {
    console.error(error);
    toast(error.message, "⚠");
    return;
  }

  const user = data.user;

  if (!user) {
    toast("Please check your email to confirm your account.");
    return;
  }

  const { error: profileError } = await supabaseClient
    .from("profiles")
    .insert({
      id: user.id,
      name,
      username,
      phone,
      address,
      role: "user",
      status: "Active"
    });

  if (profileError) {
    console.error(profileError);
    toast("Account created, but profile setup failed.", "⚠");
    return;
  }

  toast("Account created! Please log in.");

  e.target.reset();

  gotoPage("login");
  selectLoginRole("user");
});

document.getElementById("forgotPasswordLink").addEventListener("click",(e)=>{
  e.preventDefault();
  const email = document.getElementById("loginEmail").value.trim();
  if(!email){ toast("Enter your email above first, then click here.","⚠"); return; }
  toast(`Password reset instructions sent to ${email}.`);
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
}

function renderAdminMain(){
  const main = document.getElementById("adminMain");
  const renderers = {
    overview: renderAdminOverview,
    products: renderAdminProducts,
    customers: renderAdminCustomers,
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
      <div class="prod-thumb" style="background:${THUMB_BG[p.category]};">
        ${p.discount>0?`<span class="disc-tag">-${p.discount}%</span>`:""}
        ${THUMB[p.category]}
      </div>
      <div class="prod-body">
        <div class="cat">${p.category} · ${p.store}</div>
        <h4>${p.name}</h4>
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
  const modal = buildModal(editing?"Edit Product":"Add Product",`
    <div class="field"><label>Product Name</label><input id="pmName" value="${editing?editing.name:""}"></div>
    <div class="field-row">
      <div class="field"><label>Category</label><select id="pmCategory">${CATS.map(c=>`<option ${editing&&editing.category===c?"selected":""}>${c}</option>`).join("")}</select></div>
      <div class="field"><label>Branch</label><select id="pmStore">${locations.map(l=>`<option ${editing&&editing.store===l.branch.split(" — ")[1]?"selected":""}>Store ${l.id}</option>`).join("")}</select></div>
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
        <button class="icon-btn" title="View" onclick="viewCustomer(${c.id})">👁️</button>
        <button class="icon-btn" title="Toggle status" onclick="toggleCustomerStatus(${c.id})">⇄</button>
        <button class="icon-btn" title="Delete" onclick="deleteCustomer(${c.id})">🗑️</button>
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
function toggleCustomerStatus(id){
  const c = customers.find(x=>x.id===id);
  c.status = c.status==="Active"?"Disabled":"Active";
  toast(`Customer marked ${c.status}.`);
  renderCustomerTable();
}
function deleteCustomer(id){
  if(!confirm("Remove this customer account?")) return;
  customers = customers.filter(c=>c.id!==id);
  toast("Customer removed.");
  renderCustomerTable();
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
  const editing = id?discounts.find(d=>d.id===id):null;
  buildModal(editing?"Edit Discount":"Add Discount",`
    <div class="field"><label>Promotion Name</label><input id="dmName" value="${editing?editing.name:""}" placeholder="e.g. Flash Sale"></div>
    <div class="field-row">
      <div class="field"><label>Discount %</label><input id="dmPct" type="number" value="${editing?editing.pct:10}"></div>
      <div class="field"><label>Scope</label><select id="dmScope"><option ${editing&&editing.scope==="Storewide"?"selected":""}>Storewide</option>${CATS.map(c=>`<option ${editing&&editing.scope===c?"selected":""}>${c}</option>`).join("")}</select></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Start Date</label><input id="dmStart" type="date" value="${editing?editing.start:new Date().toISOString().slice(0,10)}"></div>
      <div class="field"><label>Expiration Date</label><input id="dmEnd" type="date" value="${editing?editing.end:""}"></div>
    </div>
  `,()=>{
    const name=document.getElementById("dmName").value.trim();
    const end=document.getElementById("dmEnd").value;
    if(!name||!end){ toast("Please name the promotion and set an end date.","⚠"); return false; }
    const data={name,pct:+document.getElementById("dmPct").value||0,scope:document.getElementById("dmScope").value,start:document.getElementById("dmStart").value,end,active:true};
    if(editing) Object.assign(editing,data); else discounts.push({id:nextDiscountId++,...data});
    toast(editing?"Promotion updated.":"Promotion created.");
    renderDiscountTable();
    return true;
  });
}
function toggleDiscount(id){ const d=discounts.find(x=>x.id===id); d.active=!d.active; renderDiscountTable(); toast(`Promotion ${d.active?"activated":"deactivated"}.`); }
function deleteDiscount(id){ if(!confirm("Delete this promotion?"))return; discounts=discounts.filter(d=>d.id!==id); renderDiscountTable(); toast("Promotion deleted."); }

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
  const editing = id?locations.find(l=>l.id===id):null;
  buildModal(editing?"Edit Location":"Add Location",`
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
  `,()=>{
    const branch=document.getElementById("lmBranch").value.trim();
    if(!branch){ toast("Please name the branch.","⚠"); return false; }
    const data={branch,mall:"Rizza Court",address:document.getElementById("lmAddress").value,city:document.getElementById("lmCity").value,province:document.getElementById("lmProvince").value,contact:document.getElementById("lmContact").value,hours:document.getElementById("lmHours").value,desc:document.getElementById("lmDesc").value};
    if(editing) Object.assign(editing,data); else locations.push({id:nextLocationId++,...data});
    toast(editing?"Location updated.":"Location added.");
    renderLocationGrid(); renderPublicLocations();
    return true;
  });
}
function deleteLocation(id){ if(!confirm("Delete this location?"))return; locations=locations.filter(l=>l.id!==id); renderLocationGrid(); renderPublicLocations(); toast("Location deleted."); }

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
    locations: renderUserLocations, contact: renderUserContactTab,
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
    <div class="prod-thumb" style="background:${THUMB_BG[p.category]};">${p.discount>0?`<span class="disc-tag">-${p.discount}%</span>`:""}${THUMB[p.category]}</div>
    <div class="prod-body">
      <div class="cat">${p.category}</div>
      <h4>${p.name}</h4>
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
  const wrap = document.createElement("div"); wrap.style.display="grid"; wrap.style.gridTemplateColumns="1.6fr 1fr"; wrap.style.gap="20px";
  const left = document.createElement("div"); left.className="panel";
  left.innerHTML = cart.map(line=>{
    const p = products.find(x=>x.id===line.productId);
    if(!p) return "";
    return `<div class="cart-line">
      <div class="thumb" style="background:${THUMB_BG[p.category]};">${THUMB[p.category]}</div>
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
  const wrap = document.createElement("div"); wrap.style.display="grid"; wrap.style.gridTemplateColumns="1.6fr 1fr"; wrap.style.gap="20px";
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

function placeOrder(){
  const method = document.getElementById("payMethod").value;
  const totals = cartTotals();
  let cashGiven = null;
  if(method==="Cash"){
    cashGiven = +document.getElementById("cashGivenInput").value || 0;
    if(cashGiven<=0){ toast("Enter the amount of cash given.","⚠"); return; }
    if(cashGiven<totals.total){ toast("Cash given is less than the total due.","⚠"); return; }
  }
  const items = cart.map(line=>({product:products.find(p=>p.id===line.productId),qty:line.qty}));
  const tx = buildTransaction(state.currentUser,items,method,"Completed",new Date(),cashGiven);
  transactions.push(tx);
  items.forEach(it=>{ it.product.stock = Math.max(0,it.product.stock-it.qty); });
  cart = [];
  state.pendingReceipt = tx;
  updateCartBadge();
  toast("Order placed! Here's your receipt.");
  state.userTab = "receipt";
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
    <div class="field"><label>Full Name</label><input id="accName" value="${u.name}"></div>
    <div class="field"><label>Email</label><input value="${u.email}" disabled></div>
    <div class="field"><label>Phone Number</label><input id="accPhone" value="${u.phone||""}"></div>
    <div class="field"><label>Address</label><input id="accAddress" value="${u.address||""}"></div>
    <button class="btn btn-dark" onclick="saveUserAccount()">Save Changes</button>
    <p class="helper" style="margin-top:14px;">You can't edit sales records, product info, or other customers' data from here.</p>
  `;
  main.appendChild(panel);
}
async function saveUserAccount(){
  const u = state.currentUser;
  if(!u || !u.id){
    toast("You are not signed in.","⚠");
    return;
  }

  const name = document.getElementById("accName").value.trim();
  const phone = document.getElementById("accPhone").value.trim();
  const address = document.getElementById("accAddress").value.trim();

  if(!name){
    toast("Full name is required.","⚠");
    return;
  }

  const { data: updatedProfile, error } = await supabaseClient
    .from("profiles")
    .update({ name, phone, address })
    .eq("id", u.id)
    .select("*")
    .single();

  if(error){
    console.error(error);
    toast("Failed to save your profile.","⚠");
    return;
  }

  u.name = updatedProfile.name;
  u.phone = updatedProfile.phone || "";
  u.address = updatedProfile.address || "";

  const custRecord = customers.find(c=>c.id===u.id);
  if(custRecord){
    custRecord.name = u.name;
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
  if(onSave){ document.getElementById("modalSaveBtn").addEventListener("click",()=>{ if(onSave()!==false) overlay.remove(); }); }
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
}



/* Initial view is decided by restoreSession() after Supabase session check. */
seedTransactions();

/* ============================================================
   SESSION + PROFILE PERSISTENCE
   Restores the signed-in admin/customer after page refresh.
   ============================================================ */
async function restoreSession(){
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
  if(event === "SIGNED_OUT"){
    state.currentUser = null;
    try {
      localStorage.removeItem("rizza_last_page");
      localStorage.removeItem("rizza_admin_tab");
      localStorage.removeItem("rizza_user_tab");
    } catch(err) {}
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

async function initializeOnlineData(){
  // Restore Supabase authentication first. The UI must not decide the initial
  // page until we know whether a session exists.
  await restoreSession();

  await Promise.all([
    loadProducts(),
    loadLocations(),
    loadDiscounts(),
    loadTransactions()
  ]);

  // Re-render the already-restored section after online data arrives.
  if(state.currentUser?.role === "admin"){
    renderAdminMain();
    setAdminTab(state.adminTab);
  } else if(state.currentUser?.role === "user"){
    renderUserMain();
    setUserTab(state.userTab);
  }

  startRealtime();
  console.log("Rizza Court online data initialized.");
}

initializeOnlineData();
