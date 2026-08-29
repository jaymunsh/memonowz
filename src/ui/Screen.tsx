import type { ReactNode } from 'react'
import './Screen.css'

export const Screen = ({ title, back, logo, action, children, foot }: {
  title: string
  /** 있으면 상단 왼쪽에 뒤로가기가 뜬다 */
  back?: () => void
  /** 뒤로가기가 없는 최상위 화면에서 왼쪽에 앱 아이콘을 띄운다 */
  logo?: boolean
  /** 상단 오른쪽 (설정, 편집 등) */
  action?: ReactNode
  children: ReactNode
  /** 하단 고정 영역. 긴 본문에서도 늘 보인다 */
  foot?: ReactNode
}) => (
  <div className="screen">
    <header className="screen__bar">
      {back
        ? <button type="button" className="screen__back" onClick={back} aria-label="뒤로">‹</button>
        : logo
          ? <img className="screen__logo" src="/icon.svg" alt="" width="26" height="26" />
          : <span className="screen__back" aria-hidden="true" />}
      <h1 className="screen__title">{title}</h1>
      <div className="screen__action">{action}</div>
    </header>
    <main className="screen__body">{children}</main>
    {foot && <footer className="screen__foot">{foot}</footer>}
  </div>
)
