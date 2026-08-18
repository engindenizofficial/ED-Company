import sharp from "sharp"

// Uygulamanın kendi logosunu (icon-512.png'deki parlayan futbol topu) kaynak
// alıp, Android durum çubuğunun kullanabileceği tek renkli (şeffaf zeminli,
// beyaz siluet) bir badge görseline dönüştürüyoruz. Android bu görseldeki
// alfa kanalını maske olarak kullanıp kendi rengiyle boyuyor, renk bilgisini
// tamamen atıyor - bu yüzden kaynağı luminance'a göre maskeliyoruz: parlak
// (beyaz top) alanlar tam opak beyaz, koyu (lacivert zemin) alanlar şeffaf
// oluyor. Ortadaki mavi parlama (glow) da luminance'a göre kısmi şeffaf
// kalıyor, böylece top şekli net bir siluet olarak çıkıyor.
const input = "public/icon-512.png"
const output = "public/badge-monochrome.png"
const size = 96 // Android badge önerilen boyut

async function run() {
  const { data, info } = await sharp(input)
    .resize(size, size, { fit: "cover" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const { width, height, channels } = info
  const out = Buffer.alloc(width * height * 4)

  for (let i = 0; i < width * height; i++) {
    const r = data[i * channels]
    const g = data[i * channels + 1]
    const b = data[i * channels + 2]
    const luminance = r * 0.299 + g * 0.587 + b * 0.114

    // Koyu lacivert zemini tamamen at, sadece top ve hafif parlamayı bırak.
    // Threshold'un altını sıfıra çekip gürültüyü/glow sızıntısını kesiyoruz.
    const threshold = 40
    const alpha = luminance <= threshold ? 0 : Math.round(((luminance - threshold) / (255 - threshold)) * 255)

    out[i * 4] = 255
    out[i * 4 + 1] = 255
    out[i * 4 + 2] = 255
    out[i * 4 + 3] = alpha
  }

  await sharp(out, { raw: { width, height, channels: 4 } }).png().toFile(output)
  console.log("badge oluşturuldu:", width, height)
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
