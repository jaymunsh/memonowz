import { useEffect, useState, type ReactNode } from 'react'
import { db } from '../db'
import { Button, EmptyState, Screen } from '../ui'
import './StorageGuard.css'

export const StorageGuard = ({ children }: { children: ReactNode }) => {
  const [status, setStatus] = useState<'loading' | 'ready' | 'blocked'>('loading')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let mounted = true
    setStatus('loading')
    db.open().then(() => { if (mounted) setStatus('ready') })
      .catch(() => { if (mounted) setStatus('blocked') })
    return () => { mounted = false }
  }, [attempt])
  if (status === 'loading') return <Screen title="Memonowz" logo><EmptyState>저장된 덱을 확인하는 중입니다.</EmptyState></Screen>
  if (status === 'blocked') return <Screen title="Memonowz" logo>
    <div className="storage-error" role="alert"><h2>저장소를 열 수 없습니다</h2>
      <p>덱과 학습 기록을 안전하게 저장하려면 브라우저 저장소를 사용할 수 있어야 합니다. 저장 공간이나 브라우저의 사이트 데이터 설정을 확인해 주세요.</p>
      <Button variant="primary" onClick={() => setAttempt((value) => value + 1)}>다시 시도</Button>
    </div>
  </Screen>
  return children
}
