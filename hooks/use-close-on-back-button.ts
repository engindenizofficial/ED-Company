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
  // true ise bu panel için AYRI bir history girdisi eklenmedi (bkz. pushPanel)
  // — popPanel bu durumda history.back() çağırmamalı, aksi halde kullanıcıyı
  // sitenin dışına ya da ilgisiz bir önceki sayfaya fırlatabilir.
  noHistoryEntry?: boolean
  // Bu panel push edildiği anda `realPushCount` kaçtı — bkz. aşağıdaki
  // `realPushCount` açıklaması ve `popPanel`'deki kullanımı.
  realPushCountAtPush: number
}

const stack: StackEntry[] = []
let nextId = 0
let listenerAttached = false

// GERÇEK (bizim panellerimiz DIŞINDA) bir sayfa geçişi (örn. kullanıcı bir
// menü linkine tıklayıp router.push ile başka bir sayfaya geçtiğinde) her
// pushState çağrısında bir artar. Bunu, bir panel açıkken üstüne GERÇEKTEN
// yeni bir sayfa geçişi binip binmediğini anlamak için kullanıyoruz.
//
// Önceden bunun için `window.history.state` içine koyduğumuz `__panelId`
// işaretini push anındaki durumla karşılaştırıyorduk. Ama Next.js'in App
// Router'ı, o entry hâlâ ekranda "üstteyken" bile — scroll/route-cache
// senkronizasyonu gibi kendi iç işleri için — mevcut history girdisinin
// state'ini `history.replaceState` ile SESSİZCE kendi (bizim __panelId'imizi
// İÇERMEYEN) nesnesiyle değiştirebiliyor. Bu durumda `window.history.state`
// okuması bizim koyduğumuz işareti bulamıyor ve panel programatik olarak
// (X butonu) kapatılırken `history.back()` HİÇ çağrılmıyordu — adres çubuğu
// bir alt paneldeki (ya da hiç panel yoksa ana sayfadaki) URL'e asla geri
// dönmüyor, en son açılan panelin URL'inde asılı kalıyordu. `replaceState`
// çağrıları `history.length`'i DEĞİŞTİRMEDİĞİ için, gerçek navigasyonu
// (`pushState` ile yeni bir girdi ekleyen) ayırt etmek için kendi sayacımızı
// tutuyoruz — Next.js'in state nesnesini ezmesinden etkilenmiyor.
let realPushCount = 0

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

  // `window.history.pushState`'i sarmalıyoruz: bizim kendi panel
  // girdilerimiz (state'inde `__panel: true` olanlar) DIŞINDA yapılan her
  // pushState çağrısı (örn. Next.js router'ının gerçek bir sayfa geçişi
  // yaparken yaptığı pushState) `realPushCount`'u bir artırır. Next.js'in
  // aynı entry üzerinde yaptığı `replaceState` çağrıları (iç senkronizasyon
  // amaçlı, gerçek bir navigasyon OLMAYAN) bu sarmalamaya dokunmuyor —
  // dolayısıyla onlardan etkilenmiyoruz. Böylece `popPanel`, `history.state`
  // içeriğine güvenmek zorunda kalmadan "üstümde gerçekten yeni bir sayfa
  // geçişi oldu mu" sorusunu güvenilir şekilde cevaplayabiliyor.
  const originalPushState = window.history.pushState.bind(window.history)
  window.history.pushState = function patchedPushState(
    data: unknown,
    unused: string,
    url?: string | URL | null,
  ) {
    const isOurs = !!data && typeof data === "object" && (data as { __panel?: boolean }).__panel === true
    if (!isOurs) realPushCount++
    return originalPushState(data, unused, url)
  }
}

function pushPanel(onPop: () => void, url?: string): number {
  ensureListener()
  const id = ++nextId

  // Adres çubuğu ZATEN bu URL'deyse (örn. /oyuncu/123 sayfası doğrudan
  // ziyaret/yenilendi ve panel açılırken kendi URL'ini "push" etmeye
  // çalışıyor) yeni bir history girdisi EKLEMİYORUZ. Aksi halde aynı URL'e
  // sahip iki ayrı girdi oluşur ve X butonuyla kapatırken history.back()
  // ikinci (bizim eklediğimiz) girdiden ilk (SSR yüklemesinin kendi) girdiye
  // döner — ikisi de aynı URL olduğu için adres çubuğu hiç değişmemiş gibi
  // görünür ve panel kapanmış boş bir sayfa kalır. Bu durumda URL'i geri
  // "/" yapmak tamamen çağıran component'e (bkz. *-url-opener.tsx'teki
  // router.replace) bırakılır.
  const alreadyAtUrl = typeof window !== "undefined" && !!url && window.location.pathname === url
  if (typeof window !== "undefined" && url && !alreadyAtUrl) {
    // url verildiyse (örn. "/oyuncu/123") adres çubuğu da güncellenir —
    // böylece panel paylaşılabilir/yenilenebilir bir bağlantıya sahip olur.
    // Next.js App Router, native pushState/replaceState çağrılarını
    // usePathname() üzerinden algılar; bu yüzden bu URL değişikliği ayrı bir
    // sayfa render'ı TETİKLEMEZ, sadece adres çubuğunu günceller.
    window.history.pushState({ __panel: true, __panelId: id }, "", url)
  } else if (typeof window !== "undefined" && !alreadyAtUrl) {
    window.history.pushState({ __panel: true, __panelId: id }, "")
  }

  stack.push({ id, onPop, noHistoryEntry: alreadyAtUrl, realPushCountAtPush: realPushCount })
  return id
}

function popPanel(id: number, closedByBack: boolean) {
  const idx = stack.findIndex((e) => e.id === id)
  const entry = idx !== -1 ? stack[idx] : undefined
  if (idx !== -1) stack.splice(idx, 1)
  if (closedByBack || entry?.noHistoryEntry || typeof window === "undefined") return

  // Panel geri tuşuyla değil de programatik olarak (X butonu, overlay
  // tıklama, ESC, sayfa geçişi vb.) kapatıldıysa, açılırken eklediğimiz
  // sanal history girdisini de geri alıyoruz. Aksi halde her panel
  // açılışında history yığınına bir girdi birikir ve kullanıcı geri tuşuna
  // defalarca basmak zorunda kalır.
  //
  // ÖNEMLİ: Bunu yalnızca panel açıkken üstüne GERÇEKTEN yeni bir sayfa
  // geçişi binmediyse yapıyoruz. Panel açıkken kullanıcı gerçek bir sayfa
  // geçişi yaparsa (örn. Ana Sayfa'dan "Oyunlar" sekmesine geçerse), Next.js
  // kendi history girdisini bizim sanal girdimizin ÜSTÜNE ekler. Bu durumda
  // history.back() çağırmak, bizim girdimizi değil, kullanıcının az önce
  // yaptığı gerçek navigasyonu geri alır — kullanıcıyı beklenmedik şekilde
  // önceki sayfaya fırlatır. Bu yüzden `realPushCount`'un bu panel push
  // edildiğinden beri değişip değişmediğini kontrol ediyoruz (bkz.
  // `ensureListener`'daki `pushState` sarmalaması). Önceden bunun için
  // `window.history.state`'e bakıyorduk, ama Next.js'in App Router'ı bu
  // entry üzerinde kendi iç senkronizasyonu için `replaceState` çağırıp
  // state'i sessizce eziyor, bu da bu kontrolü güvenilmez kılıyordu.
  if (realPushCount === entry?.realPushCountAtPush) {
    ignoreNextPopstateCount++
    window.history.back()
  }
}

/**
 * @param isOpen Panel/modal şu an ekranda mı?
 * @param onClose Panel'i kapatan fonksiyon (geri tuşuna basıldığında çağrılır)
 * @param url Panel açıkken adres çubuğunda gösterilecek paylaşılabilir URL
 *   (örn. "/oyuncu/123"). Verilmezse adres çubuğu değişmez (eski davranış).
 */
export function useCloseOnBackButton(isOpen: boolean, onClose: () => void, url?: string) {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  // url her render'da değişebileceği için (örn. panel state'i yeni veriyle
  // güncellenince) ref'te tutup sadece isOpen false->true geçişinde okuyoruz.
  const urlRef = useRef(url)
  urlRef.current = url

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
      }, urlRef.current)
    }
    return () => {
      if (idRef.current !== null) {
        popPanel(idRef.current, closedByBackRef.current)
        idRef.current = null
      }
    }
  }, [isOpen])
}
