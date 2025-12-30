# WhatsApp Budget Bot 📱💰

Bot WhatsApp untuk mencatat transaksi pengeluaran langsung dari chat. Terintegrasi dengan [Budget Tracker](https://github.com/yourusername/BudgetTracker).

## Features

- 💬 **Natural Language Input** - "Makan siang 25k"  
- 🏷️ **Auto Category Detection** - Deteksi kategori otomatis dari keyword
- #️⃣ **Manual Category** - Pilih kategori dengan index: "Kado 100k #7"
- 🔒 **Phone Whitelist** - Hanya nomor tertentu yang bisa akses
- 📊 **Query Budget** - Cek sisa budget & total pengeluaran

## Quick Start

```bash
# Install dependencies
npm install whatsapp-web.js qrcode-terminal dotenv @supabase/supabase-js

# Setup environment
cp .env.example .env
# Edit .env with your Supabase credentials

# Run
node whatsapp-bot.js
```

Scan QR code dengan WhatsApp → Done!

## Environment Variables

```env
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJxxx
SUPABASE_SERVICE_KEY=eyJxxx  # service_role key
ALLOWED_PHONES=6281234567890  # comma-separated
```

## Commands

| Command | Description |
|---------|-------------|
| `!login <email>` | Login dengan email |
| `!logout` | Logout |
| `!kategori` | Lihat daftar kategori |
| `!hari` | Transaksi hari ini |
| `!help` | Bantuan |

## Usage Examples

```
Makan siang 25k        → Makanan & Minuman (auto)
Bensin 50rb            → Transport (auto)
Beli kado 100k #7      → Lainnya (manual)
Sisa budget?           → Query sisa budget
```

## Categories

| Index | Category |
|-------|----------|
| #1 | Makanan & Minuman |
| #2 | Transport |
| #3 | Belanja Kebutuhan |
| #4 | Lifestyle |
| #5 | Kesehatan |
| #6 | Tagihan & Utang |
| #7 | Lainnya |

## Tech Stack

- [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js)
- [Supabase](https://supabase.com)
- Node.js

## License

MIT
