import { View, Text, FlatList, RefreshControl, StyleSheet } from 'react-native'
import { usePortfolio } from '../../lib/api-hooks'
import { fmtCurrency } from '@shared/lib/format'

export default function Holdings() {
  const { rows, summary, settings, isFetching, isLoading, errorMessage, refresh } = usePortfolio()

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
    <FlatList
      style={styles.list}
      data={rows}
      keyExtractor={(item) => item.id}
      refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refresh} />}
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.totalLabel}>Total Value</Text>
          <Text style={styles.totalValue}>
            {fmtCurrency(summary.totalMV ?? summary.totalCost, settings.baseCurrency)}
          </Text>
          {summary.totalPL !== undefined && (
            <Text style={[styles.totalPl, summary.totalPL >= 0 ? styles.gain : styles.loss]}>
              {summary.totalPL >= 0 ? '+' : ''}
              {fmtCurrency(summary.totalPL, settings.baseCurrency)} total P&L
            </Text>
          )}
        </View>
      }
      renderItem={({ item }) => (
        <View style={styles.row}>
          <View style={styles.rowLeft}>
            <Text style={styles.symbol}>{item.symbol}</Text>
            <Text style={styles.dim}>
              {item.market} · {item.assetType}
            </Text>
          </View>
          <View style={styles.rowRight}>
            <Text style={styles.value}>
              {fmtCurrency(item.marketValueBase ?? item.costBasisBase, settings.baseCurrency)}
            </Text>
            {item.unrealizedPL !== undefined && (
              <Text style={[styles.dim, item.unrealizedPL >= 0 ? styles.gain : styles.loss]}>
                {item.unrealizedPL >= 0 ? '+' : ''}
                {fmtCurrency(item.unrealizedPL, settings.baseCurrency)}
              </Text>
            )}
          </View>
        </View>
      )}
      ListEmptyComponent={
        <View style={styles.center}>
          <Text style={styles.dim}>No holdings yet.</Text>
        </View>
      }
    />
  )
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: '#111' },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#111',
    paddingTop: 80,
  },
  header: { padding: 24, borderBottomWidth: 1, borderBottomColor: '#222' },
  totalLabel: { color: '#6b7280', fontSize: 14 },
  totalValue: { color: '#fff', fontSize: 32, fontWeight: 'bold', marginTop: 4 },
  totalPl: { fontSize: 14, marginTop: 4 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  rowLeft: {},
  rowRight: { alignItems: 'flex-end' },
  symbol: { color: '#fff', fontWeight: '600', fontSize: 16 },
  value: { color: '#fff', fontSize: 16 },
  dim: { color: '#6b7280', fontSize: 13, marginTop: 2 },
  gain: { color: '#22c55e' },
  loss: { color: '#ef4444' },
  error: { color: '#ef4444' },
})
