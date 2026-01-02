import pkg from 'whatsapp-web.js'
const { Client, LocalAuth, MessageMedia } = pkg

import qrcode from 'qrcode-terminal'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import ExcelJS from 'exceljs'
import { ChartJSNodeCanvas } from 'chartjs-node-canvas'
import cron from 'node-cron'
import fs from 'fs'
import path from 'path'
import os from 'os'

dotenv.config()

// =====================================
// CHART GENERATOR
// =====================================
const chartJSNodeCanvas = new ChartJSNodeCanvas({ 
  width: 600, 
  height: 400,
  backgroundColour: 'white'
})

// =====================================
// SUPABASE CLIENT
// =====================================
// Use VITE_ prefix if that's what your .env uses, or add SUPABASE_URL/SUPABASE_SERVICE_KEY to .env
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Error: Supabase credentials not found!')
  console.error('Tambahkan ke file .env:')
  console.error('  SUPABASE_URL=https://xxx.supabase.co')
  console.error('  SUPABASE_SERVICE_KEY=eyJxxx...')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

// =====================================
// AI COMMAND PARSER (Same as web app)
// =====================================
const CATEGORY_KEYWORDS = {
  'Makanan & Minuman': ['makan', 'minum', 'jajan', 'lunch', 'dinner', 'sarapan', 'kopi', 'cafe', 'roti', 'snack', 'bakso', 'mie', 'soto', 'nasi', 'ayam', 'ikan', 'sate', 'martabak', 'gorengan'],
  'Transport': ['bensin', 'parkir', 'tol', 'gojek', 'grab', 'ojol', 'uber', 'taxi', 'bus', 'kereta', 'mrt', 'krl', 'angkot', 'service', 'bengkel', 'motor', 'mobil'],
  'Belanja Kebutuhan': ['belanja', 'supermarket', 'indomaret', 'alfamart', 'market', 'sayur', 'buah', 'sabun', 'shampoo', 'odol', 'tisu', 'popok', 'susu', 'beras', 'minyak'],
  'Lifestyle': ['nonton', 'bioskop', 'film', 'game', 'buku', 'hobi', 'baju', 'kaos', 'celana', 'sepatu', 'tas', 'skincare', 'makeup', 'salon', 'barber', 'netflix', 'spotify'],
  'Kesehatan': ['dokter', 'obat', 'apotek', 'rumah sakit', 'klinik', 'vitamin', 'checkup', 'gigi', 'mata', 'bpjs'],
  'Tagihan & Utang': ['listrik', 'air', 'pam', 'internet', 'wifi', 'pulsa', 'paket data', 'hp', 'cicilan', 'utang', 'arisan', 'spp', 'sekolah', 'kost', 'kontrakan', 'sewa'],
  'Lainnya': ['sedekah', 'donasi', 'kado', 'hadiah', 'lain', 'misc']
}

// Category list with index for manual selection
const CATEGORY_LIST = [
  'Makanan & Minuman',  // #1
  'Transport',           // #2
  'Belanja Kebutuhan',   // #3
  'Lifestyle',           // #4
  'Kesehatan',           // #5
  'Tagihan & Utang',     // #6
  'Lainnya'              // #7
]

function parseAmount(text) {
  const regex = /(\d+[.,]?\d*)\s*(k|rb|ribu|jt|juta)?/gi
  const matches = [...text.matchAll(regex)]
  
  for (const match of matches) {
    let value = parseFloat(match[1].replace(',', '.'))
    const multiplier = match[2]?.toLowerCase()
    
    if (multiplier) {
      if (['k', 'rb', 'ribu'].includes(multiplier)) value *= 1000
      else if (['jt', 'juta'].includes(multiplier)) value *= 1000000
      return value
    }
    
    if (value >= 100) return value
  }
  
  return null
}

function detectCategory(text) {
  const lower = text.toLowerCase()
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) return category
  }
  return 'Lainnya'
}

function parseCommand(text) {
  const lower = text.toLowerCase()
  
  // Query commands
  if ((lower.includes('sisa') || lower.includes('budget')) && 
      !lower.includes('catat') && !lower.includes('tambah')) {
    return { type: 'QUERY_REMAINING' }
  }
  
  if (lower.includes('total') || lower.includes('pengeluaran')) {
    return { type: 'QUERY_SPENDING' }
  }
  
  // Today's transactions
  if (lower === '!hari' || lower === '!today' || lower.includes('hari ini')) {
    return { type: 'QUERY_TODAY' }
  }
  
  // Category list
  if (lower === '!kategori' || lower === '!cat') {
    return { type: 'SHOW_CATEGORIES' }
  }
  
  if (lower === '!help' || lower === 'help') {
    return { type: 'HELP' }
  }
  
  // Undo command
  if (lower === '!undo') {
    return { type: 'UNDO' }
  }
  
  // Delete transaction command
  if (lower.startsWith('!hapus ')) {
    const num = parseInt(lower.slice(7).trim())
    return { type: 'DELETE_TODAY', index: num }
  }
  
  // Weekly summary
  if (lower === '!minggu' || lower === '!week') {
    return { type: 'QUERY_WEEKLY' }
  }
  
  // Bill reminder command: !ingatkan listrik 20
  if (lower.startsWith('!ingatkan ')) {
    const parts = text.slice(10).trim().split(/\s+/)
    const day = parseInt(parts.pop())
    const name = parts.join(' ')
    if (name && day >= 1 && day <= 31) {
      return { type: 'ADD_REMINDER', data: { name, day } }
    }
  }
  
  // List reminders
  if (lower === '!reminder' || lower === '!reminders') {
    return { type: 'LIST_REMINDERS' }
  }
  
  // Delete reminder
  if (lower.startsWith('!hapus-reminder ')) {
    const num = parseInt(lower.slice(16).trim())
    return { type: 'DELETE_REMINDER', index: num }
  }
  
  // Monthly comparison
  if (lower === '!bandingan' || lower === '!compare') {
    return { type: 'MONTHLY_COMPARISON' }
  }
  
  // Spending prediction
  if (lower === '!prediksi' || lower === '!predict') {
    return { type: 'SPENDING_PREDICTION' }
  }
  
  // Full recap
  if (lower === '!recap' || lower === '!rangkuman') {
    return { type: 'FULL_RECAP' }
  }
  
  // Daily challenge
  if (lower === '!challenge' || lower === '!tantangan') {
    return { type: 'DAILY_CHALLENGE' }
  }
  
  // Budget health score
  if (lower === '!health' || lower === '!kesehatan' || lower === '!score') {
    return { type: 'BUDGET_HEALTH' }
  }
  
  // Spending mood
  if (lower === '!mood') {
    return { type: 'SPENDING_MOOD' }
  }
  
  // Random tip
  if (lower === '!tips' || lower === '!tip') {
    return { type: 'RANDOM_TIP' }
  }
  
  // Multi-transaction: Check if contains comma (e.g., "makan 25k, bensin 50k")
  if (text.includes(',')) {
    const parts = text.split(',').map(p => p.trim()).filter(p => p)
    const transactions = []
    
    for (const part of parts) {
      const amount = parseAmount(part)
      if (amount) {
        let kategori = null
        const categoryMatch = part.match(/#(\d+)/)
        if (categoryMatch) {
          const index = parseInt(categoryMatch[1]) - 1
          if (index >= 0 && index < CATEGORY_LIST.length) {
            kategori = CATEGORY_LIST[index]
          }
        }
        
        let nama = part.replace(/#\d+/g, '').trim()
        nama = nama.replace(/(\d+[.,]?\d*)\s*(k|rb|ribu|jt|juta)?/gi, '').trim()
        nama = nama.replace(/\b(catat|tambah|beli|bayar|untuk|buat|seharga|rp|idr)\b/gi, '').trim()
        nama = nama.replace(/#/g, '').trim()
        nama = nama.replace(/\s+/g, ' ').trim()
        
        if (nama) {
          nama = nama.charAt(0).toUpperCase() + nama.slice(1)
        } else {
          nama = 'Transaksi'
        }
        
        transactions.push({
          nama_belanja: nama,
          harga: amount,
          kategori: kategori || detectCategory(part),
          tanggal_transaksi: new Date().toISOString().split('T')[0],
          type: 'expense'
        })
      }
    }
    
    if (transactions.length > 1) {
      return { type: 'ADD_MULTI_TRANSACTION', data: transactions }
    }
  }
  
  // Single Transaction command
  const amount = parseAmount(text)
  if (amount) {
    // IMPORTANT: Extract category index from ORIGINAL text FIRST
    // before removing amounts (otherwise #4 becomes # because 4 is removed)
    let kategori = null
    const categoryMatch = text.match(/#(\d+)/)
    if (categoryMatch) {
      const index = parseInt(categoryMatch[1]) - 1 // 1-indexed
      if (index >= 0 && index < CATEGORY_LIST.length) {
        kategori = CATEGORY_LIST[index]
      }
    }
    
    // Now remove amounts AND the #number tag
    let nama = text.replace(/#\d+/g, '').trim() // Remove #1, #2, etc. FIRST
    nama = nama.replace(/(\d+[.,]?\d*)\s*(k|rb|ribu|jt|juta)?/gi, '').trim() // Then remove amounts
    nama = nama.replace(/\b(catat|tambah|beli|bayar|untuk|buat|seharga|rp|idr)\b/gi, '').trim()
    nama = nama.replace(/#/g, '').trim() // Remove any leftover #
    
    nama = nama.replace(/\s+/g, ' ').trim()
    
    if (nama) {
      nama = nama.charAt(0).toUpperCase() + nama.slice(1)
    } else {
      nama = 'Transaksi'
    }
    
    return {
      type: 'ADD_TRANSACTION',
      data: {
        nama_belanja: nama,
        harga: amount,
        kategori: kategori || detectCategory(text), // Manual or auto-detect
        tanggal_transaksi: new Date().toISOString().split('T')[0],
        type: 'expense'
      }
    }
  }
  
  return { type: 'UNKNOWN' }
}

// =====================================
// SESSION MANAGEMENT
// =====================================
const activeSessions = new Map() // phone -> { userId, email, fullName, alertEnabled, lastTransaction, dailyChallenge }
const userReminders = new Map() // phone -> [{ name, day, createdAt }]

// =====================================
// GAMIFICATION DATA
// =====================================
const DAILY_CHALLENGES = [
  { id: 1, text: "Hari ini jangan beli kopi/minuman manis!", category: "Makanan & Minuman", maxSpend: 0 },
  { id: 2, text: "Hemat transport hari ini - jalan kaki atau nebeng!", category: "Transport", maxSpend: 10000 },
  { id: 3, text: "No shopping day! Jangan belanja apapun.", category: null, maxSpend: 50000 },
  { id: 4, text: "Masak sendiri hari ini, hemat makan luar!", category: "Makanan & Minuman", maxSpend: 30000 },
  { id: 5, text: "Lifestyle freeze! Tidak ada pengeluaran hiburan.", category: "Lifestyle", maxSpend: 0 },
  { id: 6, text: "Budget max 100rb hari ini!", category: null, maxSpend: 100000 },
  { id: 7, text: "Tantangan hemat: maksimal 3 transaksi hari ini!", category: null, maxTx: 3 }
]

const FINANCE_TIPS = [
  "💡 Sisihkan 20% gaji di awal bulan sebelum dipakai.",
  "💡 Gunakan aturan 50/30/20: Kebutuhan/Keinginan/Tabungan.",
  "💡 Tunggu 24 jam sebelum beli barang mahal.",
  "💡 Catat setiap pengeluaran, sekecil apapun!",
  "💡 Bawa bekal dari rumah untuk hemat makan siang.",
  "💡 Review langganan bulanan, cancel yang tidak perlu.",
  "💡 Gunakan promo dan cashback dengan bijak.",
  "💡 Simpan uang receh, lama-lama jadi bukit!",
  "💡 Bedakan BUTUH vs INGIN sebelum membeli.",
  "💡 Set goal tabungan yang spesifik dan realistis."
]

const ACHIEVEMENTS = [
  { id: 'first_tx', name: 'First Step', desc: 'Transaksi pertama', icon: '🎯' },
  { id: 'streak_3', name: '3 Day Streak', desc: '3 hari berturut-turut', icon: '🔥' },
  { id: 'streak_7', name: 'Week Warrior', desc: '7 hari berturut-turut', icon: '⚡' },
  { id: 'under_budget', name: 'Budget Master', desc: 'Selesai periode under budget', icon: '🏆' },
  { id: 'challenge_complete', name: 'Challenge Accepted', desc: 'Selesaikan daily challenge', icon: '✅' }
]

// Get random daily challenge
function getDailyChallenge() {
  const today = new Date().toISOString().split('T')[0]
  const seed = parseInt(today.replace(/-/g, ''))
  const index = seed % DAILY_CHALLENGES.length
  return DAILY_CHALLENGES[index]
}

// Get random finance tip
function getRandomTip() {
  return FINANCE_TIPS[Math.floor(Math.random() * FINANCE_TIPS.length)]
}

// Calculate budget health score (A-F)
function getBudgetHealthScore(spent, budget, daysLeft, totalDays) {
  const pctUsed = (spent / budget) * 100
  const pctTimeLeft = (daysLeft / totalDays) * 100
  
  // If spent less percentage than time passed = good
  const ratio = pctUsed / (100 - pctTimeLeft + 1)
  
  if (ratio < 0.5) return { grade: 'A', emoji: '🌟', status: 'EXCELLENT' }
  if (ratio < 0.8) return { grade: 'B', emoji: '😊', status: 'BAGUS' }
  if (ratio < 1.0) return { grade: 'C', emoji: '😐', status: 'CUKUP' }
  if (ratio < 1.3) return { grade: 'D', emoji: '😰', status: 'HATI-HATI' }
  return { grade: 'F', emoji: '🚨', status: 'BAHAYA' }
}

// Get spending mood emoji
function getSpendingMood(todaySpent, avgDaily) {
  const ratio = todaySpent / (avgDaily || 1)
  if (ratio < 0.5) return { emoji: '😇', text: 'Super hemat!' }
  if (ratio < 0.8) return { emoji: '😊', text: 'Bagus!' }
  if (ratio < 1.2) return { emoji: '😐', text: 'Normal' }
  if (ratio < 2.0) return { emoji: '😬', text: 'Agak boros' }
  return { emoji: '😱', text: 'Boros banget!' }
}

// Get saving tip based on top category
function getSavingTip(topCategory) {
  const tips = {
    'Makanan & Minuman': '🍽️ Tips: Masak sendiri 2x seminggu bisa hemat 500rb/bulan!',
    'Transport': '🚗 Tips: Gabung carpool atau coba naik transportasi umum!',
    'Lifestyle': '🎮 Tips: Set budget entertainment max 10% dari gaji!',
    'Belanja Kebutuhan': '🛒 Tips: Buat list belanja, jangan impulsif beli!',
    'Kesehatan': '💊 Tips: Jaga kesehatan = hemat biaya dokter!',
    'Tagihan & Utang': '📱 Tips: Review paket internet/HP, downgrade jika perlu!'
  }
  return tips[topCategory] || '💡 Tips: Review pengeluaran dan cut yang tidak perlu!'
}

// =====================================
// HELPER FUNCTIONS
// =====================================
const formatCurrency = (amount) => {
  return new Intl.NumberFormat('id-ID', { 
    style: 'currency', 
    currency: 'IDR', 
    minimumFractionDigits: 0 
  }).format(amount)
}

// Generate Pie Chart image
async function generatePieChart(categoryData) {
  const labels = Object.keys(categoryData)
  const data = Object.values(categoryData)
  const colors = [
    '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', 
    '#9966FF', '#FF9F40', '#C9CBCF'
  ]
  
  const configuration = {
    type: 'pie',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors.slice(0, labels.length),
        borderWidth: 2,
        borderColor: '#fff'
      }]
    },
    options: {
      plugins: {
        title: {
          display: true,
          text: 'Pengeluaran per Kategori',
          font: { size: 18, weight: 'bold' }
        },
        legend: {
          position: 'bottom'
        }
      }
    }
  }
  
  return await chartJSNodeCanvas.renderToBuffer(configuration)
}

// Generate Excel file
async function generateExcel(transactions, period) {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Transaksi')
  
  // Header
  sheet.columns = [
    { header: 'No', key: 'no', width: 5 },
    { header: 'Tanggal', key: 'tanggal', width: 15 },
    { header: 'Nama Belanja', key: 'nama', width: 30 },
    { header: 'Kategori', key: 'kategori', width: 20 },
    { header: 'Jumlah (Rp)', key: 'harga', width: 15 }
  ]
  
  // Style header
  sheet.getRow(1).font = { bold: true }
  sheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF4F46E5' }
  }
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  
  // Add data
  transactions.forEach((t, i) => {
    sheet.addRow({
      no: i + 1,
      tanggal: t.tanggal_transaksi,
      nama: t.nama_belanja,
      kategori: t.kategori,
      harga: Number(t.harga)
    })
  })
  
  // Total row
  const total = transactions.reduce((sum, t) => sum + Number(t.harga), 0)
  const totalRow = sheet.addRow({
    no: '',
    tanggal: '',
    nama: '',
    kategori: 'TOTAL',
    harga: total
  })
  totalRow.font = { bold: true }
  
  // Save to temp file
  const fileName = `Laporan_${period?.tanggal_mulai || 'All'}_${period?.tanggal_selesai || 'Time'}.xlsx`
  const filePath = path.join(os.tmpdir(), fileName)
  await workbook.xlsx.writeFile(filePath)
  
  return { filePath, fileName }
}

// Calculate XP from transaction
function calculateXP(harga) {
  // 1 XP per 1000 rupiah, minimum 5 XP
  return Math.max(5, Math.floor(harga / 1000))
}

// Get level from XP
function getLevel(xp) {
  if (xp < 100) return { level: 1, name: 'Pemula', nextXP: 100 }
  if (xp < 300) return { level: 2, name: 'Pencatat', nextXP: 300 }
  if (xp < 600) return { level: 3, name: 'Hemat Master', nextXP: 600 }
  if (xp < 1000) return { level: 4, name: 'Budget Pro', nextXP: 1000 }
  if (xp < 2000) return { level: 5, name: 'Finance Guru', nextXP: 2000 }
  return { level: 6, name: 'Money Legend', nextXP: null }
}

const HELP_MESSAGE = `
📱 *Budget Tracker Bot*

*📊 Query & Reports:*
• \`!hari\` - Transaksi hari ini
• \`!minggu\` - Ringkasan minggu ini
• \`!bandingan\` - vs bulan lalu
• \`!prediksi\` - Prediksi budget
• \`!recap\` - Rangkuman lengkap
• \`!chart\` - Grafik 📊
• \`!export\` - Export Excel 📂

*🎮 Gamifikasi:*
• \`!challenge\` - Tantangan harian 🎯
• \`!health\` - Budget health score 🏥
• \`!mood\` - Spending mood 😊
• \`!stats\` - XP & Level
• \`!tips\` - Tips keuangan 💡

*🔧 Manajemen:*
• \`!login\` / \`!logout\`
• \`!kategori\` - Daftar kategori
• \`!undo\` - Batalkan terakhir
• \`!hapus <n>\` - Hapus transaksi
• \`!ingatkan <tagihan> <tgl>\` 🔔
• \`!reminder\` - Lihat reminder
• \`!alert on/off\` - Notifikasi

*📝 Catat:* "Makan 25k" atau "Makan 25k, bensin 50k"
`.trim()

// =====================================
// WHATSAPP CLIENT
// =====================================
const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: './.wwebjs_auth'
  }),
  puppeteer: { 
    headless: true,
    args: [
      '--no-sandbox', 
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
      '--disable-gpu',
      '--disable-extensions',
      '--disable-software-rasterizer',
      '--disable-features=AudioServiceOutOfProcess',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-component-update',
      '--disable-default-apps',
      '--disable-translate',
      '--metrics-recording-only',
      '--mute-audio',
      '--no-default-browser-check',
      '--autoplay-policy=no-user-gesture-required'
    ]
  }
})

client.on('qr', (qr) => {
  console.log('\n📱 Scan QR Code dengan WhatsApp:')
  console.log('================================')
  qrcode.generate(qr, { small: true })
  console.log('================================\n')
})

client.on('ready', () => {
  console.log('✅ WhatsApp Bot siap digunakan!')
  console.log('📞 Nomor terhubung:', client.info.wid.user)
  console.log('\nMenunggu pesan...\n')
})

client.on('authenticated', () => {
  console.log('🔐 Autentikasi berhasil!')
})

client.on('auth_failure', (msg) => {
  console.error('❌ Autentikasi gagal:', msg)
})

client.on('disconnected', (reason) => {
  console.log('🔌 Terputus:', reason)
})

// =====================================
// MESSAGE HANDLER
// =====================================
// Whitelist: Only these phone numbers can use the bot
// Add numbers without + or leading 0, e.g., 6281234567890
const ALLOWED_PHONES = process.env.ALLOWED_PHONES || process.env.ALLOWED_PHONES

client.on('message', async (message) => {
  // Only process text messages
  if (message.type !== 'chat') return
  
  // Ignore group messages (optional: remove to enable groups)
  if (message.from.includes('@g.us')) return
  
  const phone = message.from.replace('@c.us', '')
  const text = message.body.trim()
  
  // Check whitelist
  if (!ALLOWED_PHONES.includes(phone)) {
    console.log(`🚫 Blocked: ${phone} (not in whitelist)`)
    return // Silently ignore non-whitelisted numbers
  }
  
  // === VOICE NOTE HANDLER ===
  if (message.type === 'ptt' || message.type === 'audio') {
    const session = activeSessions.get(phone)
    if (session) {
      console.log(`🎤 Voice note from ${phone}`)
      await message.reply(
        `🎤 *Voice Note Diterima!*\n\n` +
        `Fitur transcribe voice → transaksi akan segera hadir!\n\n` +
        `_Sementara ini, ketik manual ya._`
      )
    }
    return
  }
  
  // === IMAGE HANDLER ===
  if (message.type === 'image') {
    const session = activeSessions.get(phone)
    if (session) {
      console.log(`📷 Image from ${phone}`)
      await message.reply(
        `📷 *Foto Diterima!*\n\n` +
        `Fitur OCR struk → auto-extract transaksi akan segera hadir!\n\n` +
        `_Sementara ini, ketik manual ya._`
      )
    }
    return
  }
  
  console.log(`📩 [${phone}]: ${text}`)
  
  try {
    // === COMMAND: !login <email> ===
    if (text.toLowerCase().startsWith('!login ')) {
      const email = text.slice(7).trim().toLowerCase()
      
      if (!email || !email.includes('@')) {
        await message.reply('❌ Format: !login <email>\n\nContoh: !login bimsky@gmail.com')
        return
      }
      
      // Query auth.users table directly (requires service_role key)
      const { data: authData, error } = await supabase
        .from('users')  // This is actually auth.users view
        .select('id, email')
        .eq('email', email)
        .single()
      
      // Alternative: Query via auth admin API
      let userId = null
      let userEmail = null
      
      if (!authData) {
        // Fallback: use Supabase Auth Admin API
        const { data: { users }, error: authError } = await supabase.auth.admin.listUsers()
        
        if (authError) {
          console.error('Auth error:', authError)
          await message.reply(`❌ Gagal mengakses data user. Pastikan menggunakan service_role key.`)
          return
        }
        
        const foundUser = users.find(u => u.email?.toLowerCase() === email)
        if (foundUser) {
          userId = foundUser.id
          userEmail = foundUser.email
        }
      } else {
        userId = authData.id
        userEmail = authData.email
      }
      
      if (!userId) {
        await message.reply(`❌ Email "${email}" tidak terdaftar.`)
        return
      }
      
      activeSessions.set(phone, { 
        userId: userId, 
        email: userEmail,
        fullName: userEmail.split('@')[0]
      })
      
      console.log(`✅ Login: ${userEmail} (${phone})`)
      
      await message.reply(
        `✅ *Login berhasil!*\n\n` +
        `Halo ${userEmail.split('@')[0]}! 👋\n\n` +
        `Silakan kirim transaksi:\n` +
        `• "Makan siang 25k"\n` +
        `• "Isi bensin 50rb"\n` +
        `• "Sisa budget?"\n\n` +
        `Ketik \`!help\` untuk bantuan.\n` +
        `Ketik \`!logout\` untuk keluar.`
      )
      return
    }
    
    // === COMMAND: !logout ===
    if (text.toLowerCase() === '!logout') {
      if (activeSessions.has(phone)) {
        const session = activeSessions.get(phone)
        activeSessions.delete(phone)
        console.log(`👋 Logout: ${session.username} (${phone})`)
        await message.reply('👋 Logout berhasil! Sampai jumpa.')
      } else {
        await message.reply('ℹ️ Kamu belum login.')
      }
      return
    }
    
    // === COMMAND: !help ===
    if (text.toLowerCase() === '!help' || text.toLowerCase() === 'help') {
      await message.reply(HELP_MESSAGE)
      return
    }
    
    // === CHECK SESSION ===
    const session = activeSessions.get(phone)
    if (!session) {
      // Silent ignore OR send hint (uncomment below)
      // await message.reply('💡 Ketik `!login <username>` untuk memulai')
      return
    }
    
    // === PROCESS COMMAND ===
    const command = parseCommand(text)
    
    if (command.type === 'ADD_TRANSACTION') {
      const { nama_belanja, harga, kategori, tanggal_transaksi, type } = command.data
      
      const { data: insertedTx, error } = await supabase.from('transactions').insert({
        user_id: session.userId,
        nama_belanja,
        harga,
        kategori,
        tanggal_transaksi,
        type
      }).select().single()
      
      if (error) {
        console.error('Insert error:', error)
        await message.reply('❌ Gagal menyimpan transaksi. Coba lagi.')
        return
      }
      
      // Store last transaction for undo
      session.lastTransaction = insertedTx
      activeSessions.set(phone, session)
      
      // Calculate XP gained
      const xpGained = calculateXP(harga)
      
      console.log(`💰 Transaksi: ${nama_belanja} ${formatCurrency(harga)} (+${xpGained} XP)`)
      
      await message.reply(
        `✅ *Tercatat!*\n\n` +
        `📝 ${nama_belanja}\n` +
        `💰 ${formatCurrency(harga)}\n` +
        `🏷️ ${kategori}\n` +
        `📅 ${tanggal_transaksi}\n\n` +
        `✨ *+${xpGained} XP*`
      )
    }
    else if (command.type === 'QUERY_REMAINING') {
      // Get ACTIVE budget period with date range
      const { data: period } = await supabase
        .from('budget_periods')
        .select('budget_bulanan, tanggal_mulai, tanggal_selesai')
        .eq('user_id', session.userId)
        .eq('is_active', true)
        .single()
      
      if (!period) {
        await message.reply('❌ Belum ada periode budget aktif.')
        return
      }
      
      // Get expenses ONLY within the active period (same as web app)
      const { data: txs } = await supabase
        .from('transactions')
        .select('harga')
        .eq('user_id', session.userId)
        .eq('type', 'expense')
        .gte('tanggal_transaksi', period.tanggal_mulai)
        .lte('tanggal_transaksi', period.tanggal_selesai)
      
      const spent = txs?.reduce((sum, t) => sum + Number(t.harga), 0) || 0
      const budget = Number(period.budget_bulanan) || 0
      const remaining = budget - spent
      const percentage = budget > 0 ? Math.round((spent / budget) * 100) : 0
      
      await message.reply(
        `💵 *Sisa Budget*\n\n` +
        `📅 Periode: ${period.tanggal_mulai} s/d ${period.tanggal_selesai}\n` +
        `Budget: ${formatCurrency(budget)}\n` +
        `Terpakai: ${formatCurrency(spent)} (${percentage}%)\n` +
        `━━━━━━━━━━━━━\n` +
        `*Sisa: ${formatCurrency(remaining)}*`
      )
    }
    else if (command.type === 'QUERY_SPENDING') {
      // Get ACTIVE period first
      const { data: period } = await supabase
        .from('budget_periods')
        .select('tanggal_mulai, tanggal_selesai')
        .eq('user_id', session.userId)
        .eq('is_active', true)
        .single()
      
      // Query transactions (filtered by period if exists)
      let query = supabase
        .from('transactions')
        .select('harga, kategori')
        .eq('user_id', session.userId)
        .eq('type', 'expense')
      
      if (period) {
        query = query
          .gte('tanggal_transaksi', period.tanggal_mulai)
          .lte('tanggal_transaksi', period.tanggal_selesai)
      }
      
      const { data: txs } = await query
      
      const total = txs?.reduce((sum, t) => sum + Number(t.harga), 0) || 0
      
      // Group by category
      const byCategory = {}
      txs?.forEach(t => {
        byCategory[t.kategori] = (byCategory[t.kategori] || 0) + Number(t.harga)
      })
      
      let breakdown = ''
      Object.entries(byCategory)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .forEach(([cat, amt]) => {
          breakdown += `• ${cat}: ${formatCurrency(amt)}\n`
        })
      
      const periodInfo = period 
        ? `📅 Periode: ${period.tanggal_mulai} s/d ${period.tanggal_selesai}\n\n`
        : ''
      
      await message.reply(
        `📊 *Total Pengeluaran*\n\n` +
        periodInfo +
        `*${formatCurrency(total)}*\n\n` +
        `Top Kategori:\n${breakdown}`
      )
    }
    else if (command.type === 'SHOW_CATEGORIES') {
      let categoryList = '*📁 Daftar Kategori*\n\n'
      CATEGORY_LIST.forEach((cat, i) => {
        categoryList += `*#${i + 1}* ${cat}\n`
      })
      categoryList += '\n_Gunakan #nomor untuk pilih kategori manual_\n'
      categoryList += '_Contoh: "Beli kado 100k #7"_'
      
      await message.reply(categoryList)
    }
    else if (command.type === 'QUERY_TODAY') {
      const today = new Date().toISOString().split('T')[0]
      
      const { data: txs } = await supabase
        .from('transactions')
        .select('nama_belanja, harga, kategori, created_at')
        .eq('user_id', session.userId)
        .eq('tanggal_transaksi', today)
        .order('created_at', { ascending: false })
      
      if (!txs || txs.length === 0) {
        await message.reply('📋 *Transaksi Hari Ini*\n\n_Belum ada transaksi hari ini._')
        return
      }
      
      const total = txs.reduce((sum, t) => sum + Number(t.harga), 0)
      
      let list = `📋 *Transaksi Hari Ini*\n📅 ${today}\n\n`
      txs.forEach((t, i) => {
        list += `${i + 1}. ${t.nama_belanja}\n`
        list += `   💰 ${formatCurrency(t.harga)} | 🏷️ ${t.kategori}\n`
      })
      list += `\n━━━━━━━━━━━━━\n*Total: ${formatCurrency(total)}*`
      
      await message.reply(list)
    }
    // === UNDO LAST TRANSACTION ===
    else if (command.type === 'UNDO') {
      if (!session.lastTransaction) {
        await message.reply('❌ Tidak ada transaksi untuk di-undo.')
        return
      }
      
      const { error } = await supabase
        .from('transactions')
        .delete()
        .eq('id', session.lastTransaction.id)
      
      if (error) {
        await message.reply('❌ Gagal undo transaksi.')
        return
      }
      
      const undone = session.lastTransaction
      session.lastTransaction = null
      activeSessions.set(phone, session)
      
      await message.reply(
        `↩️ *Transaksi Di-undo!*\n\n` +
        `📝 ${undone.nama_belanja}\n` +
        `💰 ${formatCurrency(undone.harga)}\n\n` +
        `_Transaksi telah dihapus._`
      )
    }
    // === DELETE TODAY'S TRANSACTION BY INDEX ===
    else if (command.type === 'DELETE_TODAY') {
      const today = new Date().toISOString().split('T')[0]
      
      // Get today's transactions
      const { data: txs } = await supabase
        .from('transactions')
        .select('id, nama_belanja, harga')
        .eq('user_id', session.userId)
        .eq('tanggal_transaksi', today)
        .order('created_at', { ascending: false })
      
      if (!txs || txs.length === 0) {
        await message.reply('❌ Tidak ada transaksi hari ini.')
        return
      }
      
      const index = command.index - 1 // 1-indexed to 0-indexed
      if (index < 0 || index >= txs.length) {
        await message.reply(`❌ Nomor tidak valid. Gunakan 1-${txs.length}.\n\nKetik \`!hari\` untuk lihat daftar.`)
        return
      }
      
      const toDelete = txs[index]
      
      const { error } = await supabase
        .from('transactions')
        .delete()
        .eq('id', toDelete.id)
      
      if (error) {
        await message.reply('❌ Gagal menghapus transaksi.')
        return
      }
      
      await message.reply(
        `🗑️ *Transaksi Dihapus!*\n\n` +
        `📝 ${toDelete.nama_belanja}\n` +
        `💰 ${formatCurrency(toDelete.harga)}`
      )
    }
    // === WEEKLY SUMMARY ===
    else if (command.type === 'QUERY_WEEKLY') {
      const today = new Date()
      const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
      const startDate = weekAgo.toISOString().split('T')[0]
      const endDate = today.toISOString().split('T')[0]
      
      const { data: txs } = await supabase
        .from('transactions')
        .select('harga, kategori, tanggal_transaksi')
        .eq('user_id', session.userId)
        .eq('type', 'expense')
        .gte('tanggal_transaksi', startDate)
        .lte('tanggal_transaksi', endDate)
      
      if (!txs || txs.length === 0) {
        await message.reply('📊 *Ringkasan Minggu Ini*\n\n_Belum ada transaksi._')
        return
      }
      
      const total = txs.reduce((sum, t) => sum + Number(t.harga), 0)
      const avgPerDay = Math.round(total / 7)
      
      // Group by category
      const byCategory = {}
      txs.forEach(t => {
        byCategory[t.kategori] = (byCategory[t.kategori] || 0) + Number(t.harga)
      })
      
      // Group by day
      const byDay = {}
      txs.forEach(t => {
        byDay[t.tanggal_transaksi] = (byDay[t.tanggal_transaksi] || 0) + Number(t.harga)
      })
      
      let categoryBreakdown = ''
      Object.entries(byCategory)
        .sort((a, b) => b[1] - a[1])
        .forEach(([cat, amt]) => {
          const pct = Math.round((amt / total) * 100)
          categoryBreakdown += `• ${cat}: ${formatCurrency(amt)} (${pct}%)\n`
        })
      
      await message.reply(
        `📊 *Ringkasan Minggu Ini*\n` +
        `📅 ${startDate} - ${endDate}\n\n` +
        `💰 *Total: ${formatCurrency(total)}*\n` +
        `📝 Transaksi: ${txs.length}\n` +
        `📈 Rata-rata/hari: ${formatCurrency(avgPerDay)}\n\n` +
        `*Per Kategori:*\n${categoryBreakdown}`
      )
    }
    // === MULTI-TRANSACTION ===
    else if (command.type === 'ADD_MULTI_TRANSACTION') {
      const transactions = command.data
      let insertedCount = 0
      let totalAmount = 0
      let totalXP = 0
      let details = ''
      
      for (const tx of transactions) {
        const { error } = await supabase.from('transactions').insert({
          user_id: session.userId,
          ...tx
        })
        
        if (!error) {
          insertedCount++
          totalAmount += tx.harga
          totalXP += calculateXP(tx.harga)
          details += `• ${tx.nama_belanja}: ${formatCurrency(tx.harga)} (${tx.kategori})\n`
        }
      }
      
      if (insertedCount === 0) {
        await message.reply('❌ Gagal menyimpan transaksi.')
        return
      }
      
      console.log(`💰 Multi-transaksi: ${insertedCount} items, ${formatCurrency(totalAmount)} (+${totalXP} XP)`)
      
      await message.reply(
        `✅ *${insertedCount} Transaksi Tercatat!*\n\n` +
        details +
        `\n━━━━━━━━━━━━━\n` +
        `💰 Total: *${formatCurrency(totalAmount)}*\n` +
        `✨ *+${totalXP} XP*`
      )
    }
    // === ADD REMINDER ===
    else if (command.type === 'ADD_REMINDER') {
      const { name, day } = command.data
      
      if (!userReminders.has(phone)) {
        userReminders.set(phone, [])
      }
      
      const reminders = userReminders.get(phone)
      reminders.push({ name, day, createdAt: new Date() })
      userReminders.set(phone, reminders)
      
      await message.reply(
        `🔔 *Reminder Ditambahkan!*\n\n` +
        `📝 ${name}\n` +
        `📅 Setiap tanggal ${day}\n\n` +
        `_Kamu akan diingatkan jam 8 pagi._`
      )
    }
    // === LIST REMINDERS ===
    else if (command.type === 'LIST_REMINDERS') {
      const reminders = userReminders.get(phone) || []
      
      if (reminders.length === 0) {
        await message.reply('📋 *Daftar Reminder*\n\n_Belum ada reminder._\n\nTambah dengan: `!ingatkan listrik 20`')
        return
      }
      
      let list = `📋 *Daftar Reminder*\n\n`
      reminders.forEach((r, i) => {
        list += `${i + 1}. ${r.name} (tgl ${r.day})\n`
      })
      list += `\n_Hapus dengan: \`!hapus-reminder <nomor>\`_`
      
      await message.reply(list)
    }
    // === DELETE REMINDER ===
    else if (command.type === 'DELETE_REMINDER') {
      const reminders = userReminders.get(phone) || []
      const index = command.index - 1
      
      if (index < 0 || index >= reminders.length) {
        await message.reply(`❌ Nomor tidak valid. Gunakan 1-${reminders.length}.`)
        return
      }
      
      const deleted = reminders.splice(index, 1)[0]
      userReminders.set(phone, reminders)
      
      await message.reply(`🗑️ Reminder "${deleted.name}" dihapus.`)
    }
    // === MONTHLY COMPARISON ===
    else if (command.type === 'MONTHLY_COMPARISON') {
      const now = new Date()
      const thisMonth = now.toISOString().slice(0, 7) // YYYY-MM
      const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const lastMonth = lastMonthDate.toISOString().slice(0, 7)
      
      // This month transactions
      const { data: thisMonthTxs } = await supabase
        .from('transactions')
        .select('harga, kategori')
        .eq('user_id', session.userId)
        .eq('type', 'expense')
        .gte('tanggal_transaksi', `${thisMonth}-01`)
        .lte('tanggal_transaksi', `${thisMonth}-31`)
      
      // Last month transactions
      const { data: lastMonthTxs } = await supabase
        .from('transactions')
        .select('harga, kategori')
        .eq('user_id', session.userId)
        .eq('type', 'expense')
        .gte('tanggal_transaksi', `${lastMonth}-01`)
        .lte('tanggal_transaksi', `${lastMonth}-31`)
      
      const thisTotal = thisMonthTxs?.reduce((s, t) => s + Number(t.harga), 0) || 0
      const lastTotal = lastMonthTxs?.reduce((s, t) => s + Number(t.harga), 0) || 0
      
      const diff = thisTotal - lastTotal
      const pctChange = lastTotal > 0 ? Math.round((diff / lastTotal) * 100) : 0
      const emoji = diff > 0 ? '📈' : (diff < 0 ? '📉' : '➡️')
      const status = diff > 0 ? 'NAIK' : (diff < 0 ? 'TURUN' : 'SAMA')
      
      await message.reply(
        `📊 *Perbandingan Bulanan*\n\n` +
        `📅 Bulan lalu (${lastMonth}): ${formatCurrency(lastTotal)}\n` +
        `📅 Bulan ini (${thisMonth}): ${formatCurrency(thisTotal)}\n\n` +
        `${emoji} *${status} ${Math.abs(pctChange)}%*\n` +
        `Selisih: ${diff >= 0 ? '+' : ''}${formatCurrency(diff)}`
      )
    }
    // === SPENDING PREDICTION ===
    else if (command.type === 'SPENDING_PREDICTION') {
      // Get active period
      const { data: period } = await supabase
        .from('budget_periods')
        .select('budget_bulanan, tanggal_mulai, tanggal_selesai')
        .eq('user_id', session.userId)
        .eq('is_active', true)
        .single()
      
      if (!period) {
        await message.reply('❌ Tidak ada periode budget aktif.')
        return
      }
      
      const { data: txs } = await supabase
        .from('transactions')
        .select('harga, tanggal_transaksi')
        .eq('user_id', session.userId)
        .eq('type', 'expense')
        .gte('tanggal_transaksi', period.tanggal_mulai)
        .lte('tanggal_transaksi', period.tanggal_selesai)
      
      const totalSpent = txs?.reduce((s, t) => s + Number(t.harga), 0) || 0
      const budget = Number(period.budget_bulanan)
      const remaining = budget - totalSpent
      
      const start = new Date(period.tanggal_mulai)
      const end = new Date(period.tanggal_selesai)
      const today = new Date()
      
      const daysPassed = Math.max(1, Math.floor((today - start) / (1000 * 60 * 60 * 24)))
      const totalDays = Math.floor((end - start) / (1000 * 60 * 60 * 24))
      const daysLeft = Math.max(0, totalDays - daysPassed)
      
      const dailyRate = totalSpent / daysPassed
      const projectedTotal = dailyRate * totalDays
      const daysUntilEmpty = dailyRate > 0 ? Math.floor(remaining / dailyRate) : 999
      
      const status = projectedTotal > budget ? '⚠️ OVER BUDGET' : '✅ AMAN'
      
      await message.reply(
        `🔮 *Prediksi Pengeluaran*\n\n` +
        `📊 Rate harian: ${formatCurrency(Math.round(dailyRate))}/hari\n` +
        `📅 Sisa hari: ${daysLeft} hari\n\n` +
        `💰 Budget: ${formatCurrency(budget)}\n` +
        `💸 Terpakai: ${formatCurrency(totalSpent)}\n` +
        `📈 Proyeksi: ${formatCurrency(Math.round(projectedTotal))}\n\n` +
        `${status}\n` +
        `⏰ Budget habis dalam: *${daysUntilEmpty} hari*`
      )
    }
    // === FULL RECAP ===
    else if (command.type === 'FULL_RECAP') {
      // Get active period
      const { data: period } = await supabase
        .from('budget_periods')
        .select('budget_bulanan, tanggal_mulai, tanggal_selesai')
        .eq('user_id', session.userId)
        .eq('is_active', true)
        .single()
      
      const { data: txs } = await supabase
        .from('transactions')
        .select('harga, kategori')
        .eq('user_id', session.userId)
        .eq('type', 'expense')
        .gte('tanggal_transaksi', period?.tanggal_mulai || '2020-01-01')
        .lte('tanggal_transaksi', period?.tanggal_selesai || '2099-12-31')
      
      const totalSpent = txs?.reduce((s, t) => s + Number(t.harga), 0) || 0
      const budget = Number(period?.budget_bulanan) || 0
      const remaining = budget - totalSpent
      const pct = budget > 0 ? Math.round((totalSpent / budget) * 100) : 0
      
      // By category
      const byCategory = {}
      txs?.forEach(t => {
        byCategory[t.kategori] = (byCategory[t.kategori] || 0) + Number(t.harga)
      })
      
      let catList = ''
      Object.entries(byCategory)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .forEach(([cat, amt]) => {
          const catPct = Math.round((amt / totalSpent) * 100)
          catList += `• ${cat}: ${formatCurrency(amt)} (${catPct}%)\n`
        })
      
      // XP
      const totalXP = txs?.reduce((sum, t) => sum + calculateXP(Number(t.harga)), 0) || 0
      const levelInfo = getLevel(totalXP)
      
      await message.reply(
        `📋 *RECAP LENGKAP*\n` +
        `━━━━━━━━━━━━━━━━━\n\n` +
        `💰 *Budget*\n` +
        `Budget: ${formatCurrency(budget)}\n` +
        `Terpakai: ${formatCurrency(totalSpent)} (${pct}%)\n` +
        `Sisa: ${formatCurrency(remaining)}\n\n` +
        `🏷️ *Top Kategori*\n${catList}\n` +
        `🎮 *Gamifikasi*\n` +
        `Level ${levelInfo.level}: ${levelInfo.name}\n` +
        `XP: ${totalXP}\n` +
        `Transaksi: ${txs?.length || 0}`
      )
    }
    // === DAILY CHALLENGE ===
    else if (command.type === 'DAILY_CHALLENGE') {
      const challenge = getDailyChallenge()
      
      await message.reply(
        `🎯 *Daily Challenge*\n\n` +
        `📅 Tantangan Hari Ini:\n` +
        `"${challenge.text}"\n\n` +
        `${challenge.maxSpend ? `💰 Max: ${formatCurrency(challenge.maxSpend)}` : ''}\n` +
        `${challenge.maxTx ? `📝 Max transaksi: ${challenge.maxTx}` : ''}\n\n` +
        `_Selesaikan untuk dapat achievement!_`
      )
    }
    // === BUDGET HEALTH SCORE ===
    else if (command.type === 'BUDGET_HEALTH') {
      const { data: period } = await supabase
        .from('budget_periods')
        .select('budget_bulanan, tanggal_mulai, tanggal_selesai')
        .eq('user_id', session.userId)
        .eq('is_active', true)
        .single()
      
      if (!period) {
        await message.reply('❌ Tidak ada periode budget aktif.')
        return
      }
      
      const { data: txs } = await supabase
        .from('transactions')
        .select('harga, kategori')
        .eq('user_id', session.userId)
        .eq('type', 'expense')
        .gte('tanggal_transaksi', period.tanggal_mulai)
        .lte('tanggal_transaksi', period.tanggal_selesai)
      
      const spent = txs?.reduce((s, t) => s + Number(t.harga), 0) || 0
      const budget = Number(period.budget_bulanan)
      
      const start = new Date(period.tanggal_mulai)
      const end = new Date(period.tanggal_selesai)
      const today = new Date()
      const totalDays = Math.floor((end - start) / (1000 * 60 * 60 * 24))
      const daysLeft = Math.max(0, Math.floor((end - today) / (1000 * 60 * 60 * 24)))
      
      const health = getBudgetHealthScore(spent, budget, daysLeft, totalDays)
      
      // Find top category for tip
      const byCategory = {}
      txs?.forEach(t => {
        byCategory[t.kategori] = (byCategory[t.kategori] || 0) + Number(t.harga)
      })
      const topCat = Object.entries(byCategory).sort((a, b) => b[1] - a[1])[0]?.[0]
      const tip = getSavingTip(topCat)
      
      await message.reply(
        `🏥 *Budget Health Score*\n\n` +
        `${health.emoji} Grade: *${health.grade}*\n` +
        `📊 Status: ${health.status}\n\n` +
        `💰 Budget: ${formatCurrency(budget)}\n` +
        `💸 Terpakai: ${formatCurrency(spent)} (${Math.round((spent/budget)*100)}%)\n` +
        `📅 Sisa waktu: ${daysLeft} hari\n\n` +
        `${tip}`
      )
    }
    // === SPENDING MOOD ===
    else if (command.type === 'SPENDING_MOOD') {
      const today = new Date().toISOString().split('T')[0]
      
      // Get today's spending
      const { data: todayTxs } = await supabase
        .from('transactions')
        .select('harga')
        .eq('user_id', session.userId)
        .eq('tanggal_transaksi', today)
        .eq('type', 'expense')
      
      // Get average daily spending (last 30 days)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      const { data: recentTxs } = await supabase
        .from('transactions')
        .select('harga')
        .eq('user_id', session.userId)
        .gte('tanggal_transaksi', thirtyDaysAgo)
        .eq('type', 'expense')
      
      const todaySpent = todayTxs?.reduce((s, t) => s + Number(t.harga), 0) || 0
      const totalRecent = recentTxs?.reduce((s, t) => s + Number(t.harga), 0) || 0
      const avgDaily = totalRecent / 30
      
      const mood = getSpendingMood(todaySpent, avgDaily)
      
      await message.reply(
        `${mood.emoji} *Spending Mood: ${mood.text}*\n\n` +
        `💸 Hari ini: ${formatCurrency(todaySpent)}\n` +
        `📊 Rata-rata harian: ${formatCurrency(Math.round(avgDaily))}\n\n` +
        `_${todaySpent < avgDaily ? 'Good job! Kamu hemat hari ini! 🎉' : 'Coba kurangi pengeluaran ya!'}_`
      )
    }
    // === RANDOM TIP ===
    else if (command.type === 'RANDOM_TIP') {
      const tip = getRandomTip()
      await message.reply(tip)
    }
    else if (command.type === 'HELP') {
      await message.reply(HELP_MESSAGE)
    }
    // UNKNOWN - silently ignore or respond
    
  } catch (error) {
    console.error('Error:', error)
    await message.reply('❌ Terjadi kesalahan. Coba lagi nanti.')
  }
})

// =====================================
// ADDITIONAL COMMAND HANDLERS
// =====================================

// Handler for !chart command
client.on('message', async (message) => {
  if (message.type !== 'chat') return
  if (message.from.includes('@g.us')) return
  
  const phone = message.from.replace('@c.us', '')
  const text = message.body.trim().toLowerCase()
  const session = activeSessions.get(phone)
  
  if (!session) return
  
  try {
    // === COMMAND: !chart ===
    if (text === '!chart' || text === '!grafik') {
      await message.reply('⏳ Generating chart...')
      
      // Get active period
      const { data: period } = await supabase
        .from('budget_periods')
        .select('tanggal_mulai, tanggal_selesai')
        .eq('user_id', session.userId)
        .eq('is_active', true)
        .single()
      
      // Get transactions
      let query = supabase
        .from('transactions')
        .select('harga, kategori')
        .eq('user_id', session.userId)
        .eq('type', 'expense')
      
      if (period) {
        query = query
          .gte('tanggal_transaksi', period.tanggal_mulai)
          .lte('tanggal_transaksi', period.tanggal_selesai)
      }
      
      const { data: txs } = await query
      
      if (!txs || txs.length === 0) {
        await message.reply('❌ Belum ada data transaksi untuk chart.')
        return
      }
      
      // Group by category
      const byCategory = {}
      txs.forEach(t => {
        byCategory[t.kategori] = (byCategory[t.kategori] || 0) + Number(t.harga)
      })
      
      // Generate chart
      const chartBuffer = await generatePieChart(byCategory)
      const media = new MessageMedia('image/png', chartBuffer.toString('base64'), 'chart.png')
      
      await message.reply(media, undefined, { 
        caption: `📊 *Grafik Pengeluaran*\n📅 ${period?.tanggal_mulai || 'Semua'} - ${period?.tanggal_selesai || 'Waktu'}` 
      })
    }
    
    // === COMMAND: !export ===
    else if (text === '!export' || text.startsWith('!export ')) {
      await message.reply('⏳ Generating Excel...')
      
      // Get active period
      const { data: period } = await supabase
        .from('budget_periods')
        .select('tanggal_mulai, tanggal_selesai')
        .eq('user_id', session.userId)
        .eq('is_active', true)
        .single()
      
      // Get transactions
      let query = supabase
        .from('transactions')
        .select('tanggal_transaksi, nama_belanja, kategori, harga')
        .eq('user_id', session.userId)
        .eq('type', 'expense')
        .order('tanggal_transaksi', { ascending: false })
      
      if (period) {
        query = query
          .gte('tanggal_transaksi', period.tanggal_mulai)
          .lte('tanggal_transaksi', period.tanggal_selesai)
      }
      
      const { data: txs } = await query
      
      if (!txs || txs.length === 0) {
        await message.reply('❌ Belum ada data transaksi untuk export.')
        return
      }
      
      // Generate Excel
      const { filePath, fileName } = await generateExcel(txs, period)
      const media = MessageMedia.fromFilePath(filePath)
      
      await message.reply(media, undefined, { 
        caption: `📂 *Laporan Transaksi*\n📊 ${txs.length} transaksi\n💰 Total: ${formatCurrency(txs.reduce((s,t) => s + Number(t.harga), 0))}` 
      })
      
      // Cleanup temp file
      fs.unlinkSync(filePath)
    }
    
    // === COMMAND: !stats ===
    else if (text === '!stats' || text === '!xp' || text === '!level') {
      // Get user stats from database (or calculate from transactions)
      const { data: txs } = await supabase
        .from('transactions')
        .select('harga')
        .eq('user_id', session.userId)
        .eq('type', 'expense')
      
      const totalTransactions = txs?.length || 0
      const totalXP = txs?.reduce((sum, t) => sum + calculateXP(Number(t.harga)), 0) || 0
      const levelInfo = getLevel(totalXP)
      
      const progressBar = levelInfo.nextXP 
        ? '█'.repeat(Math.floor((totalXP / levelInfo.nextXP) * 10)) + '░'.repeat(10 - Math.floor((totalXP / levelInfo.nextXP) * 10))
        : '██████████'
      
      await message.reply(
        `🎮 *Statistik Gamifikasi*\n\n` +
        `⭐ Level: *${levelInfo.level}* (${levelInfo.name})\n` +
        `✨ XP: *${totalXP}*${levelInfo.nextXP ? ` / ${levelInfo.nextXP}` : ' (MAX)'}\n` +
        `[${progressBar}]\n\n` +
        `📝 Total Transaksi: ${totalTransactions}\n` +
        `💡 _Setiap transaksi = XP!_`
      )
    }
    
    // === COMMAND: !alert on/off ===
    else if (text === '!alert on') {
      session.alertEnabled = true
      activeSessions.set(phone, session)
      await message.reply('🔔 *Notifikasi Budget AKTIF*\n\nKamu akan menerima peringatan jika budget hampir habis.')
    }
    else if (text === '!alert off') {
      session.alertEnabled = false
      activeSessions.set(phone, session)
      await message.reply('🔕 *Notifikasi Budget NONAKTIF*')
    }
    
  } catch (error) {
    console.error('Command error:', error)
  }
})

// =====================================
// SMART ALERTS (CRON JOB)
// =====================================
// Run every day at 8:00 AM
cron.schedule('0 8 * * *', async () => {
  console.log('⏰ Running daily budget alert check...')
  
  for (const [phone, session] of activeSessions) {
    if (!session.alertEnabled) continue
    
    try {
      // Get active period
      const { data: period } = await supabase
        .from('budget_periods')
        .select('budget_bulanan, tanggal_mulai, tanggal_selesai')
        .eq('user_id', session.userId)
        .eq('is_active', true)
        .single()
      
      if (!period) continue
      
      // Get total spent
      const { data: txs } = await supabase
        .from('transactions')
        .select('harga')
        .eq('user_id', session.userId)
        .eq('type', 'expense')
        .gte('tanggal_transaksi', period.tanggal_mulai)
        .lte('tanggal_transaksi', period.tanggal_selesai)
      
      const spent = txs?.reduce((sum, t) => sum + Number(t.harga), 0) || 0
      const budget = Number(period.budget_bulanan)
      const percentage = Math.round((spent / budget) * 100)
      
      // Send alert if > 80%
      if (percentage >= 90) {
        await client.sendMessage(`${phone}@c.us`, 
          `🚨 *PERINGATAN BUDGET!*\n\n` +
          `Budget kamu sudah terpakai *${percentage}%*!\n` +
          `💰 Sisa: ${formatCurrency(budget - spent)}\n\n` +
          `_Hemat-hemat ya!_ 💪`
        )
      } else if (percentage >= 80) {
        await client.sendMessage(`${phone}@c.us`, 
          `⚠️ *Hati-hati!*\n\n` +
          `Budget sudah terpakai *${percentage}%*\n` +
          `💰 Sisa: ${formatCurrency(budget - spent)}\n\n` +
          `_Pertimbangkan pengeluaran berikutnya!_`
        )
      }
    } catch (error) {
      console.error(`Alert error for ${phone}:`, error)
    }
  }
})

// =====================================
// BILL REMINDER CHECK (CRON JOB)
// =====================================
// Run every day at 8:00 AM - check if today matches any reminder day
cron.schedule('0 8 * * *', async () => {
  const today = new Date().getDate() // Get day of month (1-31)
  console.log(`⏰ Checking bill reminders for day ${today}...`)
  
  for (const [phone, reminders] of userReminders) {
    for (const reminder of reminders) {
      if (reminder.day === today) {
        try {
          await client.sendMessage(`${phone}@c.us`, 
            `🔔 *Pengingat Tagihan*\n\n` +
            `📝 *${reminder.name}*\n` +
            `📅 Hari ini tanggal ${today}\n\n` +
            `_Jangan lupa bayar ya!_ 💸`
          )
          console.log(`📣 Sent reminder: ${reminder.name} to ${phone}`)
        } catch (error) {
          console.error(`Reminder error for ${phone}:`, error)
        }
      }
    }
  }
})

// =====================================
// DAILY SUMMARY (CRON JOB)
// =====================================
// Run every day at 9:00 PM (21:00)
cron.schedule('0 21 * * *', async () => {
  const today = new Date().toISOString().split('T')[0]
  console.log(`⏰ Running daily summary for ${today}...`)
  
  for (const [phone, session] of activeSessions) {
    if (!session.alertEnabled) continue
    
    try {
      // Get today's transactions
      const { data: txs } = await supabase
        .from('transactions')
        .select('nama_belanja, harga, kategori')
        .eq('user_id', session.userId)
        .eq('tanggal_transaksi', today)
        .eq('type', 'expense')
      
      if (!txs || txs.length === 0) continue
      
      const total = txs.reduce((sum, t) => sum + Number(t.harga), 0)
      
      // Group by category
      const byCategory = {}
      txs.forEach(t => {
        byCategory[t.kategori] = (byCategory[t.kategori] || 0) + Number(t.harga)
      })
      
      let categoryList = ''
      Object.entries(byCategory)
        .sort((a, b) => b[1] - a[1])
        .forEach(([cat, amt]) => {
          categoryList += `• ${cat}: ${formatCurrency(amt)}\n`
        })
      
      await client.sendMessage(`${phone}@c.us`, 
        `📊 *Ringkasan Hari Ini*\n` +
        `📅 ${today}\n\n` +
        `📝 Transaksi: ${txs.length}\n` +
        `💰 Total: *${formatCurrency(total)}*\n\n` +
        `*Per Kategori:*\n${categoryList}\n` +
        `_Selamat malam!_ 🌙`
      )
      console.log(`📊 Sent daily summary to ${phone}`)
    } catch (error) {
      console.error(`Daily summary error for ${phone}:`, error)
    }
  }
})

// =====================================
// GOOD MORNING MESSAGE (CRON JOB)
// =====================================
// Run every day at 7:00 AM
cron.schedule('0 7 * * *', async () => {
  console.log(`☀️ Sending good morning messages...`)
  
  for (const [phone, session] of activeSessions) {
    if (!session.alertEnabled) continue
    
    try {
      // Get budget info
      const { data: period } = await supabase
        .from('budget_periods')
        .select('budget_bulanan, tanggal_mulai, tanggal_selesai')
        .eq('user_id', session.userId)
        .eq('is_active', true)
        .single()
      
      if (!period) continue
      
      const { data: txs } = await supabase
        .from('transactions')
        .select('harga')
        .eq('user_id', session.userId)
        .eq('type', 'expense')
        .gte('tanggal_transaksi', period.tanggal_mulai)
        .lte('tanggal_transaksi', period.tanggal_selesai)
      
      const spent = txs?.reduce((s, t) => s + Number(t.harga), 0) || 0
      const remaining = Number(period.budget_bulanan) - spent
      
      const challenge = getDailyChallenge()
      
      await client.sendMessage(`${phone}@c.us`, 
        `☀️ *Selamat Pagi!*\n\n` +
        `💰 Sisa budget: *${formatCurrency(remaining)}*\n\n` +
        `🎯 *Tantangan Hari Ini:*\n"${challenge.text}"\n\n` +
        `_Semangat jalani hari ini!_ 💪`
      )
      console.log(`☀️ Sent morning message to ${phone}`)
    } catch (error) {
      console.error(`Morning message error for ${phone}:`, error)
    }
  }
})

// =====================================
// EVENING TIPS (CRON JOB)
// =====================================
// Run every day at 6:00 PM
cron.schedule('0 18 * * *', async () => {
  console.log(`🌅 Sending evening tips...`)
  
  for (const [phone, session] of activeSessions) {
    if (!session.alertEnabled) continue
    
    try {
      const tip = getRandomTip()
      
      await client.sendMessage(`${phone}@c.us`, 
        `🌅 *Tips Sore*\n\n` +
        `${tip}\n\n` +
        `_Sudah catat pengeluaran hari ini?_`
      )
      console.log(`🌅 Sent evening tip to ${phone}`)
    } catch (error) {
      console.error(`Evening tip error for ${phone}:`, error)
    }
  }
})

// =====================================
// START BOT
// =====================================
console.log('\n🚀 Starting WhatsApp Budget Bot...')
console.log('📁 Auth data:', './.wwebjs_auth')
console.log('📊 Features: Chart, Export, Gamification, Smart Alerts, Reminders')
console.log('🎮 Gamification: Challenges, Health Score, Mood, Tips')
console.log('⏰ Cron Jobs:')
console.log('   - 07:00: Good Morning + Challenge')
console.log('   - 08:00: Budget Alert + Bill Reminders')
console.log('   - 18:00: Evening Tips')
console.log('   - 21:00: Daily Summary')
console.log('')

client.initialize()
