/* =========================================================
   SHOP SETTINGS — edit these, nothing else needs changing
   ========================================================= */
const CONFIG = {
  instagram: "beadles.pk",

  // Leave empty ("") to keep her number private: orders go through Instagram DM.
  // To use WhatsApp, put the number in international format with no + or spaces,
  // e.g. "923001234567". A "Send on WhatsApp" button will then appear too.
  whatsappNumber: "",

  // Google Apps Script web app URL (see apps-script/Code.gs). When set, every order
  // is saved to her Google Sheet and customers can get an email receipt.
  // Leave empty to skip saving: orders just go to her DMs.
  ordersUrl: "",

  // false = site says "payment details shared privately after we confirm your order".
  // true  = shows the account numbers below publicly on the site.
  showPaymentDetails: false,
  jazzcash:  { number: "03XX-XXXXXXX", name: "Account holder name" },
  easypaisa: { number: "03XX-XXXXXXX", name: "Account holder name" },
};
/* ========================================================= */

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const useWhatsApp = CONFIG.whatsappNumber.trim() !== "";
const useOrders = CONFIG.ordersUrl.trim() !== "";
const igLink = `https://ig.me/m/${CONFIG.instagram}`;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// ---------- Payment section ----------
$("#payDetails").innerHTML = CONFIG.showPaymentDetails
  ? `<div class="pay-accounts">
       <div><b>JazzCash</b><br>${CONFIG.jazzcash.number}<br><span class="muted">${CONFIG.jazzcash.name}</span></div>
       <div><b>EasyPaisa</b><br>${CONFIG.easypaisa.number}<br><span class="muted">${CONFIG.easypaisa.name}</span></div>
     </div>
     <p class="muted small">After paying, please send a screenshot with your order.</p>`
  : `<p>🔒 After we confirm your order, we'll send you the payment details privately in your messages.</p>`;

// ---------- Contact links & mode ----------
function waLink(text) {
  return `https://wa.me/${CONFIG.whatsappNumber}?text=${encodeURIComponent(text)}`;
}
$("#footerContact").href = useWhatsApp ? waLink("Hi Beadles! 🌸") : igLink;
$("#footerContact").target = "_blank";
$("#emailField").hidden = !useOrders;
$("#sendOrderWa").hidden = !useWhatsApp || useOrders;
$("#doneWa").hidden = !useWhatsApp;
if (useOrders) {
  $("#sendOrder").textContent = "Place order";
  $("#sendHint").textContent = "You'll get an order number right away.";
}
$("#year").textContent = new Date().getFullYear();

// ---------- Category filter ----------
$$(".chip").forEach((chip) =>
  chip.addEventListener("click", () => {
    $$(".chip").forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    const f = chip.dataset.filter;
    $$(".card").forEach((card) => {
      card.hidden = f !== "all" && card.dataset.cat !== f;
    });
  })
);

// ---------- Order list ----------
let cart = [];
try { cart = JSON.parse(localStorage.getItem("beadles-cart")) || []; } catch (e) {}

function save() {
  try { localStorage.setItem("beadles-cart", JSON.stringify(cart)); } catch (e) {}
}

function render() {
  const count = cart.reduce((n, i) => n + i.qty, 0);
  $("#cartCount").textContent = count;
  $("#cartEmpty").hidden = cart.length > 0;
  $("#cartItems").innerHTML = cart
    .map(
      (i, idx) => `<li>
        <div><b>${esc(i.name)}</b><br><span class="muted small">${esc(i.price)}</span></div>
        <div class="qty">
          <button data-act="dec" data-idx="${idx}" aria-label="Less">−</button>
          <span>${i.qty}</span>
          <button data-act="inc" data-idx="${idx}" aria-label="More">+</button>
        </div>
      </li>`
    )
    .join("");
  save();
}

$("#cartItems").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  const i = +b.dataset.idx;
  cart[i].qty += b.dataset.act === "inc" ? 1 : -1;
  if (cart[i].qty <= 0) cart.splice(i, 1);
  render();
});

$$(".add").forEach((btn) =>
  btn.addEventListener("click", () => {
    const card = btn.closest(".card");
    const name = card.dataset.name;
    const found = cart.find((i) => i.name === name);
    found ? found.qty++ : cart.push({ name, price: card.dataset.price, qty: 1 });
    render();
    toast(`Added ${name} 💕`);
  })
);

// ---------- Drawer ----------
function openDrawer(open) {
  $("#drawer").classList.toggle("open", open);
  $("#drawer").setAttribute("aria-hidden", !open);
  $("#overlay").hidden = !open;
  if (!open && !$("#doneView").hidden) resetDrawer();
}
function resetDrawer() {
  $("#doneView").hidden = true;
  $("#cartView").hidden = false;
  $("#cartFoot").hidden = false;
}
$("#cartOpen").addEventListener("click", () => openDrawer(true));
$("#cartClose").addEventListener("click", () => openDrawer(false));
$("#overlay").addEventListener("click", () => openDrawer(false));
document.addEventListener("keydown", (e) => e.key === "Escape" && openDrawer(false));

// ---------- Order message ----------
function orderMessage(d, orderId) {
  return [
    orderId ? `Hi Beadles! 🌸 My order ${orderId}:` : "Hi Beadles! 🌸 I'd like to order:",
    ...cart.map((i) => `• ${i.name} × ${i.qty}`),
    d.note ? `\nNote: ${d.note}` : "",
    `\nName: ${d.name}`,
    `City: ${d.city}`,
    `Address: ${d.address}`,
    `Phone: ${d.phone}`,
  ].filter(Boolean).join("\n");
}

// Instagram DMs can't be pre-filled, so copy the text for the customer to paste.
async function sendInstagram(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast("Order copied! Paste it in the DM 📋");
  } catch (e) {
    toast("Opening Instagram, so just tell us what you'd like 💌");
  }
  setTimeout(() => window.open(igLink, "_blank"), 600);
}

function readForm() {
  if (!cart.length) { toast("Your order list is empty"); return null; }
  const form = $("#orderForm");
  if (!form.reportValidity()) return null;
  const d = Object.fromEntries(new FormData(form));
  Object.keys(d).forEach((k) => (d[k] = d[k].trim()));
  return d;
}

// ---------- Place order ----------
let lastMessage = "";

$("#orderForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const d = readForm();
  if (!d) return;
  if (!useOrders) return sendInstagram(orderMessage(d));

  const btn = $("#sendOrder");
  btn.disabled = true;
  btn.textContent = "Placing order…";
  try {
    // text/plain body avoids a CORS preflight, which Apps Script doesn't support
    const res = await fetch(CONFIG.ordersUrl, {
      method: "POST",
      body: JSON.stringify({ ...d, items: cart }),
    }).then((r) => r.json());
    if (!res.ok) throw new Error(res.error);

    lastMessage = orderMessage(d, res.orderId);
    $("#doneId").textContent = res.orderId;
    $("#doneEmail").textContent = res.emailed ? `A receipt has been sent to ${d.email} 💌` : "";
    $("#cartView").hidden = true;
    $("#cartFoot").hidden = true;
    $("#doneView").hidden = false;
    cart = [];
    render();
    $("#orderForm").reset();
  } catch (err) {
    toast("Couldn't save your order, so please send it on Instagram instead");
    sendInstagram(orderMessage(d));
  } finally {
    btn.disabled = false;
    btn.textContent = "Place order";
  }
});

$("#sendOrderWa").addEventListener("click", () => {
  const d = readForm();
  if (d) window.open(waLink(orderMessage(d)), "_blank");
});
$("#doneIg").addEventListener("click", () => sendInstagram(lastMessage));
$("#doneWa").addEventListener("click", () => window.open(waLink(lastMessage), "_blank"));
$("#doneClose").addEventListener("click", () => openDrawer(false));

$("#customBtn").addEventListener("click", () =>
  sendInstagram("Hi Beadles! 🌸 I'd like a custom piece:\n\nWhat:\nColours:\nName/initials (if any):\nNeeded by:")
);

// ---------- Toast ----------
let toastTimer;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
}

render();
