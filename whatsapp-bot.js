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
  
  // Transaction command
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
const activeSessions = new Map() // phone -> { userId, email, fullName, alertEnabled }

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

*Commands:*
• \`!login <email>\` - Login
• \`!logout\` - Logout
• \`!kategori\` - Lihat daftar kategori
• \`!hari\` - Transaksi hari ini
• \`!chart\` - Grafik pengeluaran 📊
• \`!export\` - Export Excel 📂
• \`!stats\` - Statistik XP & Level 🎮
• \`!alert on/off\` - Notifikasi budget
• \`!help\` - Bantuan

*Catat Transaksi:*
• "Makan 25k" (auto kategori)
• "Kado 50k #7" (manual: #7 = Lainnya)

*Query:*
• "Sisa budget?"
• "Total pengeluaran"
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
      '--disable-dev-shm-usage',  // ADD THIS
      '--disable-accelerated-2d-canvas',  // ADD THIS
      '--no-first-run',  // ADD THIS
      '--no-zygote',  // ADD THIS
      '--single-process',  // ADD THIS (use with caution)
      '--disable-gpu'  // ADD THIS
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
      
      const { error } = await supabase.from('transactions').insert({
        user_id: session.userId,
        nama_belanja,
        harga,
        kategori,
        tanggal_transaksi,
        type
      })
      
      if (error) {
        console.error('Insert error:', error)
        await message.reply('❌ Gagal menyimpan transaksi. Coba lagi.')
        return
      }
      
      console.log(`💰 Transaksi: ${nama_belanja} ${formatCurrency(harga)} (${session.email || session.fullName})`)
      
      await message.reply(
        `✅ *Tercatat!*\n\n` +
        `📝 ${nama_belanja}\n` +
        `💰 ${formatCurrency(harga)}\n` +
        `🏷️ ${kategori}\n` +
        `📅 ${tanggal_transaksi}`
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
// START BOT
// =====================================
console.log('\n🚀 Starting WhatsApp Budget Bot...')
console.log('📁 Auth data:', './.wwebjs_auth')
console.log('📊 Features: Chart, Export, Gamification, Smart Alerts')
console.log('')

client.initialize()
