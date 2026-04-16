import { useState, useRef, useCallback, type DragEvent, type ChangeEvent } from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Select } from './ui/Select';
import { ImportReviewTable } from './ImportReviewTable';
import { usePdfImport } from '../hooks/usePdfImport';

interface PdfImportWizardProps {
  open: boolean;
  onClose: () => void;
}

const MERGE_STRATEGY_OPTIONS = [
  { value: 'add_new', label: 'Add new holdings only' },
  { value: 'update_existing', label: 'Update existing holdings only' },
  { value: 'add_all', label: 'Add & update all' },
];

function UploadStep({
  onUpload,
  error,
}: {
  onUpload: (file: File) => void;
  error: string | null;
}) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File) => {
    if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
      setSelectedFile(file);
    }
  }, []);

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleUploadClick = useCallback(() => {
    if (selectedFile) onUpload(selectedFile);
  }, [selectedFile, onUpload]);

  return (
    <div className="pdf-import-upload">
      <div
        className={`pdf-import-upload__zone${isDragging ? ' pdf-import-upload--dragging' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="pdf-import-upload__icon" aria-hidden="true">↑</div>
        <p className="pdf-import-upload__text">Drop your PDF here</p>
        <p className="pdf-import-upload__separator">or</p>
        <Button
          variant="secondary"
          size="sm"
          type="button"
          onClick={() => fileInputRef.current?.click()}
        >
          Browse files
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          style={{ display: 'none' }}
          onChange={handleInputChange}
          aria-label="Select PDF file"
        />
      </div>

      {selectedFile && (
        <p className="pdf-import-upload__filename">
          Selected: <strong>{selectedFile.name}</strong>
        </p>
      )}

      {error && <p className="pdf-import-upload__error">{error}</p>}

      <Button
        variant="primary"
        onClick={handleUploadClick}
        disabled={!selectedFile}
        className="pdf-import-upload__submit"
      >
        Upload &amp; Extract
      </Button>
    </div>
  );
}

function ProcessingStep() {
  return (
    <div className="pdf-import-processing">
      <h3 className="pdf-import-processing__heading">Processing your statement...</h3>
      <ul className="pdf-import-processing__stages">
        <li className="pdf-import-processing__stage pdf-import-processing__stage--active">
          Reading PDF...
        </li>
        <li className="pdf-import-processing__stage">Extracting holdings...</li>
        <li className="pdf-import-processing__stage">Verifying symbols...</li>
      </ul>
      <div className="pdf-import-processing__spinner" aria-label="Loading" />
    </div>
  );
}

function ConfirmingStep() {
  return (
    <div className="pdf-import-processing">
      <h3 className="pdf-import-processing__heading">Importing holdings...</h3>
      <div className="pdf-import-processing__spinner" aria-label="Loading" />
    </div>
  );
}

function DoneStep({
  summary,
  onClose,
}: {
  summary: { added: number; updated: number; skipped: number } | null;
  onClose: () => void;
}) {
  return (
    <div className="pdf-import-done">
      <h3 className="pdf-import-done__heading">Import Complete!</h3>
      {summary && (
        <ul className="pdf-import-done__summary">
          <li>{summary.added} holdings added</li>
          <li>{summary.updated} holdings updated</li>
          <li>{summary.skipped} holdings skipped</li>
        </ul>
      )}
      <Button variant="primary" onClick={onClose}>
        Close
      </Button>
    </div>
  );
}

export function PdfImportWizard({ open, onClose }: PdfImportWizardProps) {
  const {
    step,
    extractionResult,
    editedHoldings,
    selectedIds,
    mergeStrategy,
    importSummary,
    error,
    isVerifying,
    upload,
    updateHolding,
    toggleSelected,
    selectAll,
    deselectAll,
    setMergeStrategy,
    reverify,
    confirm,
    reset,
  } = usePdfImport();

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  // Determine modal title
  const titleMap: Record<string, string> = {
    idle: 'Import from PDF',
    uploading: 'Processing...',
    reviewing: 'Review Holdings',
    confirming: 'Importing...',
    done: 'Import Complete',
  };

  // In the reviewing step, prevent closing while confirming
  const isDismissable = step !== 'uploading' && step !== 'confirming';

  const handleModalClose = useCallback(() => {
    if (!isDismissable) return;
    handleClose();
  }, [isDismissable, handleClose]);

  return (
    <Modal open={open} onClose={handleModalClose} title={titleMap[step] ?? 'Import from PDF'}>
      {step === 'idle' && (
        <UploadStep onUpload={upload} error={error} />
      )}

      {step === 'uploading' && <ProcessingStep />}

      {step === 'reviewing' && (
        <div className="pdf-import-review">
          {extractionResult && (extractionResult.brokerName || extractionResult.statementDate) && (
            <div className="pdf-import-review__info-bar">
              {extractionResult.brokerName && (
                <span className="pdf-import-review__broker">
                  {extractionResult.brokerName}
                </span>
              )}
              {extractionResult.statementDate && (
                <span className="pdf-import-review__date">
                  {extractionResult.statementDate}
                </span>
              )}
            </div>
          )}

          {extractionResult && extractionResult.warnings.length > 0 && (
            <div className="pdf-import-review__warnings">
              <strong>Warnings:</strong>
              <ul>
                {extractionResult.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          <ImportReviewTable
            holdings={editedHoldings}
            selectedIds={selectedIds}
            onToggle={toggleSelected}
            onSelectAll={selectAll}
            onDeselectAll={deselectAll}
            onUpdate={updateHolding}
          />

          <div className="pdf-import-review__actions">
            <div className="pdf-import-review__verify-buttons">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => reverify()}
                disabled={isVerifying}
              >
                Re-verify All
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => reverify([...selectedIds])}
                disabled={selectedIds.size === 0 || isVerifying}
              >
                Re-verify Selected
              </Button>
            </div>

            <div className="pdf-import-review__import-controls">
              <Select
                label="Merge strategy"
                options={MERGE_STRATEGY_OPTIONS}
                value={mergeStrategy}
                onChange={(e) =>
                  setMergeStrategy(
                    e.target.value as 'add_new' | 'update_existing' | 'add_all'
                  )
                }
              />

              {error && <p className="pdf-import-review__error">{error}</p>}

              <Button
                variant="primary"
                onClick={confirm}
                disabled={selectedIds.size === 0 || isVerifying}
              >
                Import {selectedIds.size} Holding{selectedIds.size !== 1 ? 's' : ''}
              </Button>
            </div>
          </div>
        </div>
      )}

      {step === 'confirming' && <ConfirmingStep />}

      {step === 'done' && (
        <DoneStep summary={importSummary} onClose={handleClose} />
      )}
    </Modal>
  );
}
