import { useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Alert,
  ScrollView,
} from 'react-native'
import * as DocumentPicker from 'expo-document-picker'
import { apiPath } from '@shared/api/base'
import { authedFetch } from '@shared/api/http'
import {
  ExtractionResultSchema,
  type ExtractionResult,
  type ExtractedHolding,
  type ImportSummary,
} from '@shared/schemas/pdfImport'
import { confirmPdfImport, verifyImportSymbols } from '@shared/api/pdfImport'
import { useQueryClient } from '@tanstack/react-query'
import { portfolioQueryKey, ME_PORTFOLIO_SCOPE } from '@shared/api/portfolio'
import { priceSnapshotQueryKey } from '@shared/api/prices'

type Step = 'idle' | 'uploading' | 'reviewing' | 'confirming' | 'done'

export default function Import() {
  const queryClient = useQueryClient()
  const [step, setStep] = useState<Step>('idle')
  const [extractionResult, setExtractionResult] = useState<ExtractionResult | null>(null)
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setStep('idle')
    setExtractionResult(null)
    setImportSummary(null)
    setError(null)
  }

  const handlePickAndUpload = async () => {
    const res = await DocumentPicker.getDocumentAsync({
      type: 'application/pdf',
      copyToCacheDirectory: true,
    })

    if (res.canceled) return

    const asset = res.assets[0]
    if (!asset) return

    if ((asset.size ?? 0) > 20 * 1024 * 1024) {
      Alert.alert('File Too Large', 'PDF must be under 20 MB.')
      return
    }

    setStep('uploading')
    setError(null)

    try {
      // React Native FormData accepts { uri, name, type } as a file value
      const form = new FormData()
      form.append('file', {
        uri: asset.uri,
        name: asset.name ?? 'statement.pdf',
        type: asset.mimeType ?? 'application/pdf',
      } as unknown as Blob)

      const response = await authedFetch(apiPath('/me/portfolio/import/pdf'), {
        method: 'POST',
        body: form,
      })

      if (!response.ok) {
        let message = `HTTP ${response.status}`
        try {
          const json = await response.json()
          if (json?.message) message = json.message
        } catch {
          // ignore
        }
        throw new Error(message)
      }

      const result = ExtractionResultSchema.parse(await response.json())
      setExtractionResult(result)
      setStep('reviewing')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload PDF.')
      setStep('idle')
    }
  }

  const handleConfirm = async () => {
    if (!extractionResult) return

    setStep('confirming')
    setError(null)

    try {
      // Auto-select holdings with confidence >= 0.8, or all if none pass threshold
      const highConfidence = extractionResult.holdings.filter((h) => h.confidence >= 0.8)
      const toImport: ExtractedHolding[] =
        highConfidence.length > 0 ? highConfidence : extractionResult.holdings

      const holdingInputs = toImport.map((h) => ({
        symbol: h.symbol,
        name: h.name ?? h.suggestedName ?? undefined,
        assetType: h.assetType,
        market: h.market,
        quantity: h.quantity,
        avgCost: h.avgCost,
        costCurrency: h.costCurrency,
        quoteCurrency: h.quoteCurrency,
      }))

      const result = await confirmPdfImport(holdingInputs, 'add_new')
      queryClient.setQueryData(portfolioQueryKey(ME_PORTFOLIO_SCOPE), result.ledger)
      void queryClient.invalidateQueries({ queryKey: priceSnapshotQueryKey(ME_PORTFOLIO_SCOPE) })
      setImportSummary(result.summary)
      setStep('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to confirm import.')
      setStep('reviewing')
    }
  }

  const handleReverify = async () => {
    if (!extractionResult) return
    setError(null)

    try {
      const pairs = extractionResult.holdings.map((h) => ({
        symbol: h.symbol,
        market: h.market,
      }))
      await verifyImportSymbols(pairs)
      // Re-fetch extraction by re-uploading is not possible; just notify
      Alert.alert('Verify Complete', 'Symbol verification done. Proceed to confirm.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to verify symbols.')
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Import PDF Statement</Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {step === 'idle' && (
        <TouchableOpacity style={styles.button} onPress={handlePickAndUpload}>
          <Text style={styles.buttonText}>Select PDF</Text>
        </TouchableOpacity>
      )}

      {step === 'uploading' && (
        <View style={styles.statusRow}>
          <ActivityIndicator color="#2563eb" />
          <Text style={styles.statusText}>Uploading and extracting...</Text>
        </View>
      )}

      {step === 'reviewing' && extractionResult && (
        <View>
          <Text style={styles.subtitle}>
            {extractionResult.holdings.length} holding
            {extractionResult.holdings.length !== 1 ? 's' : ''} found
          </Text>
          {extractionResult.holdings.slice(0, 10).map((h, i) => (
            <View key={i} style={styles.holdingRow}>
              <Text style={styles.holdingSymbol}>{h.symbol}</Text>
              <Text style={styles.holdingDetail}>
                {h.market} · qty {h.quantity}
              </Text>
            </View>
          ))}
          {extractionResult.holdings.length > 10 && (
            <Text style={styles.dim}>
              ...and {extractionResult.holdings.length - 10} more
            </Text>
          )}
          <TouchableOpacity style={[styles.button, styles.secondaryButton]} onPress={handleReverify}>
            <Text style={styles.secondaryButtonText}>Verify Symbols</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.button} onPress={handleConfirm}>
            <Text style={styles.buttonText}>Confirm Import</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelButton} onPress={reset}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}

      {step === 'confirming' && (
        <View style={styles.statusRow}>
          <ActivityIndicator color="#2563eb" />
          <Text style={styles.statusText}>Importing holdings...</Text>
        </View>
      )}

      {step === 'done' && importSummary && (
        <View>
          <Text style={styles.success}>Import complete!</Text>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryRow}>
              Added: <Text style={styles.summaryValue}>{importSummary.added}</Text>
            </Text>
            <Text style={styles.summaryRow}>
              Updated: <Text style={styles.summaryValue}>{importSummary.updated}</Text>
            </Text>
            <Text style={styles.summaryRow}>
              Skipped: <Text style={styles.summaryValue}>{importSummary.skipped}</Text>
            </Text>
          </View>
          <TouchableOpacity style={styles.button} onPress={reset}>
            <Text style={styles.buttonText}>Import Another</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  content: { padding: 24, paddingBottom: 48 },
  title: { color: '#fff', fontSize: 24, fontWeight: 'bold', marginBottom: 24 },
  subtitle: { color: '#9ca3af', fontSize: 16, marginBottom: 16 },
  error: { color: '#ef4444', marginBottom: 16, fontSize: 14 },
  success: { color: '#22c55e', fontSize: 20, fontWeight: 'bold', marginBottom: 16 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 16 },
  statusText: { color: '#9ca3af', fontSize: 15 },
  button: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  secondaryButton: { backgroundColor: '#374151' },
  secondaryButtonText: { color: '#d1d5db', fontWeight: '500', fontSize: 16 },
  cancelButton: {
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#4b5563',
  },
  cancelButtonText: { color: '#6b7280', fontWeight: '500' },
  holdingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
    marginBottom: 4,
  },
  holdingSymbol: { color: '#fff', fontWeight: '600' },
  holdingDetail: { color: '#6b7280', fontSize: 13 },
  dim: { color: '#6b7280', fontSize: 13, marginBottom: 16 },
  summaryCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  summaryRow: { color: '#9ca3af', fontSize: 15, marginBottom: 6 },
  summaryValue: { color: '#fff', fontWeight: '600' },
})
