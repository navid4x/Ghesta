"use client"

import React, { Component, ErrorInfo, ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { AlertCircle } from "lucide-react"

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    }
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[ErrorBoundary] Caught error:", error, errorInfo)
    
    this.setState({
      error,
      errorInfo,
    })

    // Report to error tracking service
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', 'exception', {
        description: error.message,
        fatal: false,
      })
    }
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="flex min-h-screen items-center justify-center p-4 bg-gradient-to-br from-background via-background to-primary/5">
          <Card className="max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-3 text-destructive">
              <AlertCircle className="h-8 w-8" />
              <h2 className="text-xl font-bold">خطایی رخ داده است</h2>
            </div>
            
            <p className="text-muted-foreground">
              متأسفانه مشکلی پیش آمده است. لطفاً دوباره تلاش کنید.
            </p>

            {process.env.NODE_ENV === 'development' && this.state.error && (
              <div className="mt-4 p-4 bg-destructive/10 rounded-lg">
                <p className="text-sm font-mono text-destructive break-all">
                  {this.state.error.message}
                </p>
                {this.state.errorInfo && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-sm text-muted-foreground">
                      جزئیات بیشتر
                    </summary>
                    <pre className="mt-2 text-xs overflow-auto max-h-40">
                      {this.state.errorInfo.componentStack}
                    </pre>
                  </details>
                )}
              </div>
            )}

            <div className="flex gap-2">
              <Button onClick={this.handleReset} className="flex-1">
                تلاش مجدد
              </Button>
              <Button
                onClick={() => window.location.reload()}
                variant="outline"
                className="flex-1"
              >
                بارگذاری مجدد صفحه
              </Button>
            </div>
          </Card>
        </div>
      )
    }

    return this.props.children
  }
}

declare global {
  interface Window {
    gtag?: (...args: any[]) => void
  }
}
