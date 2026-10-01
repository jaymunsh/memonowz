import { useEffect } from 'react'

/** 입력·모달·브라우저 단축키와 충돌하지 않는 학습용 키 처리. */
export const useStudyShortcuts = (enabled: boolean, onKey: (key: string) => boolean) => {
  useEffect(() => {
    if (!enabled) return
    const handle = (event: KeyboardEvent) => {
      if (event.repeat || event.isComposing || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return
      const target = event.target instanceof Element ? event.target : null
      if (target?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), dialog, [role="dialog"]')) return
      // Space는 포커스된 버튼·링크의 기본 동작을 유지한다.
      if (event.key === ' ' && target?.closest('button:not(:disabled), a, summary')) return
      if (onKey(event.key)) event.preventDefault()
    }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [enabled, onKey])
}
