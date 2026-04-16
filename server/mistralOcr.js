const MAX_TEXT_LENGTH = 100_000;

export async function runMistralOcr(pdfBuffer) {
  if (!process.env.MISTRAL_API_KEY) {
    throw { status: 503, message: 'Mistral OCR is not configured on the server.' };
  }

  const base64 = pdfBuffer.toString('base64');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);

  let response;
  try {
    response = await fetch('https://api.mistral.ai/v1/ocr', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'mistral-ocr-latest',
        document: {
          type: 'document_url',
          document_url: `data:application/pdf;base64,${base64}`,
        },
        include_image_base64: false,
      }),
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw { status: 504, message: 'Mistral OCR timed out after 60 seconds.' };
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const text = await response.text();
    throw { status: 502, message: `Mistral OCR failed: ${response.status} ${text}` };
  }

  const json = await response.json();
  const pages = json.pages ?? [];
  const warnings = [];

  const emptyPages = pages.filter((p) => !p.markdown || p.markdown.trim() === '');
  if (emptyPages.length > 0) {
    warnings.push(`${emptyPages.length} page(s) had empty markdown content.`);
  }

  let text = pages.map((p) => p.markdown ?? '').join('\n\n--- Page Break ---\n\n');

  if (text.length > MAX_TEXT_LENGTH) {
    text = text.slice(0, MAX_TEXT_LENGTH);
    warnings.push(`OCR text was truncated to ${MAX_TEXT_LENGTH} characters.`);
  }

  return {
    text,
    pageCount: pages.length,
    warnings,
  };
}
