/**
 * Tam ekran panellerin başlığının üstünde gösterilen küçük "tut ve sürükle"
 * çubuğu. Sadece mobilde görünür (sm:hidden) — kullanıcıya panelin aşağı
 * kaydırılarak kapatılabileceğini görsel olarak ima eder.
 */
export function PanelDragHandle() {
  return (
    <div className="flex shrink-0 justify-center pt-2 pb-1 sm:hidden" aria-hidden="true">
      <div className="h-1.5 w-10 rounded-full bg-muted-foreground/25" />
    </div>
  )
}
