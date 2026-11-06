// Fetches the latest exchange rate for a currency pair.
export async function fetchRate(pair, fetchImpl = fetch) {
  const response = await fetchImpl(`https://rates.example.com/v1/${pair}`);
  if (!response.ok) throw new Error(`rate request failed: ${response.status}`);
  const body = await response.json();
  return body.rate;
}
