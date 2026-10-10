import { Component, type ReactNode } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Logo } from '@/components/Logo'
import { BoardPage } from '@/pages/BoardPage'
import { ClassroomPage } from '@/pages/ClassroomPage'
import { HomePage } from '@/pages/HomePage'

export default function App() {
  return (
    <AppErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/c/:workspaceId" element={<ClassroomPage />} />
          <Route path="/b/:boardId" element={<BoardPage />} />
          <Route
            path="*"
            element={
              <div className="grid min-h-dvh place-items-center px-4 text-center">
                <div>
                  <Logo />
                  <h1 className="mt-6 font-serif text-3xl font-bold">找不到這個頁面</h1>
                  <a href="/" className="mt-4 inline-block text-sm text-leaf underline">
                    返回課室
                  </a>
                </div>
              </div>
            }
          />
        </Routes>
      </BrowserRouter>
    </AppErrorBoundary>
  )
}

class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="grid min-h-dvh place-items-center px-4 text-center">
          <div>
            <h1 className="font-serif text-3xl font-bold">頁面發生問題</h1>
            <p className="mt-3 text-sm text-ink/70">請重新整理。如果仍有問題，請老師再開一次連結。</p>
            <button type="button" className="mt-4 text-sm text-leaf underline" onClick={() => window.location.reload()}>
              重新整理
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
