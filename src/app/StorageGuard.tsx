import { useEffect, useState, type ReactNode } from 'react'
import { db } from '../db'
import './StorageGuard.css'

export const StorageGuard = ({ children }: { children: ReactNode }) => {
  const [blocked, setBlocked] = useState(false)

  useEffect(() => {
    db.open().catch(() => setBlocked(true))
  }, [])

  return (
    <>
      {blocked && (
        <p className="storage-warn" role="alert">
          이 브라우저에서 저장소를 쓸 수 없습니다. 프라이빗 모드에서는 덱과 학습 기록이 저장되지 않습니다.
        </p>
      )}
      {children}
    </>
  )
}
