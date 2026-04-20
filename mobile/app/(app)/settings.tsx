import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView } from 'react-native'
import { useSettings } from '../../lib/api-hooks'
import { authClient } from '../../lib/auth-client'

const CURRENCIES = ['SAR', 'USD', 'EUR', 'GBP', 'JPY', 'AED', 'KWD', 'BHD', 'QAR', 'OMR']

export default function Settings() {
  const [settings, setSettings, { isLoading, isSaving, errorMessage }] = useSettings()

  const handleSignOut = async () => {
    await authClient.signOut()
  }

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#2563eb" />
      </View>
    )
  }

  if (errorMessage) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{errorMessage}</Text>
      </View>
    )
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionLabel}>Base Currency</Text>
      <View style={styles.currencyRow}>
        {CURRENCIES.map((cur) => (
          <TouchableOpacity
            key={cur}
            style={[styles.currencyBtn, settings.baseCurrency === cur && styles.active]}
            onPress={() => setSettings({ ...settings, baseCurrency: cur })}
            disabled={isSaving}
          >
            <Text style={[styles.currencyText, settings.baseCurrency === cur && styles.activeText]}>
              {cur}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {isSaving && (
        <View style={styles.savingRow}>
          <ActivityIndicator color="#2563eb" size="small" />
          <Text style={styles.savingText}>Saving...</Text>
        </View>
      )}
      <View style={styles.divider} />
      <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  content: { padding: 24 },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#111',
  },
  sectionLabel: {
    color: '#9ca3af',
    fontSize: 12,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  currencyRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 },
  currencyBtn: {
    backgroundColor: '#222',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  active: { backgroundColor: '#2563eb' },
  currencyText: { color: '#9ca3af', fontWeight: '500', fontSize: 14 },
  activeText: { color: '#fff' },
  savingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  savingText: { color: '#6b7280', fontSize: 13 },
  divider: { height: 1, backgroundColor: '#222', marginVertical: 24 },
  signOutBtn: {
    backgroundColor: '#1f1f1f',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ef4444',
  },
  signOutText: { color: '#ef4444', fontWeight: '600', fontSize: 16 },
  error: { color: '#ef4444' },
})
