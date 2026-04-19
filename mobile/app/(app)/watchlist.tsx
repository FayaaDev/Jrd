import { useState } from 'react'
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native'
import { useWatchlist } from '../../lib/api-hooks'

export default function Watchlist() {
  const { watchlist, addWatchItem, removeWatchItem, isSaving, isLoading, errorMessage } =
    useWatchlist()
  const [symbol, setSymbol] = useState('')
  const [quoteCurrency, setQuoteCurrency] = useState('USD')

  const handleAdd = () => {
    if (!symbol.trim()) return
    addWatchItem({ symbol: symbol.trim().toUpperCase(), quoteCurrency: quoteCurrency.trim().toUpperCase() || 'USD' })
    setSymbol('')
  }

  if (isLoading) {
    return (
      <View style={styles.center}>
        <Text style={styles.dim}>Loading...</Text>
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
    <View style={styles.container}>
      <View style={styles.addRow}>
        <TextInput
          style={[styles.input, styles.symbolInput]}
          placeholder="Symbol (e.g. AAPL)"
          placeholderTextColor="#6b7280"
          value={symbol}
          onChangeText={setSymbol}
          autoCapitalize="characters"
          returnKeyType="done"
          onSubmitEditing={handleAdd}
        />
        <TextInput
          style={[styles.input, styles.currencyInput]}
          placeholder="USD"
          placeholderTextColor="#6b7280"
          value={quoteCurrency}
          onChangeText={setQuoteCurrency}
          autoCapitalize="characters"
          maxLength={3}
        />
        <TouchableOpacity style={styles.addButton} onPress={handleAdd} disabled={isSaving}>
          {isSaving ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.addButtonText}>Add</Text>
          )}
        </TouchableOpacity>
      </View>
      <FlatList
        data={watchlist}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.item}>
            <View>
              <Text style={styles.symbol}>{item.symbol}</Text>
              <Text style={styles.dim}>{item.quoteCurrency}</Text>
            </View>
            <TouchableOpacity
              onPress={() => removeWatchItem(item.symbol)}
              disabled={isSaving}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.removeText}>Remove</Text>
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.dim}>No items in watchlist yet.</Text>
          </View>
        }
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#111',
  },
  addRow: {
    flexDirection: 'row',
    padding: 16,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  input: {
    backgroundColor: '#222',
    color: '#fff',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
  },
  symbolInput: { flex: 1 },
  currencyInput: { width: 60, textAlign: 'center' },
  addButton: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    padding: 12,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 52,
  },
  addButtonText: { color: '#fff', fontWeight: '600' },
  item: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  symbol: { color: '#fff', fontWeight: '600', fontSize: 16 },
  dim: { color: '#6b7280', fontSize: 13, marginTop: 2 },
  removeText: { color: '#ef4444', fontWeight: '500' },
  empty: { padding: 32, alignItems: 'center' },
  error: { color: '#ef4444' },
})
