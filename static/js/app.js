/* Cache DOM elements and API keys */
const auto = document.getElementById('auto');
const locWrap = document.getElementById('loc-wrap');
const locationInput = document.getElementById('location');
const clearBtn = document.getElementById('clear-btn');
const searchBtn = document.getElementById('search-btn');
const form = document.getElementById('search-form');
const results = document.getElementById('results');
const resultsBody = document.getElementById('results-body');
const resultsTable = document.querySelector('#results table');
const noRecords = document.getElementById('no-records');
const category = document.getElementById('category');
const keyword = document.getElementById('keyword');
const IPINFO_TOKEN = "1fc4b3d2bca259";
const GOOGLE_GEOCODE_KEY = "AIzaSyCIQNLBiQWorVDz5Ug-cIuXmY1IHgspskc";

/* Track active AbortControllers for search and venue requests */
let currentSearchController = null;
let currentVenueController = null;

/* Toggle manual location input visibility and required state */
auto.addEventListener('change', () => {
  const useAuto = auto.checked;
  locWrap.classList.toggle('hidden', useAuto);
  locationInput.required = !useAuto;
});

/* Reset form, UI state, and abort any in-flight search */
clearBtn.addEventListener('click', () => {
  if (currentSearchController) {
    try { currentSearchController.abort(); } catch {}
    currentSearchController = null;
  }
  form.reset();
  auto.checked = false;
  locWrap.classList.remove('hidden');
  locationInput.required = true;
  category.selectedIndex = 0;
  results.classList.add('hidden');
  resultsBody.innerHTML = '';
  noRecords.classList.add('hidden');
  resultsTable.classList.remove('hidden');
  document.getElementById('event-details').innerHTML = '';
  document.getElementById('venue-details').innerHTML = '';
});

/* Validate inputs, resolve location, fetch results (abortable), and render */
searchBtn.addEventListener('click', async () => {
  locationInput.required = !auto.checked;
  if (!form.reportValidity()) return;
  const kw = keyword.value.trim();
  let distanceVal = document.getElementById('distance').value.trim();
  distanceVal = distanceVal === '' ? '10' : distanceVal;
  const distance = String(Math.min(200, Math.max(1, Number(distanceVal) || 10)));
  const segmentId = category.value || '';
  const useAuto = auto.checked;
  const loc = locationInput.value.trim();
  resultsBody.innerHTML = '<tr><td colspan="5" class="muted">Loading...</td></tr>';
  noRecords.classList.add('hidden');
  document.getElementById('event-details').innerHTML = '';
  document.getElementById('venue-details').innerHTML = '';
  results.classList.remove('hidden');
  resultsTable.classList.remove('hidden');
  searchBtn.disabled = true;

  try {
    if (currentSearchController) {
      try { currentSearchController.abort(); } catch {}
    }
    currentSearchController = new AbortController();
    const { signal } = currentSearchController;
    const { lat, lng } = await getLatLng(useAuto, loc, signal);
    const geoPoint = geohashEncode(lat, lng, 7);
    const url = new URL('/search', location.origin);
    url.search = new URLSearchParams({
      keyword: kw,
      geoPoint,
      radius: distance,
      unit: 'miles',
      ...(segmentId && { segmentId })
    });

    const resp = await fetch(url, { signal });
    if (!resp.ok) throw new Error(`Server responded ${resp.status}`);
    const data = await resp.json();

    renderResultsTable(data);
  } catch (err) {
    console.error(err);
    resultsBody.innerHTML = '';
    if (err && err.name === 'AbortError') {
      return;
    }
    let msg = 'No records found';
    if (/Geocoding failed/i.test(err.message)) msg = 'Could not determine location';
    else if (/IP location unavailable|IP location parse/i.test(err.message)) msg = 'Could not auto-detect location';
    else if (/401|403/.test(err.message)) msg = 'Authorization error';
    else if (/timeout/i.test(err.message)) msg = 'Request timed out';
    noRecords.textContent = msg;
    resultsTable.classList.add('hidden');
    noRecords.classList.remove('hidden');
  } finally {
    searchBtn.disabled = false;
    currentSearchController = null;
  }
});

/* Encode latitude/longitude into a base32 geohash string */
function geohashEncode(lat, lon, precision = 7) {
  const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";
  let idx = 0, bit = 0, even = true, geohash = "";
  let latMin=-90, latMax=90, lonMin=-180, lonMax=180;
  while (geohash.length < precision) {
    if (even) {
      const mid = (lonMin + lonMax) / 2;
      if (lon > mid) { idx = idx*2 + 1; lonMin = mid; } else { idx = idx*2; lonMax = mid; }
    } else {
      const mid = (latMin + latMax) / 2;
      if (lat > mid) { idx = idx*2 + 1; latMin = mid; } else { idx = idx*2; latMax = mid; }
    }
    even = !even;
    if (++bit === 5) { geohash += BASE32.charAt(idx); bit = 0; idx = 0; }
  }
  return geohash;
}

/* Resolve lat/lng via IP (auto-detect) or Google Geocoding (manual) */
async function getLatLng(autoDetect, locationText, signal) {
  if (autoDetect) {
    const ip = await fetch(`https://ipinfo.io/?token=${IPINFO_TOKEN}`, { signal }).then(r=>r.json());
    if (!ip || !ip.loc) throw new Error('IP location unavailable');
    const [lat, lng] = ip.loc.split(',').map(Number);
    if (Number.isNaN(lat) || Number.isNaN(lng)) throw new Error('IP location parse error');
    return {lat, lng};
  } else {
    const u = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    u.search = new URLSearchParams({ address: locationText, key: GOOGLE_GEOCODE_KEY });
    const geo = await fetch(u, { signal }).then(r=>r.json());
    const c = geo.results?.[0]?.geometry?.location;
    if (!c) throw new Error("Geocoding failed");
    return {lat: c.lat, lng: c.lng};
  }
}

/* Render results table rows or show the No Records banner */
function renderResultsTable(json) {
  resultsBody.innerHTML = "";
  const events = json?._embedded?.events || [];
  if (!events.length) {
    resultsBody.innerHTML = '';
    resultsTable.classList.add('hidden');
    noRecords.textContent = 'No records found';
    noRecords.classList.remove('hidden');
    results.classList.remove('hidden');
    return;
  }
  noRecords.classList.add('hidden');
  resultsTable.classList.remove('hidden');

  const pickImage = (images = []) => {
    if (!images.length) return '';
    const sorted = [...images].sort((a,b)=> (a.width||9999) - (b.width||9999));
    const candidate = sorted.find(img => (img.width||0) >= 60) || sorted[0];
    return candidate.url || '';
  };

  for (const ev of events.slice(0, 20)) {
    const date = [ev?.dates?.start?.localDate, ev?.dates?.start?.localTime].filter(Boolean).join(" ");
    const icon = pickImage(ev.images || []);
    const name = ev?.name || "N/A";
    const id = ev?.id;
    const genre = ev?.classifications?.[0]?.segment?.name || "N/A";
    const venue = ev?._embedded?.venues?.[0]?.name || "N/A";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${date||""}</td>
      <td>${icon?`<img src="${icon}" alt="icon" style="width:48px;height:auto">`:''}</td>
      <td>${id?`<a href="#" class="event-link" data-id="${id}">${name}</a>`:name}</td>
      <td>${genre}</td>
      <td>${venue}</td>`;
    resultsBody.appendChild(tr);
  }
  results.classList.remove('hidden');
}

/* Handle click on an event row to fetch and show event details */
document.getElementById('results-body').addEventListener('click', async (e)=>{
  const link = e.target.closest('.event-link');
  if (!link) return;
  e.preventDefault();
  try { if (currentVenueController) currentVenueController.abort(); } catch {}
  currentVenueController = null;
  document.getElementById('venue-details').innerHTML = '';
  const id = link.dataset.id;
  const data = await fetch(`/event?id=${encodeURIComponent(id)}`).then(r=>r.json());
  renderEventDetails(data);
  document.getElementById('event-details').scrollIntoView({behavior:'smooth'});
});

/* Build the event details card and wire the Show Venue Details CTA */
function renderEventDetails(ev) {
  try { if (currentVenueController) currentVenueController.abort(); } catch {}
  currentVenueController = null;
  document.getElementById('venue-details').innerHTML = '';
  const wrap = document.getElementById('event-details');
  const title = ev?.name || "Event Details";
  const dt   = [ev?.dates?.start?.localDate, ev?.dates?.start?.localTime].filter(Boolean).join(" ");
  const atts = (ev?._embedded?.attractions||[]).map(a=>`<a target="_blank" href="${a?.url||'#'}">${a?.name||''}</a>`).join(" | ");
  const venue = ev?._embedded?.venues?.[0]?.name || "";
  const cls = ev?.classifications?.[0] || {};
  const genre = [cls.subGenre?.name, cls.genre?.name, cls.segment?.name, cls.subType?.name, cls.type?.name]
                .filter(Boolean).join(" | ");
  const pr = ev?.priceRanges?.[0];
  const price = pr ? `${pr.min} - ${pr.max}` : "";
  const status = ev?.dates?.status?.code || "";
  const tmUrl = ev?.url || "";
  const seat = ev?.seatmap?.staticUrl || "";

  const statusColor = { "onsale":"#2e7d32", "offsale":"#d32f2f", "cancelled":"#000", "canceled":"#000",
                        "postponed":"#ef6c00", "rescheduled":"#ef6c00" }[status?.toLowerCase()] || "#555";

  const rows = [];
  if (dt) rows.push({label:'Date', value: dt});
  if (atts) rows.push({label:'Artist/Team', value: atts});
  if (venue) rows.push({label:'Venue', value: venue});
  if (genre) rows.push({label:'Genre', value: genre});
  if (price) rows.push({label:'Price Ranges', value: price});
  if (status) rows.push({label:'Ticket Status', value: `<span style="background:${statusColor};color:#fff;padding:4px 8px;border-radius:6px">${status}</span>`});
  if (tmUrl) rows.push({label:'Buy Ticket At', value: `<a target="_blank" href="${tmUrl}">Ticketmaster</a>`});

  wrap.innerHTML = `
    <div class="card event-details-card" style="margin-top:16px">
      <h2 class="event-title">${title}</h2>
      <div class="event-detail-grid">
        <div class="detail-left">
          <dl class="detail-list">${rows.map(r=>`<dt>${r.label}</dt><dd>${r.value}</dd>`).join("")}</dl>
        </div>
        <div class="detail-right">
          ${seat ? `<img src="${seat}" alt="Seat map" class="seat-map">` : ''}
        </div>
      </div>
    </div>
    ${venue ? `
      <div class="show-venue-wrap">
        <button id="show-venue" class="show-venue-cta" aria-label="Show Venue Details">
          <span class="text">Show Venue Details</span>
          <span class="chevron" aria-hidden="true"></span>
        </button>
      </div>` : ""}`;

  const btn = document.getElementById('show-venue');
  if (btn) btn.onclick = async ()=>{
    try { if (currentVenueController) currentVenueController.abort(); } catch {}
    currentVenueController = new AbortController();
    const { signal } = currentVenueController;
    try {
      const v = await fetch(`/venue?keyword=${encodeURIComponent(venue)}`, { signal }).then(r=>r.json());
      renderVenueDetails(v);
      smartScrollVenue();
      btn.remove();
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      document.getElementById('venue-details').innerHTML = `
        <div class="card" style="margin-top:12px"><p class="muted">Failed to load venue details</p></div>`;
    } finally {
      currentVenueController = null;
    }
  };
}

/* Ensure the venue card is fully visible after images load */
function smartScrollVenue() {
  const container = document.getElementById('venue-details');
  if (!container) return;

  const images = Array.from(container.querySelectorAll('img'))
    .filter(img => !img.complete);

  const afterImages = () => {
    const rect = container.getBoundingClientRect();
    const overflow = rect.bottom - window.innerHeight;
    if (overflow <= 0) return;
    const target = window.scrollY + overflow + 20;
    smoothScrollTo(target, 480);
  };

  if (images.length === 0) {
    requestAnimationFrame(afterImages);
  } else {
    let remaining = images.length;
    const done = () => { if (--remaining === 0) afterImages(); };
    images.forEach(img => { img.addEventListener('load', done, { once:true }); img.addEventListener('error', done, { once:true }); });
    setTimeout(afterImages, 600);
  }
}

/* Smooth-scroll helper with easeInOutQuad easing */
function smoothScrollTo(targetY, duration = 400) {
  const startY = window.scrollY;
  const delta = targetY - startY;
  if (Math.abs(delta) < 4) return;
  const startTime = performance.now();
  const ease = t => t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t+2,2)/2;
  function step(now){
    const prog = Math.min(1, (now - startTime)/duration);
    const eased = ease(prog);
    window.scrollTo(0, startY + delta * eased);
    if (prog < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

/* Render the venue details card with map and more-events link */
function renderVenueDetails(json) {
  const v = json?._embedded?.venues?.[0] || {};
  const name = v.name || "N/A";
  const line1 = v.address?.line1 || "N/A";
  const city = v.city?.name ? `${v.city.name}, ${v.state?.stateCode||""}`.trim() : "N/A";
  const zip = v.postalCode || "N/A";
  const url = v.url || "N/A";
  const logo = Array.isArray(v.images) && v.images.length ? (v.images.sort((a,b)=> (a.width||0)-(b.width||0))[0]?.url || "") : "";

  const fullAddress = [name, line1, v.city?.name, v.state?.stateCode, v.postalCode].filter(Boolean).join(", ");
  const gmaps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`;

  document.getElementById('venue-details').innerHTML = `
    <div class="venue-card ${logo ? '' : 'no-logo'}">
      <div class="venue-header">
        <h2 class="venue-title">${name}</h2>
        ${logo ? `<img class="venue-logo" src="${logo}" alt="${name} logo">` : ''}
      </div>
      <div class="venue-grid">
        <div class="venue-left">
          <div class="venue-address">
            <div class="lines">
              <div class="address-line">Address : ${line1}</div>
              <div class="address-line">${city}</div>
              <div class="address-line">${zip}</div>
            </div>
          </div>
          <a class="venue-map-link" target="_blank" href="${gmaps}">Open in Google Maps</a>
        </div>
        <div class="venue-divider" aria-hidden="true"></div>
        <div class="venue-right">
          ${url!=="N/A" ? `<a class="venue-more-link" target="_blank" href="${url}">More events at this venue</a>` : `<span class="muted">No events link available</span>`}
        </div>
      </div>
    </div>`;
}

/* Client-side sort for results table headers (toggle asc/desc) */
document.querySelector('thead').addEventListener('click', (e)=>{
  const th = e.target.closest('th.sortable');
  if (!th) return;
  const idx = Array.from(th.parentNode.children).indexOf(th);
  const rows = Array.from(resultsBody.querySelectorAll('tr'));
  const asc = th.dataset.asc !== "true";
  rows.sort((a,b)=>{
    const A = a.children[idx].innerText.trim().toLowerCase();
    const B = b.children[idx].innerText.trim().toLowerCase();
    return asc ? A.localeCompare(B) : B.localeCompare(A);
  });
  resultsBody.innerHTML = "";
  rows.forEach(r=>resultsBody.appendChild(r));
  th.dataset.asc = String(asc);
});