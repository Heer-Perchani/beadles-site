/**
 * Beadles order backend: saves website orders to this Google Sheet and emails receipts.
 *
 * SETUP (one time, about 10 minutes):
 *  1. Create a new Google Sheet (ideally in a shop-only Gmail, e.g. beadles.pk@gmail.com,
 *     because receipts are sent FROM this Gmail address).
 *  2. In the sheet: Extensions → Apps Script. Delete what's there, paste this whole file, save.
 *  3. Choose "setup" in the function dropdown at the top and click Run. Allow the permissions.
 *  4. Deploy → New deployment → gear icon → Web app.
 *       Execute as: Me    Who has access: Anyone
 *     Click Deploy and copy the Web app URL (ends in /exec).
 *  5. Paste that URL into ordersUrl in script.js on the website.
 *
 * If you edit this file later: Deploy → Manage deployments → ✏️ → Version: New version → Deploy
 * (the URL stays the same).
 */

const SHOP_NAME = "Beadles";
const INSTAGRAM = "beadles.pk";
const SHEET_NAME = "Orders";
const NOTIFY_OWNER = true; // email the shop owner whenever a new order arrives
const STATUSES = ["New", "Confirmed", "Paid", "Shipped", "Delivered", "Cancelled"];
const HEADERS = ["Date", "Order #", "Status", "Name", "Phone", "City", "Address",
                 "Instagram", "Email", "Items", "Note", "Receipt emailed"];

function setup() {
  getSheet_();
}

function doGet() {
  return ContentService.createTextOutput(SHOP_NAME + " orders are up and running ✅");
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const d = JSON.parse(e.postData.contents);
    if (d.website) return json_({ ok: true, orderId: "B0000" }); // spam bot filled the trap

    const name = clean_(d.name, 80), phone = clean_(d.phone, 20), city = clean_(d.city, 60);
    const address = clean_(d.address, 300), instagram = clean_(d.instagram, 40);
    const email = clean_(d.email, 120), note = clean_(d.note, 500);
    const items = (Array.isArray(d.items) ? d.items : []).slice(0, 30).map((i) => ({
      name: clean_(i.name, 80),
      price: clean_(i.price, 20),
      qty: Math.min(99, Math.max(1, parseInt(i.qty, 10) || 1)),
    }));
    if (!name || !phone || !city || !address || !items.length) {
      return json_({ ok: false, error: "Missing details" });
    }

    const sheet = getSheet_();
    const orderId = "B" + (1000 + sheet.getLastRow()); // first order is B1001
    const itemsText = items.map((i) => `${i.name} × ${i.qty} (${i.price})`).join("\n");
    sheet.appendRow([new Date(), orderId, "New", name, phone, city, address, instagram,
                     email, itemsText, note, "No"].map(safeCell_));
    const row = sheet.getLastRow();

    let emailed = false;
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      try {
        MailApp.sendEmail({
          to: email,
          name: SHOP_NAME,
          subject: `Your ${SHOP_NAME} order ${orderId} 🌸`,
          htmlBody: receiptHtml_({ orderId, name, city, address, note, items }),
        });
        emailed = true;
        sheet.getRange(row, 12).setValue("Yes");
      } catch (err) {
        sheet.getRange(row, 12).setValue("Failed: " + err.message);
      }
    }

    if (NOTIFY_OWNER) {
      try {
        MailApp.sendEmail(Session.getEffectiveUser().getEmail(),
          `New order ${orderId} from ${name} (${city})`,
          `${itemsText}\n\nNote: ${note || "-"}\nPhone: ${phone}\nInstagram: ${instagram || "-"}\n\n` +
          `Open the sheet: ${SpreadsheetApp.getActiveSpreadsheet().getUrl()}`);
      } catch (err) { /* daily email limit reached, so the order is still saved */ }
    }

    return json_({ ok: true, orderId, emailed });
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (sheet) return sheet;

  sheet = ss.insertSheet(SHEET_NAME);
  sheet.appendRow(HEADERS);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight("bold").setBackground("#f7c6d0");
  sheet.getRange("A:A").setNumberFormat("dd mmm yyyy, h:mm am/pm");
  sheet.getRange("J:K").setWrap(true);
  sheet.getRange("C2:C").setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(STATUSES, true).build());
  return sheet;
}

function receiptHtml_(o) {
  const rows = o.items.map((i) =>
    `<tr><td style="padding:6px 0">${esc_(i.name)}</td><td align="center">× ${i.qty}</td>` +
    `<td align="right">${esc_(i.price)}</td></tr>`).join("");
  return `
  <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#3b2a2f">
    <h2 style="color:#c23b5c;margin-bottom:4px">${SHOP_NAME} 🍓</h2>
    <p>Hi ${esc_(o.name)},</p>
    <p>Thank you for your order! We've received it and will message you soon to confirm it and share payment details (JazzCash / EasyPaisa).</p>
    <div style="background:#fff8f3;border-radius:12px;padding:16px;margin:16px 0">
      <p style="margin:0 0 8px"><b>Order ${o.orderId}</b></p>
      <table width="100%" style="border-collapse:collapse;font-size:14px">${rows}</table>
      ${o.note ? `<p style="font-size:14px;margin:12px 0 0"><b>Note:</b> ${esc_(o.note)}</p>` : ""}
      <p style="font-size:14px;margin:12px 0 0"><b>Delivering to:</b> ${esc_(o.address)}, ${esc_(o.city)}</p>
    </div>
    <p style="font-size:14px">Questions? Message us on Instagram
      <a href="https://instagram.com/${INSTAGRAM}" style="color:#c23b5c">@${INSTAGRAM}</a>
      with your order number.</p>
    <p style="font-size:14px">Made with love,<br>${SHOP_NAME} 🌸</p>
  </div>`;
}

function clean_(v, max) { return String(v == null ? "" : v).trim().slice(0, max); }
function esc_(s) { return String(s).replace(/[&<>"']/g, (c) => "&#" + c.charCodeAt(0) + ";"); }
// Stop text like "=..." or "+92..." being treated as a spreadsheet formula
function safeCell_(v) { return typeof v === "string" && /^[=+\-@]/.test(v) ? "'" + v : v; }
function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
