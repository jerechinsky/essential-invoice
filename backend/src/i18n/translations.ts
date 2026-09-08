export type Locale = 'cs' | 'en';

interface PdfTranslations {
  invoice: string;
  invoiceNumberShort: string;
  taxDocument: string;
  paymentMethod: string;
  paymentMethodTransfer: string;
  supplier: string;
  customer: string;
  issueDate: string;
  dueDate: string;
  description: string;
  quantity: string;
  unitPrice: string;
  total: string;
  subtotal: string;
  vat: string;
  exempt: string;
  reverseCharge: string;
  reverseChargeNotice: string;
  taxBase: string;
  taxPointDate: string;
  totalDue: string;
  paymentDetails: string;
  accountNumber: string;
  variableSymbol: string;
  amount: string;
  qrPayment: string;
  notes: string;
  issuedOn: string;
  nonVatPayer: string;
  exchangeRate: string;
  czkEquivalent: string;
}

interface EmailTranslations {
  invoiceSubject: string;
  defaultTemplate: string;
  supplierFallback: string;
  welcomeSubject: string;
  welcomeText: (userName: string) => string;
  welcomeHtml: (userName: string) => string;
  resetSubject: string;
  resetText: (userName: string, resetUrl: string) => string;
  resetHtml: (userName: string, resetUrl: string) => string;
}

interface Translations {
  pdf: PdfTranslations;
  email: EmailTranslations;
}

const translations: Record<Locale, Translations> = {
  cs: {
    pdf: {
      invoice: 'FAKTURA',
      invoiceNumberShort: 'č.',
      taxDocument: 'DAŇOVÝ DOKLAD',
      paymentMethod: 'Způsob platby',
      paymentMethodTransfer: 'Převodem',
      supplier: 'DODAVATEL',
      customer: 'ODBĚRATEL',
      issueDate: 'DATUM VYSTAVENÍ',
      dueDate: 'DATUM SPLATNOSTI',
      description: 'POPIS',
      quantity: 'MNOŽSTVÍ',
      unitPrice: 'CENA ZA JEDNOTKU',
      total: 'CELKEM',
      subtotal: 'Základ daně:',
      vat: 'DPH',
      exempt: 'Osvobozeno od DPH',
      reverseCharge: 'Přenesená DPH',
      reverseChargeNotice: 'Daň odvede zákazník.',
      taxBase: 'Základ daně',
      taxPointDate: 'DATUM ZDANITELNÉHO PLNĚNÍ',
      totalDue: 'Celkem k úhradě:',
      paymentDetails: 'Platební údaje',
      accountNumber: 'Číslo účtu:',
      variableSymbol: 'Variabilní symbol:',
      amount: 'Částka:',
      qrPayment: 'QR platba',
      notes: 'Poznámky:',
      issuedOn: 'Vystaveno dne',
      nonVatPayer: 'Neplátce DPH',
      exchangeRate: 'Kurz CNB:',
      czkEquivalent: 'Ekvivalent v CZK:',
    },
    email: {
      invoiceSubject: 'Faktura č. {{number}}',
      defaultTemplate: `Dobrý den,

v příloze Vám zasílám fakturu č. {{invoiceNumber}} na částku {{total}}.

Datum splatnosti: {{dueDate}}

Děkuji za spolupráci.

S pozdravem,
{{senderName}}`,
      supplierFallback: 'Dodavatel',
      welcomeSubject: 'Vítejte v essentialInvoice',
      welcomeText: (userName: string) =>
        `Dobrý den ${userName},\n\nvítejte v aplikaci essentialInvoice! Váš účet byl úspěšně vytvořen.\n\nNyní můžete začít vytvářet faktury, spravovat klienty a sledovat platby.\n\nS pozdravem,\nTým essentialInvoice`,
      welcomeHtml: (userName: string) => `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Vítejte v essentialInvoice</h2>
        <p>Dobrý den ${userName},</p>
        <p>vítejte v aplikaci essentialInvoice! Váš účet byl úspěšně vytvořen.</p>
        <p>Nyní můžete začít vytvářet faktury, spravovat klienty a sledovat platby.</p>
        <br>
        <p>S pozdravem,<br>Tým essentialInvoice</p>
      </div>
    `,
      resetSubject: 'Obnovení hesla - essentialInvoice',
      resetText: (userName: string, resetUrl: string) =>
        `Dobrý den ${userName},\n\nobdrželi jsme žádost o obnovení hesla k vašemu účtu.\n\nPro nastavení nového hesla klikněte na následující odkaz:\n${resetUrl}\n\nOdkaz je platný 1 hodinu.\n\nPokud jste o obnovení hesla nežádali, tento email můžete ignorovat.\n\nS pozdravem,\nTým essentialInvoice`,
      resetHtml: (userName: string, resetUrl: string) => `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Obnovení hesla</h2>
        <p>Dobrý den ${userName},</p>
        <p>obdrželi jsme žádost o obnovení hesla k vašemu účtu.</p>
        <p>Pro nastavení nového hesla klikněte na tlačítko níže:</p>
        <p style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Nastavit nové heslo</a>
        </p>
        <p style="color: #6b7280; font-size: 14px;">Odkaz je platný 1 hodinu.</p>
        <p style="color: #6b7280; font-size: 14px;">Pokud jste o obnovení hesla nežádali, tento email můžete ignorovat.</p>
        <br>
        <p>S pozdravem,<br>Tým essentialInvoice</p>
      </div>
    `,
    },
  },
  en: {
    pdf: {
      invoice: 'INVOICE',
      invoiceNumberShort: 'No.',
      taxDocument: 'TAX DOCUMENT',
      paymentMethod: 'Payment method',
      paymentMethodTransfer: 'Bank transfer',
      supplier: 'SUPPLIER',
      customer: 'CUSTOMER',
      issueDate: 'ISSUE DATE',
      dueDate: 'DUE DATE',
      description: 'DESCRIPTION',
      quantity: 'QUANTITY',
      unitPrice: 'UNIT PRICE',
      total: 'TOTAL',
      subtotal: 'Subtotal:',
      vat: 'VAT',
      exempt: 'VAT exempt',
      reverseCharge: 'Reverse charge',
      reverseChargeNotice: 'Reverse charge - the customer accounts for VAT.',
      taxBase: 'Tax base',
      taxPointDate: 'TAX POINT DATE',
      totalDue: 'Total due:',
      paymentDetails: 'Payment details',
      accountNumber: 'Account number:',
      variableSymbol: 'Variable symbol:',
      amount: 'Amount:',
      qrPayment: 'QR payment',
      notes: 'Notes:',
      issuedOn: 'Issued on',
      nonVatPayer: 'Non-VAT payer',
      exchangeRate: 'CNB rate:',
      czkEquivalent: 'CZK equivalent:',
    },
    email: {
      invoiceSubject: 'Invoice No. {{number}}',
      defaultTemplate: `Hello,

please find attached invoice No. {{invoiceNumber}} for the amount of {{total}}.

Due date: {{dueDate}}

Thank you for your cooperation.

Best regards,
{{senderName}}`,
      supplierFallback: 'Supplier',
      welcomeSubject: 'Welcome to essentialInvoice',
      welcomeText: (userName: string) =>
        `Hello ${userName},\n\nWelcome to essentialInvoice! Your account has been successfully created.\n\nYou can now start creating invoices, managing clients, and tracking payments.\n\nBest regards,\nThe essentialInvoice Team`,
      welcomeHtml: (userName: string) => `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Welcome to essentialInvoice</h2>
        <p>Hello ${userName},</p>
        <p>Welcome to essentialInvoice! Your account has been successfully created.</p>
        <p>You can now start creating invoices, managing clients, and tracking payments.</p>
        <br>
        <p>Best regards,<br>The essentialInvoice Team</p>
      </div>
    `,
      resetSubject: 'Password Reset - essentialInvoice',
      resetText: (userName: string, resetUrl: string) =>
        `Hello ${userName},\n\nWe received a request to reset your password.\n\nTo set a new password, click the following link:\n${resetUrl}\n\nThis link is valid for 1 hour.\n\nIf you did not request a password reset, you can ignore this email.\n\nBest regards,\nThe essentialInvoice Team`,
      resetHtml: (userName: string, resetUrl: string) => `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Password Reset</h2>
        <p>Hello ${userName},</p>
        <p>We received a request to reset your password.</p>
        <p>To set a new password, click the button below:</p>
        <p style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Set new password</a>
        </p>
        <p style="color: #6b7280; font-size: 14px;">This link is valid for 1 hour.</p>
        <p style="color: #6b7280; font-size: 14px;">If you did not request a password reset, you can ignore this email.</p>
        <br>
        <p>Best regards,<br>The essentialInvoice Team</p>
      </div>
    `,
    },
  },
};

export function t(locale: string | undefined | null): Translations {
  const lang = locale === 'en' ? 'en' : 'cs';
  return translations[lang];
}

export function formatDateLocale(date: Date | string, locale: string | undefined | null): string {
  const lang = locale === 'en' ? 'en-US' : 'cs-CZ';
  return new Date(date).toLocaleDateString(lang);
}

export function formatCurrencyLocale(amount: number, currency: string, locale: string | undefined | null): string {
  const lang = locale === 'en' ? 'en-US' : 'cs-CZ';
  if (currency === 'CZK') {
    return `${amount.toLocaleString(lang, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kč`;
  }
  return `${amount.toLocaleString(lang, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}
