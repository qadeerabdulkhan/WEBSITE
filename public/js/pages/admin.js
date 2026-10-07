// Admin dashboard: orders, products & prices, categories, discounts, content, testimonials, customers, settings.
import { api, logout } from '../api.js';
import { html, raw, setHTML, $, $$, rs, toast, statusLabel, formatDate, safeHref } from '../util.js';
import { guardWebGL } from '../three/core.js';
import { staticProductImage, paymentLabel } from '../swatch.js';

const view = () => $('#view');
const STATUSES = ['pending_payment', 'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded', 'payment_failed'];
const SHAPES = [['classic', 'Classic (square)'], ['round', 'Round flacon'], ['tall', 'Tall cylinder'], ['flask', 'Teardrop flask'], ['oud', 'Faceted oud'], ['mist', 'Body mist']];
let categoriesCache = [];

function setActions(content = '') {
  setHTML($('#view-actions'), content);
}

/* ---------------- Generic modal form ---------------- */
function fieldHtml(f, v) {
  const id = `f-${f.name}`;
  const val = v ?? f.value ?? '';
  const wrap = (inner) => html`<div class="field ${f.full ? 'full' : ''}"><label for="${id}">${f.label}</label>${inner}${f.help ? html`<small class="muted">${f.help}</small>` : ''}</div>`;
  switch (f.type) {
    case 'textarea':
      return wrap(html`<textarea class="input" id="${id}" name="${f.name}" ${f.required ? raw('required') : ''}>${val}</textarea>`);
    case 'select':
      return wrap(html`<select class="input" id="${id}" name="${f.name}">${f.options.map(([o, l]) => html`<option value="${o}" ${String(o) === String(val) ? raw('selected') : ''}>${l}</option>`)}</select>`);
    case 'checkbox':
      return html`<label class="check ${f.full ? 'full' : ''}"><input type="checkbox" id="${id}" name="${f.name}" ${val ? raw('checked') : ''}> ${f.label}</label>`;
    case 'color':
      return wrap(html`<div class="color-field"><input type="color" id="${id}" name="${f.name}" value="${val || '#c9a96e'}"><span class="muted" data-color-label="${f.name}">${val}</span></div>`);
    case 'image':
      return wrap(html`<div class="img-field">
        <img alt="" data-img-preview src="${val ? safeHref(val) : 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=='}">
        <input type="hidden" name="${f.name}" value="${val}">
        <input class="input" type="file" accept="image/png,image/jpeg,image/webp" data-img-file style="max-width:260px">
        <button type="button" class="btn btn-ghost btn-sm" data-img-clear>Remove</button>
      </div>`);
    default:
      return wrap(html`<input class="input" id="${id}" name="${f.name}" type="${f.type || 'text'}" value="${val}" ${f.min != null ? raw(`min="${f.min}"`) : ''} ${f.max != null ? raw(`max="${f.max}"`) : ''} ${f.step ? raw(`step="${f.step}"`) : ''} ${f.required ? raw('required') : ''} ${f.placeholder ? raw(`placeholder="${f.placeholder}"`) : ''}>`);
  }
}

function openForm({ title, fields, values = {}, submitLabel = 'Save', onSubmit, intro = '', danger }) {
  const dialog = $('#modal');
  const form = $('#modal-form');
  setHTML(
    form,
    html`<h2>${title}</h2>${intro}
    <div class="form-grid">${fields.map((f) => fieldHtml(f, values[f.name]))}</div>
    <p class="form-error" id="modal-err"></p>
    <div class="modal-actions">
      ${danger ? html`<button type="button" class="btn btn-ghost" id="modal-danger" style="margin-right:auto;color:var(--danger)">${danger.label}</button>` : ''}
      <button type="button" class="btn btn-ghost" id="modal-cancel">Cancel</button>
      <button type="submit" class="btn" id="modal-submit">${submitLabel}</button>
    </div>`
  );
  $$('input[type=color]', form).forEach((c) => c.addEventListener('input', () => ($(`[data-color-label="${c.name}"]`, form).textContent = c.value)));
  $$('[data-img-file]', form).forEach((input) =>
    input.addEventListener('change', async () => {
      const file = input.files[0];
      if (!file) return;
      if (file.size > 4 * 1024 * 1024) return toast('Image must be under 4 MB.', { error: true });
      const dataUrl = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.onerror = rej;
        r.readAsDataURL(file);
      });
      try {
        const { url } = await api('/admin/upload', { method: 'POST', body: { dataUrl } });
        const box = input.closest('.img-field');
        box.querySelector('input[type=hidden]').value = url;
        box.querySelector('[data-img-preview]').src = url;
        toast('Image uploaded');
      } catch (e) {
        toast(e.message, { error: true });
      }
    })
  );
  $$('[data-img-clear]', form).forEach((b) =>
    b.addEventListener('click', () => {
      const box = b.closest('.img-field');
      box.querySelector('input[type=hidden]').value = '';
      box.querySelector('[data-img-preview]').removeAttribute('src');
    })
  );
  $('#modal-cancel').onclick = () => dialog.close();
  if (danger) $('#modal-danger').onclick = async () => {
    if (!confirm(danger.confirm || 'Are you sure?')) return;
    try {
      await danger.action();
      dialog.close();
    } catch (e) {
      $('#modal-err').textContent = e.message;
    }
  };
  form.onsubmit = async (e) => {
    e.preventDefault();
    const out = {};
    for (const f of fields) {
      const el = form.elements[f.name];
      if (!el) continue;
      out[f.name] = f.type === 'checkbox' ? el.checked : f.type === 'number' ? (el.value === '' ? '' : Number(el.value)) : el.value;
    }
    const btn = $('#modal-submit');
    btn.disabled = true;
    try {
      await onSubmit(out);
      dialog.close();
    } catch (err) {
      $('#modal-err').textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  };
  dialog.showModal();
}

/* ---------------- Overview ---------------- */
function revenueChart(daily) {
  // Fill the last 14 days so missing days show as zero.
  const byDay = new Map(daily.map((d) => [d.day, d]));
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
    days.push(byDay.get(d) || { day: d, revenue: 0, orders: 0 });
  }
  const max = Math.max(...days.map((d) => d.revenue), 1);
  const nice = Math.pow(10, Math.floor(Math.log10(max)));
  const top = Math.ceil(max / nice) * nice;
  const label = (d) => new Date(d + 'T00:00').toLocaleDateString('en-PK', { day: 'numeric', month: 'short' });
  return html`<div class="chart" id="rev-chart">
    <div class="chart-plot" role="img" aria-label="Paid revenue per day for the last 14 days">
      <div class="chart-grid"><span>${rs(top)}</span><span>${rs(top / 2)}</span><span></span></div>
      ${days.map(
        (d) => html`<div class="chart-col" tabindex="0" data-tip="${label(d.day)}: ${rs(d.revenue)} · ${d.orders} order${d.orders === 1 ? '' : 's'}">
          <div class="bar" style="height:${((d.revenue / top) * 100).toFixed(1)}%"></div></div>`
      )}
    </div>
    <div class="chart-x">${days.map((d, i) => html`<span>${i % 2 === 0 ? label(d.day) : ''}</span>`)}</div>
    <div class="chart-tip" hidden></div>
    <details style="margin-top:.8rem"><summary class="muted" style="cursor:pointer;font-size:.85rem">Show as table</summary>
      <table class="data" style="min-width:0;margin-top:.5rem"><thead><tr><th>Day</th><th class="num">Revenue</th><th class="num">Orders</th></tr></thead>
      <tbody>${days.map((d) => html`<tr><td>${label(d.day)}</td><td class="num">${rs(d.revenue)}</td><td class="num">${d.orders}</td></tr>`)}</tbody></table>
    </details>
  </div>`;
}

function wireChart() {
  const chart = $('#rev-chart');
  if (!chart) return;
  const tip = $('.chart-tip', chart);
  const show = (col) => {
    const r = col.getBoundingClientRect();
    const c = chart.getBoundingClientRect();
    tip.textContent = col.dataset.tip;
    tip.style.left = `${r.left - c.left + r.width / 2}px`;
    tip.style.top = `${Math.max(r.top - c.top + r.height - ($('.bar', col).offsetHeight || 0), 20)}px`;
    tip.hidden = false;
  };
  $$('.chart-col', chart).forEach((col) => {
    col.addEventListener('pointerenter', () => show(col));
    col.addEventListener('focus', () => show(col));
    col.addEventListener('pointerleave', () => (tip.hidden = true));
    col.addEventListener('blur', () => (tip.hidden = true));
  });
}

async function overview() {
  setActions();
  const s = await api('/admin/stats');
  const recent = await api('/admin/orders');
  setHTML(
    view(),
    html`${s.paymentMode === 'simulate' ? html`<p class="notice warn" style="margin-bottom:1rem">Payments are in <strong>test mode</strong>: customers see a simulated checkout and no money is charged. Add your JazzCash, Easypaisa, NayaPay and Mastercard merchant keys in <code>.env</code> and set <code>PAYMENT_MODE=live</code> to take real payments.</p>` : ''}
    <div class="tiles">
      <div class="tile"><span class="label">Total revenue</span><strong>${rs(s.revenue)}</strong><small>paid orders</small></div>
      <div class="tile"><span class="label">Last 30 days</span><strong>${rs(s.revenue30)}</strong></div>
      <div class="tile"><span class="label">Orders</span><strong>${s.orders}</strong><small>${s.toFulfil} to fulfil</small></div>
      <div class="tile"><span class="label">Customers</span><strong>${s.customers}</strong></div>
      <div class="tile"><span class="label">Live products</span><strong>${s.products}</strong></div>
    </div>
    <div class="panel-grid">
      <section class="panel"><h2>Paid revenue · last 14 days</h2>${revenueChart(s.daily)}</section>
      <section class="panel"><h2>Low stock</h2>
        ${s.lowStock.length ? html`<div style="display:grid;gap:.5rem">${s.lowStock.map((p) => html`<div class="summary-row"><span>${p.name}</span><strong>${p.stock} left</strong></div>`)}</div>` : html`<p class="muted">All products are well stocked.</p>`}
      </section>
    </div>
    <section class="panel"><h2>Recent orders</h2>${ordersTable(recent.slice(0, 8))}</section>`
  );
  wireChart();
  wireOrderRows();
}

/* ---------------- Orders ---------------- */
function ordersTable(orders) {
  if (!orders.length) return html`<p class="muted">No orders yet.</p>`;
  return html`<div class="table-wrap"><table class="data"><thead><tr>
    <th>Order</th><th>Date</th><th>Customer</th><th class="num">Items</th><th class="num">Total</th><th>Payment</th><th>Status</th></tr></thead><tbody>
    ${orders.map(
      (o) => html`<tr class="clickable" data-ref="${o.ref}" tabindex="0">
        <td><strong>${o.ref}</strong></td>
        <td>${formatDate(o.createdAt)}</td>
        <td>${o.shippingAddress.fullName || o.customer?.name || '—'}<br><span class="muted">${o.shippingAddress.city || ''}</span></td>
        <td class="num">${o.items.reduce((n, i) => n + i.qty, 0)}</td>
        <td class="num">${rs(o.total)}</td>
        <td>${paymentLabel(o.paymentMethod)}<br><span class="muted">${o.paymentStatus.replace('_', ' ')}</span></td>
        <td><span class="status status-${o.status}">${statusLabel(o.status)}</span></td>
      </tr>`
    )}</tbody></table></div>`;
}

function wireOrderRows() {
  $$('tr[data-ref]', view()).forEach((tr) => {
    const open = () => orderDetail(tr.dataset.ref);
    tr.addEventListener('click', open);
    tr.addEventListener('keydown', (e) => e.key === 'Enter' && open());
  });
}

let orderFilter = { status: '', q: '' };
async function orders() {
  setActions();
  const qs = new URLSearchParams(Object.entries(orderFilter).filter(([, v]) => v)).toString();
  const list = await api(`/admin/orders${qs ? `?${qs}` : ''}`);
  setHTML(
    view(),
    html`<div class="filters">
      <button class="chip" data-status="" aria-current="${!orderFilter.status}">All</button>
      ${STATUSES.map((s) => html`<button class="chip" data-status="${s}" aria-current="${orderFilter.status === s}">${statusLabel(s)}</button>`)}
      <input class="input" id="order-q" type="search" placeholder="Search ref, name, email, phone" value="${orderFilter.q}">
    </div>
    ${ordersTable(list)}`
  );
  $$('[data-status]', view()).forEach((b) => (b.onclick = () => ((orderFilter.status = b.dataset.status), orders())));
  let timer;
  $('#order-q').oninput = (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => ((orderFilter.q = e.target.value.trim()), orders().then(() => $('#order-q').focus())), 350);
  };
  wireOrderRows();
}

async function orderDetail(ref) {
  const o = await api(`/admin/orders/${encodeURIComponent(ref)}`);
  const a = o.shippingAddress;
  const unpaid = o.paymentStatus !== 'paid';
  openForm({
    title: `Order ${o.ref}`,
    intro: html`<div class="order-detail-grid">
      <div class="kv"><strong>Customer</strong><br>${a.fullName}<br>${a.phone}${a.email ? html`<br>${a.email}` : ''}${o.customer ? html`<br><span class="muted">Account: ${o.customer.email || o.customer.phone}</span>` : ''}</div>
      <div class="kv"><strong>Deliver to</strong><br>${a.line1}${a.line2 ? html`<br>${a.line2}` : ''}<br>${a.city}${a.province ? `, ${a.province}` : ''} ${a.postalCode}</div>
    </div>
    <div class="order-items">${o.items.map((i) => html`<div><span>${i.name} (${i.sizeMl} ml) × ${i.qty}</span><span>${rs(i.lineTotal)}</span></div>`)}
      ${o.discount ? html`<div class="muted"><span>Discount ${o.couponCode || ''}</span><span>− ${rs(o.discount)}</span></div>` : ''}
      <div class="muted"><span>Delivery</span><span>${o.shipping ? rs(o.shipping) : 'Free'}</span></div>
      <div><strong>Total</strong><strong>${rs(o.total)}</strong></div></div>
    <p class="kv">Payment: <strong>${paymentLabel(o.paymentMethod)}</strong> · ${o.paymentStatus.replace('_', ' ')}${o.paymentRef ? ` · ref ${o.paymentRef}` : ''}</p>
    <details><summary class="muted" style="cursor:pointer">History</summary><ul class="timeline">${o.history.map((h) => html`<li><strong>${statusLabel(h.status)}</strong> · ${formatDate(h.at)}${h.note ? html`<br>${h.note}` : ''}</li>`)}</ul></details>`,
    fields: [
      { name: 'status', label: 'Order status', type: 'select', options: STATUSES.map((s) => [s, statusLabel(s)]) },
      { name: 'tracking', label: 'Courier tracking number', placeholder: 'e.g. TCS 123456789' },
      { name: 'note', label: 'Note for the customer timeline (optional)', full: true },
      ...(unpaid ? [{ name: 'markPaid', label: 'Mark as paid (only after confirming the money arrived in your merchant account)', type: 'checkbox', full: true }] : []),
    ],
    values: { status: o.status, tracking: o.tracking },
    submitLabel: 'Update order',
    onSubmit: async (v) => {
      if (v.markPaid) await api(`/admin/orders/${encodeURIComponent(ref)}`, { method: 'PUT', body: { markPaid: true, note: v.note } });
      await api(`/admin/orders/${encodeURIComponent(ref)}`, { method: 'PUT', body: { status: v.markPaid && v.status === 'pending_payment' ? 'paid' : v.status, tracking: v.tracking, note: v.markPaid ? '' : v.note } });
      toast(`Order ${ref} updated`);
      route();
    },
  });
}

/* ---------------- Products ---------------- */
async function loadCategories() {
  categoriesCache = await api('/admin/categories');
  return categoriesCache;
}

function productFields() {
  return [
    { name: 'name', label: 'Name', required: true, full: true },
    { name: 'categoryId', label: 'Category', type: 'select', options: [['', '— None —'], ...categoriesCache.map((c) => [c.id, c.name])] },
    { name: 'sizeMl', label: 'Size (ml)', type: 'number', min: 1 },
    { name: 'price', label: 'Price (Rs)', type: 'number', min: 1, required: true },
    { name: 'discountPercent', label: 'Discount %', type: 'number', min: 0, max: 90, help: 'Product sale. 0 for none.' },
    { name: 'stock', label: 'Stock', type: 'number', min: 0 },
    { name: 'description', label: 'Description', type: 'textarea', full: true },
    { name: 'notesTop', label: 'Top notes' },
    { name: 'notesHeart', label: 'Heart notes' },
    { name: 'notesBase', label: 'Base notes', full: true },
    { name: 'bottleShape', label: '3D bottle shape', type: 'select', options: SHAPES },
    { name: 'liquidColor', label: 'Liquid colour', type: 'color' },
    { name: 'capColor', label: 'Cap colour', type: 'color' },
    { name: 'imageUrl', label: 'Product photo (optional — the 3D bottle is used when empty)', type: 'image', full: true },
    { name: 'featured', label: 'Feature on the homepage', type: 'checkbox' },
    { name: 'active', label: 'Visible in the store', type: 'checkbox' },
  ];
}

const productValues = (p) => ({
  name: p.name,
  categoryId: p.categoryId ?? '',
  sizeMl: p.sizeMl,
  price: p.price,
  discountPercent: p.discountPercent,
  stock: p.stock,
  description: p.description,
  notesTop: p.notes.top,
  notesHeart: p.notes.heart,
  notesBase: p.notes.base,
  bottleShape: p.bottle.shape,
  liquidColor: p.bottle.liquid,
  capColor: p.bottle.cap,
  imageUrl: p.imageUrl,
  featured: p.featured,
  active: p.active,
});

function editProduct(p) {
  openForm({
    title: p ? `Edit ${p.name}` : 'Add product',
    fields: productFields(),
    values: p ? productValues(p) : { sizeMl: 100, stock: 10, discountPercent: 0, bottleShape: 'classic', liquidColor: '#d9a441', capColor: '#c9a96e', active: true },
    submitLabel: p ? 'Save changes' : 'Add product',
    danger: p && { label: 'Delete product', confirm: `Delete ${p.name}? This cannot be undone.`, action: async () => (await api(`/admin/products/${p.id}`, { method: 'DELETE' }), toast('Product deleted'), products()) },
    onSubmit: async (v) => {
      await api(p ? `/admin/products/${p.id}` : '/admin/products', { method: p ? 'PUT' : 'POST', body: v });
      toast(p ? 'Product saved' : 'Product added');
      products();
    },
  });
}

let productFilter = '';
async function products() {
  setActions(html`<button class="btn btn-ghost btn-sm" id="bulk">Bulk price change</button><button class="btn btn-sm" id="add-product">+ Add product</button>`);
  const [list] = await Promise.all([api('/admin/products'), loadCategories()]);
  const filtered = productFilter ? list.filter((p) => String(p.categoryId) === productFilter) : list;
  setHTML(
    view(),
    html`<div class="filters">
      <select class="input" id="pf"><option value="">All categories</option>${categoriesCache.map((c) => html`<option value="${c.id}" ${String(c.id) === productFilter ? raw('selected') : ''}>${c.name}</option>`)}</select>
      <span class="muted" style="font-size:.85rem">Edit price, discount and stock directly in the table; changes save automatically.</span>
    </div>
    <div class="table-wrap"><table class="data"><thead><tr><th></th><th>Product</th><th>Category</th><th class="num">Price (Rs)</th><th class="num">Discount %</th><th class="num">Sells at</th><th class="num">Stock</th><th>Status</th><th></th></tr></thead><tbody>
    ${filtered.map(
      (p) => html`<tr data-id="${p.id}">
        <td><img src="${staticProductImage(p)}" alt=""></td>
        <td><strong>${p.name}</strong><br><span class="muted">${p.sizeMl} ml</span></td>
        <td>${p.category?.name || '—'}</td>
        <td class="num"><input class="cell-input" type="number" min="1" data-field="price" value="${p.price}" aria-label="Price for ${p.name}"></td>
        <td class="num"><input class="cell-input" type="number" min="0" max="90" data-field="discountPercent" value="${p.discountPercent}" style="width:70px" aria-label="Discount for ${p.name}"></td>
        <td class="num" data-final>${rs(p.finalPrice)}</td>
        <td class="num"><input class="cell-input" type="number" min="0" data-field="stock" value="${p.stock}" style="width:80px" aria-label="Stock for ${p.name}"></td>
        <td><span class="pill ${p.active ? 'on' : ''}">${p.active ? 'Live' : 'Hidden'}</span>${p.featured ? raw(' <span class="pill">Featured</span>') : ''}</td>
        <td><div class="row-actions"><button class="btn btn-ghost btn-sm" data-edit="${p.id}">Edit</button></div></td>
      </tr>`
    )}</tbody></table></div>`
  );
  const byId = new Map(list.map((p) => [String(p.id), p]));
  $('#pf').onchange = (e) => ((productFilter = e.target.value), products());
  $('#add-product').onclick = () => editProduct(null);
  $('#bulk').onclick = () =>
    openForm({
      title: 'Bulk price change',
      intro: html`<p class="muted">Raise or lower prices by a percentage. Use a negative number to lower prices.</p>`,
      fields: [
        { name: 'percent', label: 'Change %', type: 'number', min: -90, max: 500, required: true },
        { name: 'categoryId', label: 'Apply to', type: 'select', options: [['', 'All products'], ...categoriesCache.map((c) => [c.id, c.name])] },
      ],
      submitLabel: 'Apply',
      onSubmit: async (v) => {
        const r = await api('/admin/products/bulk-price', { method: 'POST', body: v });
        toast(`${r.updated} prices updated`);
        products();
      },
    });
  view().addEventListener('click', (e) => {
    const id = e.target.dataset.edit;
    if (id) editProduct(byId.get(id));
  });
  $$('.cell-input', view()).forEach((input) =>
    input.addEventListener('change', async () => {
      const tr = input.closest('tr');
      try {
        const p = await api(`/admin/products/${tr.dataset.id}`, { method: 'PUT', body: { [input.dataset.field]: Number(input.value) } });
        byId.set(String(p.id), p);
        $('[data-final]', tr).textContent = rs(p.finalPrice);
        input.value = p[input.dataset.field];
        input.classList.add('saved');
        setTimeout(() => input.classList.remove('saved'), 1200);
      } catch (err) {
        toast(err.message, { error: true });
      }
    })
  );
}

/* ---------------- Categories ---------------- */
function editCategory(c) {
  openForm({
    title: c ? `Edit ${c.name}` : 'Add category',
    fields: [
      { name: 'name', label: 'Name', required: true },
      { name: 'color', label: 'Colour (used for the 3D bottle and tile glow)', type: 'color' },
      { name: 'tagline', label: 'Tagline', full: true },
      { name: 'sort', label: 'Sort order', type: 'number' },
      { name: 'active', label: 'Visible in the store', type: 'checkbox' },
    ],
    values: c ? { name: c.name, color: c.color, tagline: c.tagline, sort: c.sort, active: !!c.active } : { color: '#c9a96e', sort: categoriesCache.length, active: true },
    danger: c && { label: 'Delete', confirm: `Delete ${c.name}? Its products will become uncategorised.`, action: async () => (await api(`/admin/categories/${c.id}`, { method: 'DELETE' }), categories()) },
    onSubmit: async (v) => {
      await api(c ? `/admin/categories/${c.id}` : '/admin/categories', { method: c ? 'PUT' : 'POST', body: v });
      toast('Category saved');
      categories();
    },
  });
}

async function categories() {
  setActions(html`<button class="btn btn-sm" id="add-cat">+ Add category</button>`);
  const list = await loadCategories();
  setHTML(
    view(),
    html`<div class="table-wrap"><table class="data"><thead><tr><th>Colour</th><th>Name</th><th>Tagline</th><th class="num">Products</th><th class="num">Order</th><th>Status</th><th></th></tr></thead><tbody>
    ${list.map(
      (c) => html`<tr>
        <td><span style="display:inline-block;width:26px;height:26px;border-radius:50%;background:${c.color}"></span></td>
        <td><strong>${c.name}</strong><br><span class="muted">/${c.slug}</span></td>
        <td>${c.tagline}</td><td class="num">${c.productCount}</td><td class="num">${c.sort}</td>
        <td><span class="pill ${c.active ? 'on' : ''}">${c.active ? 'Live' : 'Hidden'}</span></td>
        <td><div class="row-actions"><button class="btn btn-ghost btn-sm" data-cat="${c.id}">Edit</button></div></td>
      </tr>`
    )}</tbody></table></div>`
  );
  $('#add-cat').onclick = () => editCategory(null);
  $$('[data-cat]', view()).forEach((b) => (b.onclick = () => editCategory(list.find((c) => String(c.id) === b.dataset.cat))));
}

/* ---------------- Discounts ---------------- */
function editCoupon(c) {
  openForm({
    title: c ? `Edit ${c.code}` : 'New coupon',
    fields: [
      { name: 'code', label: 'Code', required: true, placeholder: 'EID20' },
      { name: 'type', label: 'Type', type: 'select', options: [['percent', 'Percentage off'], ['fixed', 'Fixed amount off (Rs)']] },
      { name: 'value', label: 'Value', type: 'number', min: 1, required: true },
      { name: 'minOrder', label: 'Minimum order (Rs)', type: 'number', min: 0 },
      { name: 'expiresAt', label: 'Expires on (optional)', type: 'date' },
      { name: 'usageLimit', label: 'Usage limit (optional)', type: 'number', min: 1 },
      { name: 'active', label: 'Active', type: 'checkbox' },
    ],
    values: c ? { code: c.code, type: c.type, value: c.value, minOrder: c.min_order, expiresAt: c.expires_at ? c.expires_at.slice(0, 10) : '', usageLimit: c.usage_limit ?? '', active: !!c.active } : { type: 'percent', minOrder: 0, active: true },
    danger: c && { label: 'Delete', confirm: `Delete coupon ${c.code}?`, action: async () => (await api(`/admin/coupons/${c.id}`, { method: 'DELETE' }), discounts()) },
    onSubmit: async (v) => {
      await api(c ? `/admin/coupons/${c.id}` : '/admin/coupons', { method: c ? 'PUT' : 'POST', body: { ...v, expiresAt: v.expiresAt ? `${v.expiresAt}T23:59:59` : '' } });
      toast('Coupon saved');
      discounts();
    },
  });
}

async function discounts() {
  setActions(html`<button class="btn btn-sm" id="add-coupon">+ New coupon</button>`);
  const [list, content] = await Promise.all([api('/admin/coupons'), api('/admin/content')]);
  const s = content.settings;
  setHTML(
    view(),
    html`<section class="panel"><h2>Store-wide sale</h2>
      <form id="sale-form" class="form-grid">
        <div class="field"><label for="sw">Discount on every product (%)</label><input class="input" id="sw" type="number" min="0" max="90" value="${s.sitewideDiscount}"></div>
        <div class="field"><label for="swl">Sale banner text</label><input class="input" id="swl" value="${s.sitewideDiscountLabel}" placeholder="Eid Sale — 20% off everything"></div>
        <p class="muted full" style="font-size:.85rem">Set to 0 to end the sale. Each product uses whichever is larger: its own discount or the store-wide one. Per-product discounts are on the Products page.</p>
        <div class="full"><button class="btn btn-sm">Save sale</button></div>
      </form></section>
    <section class="panel"><h2>Coupon codes</h2>
      ${list.length ? html`<div class="table-wrap"><table class="data"><thead><tr><th>Code</th><th>Discount</th><th class="num">Min order</th><th>Expires</th><th class="num">Used</th><th>Status</th><th></th></tr></thead><tbody>
      ${list.map(
        (c) => html`<tr><td><strong>${c.code}</strong></td><td>${c.type === 'percent' ? `${c.value}%` : rs(c.value)}</td><td class="num">${rs(c.min_order)}</td>
          <td>${c.expires_at ? c.expires_at.slice(0, 10) : 'Never'}</td><td class="num">${c.used_count}${c.usage_limit ? ` / ${c.usage_limit}` : ''}</td>
          <td><span class="pill ${c.active ? 'on' : ''}">${c.active ? 'Active' : 'Off'}</span></td>
          <td><div class="row-actions"><button class="btn btn-ghost btn-sm" data-coupon="${c.id}">Edit</button></div></td></tr>`
      )}</tbody></table></div>` : html`<p class="muted">No coupons yet.</p>`}
    </section>`
  );
  $('#add-coupon').onclick = () => editCoupon(null);
  $$('[data-coupon]', view()).forEach((b) => (b.onclick = () => editCoupon(list.find((c) => String(c.id) === b.dataset.coupon))));
  $('#sale-form').onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api('/admin/content', { method: 'PUT', body: { settings: { sitewideDiscount: Number($('#sw').value), sitewideDiscountLabel: $('#swl').value } } });
      toast('Sale updated');
    } catch (err) {
      toast(err.message, { error: true });
    }
  };
}

/* ---------------- Content ---------------- */
async function content() {
  setActions();
  const c = await api('/admin/content');
  setHTML(
    view(),
    html`<form id="content-form">
      <section class="panel"><h2>Hero section</h2><div class="form-grid">
        <div class="field"><label for="h-eyebrow">Small heading</label><input class="input" id="h-eyebrow" name="eyebrow" value="${c.hero.eyebrow}"></div>
        <div class="field"><label for="h-title">Main headline</label><input class="input" id="h-title" name="title" value="${c.hero.title}"></div>
        <div class="field full"><label for="h-sub">Sub-headline</label><textarea class="input" id="h-sub" name="subtitle">${c.hero.subtitle}</textarea></div>
        <div class="field"><label for="h-cta">Button text</label><input class="input" id="h-cta" name="ctaText" value="${c.hero.ctaText}"></div>
        <div class="field"><label for="h-link">Button link</label><input class="input" id="h-link" name="ctaLink" value="${c.hero.ctaLink}" placeholder="/categories"></div>
      </div></section>
      <section class="panel"><h2>Announcement bar</h2><div class="form-grid">
        <div class="field full"><label for="a-text">Text</label><input class="input" id="a-text" name="aText" value="${c.announcement.text}"></div>
        <label class="check"><input type="checkbox" id="a-active" ${c.announcement.active ? raw('checked') : ''}> Show the announcement bar</label>
      </div></section>
      <section class="panel"><h2>Our story</h2><div class="form-grid">
        <div class="field full"><label for="s-title">Title</label><input class="input" id="s-title" value="${c.story.title}"></div>
        <div class="field full"><label for="s-text">Text</label><textarea class="input" id="s-text" style="min-height:150px">${c.story.text}</textarea></div>
      </div></section>
      <button class="btn">Publish changes</button> <a class="link" href="/" target="_blank" rel="noopener" style="margin-left:1rem">Preview homepage ↗</a>
    </form>`
  );
  $('#content-form').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target.elements;
    try {
      await api('/admin/content', {
        method: 'PUT',
        body: {
          hero: { eyebrow: f.eyebrow.value, title: f.title.value, subtitle: f.subtitle.value, ctaText: f.ctaText.value, ctaLink: f.ctaLink.value },
          announcement: { text: f.aText.value, active: $('#a-active').checked },
          story: { title: $('#s-title').value, text: $('#s-text').value },
        },
      });
      toast('Homepage content published');
    } catch (err) {
      toast(err.message, { error: true });
    }
  };
}

/* ---------------- Testimonials ---------------- */
function editTestimonial(t) {
  openForm({
    title: t ? 'Edit testimonial' : 'Add testimonial',
    fields: [
      { name: 'name', label: 'Customer name', required: true },
      { name: 'location', label: 'City' },
      { name: 'text', label: 'Testimonial', type: 'textarea', full: true, required: true },
      { name: 'rating', label: 'Rating', type: 'select', options: [5, 4, 3, 2, 1].map((n) => [n, '★'.repeat(n)]) },
      { name: 'sort', label: 'Sort order', type: 'number' },
      { name: 'active', label: 'Show on homepage', type: 'checkbox' },
    ],
    values: t ? { ...t, active: !!t.active } : { rating: 5, sort: 0, active: true },
    danger: t && { label: 'Delete', confirm: 'Delete this testimonial?', action: async () => (await api(`/admin/testimonials/${t.id}`, { method: 'DELETE' }), testimonials()) },
    onSubmit: async (v) => {
      await api(t ? `/admin/testimonials/${t.id}` : '/admin/testimonials', { method: t ? 'PUT' : 'POST', body: { ...v, rating: Number(v.rating) } });
      toast('Testimonial saved');
      testimonials();
    },
  });
}

async function testimonials() {
  setActions(html`<button class="btn btn-sm" id="add-t">+ Add testimonial</button>`);
  const list = await api('/admin/testimonials');
  setHTML(
    view(),
    list.length
      ? html`<div class="testimonials">${list.map(
          (t) => html`<figure class="testimonial panel" style="margin:0">
            <span class="stars" style="color:var(--gold)">${'★'.repeat(t.rating)}</span>
            <blockquote style="font-family:var(--display);font-size:1.2rem">“${t.text}”</blockquote>
            <cite class="muted" style="font-style:normal">${t.name}${t.location ? ` · ${t.location}` : ''}</cite>
            <div style="display:flex;justify-content:space-between;align-items:center"><span class="pill ${t.active ? 'on' : ''}">${t.active ? 'Shown' : 'Hidden'}</span><button class="btn btn-ghost btn-sm" data-t="${t.id}">Edit</button></div>
          </figure>`
        )}</div>`
      : html`<p class="muted">No testimonials yet.</p>`
  );
  $('#add-t').onclick = () => editTestimonial(null);
  $$('[data-t]', view()).forEach((b) => (b.onclick = () => editTestimonial(list.find((t) => String(t.id) === b.dataset.t))));
}

/* ---------------- Customers ---------------- */
async function customers() {
  setActions();
  const list = await api('/admin/customers');
  setHTML(
    view(),
    html`<div class="table-wrap"><table class="data"><thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>City</th><th class="num">Orders</th><th class="num">Spent</th><th>Joined</th></tr></thead><tbody>
    ${list.map(
      (u) => html`<tr><td><strong>${u.name}</strong>${u.role === 'admin' ? raw(' <span class="pill">Admin</span>') : ''}</td><td>${u.email || '—'}</td><td>${u.phone || '—'}</td>
        <td>${u.address?.city || '—'}</td><td class="num">${u.orderCount}</td><td class="num">${rs(u.spent)}</td><td>${formatDate(u.createdAt)}</td></tr>`
    )}</tbody></table></div>`
  );
}

/* ---------------- Settings ---------------- */
async function settings() {
  setActions();
  const { settings: s } = await api('/admin/content');
  const pm = await api('/payment-methods');
  setHTML(
    view(),
    html`<form id="settings-form">
      <section class="panel"><h2>Delivery</h2><div class="form-grid">
        <div class="field"><label for="st-fee">Delivery fee (Rs)</label><input class="input" id="st-fee" type="number" min="0" value="${s.shippingFee}"></div>
        <div class="field"><label for="st-free">Free delivery on orders over (Rs, 0 = never)</label><input class="input" id="st-free" type="number" min="0" value="${s.freeShippingOver}"></div>
      </div></section>
      <section class="panel"><h2>Access</h2>
        <label class="check"><input type="checkbox" id="st-login" ${s.requireLogin ? raw('checked') : ''}> Visitors must sign in or create an account before browsing the store</label>
        <p class="muted" style="font-size:.85rem;margin-top:.5rem">Checkout and My Account always require sign-in.</p>
      </section>
      <section class="panel"><h2>Contact</h2><div class="form-grid">
        <div class="field"><label for="st-email">Email</label><input class="input" id="st-email" value="${s.contactEmail}"></div>
        <div class="field"><label for="st-phone">Phone / WhatsApp</label><input class="input" id="st-phone" value="${s.contactPhone}"></div>
        <div class="field full"><label for="st-ig">Instagram URL</label><input class="input" id="st-ig" value="${s.instagram}" placeholder="https://instagram.com/..."></div>
      </div></section>
      <section class="panel"><h2>Payments</h2>
        <p class="kv">Mode: <strong>${pm.mode}</strong>. Enabled at checkout: <strong>${pm.methods.map((m) => m.label).join(', ') || 'none'}</strong>.</p>
        <p class="muted" style="font-size:.85rem;margin-top:.5rem">Merchant keys are kept on the server in <code>.env</code>, never in the database or the browser. See the README for each provider’s settings. Cash on delivery is permanently disabled.</p>
      </section>
      <button class="btn">Save settings</button>
    </form>`
  );
  $('#settings-form').onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api('/admin/content', {
        method: 'PUT',
        body: {
          settings: {
            shippingFee: Number($('#st-fee').value),
            freeShippingOver: Number($('#st-free').value),
            requireLogin: $('#st-login').checked,
            contactEmail: $('#st-email').value,
            contactPhone: $('#st-phone').value,
            instagram: $('#st-ig').value,
          },
        },
      });
      toast('Settings saved');
    } catch (err) {
      toast(err.message, { error: true });
    }
  };
}

/* ---------------- Router ---------------- */
const VIEWS = {
  overview: ['Overview', overview],
  orders: ['Orders', orders],
  products: ['Products & prices', products],
  categories: ['Categories', categories],
  discounts: ['Discounts', discounts],
  content: ['Hero & content', content],
  testimonials: ['Testimonials', testimonials],
  customers: ['Customers', customers],
  settings: ['Store settings', settings],
};

async function route() {
  const key = VIEWS[location.hash.slice(1)] ? location.hash.slice(1) : 'overview';
  const [title, fn] = VIEWS[key];
  $('#view-title').textContent = title;
  $$('#admin-nav button').forEach((b) => b.setAttribute('aria-current', b.dataset.view === key));
  // Replace the view node so listeners from the previous view are dropped.
  const fresh = view().cloneNode(false);
  view().replaceWith(fresh);
  setHTML(fresh, html`<p class="muted">Loading…</p>`);
  try {
    await fn();
  } catch (e) {
    if (e.status === 401 || e.status === 403) return (location.href = '/login?next=/admin');
    setHTML(view(), html`<p class="notice err">${e.message}</p>`);
  }
}

$('#admin-nav').addEventListener('click', (e) => {
  const v = e.target.dataset.view;
  if (!v) return;
  location.hash = v;
  $('.admin-side').classList.remove('open');
});
$('#admin-menu').onclick = () => $('.admin-side').classList.toggle('open');
$('#admin-logout').onclick = logout;
addEventListener('hashchange', route);
route();
if (guardWebGL()) import('../three/scenes.js').then(({ emblemScene }) => emblemScene($('#emblem')));
