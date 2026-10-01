import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button, Screen } from '../ui'

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('Memonowz 화면 오류', error, info.componentStack) }
  render() {
    if (this.state.failed) return <Screen title="Memonowz" logo><div className="storage-error" role="alert">
      <h2>화면을 표시하지 못했습니다</h2>
      <p>저장된 덱은 그대로 유지됩니다. 화면을 새로 열어 다시 시도해 주세요.</p>
      <Button variant="primary" onClick={() => window.location.assign('/')}>홈으로 다시 열기</Button>
    </div></Screen>
    return this.props.children
  }
}
