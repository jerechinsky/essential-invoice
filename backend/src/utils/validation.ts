// Utility functions for validation

/**
 * Validates Czech IČO (Identification Number of an Organization)
 * IČO is 8 digits with a modulo 11 checksum
 */
export function validateIco(ico: string): { valid: boolean; error?: string } {
  // Validate format
  if (!/^\d{8}$/.test(ico)) {
    return { valid: false, error: 'IČO must be 8 digits' };
  }

  // Validate checksum (modulo 11)
  const weights = [8, 7, 6, 5, 4, 3, 2];
  let sum = 0;

  for (let i = 0; i < 7; i++) {
    sum += parseInt(ico[i]) * weights[i];
  }

  const remainder = sum % 11;
  let expectedLastDigit: number;

  if (remainder === 0) {
    expectedLastDigit = 1;
  } else if (remainder === 1) {
    expectedLastDigit = 0;
  } else {
    expectedLastDigit = 11 - remainder;
  }

  const isValid = parseInt(ico[7]) === expectedLastDigit;

  return {
    valid: isValid,
    error: isValid ? undefined : 'Invalid IČO checksum'
  };
}

/**
 * Validates email address format
 */
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Formats currency for display
 */
export function formatCurrency(amount: number, currency: string): string {
  if (currency === 'CZK') {
    return `${amount.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kč`;
  }
  return `${amount.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

/**
 * Generates SPAYD (Short Payment Descriptor) for QR code
 * Standard Czech QR payment format
 */
export function generateSpayd(
  accountNumber: string,
  bankCode: string,
  amount: number,
  currency: string,
  variableSymbol: string,
  message?: string
): string {
  // Convert to IBAN format
  const iban = czechAccountToIban(accountNumber, bankCode);

  let spayd = `SPD*1.0*ACC:${iban}*AM:${amount.toFixed(2)}*CC:${currency}`;

  if (variableSymbol) {
    spayd += `*X-VS:${variableSymbol}`;
  }

  if (message) {
    // Truncate and sanitize message
    const cleanMessage = message.slice(0, 60).replace(/[*]/g, '');
    spayd += `*MSG:${cleanMessage}`;
  }

  return spayd;
}

/**
 * Converts Czech bank account to IBAN format
 */
export function czechAccountToIban(accountNumber: string, bankCode: string): string {
  // Pad account number to 16 digits
  const paddedAccount = accountNumber.padStart(16, '0');

  // Czech IBAN: CZ + 2 check digits + bank code (4 digits) + account number (16 digits)
  const bban = bankCode.padStart(4, '0') + paddedAccount;

  // Calculate check digits
  // Move country code and '00' to end for calculation
  const checkString = bban + '1235' + '00'; // CZ = 12 35

  // Convert to big integer and calculate mod 97
  let remainder = 0;
  for (const char of checkString) {
    remainder = (remainder * 10 + parseInt(char)) % 97;
  }

  const checkDigits = (98 - remainder).toString().padStart(2, '0');

  return `CZ${checkDigits}${bban}`;
}

/**
 * Generates invoice number based on format.
 * Supported tokens: {YYYY}, {YY}, {MM}, {SEQ}, {SEQ2}, {SEQ3}, {SEQ4}
 */
export function generateInvoiceNumber(format: string, sequence: number, year: number, month: number = 1): string {
  return format
    .replace('{YYYY}', year.toString())
    .replace('{YY}', year.toString().slice(-2))
    .replace('{MM}', month.toString().padStart(2, '0'))
    .replace('{SEQ4}', sequence.toString().padStart(4, '0'))
    .replace('{SEQ3}', sequence.toString().padStart(3, '0'))
    .replace('{SEQ2}', sequence.toString().padStart(2, '0'))
    .replace('{SEQ}', sequence.toString());
}
