"use client"

import { useEffect, useRef } from "react"

/**
 * Tam ekran panel/modal'lar (oyuncu, takım, lig kartları, giriş uyarısı vb.)
 * gerçek bir sayfa değişimi yapmıyor — sadece React state'i açıyor. Bu yüzden
 * özellikle mobilde tarayıcının/uygulamanın "geri" tuşuna basıldığında,
 * tarayıcı bunu "gösterilecek panel yok, siteden çık" olarak yorumluyor ve
 * kullanıcıyı doğrudan siteden dışarı atıyordu.
 *
 * Çözüm: panel açıldığında history'e "sanal" bir girdi ekliyoruz. Geri
 * tuşuna basıldığında tarayıcı bu girdiyi geri alır (popstate olayı) ve biz
 * bunu panели kapatmak için kullanırız — siteden çıkmak yerine yalnızca
 * panel kapanır. Panel X butonu/overlay tıklamasıyla kapatılırsa, eklediğimiz
 * sanal girdiyi de geri alıp history yığınının şişmesini önlüyoruz.
 *
 * Aynı anda birden fazla panel açık olabildiğinden (örn. takım panelinden bir
 * oyuncuya tıklanınca oyuncu paneli üstte açılır), global bir yığın (stack)
 * tutuyoruz: her geri tuşu basışı yalnızca en son açılan (en üstteki) paneli
 * kapatır — tarayıcının normal "en son giden geri gelir" davranışıyla aynı.
 */

interface StackEntry {
  id: number
  onPop: () => void
}

const stack: StackEntry[] = []
let nextId = 0
let listenerAttached = false

// popPanel() bir paneli PROGRAMATİK olarak (X butonu, overlay tıklama vb.)
// kapatırken, eklediğimiz sanal history girdisini temizlemek için kendi
// history.back() çağrısını yapar (bkz. popPanel). Ama bu çağrı da tarayıcının
// normal "geri tuşu" ile AYNI popstate olayını tetikler. Bu sayaç olmadan,
// popstate dinleyicisi bunu kullanıcının gerçek geri tuşu basışı sanıp
// stack'in (artık bizim panelimiz çıkarılmış olan) YENİ tepesindeki
// -tamamen ilgisiz- bir alttaki paneli yanlışlıkla kapatıyordu (örn. Takım
// panelinden açılan Oyuncu paneli X ile kapatılınca, altındaki Takım paneli
// de kapanıyordu). Kendi history.back() çağrımızdan gelecek popstate
// olaylarını burada sayıp yoksayarak, sadece gerçek kullanıcı geri tuşu
// basışları stack'i etkiler.
let ignoreNextPopstateCount = 0

function ensureListener() {
  if (listenerAttached || typeof window === "undefined") return
  listenerAttached = true
  window.addEventListener("popstate", () => {
    if (ignoreNextPopstateCount > 0) {
      ignoreNextPopstateCount--
      return
    }
    const top = stack.pop()
    top?.onPop()
  })
}

function pushPanel(onPop: () => void): number {
  ensureListener()
  const id = ++nextId
  if (typeof window !== "undefined") {
    window.history.pushState({ __panel: true, __panelId: id }, "")
  }
  stack.push({ id, onPop })
  return id
}

function popPanel(id: number, closedByBack: boolean) {
  const idx = stack.findIndex((e) => e.id === id)
  if (idx !== -1) stack.splice(idx, 1)
  if (closedByBack || typeof window === "undefined") return

  // Panel geri tuşuyla değil de programatik olarak (X butonu, overlay
  // tıklama, ESC, sayfa geçişi vb.) kapatıldıysa, açılırken eklediğimiz
  // sanal history girdisini de geri alıyoruz. Aksi halde her panel
  // açılışında history yığınına bir girdi birikir ve kullanıcı geri tuşuna
  // defalarca basmak zorunda kalır.
  //
  // ÖNEMLİ: Bunu yalnızca eklediğimiz sanal girdi HALA tarayıcı geçmişinin
  // en üstündeyse yapıyoruz. Panel açıkken kullanıcı gerçek bir sayfa
  // geçişi yaparsa (örn. Ana Sayfa'dan "Oyunlar" sekmesine geçerse), Next.js
  // kendi history girdisini bizim sanal girdimizin ÜSTÜNE ekler. Bu durumda
  // history.back() çağırmak, bizim girdimizi değil, kullanıcının az önce
  // yaptığı gerçek navigasyonu geri alır — kullanıcıyı beklenmedik şekilde
  // önceki sayfaya fırlatır. Bu yüzden önce en üstteki girdinin gerçekten
  // bizim panelimize ait olup olmadığını kontrol ediyoruz.
  const topState = window.history.state as { __panelId?: number } | null
  if (topState?.__panelId === id) {
    ignoreNextPopstateCount++
    window.history.back()
  }
}

/**
 * @param isOpen Panel/modal şu an ekranda mı?
 * @param onClose Panel'i kapatan fonksiyon (geri tuşuna basıldığında çağrılır)
 */
export function useCloseOnBackButton(isOpen: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  const idRef = useRef<number | null>(null)
  const closedByBackRef = useRef(false)

  // Tek bir effect: hem isOpen değişince (panel açılıp kapanınca) hem de
  // component tamamen kaldırılınca (örn. sayfa geçişi) aynı temizleme
  // mantığını çalıştırır. İki ayrı effect kullanmak, aynı panelId için
  // popPanel'in (ve dolayısıyla history.back()'in) iki kez tetiklenmesine
  // yol açıyordu — bu da geri tuşuna basıldığında sitenin dışına
  // (about:blank) çıkılmasına sebep oluyordu.
  useEffect(() => {
    if (isOpen) {
      closedByBackRef.current = false
      idRef.current = pushPanel(() => {
        closedByBackRef.current = true
        onCloseRef.current()
      })
    }
    return () => {
      if (idRef.current !== null) {
        popPanel(idRef.current, closedByBackRef.current)
        idRef.current = null
      }
    }
  }, [isOpen])
}
