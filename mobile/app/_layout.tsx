import { useEffect } from 'react'
import { Alert } from 'react-native'
import { Stack, Redirect, SplashScreen } from 'expo-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { configureApiBase } from '@shared/api/base'
import { configureHttp } from '@shared/api/http'
import { authClient } from '../lib/auth-client'

// Polyfill window.alert for shared hooks that use it (window is undefined on RN)
if (typeof window === 'undefined' || !window.alert) {
  const alertFn = (msg: unknown) => Alert.alert('Error', String(msg))
  if (typeof window === 'undefined') {
    ;(global as Record<string, unknown>).window = { alert: alertFn }
  } else {
    window.alert = alertFn as typeof window.alert
  }
}

SplashScreen.preventAutoHideAsync()

configureApiBase({
  basePath: `${process.env.EXPO_PUBLIC_API_BASE_URL}/api`,
})

configureHttp({
  credentials: 'omit',
})

const queryClient = new QueryClient()

export default function RootLayout() {
  const { data: session, isPending } = authClient.useSession()

  useEffect(() => {
    if (!isPending) {
      SplashScreen.hideAsync()
    }
  }, [isPending])

  if (isPending) return null

  if (!session) {
    return <Redirect href="/(auth)/sign-in" />
  }

  return (
    <QueryClientProvider client={queryClient}>
      <Stack screenOptions={{ headerShown: false }} />
    </QueryClientProvider>
  )
}
