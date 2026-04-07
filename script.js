// --- CONFIG ---
const SB_URL = 'https://your-project-id.supabase.co'; 
const SB_KEY = 'your-anon-key-here'; 
const GEMINI_API_KEY = 'Your Gemini APi key';

const supabase = window.supabase.createClient(SB_URL, SB_KEY);

// --- STATE ---
let images = [];
let modalIdx = null;
let view = 'grid';

// --- INITIALIZE ---
async function init() {
  await loadFromCloud();
  bindEvents();
}

async function loadFromCloud() {
  const countPill = document.getElementById('countPill');
  countPill.textContent = "Syncing...";

  // List files from 'gallery' bucket
  const { data, error } = await supabase.storage.from('gallery').list('', {
    limit: 100,
    offset: 0,
    sortBy: { column: 'name', order: 'desc' },
  });

  if (error) {
    console.error("Cloud Fetch Error:", error);
    showToast("Sync failed");
    return;
  }

  // Get public URLs for each file
  images = data.map(file => {
    const { data: urlData } = supabase.storage.from('gallery').getPublicUrl(file.name);
    return {
      id: file.id,
      name: file.name,
      src: urlData.publicUrl,
      size: file.metadata?.size || 0,
      type: file.metadata?.mimetype || 'image/jpeg'
    };
  });

  renderGallery();
}

async function handleFiles(fileList) {
  const files = Array.from(fileList).filter(f => f.type.startsWith('image/'));
  
  for (const file of files) {
    showToast(`Uploading ${file.name}...`);
    const fileName = `${Date.now()}-${file.name.replace(/\s/g, '_')}`;

    const { error } = await supabase.storage
      .from('gallery')
      .upload(fileName, file);

    if (error) {
      showToast("Error: " + error.message);
    }
  }
  await loadFromCloud();
}

// --- AI LOGIC ---
async function analyzeImage() {
  if (modalIdx === null) return;
  const img = images[modalIdx];
  const aiText = document.getElementById('aiText');
  const aiPanel = document.getElementById('aiPanel');
  const aiBtn = document.getElementById('aiBtn');

  aiPanel.style.display = 'block';
  aiText.innerHTML = "Lumina is observing...";
  aiBtn.disabled = true;

  try {
    // 1. Fetch image and convert to Base64
    const response = await fetch(img.src);
    const blob = await response.blob();
    const base64 = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result.split(',')[1]);
      reader.readAsDataURL(blob);
    });

    // 2. Call Gemini
    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    const geminiResp = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: "Describe this image in 2 poetic sentences for a luxury gallery." },
            { inline_data: { mime_type: img.type, data: base64 } }
          ]
        }]
      })
    });

    const data = await geminiResp.json();
    aiText.textContent = data.candidates[0].content.parts[0].text;
  } catch (err) {
    aiText.textContent = "AI error. Check API key.";
  } finally {
    aiBtn.disabled = false;
  }
}

// --- UI FUNCTIONS ---
function renderGallery() {
  const gallery = document.getElementById('gallery');
  const countPill = document.getElementById('countPill');
  countPill.textContent = `${images.length} images`;

  gallery.innerHTML = images.map((img, idx) => `
    <div class="card" onclick="openModal(${idx})">
      <img class="card-thumb" src="${img.src}" loading="lazy">
      <div class="card-body">
        <div class="card-name">${img.name}</div>
      </div>
    </div>
  `).join('');
}

function openModal(idx) {
  modalIdx = idx;
  const img = images[idx];
  document.getElementById('modalImg').src = img.src;
  document.getElementById('modalName').textContent = img.name;
  document.getElementById('aiPanel').style.display = 'none';
  document.getElementById('modal').classList.add('open');
}

function closeModal() {
  document.getElementById('modal').classList.remove('open');
}

async function deleteCurrent() {
  if (!confirm("Delete from cloud?")) return;
  const img = images[modalIdx];
  await supabase.storage.from('gallery').remove([img.name]);
  closeModal();
  await loadFromCloud();
}

function bindEvents() {
  document.getElementById('fileInput').addEventListener('change', e => handleFiles(e.target.files));
  document.getElementById('gridBtn').addEventListener('click', () => { view='grid'; renderGallery(); });
  document.getElementById('listBtn').addEventListener('click', () => { view='list'; renderGallery(); });
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

init();
