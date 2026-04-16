const SYSTEM_PROMPT = `You are a financial document parser. Extract all investment holdings from this brokerage account statement.

For each holding extract:
- symbol: The ticker symbol exactly as shown (e.g., "AAPL", "2222", "8030"). For Saudi/Tadawul stocks, use the numeric symbol (e.g., "2222" not "أرامكو").
- name: The company/fund name in English. If only Arabic is available, transliterate it.
- assetType: One of "stock", "etf", "fund", "crypto", "cash", "other".
- market: The MIC code for the exchange. Use "XSAU" for Tadawul/Saudi Exchange, "XNAS" for NASDAQ, "XNYS" for NYSE, "ARCX" for NYSE Arca, "CRYPTO" for crypto, "MONEYMARKET" for money market funds. If unsure, use "UNKNOWN".
- quantity: Number of shares/units held. Must be a positive number.
- avgCost: Average cost per share/unit. If not available, use 0.
- totalCost: Total cost basis if shown in the statement. Use null if not shown.
- totalMarketValue: Current market value if shown. Use null if not shown.
- currentPrice: Current price per unit if shown. Use null if not shown.
- costCurrency: Currency of the cost (e.g., "SAR", "USD"). Default "SAR" for Tadawul, "USD" for US exchanges.
- quoteCurrency: Currency the asset is quoted in. Same logic as costCurrency.
- rawText: The original text row from the statement for this holding.

Also extract:
- brokerName: Name of the brokerage if identifiable. Null if unknown.
- statementDate: Date of the statement if shown (ISO 8601 format). Null if not found.
- accountNumber: Account number if shown (partially redacted is fine). Null if not shown.

If no holdings can be found, return an empty holdings array. Never fabricate data not present in the document.`;

const RESPONSE_FORMAT = {
  type: 'json_schema',
  json_schema: {
    name: 'brokerage_statement_extraction',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        brokerName: { type: ['string', 'null'] },
        statementDate: { type: ['string', 'null'] },
        accountNumber: { type: ['string', 'null'] },
        holdings: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              symbol: { type: 'string' },
              name: { type: ['string', 'null'] },
              assetType: { type: 'string', enum: ['stock', 'etf', 'fund', 'crypto', 'cash', 'other'] },
              market: { type: 'string' },
              quantity: { type: 'number' },
              avgCost: { type: 'number' },
              totalCost: { type: ['number', 'null'] },
              totalMarketValue: { type: ['number', 'null'] },
              currentPrice: { type: ['number', 'null'] },
              costCurrency: { type: 'string' },
              quoteCurrency: { type: 'string' },
              rawText: { type: 'string' },
            },
            required: [
              'symbol',
              'name',
              'assetType',
              'market',
              'quantity',
              'avgCost',
              'totalCost',
              'totalMarketValue',
              'currentPrice',
              'costCurrency',
              'quoteCurrency',
              'rawText',
            ],
            additionalProperties: false,
          },
        },
      },
      required: ['brokerName', 'statementDate', 'accountNumber', 'holdings'],
      additionalProperties: false,
    },
  },
};

export async function runOpenAiExtract(ocrText) {
  if (!process.env.OPENAI_API_KEY) {
    throw { status: 503, message: 'OpenAI extraction is not configured on the server.' };
  }

  const model = process.env.OPENAI_MODEL ?? 'gpt-4o-2024-08-06';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);

  let response;
  try {
    response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: RESPONSE_FORMAT,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: ocrText },
        ],
      }),
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw { status: 504, message: 'OpenAI extraction timed out after 60 seconds.' };
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const text = await response.text();
    throw { status: 502, message: `OpenAI extraction failed: ${response.status} ${text}` };
  }

  const json = await response.json();
  const choice = json.choices?.[0];

  if (choice?.finish_reason !== 'stop') {
    throw { status: 422, message: 'OpenAI refused to process this document.' };
  }

  return JSON.parse(choice.message.content);
}
